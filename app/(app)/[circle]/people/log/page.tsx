import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import { accessLog, type LogEntry } from '@/lib/hc/people';
import { DOMAIN_LABEL, LEVEL_WORD } from '@/lib/permissions/phrases';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { formatShortDate } from '@/lib/format/dates';
import type { Domain, AccessLevel } from '@/lib/permissions/tiers';

/**
 * /[circle]/people/log — the family's access log, readable and PRINTABLE
 * (PRD §4.6.5; 7C C5; PPL-04's app half; AC-PPL-5/7; LOG-01/02's app
 * halves).
 *
 * Every entry: who did what, to whom, on which subject, in which domain,
 * when. The surface adds nothing and subtracts nothing — the filtering is
 * access_log_select's own (LOG-01: the reader's access is the filter),
 * and a denial renders its collapsed count and NEVER an object's name
 * (LOG-02: the entry cannot carry one, and this page must not invent
 * one). Printing renders the SAME filtered rows — the print stylesheet
 * hides the chrome and adds nothing (app/globals.css @media print).
 */

function header() {
  return <PageHeader title="The family's log" />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading the log is taking longer than usual. Nothing has been lost — '
          : "We couldn't load the log just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

function levelWord(level: string | null): string {
  if (!level) return '';
  return level === 'hidden' ? 'nothing' : (LEVEL_WORD[level as AccessLevel] ?? level);
}

function humanize(eventType: string): string {
  return eventType.replace(/_/g, ' ');
}

/** One entry, said as a sentence — the five parts where the row carries
 *  them (who · what · to whom · which subject · which domain · when). */
function entryLine(e: LogEntry): React.ReactNode {
  const when = formatShortDate(e.occurred_at.slice(0, 10));
  const domain = e.domain ? (DOMAIN_LABEL[e.domain as Domain] ?? e.domain) : null;
  if (e.event_type === 'access_denied') {
    return (
      <>
        <strong>{e.actor_display_name}</strong> tried to open something
        {e.subject_name ? <> in {e.subject_name}&apos;s {domain ?? 'record'}</> : null}
        {e.collapsed_count > 1 ? ` · ${e.collapsed_count} times` : ''} · {when}
      </>
    );
  }
  if (e.event_type === 'grant_changed') {
    return (
      <>
        <strong>{e.actor_display_name}</strong> changed what {e.target_name ?? 'a member'} can
        see{e.subject_name ? <> of {e.subject_name}&apos;s {domain}</> : null}:{' '}
        {levelWord(e.level_before) || 'nothing'} → {levelWord(e.level_after) || 'nothing'} · {when}
      </>
    );
  }
  return (
    <>
      <strong>{e.actor_display_name}</strong> · {humanize(e.event_type)}
      {e.target_name ? ` · ${e.target_name}` : ''}
      {e.subject_name ? ` · ${e.subject_name}` : ''}
      {domain ? ` · ${domain}` : ''}
      {e.collapsed_count > 1 ? ` · ${e.collapsed_count} times` : ''} · {when}
    </>
  );
}

export default async function AccessLogPage({
  params,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const next = `/${circle}/people/log`;
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
      let entries: LogEntry[];
      try {
        entries = await budget.race(accessLog(claims, circle, 300), 'accessLog');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`log: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }

      return (
        <>
          {header()}
          <p className="meta">
            Everything done with the record, filtered to what you can see. Print this page for
            a copy the family can hold — it prints exactly the entries below.
          </p>
          {entries.length === 0 ? <p className="meta">Nothing here yet.</p> : null}
          <ol className="log-entries">
            {entries.map((e) => (
              <li key={e.seq}>{entryLine(e)}</li>
            ))}
          </ol>
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
