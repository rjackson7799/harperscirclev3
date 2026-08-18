import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// A2 · lib/db/maintenance — postconditions against the LIVE stack
// (round-10 findings 7 and 8).
//
//   Finding 7: the maintenance writes must never silently accept a
//   zero-row outcome — a forged, stale or deleted target has to be
//   DISTINGUISHABLE from successful persistence. The ops now report their
//   row count; the lib/hc wrappers turn an impossible zero into a loud
//   refusal (setDeclaredSlice, unconfirmEmail) or a caller-visible false
//   (setOpeningContext — the route refuses the advance).
//
//   Finding 8: revokeAuthSessions is ONE transaction — session deletion
//   and refresh-token revocation commit together or not at all; a failure
//   between them can no longer strand a partial kill. (The live
//   refresh-token-cannot-mint proof is the probe artifact:
//   scripts/probe-gotrue.mjs, fact 5.)
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let maintenance: typeof import('@/lib/db/maintenance');
let accounts: typeof import('@/lib/hc/accounts');
let circle: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const GHOST = randomUUID();

beforeAll(async () => {
  maintenance = await import('@/lib/db/maintenance');
  accounts = await import('@/lib/hc/accounts');
  circle = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  return async () => {
    await raw.end();
  };
});

describe('A2 · zero-row outcomes are visible, never silent (finding 7)', () => {
  it('setAccountSlice against a ghost account reports 0 rows', async () => {
    await expect(maintenance.setAccountSlice(GHOST, 'everything')).resolves.toBe(0);
  });

  it('updateOpeningContext against a ghost circle reports 0 rows', async () => {
    await expect(
      maintenance.updateOpeningContext(GHOST, randomUUID(), ['paperwork-piling-up']),
    ).resolves.toBe(0);
  });

  it('unconfirmEmail against a ghost user reports 0 rows; the hc wrapper REFUSES it', async () => {
    await expect(maintenance.unconfirmEmail(GHOST)).resolves.toBe(0);
    await expect(accounts.unconfirmEmail(GHOST)).rejects.toThrow(/unconfirm/);
  });

  it('setDeclaredSlice refuses a ghost account loudly (the postcondition lives in lib/hc)', async () => {
    await expect(circle.setDeclaredSlice(GHOST, 'everything')).rejects.toThrow(/slice/);
  });

  it('setOpeningContext reports false for a foreign circle, true for a real write', async () => {
    // The foreign-target half; the true half rides tests/hc/circle.test.ts
    // where a real founder fixture exists.
    await expect(circle.setOpeningContext(GHOST, randomUUID(), ['sharing-the-load'])).resolves.toBe(
      false,
    );
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
    const sessions = await raw.query('select count(*)::int as n from auth.sessions where user_id = $1', [
      USER,
    ]);
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
