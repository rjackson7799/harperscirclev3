# ADR-0007 — Slice 1C: ingestion state-machine design decisions and TSD deltas

**Status:** Proposed (built and green on `slice/1c-ingestion`; awaiting
third-party review round 7 and owner sign-off)
**Date:** 2026-08-16
**Scope:** Decisions made while building 1C (eight migrations,
`20260816010001`–`20260816010008`), per the session kickoff. Authority order
applied: master plan → TSD §2.4, §3.4, §4, A.1, A.5 as amended by annex
A1–A4 → ADR-0001–0006 → Appendix A + `docs/coverage.md`. Every divergence
from TSD text is recorded in the normative Amendments annex A5; nothing
diverges silently.

## D1 — `hc.advance_result` is the ONE worker vocabulary; the claim pair lands via the first ALTER TYPE … ADD VALUE (PLT-03)

§4.2 pins the six-label enum; §4.3 pins `claim_stage` returning
`exhausted`. Options: a second `hc.claim_result` enum (two near-identical
vocabularies per worker switch), or extend `hc.advance_result` with
`'claimed'`/`'exhausted'`. **Extended.** Four of the six existing labels
mean the same thing at claim time (cancelled/frozen/invalid_state/
already_advanced), and `stale_lease` is exactly "a live attempt owns the
arrival" — reused for claim-while-live. M2 creates the §4.2 six VERBATIM;
M3 is the ADD VALUE migration and uses neither value; M4 is first use —
the 55P04 rule (ADR-0002 c5/note 5, ADR-0003 f7) exercised by real
migrations, probed live in 021, applied to the shipped base by the CI
upgrade leg on every run. PLT-03 green.

## D2 — The R-rule extends to every 1C writer

`advance_arrival`, `claim_stage`, `cancel_arrival` and
`create_manual_proposal` take `pg_advisory_xact_lock('taint:' || circle)`
before their row locks; the freeze predicate (`hc.circle_frozen`, the
§3.8/FRZ-14 shape) evaluates under the serialization point against re-read
rows. Proven mid-wait: a freeze committing while each waits defeats it
(concurrency 13–15). `hc.sweeper_pass` acquires per-circle locks in
`order by circle_id` — one deterministic acquisition order per pass, so
sweeper-vs-writer lock graphs stay acyclic. `hc.create_arrival` takes no
lock: intake is not freeze-gated (accept-and-store, PRD §7.5) and has no
security predicate a transition could race; the FKs bind identity.

## D3 — Exhaustion's terminal move happens INSIDE `claim_stage`

§4.3 says exhaustion "return[s] `exhausted` so the caller moves the
arrival to its terminal state" — but every state change requires a current
open lease at §4.2's fence, and an exhausted claim mints none, so the
caller CANNOT perform the move. The terminal transition (to
`stage_budgets.exhaust_state`, with its enumerated `exhaust_reason`, event
attempt = the spent count) therefore executes inside `claim_stage`'s own
row lock; the caller's obligation reduces to "ack, never call the
provider" — the sentence's intent, kept. `hc.sweeper_pass` performs the
same move for budget-spent arrivals nothing re-queues (§4.11's "moves
arrivals past their total budget to a terminal state"). Interpret and gate
exhaustion land in `extract_failed` ("couldn't read it") with
distinguishing reason codes rather than new enum labels.

## D4 — `cancelled` outranks the fence in `advance_arrival`

TSD §4.2's body runs the fence first. The §4.5 cancel path closes the
worker's lease (`outcome = 'cancelled'`, required for the staged-artifact
GC contract), so fence-first would report the weaker `stale_lease` to the
late worker and lose the cancel signal. Both outcomes mean
discard-and-ack; `cancelled` says why, so the cancelled diagnosis moved
above the fence. No mutation precedes either return.

## D5 — Stages as data; the in-flight transition happens at claim

