import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import {
  DOC_CATEGORIES,
  categoryDomain,
  documentAudience,
  documentById,
  documentReferences,
  documentShares,
  isDocCategory,
  shareCandidates,
  type AudienceRow,
  type DocumentDetail,
  type ReferenceRow,
  type ShareCandidate,
  type ShareRow,
} from '@/lib/hc/documents';
import { readableRendition, type ReadableRendition } from '@/lib/hc/artifacts';
import { extractionsFor, type ReviewFact } from '@/lib/hc/review';
import { MachineReadText } from '@/components/review/MachineReadText';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { SubjectLabel } from '@/components/ui/SubjectLabel';
import { formatShortDate } from '@/lib/format/dates';

/**
 * /[circle]/documents/[document] — the document detail (PRD §4.3.2–§4.3.5;
 * TSD §1.3; 7C C2; DOC-02/03/04's app halves; AC-DOC-3/5/6; settled item 2).
 *
 * ONE page, three depths, decided by the database and rendered without a
 * single disabled control:
 *
 *   · at `summary` it is a list of SENTENCES — title, category, dates, the
 *     three sentences, the source, the approver — and nothing that implies
 *     more exists (the design spec's "no greyed items", and settled item 2's
 *     reason: a disabled viewer implies the artifact exists in a form this
 *     person could be shown);
 *   · at `view` (`can_view`: the arrival's view×5, REV-01's one resolution)
 *     it gains the pages — every byte through GET /api/artifact/[arrival]
 *     ?page=N, the ONE path the fence test holds — with the machine-read
 *     sibling per page (&text=1, §6.9's exact label) and the facts with
 *     citation and the risk_class word. extractionsFor is never called
 *     below can_view: a throw there is a page defect, not "no facts";
 *   · at `manage` it gains the shares (granter named, unshare ONE action),
 *     share behind the §5.7 step-up bound to `document:<id>` with §4.3.5's
 *     rules said on screen, and re-categorise with the exact before-and-
 *     after audience named FIRST and the preview binding the move
 *     (expected_category — D19.5).
 */

const CATEGORY_LABEL: Record<string, string> = {
  medical: 'Medical',
  medications: 'Medications',
  insurance: 'Insurance',
  legal: 'Legal',
  financial: 'Financial',
  labs: 'Labs',
  other: 'Other',
};

const STEP_UP_COOKIE = 'hc-step-up';

