import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// 6B close-out · a timestamp column never reaches a surface as `String(Date)`.
//
// `node-postgres` parses timestamptz into a JS `Date`. `String(aDate)` is
// `"Tue Aug 25 2026 00:12:34 GMT+0900 (…)"` — it satisfies a declared
// `string`, passes every unit test whose fixture supplies a proper ISO
// string, and breaks the first consumer that slices it. §2.7's formatter
// refuses the result by design, so the failure surfaces as a render throw.
//
// Found twice: round-16 R5/F-1 (`accepted_at`, every non-empty senders
// list) and the 6B close-out gate (`lib/hc/review.ts` ×3 — the review
// screen threw before rendering, taking all seven review legs with it).
// The scanner is what stops a third time: `lib/hc/rows.ts#isoText` is the
// one sanctioned form.
//
// Test class: STATIC SCAN (no DB, no network).
// ============================================================================

const repo = path.resolve(__dirname, '../..');

// The DB layer only. tests/ is excluded on purpose — this file legitimately
// spells the forbidden form in its own positive control and prose.
const TREES = ['lib/hc', 'lib/db'];
const EXTENSIONS = new Set(['.ts']);

// `String(<anything>_at)` / `String(<anything>_on)` — the bare coercion of a
// column whose name says it is a moment. `isoText(row.received_at)` and
// `row.x_at.toISOString()` are the sanctioned forms and do not match.
const BARE_TIMESTAMP_STRING = /\bString\(\s*[A-Za-z_$][\w$.?[\]'"]*(?:_at|_on)\b/;

// THE SCANNER'S HONEST BOUND: it reads the NAME. A query that aliases a
// moment to something else (`select max(changed_at) as t`) hides the type
// from it — which is exactly why `recentRecordChange` escaped the first
// pass. The rule that keeps the scanner true is therefore a naming one:
// alias a temporal column to its own name, and this catches it. Where a
// name cannot say it, only review can.
//
// Comment lines are skipped: prose that DESCRIBES the defect (this file's
// own corpus notes, and lib/hc/rows.ts's rationale) is not the defect.
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*)/;

function dbLayerFiles(): string[] {
  const files: string[] = [];
  for (const tree of TREES) {
    const root = path.join(repo, tree);
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!EXTENSIONS.has(path.extname(entry.name))) continue;
      files.push(path.join(entry.parentPath, entry.name));
    }
  }
  return files;
}

describe('6B · a timestamp column never becomes String(Date)', () => {
  it('the scanner flags the forbidden forms (positive control)', () => {
    expect(BARE_TIMESTAMP_STRING.test('received_at: String(row.received_at),')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('decided_at: row.decided_at ? String(row.decided_at) : null,')).toBe(
      true,
    );
    expect(BARE_TIMESTAMP_STRING.test('return String(r.rows[0].changed_at);')).toBe(true);
  });

  it('the scanner leaves the sanctioned forms alone (negative control)', () => {
    expect(BARE_TIMESTAMP_STRING.test('received_at: isoText(row.received_at),')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('accepted_at: row.accepted_at.toISOString(),')).toBe(false);
    // A non-temporal column is none of this scanner's business.
    expect(BARE_TIMESTAMP_STRING.test('status: String(row.status),')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('model_id: String(row.model_id ?? ""),')).toBe(false);
  });

  it('prose describing the defect is not the defect (comment carve-out)', () => {
    expect(COMMENT_LINE.test(' * writes `String(row.received_at)` produces')).toBe(true);
    expect(COMMENT_LINE.test('// received_at: String(row.received_at),')).toBe(true);
    expect(COMMENT_LINE.test('      received_at: String(row.received_at),')).toBe(false);
  });

  it('the scanner actually reaches the DB layer (positive control on the corpus)', () => {
    const files = dbLayerFiles();
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.endsWith(`review.ts`))).toBe(true);
  });

  it('no DB-layer file coerces a timestamp column with String()', () => {
    const offenders: string[] = [];
    for (const file of dbLayerFiles()) {
      const source = readFileSync(file, 'utf8');
      source.split('\n').forEach((line, i) => {
        if (COMMENT_LINE.test(line)) return;
        if (BARE_TIMESTAMP_STRING.test(line)) {
          offenders.push(`${path.relative(repo, file)}:${i + 1}  ${line.trim()}`);
        }
      });
    }
    expect(offenders, 'use isoText()/isoTextOrNull() from lib/hc/rows.ts').toEqual([]);
  });
});
