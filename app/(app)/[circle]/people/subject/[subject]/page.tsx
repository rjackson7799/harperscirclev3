import { notFound } from 'next/navigation';
import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import {
  circlePeople,
  custodianshipDeclaration,
  profileFactsFor,
  type LogEntry,
  type PersonRow,
  type ProfileFact,
} from '@/lib/hc/people';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Card } from '@/components/ui/Card';
import { formatShortDate } from '@/lib/format/dates';

/**
 * /[circle]/people/subject/[subject] — the subject's page (PRD §7.5; 7C
 * C5; Q4(b): the Phase-1 home for the receipt's "filed to the profile"
 * link).
 *
 * The custodianship framing, said the smaller true way (§7.5): this is
 * their record, held on their behalf, everything written down — never the
 * word the product cannot honestly use about a person with no login. The
 * DECLARATION (the first row of the circle's log) renders where it is
 * visible — log×5 on the subject, D4's rule — and where it is not, the
 * page says NOTHING about it: no claim that there is none (Q-E's bound).
 * The profile facts render at `view` with the risk_class word; below
 * view there are none, and no facts-shaped hole implies them.
 */

function header(name?: string) {
  return <PageHeader title={name ?? 'A subject'} />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading this page is taking longer than usual. Nothing has been lost — '
          : "We couldn't load this page just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ circle: string; subject: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle, subject: subjectId } = await params;
  const next = `/${circle}/people/subject/${subjectId}`;
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
      let rows: PersonRow[];
      let declaration: LogEntry | null;
      let facts: ProfileFact[];
      try {
        [rows, declaration, facts] = await Promise.all([
          budget.race(circlePeople(claims, circle), 'circlePeople'),
          budget.race(custodianshipDeclaration(claims, circle, subjectId), 'custodianshipDeclaration'),
          budget.race(profileFactsFor(claims, subjectId), 'profileFactsFor'),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`subject: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }

      const subject = rows.find((r) => r.kind === 'subject' && r.subject_id === subjectId);
      if (!subject) notFound();

      return (
        <>
          {header(subject.display_name)}
          <Card>
            <p>
              This is <strong>{subject.display_name}</strong>&apos;s record, held on their
              behalf{subject.custodian_name ? <> by {subject.custodian_name} (custodian)</> : null}.
              Everything done with it is written down —{' '}
              <a href={`/${circle}/people/log`}>the family&apos;s log</a> can be printed for them
              today.
            </p>
            {declaration ? (
              <p className="meta">
                Custodianship declared · {formatShortDate(declaration.occurred_at.slice(0, 10))} ·
                the first row of the log
              </p>
            ) : null}
          </Card>

          {facts.length > 0 ? (
            <section className="record-section" aria-labelledby="the-profile">
              <h2 id="the-profile">The profile</h2>
              <dl className="record-facts">
                {facts.map((f) => (
                  <div key={f.id}>
                    <dt>{f.field.replace(/_/g, ' ')}</dt>
                    <dd>
                      {typeof f.value === 'string' ? f.value : JSON.stringify(f.value)}{' '}
                      <span className="meta">
                        · {f.risk_class} · approved by {f.approver_display_name} ·{' '}
                        {formatShortDate(f.approved_at.slice(0, 10))}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <p className="meta">
            <a className="back-link" href={`/${circle}/people`}>
              Everyone in the circle
            </a>
          </p>
        </>
      );
    },
    () => loadFailed(next, true),
  );
}
