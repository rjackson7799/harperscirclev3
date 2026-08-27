import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

// ============================================================================
// A2 · The request-role server channel (lib/db/request-role.ts).
//
// hc.* is deliberately NOT API-exposed (PIN-01 pins PostgREST to
// [public, graphql_public]), so every hc call the app makes rides a direct
// connection that ASSUMES a request role for exactly one transaction — the
// "2B server channel" ADR-0013 F1 anticipated ("reachable only by
// server-side code assuming request roles"). The contract this file pins:
//
//   1. Inside the callback the session IS the request role — anon or
//      authenticated with the verified JWT claims in request.jwt.claims —
//      so hc functions evaluate exactly as they would behind PostgREST.
//   2. The assumed authority is REAL: an anon call is refused what anon is
//      refused (42501), an authenticated call reaches what authenticated
//      reaches. The channel never leaks the maintenance identity in.
//   3. The assumption is TRANSACTION-BOXED: role and claims are SET LOCAL,
//      so the pooled session leaves the call as the maintenance identity
//      with no claims residue — success or throw.
// ============================================================================

const DB_URL =
  process.env.HC_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

process.env.HC_DB_URL = DB_URL;

type Channel = typeof import('@/lib/db/request-role');
let withRequestRole: Channel['withRequestRole'];

beforeAll(async () => {
  ({ withRequestRole } = await import('@/lib/db/request-role'));
});

const GHOST = 'nobody.2b@example.invalid';

describe('A2 · withRequestRole assumes the request role for one transaction', () => {
  it('anon: current_user is anon and hc.auth_throttle answers (the F1 consult path)', async () => {
    const result = await withRequestRole('anon', null, async (q) => {
      const who = await q.query('select current_user as u');
      const throttle = await q.query('select hc.auth_throttle($1) as t', [GHOST]);
      return { who: who.rows[0].u, t: throttle.rows[0].t };
    });
    expect(result.who).toBe('anon');
    expect(result.t).toEqual({ failures: 0, wait_seconds: 0 });
  });

  it('anon holds anon authority, not the maintenance identity (catalog probe — the recorded segfault trap forbids dialing a function-ACL denial)', async () => {
    const result = await withRequestRole('anon', null, async (q) => {
      const fn = await q.query(
        "select has_function_privilege('anon', 'hc.tier_defaults(hc.tier)', 'execute') as fn",
      );
      const tbl = await q.query(
        "select has_table_privilege('anon', 'public.documents', 'select') as tbl",
      );
      return { fn: fn.rows[0].fn, tbl: tbl.rows[0].tbl };
    });
    expect(result.fn).toBe(false);
    expect(result.tbl).toBe(false);
  });

  it('authenticated: claims land in request.jwt.claims and authenticated grants apply', async () => {
    const sub = '00000000-0000-4000-8000-00000000002b';
    const result = await withRequestRole(
      'authenticated',
      { sub, role: 'authenticated', email: 'holder.2b@example.invalid' },
      async (q) => {
        const who = await q.query('select current_user as u');
        const claims = await q.query(
          "select current_setting('request.jwt.claims', true)::jsonb as c",
        );
        const tiers = await q.query(
          "select domain::text, level::text from hc.tier_defaults('family'::hc.tier) order by domain",
        );
        return { who: who.rows[0].u, claims: claims.rows[0].c, tiers: tiers.rows };
      },
    );
    expect(result.who).toBe('authenticated');
    expect(result.claims.sub).toBe(sub);
    expect(result.claims.email).toBe('holder.2b@example.invalid');
    expect(result.tiers.length).toBeGreaterThan(0);
  });

  it('claims with quotes and unicode round-trip parameterized (no SQL assembly)', async () => {
    const nasty = `O'Brien "x" \\ ` + '— café';
    const result = await withRequestRole(
      'authenticated',
      { sub: '00000000-0000-4000-8000-00000000002c', role: 'authenticated', email: nasty },
      async (q) =>
        (await q.query("select current_setting('request.jwt.claims', true)::jsonb ->> 'email' as e"))
          .rows[0].e,
    );
    expect(result).toBe(nasty);
  });

  it('the assumption is transaction-boxed: the session leaves clean on success', async () => {
    await withRequestRole('anon', null, (q) => q.query('select 1'));
    const raw = new pg.Client({ connectionString: DB_URL });
    await raw.connect();
    try {
      // The channel's own pool must expose no residue to its NEXT call.
      const after = await withRequestRole('authenticated', null, async (q) => {
        const claims = await q.query("select current_setting('request.jwt.claims', true) as c");
        return claims.rows[0].c;
      });
      expect(after === '' || after === null).toBe(true);
    } finally {
      await raw.end();
    }
  });

  it('a throwing callback rolls back and still resets the session', async () => {
    await expect(
      withRequestRole('anon', null, async (q) => {
        await q.query('select 1');
        throw new Error('deliberate');
      }),
    ).rejects.toThrow('deliberate');

    const result = await withRequestRole('anon', null, async (q) => {
      const who = await q.query('select current_user as u');
      return who.rows[0].u;
    });
    expect(result).toBe('anon');
  });

  it('refuses any role outside anon|authenticated at runtime', async () => {
    await expect(
      // @ts-expect-error — the closed role set is the contract
      withRequestRole('hc_internal', null, (q) => q.query('select 1')),
    ).rejects.toThrow(/request role/i);
  });
});

