import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

// ============================================================================
// 7C C3 · lib/hc/people against the LIVE stack — the People & roles data
// half (PRD §4.6.1, §4.6.2, §7.5; PPL-01's app half; AC-PPL-3). One read,
// hc.circle_people (7A M4), never wider than what it hands each caller:
//
//   · subjects as PEOPLE: the highest access to their own record, no
//     account attached, the custodian named beside them (069:8);
//   · a coordinator gets every member's levels; a family member gets her
//     OWN and null for the rest — null is "not yours to know" (069:11-12);
//   · invites ride the same read for coordinators only, pending or
//     expired (069:13);
//   · send again is a NEW invite, never a resurrected token: the old one
//     is revoked and a fresh token minted in one wrapper — and the pair
//     is refused for a non-coordinator by the definers themselves.
//
// Test class: LIVE-DB INTEGRATION (the 066 fixture pattern).
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let peopleLib: typeof import('@/lib/hc/people');
let invitesLib: typeof import('@/lib/hc/invites');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const tag = randomUUID().slice(0, 8);
const people = {
  sarah: { id: randomUUID(), name: 'Sarah', tier: 'coordinator' },
  ruth: { id: randomUUID(), name: 'Ruth', tier: 'family' },
  marisol: { id: randomUUID(), name: 'Marisol', tier: 'care_circle' },
} as const;
type Person = keyof typeof people;
const claimsOf = (p: Person) => ({
  sub: people[p].id,
  role: 'authenticated',
  email: `${p}.pp.${tag}@example.invalid`,
});

/** Claims a step-up mint accepts: a password factor within the last 300 s. */
const freshClaimsOf = (p: Person) => ({
  ...claimsOf(p),
  aal: 'aal1',
  amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }],
});

const member: Record<Person, string> = { sarah: '', ruth: '', marisol: '' };
let circleId: string;
let nell: string;
let pendingInvite: string;
let expiredInvite: string;
let tOpen: string;
let tDone: string;
let stepUp: typeof import('@/lib/hc/step-up');

