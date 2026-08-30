import type { RequestRoleQuery } from '@/lib/db/request-role';
import { isoText } from '@/lib/hc/rows';

// ============================================================================
// 7B B1 · the row boundary is TYPED (OW-02 — ADR-0027 D17 item 2, F-4's
// larger half). `RequestRoleQuery.query` returned pg's `QueryResult` with
// `rows: any[]`, which is the root of round-16 R5/F-1 and of ADR-0028 D15
// item 2's class: a `Date` that satisfied a declared `string` because `any`
// satisfies everything.
//
// THIS FILE IS A TYPE PIN, NOT A TEST CASE. vitest never runs it (no
// `.test.` in the name); `npm run typecheck` (tsc over **/*.ts) is what
// executes it, and `@ts-expect-error` is the assertion: if the escape below
// COMPILES, tsc reports "Unused '@ts-expect-error' directive" and the
// typecheck step goes red. That is the acceptance condition, verbatim:
// "`q.query<R>` is generic and the two escapes fail to compile."
//
// The other escape — `as unknown as string` — is a double assertion, which
// TypeScript accepts by design and no type can refuse; it is forbidden by
// the scanner in tests/lint/timestamp-boundary.test.ts instead.
// ============================================================================

type Sender = { id: string; accepted_at: string };

export async function untypedBoundary(q: RequestRoleQuery): Promise<Sender> {
  const r = await q.query('select id, accepted_at from public.known_senders');
  // The default row type is `Record<string, unknown>`: a bare column is
  // `unknown` at the boundary, not the `string` the declared type promises.
  // @ts-expect-error a bare timestamptz column does not satisfy `string`
  const bare: Sender = { id: String(r.rows[0].id), accepted_at: r.rows[0].accepted_at };
  return bare;
}

export async function typedBoundary(q: RequestRoleQuery): Promise<Sender[]> {
  // The sanctioned form: the query names its row type, and the temporal
  // column crosses the boundary through the ONE named function.
  const r = await q.query<{ id: string; accepted_at: Date }>(
    'select id, accepted_at from public.known_senders',
  );
  return r.rows.map((row) => ({ id: row.id, accepted_at: isoText(row.accepted_at) }));
}
