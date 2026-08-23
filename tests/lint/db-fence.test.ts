import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// A2 · The import fence (TSD §1.7): asServiceRole() is import-restricted to
// the artifact-route allowlist so an accidental service-role read fails in
// CI rather than in production. 2B extends the same mechanism to the two
// privileged 2B channels: the request-role channel and the maintenance
// boundary are importable ONLY by lib/hc/** (the typed wrappers).
//
// The fence is the ESLint rule itself; these tests drive it through the
// ESLint API against virtual file paths, so a rule regression reds here
// AND `npm run lint` reds on a real stray import.
// ============================================================================

const repo = path.resolve(__dirname, '../..');
const eslint = new ESLint({ cwd: repo });

async function messagesFor(filePath: string, code: string): Promise<string[]> {
  const results = await eslint.lintText(code, {
    filePath: path.join(repo, filePath),
  });
  return results.flatMap((r) => r.messages.map((m) => `${m.ruleId}: ${m.message}`));
}

function restricted(messages: string[]): boolean {
  return messages.some((m) => m.startsWith('no-restricted-imports:'));
}

describe('A2 · service-role stays fenced to its allowlist', () => {
  it('an app route importing service-role reds', async () => {
    const msgs = await messagesFor(
      'app/(app)/anywhere/route.ts',
      "import { asServiceRole } from '@/lib/db/service-role';\nexport const x = asServiceRole;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('a relative import does not slip the fence', async () => {
    const msgs = await messagesFor(
      'lib/mail/outbound.ts',
      "import { asServiceRole } from '../db/service-role';\nexport const x = asServiceRole;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('lib/hc may NOT reach the service role', async () => {
    const msgs = await messagesFor(
      'lib/hc/invites.ts',
      "import { asServiceRole } from '@/lib/db/service-role';\nexport const x = asServiceRole;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('the artifact route is the §1.7 allowlist', async () => {
    const msgs = await messagesFor(
      'app/api/artifact/[id]/route.ts',
      "import { asServiceRole } from '@/lib/db/service-role';\nexport const x = asServiceRole;\n",
    );
    expect(restricted(msgs)).toBe(false);
  });
});

describe('A2 · the request-role channel and maintenance boundary are lib/hc-only', () => {
  it('an app route importing the request-role channel reds', async () => {
    const msgs = await messagesFor(
      'app/(auth)/sign-in/submit/route.ts',
      "import { withRequestRole } from '@/lib/db/request-role';\nexport const x = withRequestRole;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('an app route importing the maintenance boundary reds', async () => {
    const msgs = await messagesFor(
      'app/(auth)/create-account/submit/route.ts',
      "import { bootstrapAccount } from '@/lib/db/maintenance';\nexport const x = bootstrapAccount;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('lib/hc wrappers may use both', async () => {
    const msgs = await messagesFor(
      'lib/hc/throttle.ts',
      "import { withRequestRole } from '@/lib/db/request-role';\nimport { bootstrapAccount } from '@/lib/db/maintenance';\nexport const x = [withRequestRole, bootstrapAccount];\n",
    );
    expect(restricted(msgs)).toBe(false);
  });

  it('the factory barrel stays importable everywhere', async () => {
    const msgs = await messagesFor(
      'app/(app)/anywhere/page.tsx',
      "import { asUser } from '@/lib/db';\nexport const x = asUser;\n",
    );
    expect(restricted(msgs)).toBe(false);
  });
});

// ============================================================================
// 4B · The storage plane (ADR-0018 F2's A2-discipline sanction): every
// byte in the artifacts/quarantine buckets moves through lib/storage/**
// on the service credential's STORAGE surface; importable only by the
// pipeline surfaces. The credential itself stays in lib/db/service-role.
// ============================================================================

describe('B2 · the storage plane is fenced to the pipeline surfaces', () => {
  it('lib/storage may reach the service-role module (the storage plane lives there)', async () => {
    const msgs = await messagesFor(
      'lib/storage/artifacts.ts',
      "import { asStoragePlane } from '@/lib/db/service-role';\nexport const x = asStoragePlane;\n",
    );
    expect(restricted(msgs)).toBe(false);
  });

  it('a worker route may use the storage module but NOT the raw service credential', async () => {
    const storage = await messagesFor(
      'app/api/worker/store/route.ts',
      "import { stageIntakeObject } from '@/lib/storage/artifacts';\nexport const x = stageIntakeObject;\n",
    );
    expect(restricted(storage)).toBe(false);
    const raw = await messagesFor(
      'app/api/worker/store/route.ts',
      "import { asStoragePlane } from '@/lib/db/service-role';\nexport const x = asStoragePlane;\n",
    );
    expect(restricted(raw)).toBe(true);
  });

  it('the inbound webhook may stage bytes; an app page may not touch the plane', async () => {
    const webhook = await messagesFor(
      'app/api/inbound/postmark/route.ts',
      "import { stageIntakeObject } from '@/lib/storage/artifacts';\nexport const x = stageIntakeObject;\n",
    );
    expect(restricted(webhook)).toBe(false);
    const page = await messagesFor(
      'app/(app)/[circle]/inbox/page.tsx',
      "import { stageIntakeObject } from '@/lib/storage/artifacts';\nexport const x = stageIntakeObject;\n",
    );
    expect(restricted(page)).toBe(true);
  });

  it('lib/hc may not touch the storage plane — bytes never ride the typed hc wrappers', async () => {
    const msgs = await messagesFor(
      'lib/hc/ingest.ts',
      "import { stageIntakeObject } from '@/lib/storage/artifacts';\nexport const x = stageIntakeObject;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('the artifact route keeps service-role AND the storage plane, channels still out', async () => {
    const svc = await messagesFor(
      'app/api/artifact/[id]/route.ts',
      "import { asServiceRole } from '@/lib/db/service-role';\nimport { artifactKey } from '@/lib/storage/artifacts';\nexport const x = [asServiceRole, artifactKey];\n",
    );
    expect(restricted(svc)).toBe(false);
    const chan = await messagesFor(
      'app/api/artifact/[id]/route.ts',
      "import { withRequestRole } from '@/lib/db/request-role';\nexport const x = withRequestRole;\n",
    );
    expect(restricted(chan)).toBe(true);
  });
});

// ============================================================================
// 5B B3 · The provider adapter family (slice-5 plan B3; TSD §1.9's
// one-adapter G3 posture). ONE fenced family reaches an AI provider, so
// disqualifying a provider stays a swap rather than a rebuild — and, more to
// the point, no member-facing surface can dispatch a family's document by
// accident. The worker routes and the eval harness are the two callers.
// ============================================================================

describe('5B B3 · lib/ai is fenced to the dispatchers', () => {
  it('an app page reaching the provider reds', async () => {
    const msgs = await messagesFor(
      'app/(app)/[circle]/inbox/page.tsx',
      "import { extractFromArrival } from '@/lib/ai/extract';\nexport const x = extractFromArrival;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('lib/hc may NOT reach the provider — the typed DB wrappers never dispatch', async () => {
    const msgs = await messagesFor(
      'lib/hc/inbox.ts',
      "import { callProvider } from '@/lib/ai/client';\nexport const x = callProvider;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('a relative import does not slip the provider fence', async () => {
    const msgs = await messagesFor(
      'lib/mail/outbound.ts',
      "import { callProvider } from '../ai/client';\nexport const x = callProvider;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('the worker routes may dispatch — they are the surface that does', async () => {
    const msgs = await messagesFor(
      'app/api/worker/[stage]/route.ts',
      "import { extractFromArrival } from '@/lib/ai/extract';\nexport const x = extractFromArrival;\n",
    );
    expect(restricted(msgs)).toBe(false);
  });

  it('the eval harness may dispatch — the SOLE real-key path', async () => {
    const msgs = await messagesFor(
      'scripts/eval/run.mjs',
      "import { EXTRACT_MODEL } from '@/lib/ai/config';\nexport const x = EXTRACT_MODEL;\n",
    );
    expect(restricted(msgs)).toBe(false);
  });

  it('lib/ai may reach its own modules but not the DB channels', async () => {
    const own = await messagesFor(
      'lib/ai/extract.ts',
      "import { callProvider } from '@/lib/ai/client';\nexport const x = callProvider;\n",
    );
    expect(restricted(own)).toBe(false);
    const chan = await messagesFor(
      'lib/ai/extract.ts',
      "import { withRequestRole } from '@/lib/db/request-role';\nexport const x = withRequestRole;\n",
    );
    expect(restricted(chan)).toBe(true);
  });
});

// ============================================================================
// 5B B1 · The G9 corpus's BLIND partition (Q5 SETTLED). Scored eval runs read
// it; prompt and schema iteration must not, so the bands are never measured
// on their own development set. Nothing here is secret — the fence is what
// makes "blind" a property of the TREE rather than of anyone's discipline.
// ============================================================================

describe('5B B1 · the BLIND partition is fenced to the scored readers', () => {
  it('the worker routes may NOT read the blind partition', async () => {
    const msgs = await messagesFor(
      'app/api/worker/[stage]/route.ts',
      "import { blindCorpus } from '@/lib/eval/blind';\nexport const x = blindCorpus;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('the adapter may NOT read the blind partition — prompt iteration lives there', async () => {
    const msgs = await messagesFor(
      'lib/ai/prompt.ts',
      "import { blindCorpus } from '@/lib/eval/blind';\nexport const x = blindCorpus;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('an adapter TEST may not reach it either — only the corpus suite may', async () => {
    const adapterTest = await messagesFor(
      'tests/ai/adapter.test.ts',
      "import { blindCorpus } from '@/lib/eval/blind';\nexport const x = blindCorpus;\n",
    );
    expect(restricted(adapterTest)).toBe(true);
    const corpusTest = await messagesFor(
      'tests/eval/corpus.test.ts',
      "import { blindCorpus } from '@/lib/eval/blind';\nexport const x = blindCorpus;\n",
    );
    expect(restricted(corpusTest)).toBe(false);
  });

  it('the eval harness may read it — that is what it is for', async () => {
    const msgs = await messagesFor(
      'scripts/eval/run.mjs',
      "import { blindCorpus } from '@/lib/eval/blind';\nexport const x = blindCorpus;\n",
    );
    expect(restricted(msgs)).toBe(false);
  });

  it('the DEVELOPMENT partition stays reachable from the ordinary places', async () => {
    const msgs = await messagesFor(
      'tests/ai/adapter.test.ts',
      "import { developmentCorpus } from '@/lib/eval/corpus';\nexport const x = developmentCorpus;\n",
    );
    expect(restricted(msgs)).toBe(false);
  });
});

// ============================================================================
// 5B B8 · The D7 interim is RETIRED (slice-5 plan B8; ADR-0019 D7/Q-iii;
// EVD-01).
//
// 4B shipped lib/db/evidentiary.ts because hc.log is hc_internal-only and 4A
// M5 landed the 'artifact_read' event type with NO definer: the write path was
// the maintenance identity assuming hc_internal for exactly one statement. It
// was recorded as an interim and as a standing candidate for a definer at the
// next DB-opening slice. 5A M1 shipped hc.log_artifact_read; the interim goes.
//
// The fence must SHRINK with it. A fence that still names a deleted module
// looks like protection and is nothing at all.
// ============================================================================

describe('5B B8 · the evidentiary boundary is gone, and so is its fence entry', () => {
  it('lib/db/evidentiary.ts does not exist', () => {
    expect(existsSync(path.join(repo, 'lib/db/evidentiary.ts'))).toBe(false);
  });

  it('the surviving channels are still fenced to lib/hc', async () => {
    const msgs = await messagesFor(
      'app/(app)/[circle]/senders/page.tsx',
      "import { withRequestRole } from '@/lib/db/request-role';\nexport const x = withRequestRole;\n",
    );
    expect(restricted(msgs)).toBe(true);
  });

  it('the maintenance boundary keeps exactly its two auth ops — BAT-02 untouched', () => {
    const source = readFileSync(path.join(repo, 'lib/db/maintenance.ts'), 'utf8');
    const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    expect(exported.sort()).toEqual(['revokeAuthSessions', 'unconfirmEmail']);
  });
});
