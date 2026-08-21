import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// A4 · lib/hc/circle — the step-2 write path against the LIVE stack.
// hc.create_circle's semantics are 2A-proven (006); these tests prove the
// APP wrapper drives it with real request-role authority and that the two
// maintenance writes (slice, opening context) land with their guards.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let circle: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const FOUNDER_EMAIL = `founder.${randomUUID().slice(0, 8)}@example.invalid`;
let circleId: string;

beforeAll(async () => {
  circle = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  await raw.query(
    `insert into auth.users (id, email, instance_id, aud, role)
     values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')`,
    [FOUNDER, FOUNDER_EMAIL],
  );
  await raw.query(`insert into public.accounts (id, kind, display_name) values ($1, 'member', 'Founder 2B')`, [
    FOUNDER,
  ]);
  return async () => {
    // Cleanup the concurrency-runner way: session_replication_role=replica
    // for teardown ONLY — the access_log immutability trigger is
    // unconditional by design (INV-09), so test fixtures are removed with
    // triggers off, in FK order.
    if (circleId) {
      await raw.query(`set session_replication_role = replica`);
      await raw.query('delete from public.access_grants where circle_id = $1', [circleId]);
      await raw.query('delete from public.access_log where circle_id = $1', [circleId]);
      await raw.query('delete from public.circle_members where circle_id = $1', [circleId]);
      await raw.query('delete from public.subjects where circle_id = $1', [circleId]);
      await raw.query('delete from public.circles where id = $1', [circleId]);
      await raw.query(`set session_replication_role = default`);
    }
    await raw.query('delete from public.accounts where id = $1', [FOUNDER]);
    await raw.query('delete from auth.users where id = $1', [FOUNDER]);
    await raw.end();
  };
});

describe('A4 · createCircleFromSetup drives hc.create_circle as the founder', () => {
  it('creates the circle with two subjects, coordinator membership, the seq-1 declarations, and the STEP-1 RELATIONSHIP (BAT-03)', async () => {
    const result = await circle.createCircleFromSetup(
      { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL },
      {
        name: 'Nell & Marcus',
        relationship: 'daughter',
        subjects: [
          {
            first_name: 'Nell',
            situation: 'At home, on their own',
            postal_code: '02140',
            timezone: 'America/New_York',
            accent_color: '#7A6E9B',
            forwarding_local_part: `nell.${randomUUID().slice(0, 6)}`,
          },
          {
            first_name: 'Marcus',
            situation: 'In a nursing facility',
            postal_code: '60614',
            timezone: 'America/Chicago',
            accent_color: '#6E8F73',
            forwarding_local_part: `marcus.${randomUUID().slice(0, 6)}`,
          },
        ],
      },
    );
    circleId = result.circle_id;
    expect(circleId).toBeTruthy();

    const subjects = await raw.query(
      'select first_name, situation, postal_code from public.subjects where circle_id = $1 order by first_name',
      [circleId],
    );
    expect(subjects.rows.map((r) => r.first_name)).toEqual(['Marcus', 'Nell']);

    const firstLog = await raw.query(
      'select event_type from public.access_log where circle_id = $1 order by seq limit 1',
      [circleId],
    );
    expect(firstLog.rows[0].event_type).toBe('custodianship_declared');

    // BAT-03: the F1 closure — durable on the FOUNDER's membership row,
    // written inside hc.create_circle's transaction (the Q2 ruling).
    const rel = await raw.query(
      `select relationship from public.circle_members
        where circle_id = $1 and account_id = $2`,
      [circleId, FOUNDER],
    );
    expect(rel.rows[0].relationship).toBe('daughter');
  });

  it('setDeclaredSlice rides hc.set_slice as the caller (B8: request-role authority)', async () => {
    await circle.setDeclaredSlice(
      { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL },
      'money-paperwork',
    );
    const r = await raw.query('select slice from public.accounts where id = $1', [FOUNDER]);
    expect(r.rows[0].slice).toBe('money-paperwork');
  });

  it('setDeclaredSlice for a ghost caller refuses loudly (round-10 F7, now in-function)', async () => {
    await expect(
      circle.setDeclaredSlice({ sub: randomUUID(), role: 'authenticated' }, 'everything'),
    ).rejects.toThrow(/slice/);
  });

  it('setOpeningContext writes only the founder-owned, still-in-setup circle', async () => {
    const ok = await circle.setOpeningContext(
      { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL },
      circleId,
      ['paperwork-piling-up'],
    );
    expect(ok).toBe(true);
    const r = await raw.query('select opening_context from public.circles where id = $1', [circleId]);
    expect(r.rows[0].opening_context).toEqual(['paperwork-piling-up']);

    // A different account writes nothing — the F7 postcondition is
    // IN-FUNCTION now; the wrapper reports false, never a silent pass.
    const foreign = await circle.setOpeningContext(
      { sub: randomUUID(), role: 'authenticated' },
      circleId,
      ['sharing-the-load'],
    );
    expect(foreign).toBe(false);
    const unchanged = await raw.query('select opening_context from public.circles where id = $1', [
      circleId,
    ]);
    expect(unchanged.rows[0].opening_context).toEqual(['paperwork-piling-up']);
  });

  it('an unauthenticated createCircleFromSetup refuses', async () => {
    await expect(
      circle.createCircleFromSetup({}, { name: 'X', subjects: [] }),
    ).rejects.toMatchObject({ message: expect.stringContaining('not_authenticated') });
  });
});
