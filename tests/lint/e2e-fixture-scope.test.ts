import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// 6B close-out · F7 (ADR-0026 D19) — A GATE LEG MAY NOT HAVE A HIDDEN
// PRECONDITION.
//
// Gate run r7 at 7ecc81b came back 36/2. One of the two was leg 17,
// e2e/ingestion.spec.ts SCN-01 ("EICAR lands QUARANTINED"), and NOTHING about
// the product had changed. Everything the leg is actually about passed:
// state `quarantined`, `scan_verdict = 'infected'`, the §11.5 evidence row
// retained with `expires_at = null`. ClamAV worked; `hc_clamd` was Up
// (healthy) at r6 and at r7. It failed on its LAST assertion:
//
//     Expected: [ObjectContaining { bucket_id: 'quarantine', n: 1 }]
//     Received: [Object            { bucket_id: 'quarantine', n: 2 }]
//
// EICAR is a FIXED string, so its content_sha256 is the same on every run
// (275a021b…fd0f), and the leg counted that sha across the WHOLE bucket.
// storage.objects held two rows for it, in two DIFFERENT circles, written
// 2026-08-25T11:26:10Z (r6) and 2026-08-25T18:00:15Z (r7) — one object per
// gate run, exactly as designed. The leg asserted n === 1, so it could only
// pass on the FIRST run after a storage reset. 5457eaa's db:reset preceded
// r6; nothing reset between r6 and r7; r7 went red.
//
// This was almost certainly latent for the whole slice, masked by the
// close-out's habit of resetting before runs. A leg that passes only on the
// first run after a reset is not a passing leg — it is a leg with a hidden
// precondition, and the gate it sits in is green once and red forever after.
//
// THE RULE, MECHANICALLY: storage.objects survives db:reset boundaries and
// accumulates across runs, so an e2e assertion over it must be scoped to the
// fixture under test. Every gate run provisions a fresh founder
// (`const stamp = Date.now()` in the founder's e-mail), so the circle id IS
// the run's scope, and every object this product writes is keyed beneath it:
// `circle/<circleId>/arrival/<arrivalId>/<sha>` (lib/storage/artifacts.ts
// artifactKey — the quarantine move reuses the same key verbatim).
// ============================================================================

const E2E = path.resolve(__dirname, '../../e2e');

/**
 * The `query(...)` calls in one spec that read storage.objects.
 *
 * Comment lines are carved out with a control of their own below. Both
 * scanners written earlier in this close-out flagged the prose DESCRIBING the
 * defect as the defect; a scanner is first-class code and gets negative tests.
 */
export function storageObjectQueries(src: string): string[] {
  const lines = src.split('\n');
  const calls: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (!lines[i].includes('storage.objects')) continue;
    let start = i;
    while (start > 0 && !lines[start].includes('query(')) start--;
    let end = i;
    while (end < lines.length - 1 && !/^\s*\);/.test(lines[end])) end++;
    calls.push(lines.slice(start, end + 1).join('\n'));
  }
  return calls;
}

/** The scope is the circle — in the SQL or in the parameters, either counts. */
export function unscoped(src: string): string[] {
  return storageObjectQueries(src).filter((call) => !call.includes('circleId'));
}

const specs = readdirSync(E2E)
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => ({ file: `e2e/${f}`, src: readFileSync(path.join(E2E, f), 'utf8') }));

describe('F7 · the scanner reads what it claims to read', () => {
  it('finds the e2e specs', () => {
    expect(specs.length).toBeGreaterThanOrEqual(4);
  });

  it('finds every storage.objects query in them', () => {
    const total = specs.reduce((n, s) => n + storageObjectQueries(s.src).length, 0);
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it('flags an unscoped count — the r7 leg-17 shape, exactly', () => {
    const offenders = unscoped(
      [
        '    const buckets = await query(',
        '      `select bucket_id, count(*)::int as n from storage.objects',
        "        where name like '%' || $1 group by bucket_id`,",
        '      [row.rows[0].sha],',
        '    );',
      ].join('\n'),
    );
    expect(offenders.length).toBe(1);
  });

  it('passes a circle-scoped count, whether the scope is in the SQL or the parameters', () => {
    const inParams = [
      '    const promoted = await query(',
      '      `select count(*)::int as n from storage.objects',
      "        where bucket_id = 'artifacts' and name like $1`,",
      '      [`render/circle/${f.circleId}/arrival/${arrival}/%`],',
      '    );',
    ].join('\n');
    const inSql = [
      '    const buckets = await query(',
      '      `select bucket_id, count(*)::int as n from storage.objects',
      "        where name like 'circle/' || $1 || '/%' group by bucket_id`,",
      '      [f.circleId],',
      '    );',
    ].join('\n');
    expect(unscoped(inParams)).toEqual([]);
    expect(unscoped(inSql)).toEqual([]);
  });

  it('does NOT flag prose describing the defect — a scanner that reds on its own commentary is noise', () => {
    const commentary = [
      '    // The leg counted storage.objects across the whole bucket, with no',
      '    // circle in the query at all, and so passed only once per reset.',
      '    /* select count(*) from storage.objects where name like ... */',
      '     * storage.objects accumulates across runs.',
    ].join('\n');
    expect(storageObjectQueries(commentary)).toEqual([]);
  });
});

describe('F7 · no gate leg counts storage.objects outside its own circle', () => {
  it.each(specs)('$file', ({ src }) => {
    expect(unscoped(src)).toEqual([]);
  });
});
