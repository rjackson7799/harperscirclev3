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
];

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
