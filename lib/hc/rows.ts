/**
 * Row-boundary normalisation for the values `pg` decides the JS type of.
 *
 * WHY THIS MODULE EXISTS — the same defect has now been found twice.
 *
 * `node-postgres` parses `timestamptz`/`timestamp` into a JS `Date`, not a
 * string. A DB-layer function that declares `received_at: string` and then
 * writes `String(row.received_at)` produces
 * `"Tue Aug 25 2026 00:12:34 GMT+0900 (…)"` — a value that satisfies the
 * TypeScript type, survives every mocked unit test, and breaks the first
 * consumer that treats it as ISO. `.slice(0, 10)` yields `"Tue Aug 25"`,
 * which `lib/format/dates.ts` refuses by design (§2.7: a due date is a
 * DATE, never a timestamp).
 *
 *   - Round-16 R5/F-1: `hc.listKnownSenders().accepted_at` — every
 *     non-empty senders list threw at render. Fixed in place, with the
 *     lesson written down: "normalising at the boundary is what keeps the
 *     declared type honest for every future consumer, not just the one
 *     that happened to break."
 *   - 6B close-out: `lib/hc/review.ts` was that next consumer, in three
 *     places (`received_at`, `decided_at`, `recentRecordChange`). The
 *     review screen — the whole point of the slice — threw before it
 *     rendered a single fact, and ALL SEVEN review legs went red on it.
 *
 * The lesson only holds if the sanctioned form is a single named function,
 * so `tests/lint/timestamp-boundary.test.ts` can require it and the class
 * closes for good rather than being re-learned a third time.
 */

/** A `timestamptz` column as ISO-8601 text — the shape every declared
 *  `*_at: string` in this layer promises. Non-Date values (a driver that
 *  handed back text already, a `null` coerced upstream) pass through
 *  `String` unchanged, so this is safe to apply at any such boundary. */
export function isoText(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/** `isoText` for a nullable column: `null`/`undefined` stay null rather
 *  than becoming the strings `"null"`/`"undefined"`. */
export function isoTextOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : isoText(value);
}