// ============================================================================
// ROUND 18 · F-1 (MAJOR) — THE CHANNEL'S OWN TWO BOUNDS.
//
// D20 bounded the artifact route at fifteen seconds and recorded the pool as
// a LIMITATION: "the budget protects THE PERSON, not the pool." Round 18
// found that this is the load-bearing half rather than a footnote, and the
// finding is right. A raced-out read keeps its pooled connection until it
// finishes; the pool is a process-wide `max: 10` shared by 35 call sites
// across 12 lib/hc modules; and `connect()` was called with NO
// `connectionTimeoutMillis`, whose pg default is 0 — WAIT FOREVER. So the
// one route that has a budget stays responsive by exhausting the resource
// on which every other family surface — the Care Inbox, the review screen,
// senders, invites — then hangs with no bound and no named state. That is
// the F5/F6 failure mode reappearing everywhere the budget is not.
//
// Two bounds close it, and they are complementary:
//   · connectionTimeoutMillis turns an unbounded WAIT into a prompt, named
//     failure. It changes nothing while the pool has room.
//   · statement_timeout is what actually RETURNS the leaked connection: the
//     server kills the abandoned query instead of running it to completion.
//     Without it the first bound only converts hanging forever into failing
//     forever.
//
// Both numbers are DERIVED from the answer budget rather than picked, and
// the derivation is asserted below so it cannot drift into a magic number.
//
// What this file pins is that the CHANNEL sets them, transaction-locally.
// That a statement_timeout kills is Postgres's own contract and is not
// re-proven here — pinning it would cost a thirty-second test to observe
// behaviour the server guarantees.
// ============================================================================
describe('Round-18 F-1 · the request-role channel is bounded at both ends', () => {
  it('the connection wait is bounded — pg defaults to 0, which is "forever"', async () => {
    const { poolConfig, POOL_CONNECT_TIMEOUT_MS } = await import('@/lib/db/request-role');
    expect(POOL_CONNECT_TIMEOUT_MS).toBeGreaterThan(0);
    // The pool is BUILT from this, so removing the bound reds here.
    expect(poolConfig().connectionTimeoutMillis).toBe(POOL_CONNECT_TIMEOUT_MS);
    expect(poolConfig().max).toBeGreaterThan(0);
  });

  it('statement_timeout is IN FORCE inside the transaction, at the channel\u2019s value', async () => {
    const { REQUEST_ROLE_STATEMENT_TIMEOUT_MS } = await import('@/lib/db/request-role');
    const shown = await withRequestRole(
      'authenticated',
      { sub: '00000000-0000-4000-8000-00000000002d', role: 'authenticated' },
      async (q) => (await q.query('show statement_timeout')).rows[0].statement_timeout,
    );
    // Postgres renders the interval; compare in milliseconds, not in spelling.
    const ms = await withRequestRole('anon', null, async (q) =>
      Number(
        (await q.query('select extract(epoch from $1::interval) * 1000 as ms', [shown])).rows[0].ms,
      ),
    );
    expect(ms).toBe(REQUEST_ROLE_STATEMENT_TIMEOUT_MS);
  });

  it('and it is SET LOCAL: the bound leaves no residue on the pooled session', async () => {
    // Same shape as the claims-residue case above — a bound that outlived its
    // transaction would silently govern whatever ran next on that connection.
    await withRequestRole('anon', null, (q) => q.query('select 1'));
    const raw = new pg.Client({ connectionString: DB_URL });
    await raw.connect();
    try {
      const dflt = (await raw.query('show statement_timeout')).rows[0].statement_timeout;
      const after = await withRequestRole('anon', null, async (q) => {
        await q.query('rollback'); // leave the transaction, keep the session
        return (await q.query('show statement_timeout')).rows[0].statement_timeout;
      });
      expect(after).toBe(dflt);
    } finally {
      await raw.end();
    }
  });

  it('both bounds are DERIVED from the answer budget, not picked', async () => {
    const { POOL_CONNECT_TIMEOUT_MS, REQUEST_ROLE_STATEMENT_TIMEOUT_MS } = await import(
      '@/lib/db/request-role'
    );
    const { ROUTE_ANSWER_BUDGET_MS } = await import('@/lib/http/budget');
    // A query the route is STILL WAITING ON must never be killed under it, so
    // the statement bound sits strictly above the budget; a query still
    // running at twice the budget is serving nobody.
    expect(REQUEST_ROLE_STATEMENT_TIMEOUT_MS).toBe(2 * ROUTE_ANSWER_BUDGET_MS);
    // A connection wait at or above the budget is dead weight: the budget
    // would expire before the pool ever answered.
    expect(POOL_CONNECT_TIMEOUT_MS).toBe(ROUTE_ANSWER_BUDGET_MS / 3);
    expect(POOL_CONNECT_TIMEOUT_MS).toBeLessThan(ROUTE_ANSWER_BUDGET_MS);
  });
});
