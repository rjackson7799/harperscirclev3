import { redirect } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { liveSessionClaims } from '@/lib/auth/session';
import { productStates } from '@/lib/hc/inbox';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProvenanceLine } from '@/components/ui/ProvenanceLine';
import { FORWARDING_DOMAIN } from '@/lib/setup/steps';
import { heldExpiryLabel, pastQueueAgeBound } from '@/lib/format/dates';

/**
 * The Care Inbox (slice-4 plan B6; PRD §4.2.2 — the state machine IS
 * the product surface; UXA-01 flips with the Q6 disposition):
 *
 *   - The audience is manage-×5 BY DESIGN (Q6 point 1): the RLS cliff
 *     (manage on 4 of 5 ⇒ zero rows, pinned 027:31) delivers zero rows
 *     to anyone below it, and the empty state never asserts the world
 *     is empty — no processing affordance, no existence leak (point 2).
 *   - Labels are hc.product_state's (M4): a parent reports its
 *     least-advanced live child over THIS caller's visible children.
 *   - The §5.3 verdict is SHOWN, never just stored (PRD §4.2.8).
 *   - Held mail carries the accept-sender release and the §5.4 30-day
 *     expiry warning; duplicates carry §4.7's two human resolutions;
 *     the §4.5 member window carries cancel.
 *   - 5B B6: §4.7 point 2 — a STAGE-2 suspect says WHY it is suspected and
 *     offers two resolutions that do different things from stage 1's:
 *     `different` resumes to interpret, `same_thing` attaches this arrival
 *     to the matched document as an ADDITIONAL SOURCE and files nothing new.
 *
 *     **It does NOT name the matched document, and that is not a choice.**
 *     `authenticated` holds a COLUMN-LEVEL select grant on `arrivals` — 25
 *     of its 28 columns — and 5A M5 added `duplicate_of_document_id`
 *     without extending it. Selecting that column here is refused
 *     ("permission denied for column"), supabase-js returns an error, and
 *     the ENTIRE inbox renders its empty state. The local gate caught
 *     exactly that. Until a one-line grant ships (ADR-0022 D15; the
 *     round-16 pointed question), the copy says why the match happened —
 *     which is the provenance a person actually needs — rather than which
 *     document it matched.
 *   - §4.11/§13.1: anything past the 4-hour queue-age bound says
 *     plainly that reading is delayed.
 *   - First run: the forwarding address IS the content — the one §8.6
 *     empty-state exception, owned by this surface.
 */

const WORKER_STATES = new Set([
  // Mirrors hc.pipeline_worker_states() (010002) — app-side copy for the
  // delay notice only; every enforcement decision stays DB-side.
  'received',
  'stored',
  'scanning',
  'scanned',
  'extracting',
  'extracted',
  'interpreting',
]);

const CANCEL_WINDOW = new Set(['extracting', 'extracted', 'interpreting']);

type ArrivalRow = {
  id: string;
  state: string;
  channel: string;
  sender_address: string | null;
  sender_display_name: string | null;
  auth_result: string | null;
  scan_verdict: string | null;
  received_at: string;
};

/** The states that carry a resolution question, and which question. */
const STAGE1 = 'duplicate_suspected';
const STAGE2 = 'duplicate_suspected_stage2';

type SubjectRow = {
  id: string;
  first_name: string;
  forwarding_local_part: string | null;
  forwarding_active_at: string | null;
};

function verdictLine(row: ArrivalRow): string | null {
  if (row.channel !== 'email' || !row.auth_result) return null;
  if (row.auth_result === 'authenticated') return 'verified';
  if (row.auth_result === 'lookalike') {
    return 'unverified · this address closely resembles a sender this circle trusts';
  }
  return "unverified · we couldn't confirm this came from them";
}

