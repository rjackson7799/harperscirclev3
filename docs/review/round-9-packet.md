# Third-party review packet — round 9: the built 2A auth machinery

**Requesting review of:** slice increment `2A — auth machinery` (the DB
half of slice 2, Auth + onboarding), built on branch
`slice/2-auth-onboarding` (base `main` @ `4e4bbca`, slice 1 complete),
seven migrations `20260818120001`–`20260818120007`, seven new pgTAP files
(035–041, +191 assertions: suite 913 → 1104), four new two-session cases (26–29, +6
assertions, 50/50), ADR-0011 (owner ruling: forwarding local part),
ADR-0012 (design deltas + the flagged questions), coverage rows
RLS-09 · SND-02 · FRZ-16a · AUT-01/02 · STP-01/02 · IVT-01/02/03 ·
GRT-01/02 · WMN-01 · NTC-01 green, APR-06 amended, FRZ-16b split out
pending, and the slice-2 plan (`docs/review/slice-2-plan.md`) with the
owner-ruled 2A/2B split.

**Authority order:** master plan → TSD §5.5–§5.11, §2.3, §1.2 as amended
by annexes A1–A7 → ADR-0001–0012 → Appendix A + `docs/coverage.md`
(authoritative per assertion; pending never green).

**Review style requested:** as rounds 6–8 — decision-completeness over
mechanism rework. Every open call the spec left is in ADR-0012 with its
recommended answer; every staged surface has a pending coverage row; the
pointed questions below carry recommended answers.

**Process fixes carried forward (dispositioned, kept):** the head ledger
appears from the start (E2); verification evidence is recorded at ONE
final SHA with complete summary lines (E1/E3 — CI retains full test
output as artifacts); pointed questions carry recommended answers.

---

## What 2A is

The §5.5–§5.11 security machinery over the 1A–1D kernel, database half
only (the app scaffold, both doors, Account and the E2E walkthrough are
2B, per the owner-ruled split):

- **§5.6 throttling-not-lockout** (M1): an existence-blind attempt
  ledger keyed on `hc.contact_key`, progressive delays boxed at 15
  minutes, success-class events clearing instantly, AC-AUTH-12 as a
  property test — including under two-session contention. Sign-in runs
  as anon, so anon gained USAGE on `hc` here (EXECUTE stays
  per-function; PIN-01 unmoved).
- **§5.7 step-up** (M2): the verbatim table; minting only on a FRESH
  session (claims-level amr proof; the strongest-factor clause is
  app-enforced because auth is ungrantable — ADR-0012 D3); consumption
  operation+target+account-bound and single-use by atomic conditional
  UPDATE. Annex A3's interim guard in `approve_proposal` is retired by
  real validation; `share_object`'s 3-arg overload is GONE (sharing is
  on §5.7's required list).
- **§5.10 invites** (M3): issuance (AC-AUTH-4 in-function off a
  postgres-owned `email_confirmed_at` mirror — the ungrantable-auth
  trap, D4), revocation, and the ONE-transaction conditional-UPDATE
  acceptance under the R-rule lock: replay aborts creating nothing
  (RLS-09), address-bound case-blind AFTER the claim (AC-AUTH-11's DB
  half), §7.4 tier defaults EXACT from `hc.tier_defaults()` — the
  AC-AUTH-8 anchor 2B snapshots against. Removed members REACTIVATE
  their original row (D6). FRZ-16's invite legs, both directions, with
  the racing halves proven.
- **§5.8 revocation writers** (M4/M7): `set_grant` (raise token-gated
  and freeze-refused; lower never gated; hidden = row deletion; the
  care ceiling structural; AC-PERM-5 both-levels log) and
  `remove_member` (grants deleted, shares revoked unless explicitly
  kept, open tasks unassigned per PRD §8.8, last coordinator
  irremovable, account id returned for the 2B session kill). The RAC-02
  transitions now have their real writers.
- **§5.11 "this wasn't me"** (M5) + the **§5.9 split** (M5/M7): the
  non-enumerating notice path whose plaintext token exists ONLY in the
  request-path-unreadable mail queue; single-use 15-minute execution;
  `outbound_mail` with the class COLUMN; revocation notices
  (access_changed / membership_removed) content-free by pinned key set.
  Delivery is slice 11's.
- **SND-02 sender surfaces** (M6): coordinator-only acceptance releasing
  held mail through the REAL machinery (minted gate lease, the one
  appended CAS edge, outbox re-queue — the FRZ-15 posture), immediate
  revocation, and the §5.4 30-day expiry (sweeper-pattern, skipping
  frozen / accepted-meanwhile / no-evidence arrivals).

## Migration map (7 of the ≤ 8 plan bound; M8 stays the review reserve)