beforeAll(async () => {
  peopleLib = await import('@/lib/hc/people');
  invitesLib = await import('@/lib/hc/invites');
  circleLib = await import('@/lib/hc/circle');
  stepUp = await import('@/lib/hc/step-up');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  for (const p of Object.keys(people) as Person[]) {
    await raw.query(
      `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
       values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())`,
      [people[p].id, claimsOf(p).email],
    );
    await raw.query(`insert into public.accounts (id, kind, display_name) values ($1, 'member', $2)`, [
      people[p].id,
      people[p].name,
    ]);
  }
  const created = await circleLib.createCircleFromSetup(claimsOf('sarah'), {
    name: "Nell's circle",
    subjects: [
      {
        first_name: 'Nell',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `nell.pp.${tag}`,
      },
    ],
  });
  circleId = created.circle_id;
  nell = (
    await raw.query('select id from public.subjects where circle_id = $1', [circleId])
  ).rows[0].id;
  member.sarah = (
    await raw.query('select id from public.circle_members where circle_id = $1 and account_id = $2', [
      circleId,
      people.sarah.id,
    ])
  ).rows[0].id;

  await raw.query('set session_replication_role = replica');
  for (const p of ['ruth', 'marisol'] as Person[]) {
    member[p] = (
      await raw.query(
        `insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
         values ($1, $2, $3, $4) returning id`,
        [circleId, people[p].id, people[p].tier, people[p].name],
      )
    ).rows[0].id;
  }
  await raw.query(
    `insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
     values ($1, $2, $3, 'health', 'summary', $4), ($1, $2, $3, 'schedule', 'summary', $4),
            ($1, $5, $3, 'schedule', 'summary', $4)`,
    [circleId, member.ruth, nell, people.sarah.id, member.marisol],
  );
  tOpen = randomUUID();
  tDone = randomUUID();
  await raw.query(
    `insert into public.tasks (id, circle_id, subject_id, title, due_on, due_zone, status,
       owner_member_id, approved_by, approved_at, approver_display_name, taint)
     values
       ($1, $3, $4, 'Call the pharmacy', '2026-09-04', 'America/New_York', 'open', $5, $6, now(), 'Sarah', '{schedule}'),
       ($2, $3, $4, 'Book the follow-up', null, null, 'done', $5, $6, now(), 'Sarah', '{schedule}')`,
    [tOpen, tDone, circleId, nell, member.ruth, people.sarah.id],
  );
  await raw.query('set session_replication_role = default');

  // The invites go through the REAL definer as the coordinator.
  pendingInvite = (
    await invitesLib.createInvite(claimsOf('sarah'), {
      circle_id: circleId,
      invited_email: `aunt.pp.${tag}@example.invalid`,
      tier: 'family',
      subject_ids: [nell],
    })
  ).invite_id;
  expiredInvite = (
    await invitesLib.createInvite(claimsOf('sarah'), {
      circle_id: circleId,
      invited_email: `helper.pp.${tag}@example.invalid`,
      tier: 'care_circle',
      subject_ids: [nell],
    })
  ).invite_id;
  await raw.query('set session_replication_role = replica');
  await raw.query(
    `update public.invites
        set created_at = now() - interval '8 days', expires_at = now() - interval '1 day'
      where id = $1`,
    [expiredInvite],
  );
  await raw.query('set session_replication_role = default');

  return async () => {
    await raw.query('set session_replication_role = replica');
    await raw.query(`delete from public.step_up_tokens where account_id = any($1)`, [
      Object.values(people).map((p) => p.id),
    ]);
    for (const t of ['tasks', 'invites', 'access_grants', 'access_log', 'circle_members', 'subjects']) {
      await raw.query(`delete from public.${t} where circle_id = $1`, [circleId]);
    }
    await raw.query(`delete from public.circles where id = $1`, [circleId]);
    await raw.query(`delete from public.accounts where id = any($1)`, [
      Object.values(people).map((p) => p.id),
    ]);
    await raw.query(`delete from auth.users where id = any($1)`, [
      Object.values(people).map((p) => p.id),
    ]);
    await raw.query('set session_replication_role = default');
    await raw.end();
  };
});

describe('circlePeople — one read, each caller handed exactly her own reach', () => {
  it('the coordinator: subjects as people with the custodian named, every member with levels, both invites with status', async () => {
    const rows = await peopleLib.circlePeople(claimsOf('sarah'), circleId);
    const subject = rows.find((r) => r.kind === 'subject');
    expect(subject).toBeDefined();
    expect(subject!.display_name).toBe('Nell');
    expect(subject!.custodian_name).toBe('Sarah');
    expect(subject!.subject_id).toBe(nell);
    // the highest access to their own record — manage across the five
    expect(subject!.levels?.[nell]?.health).toBe('manage');
    expect(subject!.levels?.[nell]?.finances).toBe('manage');

    const ruth = rows.find((r) => r.kind === 'member' && r.display_name === 'Ruth');
    expect(ruth!.levels?.[nell]?.health).toBe('summary');
    const marisol = rows.find((r) => r.kind === 'member' && r.display_name === 'Marisol');
    expect(marisol!.levels).toBeDefined();

    const invites = rows.filter((r) => r.kind === 'invite');
    expect(invites.map((i) => i.invite_status).sort()).toEqual(['expired', 'pending']);
  });

  it("a family member gets her OWN levels and null for the rest — null is 'not yours to know'", async () => {
    const rows = await peopleLib.circlePeople(claimsOf('ruth'), circleId);
    const me = rows.find((r) => r.kind === 'member' && r.display_name === 'Ruth');
    expect(me!.levels?.[nell]?.health).toBe('summary');
    const marisol = rows.find((r) => r.kind === 'member' && r.display_name === 'Marisol');
    expect(marisol!.levels).toBeNull();
    // and no invites at all below coordinator (069:13)
    expect(rows.filter((r) => r.kind === 'invite')).toEqual([]);
  });

  it('a malformed circle is [] before the DB; a non-member is refused in ONE shape', async () => {
    expect(await peopleLib.circlePeople(claimsOf('sarah'), 'not-a-uuid')).toEqual([]);
  });
});

