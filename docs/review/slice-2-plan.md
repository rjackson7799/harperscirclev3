# Slice 2 — Auth + onboarding: the slice plan

**Status:** 2A MERGED · 2B IN PROGRESS. 2A merged to main via PR #5,
merge commit `fbd1d7f` (parents `4e4bbca` + `5a365c9`; merged tree
verified identical to `5a365c9`'s), docs follow-up `6f57d89`; CI green
on main at both (runs 32114061495, 32114796686). ADR-0011/0012/0013 all
Accepted-merged. 46 migrations · pgTAP 1134/1134 across 43 files ·
concurrency 55/55 across 32 cases · db:verify clean. **The migration
reserve is SPENT (8 of ≤ 8):** 2B expects ZERO migrations; any DDL
finding forces an owner-approved bound amendment BEFORE writing it, and
shipped migrations are never edited.
**2B (app, A1–A9) is BUILT** on `slice/2b-app-onboarding` (branched from
main @ `6f57d89`, the 1A–1D pattern), with ZERO migrations as required.
Evidence at the branch head `9899fe0` (CI run **32166530483** green;
the head adds the commit-review forward fix — the recovery redirect
comes from configuration, never the request): app tests **121/121
across 18 vitest files** (new CI step; config §5.5 pins · import
fences · factory + request-role-channel contracts live · AC-AUTH-8
snapshot vs `hc.tier_defaults()` · route byte-identity incl. the
reset-poisoning refusal · founder/invitee door contracts) · the **§11.4-3 Playwright walkthrough 11/11** (local gate by
design — ADR-0014; incl. AC-PERM-3 from a live second context and
AC-AUTH-10 from a second browser) · DB legs untouched and re-proven at
the head: clean-leg reset **46 exact** · pgTAP **1134/1134 across 43
files** · concurrency **55/55 across 32 cases** (teed) · db:verify
clean · lint/typecheck/production build clean · gitleaks clean (the
demo-JWT allowlist is scoped to iss=supabase-demo). Both ADR-0013
contracts are wired (the F1 boundary across the ONLY three password
paths; the wasnt-me POST-kill + hc_pipeline sweep). Deltas, the probed
GoTrue facts, the two recorded §5.5/§4.1.2 deviations, the enumerated
maintenance boundary and the QUEUED DDL findings (none written — the
spent reserve held): **ADR-0014**; coverage rows APP-01..10 + E2E-01
(APP-09b pending on the owner's bound amendment; RLS-10 stays pending).
Round 10 at the 2B gate re-sees the round-9 dispositions, the two argued
declines, both contracts, and ADR-0014 whole.
⏸ Next: the round-10 packet → third-party review → dispositions ADR →
owner sign-off → merge — each in its own fresh session, per the gate.

**Authority:** TSD §11.1 row 2 → §5.5–§5.12, §1.2/§1.3/§1.7 → PRD
§4.0–§4.1, §4.6.3, §7.8 → design_spec (auth screens only) → binding
ADRs 0004/0006/0009/0010 → coverage.md rows RLS-09 · SND-02 · FRZ-16
(invite leg) · AC-AUTH-12.

**Branch:** `slice/2-auth-onboarding` (2A) — red→green per unit, failure
signatures in every red commit, merge commit never squash.

---

## What exists (do not rebuild) — verified against the migrations

- `public.invites` **table** (sha256-only `token_hash`, unique — INV-12;
  citext `invited_email`; `subject_ids`; 7-day expiry check; zero
  request-path privileges in 1A by design).
- `public.known_senders` + `hc.sender_recognised()` and the gate
  (SND-01 green; live-unique per circle; display names never matched).
- `public.access_grants`, `public.memberships`-equivalent
  (`circle_members`), `public.accounts` (kind anchor, `slice`,
  deletion columns), access-log family read + denial collapse
  (LOG-01/02), the R-rule (annex A4), `hc.uid()` GUC mirror.
- `hc.approve_proposal(p_step_up_token)` — **fail-closed interim
  refusal** (APR-06 / annex A3): this slice replaces the guard with
  real §5.7 validation.
- `admin_ops` EMPTY pinned (ADM-01 pending — §9.3 wrappers stay in the
  admin slice; this slice only builds the step-up machinery they will
  consume).

**Kickoff discrepancy, flagged:** the kickoff lists `hc.create_invite()`
as already built. It is **not** — no migration defines it (verified by
grep; the 1A migration header says tokens are reachable only through the
acceptance path "the auth slice"). Invite **issuance** therefore lands
here (M3), which §11.1 row 2 ("invites") covers either way. AC-AUTH-4
(no invite from an unverified account) is currently untested anywhere —
M3 owns it.

---

## 2A — the database increment

### Migration map (plan bound ≤ 8 — ADR-0006 Q8 precedent; 7 planned + 1 reserved)

| # | File (name at `supabase migration new`) | Contents | Spec |
|---|---|---|---|
| M1 | `auth_attempts` | `public.auth_attempts` + the progressive per-account throttle functions (check + record; callable pre-auth; non-enumerating — identical answer whether or not the account exists). Invariants as tests: any hard state expires ≤ 15 min; the email-reset path is never consulted against the throttle; delays escalate progressively. AC-AUTH-12 lands as a pgTAP property over the state machine. Per-network limiting is the Vercel WAF (2B/deploy concern, documented not built). | §5.6 |
| M2 | `step_up_tokens` | `public.step_up_tokens` verbatim from §5.7 + mint (post-re-auth, records the `aal` actually used) + consume (hc_internal-only; unconsumed, unexpired, operation- AND target-bound). Wires validation into the two §5.7 operations that exist after this slice: `hc.approve_proposal` (replaces the annex-A3 interim refusal) and `hc.share_object` (signature gains `p_step_up_token`, required — forward-fix via create-or-replace in this migration; the A4 single-snapshot exception is unchanged). `hc.set_grant` (M4) is born consuming it. Export / deletions / coordinator transfer / email-password change are born with the requirement in their own slices. | §5.7, A3 |
| M3 | `invites_lifecycle` | `hc.create_invite()` (coordinator-only; AC-AUTH-4 enforced in-function; 32-byte token generated in-function, returned once, stored sha256-only; logged) + `hc.revoke_invite()` (logged — PRD §4.6.5) + `hc.accept_invite()`: §5.10's one-transaction conditional UPDATE — replay updates zero rows, aborts, creates nothing (RLS-09); address-bound (citext, explicit comparison — the search_path trap); membership + tier default grants in the same transaction under the per-circle advisory lock (R-rule — membership and grants are security-state writes); `hc.tier_defaults()` as the single DB source AC-AUTH-8's app module snapshot-tests against. **FRZ-16 invite leg:** freeze refuses create AND accept with the named `freeze_active` signature. | §5.10, AC-AUTH-4/8/11(DB half), RLS-09, FRZ-16 |
| M4 | `grants_revocation` | `hc.set_grant()` (per-subject, per-domain; RAISE requires a valid step-up token, lower never does — §5.7 lists raising only; under the R-rule lock; access-log entry with actor, target, subject, domain, level before AND after — AC-PERM-5) + `hc.remove_member()` (revocation: grants zeroed, object shares revoked unless a coordinator explicitly keeps one — §5.8; open tasks unassigned and surfaced, `owner_member_id` cleared with attribution retained; revocation and unassignment are separate log entries at the same timestamp — PRD §8.8). Session/refresh revocation is the Supabase admin API at the app layer (2B) — RLS closure on the live session is already proven (concurrency case 4). | §5.8, §4.6.3 |
| M5 | `wasnt_me` | `public.security_events` (account-scoped, pre-circle — NOT access_log) + `public.wasnt_me_tokens` (sha256-only, single-use, 15-min expiry, bound to the specific event) + mint-on-threshold from M1's recorder + `hc.execute_wasnt_me()` (validates + consumes + records; destruction happens ONLY from the app layer's explicit POST — the DB never destroys on a read path). Non-enumerating end to end. | §5.11 |
| M6 | `sender_surfaces` | SND-02: `hc.accept_sender()` / `hc.revoke_sender()` (member surfaces, manage-gated, logged; acceptance never retroactively unfiles — §5.3) + **held-mail release**: accepting a sender re-gates that sender's `held_unknown_sender` arrivals — requires appending `('gate','held_unknown_sender','extracting')` (and the expiry edge) to `hc.arrival_transitions`, with the ING-10 exact-set pin re-pinned in the same commit (test edit — migrations stay append-only) + **30-day expiry** of unaccepted stranger mail: sweeper leg terminalizing with an enumerated reason (warning-in-inbox is the inbox surface, staged). | §5.3–§5.4, SND-02 |
| M7 | `security_mail_split` | The §5.9 class split ONLY as far as revocation notices require: an outbound-mail table with `class` (`security` \| `record`) pinned at enqueue; M4's revocation writers enqueue the security-class notice row in the same transaction (content-free: circle name, access changed, by whom — never subject/domain/record data, asserted structurally). Send-time machinery, templates and the other seven messages are slice 11. | §5.9 |
| M8 | *(reserved)* | Round-9 dispositions / fixes, if any — keeps the slice inside the ≤ 8 bound with review headroom (1D precedent: round-8 fixes consumed a slot). | — |

### Test plan (2A)

- **pgTAP** `035`–`041` (one file per migration, M1–M7): every new
  table/function/policy incl. negative, replay and mutation cases;
  privilege-closure stays catalog-based (the segfault trap — reds never
  dial the crash); DEF-01..11 inventories re-pinned (new definers, new
  EXECUTE grants); INV-14 two-way privilege snapshot amended same-commit.
- **Concurrency** (cases 26+, always tee output): acceptance-vs-freeze
  (freeze committing mid-wait defeats `accept_invite`);
  acceptance-vs-revocation (invite revoked / inviter's coordinator
  grant removed mid-wait defeats acceptance); throttle races (two
  sessions hammering one account: counters correct, the 15-min cap
  holds, no state past AC-AUTH-12); step-up single-use race (two
  sessions consuming one token — exactly one wins).
- **Coverage flips (with refs, never early):** RLS-09 green ·
  SND-02 green · FRZ-16 **amended by ADR** — invite leg green, export/
  deletion legs re-staged to their slices (the row currently bundles
  three surfaces) · AC-AUTH-12 recorded as a tested assertion (new row) ·
  APR-06 amended (interim refusal retired, real validation referenced).
- **CI:** verify-migration-state exact counts updated; upgrade leg
  (merge-base worktree → base reset → `migration up` → both suites)
  green; db:verify clean under `--fail-on warning`.

### Design notes carried into the build (decided at build time, TDD-first)

1. **Verified-email visibility** for AC-AUTH-4/M3: `auth.users` is
   ungrantable from migrations on this image (recorded trap). Candidate
   patterns: the JWT's `email`/`email_verified` claims via the GUC
   mirror (staleness: one token refresh), vs. a mirrored
   `accounts.email_verified_at` maintained at the app boundary. Chosen
   red→green with the non-enumeration constraint in the test first.
2. **Throttle caller identity:** the check/record pair must be callable
   before authentication without becoming an oracle; the red tests pin
   byte-identical behaviour for existent vs. nonexistent accounts.
3. **Invite delivery:** slice 2 surfaces the invite link with a copy
   affordance (`create_invite` returns the token once); the invite
   *email* is one of slice 11's eight messages. The E2E walkthrough uses
   the copy-link path. M7 builds outbound mail only for revocation
   notices, per the kickoff.

---

## 2B — the app increment

Skills gate: `vercel:nextjs` before scaffold work. Design tokens only as
far as the auth/onboarding screens need (CSS custom properties, no
Tailwind); the §8 system is slice 3.

| # | Unit | Contents | Spec |
|---|---|---|---|
| A1 | Supabase Auth config | config.toml (+ hosted parity documented): email+password only; min length 10; HIBP leaked-password check; NO composition rules; refresh-token life 30 days; recovery expiry 30 min; TOTP enabled (passkeys costed separately, not assumed); signup on; verification soft-for-use / hard-for-forwarding+invites (§4.1.2). | §5.5 |
| A2 | lib/db + ESLint | The four factories implemented for real (`asUser` via `@supabase/ssr`; `asAdmin`/`asPipeline` direct connections on their roles; `asServiceRole` unchanged + ESLint `no-restricted-imports` fencing it to the artifact route allowlist so CI reds on a stray import). Middleware session refresh. | §1.7 |
| A3 | (auth) routes | sign-in · create-account · reset request/confirm · the "this wasn't me" confirmation page (GET renders, destruction only on explicit POST). Byte-identical non-enumeration responses (AC-AUTH-6/§5.5); throttle copy per §4.1.7 (level copy, wait time, reset link). | §5.5–§5.6, §5.11 |
| A4 | Founder door | Four steps + completion screen (`Step N of 4` on exactly those four — AC-AUTH-2); step 2 writes through `hc.create_circle`; abandonment/resume to the furthest step (AC-AUTH-9); completion copy carries the forwarding address per the owner ruling (inactive + resend state when unverified). | §4.1.3 |
| A5 | Invitee door | Accept screen (circle, inviter, subjects, plain-language ceiling BEFORE asking anything); create-account variant with the invited address pre-filled and not editable; **AC-AUTH-11: signed in as a different identity ⇒ forced re-auth as the invited address**; landing rules (family → Timeline, care circle → their tasks). | §4.1.4–§4.1.5 |
| A6 | lib/permissions/tiers.ts | THE one module rendering ceiling copy AND default grants; snapshot test asserts both screens render from it AND that its grant table matches `hc.tier_defaults()` (AC-AUTH-8 — copy and grants cannot drift). | §5.10 |
| A7 | Account | Global sign-out (`scope:'global'` + access_log entry — AC-AUTH-10) · verify-email state + resend. (Export/deletion surfaces are later slices per coverage DEL-01/G5.) | §4.1.6 (narrowed by kickoff) |
| A8 | Session revocation wiring | `remove_member` path calls the Supabase admin session revocation (the §5.8 sessions row); AC-PERM-3 verified from a second browser context in the E2E. | §5.8 |
| A9 | E2E skeleton | §11.4 item 3: founder path with two subjects (divergent situations/zips), custodianship log entry, invite at summary-only, completion screen naming only Phase-1 surfaces; then the invitee path to real content in two taps. | §11.4-3, AC-AUTH-1/9 |

**2B test surface:** the AC-AUTH-8 snapshot; route tests for
non-enumeration byte-identity; the E2E walkthrough; RLS-10 stays pending
(artifact route is a later slice).

---

## Owner decisions — SETTLED (2026-08-17, before migration 1)

1. **Forwarding-address local part:** `<firstname>.<6-char token>` per
   §5.1 — recorded as **ADR-0011**. Blocks nothing in 2A; feeds A4's
   completion copy in 2B.

2. **Increment split:** **2A (M1–M7 + tests) → round-9 review → merge;
   then 2B (A1–A9) → round-10 review** — the 1A–1D cadence: the DB
   security machinery is the high-scrutiny half and reviews cleanly
   alone; no 2B unit is needed to green 2A's coverage rows (FRZ-16 and
   SND-02 assert DB legs only).

---

## Completion (per increment)

Clean-leg reset exact-N · pgTAP all green · concurrency all green ·
db:verify clean · upgrade leg green · coverage rows flipped with refs ·
CI green at the pushed head · ADR for deltas (incl. the FRZ-16
amendment and ADR-0011) · TSD annex if normative text moves · review
packet in the round-8 shape (head ledger from the start, one-SHA
evidence block, pointed questions with recommended answers). ⏸ STOP at
the gate — third-party review → dispositions ADR → owner sign-off →
merge commit, each in its own fresh session.
