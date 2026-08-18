# ADR-0012 — 2A auth machinery: design deltas and flagged questions

**Status:** Proposed — enters round-9 review with the 2A packet
**Date:** 2026-08-18
**Scope:** slice 2A (`slice/2-auth-onboarding`, migrations
`20260818120001`–`20260818120007`), implementing TSD §5.5–§5.11 as bound by
§11.1 row 2, ADR-0006 (R-rule, forward-fix), ADR-0009 D4 / ADR-0010
(call-time-validation discipline), ADR-0011 (forwarding local part).
The 1B–1D precedent: an ADR per increment recording where the build made a
call the spec left open, plus the pointed questions the reviewer should
answer. TSD text does not move — annex A3 already anticipated the one
normative change ("§5.7 replaces this guard with real validation").

## Decisions

**D1 — Freeze suspends invites; PRD "voided" read as suspension.**
TSD §2.3 says a freeze *suspends* exports/deletions/invites at circle
level; PRD §7.5's table says outstanding invites are *voided*. Built as
SUSPEND: `create_invite` and `accept_invite` refuse with the named
`freeze_active` under any open or unresolved freeze (however narrowed —
PRD §7.5's unresolved state lists "no invites" unconditionally), and a
dismissal restores acceptability with no further machinery. Suspension is
reversible, matches the TSD's word, and "dismissed ⇒ full access
restored" reads better with intact invites than with destroyed ones.
Coverage FRZ-16 split per-assertion: FRZ-16a (invites, green) /
FRZ-16b (exports+deletions, pending their slices).

**D2 — The §5.7 enumeration and target-binding conventions.**
`step_up_tokens.operation` is CHECK-bound to the §5.7 list **plus
`approve_proposal`** — §3.7's signature has carried `p_step_up_token`
since 1B, and A3 directs real validation to replace the interim refusal:
what a client presents is verified and consumed, never ignored; a null
token still approves because approval is not on §5.7's required list.
Target-binding conventions, one per operation shape:
`share_object` → `type:uuid` · `raise_grant` → `member:subject:domain`
(the §4.6.3 unit of change) · `approve_proposal` → the proposal uuid.
`share_object`'s 3-arg overload is DROPPED (sharing IS on the required
list; no path shares without step-up); DEF-05's overload pin moved with
it, and the A4 single-snapshot exception is unchanged.

**D3 — Step-up freshness is claims-level; strongest-factor is
app-enforced.** Minting demands the JWT's newest `amr` timestamp within
300 s and records `aal` verbatim as §5.7's audit column. "The strongest
factor the account has enrolled" cannot be checked in-database:
enrollment lives in `auth.mfa_factors` and the auth schema is ungrantable
from migrations on this image (the recorded 1A trap). The app layer
(2B) re-authenticates with the strongest enrolled factor before minting;
the database holds the freshness proof and the audit trail.

**D4 — The email mirror.** `accounts.email_verified_at` (M3) and
`accounts.email` (M5) mirror `auth.users` via two postgres-owned
SECURITY DEFINER trigger functions (the documented handle-new-user
pattern; postgres can read auth, hc_internal cannot). The mirror columns
are writable by nothing request-path and not by hc_internal. AC-AUTH-4
is enforced in-function against the mirror; verification flow-through is
live (037:4 pins it).

**D5 — Tier defaults as one relation; hidden is absence.**
`hc.tier_defaults(tier)` is PRD §7.4 verbatim (family: memories/health/
schedule summary + documents log; care: schedule summary; coordinator:
manage×5). A hidden domain is **no row** — the representation
`grant_vectors` already treats as hidden, and the same convention
`set_grant` keeps (lowering to hidden deletes the row). This function is
the single source AC-AUTH-8's `lib/permissions/tiers.ts` (2B) snapshots
against.

**D6 — Removed members reactivate their original row.**
`circle_members` carries an unconditional `unique(circle_id,
account_id)` (1A). Acceptance by a REMOVED member therefore reactivates
the original member row (tier from the new invite, removal marks
cleared) rather than inserting a second — which is also the N2-correct
outcome: the same actor id keeps naming the same person across their
removal and return. A LIVE member's acceptance refuses.

**D7 — The care ceiling is structural in `set_grant`.** A care-circle
member's level can never exceed `tier_defaults('care_circle')` for the
domain, even against a valid step-up token. Lowering below the default
stays a coordinator's ordinary authority. Raises refuse under any freeze
(PRD §7.5 "no new grants", named `freeze_active`); lowers always execute
— an upheld finding is executed *by* lowering.

