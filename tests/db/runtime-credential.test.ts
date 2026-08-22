import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

// ============================================================================
// B8 · The hc_runtime credential flip, proven at app depth (4A M1 item 4;
// docs/ops/runtime-db-credentials.md; BAT-04's deploy row; APP-09b's
// blast-radius argument): after the flip, HC_DB_URL authenticates as
// hc_runtime_login — a login whose whole authority is membership in
// anon + authenticated. This file connects AS that credential (the
// seed-provisioned local stand-in) and pins:
//
//   1. the request-role channel works over it (SET ROLE anon/
//      authenticated + the definers — everything the app needs);
//   2. the BARE login holds nothing (no direct table grants, and — since
//      5A M1's Q4 NOINHERIT flip — no INHERITED privileges either: the
//      probe is an honest 42501 now, not RLS-empty zero rows);
//   3. the maintenance surface is OUT OF REACH: auth.* and hc.log are
//      refused — the blast radius really did drop to the enumerated
//      surface.
//
// Test class: LIVE-DB INTEGRATION (the runbook's hosted probes, run
// against the local stand-in).
// ============================================================================

const RUNTIME_URL = 'postgresql://hc_runtime_login:postgres@127.0.0.1:54342/postgres';

let runtime: pg.Client;

beforeAll(async () => {
  runtime = new pg.Client({ connectionString: RUNTIME_URL });
  await runtime.connect();
  return async () => {
    await runtime.end();
  };
});

describe('B8 · the runbook probes, locally', () => {
  it('the role flags read f · f · t (no superuser, no bypassrls, can log in)', async () => {
    const r = await runtime.query(
      'select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = current_user',
    );
    expect(r.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcanlogin: true });
  });

  it('hc_runtime holds exactly {anon, authenticated}, both INHERIT FALSE (5A M1, Q4)', async () => {
    const r = await runtime.query(
      `select array_agg(b.rolname::text || ':inherit=' || m.inherit_option::text
                        order by b.rolname) as roles
         from pg_auth_members m join pg_roles b on b.oid = m.roleid
        where m.member = 'hc_runtime'::regrole`,
    );
    expect(r.rows[0].roles).toEqual(['anon:inherit=false', 'authenticated:inherit=false']);
  });

  it('the BARE login holds NOTHING: an honest 42501, not RLS-empty (5A M1 flipped the memberships to INHERIT FALSE — the bare credential no longer inherits anon/authenticated privileges at all)', async () => {
    await runtime.query('reset role');
    await expect(
      runtime.query('select 1 from public.accounts limit 1'),
    ).rejects.toMatchObject({ code: '42501' });
    // And zero DIRECT grants exist (BAT-04's catalog half, re-run here):
    const direct = await runtime.query(
      `select count(*)::int as n from information_schema.role_table_grants
        where grantee in ('hc_runtime', 'hc_runtime_login')`,
    );
    expect(direct.rows[0].n).toBe(0);
  });
});

describe('B8 · the channel works; the maintenance surface does not', () => {
  it('SET ROLE authenticated + a definer call — the whole app path', async () => {
    await runtime.query('begin');
    await runtime.query('set local role authenticated');
    await runtime.query(`select set_config('request.jwt.claims', '', true)`);
    const who = await runtime.query('select current_user as u');
    expect(who.rows[0].u).toBe('authenticated');
    const describe = await runtime.query(`select hc.describe_invite('${'f'.repeat(64)}') as r`);
    expect(describe.rows[0].r).toBeNull(); // DEF-10: unknown answers null
    await runtime.query('commit');
  });

  it('auth.* is unreachable — the two-op module cannot ride this credential', async () => {
    await runtime.query('reset role');
    await expect(
      runtime.query(`update auth.users set email_confirmed_at = null where id = gen_random_uuid()`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('hc.log is unreachable — the evidentiary boundary cannot ride this credential either (catalog probe: the recorded segfault trap forbids dialing a function-ACL denial)', async () => {
    // Since 5A M1's INHERIT FALSE flip the bare login cannot even RESOLVE
    // the hc schema (no inherited USAGE) — the stronger refusal, pinned:
    await runtime.query('reset role');
    await expect(
      runtime.query(
        `select has_function_privilege('hc_runtime',
           'hc.log(uuid, text, text, uuid, uuid, uuid, hc.domain, hc.access_level, hc.access_level, hc.object_type, uuid, jsonb, text, text, uuid)',
           'execute') as fn`,
      ),
    ).rejects.toMatchObject({ code: '42501' });
    // The catalog fact still holds, read over the channel (SET ROLE
    // authenticated — the only way this credential reaches hc at all):
    await runtime.query('begin');
    await runtime.query('set local role authenticated');
    const r = await runtime.query(
      `select has_function_privilege('hc_runtime',
         'hc.log(uuid, text, text, uuid, uuid, uuid, hc.domain, hc.access_level, hc.access_level, hc.object_type, uuid, jsonb, text, text, uuid)',
         'execute') as fn`,
    );
    await runtime.query('commit');
    expect(r.rows[0].fn).toBe(false);
  });
});
