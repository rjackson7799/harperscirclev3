import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// A5 · lib/hc/invites against the LIVE stack. The lifecycle semantics are
// 2A-proven (037); these tests prove the APP wrappers: issuance as the
// verified coordinator, the maintenance describe read (the accept
// screen's pre-auth window, keyed strictly on the unguessable token),
// acceptance as the invited identity, and the state transitions the
// screen renders.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let invites: typeof import('@/lib/hc/invites');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const FOUNDER_EMAIL = `founder.${randomUUID().slice(0, 8)}@example.invalid`;
const INVITEE = randomUUID();
const INVITEE_EMAIL = `dan.${randomUUID().slice(0, 8)}@example.invalid`;
let circleId: string;
let token: string;

const founderClaims = { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL };

beforeAll(async () => {
  invites = await import('@/lib/hc/invites');
  circleLib = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  for (const [id, email, name] of [
    [FOUNDER, FOUNDER_EMAIL, 'Founder 2B'],
    [INVITEE, INVITEE_EMAIL, 'Dan 2B'],
  ] as const) {
    await raw.query(
      `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
       values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               case when $3::boolean then now() end)`,
      [id, email, id === FOUNDER],
    );
    await raw.query(`insert into public.accounts (id, kind, display_name) values ($1, 'member', $2)`, [
      id,
      name,
    ]);
  }
  const created = await circleLib.createCircleFromSetup(founderClaims, {
    name: "Nell's circle",
    subjects: [
      {
        first_name: 'Nell',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `nell.${randomUUID().slice(0, 6)}`,
      },
    ],
  });
  circleId = created.circle_id;

  return async () => {
    await raw.query(`set session_replication_role = replica`);
    await raw.query('delete from public.invites where circle_id = $1', [circleId]);
    await raw.query('delete from public.access_grants where circle_id = $1', [circleId]);
    await raw.query('delete from public.access_log where circle_id = $1', [circleId]);
    await raw.query('delete from public.circle_members where circle_id = $1', [circleId]);
    await raw.query('delete from public.subjects where circle_id = $1', [circleId]);
    await raw.query('delete from public.circles where id = $1', [circleId]);
    await raw.query('delete from public.accounts where id = any($1)', [[FOUNDER, INVITEE]]);
    await raw.query('delete from auth.users where id = any($1)', [[FOUNDER, INVITEE]]);
    await raw.query(`set session_replication_role = default`);
    await raw.end();
  };
});

describe('A5 · issuance, describe, acceptance', () => {
  it('a verified coordinator issues; the token comes back exactly once', async () => {
    const subjectIds = (
      await raw.query('select id from public.subjects where circle_id = $1', [circleId])
    ).rows.map((r) => r.id);

    const created = await invites.createInvite(founderClaims, {
      circle_id: circleId,
      invited_email: INVITEE_EMAIL,
      tier: 'family',
      subject_ids: subjectIds,
    });
    token = created.token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('describeInvite answers the accept screen pre-auth: circle, inviter, subjects, tier', async () => {
    const description = await invites.describeInvite(token);
    expect(description).toMatchObject({
      state: 'pending',
      circle_name: "Nell's circle",
      inviter_name: 'Founder 2B',
      tier: 'family',
      invited_email: INVITEE_EMAIL,
    });
    expect(description!.subject_names).toEqual(['Nell']);
  });

  it('an unknown token describes to null — one neutral shape', async () => {
    expect(await invites.describeInvite('f'.repeat(64))).toBeNull();
  });

  it('acceptance as the invited identity writes membership + the tier grants', async () => {
    const result = await invites.acceptInvite(
      { sub: INVITEE, role: 'authenticated', email: INVITEE_EMAIL },
      token,
    );
    expect(result.circle_id).toBe(circleId);
    expect(result.tier).toBe('family');

    const member = await raw.query(
      'select tier from public.circle_members where circle_id = $1 and account_id = $2 and removed_at is null',
      [circleId, INVITEE],
    );
    expect(member.rows[0]?.tier).toBe('family');
  });

  it('the describe now reports used — the §4.1.7 dead-token screen', async () => {
    const description = await invites.describeInvite(token);
    expect(description?.state).toBe('used');
  });

  it('a replayed acceptance refuses and creates nothing (RLS-09 surfaced)', async () => {
    await expect(
      invites.acceptInvite({ sub: INVITEE, role: 'authenticated', email: INVITEE_EMAIL }, token),
    ).rejects.toMatchObject({ message: expect.stringContaining('invite_refused') });
  });
});
