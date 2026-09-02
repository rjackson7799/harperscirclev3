import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ============================================================================
// 7B B4 · OW-03 (ADR-0027 D17 item 3) AS A PIN: "every destination page and
// every route they POST to carries an AnswerBudget". Round 18 found
// thirty-five withRequestRole sites sharing one pool and exactly ONE route
// with a budget; the budget does not compose across a request unless every
// surface a person waits on opens one. The 7B surfaces do — through
// lib/http/page-budget's withPageBudget (pages) and withRouteBudget (routes)
// — and this scanner holds the record surfaces to it, so a 7C page cannot
// inherit the omission silently.
//
// The ruling for the rest — the pipeline workers, the inbound webhook, the
// auth forms — is recorded in the 7B deltas ADR, not enforced here.
//
// Test class: STATIC SCAN (no DB, no network). A scanner matches its own
// comments, so imports are what is looked for, not words.
// ============================================================================

const repo = process.cwd();
const RECORD_TREES = [
  'app/(app)/[circle]/tasks',
  'app/(app)/[circle]/timeline',
  'app/(app)/[circle]/documents',
  // 7E (R3/F-6): the people tree — six surfaces that carried a budget all
  // along and were held to nothing. Added with the exact-set pin above, so
  // the guarantee and the state can no longer drift apart silently.
  'app/(app)/[circle]/people',
];

// ── 7E · R3/F-6 (ADR-0038, ACCEPTED · TAKEN(7E)) ─────────────────────────
//
// Round 27: `RECORD_TREES` gained `documents` in 7C and did not gain
// `people`. Every one of the six surfaces under the people tree carries a
// budget TODAY, so the STATE is right — but the GUARANTEE is missing, and
// deleting `withRouteBudget` from the grant route broke no test. The list
// below is why that could happen quietly: a tree is scanned only if some
// human remembered to name it here.
//
// So the surfaces are pinned as an EXACT SET (ADR-0026: if it can be an
// exact-set assertion, it must be). A new page or POST under a record tree
// now fails this file until it is listed, which makes it a DECISION rather
// than an omission — the same shape as the page-gate filesystem pin.
const RECORD_SURFACES = [
  'app/(app)/[circle]/documents/[document]/page.tsx',
  'app/(app)/[circle]/documents/[document]/recategorize/submit/route.ts',
  'app/(app)/[circle]/documents/[document]/share/submit/route.ts',
  'app/(app)/[circle]/documents/[document]/unshare/submit/route.ts',
  'app/(app)/[circle]/documents/page.tsx',
  'app/(app)/[circle]/people/[member]/grant/submit/route.ts',
  'app/(app)/[circle]/people/[member]/page.tsx',
  'app/(app)/[circle]/people/invites/[invite]/again/submit/route.ts',
  'app/(app)/[circle]/people/log/page.tsx',
  'app/(app)/[circle]/people/page.tsx',
  'app/(app)/[circle]/people/subject/[subject]/page.tsx',
  'app/(app)/[circle]/tasks/[task]/assign/page.tsx',
  'app/(app)/[circle]/tasks/[task]/assign/submit/route.ts',
  'app/(app)/[circle]/tasks/[task]/complete/submit/route.ts',
  'app/(app)/[circle]/tasks/[task]/page.tsx',
  'app/(app)/[circle]/tasks/[task]/snooze/submit/route.ts',
  'app/(app)/[circle]/tasks/[task]/unassign/submit/route.ts',
  'app/(app)/[circle]/tasks/page.tsx',
  'app/(app)/[circle]/timeline/[event]/page.tsx',
  'app/(app)/[circle]/timeline/add/submit/route.ts',
  'app/(app)/[circle]/timeline/page.tsx',
];

// 7C C2 (OW-23, ruled ADR-0036 Q-B): the auth submits are a person's wait.
// D6 said five; the disk holds seven — the CLASS is what is held (the OW-17
// precedent: the guard is wider than the finding's letter, and says so).
const AUTH_TREE = 'app/(auth)';
// 7C C2 (OW-19): the 7B "app/api is out of scope" ruling below is SUPERSEDED
// for exactly these two files — the upload ingress is a person's wait.
const UPLOAD_ROUTES = ['app/api/upload/token/route.ts', 'app/api/upload/complete/route.ts'];

function files(root: string, name: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === name) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

describe('OW-03 · every 7B page and POST opens an AnswerBudget', () => {
  const pages = RECORD_TREES.flatMap((t) => files(join(repo, t), 'page.tsx'));
  const routes = RECORD_TREES.flatMap((t) => files(join(repo, t), 'route.ts'));

  it('finds the record surfaces (positive control)', () => {
    expect(pages.length).toBeGreaterThanOrEqual(5);
    expect(routes.length).toBeGreaterThanOrEqual(5);
  });

  it('scans EXACTLY the record surfaces — an unlisted tree is an omission, not a decision (R3/F-6)', () => {
    const scanned = [...pages, ...routes]
      .map((f) => relative(repo, f).replace(/\\/g, '/'))
      .sort();
    expect(scanned, 'scanned surfaces vs the pinned set').toEqual([...RECORD_SURFACES].sort());
  });

  it('every record page renders inside withPageBudget', () => {
    const missing = pages
      .filter((f) => !/withPageBudget\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(repo, f));
    expect(missing, 'pages without a budget').toEqual([]);
  });

  it('every record route answers inside withRouteBudget', () => {
    const missing = routes
      .filter((f) => !/withRouteBudget\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(repo, f));
    expect(missing, 'routes without a budget').toEqual([]);
  });

  it('the budget helpers race through the ONE AnswerBudget and clear it on every path', () => {
    const src = readFileSync(join(repo, 'lib/http/page-budget.ts'), 'utf8');
    expect(src).toContain('AnswerBudget.open()');
    expect(src).toContain('budget.clear()');
    expect(src).toContain('AnswerBudgetExceeded');
  });
});

describe('7C C2 · OW-23/OW-19/OW-16/OW-07 — the boundary reaches the waits the 7B ruling left out', () => {
  it('every auth submit route answers inside withRouteBudget — seven on disk, the class held (OW-23)', () => {
    const submits = files(join(repo, AUTH_TREE), 'route.ts').filter((f) =>
      /[\\/]submit[\\/]/.test(f),
    );
    expect(submits.length).toBeGreaterThanOrEqual(7);
    const missing = submits
      .filter((f) => !/withRouteBudget\(/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(repo, f));
    expect(missing, 'auth submits without a budget').toEqual([]);
  });

  it('the two upload routes answer inside withRouteBudget (OW-19)', () => {
    const missing = UPLOAD_ROUTES.filter(
      (f) => !/withRouteBudget\(/.test(readFileSync(join(repo, f), 'utf8')),
    );
    expect(missing, 'upload routes without a budget').toEqual([]);
  });

  it('lib/http/budget.ts carries the round-20 qualifier — MARKED, never rewritten (OW-16)', () => {
    const src = readFileSync(join(repo, 'lib/http/budget.ts'), 'utf8');
    expect(src).toContain('UNCONFIRMED IN THE RUNNING APP');
  });

  it("the upload form's two client fetches carry the named time bound (OW-07 sites 1–2)", () => {
    const src = readFileSync(join(repo, 'app/(app)/[circle]/upload/upload-form.tsx'), 'utf8');
    const bounded = src.match(/signal:\s*AbortSignal\.timeout\(/g) ?? [];
    expect(bounded.length).toBeGreaterThanOrEqual(2);
  });
});