**D8 — `remove_member` mechanics.** Strict keep-list (every named id
must be the member's live share or the whole call refuses — an explicit
decision, not a guess); the last live coordinator is irremovable
(PRD §12.7: transfer first, checked under the lock); open tasks
unassign with the former holder recorded in per-task `task_unassigned`
entries at the same timestamp as `member_removed` (PRD §8.8); done
tasks keep attribution. The function returns `account_id` because the
§5.8 sessions row is the Supabase admin API, wired in 2B.

**D9 — "This wasn't me" shape.** The token is a COLUMN of its
security_event (sha256-only, unique) — event-binding is structural. The
plaintext exists in exactly one place: the queued security-class mail
payload, which nothing request-path can read; it is never returned to
the sign-in caller, who is the attacker whose failures produced the
notice. Threshold ≥ 5 recent failures, re-derived internally; cadence
one live notice per account. 15-minute expiry from mint, §5.11
verbatim (flagged below).

**D10 — Sender surfaces.** Acceptance is coordinator-only (flagged
below), refuses under any freeze (§7.5 closes interactive access), and
releases the sender's held mail in the same transaction through the
real machinery: a minted gate lease per arrival (the attempt counter
keeps counting), the one appended CAS edge
`gate: held_unknown_sender → extracting` (ING-10 re-pinned), and a
`pipeline_outbox` re-queue row for the relay (RLY-01 pending; the
sweeper's worker-owed listing is the backstop — the FRZ-15 posture).
The 30-day expiry terminalizes to `nothing_filed` with the new reason
`held_expired`, sweeper-pattern, scheduled by the RLY-01 worker
(joins `sweeper_pass`/`run_taint_sweep` in OPS-01's roster); it skips
frozen circles, accepted-meanwhile senders, and arrivals with no held
event. Release attempts consume gate attempt numbers and are not
budget-bounded (member-actioned, behind coordinator authority — noted).

**D11 — The same-level no-op absorbs the §5.7 race.** Two sessions
racing one token through the same raise serialize on the circle lock;
the second re-reads the already-raised level and returns
`changed: false` without demanding a token — nothing rises, nothing
logs, the token is consumed exactly once (concurrency case 29). Flagged
below.

**D12 — Throttle constants and reach.** Schedule 0/30/120/900 s at
counts ≤4 / 5–7 / 8–9 / ≥10 over a trailing 15-minute window cut at the
last success-class event (ordered by identity `seq`, not timestamps —
`now()` is transaction-constant, quirk 5). Keyed on `hc.contact_key`
(the FRZ-07 canonicalization). EXECUTE to anon AND authenticated: §5.7
re-auth attempts run on the same counters, or step-up becomes an
unthrottled password oracle for a stolen session. anon gained USAGE on
`hc` here — the first anon-callable surface; EXECUTE stays
per-function and PIN-01 is unmoved.

## Flagged for round 9 (each with the recommended answer)

**Q1 — Suspend vs void (D1).** Recommend: keep SUSPEND; if counsel or
the owner prefers PRD §7.5's "voided", it is one appended statement in
`request_freeze` (revoke outstanding invites at intake) plus a PRD
wording note — but dismissal-restores is the friendlier containment.

**Q2 — The wasnt-me 15-minute expiry (D9).** §5.11 is unambiguous and
is built as written, but a link read an hour after the incident is dead
with no re-request flow. Recommend: keep 15 min for the kill-switch
semantics and let the (unbuilt) notice email say so plainly; a fresh
notice re-mints on the next incident.

**Q3 — Sender-acceptance authority (D10).** Built coordinator-only.
Recommend: keep for 2A; widen to manage-on-all-taint-domains members
with the inbox surface if the UX demands it (one predicate).

**Q4 — The no-op absorption (D11).** Recommend: accept. The absorbed
call widens nothing and burns nothing; making the no-op validate a
presented token would burn tokens on idempotent retries for no security
gain.

**Q5 — Release attempts vs gate budget (D10).** Recommend: accept
unbounded member-actioned releases for 2A; if abuse appears, bound them
by the gate budget in the release loop (one comparison).

## Consequences

- Catalog pins moved with the build, same-commit, every time: 002's
  function inventory (46 definers), EXECUTE set, privilege snapshot,
  policy list (86); 001's event-type count (18) and anon-USAGE flip;
  007's freeze-reference inventory (9); 027's transition allowlist (+1).
- `outbound_mail` exists with the §5.9 class column; slice 11 builds
  delivery, templates and the send-time-authorization branch on top.
- ADM-01's step-up dependency is satisfied; the §9.3 wrappers stay the
  admin slice's.
- Coverage: RLS-09, SND-02, FRZ-16a, AUT-01/02, STP-01/02, IVT-01/02/03,
  GRT-01/02, WMN-01, NTC-01 green with refs; APR-06 amended; FRZ-16b
  split out pending.
