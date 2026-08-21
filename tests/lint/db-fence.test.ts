import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
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
