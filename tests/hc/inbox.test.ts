import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';

// ============================================================================
// B6 · lib/hc/inbox against the LIVE stack (slice-4 plan B6; UXA-01's
// Q6 disposition binds; SND-02's member surfaces; DUP-01's member half;
// CNL-01's surface; PST-01 consumed):
//
//   - acceptSender releases held mail in the SAME transaction (a real
//     gate lease + the CAS + the outbox re-queue — the relay's work).
//   - cancelArrival: the member's window (extracting/extracted/
//     interpreting), manage-gated.
//   - resolveDuplicate: 'different' resumes to the gate; 'same_thing'
//     terminalizes nothing_filed with the original retained.
//   - productStates: the family vocabulary via hc.product_state, DEF-10
//     refusals OMITTED (an outsider learns nothing, not even an error
//     shape difference per id).
//
// Test class: LIVE-DB INTEGRATION.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
process.env.HC_PIPELINE_DB_URL ??= process.env.HC_DB_URL;

let inbox: typeof import('@/lib/hc/inbox');
let ingest: typeof import('@/lib/hc/ingest');
let workers: typeof import('@/lib/hc/workers');
let circleLib: typeof import('@/lib/hc/circle');
let raw: pg.Client;

const FOUNDER = randomUUID();
const FOUNDER_EMAIL = `founder.b6.${randomUUID().slice(0, 8)}@example.invalid`;
const OUTSIDER = randomUUID();
const OUTSIDER_EMAIL = `outsider.b6.${randomUUID().slice(0, 8)}@example.invalid`;
const founderClaims = { sub: FOUNDER, role: 'authenticated', email: FOUNDER_EMAIL };
const outsiderClaims = { sub: OUTSIDER, role: 'authenticated', email: OUTSIDER_EMAIL };

let circleId: string;
let subjectId: string;

const SENDER = 'clinic.b6@cardiology.example';

async function mkArrival(sender: string): Promise<string> {
  const made = await ingest.createEmailArrivals({
    circleId,
    subjectId,
    senderAddress: sender,
    senderDisplayName: null,
    messageId: `mid-${randomUUID()}`,
    authResult: 'unauthenticated',
    authDetail: {},
    attachments: [],
  });
  return made.parentId;
}

/** Drive one arrival through store+scan (clean) via the real wrappers. */
async function toScanned(arrival: string, bytes: Buffer): Promise<void> {
  const sha = createHash('sha256').update(bytes).digest('hex');
  const store = await workers.claimStage(arrival, 'store');
  expect(store.result).toBe('claimed');
  expect(
    await workers.finalizeStore({
      arrivalId: arrival,
      leaseId: store.leaseId!,
      storageKey: `circle/${circleId}/arrival/${arrival}/${sha}`,
      sha256Hex: sha,
      mimeDetected: 'application/pdf',
      byteSize: bytes.byteLength,
    }),
  ).toBe('advanced');
  const scan = await workers.claimStage(arrival, 'scan');
  expect(scan.result).toBe('claimed');
  expect(await workers.finalizeScan(arrival, scan.leaseId!, 'clean', {})).toBe('advanced');
}

async function toHeld(arrival: string, bytes: Buffer): Promise<void> {
  await toScanned(arrival, bytes);
  const gate = await workers.claimStage(arrival, 'gate');
  expect(gate.result).toBe('claimed');
  expect(
    await workers.advanceArrival(
      arrival,
      'scanned',
      'held_unknown_sender',
      gate.leaseId!,
      'sender_unknown',
    ),
  ).toBe('advanced');
}

