import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { asStoragePlane, serviceCredential } from '@/lib/db/service-role';
import { promotedPagePrefix, renderStagingPrefix } from '@/lib/pipeline/page-keys';

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
 *   render/attempt/<circle>/<arrival>/<lease>/pNNN  — 5B B2: one attempt's
 *     rendered pages, GC'd when the lease closes as anything but advanced.
 *   render/circle/<circle>/arrival/<arrival>/pNNN   — 5B B2: the PROMOTED,
 *     write-once per-arrival rendering slice 6's review screen crops from;
 *     §6.9's machine-read text lands beside it as pNNN.txt.
 */

const ARTIFACTS = 'artifacts';
const QUARANTINE = 'quarantine';

export function intakeStagingKey(circleId: string, arrivalId: string): string {
  return `intake/${circleId}/${arrivalId}`;
}

export function artifactKey(circleId: string, arrivalId: string, sha256Hex: string): string {
  return `circle/${circleId}/arrival/${arrivalId}/${sha256Hex}`;
}

/** §2.12: the subject-scoped upload staging key — one key per minted
 *  upload attempt, unreachable from any user-facing read path. */
export function uploadStagingKey(circleId: string, subjectId: string, uploadId: string): string {
  return `intake/upload/${circleId}/${subjectId}/${uploadId}`;
}

/**
 * The server-minted, subject-scoped, EXPIRING upload grant (§2.12;
 * §3.11) — an HMAC over exactly ONE staging key plus its expiry,
 * keyed by the service credential (no new secret exists). The
 * same-origin TUS proxy (app/api/upload/tus) verifies it on every hop
 * and forwards to storage with the service plane; the browser never
 * holds a credential wider than this one key, storage keeps ZERO
 * policies (M7/049), and no storage URL ever reaches the client — the
 * §1.3 artifact route's proxy discipline, mirrored for writes. (The
 * B3-era x-signature signed-upload token is retired: the pinned local
 * storage build ignores it on the resumable endpoint — the B9 finding.)
 */
const GRANT_TTL_SECONDS = 2 * 60 * 60;

function grantSecret(): string {
  return serviceCredential();
}

