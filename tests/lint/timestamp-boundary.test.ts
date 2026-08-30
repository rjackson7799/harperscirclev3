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

// THE BARE COERCION OF A COLUMN WHOSE NAME SAYS IT IS A MOMENT — in all
// THREE of its byte-identical spellings (round-18 F-4).
//
// `isoText(row.received_at)` and `row.x_at.toISOString()` are the sanctioned
// forms and do not match. THE CLASS IS DEFINED BY THE VALUE THAT REACHES THE
// SURFACE, not by the function that produced it, so all three of these are
// one defect and are now one rule:
//
//   1. String(row.received_at)
//   2. `${row.received_at}`   — an interpolation whose WHOLE expression is
//                              the column. `${isoText(row.received_at)}` is not,
//                              and neither is `circle/${id}/arrival/${x}`.
//   3. row.received_at + ''  — concatenation with an empty string literal.
//
// All three produce the SAME STRING, character for character, so all three
// give the same .slice(0, 10) → "Tue Aug 25" → §2.7 refusal → the same render
// throw that took all seven review legs red at the close-out.
//
// Branch 2 is deliberately anchored to the WHOLE interpolation. A looser rule
// that matched a temporal name anywhere inside a template would fire on every
// log line and key builder in the DB layer, and a scanner nobody can leave on
// is not a mechanism. Its negative control is as long as its positive one.
const TEMPORAL = "[A-Za-z_$][\\w$.?[\\]'\\\"]*(?:_at|_on)";
const BARE_TIMESTAMP_STRING = new RegExp(
  [
    "\\bString\\(\\s*" + TEMPORAL + "\\b",
    "\\$\\{\\s*" + TEMPORAL + "\\s*\\}",
    TEMPORAL + "\\s*\\+\\s*(?:''|\\\"\\\")",
  ].join('|'),
);

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

  // ==========================================================================
  // ROUND 18 · F-4 (MODERATE) — THE CLASS IS DEFINED BY THE VALUE THAT REACHES
  // THE SURFACE, NOT BY THE FUNCTION THAT PRODUCED IT.
  //
  // D15 finding 2 records this as "fixed at the class". It is not: the scanner
  // matched only `String(…_at)`, and a template literal and a `+ ''` produce
  // THE SAME STRING, character for character:
  //
  //   String(row.received_at)   → "Tue Aug 25 2026 …"   CAUGHT
  //   `${row.received_at}`      → byte-identical        MISSED
  //   row.received_at + ''      → byte-identical        MISSED
  //
  // These are not near-misses. All three give the same .slice(0, 10) →
  // "Tue Aug 25" → §2.7 refusal → the same render throw that took all seven
  // review legs red. Three interchangeable spellings; one was pinned.
  //
  // THE SCANNER'S HONEST BOUND IS UNCHANGED and is still the naming one: a
  // query that aliases a moment to something else hides the type from it. What
  // changes here is only that the three spellings of ONE coercion are one rule.
  // ==========================================================================
  it('ROUND-18 F-4: the two BYTE-IDENTICAL spellings are the same defect and are caught too', () => {
    expect(BARE_TIMESTAMP_STRING.test('received_at: `${row.received_at}`,')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('received_at: row.received_at + \'\',')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('decided_at: `${r.rows[0].decided_at}`,')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('changed_at: row.changed_at + "",')).toBe(true);
  });

  it('ROUND-18 F-4: and the widening does not swallow the sanctioned or the non-temporal', () => {
    // The whole risk of an alternation is that it stops discriminating. A
    // template literal is the ordinary way to build a string in this codebase,
    // so these four must stay quiet or the rule is unusable.
    expect(BARE_TIMESTAMP_STRING.test('const key = `circle/${circleId}/arrival/${id}`;')).toBe(
      false,
    );
    expect(BARE_TIMESTAMP_STRING.test('received_at: `${isoText(row.received_at)}`,')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('status: `${row.status}`,')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('msg: `arrival ${id} at ${when}`,')).toBe(false);
  });

  // ==========================================================================
  // 7B B1 · OW-17 (ADR-0028 D15 item 3): THREE SPELLINGS IS NOT THE CLASS.
  //
  // The class is "a temporal column crossing the boundary by any hand but the
  // ONE named function". Every branch below yields a string a surface will
  // slice — the same "Tue Aug 25" or a quoted/localised sibling of it — or a
  // Date re-wrapped so that the next line can. One spelling per case, a
  // negative control per spelling, so a widening that stops discriminating
  // is caught by the same file that demanded it.
  // ==========================================================================
  it('OW-17: `.toString()` / `.toLocale*String()` / `.toDateString()` on a temporal column are the same defect', () => {
    expect(BARE_TIMESTAMP_STRING.test('received_at: row.received_at.toString(),')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('decided_at: row.decided_at?.toString() ?? null,')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('due_on: row.due_on.toLocaleDateString(),')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('changed_at: r.rows[0].changed_at.toDateString(),')).toBe(true);
  });

  it('OW-17: `.toISOString()` on a temporal column is no longer sanctioned — it assumes a Date the driver may not have handed back', () => {
    // The 6B negative control said this was fine. It produces the RIGHT
    // string when the value is a Date and THROWS when a `::text` cast or a
    // future parser hands back text — a second way for the boundary to lie,
    // in the opposite direction. One named function, no exceptions.
    expect(BARE_TIMESTAMP_STRING.test('accepted_at: row.accepted_at.toISOString(),')).toBe(true);
  });

  it('OW-17: `new Date(x_at)` / `Date(x_at)` wrapping re-enters the class one line later', () => {
    expect(BARE_TIMESTAMP_STRING.test('const when = new Date(row.received_at);')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('label: Date(row.due_on),')).toBe(true);
  });

  it('OW-17: a JSON round-trip of a temporal column is a quoted sibling of the same string', () => {
    expect(BARE_TIMESTAMP_STRING.test('received_at: JSON.stringify(row.received_at),')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('decided_at: JSON.parse(JSON.stringify(row.decided_at)),')).toBe(true);
  });

  it('OW-17: a temporal column as a template FRAGMENT is caught wherever it sits in the template', () => {
    // The 6B rule anchored to the WHOLE interpolation; the fragment form
    // produces the identical bytes inside a longer string.
    expect(BARE_TIMESTAMP_STRING.test('const line = `received ${row.received_at} by mail`;')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('msg: `due ${row.due_on}`,')).toBe(true);
  });

  it('OW-17: every `+ ""` variant — prefix, suffix, any string literal, backtick', () => {
    expect(BARE_TIMESTAMP_STRING.test("received_at: '' + row.received_at,")).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('received_at: "" + row.received_at,')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test("label: 'at ' + row.received_at,")).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test("label: row.received_at + ' (local)',")).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('label: row.received_at + ``,')).toBe(true);
  });

  it('OW-17: the double assertion `as unknown as string` on a temporal column is the escape a type cannot refuse', () => {
    // OW-02 typed the boundary; `as unknown as T` is the one hatch TypeScript
    // leaves open by design, so the scanner closes it here.
    expect(BARE_TIMESTAMP_STRING.test('received_at: row.received_at as unknown as string,')).toBe(true);
    expect(BARE_TIMESTAMP_STRING.test('accepted_at: (row.accepted_at as unknown) as string,')).toBe(true);
  });

  it('OW-17: and the widening does not swallow the sanctioned or the non-temporal (one negative per spelling)', () => {
    expect(BARE_TIMESTAMP_STRING.test('received_at: isoText(row.received_at),')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('decided_at: isoTextOrNull(row.decided_at),')).toBe(false);
    // .toString / .toISOString on a non-temporal name stay out of scope.
    expect(BARE_TIMESTAMP_STRING.test('id: row.id.toString(),')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('const stamp = new Date().toISOString();')).toBe(false);
    // Date wrapping of a non-temporal value, and the sanctioned Date use.
    expect(BARE_TIMESTAMP_STRING.test('const now = new Date();')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('const d = new Date(Date.UTC(y, m, day));')).toBe(false);
    // JSON of a row, of a payload, of anything not temporal by name.
    expect(BARE_TIMESTAMP_STRING.test('payload: JSON.stringify(edits),')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test("await q.query('select hc.f($1)', [JSON.stringify(input.subjects)]);")).toBe(false);
    // Template fragments with no temporal name in them.
    expect(BARE_TIMESTAMP_STRING.test('const key = `circle/${circleId}/arrival/${id}`;')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('msg: `arrival ${id} at ${when}`,')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('received_at: `${isoText(row.received_at)}`,')).toBe(false);
    // Concatenation that is not a temporal column meeting a string.
    expect(BARE_TIMESTAMP_STRING.test("const path = '/' + circle + '/tasks';")).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('const n = row.snooze_count + 1;')).toBe(false);
    // A single assertion from unknown is the typed boundary's own form.
    expect(BARE_TIMESTAMP_STRING.test('received_at: isoText(row.received_at as Date),')).toBe(false);
    expect(BARE_TIMESTAMP_STRING.test('label: row.label as string,')).toBe(false);
  });

  it('the scanner leaves the sanctioned forms alone (negative control)', () => {
    expect(BARE_TIMESTAMP_STRING.test('received_at: isoText(row.received_at),')).toBe(false);
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
