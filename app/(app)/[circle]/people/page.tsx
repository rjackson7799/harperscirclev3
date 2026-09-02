import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import { circlePeople, type PersonRow } from '@/lib/hc/people';
import { myMembership } from '@/lib/hc/tasks';
import { plainLine } from '@/lib/permissions/phrases';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { formatShortDate } from '@/lib/format/dates';

/**
 * /[circle]/people — People & roles, the list (PRD §4.6.1, §4.6.2, §7.5;
 * 7C C3; PPL-01's app half; AC-PPL-2/3; settled item 1).
 *
 * The permission model expressed as PEOPLE: every person with the
 * plain-language line per subject — the truth the family reads, rendered
 * from ONE module (lib/permissions/phrases) BEFORE any matrix, and this
 * page holds no matrix at all; the matrix lives behind the adjust action
 * (C4). The two honest limits are SAID here rather than hidden:
 *
 *   (1) the lines describe what a person sees in the RECORD — reads,
 *       search, presence and the log; the notification and export channels
 *       are not built yet, so no line promises them (RLS-11b);
 *   (2) subjects are people holding the highest access to their own
 *       record, no account attached, their custodian named beside them —
 *       §7.5's framing, and never the word the product cannot honestly
 *       use about a person with no login.
 *
 * A null levels map is "not yours to know" (hc.circle_people fails closed
 * below coordinator): NO line renders, and nothing implies one exists.
 * Invites appear for coordinators — `Invited · expires …`, or `Invite
 * expired` with ONE send-again control that mints a NEW invite, never a
 * resurrected token.
 */

const TIER_LABEL: Record<string, string> = {
  coordinator: 'Coordinator',
  family: 'Family',
  care_circle: 'Care circle',
};

function header() {
  return <PageHeader title="People & roles" />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading the people is taking longer than usual. Nothing has been lost — '
          : "We couldn't load the people just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

/** Every marker the submit routes emit is READ and rendered (R5/F-7). */
function noticeFor(sp: Record<string, string | string[] | undefined>) {
  const e = typeof sp.e === 'string' ? sp.e : null;
  if (e === 'slow') {
    return { kind: 'alert' as const, text: 'That took too long to confirm. Check the list before trying again — nothing is lost.' };
  }
  if (e === 'refused') return { kind: 'alert' as const, text: "That couldn't be done just now." };
  return null;
}

function subjectLines(row: PersonRow, subjectName: (id: string) => string): string[] {
  if (!row.levels) return [];
  return Object.entries(row.levels)
    .map(([sid, levels]) => {
      const line = plainLine(levels);
      return line ? `${subjectName(sid)}: ${line}` : '';
    })
    .filter(Boolean);
}

export default async function PeoplePage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle } = await params;
  const sp = (await searchParams) ?? {};
  const next = `/${circle}/people`;
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
      let me: Awaited<ReturnType<typeof myMembership>>;
      try {
        [rows, me] = await Promise.all([
          budget.race(circlePeople(claims, circle), 'circlePeople'),
          budget.race(myMembership(claims, circle), 'myMembership'),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`people: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }

      const coordinator = me?.tier === 'coordinator';
      const notice = noticeFor(sp);
      const subjects = rows.filter((r) => r.kind === 'subject');
      const members = rows.filter((r) => r.kind === 'member');
      const invites = rows.filter((r) => r.kind === 'invite');
      const names = new Map(subjects.map((s) => [s.subject_id as string, s.display_name]));
      const subjectName = (id: string) => names.get(id) ?? 'this record';

      return (
        <>
          {header()}
          {notice ? (
            <p className="field-help" role={notice.kind}>
              {notice.text}
            </p>
          ) : null}

          <p className="meta">
            These lines say what each person can see in the record — what they can read, search
            and find in the log. Being notified about changes isn&apos;t built yet, so no line
            here promises it.
          </p>

          {/* 7D · R4/F-4: §4.6.5's printable record had exactly one rendered
              link in the whole app, on the subject page, whose only path in
              was a receipt for an approved profile fact. The surface that is
              ABOUT access is where a person looks for what was done with it. */}
          <p className="meta">
            <a className="action-link" href={`/${circle}/people/log`}>
              Everything done with the record
            </a>
          </p>

          <section className="record-section" aria-labelledby="the-people">
            <h2 id="the-people">Everyone in the circle</h2>
            {subjects.map((s) => (
              <Card key={s.member_id ?? s.display_name}>
                <p>
                  {/* 7D · R4/F-4: the subject's own page — where the §7.5
                      custodianship declaration is shown — was reachable only
                      through a receipt for an approved profile fact. The
                      person it is about is the obvious door. */}
                  {s.subject_id ? (
                    <a className="action-link" href={`/${circle}/people/subject/${s.subject_id}`}>
                      <strong>{s.display_name}</strong>
                    </a>
                  ) : (
                    <strong>{s.display_name}</strong>
                  )}{' '}
                  — holds the highest access to their own record, with no account attached ·
                  custodian: {s.custodian_name ?? 'named at setup'}
                </p>
                {subjectLines(s, subjectName).map((line) => (
                  <p key={line} className="meta">
                    {line}
                  </p>
                ))}
              </Card>
            ))}
            {members.map((m) => (
              <Card key={m.member_id ?? m.display_name}>
                <p>
                  <strong>{m.display_name}</strong> · {TIER_LABEL[m.tier] ?? m.tier}
                  {m.slice ? ` · ${m.slice}` : ''}
                </p>
                {subjectLines(m, subjectName).map((line) => (
                  <p key={line} className="meta">
                    {line}
                  </p>
                ))}
                {coordinator && m.member_id ? (
                  <p className="meta">
                    <a className="action-link" href={`/${circle}/people/${m.member_id}`}>
                      Adjust what they can see
                    </a>
                  </p>
                ) : null}
              </Card>
            ))}
          </section>

          {invites.length > 0 ? (
            <section className="record-section" aria-labelledby="invited">
              <h2 id="invited">Invited</h2>
              {invites.map((i) => (
                <Card key={i.invite_id ?? i.display_name}>
                  <p>
                    <strong>{i.display_name}</strong> · {TIER_LABEL[i.tier] ?? i.tier}
                  </p>
                  {i.invite_status === 'pending' && i.invite_expires_at ? (
                    <p className="meta">
                      Invited · expires {formatShortDate(i.invite_expires_at.slice(0, 10))}
                    </p>
                  ) : (
                    <form
                      method="post"
                      action={`/${circle}/people/invites/${i.invite_id}/again/submit`}
                    >
                      <p className="meta">Invite expired</p>
                      <Button type="submit" variant="secondary">
                        Send again
                      </Button>
                    </form>
                  )}
                </Card>
              ))}
            </section>
          ) : null}
        </>
      );
    },
    () => loadFailed(next, true),
  );
}
