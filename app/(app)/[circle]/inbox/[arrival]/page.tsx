import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import {
  arrivalForReview,
  extractionsFor,
  proposalsFor,
  receiptFor,
  recentRecordChange,
  type ReceiptRow,
} from '@/lib/hc/review';
import { readableRendition } from '@/lib/hc/artifacts';
import { productStates } from '@/lib/hc/inbox';
import { confidenceBand, loadBands, type BandMode } from '@/lib/extraction/bands';
import { PageHeader } from '@/components/shell/PageHeader';
import { ReviewScreen } from '@/components/review/ReviewScreen';
import { formatShortDate } from '@/lib/format/dates';

/**
 * The arrival detail route — PRD §4.2.3's review screen (6B B6 opened the
 * door, B7 fills the three regions; AC-INBOX-8).
 *
 * AUTHORIZATION IS RESOLVED ONCE, at the top, into the one question every
 * 6A-unified gate asks: `view` over all five domains of THIS arrival
 * (lib/hc/review.arrivalForReview — the artifact route's own predicate).
 * Every region renders from that single answer, so the screen can never
 * disagree with the database about who may see this arrival — and the
 * write-time re-check (M2's predicate inside approve/reject) stands behind
 * every control the screen renders.
 *
 * The zero-row shape is notFound — nonexistent, foreign, deleted, revoked
 * and below-summary are indistinguishable here exactly as they are at the
 * artifact route (DEF-10).
 *
 * Q4 AT RENDER TIME: each fact's band is computed HERE from the fact's own
 * (model_id, prompt_version) pair — the hash rides inside prompt_version —
 * and never stored. In the shipping mode every pair resolves all-high and
 * the screen says so once, globally.
 *
 * §4.2.9: no revalidator here, deliberately. Mid-decision state (a typed
 * correction, a chosen conflict outcome) must not be yanked by a refresh;
 * the write-time version check is the protection, its refusal re-renders
 * with the change highlighted, and hc.presence's honest signal — the
 * record changed; nothing about who is looking — renders muted.
 */