beforeAll(async () => {
  inbox = await import('@/lib/hc/inbox');
  ingest = await import('@/lib/hc/ingest');
  workers = await import('@/lib/hc/workers');
  circleLib = await import('@/lib/hc/circle');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  for (const [id, email, name] of [
    [FOUNDER, FOUNDER_EMAIL, 'Founder B6'],
    [OUTSIDER, OUTSIDER_EMAIL, 'Outsider B6'],
  ] as const) {
    await raw.query(
      `insert into auth.users (id, email, instance_id, aud, role, email_confirmed_at)
       values ($1, $2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now())`,
      [id, email],
    );
    await raw.query(
      `insert into public.accounts (id, kind, display_name) values ($1, 'member', $2)`,
      [id, name],
    );
  }
  const created = await circleLib.createCircleFromSetup(founderClaims, {
    name: "Eli's circle",
    subjects: [
      {
        first_name: 'Eli',
        situation: 'At home, on their own',
        postal_code: '02140',
        timezone: 'America/New_York',
        accent_color: '#7A6E9B',
        forwarding_local_part: `eli.${randomUUID().slice(0, 6)}`,
      },
    ],
  });
  circleId = created.circle_id;
  subjectId = (
    await raw.query('select id from public.subjects where circle_id = $1', [circleId])
  ).rows[0].id;

  return async () => {
    await raw.query(`set session_replication_role = replica`);
    await raw.query(
      `delete from public.scan_results where content_sha256 in
       (select content_sha256 from public.arrivals where circle_id = $1 and content_sha256 is not null)`,
      [circleId],
    );
    await raw.query(`delete from pgmq.q_pipeline_work where message ->> 'circle_id' = $1`, [
      circleId,
    ]);
    await raw.query(`delete from pgmq.a_pipeline_work where message ->> 'circle_id' = $1`, [
      circleId,
    ]);
    for (const t of [
      'pipeline_outbox',
      'arrival_events',
      'pipeline_leases',
      'arrivals',
      'known_senders',
      'access_grants',
      'access_log',
      'circle_members',
      'subjects',
    ]) {
      await raw.query(`delete from public.${t} where circle_id = $1`, [circleId]);
    }
    await raw.query('delete from public.circles where id = $1', [circleId]);
    await raw.query('delete from public.accounts where id = any($1)', [[FOUNDER, OUTSIDER]]);
    await raw.query('delete from auth.users where id = any($1)', [[FOUNDER, OUTSIDER]]);
    await raw.query(`set session_replication_role = default`);
    await raw.end();
  };
});

describe('B6 · acceptSender releases held mail in one transaction (SND-02 surface)', () => {
  it('the held arrival moves to extracting with an outbox re-queue; the verdict machinery stays per-message', async () => {
    const arrival = await mkArrival(SENDER);
    await toHeld(arrival, Buffer.from(`held-${arrival}`));

    const accepted = await inbox.acceptSender(founderClaims, circleId, { address: SENDER });
    expect(accepted.released_count).toBe(1);

    const state = await raw.query('select state from public.arrivals where id = $1', [arrival]);
    expect(state.rows[0].state).toBe('extracting');
    const outbox = await raw.query(
      `select count(*)::int as n from public.pipeline_outbox
       where arrival_id = $1 and reason_code = 'sender_accepted_requeue'`,
      [arrival],
    );
    expect(outbox.rows[0].n).toBe(1);
  }, 30_000);

  it('a non-coordinator outsider is refused in one shape', async () => {
    await expect(
      inbox.acceptSender(outsiderClaims, circleId, { address: 'x@y.example' }),
    ).rejects.toThrow(/sender_refused/);
  });
});

describe('B6 · cancelArrival — the member window (CNL-01 surface)', () => {
  it('cancels at extracting; the outsider gets the one refusal shape', async () => {
    const arrival = await mkArrival(SENDER); // sender now accepted
    await toScanned(arrival, Buffer.from(`cancel-${arrival}`));
    const gate = await workers.claimStage(arrival, 'gate');
    expect(
      await workers.advanceArrival(
        arrival,
        'scanned',
        'extracting',
        gate.leaseId!,
        'sender_recognised',
      ),
    ).toBe('advanced');

    await expect(inbox.cancelArrival(outsiderClaims, arrival)).rejects.toThrow(/cancel_refused/);

    const done = await inbox.cancelArrival(founderClaims, arrival);
    expect(done.state).toBe('cancelled');
  }, 30_000);
});