describe('setGrant — lower without a token, raise only through the §5.7 step-up, the ceiling structural', () => {
  it('a coordinator LOWERS without any token, and the log entry carries both levels', async () => {
    await peopleLib.setGrant(claimsOf('sarah'), member.ruth, nell, 'health', 'log', null);
    const logged = await raw.query(
      `select level_before::text as b, level_after::text as a from public.access_log
        where circle_id = $1 and event_type = 'grant_changed' and target_member_id = $2
          and domain = 'health' order by seq desc limit 1`,
      [circleId, member.ruth],
    );
    expect(logged.rows[0]).toEqual({ b: 'summary', a: 'log' });
  });

  it('a RAISE without a token is refused; with a fresh token bound to member:subject:domain it lands', async () => {
    await expect(
      peopleLib.setGrant(claimsOf('sarah'), member.ruth, nell, 'health', 'summary', null),
    ).rejects.toThrow(/grant_refused/);
    const minted = await stepUp.mintStepUp(
      freshClaimsOf('sarah'),
      'raise_grant',
      `${member.ruth}:${nell}:health`,
    );
    await peopleLib.setGrant(claimsOf('sarah'), member.ruth, nell, 'health', 'summary', minted.token);
    const rows = await peopleLib.circlePeople(claimsOf('sarah'), circleId);
    const ruth = rows.find((r) => r.kind === 'member' && r.display_name === 'Ruth');
    expect(ruth!.levels?.[nell]?.health).toBe('summary');
  });

  it('the care-circle ceiling holds in the DATABASE: a raise above it is refused even with a valid token', async () => {
    const minted = await stepUp.mintStepUp(
      freshClaimsOf('sarah'),
      'raise_grant',
      `${member.marisol}:${nell}:schedule`,
    );
    await expect(
      peopleLib.setGrant(claimsOf('sarah'), member.marisol, nell, 'schedule', 'view', minted.token),
    ).rejects.toThrow(/grant_refused/);
  });
});

describe('sharesForMember / contributionFor — the person page reads', () => {
  it('sharesForMember answers (empty here; 069 is the shape authority)', async () => {
    expect(await peopleLib.sharesForMember(claimsOf('sarah'), member.ruth)).toEqual([]);
  });

  it('contribution is plain counts and lists: owns now, completed, last active — and never-active is null, not a fake date', async () => {
    const ruth = await peopleLib.contributionFor(claimsOf('sarah'), circleId, member.ruth);
    expect(ruth.owns_now.map((t) => t.title)).toEqual(['Call the pharmacy']);
    expect(ruth.completed_count).toBe(1);
    expect(ruth.last_active).toBeNull();

    const sarah = await peopleLib.contributionFor(claimsOf('sarah'), circleId, member.sarah);
    expect(typeof sarah.last_active).toBe('string');
  });
});

describe('retireInvite — the old token dies; the fresh invite rides the ONE create path', () => {
  it('revokes the expired invite (the revokeInvite path finally has a caller) and hands back the prefill — address and tier', async () => {
    const r = await peopleLib.retireInvite(claimsOf('sarah'), circleId, expiredInvite);
    expect(r.invited_email).toBe(`helper.pp.${tag}@example.invalid`);
    expect(r.tier).toBe('care_circle');

    const old = await raw.query(`select revoked_at from public.invites where id = $1`, [
      expiredInvite,
    ]);
    expect(old.rows[0].revoked_at).not.toBeNull();
  });

  it("a non-coordinator sees no invite rows at all — 'not yours' and 'not there' are one shape, and nothing moves", async () => {
    await expect(
      peopleLib.retireInvite(claimsOf('ruth'), circleId, pendingInvite),
    ).rejects.toThrow(/invite_refused/);
    const still = await raw.query(`select revoked_at from public.invites where id = $1`, [
      pendingInvite,
    ]);
    expect(still.rows[0].revoked_at).toBeNull();
  });
});
