# ADR-0020 — Slice 5A: the extraction + interpretation DB increment, design decisions and deltas as built

**Status:** Proposed (round 15 ratifies or amends)
**Date:** 2026-08-21
**Scope:** Decisions made while building 5A (five migrations,
`20260821120001`–`20260821120005`; **M6 stays reserved** for round-15
dispositions — the bound closes at 5 of ≤ 6 planned spend), per the
slice-5 plan (`docs/review/slice-5-plan.md`, PLANNED–RULED, Q1–Q9
SETTLED — Q1–Q7 at the plan gate, Q8/Q9 at the post-gate review
integration) and the 5A build kickoff. Authority order applied: the
plan (the M-rows as amended by the integration are BINDING) → TSD §6,
§4.3–§4.10, §3.10, §2.4–§2.6 as amended by annexes A5/A6/A9/A10 →
ADR-0017/0018/0019 (the inherited items) → `docs/coverage.md` row
conventions. Every divergence from the plan's letter is recorded here;
nothing diverges silently. **5A contains no provider-shaped code and no
app-layer units, by design (Q1/Q5): every unit is DDL, definer bodies,
pgTAP and the concurrency layer.**

## The inherited obligations, discharged (M1)

- **ADR-0019 Q-iii** — `hc.log_artifact_read(p_arrival)` landed as the
  authenticated definer with in-function authorization: the artifact
  route's exact evidence predicate (`hc.visible_at(hc.ctx(), subject,
  all_domains, true, 'arrival', id, null) >= 'view'` over a live
  arrival) is repeated inside the function, so it is safe standing
  alone; the actor is `hc.uid()` and the display name comes from the
  live accounts row in the same transaction. Nonexistent, foreign,
  deleted, not-visible and no-live-account all land in ONE
  `artifact_refused` shape (DEF-10). No separate freeze check: the
  freeze rides inside `visible_at` (the FRZ-13 cap), exactly as the D7
  interim behaved — semantics preserved, authority relocated. **The D7
  boundary is NOT yet retired**: `lib/db/evidentiary.ts` still carries
  the route until 5B B8 moves the call and deletes the module (EVD-01's
  app half).
- **ADR-0019 D15 (the revoke-sender read)** —
  `hc.list_known_senders(p_circle)`: live rows only, `accepted_by` +
  `accepted_at` + the acceptor's display name, deterministic order
  (`accepted_at desc, id desc`). Two build decisions recorded: the
  acceptor's name is resolved AT READ (a list surface, not evidence —
  the captured-at-write discipline stays `hc.log`'s), and there is NO
  freeze check, deliberately: the list feeds revocation and revocation
  reduces reach (`hc.revoke_sender`'s own recorded stance). Authority
  is the SND-02 shape verbatim — live coordinator membership, one
  `sender_refused` shape for foreign/nonexistent/non-coordinator
  (built strict; the round-9 widening question stands recorded).
- **ADR-0019 D8/Q-vi/S3 (Q4 — NOINHERIT)** — both `hc_runtime`
  memberships re-granted `WITH INHERIT FALSE`; the SET option (the
  request-role channel) untouched. The flip landed STRONGER than the
  runbook's pre-amendment wording anticipated: the bare login can no
  longer even RESOLVE schema `hc` (no inherited USAGE), so the
  `has_function_privilege` catalog probe itself answers 42501 —
  `tests/db/runtime-credential.test.ts` re-pinned to expect the 42501
  on the bare probe and to read the catalog fact over the channel (SET
  ROLE authenticated). BAT-04's 043 pin now carries
  `inherit=false` two-way; `docs/ops/runtime-db-credentials.md`'s
  provisioning and verification rows are amended (the B8-era
  "zero rows" expectation is superseded — it was correct only under
  INHERIT).

## D1 — M2: the §6.6 shape's two under-specified corners, settled

**"Documents in the same categories"** is settled as: the categories
named by the arrival's OWN pending `'document'` proposals
(`payload ->> 'category'`, status `pending`) — the extraction pass's
filing intent, and the only deterministic in-DB reading of §6.6's
sketch. No document proposal → an empty section, never an error.
**Timestamp rendering is part of byte-stability**: `filed_at` renders
as UTC ISO-8601 via `to_char` (a `to_jsonb(timestamptz)` would render
in the session TimeZone — an environment dependence); dates and naive
timestamps render as their own text; timeline recency uses the NAIVE
key `coalesce(local_at, occurred_on::timestamp)` covering all three
§2.7 temporal shapes with no timezone conversion anywhere; `instant`
is deliberately NOT emitted (local_at + iana_zone are the human-frame
values interpretation needs). The caps — high-risk facts uncapped BY
THE SETTLED LETTER (boundedness argued from the record's physics: one
current row per (subject, field), values bounded at publication),
standard facts 200 by recency, timeline 100, open tasks 100, documents
50 — are stated in the migration and pinned in 052; every section
carries `{truncated, omitted}`. The facts section's cap key is
`standard_cap` (the cap applies to the standard class alone).

## D2 — M3: the mechanics behind "born at claim, closed with the lease"

- **The trigger form.** "No open run outlives its lease" is enforced
  STRUCTURALLY: an AFTER UPDATE trigger on `pipeline_leases`
  (`hc.close_extraction_run`, SECURITY DEFINER) closes the bound run on
  every lease closure — finalize's CAS, worker terminals, cancel,
  claim-path expiry, sweeper expiry, and any FUTURE closer — rather
  than editing each closer. Outcome mapping: `advanced` + arrival at
  `extracted` (or, since M5, `duplicate_suspected_stage2`) →
  `published`; `advanced` + any other exit → `terminalized` with the
  transition's §6.8 reason read from the same-transaction event;
  `expired` → `abandoned`; `cancelled` → `cancelled`.
- **The pair validates at the MINT point.** `hc.claim_stage` gains
  `(p_model_id, p_prompt_version)` — dropped-and-recreated across the
  signature change (the exact-overload rule), defaults preserving every
  existing caller. The extract-side REQUIREMENT checks immediately
  before the lease insert — so a lease can never exist without its run
  — while cancelled/frozen/stale/exhausted claims still answer their
  diagnoses (022's pinned contract: a cancelled arrival answers
  `cancelled`, not a parameter error). Non-extract stages REFUSE the
  pair: no stage borrows an identity it does not record.
- **Interpret records NO run**, deliberately: §4.3 gives interpret its
  own idempotency (proposals carry `version` + `supersedes_id`; a
  re-interpret supersedes pending ones) — one mechanism per stage.
- **Two shipped-table appends** for §2.1 circle-consistency:
  `pipeline_leases` gains `unique (circle_id, id)` (the FK target it
  never needed before) so `extraction_runs.lease_id` binds through the
  circle-consistent composite; `extractions` gains `run_id` (composite
  FK) + `superseded_at`, and hc_internal gains its third extractions
  privilege (UPDATE, policy `extractions_internal_supersede`) —
  publish-only widens to publish-and-supersede; DELETE still for
  nobody.
- **Stamp coherence**: `hc.write_extractions` refuses a fact whose
  `model_id`/`prompt_version` differs from its run's stamps — the
  recorded configuration is the identity, not a suggestion. Fixture
  leases without a run publish unstamped (`run_id` null) so the 1C-era
  pgTAP fixtures stay honest.
- `prompt_version`'s semantics are pinned in the migration text (the
  plan's letter): the FULL inference-and-rendering configuration behind
  the public `(model_id, prompt_version)` pair.

## D3 — M4: the conflict arm's build decisions

- **The outcome rides `p_edits ->> 'conflict_outcome'`** — the §3.7
  signature stays verbatim. `approval_attempts.conflict_outcome`
  (CHECKed to the three words) makes the identity outcome-bearing: the
  replay comparison is `IS NOT DISTINCT FROM`, so non-conflict
  approvals (null = null) replay exactly as before.
- **High-risk confirmation gates `use_new` alone** — the one outcome
  that writes a VALUE. Declining (`keep`) or task-drafting
  (`keep_both`) approves no value; demanding `confirm_high` there would
  gate a refusal on a comparison nobody is making.
- **`keep` refuses field edits** (`approval_refused`): editing a value
  you are declining is incoherent, and accepted-and-ignored is the F6
  sin.
- **The keep_both task's copy comes from the DRAFTED payload's `task`
  block** (title required, detail/due optional with the table's
  due-pair check) — the DB invents no words; a taskless `keep_both`
  refuses (refuse-what-you-cannot-validate). The interpret worker (5B
  B5) drafts the block; 5A's pgTAP drafts it through
  `hc.draft_proposal` exactly as the worker will.
- **Every conflict outcome logs ONE `conflict_resolved` event**
  (outcome named in detail, the written object referenced when one
  exists); `object_approved` stays the non-conflict event. The
  event-type enumeration grows to 22 (001 re-pinned).
- The conflict's authorization union uses the DECLARED domain (plus
  `own_domain('task')` for keep_both) in place of the non-conflict
  `own_domain` call; the Q4 taint-drift check and §4.9 versioning ride
  unchanged.

## D4 — M5: the enum-append placement (the bound stays 5 + reserve)

Q8's distinct state needs `ALTER TYPE … ADD VALUE`, and the recorded
migration-authoring rule (ADR-0002 note 5; 000's header; the 1C
'claimed'/'exhausted' precedent) makes a new enum value usable only one
migration AFTER it lands. A dedicated value-migration (the 1C shape)
would have spent M6 — reserved for round-15 dispositions by Q2's letter.
**The value therefore rides the TAIL of `20260821120004` (M4)** — 5A's
own unshipped branch file, clearly marked as M5-prep with the rule
cited — and every USE (graph rows, machinery, rank/label) lands in
`20260821120005`. No shipped migration is edited; the bound closes at
5 files of ≤ 6 with M6 intact. Offered for ratification (Q-D in the
round-15 packet).

## D5 — M5: the matching contract's build-level constants

The canonical key-field names — `document_date`, `provider`, `amount`,
`policy_number` — are part of the contract (stated in the migration):
B4's extraction schema emits them and the G9 corpus labels them.
Normalisation is `lower(btrim(scalar-text))`; a corroborating pair
present on both sides and EQUAL corroborates — a differing pair neither
corroborates nor vetoes (the FP fixture: same type+date with a
different provider and no other present pair ⇒ no suspect; the FN
guard: amount matches with provider absent ⇒ suspect). The arrival side
reads the PUBLICATION PAYLOADS (this transaction's facts + the drafted
document proposal's category) so detection can choose the CAS target
(`extracting → extracted` vs `→ duplicate_suspected_stage2`) before the
advance — Q8's graph shape; the candidate side reads the filed
document's own arrival's live extractions. A re-run never matches
itself (`artifact_arrival_id <> p_arrival`).

## D6 — M5: same_thing's DIRECT provenance edge

`hc.link_provenance` restricts endpoints to record types and propagates
taint GROWTH. The `same_thing` resolution inserts the
document ← arrival edge DIRECTLY (hc_internal's own insert privilege),
deliberately: the member has attested the arrival is a second copy of
the already-filed document — no new information class joins the
document, so propagating the arrival's fail-closed all-domain taint
would narrow the document's audience on the strength of a duplicate.
The edge records citation provenance; the audience does not change.
Offered for ratification (Q-C). The canonical-target pointer
(`arrivals.duplicate_of_document_id`) is retained after resolution as
the trace of the question that was asked; the suspect-state rank
renumbering (the states above it shift by one) is safe because nothing
stores a rank durably — the 046 pins re-pinned with it.

## D7 — The regression-net correction: vitest counts 448

The kickoff's net said "vitest 431 (test:app)". The true collection at
the 5A base (`7832d53`) is **448** — verified against a clean worktree
of that SHA — and the archaeology is recorded: round-13's packet
records 442/442 at the review head `d6a6a22`; the round-13→14
dispositions brought main to 448; the "431" echoes ADR-0019's mid-build
B8-era line. 5A's own edits changed no collection count. The standing
net's number is corrected to 448 from this packet forward (Q-E).

## D8 — Suite re-pins forced by the increment (all same-commit)

002 (inventory ×3 waves, definer set 65→69, grant matrix +3 rows,
privilege snapshot +4 rows, policy inventory 97→101) · 001 (enum 22
labels; event types 22) · 022 (claim_stage catalog probe to the 4-arg
form) · 023/026 (extract-claim fixtures carry the pair) · 027 (ING-10's
exact graph set — 21 edges) · 043 (BAT-04 carries inherit=false) · 046
(rank distinctness 22) · `tests/db/runtime-credential.test.ts` (the
NOINHERIT posture) · `scripts/concurrency/run.mjs` (the five
extract-claim call sites carry the pair; cases 39–43 added). The
`hc.log` chain, the CAS, the sweeper and every 4A/4B surface are
otherwise untouched — the full suites prove it at the evidence head.

## Sign-off

Round 15 ratifies or amends. The build session's completion evidence —
clean leg exact 59, pgTAP 1489/56, concurrency 69/69 across 43 cases
(teed), upgrade leg 54 → migration up → 59 with both suites green,
db:verify clean under `--fail-on warning`, vitest 448, local gate 24/24
UNCHANGED (F12 re-run — supabase/ moved), lint/typecheck/build clean,
gitleaks 277 commits no leaks — is recorded in the round-15 packet's
one-SHA evidence block.