export default async function InboxPage({
  params,
}: {
  params: Promise<{ circle: string }>;
}) {
  const { circle } = await params;
  const supabase = await asUser();
  const claims = await liveSessionClaims(supabase);
  if (!claims?.sub) redirect(`/sign-in?next=${encodeURIComponent(`/${circle}/inbox`)}`);

  const { data: parentData } = await supabase
    .from('arrivals')
    .select(
      'id, state, channel, sender_address, sender_display_name, auth_result, scan_verdict, received_at',
    )
    .eq('circle_id', circle)
    .is('parent_arrival_id', null)
    .is('deleted_at', null)
    .order('received_at', { ascending: false })
    .limit(50);
  const parents = (parentData ?? []) as ArrivalRow[];

  const childCounts = new Map<string, number>();
  // §4.7's resolution binds to the SUSPECTED row, and a mailed duplicate
  // is a CHILD arrival — the parent's rollup label alone would name the
  // duplicate with nothing to click (the B9 gate finding).
  type Suspect = { arrivalId: string; stage: 1 | 2 };
  const childSuspects = new Map<string, Suspect[]>();
  if (parents.length > 0) {
    const { data: childData } = await supabase
      .from('arrivals')
      .select('id, parent_arrival_id, state')
      .eq('circle_id', circle)
      .in(
        'parent_arrival_id',
        parents.map((p) => p.id),
      )
      .is('deleted_at', null);
    for (const child of (childData ?? []) as {
      id: string;
      parent_arrival_id: string;
      state: string;
    }[]) {
      childCounts.set(
        child.parent_arrival_id,
        (childCounts.get(child.parent_arrival_id) ?? 0) + 1,
      );
      // Gated on the STATE, which is also the ONLY thing a member can read.
      // ADR-0020 D6 retains duplicate_of_document_id after resolution as the
      // trace of the question that was asked — so even when the grant lands,
      // the pointer must never be what decides whether to ask again
      // (round-15 observation 3).
      if (child.state === STAGE1 || child.state === STAGE2) {
        const list = childSuspects.get(child.parent_arrival_id) ?? [];
        list.push({ arrivalId: child.id, stage: child.state === STAGE2 ? 2 : 1 });
        childSuspects.set(child.parent_arrival_id, list);
      }
    }
  }

  const suspectsFor = (row: ArrivalRow): Suspect[] => [
    ...(row.state === STAGE1 || row.state === STAGE2
      ? [{ arrivalId: row.id, stage: (row.state === STAGE2 ? 2 : 1) as 1 | 2 }]
      : []),
    ...(childSuspects.get(row.id) ?? []),
  ];

  const labels = await productStates(claims, parents.map((p) => p.id));

  const delayed = parents.some(
    (p) => WORKER_STATES.has(p.state) && pastQueueAgeBound(p.received_at),
  );

  if (parents.length === 0) {
    // First run: the forwarding address IS the content (§8.6's one
    // exception). The copy never asserts nothing exists — it shows THIS
    // caller's view (the Q6 fail-closed posture).
    const { data: subjectData } = await supabase
      .from('subjects')
      .select('id, first_name, forwarding_local_part, forwarding_active_at')
      .eq('circle_id', circle)
      .is('deleted_at', null)
      .order('first_name');
    const subjects = (subjectData ?? []) as SubjectRow[];
    return (
      <>
        <PageHeader
          title="Care Inbox"
          context="Anything mailed or uploaded lands here first, with its progress shown honestly — nothing is filed without a person approving it."
        />
        <div className="choice-list">
          {subjects.map((s) => (
            <Card key={s.id}>
              <span className="row-title">{s.first_name}&apos;s forwarding address</span>
              <p className="meta">
                {s.forwarding_local_part}@{FORWARDING_DOMAIN}
                {s.forwarding_active_at
                  ? ' — active. Anything sent here shows up in this inbox.'
                  : " — not live yet. It activates after the founder's email is verified."}
              </p>
            </Card>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Care Inbox" context="Every item shows exactly where it is." />
      <p className="meta">
        {/* 5B B8: the senders surface lives beside the thing it manages — a
            sender is accepted from this screen, so the list of accepted
            senders is one link away rather than a sixth item in the nav. */}
        <a href={`/${circle}/senders`}>Known senders</a>
      </p>
      {delayed ? (
        <p className="field-help" role="status">
          Reading is delayed right now — new items are safe and will be read; they are taking
          longer than usual.
        </p>
      ) : null}
      <div className="choice-list">
        {parents.map((row) => {
          const verdict = verdictLine(row);
          const attachments = childCounts.get(row.id) ?? 0;
          return (
            <Card key={row.id}>
              <span className="row-title">
                {row.channel === 'email'
                  ? (row.sender_display_name ? `${row.sender_display_name} · ` : '') +
                    (row.sender_address ?? 'unknown sender')
                  : 'Uploaded document'}
              </span>
              <span className="meta"> · {labels.get(row.id) ?? '—'}</span>
              {verdict ? <p className="meta">{verdict}</p> : null}
              {attachments > 0 ? (
                <p className="meta">
                  {attachments} attachment{attachments === 1 ? '' : 's'}
                </p>
              ) : null}

              {row.state === 'held_unknown_sender' && row.sender_address ? (
                <>
                  <p className="field-help">
                    Held for a person to decide. It expires on {heldExpiryLabel(row.received_at)}{' '}
                    unless the sender is accepted.
                  </p>
                  <form method="post" action={`/${circle}/inbox/accept-sender/submit`}>
                    <input type="hidden" name="address" value={row.sender_address} />
                    <Button type="submit" name="mode" value="address">
                      This was really them — accept this sender
                    </Button>{' '}
                    <Button type="submit" name="mode" value="domain" variant="quiet">
                      Trust everyone at {row.sender_address.split('@')[1]}
                    </Button>
                  </form>
                </>
              ) : null}

              {suspectsFor(row).map((suspect) => {
                return (
                  <div key={suspect.arrivalId}>
                    {suspect.stage === 2 ? (
                      <>
                        <p className="field-help">
                          This looks like something already filed for this person.
                        </p>
                        {/* §8.6's provenance line takes its first consumer here
                            (Q6): the suspicion is downstream of AI-extracted
                            values, so it shows where it came from. Naming the
                            matched document needs the column grant above. */}
                        <ProvenanceLine>
                          Matched on the document type, date and provider read from this
                          document
                        </ProvenanceLine>
                      </>
                    ) : null}
                    <form method="post" action={`/${circle}/inbox/resolve/submit`}>
                      <input type="hidden" name="arrival_id" value={suspect.arrivalId} />
                      <Button type="submit" name="resolution" value="different">
                        It&apos;s different — continue
                      </Button>{' '}
                      <Button type="submit" name="resolution" value="same_thing" variant="quiet">
                        {suspect.stage === 2
                          ? 'Same thing — add it as another source'
                          : 'Same thing — keep the original'}
                      </Button>
                    </form>
                  </div>
                );
              })}

              {CANCEL_WINDOW.has(row.state) ? (
                <form method="post" action={`/${circle}/inbox/cancel/submit`}>
                  <input type="hidden" name="arrival_id" value={row.id} />
                  <Button type="submit" variant="quiet">
                    Stop processing this
                  </Button>
                </form>
              ) : null}

              {row.scan_verdict === 'clean' ? (
                <p className="meta">
                  <a href={`/api/artifact/${row.id}`}>Open the original</a>
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
  );
}
