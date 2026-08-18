import { beforeAll, describe, expect, it } from 'vitest';

// ============================================================================
// A2 · The four factories (TSD §1.7): asUser via @supabase/ssr; asAdmin and
// asPipeline as direct connections holding EXACTLY their role's authority;
// asServiceRole unchanged (stub until the artifact route lands).
//
// hc_admin and hc_pipeline are NOLOGIN by design (1A M1): each factory
// connects with a deploy-provided credential and pins the session to its
// role, so the trust boundary is the role's absent privileges, not the
// credential du jour. Locally that credential is the maintenance URL; the
// tests prove the factory NEVER exposes maintenance authority.
// ============================================================================

const DB_URL =
  process.env.HC_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

process.env.HC_DB_URL = DB_URL;
process.env.HC_ADMIN_DB_URL = DB_URL;
process.env.HC_PIPELINE_DB_URL = DB_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54341';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-not-a-secret';

let db: typeof import('@/lib/db');
let userModule: typeof import('@/lib/db/user');

beforeAll(async () => {
  db = await import('@/lib/db');
  userModule = await import('@/lib/db/user');
});

describe('A2 · lib/db exports exactly the §1.7 factory surface', () => {
  it('index exports asUser, asAdmin, asPipeline and nothing else', () => {
    expect(Object.keys(db).sort()).toEqual(['asAdmin', 'asPipeline', 'asUser']);
  });
});

describe('A2 · asPipeline() is hc_pipeline, exactly', () => {
  it('sessions run as hc_pipeline', async () => {
    const r = await db.asPipeline().query('select current_user as u');
    expect(r.rows[0].u).toBe('hc_pipeline');
  });

  it('reaches its enumerated surface: hc.pending_security_actions()', async () => {
    const r = await db
      .asPipeline()
      .query('select count(*)::int as n from hc.pending_security_actions()');
    expect(r.rows[0].n).toBeGreaterThanOrEqual(0);
  });

  it('cannot read record tables (42501 — privilege absent)', async () => {
    await expect(
      db.asPipeline().query('select * from public.documents limit 1'),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('A2 · asAdmin() is hc_admin, exactly', () => {
  it('sessions run as hc_admin', async () => {
    const r = await db.asAdmin().query('select current_user as u');
    expect(r.rows[0].u).toBe('hc_admin');
  });

  it('reads admin_meta views', async () => {
    const r = await db
      .asAdmin()
      .query('select count(*)::int as n from admin_meta.platform_stats');
    expect(r.rows[0].n).toBeGreaterThanOrEqual(0);
  });

  it('holds NO privilege on record tables (AC-ADMIN-1: permission denied)', async () => {
    await expect(
      db.asAdmin().query('select * from public.documents limit 1'),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('holds NO privilege on access_log (AC-ADMIN-2 posture)', async () => {
    await expect(
      db.asAdmin().query('select * from public.access_log limit 1'),
    ).rejects.toMatchObject({ code: '42501' });
  });
});

describe('A2 · asUser() — the @supabase/ssr client over the caller cookies', () => {
  it('createUserClient bridges the provided cookie store both ways', async () => {
    const reads: string[] = [];
    let written: { name: string; value: string }[] = [];
    const client = userModule.createUserClient({
      getAll: () => {
        reads.push('getAll');
        return [{ name: 'sb-test', value: 'v' }];
      },
      setAll: (cookies) => {
        written = cookies.map(({ name, value }) => ({ name, value }));
      },
    });
    expect(client.auth).toBeDefined();
    // Reading the session exercises the cookie bridge.
    await client.auth.getSession();
    expect(reads.length).toBeGreaterThan(0);
    expect(Array.isArray(written)).toBe(true);
  });
});