export function mintUploadGrant(key: string, nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + GRANT_TTL_SECONDS;
  const sig = createHmac('sha256', grantSecret()).update(`${key}|${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

export function verifyUploadGrant(key: string, grant: string, nowMs = Date.now()): boolean {
  const dot = grant.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(grant.slice(0, dot));
  const sig = grant.slice(dot + 1);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return false;
  const expected = createHmac('sha256', grantSecret()).update(`${key}|${exp}`).digest();
  const supplied = Buffer.from(sig, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

/** The proxy's upstream credentials — the service plane's headers, built
 *  here so the credential name stays in its one module family. */
export function storageAuthHeaders(): { authorization: string; apikey: string } {
  const key = grantSecret();
  return { authorization: `Bearer ${key}`, apikey: key };
}

/**
 * The signed continuation target (round-13 finding 1). The create hop's
 * upstream Location is NEVER handed to the browser as a raw base64url URL —
 * a client could then name any `/storage/v1/…` path and the service
 * credential would follow it (the finding's gap (a): a bare `startsWith`
 * prefix check is defeated by `../` normalisation). Instead the server
 * SIGNS the upstream resumable URL together with its staging key, keyed by
 * the service credential; subsequent hops — and completion — present that
 * signature, which the browser cannot forge. This is also gap (b)'s bind:
 * the target is no longer a free-floating client value.
 *
 * NON-EXPIRING by design: session freshness lives on the grant
 * (mintUploadGrant, 2 h), which every hop re-checks, so a hours-later
 * §13.4 resume presents a fresh grant against this durable target. The
 * target is an identity binding, not a session token.
 */
export function signUploadTarget(upstreamUrl: string, key: string): string {
  const payload = Buffer.from(JSON.stringify({ u: upstreamUrl, k: key })).toString('base64url');
  const sig = createHmac('sha256', grantSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export function verifyUploadTarget(token: string): { url: string; key: string } | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', grantSecret()).update(payload).digest();
  const supplied = Buffer.from(sig, 'hex');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  let parsed: { u?: unknown; k?: unknown };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed.u !== 'string' || typeof parsed.k !== 'string') return null;
  // Defence in depth: even a server-signed target must resolve INSIDE the
  // storage resumable family — a bug that signed a bad URL still cannot be
  // driven to a different endpoint.
  if (!isResumableUpstream(parsed.u)) return null;
  return { url: parsed.u, key: parsed.k };
}

/** The upload staging key's scope — `intake/upload/<circle>/<subject>/<uploadId>`.
 *  Null for any other shape, so a forged key cannot masquerade as a scope. */
export function uploadKeyScope(
  key: string,
): { circleId: string; subjectId: string; uploadId: string } | null {
  const parts = key.split('/');
  if (parts.length !== 5 || parts[0] !== 'intake' || parts[1] !== 'upload') return null;
  const [, , circleId, subjectId, uploadId] = parts;
  if (!circleId || !subjectId || !uploadId) return null;
  return { circleId, subjectId, uploadId };
}

/**
 * Normalised validation that a URL is inside OUR storage resumable family
 * (round-13 finding 1 (a)). `new URL()` resolves `../` dot-segments before
 * the check, so an `…/resumable/../../object/list/…` target — which a bare
 * `startsWith` over a base64url segment lets through — is rejected on its
 * true, normalised pathname.
 */
export function isResumableUpstream(url: string): boolean {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return false;
  let u: URL;
  let b: URL;
  try {
    u = new URL(url);
    b = new URL(base);
  } catch {
    return false;
  }
  if (u.origin !== b.origin) return false;
  return (
    u.pathname === '/storage/v1/upload/resumable' ||
    u.pathname.startsWith('/storage/v1/upload/resumable/')
  );
}

/** Generic read of one artifacts-bucket object (completion's measure). */
export async function downloadObject(
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const { data, error } = await asStoragePlane().from(ARTIFACTS).download(key);
  if (error || !data) return null;
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    contentType: data.type || 'application/octet-stream',
  };
}

/** Remove one artifacts-bucket object (upload staging cleanup). */
export async function removeObject(key: string): Promise<void> {
  const { error } = await asStoragePlane().from(ARTIFACTS).remove([key]);
  if (error) throw new Error(`removeObject: ${error.message}`);
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

// ----------------------------------------------------------------------------
// The rendered-page lifecycle (5B B2; TSD §6.3, §6.4, §4.5).
//
// During an attempt, pages live under ATTEMPT-SCOPED staging keys carrying
// the lease id: unreachable from any user path, and unmistakably the work of
// one attempt, so a superseded worker's output can never be confused with the
// winner's. A lease that closes as anything but `advanced` GCs them (§4.5).
//
// On `advanced` they PROMOTE to durable, write-once, PER-ARRIVAL keys — the
// §6.4 rendering source slice 6's review screen shows and crops from, served
// only through the artifact route's discipline (clean-gated, evidence before
// bytes), and deleted with the arrival by the DEL-01 cascade (named, not
// built here).
//
// THE SLICE-5 EXIT ASSERTION (so Q6's OCR deferral cannot force rework):
// citation coordinates are normalised against the page, not against a
// rendering, and §6.9's machine-read text lands as a SIBLING of the promoted
// page — `p003.png` gains `p003.txt`. Neither the stored coordinates nor the
// promoted artifact changes when slice 6 arrives.
// ----------------------------------------------------------------------------


/** Write one rendered page into the attempt's staging area. */
export async function writeRenderStaging(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await asStoragePlane().from(ARTIFACTS).upload(key, bytes, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`writeRenderStaging: ${error.message}`);
}

async function listStaging(prefix: string): Promise<string[]> {
  const { data, error } = await asStoragePlane()
    .from(ARTIFACTS)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
  if (error) throw new Error(`listStaging: ${error.message}`);
  return (data ?? []).filter((e) => e.id !== null).map((e) => `${prefix}/${e.name}`);
}

/**
 * §4.5: a lease that closed as anything but `advanced` leaves nothing behind.
 * Best-effort by design — a GC that throws must not turn a clean terminal
 * outcome into a failure, and the next attempt's staging is a different
 * prefix either way.
 */
export async function gcRenderStaging(
  circleId: string,
  arrivalId: string,
  leaseId: string,
): Promise<{ removed: number }> {
  const prefix = renderStagingPrefix(circleId, arrivalId, leaseId);
  let keys: string[];
  try {
    keys = await listStaging(prefix);
  } catch {
    return { removed: 0 };
  }
  if (keys.length === 0) return { removed: 0 };
  const { error } = await asStoragePlane().from(ARTIFACTS).remove(keys);
  if (error) return { removed: 0 };
  return { removed: keys.length };
}

/**
 * Promotion on `advanced`: the attempt's pages become the arrival's pages.
 * Write-once — an object already at the promoted key is left alone, because
 * the only way one exists is that this arrival already rendered these pages
 * and the bytes are the same page of the same document. The staging copies
 * are removed afterwards, so exactly one lifetime survives the transition.
 */
export async function promoteRenderedPages(
  circleId: string,
  arrivalId: string,
  leaseId: string,
): Promise<{ promoted: number }> {
  const prefix = renderStagingPrefix(circleId, arrivalId, leaseId);
  const store = asStoragePlane();
  const keys = await listStaging(prefix);
  let promoted = 0;
  for (const key of keys) {
    const name = key.slice(prefix.length + 1);
    const target = `${promotedPagePrefix(circleId, arrivalId)}/${name}`;
    const { error } = await store.from(ARTIFACTS).copy(key, target);
    if (error && !/exists|duplicate/i.test(error.message)) {
      throw new Error(`promoteRenderedPages: ${error.message}`);
    }
    promoted++;
  }
  if (keys.length > 0) await store.from(ARTIFACTS).remove(keys);
  return { promoted };
}

/** Remove staged intake bytes once the store stage has finalized. */
export async function removeStagedObject(circleId: string, arrivalId: string): Promise<void> {
  const { error } = await asStoragePlane()
    .from(ARTIFACTS)
    .remove([intakeStagingKey(circleId, arrivalId)]);
  if (error) throw new Error(`removeStagedObject: ${error.message}`);
}

/**
 * The §11.5 quarantine BYTE purge (ADR-0018 F2's named owner — B5's
 * scheduler family): quarantined malware BYTES are removed at 7 days;
 * the hash + verdict stay forever in scan_results (the X1
 * safety-monotonic evidence row, which this sweep never touches).
 * Quarantine is tiny by construction (confirmed malware only), so a
 * bounded tree walk per nightly run is the honest, dependency-free
 * implementation.
 */
export async function purgeQuarantineOlderThan(days: number): Promise<{ removed: number }> {
  const store = asStoragePlane();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const staleKeys: string[] = [];

  async function walk(prefix: string, depth: number): Promise<void> {
    const { data, error } = await store
      .from(QUARANTINE)
      .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`purgeQuarantine list: ${error.message}`);
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null && depth < 6) {
        await walk(path, depth + 1); // a folder
      } else if (entry.created_at && new Date(entry.created_at).getTime() < cutoff) {
        staleKeys.push(path);
      }
    }
  }

  await walk('', 0);
  if (staleKeys.length > 0) {
    const { error } = await store.from(QUARANTINE).remove(staleKeys);
    if (error) throw new Error(`purgeQuarantine remove: ${error.message}`);
  }
  return { removed: staleKeys.length };
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
