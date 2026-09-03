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
 * when. The FILTERING is access_log_select's own (LOG-01: the reader's
 * access is the filter), and a denial renders its collapsed count and NEVER
 * an object's name (LOG-02: the entry cannot carry one, and this page must
 * not invent one). Printing renders the SAME rows — the print stylesheet
 * hides the chrome and adds nothing (app/globals.css @media print).
 *
 * 7D · R4/F-3: THE SURFACE DOES SUBTRACT, AND IT SAYS SO. It shows a WINDOW
 * of the most recent LOG_WINDOW entries; this page used to promise
 * "Everything done with the record" and "it prints exactly the entries
 * below" over `order by seq desc limit 300` with no cursor, no count and no
 * disclosure — with `seq` 1, §7.5's custodianship declaration, the first row
 * dropped and invisible from the very surface that shows it. The promise now
 * stands only inside the window; past it the page names what is missing, in
 * the lead paragraph, which printing does not hide. Reaching every entry
 * needs a cursor: OW-26, home slice 8.
 */

/**
 * How many entries this page shows. 7D · R4/F-3: it is a WINDOW, not the
 * whole log, and the page says so when it is one. Reaching every entry the
 * reader may see needs a cursor — OW-26, home slice 8.
 */
const LOG_WINDOW = 300;

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
  // 8C U1 · ADR-0040 D9.1/Q-G: `task_claimed` "renders generically until 8C
  // words it". Generically means the fallback below — `humanize()` plus the
  // TARGET appended — and on a claim the actor and the target are the same
  // person, so the log read "Marisol · task claimed · Marisol". The event
  // type exists so the record can tell HANDED TO YOU from YOU TOOK IT (D4),
  // and a sentence naming the claimant twice tells the reader neither. She
  // is named once, as the person who acted; the object is never named (the
  // entry carries no title and this page invents none).
  if (e.event_type === 'task_claimed') {
    return (
      <>
        <strong>{e.actor_display_name}</strong> took an unassigned task
        {e.subject_name ? <> in {e.subject_name}&apos;s record</> : null}
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
      let read: LogEntry[];
      try {
        // 7D · R4/F-3: ONE MORE than we mean to show, so the page can know
        // whether it is showing everything rather than assuming it is.
        read = await budget.race(accessLog(claims, circle, LOG_WINDOW + 1), 'accessLog');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`log: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }
      const truncated = read.length > LOG_WINDOW;
      const entries = truncated ? read.slice(0, LOG_WINDOW) : read;

      return (
        <>
          {header()}
          {/* R4/F-3: the promise stands where it is TRUE and is withdrawn
              where it is not. Inside the window this page really does print
              exactly the entries below. Past it, the oldest entries are cut
              first — and `seq` 1 is the custodianship declaration the
              subject page rests on, so the surface that shows that row is
              the surface that drops it. Said in the lead paragraph, which
              is not chrome and is not hidden by the print stylesheet, so a
              printed copy carries the same caveat. */}
          {truncated ? (
            <p className="meta">
              The most recent {LOG_WINDOW} entries, filtered to what you can see. Older entries —
              including the day this record was set up, and who was named its custodian — are
              not shown here yet, and a printed copy carries the same {LOG_WINDOW}.
            </p>
          ) : (
            <p className="meta">
              Everything done with the record, filtered to what you can see. Print this page for
              a copy the family can hold — it prints exactly the entries below.
            </p>
          )}
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
