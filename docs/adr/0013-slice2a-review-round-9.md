# ADR-0013 — Third-party review round 9: the built 2A auth machinery, findings, dispositions

**Status:** Proposed — fixes applied and green; owner sign-off and the
merge commit pending (each in its own session, per the gate)
**Deciders:** owner (sole merge authority, per ADR-0006)
**Date:** 2026-08-17
**Packet reviewed:** `docs/review/round-9-findings.md` — the adversarial
third-party review of increment 2A at head `265952d` (evidence SHA
`6cc0dc7`, CI run 32106060931), base `main` @ `4e4bbca`, against the
master plan, TSD as amended by annexes A1–A7, and ADR-0001–0012.

**Reviewer verdict:** **not accepted — three blocking findings, forward-fix
required.** All three reproduce against the shipped migrations and all
three are **accepted** below (F1 with a narrower mechanism than the
recommendation's outer clause; F2 extended to two sibling writers the
review did not name). Fixes applied the ADR-0006 way — findings committed
verbatim (`e371326`) → red `1bebc9c` (every failure signature in the
commit message, including the live breach states: an acceptance surviving
a mid-wait freeze with `senders=1 logs=1`; a removed member re-granted
with the step-up token consumed) → green `c995a99` (migration
`20260818120008_round9_fixes.sql` — **M8, the reserved slot**, spent as
the 1D precedent spent its own). The migration bound stays ≤ 8, met
exactly.

## Findings and dispositions

| # | Severity | Finding | Disposition | Applied where |
|---|---|---|---|---|
| F1 | **critical** | `hc.record_auth_attempt(text, text)` accepts caller-supplied outcomes including `success`/`reset_completed` and is granted to `anon`: any caller holding a request role can assert a success for any identifier, clearing the victim's throttle and starving the §5.11 suspicious-attempt threshold. Concurrency case 28 institutionalized the capability. Recommendation: only a trusted server-side boundary records success-class outcomes; *ideally failure recording too* | **Accepted — identity binding instead of a trusted-boundary role.** The two-argument form is **DROPPED** (never create-or-replace across a signature change — the overload inventory is an invariant). `hc.record_auth_failure(identifier)` keeps the anon+authenticated grants: a fabricated failure grants an attacker nothing a real failed attempt does not (failures are always attacker-producible; AC-AUTH-12 boxes both), and suppression is impossible from outside the recording boundary. `hc.record_auth_success(kind)` is **authenticated-only and takes no identifier** — the cleared key derives from `hc.uid()` → `accounts.email` (the M5 mirror), so the only throttle state a session can clear is the one its own successful authentication already refutes; sign-in and the completed recovery flow both end holding a session AS the account, so the app boundary calls it as the proven user. The recommendation's outer clause (move failure recording to a trusted server role too) is **declined**: it removes no capability, and would force a fifth §1.7 factory / new DB role for zero threat reduction. **Exploitability calibrated, not disputed:** `hc` is not API-exposed (PIN-01 pins PostgREST to `[public, graphql_public]`), so the grant was latent — reachable only by server-side code assuming request roles — but it encoded the wrong authority and 2B's server channel would have made it load-bearing. Severity accepted as filed. Case 28 rewritten: anon bursts, the holder's own authenticated success clearing for the other session | M8; 035 (rewritten, 39 asserts); 002 inventories; concurrency 28 |
| F2 | high | `hc.accept_sender` checks the freeze, writes `known_senders`, and writes the audit event **before** acquiring the per-circle advisory lock — a freeze committing after the check but before the lock leaves the accepted sender and log entry standing, contradicting the annex A4 rule that security-state writers take the lock before binding predicates or writing. Recommendation: lock before the predicates, re-evaluate both under it; add an acceptance-vs-freeze two-session case | **Accepted — and extended to the class.** `accept_sender` is re-created with the A4 shape: lock first (the key is the parameter), coordinator + freeze + argument predicates under it, writes after, `hc.log` after the taint lock — which also removes a defect the review did not name: the pre-lock `hc.log` call took the unprefixed advisory key **before** `taint:`, inverting A4's pinned acyclic order (a deadlock class with any writer holding `taint:` while logging). Blast-radius note for the record: the held-mail **release** itself was never reachable under a committed freeze — `advance_arrival` re-evaluates `circle_frozen` under its own lock and returns `frozen` — so what survived the race was the sender row + log entry (and post-freeze recognition), which case 30's red demonstrates (`err=none senders=1 logs=1`). **The same audit found the class in the M4/M7 writers:** `set_grant` and `remove_member` read their target and authorized the actor before the lock, so a removal committing mid-wait let a token-carrying raise re-grant a just-removed member (case 31a red: removed member holding a live grant, token consumed) and let a just-removed coordinator's in-flight removal complete (case 31b). Both re-created with the A4 shape: discovery binds ONLY the lock key (a member row never changes circles — the `advance_arrival` precedent), every predicate re-evaluates under the lock against re-read rows; the raise now refuses **before** consuming the token. Single-session behaviour and refusal shapes unchanged — 036/037/038/040/041 pass untouched | M8; concurrency 30, 31a, 31b; coverage SND-02/GRT-01/GRT-02 |
| F3 | high | `hc.execute_wasnt_me` consumes the single-use token and returns `account_id`; session destruction is deferred to a later 2B application call. A crash between commit and the GoTrue admin call leaves a dead link and live sessions, permanently; a direct call consumes without the promised destruction; 039:206 verified consumption, not the security outcome. Recommendation: atomically consume and enqueue a uniquely keyed account-security action; a privileged worker performs revocation and records completion, with safe retries | **Accepted as proposed.** The consuming transaction now inserts `public.security_actions` (`UNIQUE(event_id)` — exactly-once per event, structurally; `action` a closed check; zero request-path privileges) and returns `action_id` alongside `account_id`. "Token consumed" therefore implies "global sign-out + forced reset durably owed"; a direct call by the attacker CANNOT strip the promise — whoever consumes, the kill is queued. §5.11's immediacy is preserved: the app's POST performs the GoTrue admin kill right after commit and marks completion via `hc.complete_security_action`; `hc.pending_security_actions` is the retry sweep for stragglers (both `hc_pipeline`-only — the outbox-drain posture; completion retry-safe: second completion reports `{completed:false}`, an unknown id refuses loudly). Case 32 pins the race: two sessions, one token — exactly one consumes, exactly ONE action row | M8; 042 (new, 22 asserts); 039:18, 21; concurrency 32 |

