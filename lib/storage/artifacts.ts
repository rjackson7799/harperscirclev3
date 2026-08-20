import 'server-only';
import { asStoragePlane } from '@/lib/db/service-role';

/**
 * The storage-plane module (TSD §2.12, §3.11; ADR-0018 F2's A2-discipline
 * sanction). M7 shipped both buckets with ZERO storage.objects policies —
 * the absence IS the §3.11 mechanism — so every byte write, move and
 * delete in `artifacts`/`quarantine` rides this one fenced module on the
 * service credential's storage plane. The ESLint fence restricts imports
 * to the pipeline surfaces (inbound webhook, workers, upload, artifact
 * route); nothing member-facing touches bytes directly.
 *
 * Key shapes:
 *   intake/<circle>/<arrival>                       — staged intake bytes,
 *     written by the webhook BEFORE its 200 (acceptance is durable rows
 *     AND durable bytes, §13.1) and by upload completion; unreachable
 *     from any user-facing path; consumed and removed by the store worker.
 *   circle/<circle>/arrival/<arrival>/<sha256>      — the §2.12
 *     content-addressed final key; hc.finalize_store verifies this exact
 *     shape, so a worker cannot park bytes under a foreign address.
 */

const ARTIFACTS = 'artifacts';
const QUARANTINE = 'quarantine';

export function intakeStagingKey(circleId: string, arrivalId: string): string {
  return `intake/${circleId}/${arrivalId}`;
}

export function artifactKey(circleId: string, arrivalId: string, sha256Hex: string): string {
  return `circle/${circleId}/arrival/${arrivalId}/${sha256Hex}`;
}

/** Stage intake bytes durably before the webhook answers 200 (§5.2/§13.1).
 *  Idempotent: a Postmark redelivery re-writes the same key. */
export async function stageIntakeObject(
  circleId: string,
  arrivalId: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await asStoragePlane()
    .from(ARTIFACTS)
    .upload(intakeStagingKey(circleId, arrivalId), bytes, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });
  if (error) throw new Error(`stageIntakeObject: ${error.message}`);
}

/** The store worker's read half: staged bytes, or null when nothing was
 *  staged (an honest store_failed, never a fabricated object). */
export async function readStagedObject(
  circleId: string,
  arrivalId: string,
): Promise<Uint8Array | null> {
  const { data, error } = await asStoragePlane()
    .from(ARTIFACTS)
    .download(intakeStagingKey(circleId, arrivalId));
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/** The content-addressed final write (§2.12: write-once — re-running the
 *  store stage writes the same object under the same key). */
export async function writeArtifactObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await asStoragePlane().from(ARTIFACTS).upload(key, bytes, {
    contentType: contentType || 'application/octet-stream',
    upsert: true,
  });
  if (error) throw new Error(`writeArtifactObject: ${error.message}`);
}

/** Remove staged intake bytes once the store stage has finalized. */
export async function removeStagedObject(circleId: string, arrivalId: string): Promise<void> {
  const { error } = await asStoragePlane()
    .from(ARTIFACTS)
    .remove([intakeStagingKey(circleId, arrivalId)]);
  if (error) throw new Error(`removeStagedObject: ${error.message}`);
}

/**
 * Confirmed malware moves to the quarantine bucket (PRD §4.2.2: not
 * releasable by any user action — no read grant exists for any role) and
 * leaves the artifacts bucket entirely.
 */
export async function moveToQuarantine(
  fromKey: string,
  quarantineKey: string,
  bytes: Uint8Array,
): Promise<void> {
  const store = asStoragePlane();
  const up = await store.from(QUARANTINE).upload(quarantineKey, bytes, {
    contentType: 'application/octet-stream',
    upsert: true,
  });
  if (up.error) throw new Error(`moveToQuarantine: ${up.error.message}`);
  const rm = await store.from(ARTIFACTS).remove([fromKey]);
  if (rm.error) throw new Error(`moveToQuarantine: ${rm.error.message}`);
}