`hc.stage_budgets` (hc schema, seeded, append-by-migration like
`hc.log_event_types`): stage → entry state, optional in-flight state,
max_attempts (store 2, scan 4, gate 50, extract 3, interpret 3),
lease_seconds, exhaust state + reason. §4.3's table is satisfied with
single-transition stages except interpret, whose declared in-flight move
(extracted → interpreting) happens AT claim — one lease spans the stage,
because `advance_arrival` closes the winning lease and a two-transition
stage would fence out its own second half. A reclaim after a mid-flight
death accepts the in-flight state and does not re-event the transition.
Redelivery for a concluded stage is detected from the event trail
(`from_state = entry`) and acks out as `already_advanced`; entry-state
mismatch with no such trail is `invalid_state` (defect signal). `scanning`
remains a declared-but-unused §2.2 label (as in the TSD's own §4.3 table).

## D6 — MNL-01 as built (the ADR-0006 Q12 model, verbatim)

The channel CHECK gains `'manual'` in the migration that ships the
machinery; `hc.create_arrival` refuses it (a synthetic arrival exists ONLY
inside `hc.create_manual_proposal`'s transaction). The trigger
`hc.assert_manual_flag` makes flag/channel disagreement unrepresentable in
both directions, so `approve_proposal`'s provenance branch (null
`source_arrival_id` on manual) can never be steered by a lying flag.
`create_manual_proposal`: kind `document` refused (a document IS its
artifact; the upload path owns it); the machinery forces `manual: true`;
freeze-first Q5 order (`freeze_active` named); authorization = manage on
the DRAFTED union under the R-rule lock — the same predicate approval
re-runs; the synthetic arrival lands at `proposals_ready` with a creation
event (`from_state` null, reason `manual_entry`). One transaction: any
refusal leaves neither row, including across a mid-wait freeze race.
013's 1B flag-only fixture migrated to this model.

## D7 — ING-02/03 policy levels and the fail-closed all-domain taint

Pipeline material is unclassified until approved into the record, so
arrivals and extractions evaluate `hc.visible_at` over `hc.all_domains()`:
an arrival row can be an invoice or a discharge summary and the policy
cannot know which yet — a member below summary (arrivals) / view
(extractions) on ANY domain sees nothing. §3.4's map rows land verbatim
(summary → the arrival row; view → extractions + auth_detail). Proposals
are absent from the map: pinned at **manage over the proposal's own
drafted taint** — the approval audience; A.4's conflict-oracle bound
follows from the drafted union. `auth_detail` and `current_lease_id` stay
OUT of the authenticated column grant (RLS cannot vary by column; column
privileges draw the line inside the table), so `select *` refuses for
every member and clients name their columns; `hc.arrival_auth_detail`
serves the view level with the DEF-10 one-shape refusal. Both new
policies hold the two-InitPlan/zero-SubPlan PRF shape.

## D8 — P5 intake caps (ADR-0006 P5 discharged)

`create_arrival`: byte_size ≤ 52,428,800 (PRD §13.3's 50 MB), page_count
≤ 200, idempotency key ≤ 200 (the APR-07 bound), sender_address ≤ 320,
display name ≤ 500, message_id ≤ 998, mime ≤ 255, auth_detail ≤ 16 KB —
refused (`arrival_invalid`) before any write; intake is idempotent on
(circle, key). `draft_proposal`/`write_extractions`: payload object ≤ 64
KB, parents ≤ 20 (each resolving in-circle in-subject), source extraction
ids ≤ 200 and owned by THIS arrival, anomaly_flags ≤ 20; facts ≤ 200 per
publication, field 1–120 chars, value ≤ 8 KB, citation present (the CHECK's
rule enforced by the machinery first) and ≤ 4 KB. Input-syntax refusals
(`proposal_invalid`/`extraction_invalid`), not DEF-10 oracles — the P5
disposition's accepted shape.

## D9 — `hc.finalize_interpretation`; write halves owner-only and lease-bound

The TSD shows only the extract-stage finalizer and states the
one-transaction principle generically; the interpret stage gets the same
gate (`interpreting → proposals_ready`, then `write_proposals`).
`write_extractions`/`write_proposals`/`draft_proposal` are owner-only and
NOT SECURITY DEFINER — they execute as the calling definer's role, so they
are unreachable except through the finalizers and `create_manual_proposal`.
Both write halves validate that `p_lease` belongs to the arrival — a
parameter is never accepted-and-ignored (the F6 posture); the fence itself
already ran in the same transaction's CAS.

## D10 — Outbox, drain, sweeper shapes

`pipeline_outbox` rows are written by `adjudicate_freeze`'s dismissed arm
(same transaction as the finding) for every worker-state arrival in the
circle — `hc.pipeline_worker_states()` is the single source of "parked";
human-wait states (proposals_ready, held_unknown_sender, needs_password,
duplicate_suspected) and terminals were never parked. `hc.outbox_drain`:
FOR UPDATE SKIP LOCKED, exactly-once handoff, stage derived from the
arrival's CURRENT state. `hc.sweeper_pass` returns one jsonb summary
(expired_leases / terminalized / requeue / stuck / queue_age_alert);
queue age measures from `received_at`, stuck from the LAST transition
event; both exclude parked work (§4.11). The relay worker and scheduler
are staged (RLY-01) — a lost message is recoverable by construction, and
the DB halves prove it.

## D11 — Staged surfaces named, never silently dropped

PST-01 (`hc.product_state`, §4.4 + the A.4 parent-rollup oracle), CNF-01
(§4.8 conflict outcomes; drafting live, approval of conflict kinds still
refused — unchanged 1B behaviour), SND-02 (known_senders accept/revoke +
held-mail release + 30-day expiry, §5.3–§5.4), RLY-01 (workers), FRZ-16
retagged to 2+ (no invite-acceptance/export/deletion surface exists
through 1C). Re-extraction/re-interpretation supersession machinery
(§4.3's "a re-run supersedes") awaits a re-run surface; the one-live
lineage index and `supersedes_id` plumbing are in place.

## Consequences

- 30 migrations total; 1C added exactly the planned 8 (Q8 headroom kept).
- The definer inventory grows to 27 (002 pins); hc_pipeline gains schema
  `hc` USAGE (001:65 flipped as its own message anticipated) and EXECUTE
  on exactly seven entry points; hc_internal's policy list grows to 61.
- `hc.sender_recognised` compares `lower(text)`, not citext `=` — the
  citext operator does not resolve under `search_path = ''` and PG's text
  fallback would compare case-sensitively (a silent gate-narrowing
  defect found red→green in U2).
- TSD annex A5 records the §2.2/§2.4/§3.4/§4 deltas normatively.