export default async function ArrivalPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string; arrival: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle, arrival } = await params;
  const supabase = await asUser();
  // 7B B1 (GTE-01): three outcomes; unavailable is a STATE, never a sign-in.
  const gate = await gatePage(supabase, `/${circle}/inbox/${arrival}`);
  if (gate.kind === 'unavailable') {
    return (
      <>
        <PageHeader title="Care Inbox" />
        <SessionUnavailable next={`/${circle}/inbox/${arrival}`} />
      </>
    );
  }
  const claims = gate.claims;

  // THE one resolution (M2/M5's unified gate, asked once).
  const row = await arrivalForReview(claims, circle, arrival);
  if (!row) notFound();

  const labels = await productStates(claims, [row.id]);
  const label = labels.get(row.id) ?? '—';
  const title =
    row.channel === 'email'
      ? (row.sender_display_name ? `${row.sender_display_name} · ` : '') +
        (row.sender_address ?? 'unknown sender')
      : 'Uploaded document';

  if (!row.can_view) {
    // AC-INBOX-8's one line: what fuller access would show, asserting
    // nothing about the contents.
    return (
      <>
        <PageHeader
          title={title}
          context={`Received ${formatShortDate(row.received_at.slice(0, 10))} · ${label}`}
        />
        <p className="field-help">
          You can follow this item&apos;s progress here. Reviewing what it contains needs
          fuller access to this person&apos;s record — a coordinator in this circle can
          review it, or can raise your access.
        </p>
        <p className="meta">
          <a href={`/${circle}/inbox`}>Back to the Care Inbox</a>
        </p>
      </>
    );
  }

  const [facts, proposals, rendition, changedAt] = await Promise.all([
    extractionsFor(claims, row.id),
    proposalsFor(claims, circle, row.id),
    readableRendition(claims, row.id),
    recentRecordChange(claims, row.subject_id),
  ]);

  // §4.2.4's receipt (B8): read only once something is DECIDED — while
  // everything is pending, the review is the screen's whole business and
  // the receipt has nothing to say.
  const receipt: ReceiptRow[] = proposals.some((p) => p.status !== 'pending')
    ? await receiptFor(claims, row.id)
    : [];

  // Q4: the band, computed at render time from each fact's OWN pair. The
  // configuration hash is the pair's own suffix; one loadBands per distinct
  // pair, so a mixed-run arrival cannot borrow a neighbour's calibration.
  const modes = new Map<string, BandMode>();
  const bandFor = (modelId: string, promptVersion: string): BandMode => {
    const key = `${modelId}|${promptVersion}`;
    let mode = modes.get(key);
    if (!mode) {
      mode = loadBands({
        running: {
          modelId,
          promptVersion,
          configurationHash: promptVersion.split('+')[1] ?? '',
        },
      });
      modes.set(key, mode);
    }
    return mode;
  };
  const screenFacts = facts.map((f) => ({
    field: f.field,
    value: f.value,
    confidence: f.confidence,
    riskClass: f.risk_class,
    citation: f.citation,
    band: confidenceBand(f.field, f.confidence, bandFor(f.model_id, f.prompt_version)),
  }));
  const allHigh =
    screenFacts.length === 0 || [...modes.values()].every((m) => m.mode === 'all_high');

  const sp = await searchParams;
  const refused =
    (sp.refused === 'version' || sp.refused === 'taint') && typeof sp.proposal === 'string'
      ? { kind: sp.refused as 'version' | 'taint', proposalId: sp.proposal }
      : null;

  // R5/F-7: every marker the decide route emits is READ and rendered.
  const decideNotice =
    sp.decided === '1' ? (
      <p className="field-help" role="status">
        Your decision was recorded.
      </p>
    ) : sp.e === 'decide' ? (
      <p className="field-help" role="alert">
        That decision couldn&apos;t be recorded — the item is unchanged, and you can decide it
        again below.
      </p>
    ) : null;

  return (
    <>
      <PageHeader
        title={title}
        context={`Received ${formatShortDate(row.received_at.slice(0, 10))} · ${label}`}
      />
      {decideNotice}
      {changedAt ? (
        // §4.2.9's presence, muted, saying only what hc.presence knows.
        <p className="micro-meta" role="status">
          This person&apos;s record changed recently — what you approve is re-checked
          against the record at the moment you approve it.
        </p>
      ) : null}
      {row.scan_verdict === 'clean' ? (
        <p className="meta">
          <a href={`/api/artifact/${row.id}`}>Open the original</a>
        </p>
      ) : null}

      <ReviewScreen
        circleId={circle}
        arrivalId={row.id}
        pageCount={rendition?.page_count ?? 0}
        facts={screenFacts}
        proposals={proposals.map((p) => ({
          id: p.id,
          kind: p.kind,
          version: p.version,
          payload: p.payload,
          status: p.status,
        }))}
        allHigh={allHigh}
        refused={refused}
      />

      {receipt.length > 0 ? (
        // §4.2.4: what went where. Links RESOLVE for tasks and timeline
        // (both surfaces are live); documents and profile facts are NAMED
        // and say plainly their surface opens later — never a dead link,
        // never a silent omission (RCP-02 stays pending; SIG-01 precedent).
        <section className="review-receipt" aria-label="What went where">
          <h2>What went where</h2>
          {receipt.every((r) => r.status === 'rejected') ? (
            // AC-INBOX-4: reject-all is an honest outcome, not an error —
            // and the original stays here, re-readable, above.
            <p>Nothing was filed. The original stays here for you to re-read.</p>
          ) : null}
          <ul>
            {receipt.map((r) => (
              <li key={r.proposal_id}>{receiptLine(r, circle)}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="meta">
        <a href={`/${circle}/inbox`}>Back to the Care Inbox</a>
      </p>
    </>
  );
}

const TYPE_LABELS: Record<string, string> = {
  task: 'task',
  document: 'document',
  profile_fact: 'profile fact',
  timeline_event: 'timeline event',
  episode: 'episode',
};

const REASON_LABELS: Record<string, string> = {
  wrong: 'Wrong',
  already_handled: 'Already handled',
  not_important: 'Not important',
  other: 'Other',
};

/**
 * One receipt row, said honestly (§4.2.4). The `visible: false` branch is
 * the receipt's counted-never-named discipline made visible: the TYPE
 * survives (hc.receipt_for returns it), the name, the id and any handle do
 * not — "you may not see this" must never read as "there is nothing here".
 */
function receiptLine(r: ReceiptRow, circle: string): React.ReactNode {
  if (r.status === 'rejected') {
    const reason = r.reject_reason ? ` — ${REASON_LABELS[r.reject_reason] ?? r.reject_reason}` : '';
    return <>Not filed{reason}.</>;
  }
  const corrected = r.status === 'edited_approved' ? ' Corrected before filing.' : '';
  if (!r.visible) {
    return (
      <>
        A {r.object_type ? TYPE_LABELS[r.object_type] ?? 'record item' : 'record item'} was filed
        that your access doesn&apos;t show you.
      </>
    );
  }
  if (r.object_type === 'task') {
    return (
      <>
        <a href={`/${circle}/tasks`}>{r.label}</a> — filed to Tasks.{corrected}
      </>
    );
  }
  if (r.object_type === 'timeline_event') {
    return (
      <>
        <a href={`/${circle}/timeline`}>{r.label}</a> — filed to the Timeline.{corrected}
      </>
    );
  }
  const destination =
    r.object_type === 'profile_fact'
      ? 'filed to the profile'
      : r.object_type === 'episode'
        ? 'filed as an episode'
        : 'filed as a document';
  return (
    <>
      <strong>{r.label}</strong> — {destination}; its page opens in an upcoming update.{corrected}
    </>
  );
}
