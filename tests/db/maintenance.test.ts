import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// A2/B8 · lib/db/maintenance — the boundary AFTER the credential split
// (4B B8; ADR-0015 R3/R8; BAT-02's app half):
//
//   The module holds EXACTLY the two auth.* operations — unconfirmEmail
//   and revokeAuthSessions — because auth is ungrantable from migrations
//   on this image (the recorded trap). The four public-schema ops moved
//   onto M1's definers through the request-role channel (lib/hc); their
//   postcondition tests live with the wrappers now. The credential is
//   HC_MAINTENANCE_DB_URL — the runtime's HC_DB_URL is hc_runtime after
//   the flip and can never reach auth.*.
//
//   Finding 8 (kept): revokeAuthSessions is ONE transaction — session
//   deletion and refresh-token revocation commit together or not at all.
// ============================================================================

process.env.HC_MAINTENANCE_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let maintenance: typeof import('@/lib/db/maintenance');
let accounts: typeof import('@/lib/hc/accounts');
let raw: pg.Client;

const GHOST = randomUUID();

beforeAll(async () => {
  maintenance = await import('@/lib/db/maintenance');
  accounts = await import('@/lib/hc/accounts');
  raw = new pg.Client({ connectionString: process.env.HC_MAINTENANCE_DB_URL });
  await raw.connect();
  return async () => {
    await raw.end();
  };
});

describe('B8 · the module surface IS the two-op boundary (BAT-02)', () => {
  it('exports exactly unconfirmEmail and revokeAuthSessions — nothing else survived the split', () => {
    expect(Object.keys(maintenance).sort()).toEqual(['revokeAuthSessions', 'unconfirmEmail']);
  });
});

describe('A2 · zero-row outcomes are visible, never silent (finding 7)', () => {
  it('unconfirmEmail against a ghost user reports 0 rows; the hc wrapper REFUSES it', async () => {
    await expect(maintenance.unconfirmEmail(GHOST)).resolves.toBe(0);
    await expect(accounts.unconfirmEmail(GHOST)).rejects.toThrow(/unconfirm/);
  });
});

describe('A2 · revokeAuthSessions kills both halves in one transaction (finding 8)', () => {
  const USER = randomUUID();
  const SESSION = randomUUID();
  const EMAIL = `revoke.${randomUUID().slice(0, 8)}@example.invalid`;

  beforeAll(async () => {
    await raw.query(
      `insert into auth.users (id, email, instance_id, aud, role)
       values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`,
      [USER, EMAIL],
    );
    await raw.query(
      `insert into auth.sessions (id, user_id, created_at, updated_at) values ($1, $2, now(), now())`,
      [SESSION, USER],
    );
    await raw.query(
      `insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at)
       values ($1, $2::text, $3, false, now(), now())`,
      [`rt-${randomUUID().slice(0, 12)}`, USER, SESSION],
    );
    return async () => {
      await raw.query('delete from auth.refresh_tokens where session_id = $1', [SESSION]);
      await raw.query('delete from auth.sessions where id = $1', [SESSION]);
      await raw.query('delete from auth.users where id = $1', [USER]);
    };
  });

  it('one call: sessions deleted AND no un-revoked refresh token survives', async () => {
    await maintenance.revokeAuthSessions(USER);
    const sessions = await raw.query(
      'select count(*)::int as n from auth.sessions where user_id = $1',
      [USER],
    );
    expect(sessions.rows[0].n).toBe(0);
    // The pinned GoTrue's refresh_tokens.session_id FK is ON DELETE CASCADE:
    // session-bound tokens die with their session; the UPDATE half covers any
    // token not bound to a session. The invariant either way — zero live
    // un-revoked tokens.
    const tokens = await raw.query(
      `select count(*)::int as n from auth.refresh_tokens
        where user_id = $1::text and revoked = false`,
      [USER],
    );
    expect(tokens.rows[0].n).toBe(0);
  });

  it('a repeat call is a safe no-op (idempotent kill)', async () => {
    await expect(maintenance.revokeAuthSessions(USER)).resolves.toBeUndefined();
  });
});