## Declined extensions (argued, for round 10)

- **`hc.create_invite` does not join the locked set.** An invite row is an
  inert claim check: it grants nothing, changes no taint, releases
  nothing. Its redemption — the only consequential moment — re-validates
  EVERYTHING under the lock (freeze, FRZ-16a; the invite's own liveness
  via the conditional UPDATE, RLS-09/case 27; the address binding). An
  invite racing a freeze into existence is indistinguishable from one
  created a millisecond earlier, and equally suspended. A4's writer set
  ("growth and shrink paths, record writers, freeze writers") does not
  reach it.
- **`hc.revoke_sender` / `hc.revoke_invite` stay lockless.** Both reduce
  reach, are freeze-exempt by design (revocation must never be blocked by
  containment), and carry no predicate whose mid-wait invalidation could
  GRANT anything — the failure mode A4 exists to close. Their conditional
  UPDATEs are their own serialization.

## The F1 2B contract, recorded (the reviewer's integration point)

The database throttle is **advisory until 2B routes every
password-verification path through the app boundary** that consults
`hc.auth_throttle` and records outcomes; direct GoTrue calls bypass it.
Recorded as a 2B acceptance criterion (A1/A3): the sign-in, step-up
re-auth and recovery routes are the ONLY password paths the app exposes,
each consulting and recording; GoTrue's own rate limits stay ON as the
backstop; per-network limiting is the Vercel WAF (deploy-time). Until
that boundary lands, these RPCs are **not deployable as a public
surface** — PIN-01 (API exposure pinned to `[public, graphql_public]`)
is the standing control that keeps them unreachable, and 031/002 pin the
grants. The same caveat covers `execute_wasnt_me`: the DB now guarantees
the kill is *owed and recorded*; only the 2B worker/POST can *perform*
it.

## Verification at the disposition head

All evidence at **`c995a99`** (the M8 green commit; the docs commits that
follow are docs-only and leave the SQL/test tree identical):

- Clean-leg reset: **46 applied == files, exact** (verify-migration-state).
- pgTAP: **1134/1134 across 43 files** (was 1104/42: 035 → 39 asserts,
  039 → 23, 042 new at 22; 002 re-pinned — 49 definers, 89 hc_internal
  policies, grant matrix + table snapshot amended in the same commits as
  the objects they pin).
- Concurrency: **55/55 across 32 cases** (tee'd), including the three new
  races (30, 31a/31b, 32) and rewritten case 28.
- `db:verify` (`supabase db lint --fail-on warning`): clean.
- CI at the pushed head: recorded in the packet addendum
  (`docs/review/round-9-packet.md`).

## Consequences

- The migration count is now **8 of the ≤ 8 bound** — the reserve is
  spent. Any further round-9/10 finding requiring DDL forces an
  owner-approved bound amendment; test-only and docs-only dispositions
  remain free.
- Coverage rows AUT-01, AUT-02, SND-02, GRT-01, GRT-02, WMN-01 amended
  with the M8 semantics and refs (this commit); no staged row was
  greened.
- The round-9 packet carries a forward-fix addendum superseding its
  acceptance recommendation, as the reviewer directed.