| # | File | Contents |
|---|---|---|
| M1 | `120001_auth_attempts` | ledger + `hc.auth_throttle` / `hc.record_auth_attempt`; anon USAGE on hc |
| M2 | `120002_step_up_tokens` | §5.7 verbatim table + mint/consume; approve_proposal guard→validation; share_object 4-arg |
| M3 | `120003_invites_lifecycle` | email mirror triggers + `accounts.email_verified_at`; `hc.tier_defaults`; create/revoke/accept invite; FRZ-16 invite legs |
| M4 | `120004_grants_revocation` | `hc.set_grant` / `hc.remove_member` under the R-rule; 3 new log events |
| M5 | `120005_wasnt_me` | `accounts.email` joins the mirror; `outbound_mail` (§5.9 class column); `security_events`; note/execute |
| M6 | `120006_sender_surfaces` | accept/revoke sender + held release (CAS edge appended, ING-10 re-pinned) + `hc.expire_held_mail` |
| M7 | `120007_security_notices` | set_grant/remove_member re-created verbatim + the §5.9 enqueue legs |

## Red→green history (each red commit names its failure signatures)

`f341193` docs: plan + ADR-0011 (owner rulings recorded before M1) →
`7dd3603`/`f836d43` M1 red/green (946/946) →
`31f3870`/`9aed5db` M2 (980/980) →
`90cc9e7`/`05e8419` M3 (1017/1017) →
`fbe1833`/`342bf71` M4 (1051/1051) →
`80ba7eb`/`c5052a2` M5 (1072/1072) →
`be9aed3`/`cd6f151` M6 (1096/1096) →
`350249d`/`987d2cd` M7 (1104/1104) →
`5ea6e89` concurrency 26–29 (50/50) →
`6cc0dc7` docs: coverage + ADR-0012.

Every green commit carries its same-commit catalog re-pins (002's
inventories at 46 definers / 86 policies by the end; 001's event count
18 and the anon-USAGE flip; 007's freeze-reference inventory at 9;
027's transition allowlist +1). The catalog pins fired on EVERY
addition, by design — nothing grew silently.

## Defects found and handled red→green inside the slice

1. **anon could not resolve `hc`** (M1 first green run): schema USAGE
   had never been granted to anon — nothing anon-callable existed
   before. Granted in M1 with the 001 pin flipped and annotated; the
   denial surfaced as a schema ACL error, not the segfaulting
   function-ACL path (PLT-04 discipline held).
2. **Case-29 expectation wrong about designed semantics** (concurrency
   round 1: `wins=2 refusals=0`): the second racer is ABSORBED by
   set_grant's same-level no-op — nothing rises, no token demanded, the
   token was still consumed exactly once and one grant_changed landed.
   The case was re-pinned to the true contract and the question flagged
   (ADR-0012 Q4, recommended: accept).
3. **Test-authoring errors caught by their own runs** (invites expiry
   fixture violating `invites_check`; two closed-table subqueries
   running as the probe role; two plan-count miscounts): each fixed in
   the red→green loop before its unit's green commit; none reached a
   green claim.

## Verification evidence (local, ONE final SHA)

At `6cc0dc7` (the final head, docs included), clean leg, in order:

```
npm run db:reset                      → Finished supabase db reset
node scripts/verify-migration-state.mjs
                                      → migration state exact: 45 applied == supabase/migrations
npm run test:db                       → Files=42, Tests=1104 — All tests successful. Result: PASS
npm run db:verify                     → No schema errors found        (hard gate, --fail-on warning)
npm run test:concurrency              → 50/50 concurrency assertions passed   (29 cases; output teed)
npm run lint                          → clean
```

The upgrade rehearsal (worktree at merge-base `4e4bbca` → base reset →
exact-list → `supabase migration up` (the seven 2A migrations) →
exact-list → both suites) runs in CI on every push per UPG-02; see the
auditability block.

## Pointed questions for round 9 (recommended answers inline; long-form in ADR-0012)

**Q1 — Freeze vs outstanding invites: suspend or void?** TSD §2.3 says
suspends; PRD §7.5 says voided. Built as SUSPEND (both invite legs
refuse `freeze_active` while any freeze is open or unresolved; dismissal
restores). *Recommended: keep suspend; if voided is preferred it is one
appended statement in `request_freeze` plus a PRD wording note.*

**Q2 — The wasnt-me 15-minute expiry.** §5.11 verbatim, built as
written; a link read an hour after the incident is dead with no
re-request flow. *Recommended: keep — the kill-switch semantics justify
it; the notice copy (slice 11) says so plainly, and a fresh incident
re-mints.*

**Q3 — Sender-acceptance authority.** Built coordinator-only (§5.3 is
silent). *Recommended: keep for 2A; widen with the inbox surface if the
UX demands it — one predicate.*

**Q4 — set_grant's same-level no-op absorbs the §5.7 race** (concurrency
case 29): the second racer returns `changed:false` without token
validation — nothing rises, nothing logs. *Recommended: accept;
validating on the no-op would burn tokens on idempotent retries for no
security gain.*

**Q5 — Held-mail release attempts are not gate-budget-bounded**
(member-actioned, behind coordinator authority + the freeze gate).
*Recommended: accept; bound by the gate budget in the release loop if
abuse appears — one comparison.*

**Q6 — §5.7 target-binding granularity for raises** built as
`member:subject:domain` (one token per domain change; a fresh session
can mint several). *Recommended: accept — the §4.6.3 unit of change is
per-subject per-domain, and coarser binding would let one token widen
several domains.*

## Files