function header(doc?: DocumentDetail) {
  return <PageHeader title={doc?.title ?? 'Document'} />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading this document is taking longer than usual. Nothing has been lost — '
          : "We couldn't load this document just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

/** Every marker the submit routes emit is READ and rendered (R5/F-7). */
function noticeFor(sp: Record<string, string | string[] | undefined>) {
  const e = typeof sp.e === 'string' ? sp.e : null;
  if (e === 'slow') {
    return { kind: 'alert' as const, text: 'That took too long to confirm. Check the document before trying again — nothing is lost.' };
  }
  if (e === 'step-up') return { kind: 'alert' as const, text: 'Sharing needs a fresh confirmation that it is you. Confirm below, then share.' };
  if (e === 'refused') return { kind: 'alert' as const, text: "That couldn't be done just now." };
  if (e === 'changed') return { kind: 'alert' as const, text: 'This document changed while you were looking at it. Check the category, then try again.' };
  if (sp.shared === '1') return { kind: 'status' as const, text: "Shared. It's written in the family's log." };
  if (sp.unshared === '1') return { kind: 'status' as const, text: 'Unshared. They lose it from their next look at the record.' };
  if (sp.moved === '1') return { kind: 'status' as const, text: "Moved. The change and who it reaches are written in the family's log." };
  return null;
}

function referenceLine(circle: string, ref: ReferenceRow, key: number) {
  const noun =
    ref.object_type === 'task'
      ? 'task'
      : ref.object_type === 'timeline_event'
        ? 'timeline entry'
        : ref.object_type === 'profile_fact'
          ? 'profile fact'
          : ref.object_type;
  if (!ref.visible || ref.object_id === null || ref.label === null) {
    return <li key={key}>A {noun} you can&apos;t see</li>;
  }
  const href =
    ref.object_type === 'task'
      ? `/${circle}/tasks/${ref.object_id}`
      : ref.object_type === 'timeline_event'
        ? `/${circle}/timeline/${ref.object_id}`
        : null;
  return <li key={key}>{href ? <a href={href}>{ref.label}</a> : ref.label}</li>;
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string; document: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle, document: documentId } = await params;
  const sp = (await searchParams) ?? {};
  const next = `/${circle}/documents/${documentId}`;
  const supabase = await asUser();
  const gate = await gatePage(supabase, next);
  if (gate.kind === 'unavailable') {
    return (
      <>
        {header()}
        <SessionUnavailable next={next} />
      </>
    );
  }
  const claims = gate.claims;

  return withPageBudget(
    async (budget) => {
      let doc: DocumentDetail | null;
      let refs: ReferenceRow[];
      try {
        [doc, refs] = await Promise.all([
          budget.race(documentById(claims, circle, documentId), 'documentById'),
          budget.race(documentReferences(claims, documentId), 'documentReferences'),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`document: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }
      // Nonexistent, foreign, deleted and hidden: ONE shape.
      if (!doc) notFound();

      // The view side, only past the one resolution — never below it.
      let rendition: ReadableRendition | null = null;
      let facts: ReviewFact[] = [];
      if (doc.can_view) {
        try {
          [rendition, facts] = await Promise.all([
            budget.race(readableRendition(claims, doc.artifact_arrival_id), 'readableRendition'),
            budget.race(extractionsFor(claims, doc.artifact_arrival_id), 'extractionsFor'),
          ]);
        } catch (err) {
          if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
          console.error(`document: view read failed: ${(err as Error).message}`);
          return loadFailed(next, false);
        }
      }

      // The manage side's reads, only where the controls render.
      let shares: ShareRow[] = [];
      let candidates: ShareCandidate[] = [];
      let audience: AudienceRow[] = [];
      const move = typeof sp.move === 'string' && isDocCategory(sp.move) && sp.move !== doc.category ? sp.move : null;
      if (doc.can_manage) {
        try {
          [shares, candidates, audience] = await Promise.all([
            budget.race(documentShares(claims, documentId), 'documentShares'),
            budget.race(shareCandidates(claims, circle), 'shareCandidates'),
            move
              ? budget.race(documentAudience(claims, documentId, move), 'documentAudience')
              : Promise.resolve([] as AudienceRow[]),
          ]);
        } catch (err) {
          if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
          console.error(`document: manage read failed: ${(err as Error).message}`);
          return loadFailed(next, false);
        }
      }

      const notice = noticeFor(sp);
      const shareWith = typeof sp.share === 'string' ? sp.share : null;
      const shareTarget = shareWith ? candidates.find((c) => c.member_id === shareWith) : undefined;
      const stepUp = (await cookies()).get(STEP_UP_COOKIE)?.value ?? null;
      const gainedNames = audience.filter((r) => r.change === 'gained').map((r) => r.display_name);
      const lostNames = audience.filter((r) => r.change === 'lost').map((r) => r.display_name);
      const changedNames = audience.filter((r) => r.change === 'changed').map((r) => r.display_name);

      return (
        <>
          {header(doc)}
          {notice ? (
            <p className="field-help" role={notice.kind}>
              {notice.text}
            </p>
          ) : null}

          <Card>
            <p className="meta">
              <SubjectLabel subjectId={doc.subject_id} seq={doc.subject_seq} name={doc.subject_name} />
              {' · '}
              {CATEGORY_LABEL[doc.category] ?? doc.category}
              {' · filed '}
              {formatShortDate(doc.filed_at.slice(0, 10))}
            </p>
            {doc.summary_text ? <p>{doc.summary_text}</p> : null}

            <dl className="record-facts">
              <dt>Where it came from</dt>
              <dd>
                {doc.source ? (
                  <>
                    {doc.source.channel === 'email' ? 'Email' : 'Uploaded'}
                    {doc.source.sender_display_name ? ` · ${doc.source.sender_display_name}` : ''}
                    {doc.source.received_at ? ` · ${formatShortDate(doc.source.received_at.slice(0, 10))}` : ''}
                    {' · '}
                    <a href={`/${circle}/inbox/${doc.source.arrival_id}`}>the arrival</a>
                  </>
                ) : (
                  'Its arrival is not yours to open'
                )}
              </dd>
              <dt>Who approved it</dt>
              <dd>
                Approved by {doc.approver_display_name} · {formatShortDate(doc.approved_at.slice(0, 10))}
              </dd>
            </dl>
          </Card>

          {doc.can_view && rendition ? (
            <section className="record-section" aria-labelledby="the-document">
              <h2 id="the-document">The document</h2>
              <ol className="document-pages">
                {Array.from({ length: rendition.page_count }, (_, i) => i + 1).map((n) => (
                  <li key={n}>
                    <img
                      src={`/api/artifact/${doc!.artifact_arrival_id}?page=${n}`}
                      alt={`Page ${n} of ${doc!.title}`}
                      loading={n > 1 ? 'lazy' : undefined}
                    />
                    <p className="meta">Page {n}</p>
                    {/* ONE control, shared with the review screen: the sibling
                        is fetched through the fence on demand, and a page with
                        no sibling SAYS so — never a dead link (A11Y-11). */}
                    <MachineReadText arrivalId={doc!.artifact_arrival_id} page={n} />
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {doc.can_view && facts.length > 0 ? (
            <section className="record-section" aria-labelledby="what-we-read">
              <h2 id="what-we-read">What we read out of it</h2>
              <dl className="record-facts">
                {facts.map((f, i) => (
                  <div key={i}>
                    <dt>{f.field.replace(/_/g, ' ')}</dt>
                    <dd>
                      {f.value} <span className="meta">· {f.risk_class} · page {f.citation.page}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {refs.length > 0 ? (
            <section className="record-section" aria-labelledby="in-the-record">
              <h2 id="in-the-record">In the record</h2>
              <ul>{refs.map((ref, i) => referenceLine(circle, ref, i))}</ul>
            </section>
          ) : null}

          {doc.can_manage ? (
            <section className="record-section" aria-labelledby="shared-with">
              <h2 id="shared-with">Shared with</h2>
              {shares.length === 0 ? <p className="meta">No one beyond its audience.</p> : null}
              {shares.map((s) => (
                <form key={s.share_id} method="post" action={`${next}/unshare/submit`}>
                  <p className="meta">
                    {s.display_name} — shared by {s.granter_name} ·{' '}
                    {formatShortDate(s.granted_at.slice(0, 10))}
                    {s.created_by_assignment_of ? ' · came with a task' : ''}
                  </p>
                  <input type="hidden" name="share_id" value={s.share_id} />
                  <Button type="submit" variant="quiet">
                    Unshare
                  </Button>
                </form>
              ))}

              <h2 id="share-it">Share this document</h2>
              {shareTarget ? (
                stepUp ? (
                  <form method="post" action={`${next}/share/submit`}>
                    <p>
                      Sharing gives {shareTarget.display_name} this one document and nothing else:
                      one document, one person — never the domain, and never anything derived from
                      it. It stays until unshared, and it&apos;s written in the family&apos;s log.
                    </p>
                    <input type="hidden" name="member_id" value={shareTarget.member_id} />
                    <Button type="submit">Share it with {shareTarget.display_name}</Button>
                  </form>
                ) : (
                  <form method="post" action="/account/step-up/submit">
                    <p className="field-help">
                      Sharing needs a fresh confirmation that it&apos;s you.
                    </p>
                    <input type="hidden" name="operation" value="share_object" />
                    <input type="hidden" name="target_ref" value={`document:${doc.id}`} />
                    <input type="hidden" name="next" value={`${next}?share=${shareTarget.member_id}`} />
                    <Field label="Your password">
                      <Input type="password" name="password" required />
                    </Field>
                    <Button type="submit">Confirm it&apos;s you</Button>
                  </form>
                )
              ) : (
                <form method="get" action={next}>
                  <Field label="Share with">
                    <div className="choice-list">
                      {candidates.map((c) => (
                        <label key={c.member_id}>
                          <input type="radio" name="share" value={c.member_id} required />
                          <span>{c.display_name}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Button type="submit" variant="secondary">
                    Share this document
                  </Button>
                </form>
              )}
            </section>
          ) : null}

          {doc.can_manage ? (
            <section className="record-section" aria-labelledby="move-it">
              <h2 id="move-it">Category</h2>
              {move ? (
                <>
                  <p>
                    {categoryDomain(move) === categoryDomain(doc.category as (typeof DOC_CATEGORIES)[number])
                      ? `This keeps it in ${categoryDomain(move)}.`
                      : `This moves it out of ${categoryDomain(doc.category as (typeof DOC_CATEGORIES)[number])} into ${categoryDomain(move)}.`}
                    {gainedNames.length > 0 ? ` ${gainedNames.join(' and ')} will be able to see it.` : ''}
                    {lostNames.length > 0 ? ` ${lostNames.join(' and ')} will no longer be able to see it.` : ''}
                    {changedNames.length > 0 ? ` What ${changedNames.join(' and ')} can see changes.` : ''}
                    {audience.length === 0 ? ' No one gains or loses access.' : ''}
                  </p>
                  <form method="post" action={`${next}/recategorize/submit`}>
                    <input type="hidden" name="category" value={move} />
                    <input type="hidden" name="expected_category" value={doc.category} />
                    <Button type="submit">Move it to {CATEGORY_LABEL[move]}</Button>
                  </form>
                  <p className="meta">
                    <a href={next}>Keep it where it is</a>
                  </p>
                </>
              ) : (
                <form method="get" action={next}>
                  <Field label={`Move it out of ${CATEGORY_LABEL[doc.category]}`}>
                    <div className="choice-list">
                      {DOC_CATEGORIES.filter((c) => c !== doc!.category).map((c) => (
                        <label key={c}>
                          <input type="radio" name="move" value={c} required />
                          <span>{CATEGORY_LABEL[c]}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                  <Button type="submit" variant="secondary">
                    Preview the move
                  </Button>
                </form>
              )}
            </section>
          ) : null}

          <p className="meta">
            <a className="back-link" href={`/${circle}/documents`}>
              All documents
            </a>
          </p>
        </>
      );
    },
    () => loadFailed(next, true),
  );
}
