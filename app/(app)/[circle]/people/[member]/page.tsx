import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { asUser } from '@/lib/db/user';
import { gatePage } from '@/lib/auth/gate';
import { withPageBudget } from '@/lib/http/page-budget';
import {
  circlePeople,
  contributionFor,
  sharesForMember,
  type Contribution,
  type MemberShareRow,
  type PersonRow,
} from '@/lib/hc/people';
import { myMembership } from '@/lib/hc/tasks';
import {
  DOMAINS,
  DOMAIN_LABEL,
  GRANT_LEVELS,
  LEVEL_RANK,
  LEVEL_WORD,
  isDomain,
  isGrantLevel,
  type GrantLevel,
} from '@/lib/permissions/phrases';
import { TIERS, type Domain } from '@/lib/permissions/tiers';
import { STEP_UP_COOKIE, STEP_UP_FOR_COOKIE, stepUpConfirms } from '@/lib/auth/step-up-cookie';
import { SessionUnavailable } from '@/components/ui/SessionUnavailable';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { formatShortDate } from '@/lib/format/dates';

/**
 * /[circle]/people/[member] — adjust, revoke, and the honest limit (PRD
 * §4.6.3, §4.6.4; 7C C4; PPL-02/03/05's app halves; AC-PERM-5, AC-PPL-4/6).
 *
 * THE MATRIX LIVES HERE, behind the adjust action (the People list shows
 * the plain line first — AC-PPL-2). Per subject, per domain: lowering
 * posts straight through; RAISING goes through the §5.7 step-up bound to
 * `member:subject:domain`, consumed by hc.set_grant in its own
 * transaction. The care-circle ceiling is shown AS a ceiling: nothing
 * above hc.tier_defaults('care_circle') is offered, no other domain is
 * offered at all, and the DB refuses regardless.
 *
 * REVOKE rides the EXISTING remove route, with the coordinator's
 * keep-share option — and the one honest limit in those words, at the
 * moment of revocation: a file already downloaded to someone's device
 * cannot be recalled. The channels this slice does not reach are NAMED.
 *
 * CONTRIBUTION is plain counts and lists — no chart, no bar, no
 * percentage anywhere on this surface (AC-PPL-6).
 *
 * A coordinator's surface: any other caller's hand-built URL is the one
 * 404 (the nav's hiding is a courtesy; this refusal is the page's own).
 */

// 7D · R3/F-7: DOMAINS and the level ladder are the phrase module's, not a
// third copy of them here. The offer, the ceiling arithmetic and the write
// path all read one list, pinned live against hc.domain and hc.access_level.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The §5.7 operation this page's step-up is bound to (7D · R2/F-3). */
const RAISE_OPERATION = 'raise_grant';

function header(name?: string) {
  return <PageHeader title={name ?? 'A member'} />;
}

function loadFailed(next: string, slow: boolean) {
  return (
    <>
      {header()}
      <p className="field-help" role="alert">
        {slow
          ? 'Loading this person is taking longer than usual. Nothing has been lost — '
          : "We couldn't load this person just now. Nothing has been lost — "}
        <a href={next}>try again</a> in a moment.
      </p>
    </>
  );
}

/** Every marker the submit routes emit is READ and rendered (R5/F-7). */
function noticeFor(sp: Record<string, string | string[] | undefined>) {
  const e = typeof sp.e === 'string' ? sp.e : null;
  if (e === 'slow') {
    return { kind: 'alert' as const, text: 'That took too long to confirm. Check the levels before trying again — nothing is lost.' };
  }
  if (e === 'refused') return { kind: 'alert' as const, text: "That change couldn't be made just now." };
  if (e === 'step-up') return { kind: 'alert' as const, text: 'Raising access needs a fresh confirmation that it is you. Confirm below.' };
  if (sp.changed === '1') return { kind: 'status' as const, text: "Changed. It's written in the family's log, with both levels." };
  // 7D · R3/F-1: the no-op has its own marker and its own words. It is not a
  // failure and not a change — hc.set_grant wrote nothing, so nothing is
  // claimed about the log.
  if (sp.unchanged === '1') {
    return {
      kind: 'status' as const,
      text: 'No change — that was already the level. Nothing was written.',
    };
  }
  return null;
}

const LEVEL_OPTION_WORD: Record<string, string> = { ...LEVEL_WORD, hidden: 'Nothing' };

