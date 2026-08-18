import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// A3 · lib/hc/throttle — the F1 password-path boundary wrappers
// (ADR-0013 F1; TSD §5.6; AUT-01/02 are the DB-side proofs — these tests
// prove the APP wrappers drive those functions with the right authority).
//
//   - consult/record-failure/note run as anon (existence-blind; the ghost
//     answers are byte-identical by 2A construction).
//   - recordSuccess runs AS the proven user: no identifier crosses the
//     boundary; the cleared key derives from the session's own claims.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let throttle: typeof import('@/lib/hc/throttle');
let raw: pg.Client;

const GHOST = `ghost.${randomUUID().slice(0, 8)}@example.invalid`;
const HOLDER_ID = randomUUID();
const HOLDER_EMAIL = `holder.${randomUUID().slice(0, 8)}@example.invalid`;

beforeAll(async () => {
  throttle = await import('@/lib/hc/throttle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  // A real account, the way 2A's tests seed one: auth.users first (the
  // accounts FK and the mirror trigger both read it), then accounts.
  await raw.query(
    `insert into auth.users (id, email, instance_id, aud, role)
     values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
     on conflict (id) do nothing`,
    [HOLDER_ID, HOLDER_EMAIL],
  );
  await raw.query(
    `insert into public.accounts (id, kind, display_name) values ($1, 'member', 'Holder 2B')
     on conflict (id) do nothing`,
    [HOLDER_ID],
  );
  return async () => {
    await raw.query('delete from public.auth_attempts where attempt_key = hc.contact_key($1)', [
      HOLDER_EMAIL,
    ]);
    await raw.query('delete from public.auth_attempts where attempt_key = hc.contact_key($1)', [
      GHOST,
    ]);
    await raw.query('delete from public.accounts where id = $1', [HOLDER_ID]);
    await raw.query('delete from auth.users where id = $1', [HOLDER_ID]);
    await raw.end();
  };
});

describe('A3 · throttle wrappers carry the F1 contract', () => {
  it('consultThrottle answers for a ghost exactly as for nobody (existence-blind)', async () => {
    const answer = await throttle.consultThrottle(GHOST);
    expect(answer).toEqual({ failures: 0, wait_seconds: 0 });
  });

  it('recordFailure escalates the same identifier into a positive wait at the 5th failure', async () => {
    for (let i = 0; i < 5; i++) await throttle.recordFailure(GHOST);
    const answer = await throttle.consultThrottle(GHOST);
    expect(answer.failures).toBe(5);
    expect(answer.wait_seconds).toBeGreaterThan(0);
  });

  it('noteSuspiciousAttempts never throws and never returns an oracle (ghost or account)', async () => {
    await expect(throttle.noteSuspiciousAttempts(GHOST)).resolves.toBeUndefined();
    await expect(throttle.noteSuspiciousAttempts(HOLDER_EMAIL)).resolves.toBeUndefined();
  });

  it("recordSuccess clears the PROVEN user's own key — no identifier parameter exists", async () => {
    for (let i = 0; i < 5; i++) await throttle.recordFailure(HOLDER_EMAIL);
    expect((await throttle.consultThrottle(HOLDER_EMAIL)).wait_seconds).toBeGreaterThan(0);

    await throttle.recordSuccess('success', {
      sub: HOLDER_ID,
      role: 'authenticated',
      email: HOLDER_EMAIL,
    });

    const after = await throttle.consultThrottle(HOLDER_EMAIL);
    expect(after).toEqual({ failures: 0, wait_seconds: 0 });
  });

  it('recordSuccess with no session refuses (identity-bound, round-9 F1)', async () => {
    await expect(throttle.recordSuccess('success', {})).rejects.toMatchObject({
      message: expect.stringContaining('auth_attempt_refused'),
    });
  });
});
