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
 * dropped and invisible from the very surface that shows it.
 *
 * 8C U2 · OW-26 (LOG-04): THE WINDOW IS NO LONGER A CEILING. `?before=<seq>`
 * reads strictly back, so pressing "Older entries" walks to the beginning of
 * the record and reaches `seq` 1. Three things follow, and each is a
 * decision rather than an omission:
 *
 *   · THE LEAD PARAGRAPH SAYS WHICH PAGE THIS IS, in words. Four states —
 *     the whole log; the newest of several; a page in the middle; the
 *     beginning. "Everything done with the record" is said ONLY where it is
 *     true, which is a single page with nothing behind it.
 *   · NO COUNT AND NO TOTAL, anywhere (§7.4). Not "page 2 of 5", not
 *     "1,240 entries", and no longer "the most recent 300": the window size
 *     was worth saying while it was a limit on what could be reached, and
 *     saying it now would be quantifying the record to no purpose.
 *   · THERE IS NO "NEWER" LINK, and that is deliberate. A backward cursor
 *     would need `seq > n` read ascending and reversed — a second ordering
 *     to keep honest — to duplicate what the browser's Back button already
 *     does exactly. What the page offers instead is the way home: a link to
 *     the most recent entries, from any depth.
 *
 * Printing renders the SAME rows — the print stylesheet hides the chrome and
 * adds nothing (app/globals.css @media print). The PAGER is chrome: a
 * printed link is a dead link. The disclosure is not, so a printed copy of
 * any page carries the sentence that says which page it is.
 */

/**
 * How many entries one page shows. 7D · R4/F-3: it is a WINDOW, not the
 * whole log, and the page says so when it is one. Since 8C U2 the window is
 * a page size and not a ceiling — `before` reaches past it (OW-26/LOG-04).
 */
const LOG_WINDOW = 300;

/** A cursor is a `seq`, and `seq` starts at 1. A hand-typed query string is
 *  the only way anything else arrives, and the honest answer to a cursor
 *  that is not one is the first page — never an error, and never a 500. */
function cursorFrom(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : undefined;
}

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
  searchParams,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const sp = (await searchParams) ?? {};
  const before = cursorFrom(sp.before);
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
        // whether there is a page behind this one rather than assuming.
        read = await budget.race(accessLog(claims, circle, LOG_WINDOW + 1, before), 'accessLog');
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`log: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }
      const older = read.length > LOG_WINDOW;
      const entries = older ? read.slice(0, LOG_WINDOW) : read;
      const oldest = entries.length > 0 ? entries[entries.length - 1].seq : null;

      // R4/F-3, kept: the promise is made only where it is TRUE. It is true
      // of a single page with nothing behind it, and of no other state.
      // Past that the page says which page it is, in words and without a
      // number (§7.4), and offers the way further back.
      const disclosure =
        !before && !older
          ? 'Everything done with the record, filtered to what you can see. Print this page for a copy the family can hold — it prints exactly the entries below.'
          : !before
            ? 'The most recent entries, filtered to what you can see. Older ones are further back, and this page prints exactly the entries below.'
            : older
              ? 'Earlier entries, filtered to what you can see. This page prints exactly the entries below.'
              : 'The beginning of the record, filtered to what you can see — back to the day it was set up and who was named its custodian. This page prints exactly the entries below.';

      return (
        <>
          {header()}
          {/* Not chrome, and not hidden by the print stylesheet: a printed
              copy of ANY page carries the sentence saying which page it is. */}
          <p className="meta log-disclosure">{disclosure}</p>
          {entries.length === 0 ? <p className="meta">Nothing here yet.</p> : null}
          <ol className="log-entries">
            {entries.map((e) => (
              <li key={e.seq}>{entryLine(e)}</li>
            ))}
          </ol>
          {/* The walk. `Older entries` reads strictly back from the last row
              rendered, so the pages tile the log exactly — no row twice and
              none skipped — and pressing it enough times arrives at `seq` 1.
              No page number and no total (§7.4); no `Newer` link, because
              Back already does that exactly (see the note at the top). */}
          {older || before ? (
            <nav className="log-pager" aria-label="More of the log">
              {older && oldest !== null ? <a href={`${next}?before=${oldest}`}>Older entries</a> : null}
              {before ? <a href={next}>The most recent entries</a> : null}
            </nav>
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