- Migrations: `supabase/migrations/20260818120001`–`120007_*.sql`
- Tests: `supabase/tests/035_auth_attempts.sql` (33) ·
  `036_step_up.sql` (34) · `037_invites_lifecycle.sql` (37) ·
  `038_grants_revocation.sql` (34) · `039_wasnt_me.sql` (21) ·
  `040_sender_surfaces.sql` (24) · `041_security_notices.sql` (8)
- Concurrency: `scripts/concurrency/run.mjs` cases 26–29 (+ helpers,
  + the invites cleanup the harness predated)
- Re-pinned in place: 001, 002, 007, 015, 018, 027 (each in the green
  commit that moved it)
- Docs: `docs/adr/0011-forwarding-address-local-part.md` (Accepted —
  owner ruling) · `docs/adr/0012-2a-auth-machinery-deltas.md`
  (Proposed — this round's dispositions land here) ·
  `docs/coverage.md` (flips + the 2A section) ·
  `docs/review/slice-2-plan.md`

## Addendum — auditability block (head ledger from the start)

| Purpose | SHA | Tree relationship | CI status |
|---|---|---|---|
| Base | `4e4bbca` | `main` (slice 1 complete; ADR-0009/0010 accepted-merged) | green (run 32094791299 at the merge; ECR-quota retries recorded) |
| Owner rulings | `f341193` | plan + ADR-0011, docs-only | covered by the final-head run (same SQL tree lineage) |
| Green build head | `5ea6e89` | the 14 red→green unit commits + the concurrency commit, after the rulings | idem |
| Docs head | `6cc0dc7` | coverage + ADR-0012, docs-only | push run recorded below |
| Round-9 packet head | *(this commit)* | this file, docs-only | its own push run confirmable via the public API |

- **Local evidence:** at `6cc0dc7`'s tree, quoted verbatim above (one
  SHA, complete summary lines).
- **PR:** to be opened by the owner, base `main` @ `4e4bbca`,
  **DO NOT MERGE** banner in the description — third-party round 9 →
  dispositions ADR → owner sign-off → merge commit (never squash), each
  in its own fresh session.
- **Pins:** Supabase CLI 2.100.1; image
  `public.ecr.aws/supabase/postgres:17.6.1.106`; Node 22.15.0 / npm
  10.9.2; pg 8.16.3 — no drift this slice.
- **Commands per leg:** `npm run db:reset` ·
  `node scripts/verify-migration-state.mjs` · `npm run test:db` ·
  `npm run test:concurrency` (teed) · `npm run db:verify` · upgrade leg
  per `ci.yml`.
- **CI at the final head:** push run **32106060931** @ `6cc0dc7` —
  conclusion **success** (secret scan, containment, schema pin,
  clean reset, exact-state verifier, pgTAP, concurrency, db:verify hard
  gate, the full upgrade rehearsal, lint, typecheck; full test output
  retained as artifacts). A "Start local Postgres"
  `toomanyrequests` failure is the recorded ECR Public anonymous pull
  quota — re-run material, never a repo defect. This record lands as a
  docs-only commit on `6cc0dc7`; the SQL tree is unchanged by it.

---

## ADDENDUM (2026-08-17) — round-9 findings received: recommendation superseded

The third-party round-9 review returned **three blocking findings**
(`docs/review/round-9-findings.md`, verbatim): F1 critical — request roles
could assert success-class throttle outcomes for any identifier; F2 high —
`accept_sender` evaluated predicates and wrote before the R-rule lock
(and the same class was then found in `set_grant`/`remove_member` by this
session's audit); F3 high — "this wasn't me" consumption was not atomic
with its security effect. **This packet's acceptance recommendation is
superseded: the verdict is forward-fix, and the fixes are applied.**

Dispositions: **ADR-0013** (all three accepted; F1 via identity-bound
success recording; F2 extended to the writer class; F3 as the reviewer
proposed; two argued declines recorded for round 10). Applied the
ADR-0006 way on this branch:

| Commit | What |
|---|---|
| `e371326` | findings verbatim (docs-only) |
| `1bebc9c` | RED — 042 new (22), 035 rewritten (39), 039 +2, 002 re-pins, cases 28 (rewritten) / 30 / 31 / 32; every failure signature in the message, including the live breaches (`senders=1 logs=1` past a freeze; a removed member re-granted, token consumed) |
| `c995a99` | GREEN — migration `20260818120008_round9_fixes.sql` (**M8, the reserve — the ≤ 8 bound is now met exactly**) |

Evidence at the new SQL/test head **`c995a99`** (docs-only commits
follow): clean-leg reset 46 exact · pgTAP **1134/1134 across 43 files** ·
concurrency **55/55 across 32 cases** · `db:verify` clean under
`--fail-on warning`. CI at the pushed head: recorded below when the
push-event run completes.

Deployability caveat, as the review directed (recorded in ADR-0013 and
coverage AUT-01): the throttle and "wasn't me" RPCs are not publicly
usable until 2B lands the app boundary that routes every
password-verification path through them — PIN-01 keeps `hc` off the API
surface meanwhile, and GoTrue's own rate limits stay on as the backstop.