describe('B6 · resolveDuplicate — never auto-discarded, both exits (DUP-01 surface)', () => {
  it('a second identical copy lands duplicate_suspected; different resumes, same_thing keeps the original', async () => {
    const bytes = Buffer.from(`dup-${randomUUID()}`);
    const original = await mkArrival(SENDER);
    await toScanned(original, bytes);

    const copyA = await mkArrival(SENDER);
    await toScanned(copyA, bytes); // strictly-later copy → suspect
    const stateA = await raw.query('select state from public.arrivals where id = $1', [copyA]);
    expect(stateA.rows[0].state).toBe('duplicate_suspected');

    const resumed = await inbox.resolveDuplicate(founderClaims, copyA, 'different');
    expect(resumed.resolution).toBe('different');
    const afterA = await raw.query('select state from public.arrivals where id = $1', [copyA]);
    expect(afterA.rows[0].state).toBe('scanned');

    const copyB = await mkArrival(SENDER);
    await toScanned(copyB, bytes);
    const kept = await inbox.resolveDuplicate(founderClaims, copyB, 'same_thing');
    expect(kept.resolution).toBe('same_thing');
    const afterB = await raw.query('select state from public.arrivals where id = $1', [copyB]);
    expect(afterB.rows[0].state).toBe('nothing_filed');
    // The ORIGINAL is retained and untouched.
    const orig = await raw.query('select state from public.arrivals where id = $1', [original]);
    expect(orig.rows[0].state).toBe('scanned');
  }, 60_000);
});

describe('B6 · productStates — the family vocabulary, refusals omitted', () => {
  it('labels land per PRD §4.2.2; the outsider gets an EMPTY map, not an error oracle', async () => {
    const fresh = await mkArrival(SENDER);
    const labels = await inbox.productStates(founderClaims, [fresh, randomUUID()]);
    expect(labels.get(fresh)).toBe('Checking');
    expect(labels.size).toBe(1); // the ghost id is omitted, not errored

    const outsiderView = await inbox.productStates(outsiderClaims, [fresh]);
    expect(outsiderView.size).toBe(0);
  });
});

// ============================================================================
// 5B B8 · The known-senders member surface, LIVE (slice-5 plan B8; ADR-0019
// D15's named gap; SND-03).
//
// hc.revoke_sender shipped at 4A with no way for a member to reach it: the
// list it operates on had no read. 5A M1's hc.list_known_senders is that read,
// coordinator-gated in the SND-02 shape, and this is the pair working
// end-to-end through the request-role channel.
// ============================================================================

describe('5B B8 · known senders: an authorized list, and revoke through it', () => {
  it('a coordinator lists live senders with who accepted them and when', async () => {
    const address = `records.b8.${randomUUID().slice(0, 8)}@clinic.example`;
    await inbox.acceptSender(founderClaims, circleId, { address });

    const senders = await inbox.listKnownSenders(founderClaims, circleId);
    const mine = senders.find((s) => s.address === address);
    expect(mine).toBeDefined();
    expect(mine!.accepted_by).toBe(FOUNDER);
    expect(mine!.accepted_by_name).toBeTruthy();

    // Round-16 R5/F-1: `toBeTruthy()` was the whole assertion, and a Date is
    // truthy. KnownSender declares accepted_at as `string`, the page calls
    // .slice(0, 10) on it, and node-pg hands back a Date for timestamptz —
    // so every non-empty senders list threw at render. The type must be TRUE
    // at the boundary, not merely declared.
    expect(typeof mine!.accepted_at).toBe('string');
    expect(mine!.accepted_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Exactly what the page does with it.
    expect(mine!.accepted_at.slice(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('revoking removes it from the list — the pair closes D15', async () => {
    const address = `revoke.b8.${randomUUID().slice(0, 8)}@clinic.example`;
    await inbox.acceptSender(founderClaims, circleId, { address });
    const before = await inbox.listKnownSenders(founderClaims, circleId);
    const target = before.find((s) => s.address === address);
    expect(target).toBeDefined();

    await inbox.revokeSender(founderClaims, target!.id);

    const after = await inbox.listKnownSenders(founderClaims, circleId);
    expect(after.find((s) => s.address === address)).toBeUndefined();
  });

  it('an outsider is refused — one shape, no existence leak (DEF-10)', async () => {
    await expect(inbox.listKnownSenders(outsiderClaims, circleId)).rejects.toThrow();
  });

  it('a nonexistent circle refuses in the SAME shape as a foreign one', async () => {
    const foreign = inbox.listKnownSenders(founderClaims, randomUUID());
    await expect(foreign).rejects.toThrow(/sender_refused/);
  });
});