export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ circle: string; member: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { circle, member: memberId } = await params;
  const sp = (await searchParams) ?? {};
  const next = `/${circle}/people/${memberId}`;
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
      let shares: MemberShareRow[];
      let contribution: Contribution;
      try {
        [rows, me, shares, contribution] = await Promise.all([
          budget.race(circlePeople(claims, circle), 'circlePeople'),
          budget.race(myMembership(claims, circle), 'myMembership'),
          budget.race(sharesForMember(claims, memberId), 'sharesForMember'),
          budget.race(contributionFor(claims, circle, memberId), 'contributionFor'),
        ]);
      } catch (err) {
        if ((err as Error).name === 'AnswerBudgetExceeded') throw err;
        console.error(`member: read failed: ${(err as Error).message}`);
        return loadFailed(next, false);
      }

      const person = rows.find((r) => r.kind === 'member' && r.member_id === memberId);
      // A coordinator's surface: everyone else's hand-built URL, an unknown
      // member and a subject row are ONE 404.
      if (!person || me?.tier !== 'coordinator') notFound();

      const subjects = rows.filter((r) => r.kind === 'subject');
      const notice = noticeFor(sp);
      const removing = sp.remove === '1';
      const jar = await cookies();
      // THREE params, never a colon-joined triple: safeNext refuses any ':'
      // in a next as scheme-shaped, so the step-up round-trip dropped the
      // raise entirely (gate r3: the founder landed on /account).
      //
      // 7D · R3/F-3: `rs` was the one raise param with neither set- nor
      // shape-validation, and it was concatenated RAW into the posted next.
      // A crafted same-origin link could therefore append `&changed=1` and
      // make this page render "Changed. It's written in the family's log"
      // the instant the coordinator proved her identity — nothing changed,
      // nothing logged. It never widened anything (the route's UUID_RE and
      // consume_step_up's exact match both refuse); it lied, on the surface
      // that exists to tell the truth about access. Shape-checked here, and
      // COMPOSED below so no value can carry a separator at all.
      const raiseSubject = typeof sp.rs === 'string' && UUID_RE.test(sp.rs) ? sp.rs : null;
      const raiseDomain = typeof sp.rd === 'string' && isDomain(sp.rd) ? sp.rd : null;
      const raiseLevel = typeof sp.rl === 'string' && isGrantLevel(sp.rl) ? sp.rl : null;
      const raise =
        raiseSubject && raiseDomain && raiseLevel
          ? new URLSearchParams({
              rs: raiseSubject,
              rd: raiseDomain,
              rl: raiseLevel,
            }).toString()
          : null;
      // 7D · R2/F-3: PRESENCE is not confirmation. One cookie name held
      // whatever was minted last, so a token for a SHARE rendered "Raise it"
      // here with no password — and the click dead-ended on a definer that
      // matches operation AND target_ref exactly. Same two questions, asked
      // before anything is offered.
      const stepUp =
        raiseSubject &&
        raiseDomain &&
        stepUpConfirms(
          jar.get(STEP_UP_FOR_COOKIE)?.value,
          RAISE_OPERATION,
          `${memberId}:${raiseSubject}:${raiseDomain}`,
        )
          ? (jar.get(STEP_UP_COOKIE)?.value ?? null)
          : null;

      // The care-circle ceiling, from the ONE tiers module: only its
      // domains are offered, and nothing above its level.
      const ceiling =
        person.tier === 'care_circle'
          ? new Map(TIERS.care_circle.defaultGrants.map((g) => [g.domain, g.level]))
          : null;
      const offeredDomains = ceiling ? DOMAINS.filter((d) => ceiling.has(d)) : DOMAINS;
      const optionsFor = (d: Domain): readonly GrantLevel[] =>
        GRANT_LEVELS.filter((l) =>
          ceiling ? LEVEL_RANK[l] <= LEVEL_RANK[ceiling.get(d) ?? 'hidden'] : true,
        );

      return (
        <>
          {header(person.display_name)}
          {notice ? (
            <p className="field-help" role={notice.kind}>
              {notice.text}
            </p>
          ) : null}

          <Card>
            <p>
              <strong>{person.display_name}</strong>
              {person.slice ? ` · ${person.slice}` : ''}
            </p>
            {ceiling ? (
              <p className="meta">
                This is a ceiling, not a starting point: {TIERS.care_circle.ceiling({ person: 'they', subjectNames: subjects.map((s) => s.display_name) })}
              </p>
            ) : null}
          </Card>

          {raise && raiseSubject && raiseDomain && raiseLevel ? (
            <section className="record-section" aria-labelledby="confirm-raise">
              <h2 id="confirm-raise">Raise access</h2>
              {stepUp ? (
                <form method="post" action={`${next}/grant/submit`}>
                  <p>
                    This raises what {person.display_name} can see. It takes effect at once and
                    it&apos;s written in the family&apos;s log, with both levels.
                  </p>
                  <input type="hidden" name="subject_id" value={raiseSubject} />
                  <input type="hidden" name="domain" value={raiseDomain} />
                  <input type="hidden" name="level" value={raiseLevel} />
                  <Button type="submit">Raise it</Button>
                </form>
              ) : (
                <form method="post" action="/account/step-up/submit">
                  <p className="field-help">Raising access needs a fresh confirmation that it&apos;s you.</p>
                  <input type="hidden" name="operation" value={RAISE_OPERATION} />
                  <input type="hidden" name="target_ref" value={`${memberId}:${raiseSubject}:${raiseDomain}`} />
                  <input type="hidden" name="next" value={`${next}?${raise}`} />
                  <Field label="Your password">
                    <Input type="password" name="password" required />
                  </Field>
                  <Button type="submit">Confirm it&apos;s you</Button>
                </form>
              )}
            </section>
          ) : null}

          <section className="record-section" aria-labelledby="adjust">
            <h2 id="adjust">What {person.display_name} can see</h2>
            {subjects.map((s) => {
              // 7D · R3/F-4 + R4/F-5: null is NOT hidden. hc.circle_people
              // returns a NULL inner map when this subject's levels are not
              // the caller's to know — what a freeze emits — and rendering
              // that as five *Nothing* radios states a false fact about
              // access on the surface whose job is stating access, then
              // invites a change that would be classified as a raise. There
              // is nothing to offer here, so nothing is offered, and the
              // page says which of the two it means.
              const held = person.levels?.[s.subject_id ?? ''];
              return (
              <Card key={s.member_id ?? s.subject_id ?? s.display_name}>
                <p>
                  <strong>{s.display_name}</strong>
                </p>
                {held == null ? (
                  <p className="meta">
                    What {person.display_name} can see of {s.display_name}&apos;s record
                    isn&apos;t shown here — this page can&apos;t say right now, which is not
                    the same as nothing. Nothing about it can be changed from here.
                  </p>
                ) : offeredDomains.map((d) => {
                  const current = held[d] ?? 'hidden';
                  return (
                    <form key={d} method="post" action={`${next}/grant/submit`}>
                      <input type="hidden" name="subject_id" value={s.subject_id ?? ''} />
                      <input type="hidden" name="domain" value={d} />
                      <Field label={DOMAIN_LABEL[d]}>
                        <div className="choice-list">
                          {optionsFor(d).map((l) => (
                            <label key={l}>
                              <input
                                type="radio"
                                name="level"
                                value={l}
                                defaultChecked={l === current}
                              />
                              <span>{LEVEL_OPTION_WORD[l]}</span>
                            </label>
                          ))}
                        </div>
                      </Field>
                      <Button type="submit" variant="secondary">
                        Change
                      </Button>
                    </form>
                  );
                })}
              </Card>
              );
            })}
          </section>

          <section className="record-section" aria-labelledby="contribution">
            <h2 id="contribution">Contribution</h2>
            {contribution.owns_now.length > 0 ? (
              <>
                <p className="meta">Owns now:</p>
                <ul>
                  {contribution.owns_now.map((t) => (
                    <li key={t.id}>
                      <a className="action-link" href={`/${circle}/tasks/${t.id}`}>
                        {t.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="meta">Owns nothing right now.</p>
            )}
            <p className="meta">Completed: {contribution.completed_count}</p>
            <p className="meta">
              {contribution.last_active
                ? `Last active: ${formatShortDate(contribution.last_active.slice(0, 10))}`
                : "Hasn't been active yet."}
            </p>
          </section>

          <section className="record-section" aria-labelledby="remove">
            <h2 id="remove">Remove from the circle</h2>
            {removing ? (
              <form method="post" action={`/${circle}/members/${memberId}/remove`}>
                <p>
                  Removing {person.display_name} ends their sessions now; new reads are refused
                  at once; what was shared with them is withdrawn unless you keep it below. One
                  honest limit: a file already downloaded to someone&apos;s device cannot be
                  recalled.
                </p>
                <p className="meta">
                  Not reached here, said plainly: background jobs re-check access when they run,
                  and the notification and export channels don&apos;t exist yet — their own
                  slices close them.
                </p>
                {shares.length > 0 ? (
                  <>
                    <span className="field-label">Keep anything that was shared with them?</span>
                    <div className="choice-list">
                      {shares.map((s) => (
                        <label key={s.share_id}>
                          <input type="checkbox" name="keep_share_ids" value={s.share_id} />{' '}
                          {s.visible && s.label ? s.label : `A ${s.object_type} you can't see`}
                        </label>
                      ))}
                    </div>
                  </>
                ) : null}
                <Button type="submit">Remove {person.display_name}</Button>
              </form>
            ) : (
              <p className="meta">
                <a className="action-link" href={`${next}?remove=1`}>
                  Remove {person.display_name} from the circle
                </a>
              </p>
            )}
          </section>

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
