# ADR-0021 — Slice 5A review round 15: the findings dispositions

**Status:** Proposed (the owner ratifies at the sign-off gate; merge is
the owner's alone — ADR-0006)
**Deciders:** the round-15 dispositions session (owner ratifies at sign-off)
**Date:** 2026-08-21

**Context:** The round-15 third-party review of slice 5A — packet
`docs/review/round-15-packet.md` at PR head `8011e5a`, evidence head
`2eab0f3`, base `main` @ `7832d53` — was commissioned from **GPT 5.6
Sol**, deliberately a different model family than the author, against a
self-contained package (the brief + the packet + ADR-0020 + the slice-5
plan + all five migrations + pgTAP 051–055; no repository access
assumed). It returned **three findings — one HIGH, two MEDIUM — with
all seven pointed questions Q-A–Q-G ratified** and three recorded
observations. The findings landed VERBATIM at
`docs/review/round-15-findings.md` (commit `793f670`) before anything
was argued, per the standing rule (the `5faccc4` precedent).

**Every finding's factual basis was independently re-confirmed against
the tree in this session before disposition** — none was taken on the
reviewer's word, and the HIGH's load-bearing premise was one the
reviewer had itself flagged as unverifiable from the package.
**All three are accepted**, and all three are fixed in **M6**, the
reserved slot: `20260821120006_round15_fixes`. Q2's migration bound
therefore closes **SPENT at 6 of ≤ 6**.

## Findings and dispositions

| # | Severity | Finding (compressed; the verbatim text is the findings file) | Disposition |
|---|---|---|---|
| F1 | **HIGH** | Stage-2 detection can miss a document filed concurrently: `hc.finalize_extraction` asks the duplicate question with no lock held, then blocks on the per-circle taint lock inside `hc.advance_arrival` | **Accepted.** The R-rule lock is hoisted above detection (M6 §3). Structural pin pgTAP 056:1, behavioural pin concurrency case 44 |
| F2 | medium | `hc.list_known_senders` omits the `deleted_at is null` actor guard that `hc.log_artifact_read` carries | **Accepted**, with the severity premise corrected: currently **unreachable**. Guard added (M6 §1); the SND-02 family gap queued as an owner item — D2 below |
| F3 | medium | `hc.detect_stage2_duplicate` narrows the arrival side to one document category and one value per key field via `LIMIT 1` | **Accepted.** The arrival side now reads sets (M6 §2). The settled matching contract is unchanged; only the arbitrary first-value tie-break is removed |

### D1 — F1 accepted: the premise verified first, then the lock hoisted

The reviewer listed `hc.advance_arrival` among the definitions it could
**not** see in the package, and F1's whole failure scenario rests on how
that function serializes — so the finding was, in substance, contingent
even though it was not labelled so. It was checked before it was
accepted, and it holds in all three parts:

- `hc.advance_arrival` acquires `pg_advisory_xact_lock(hashtext('taint:'
  || circle))` as its **first act**, before the row lock
  (`20260816010009_round7_fixes.sql:86–90`) — the ADR-0007 R-rule.
- `hc.approve_proposal` takes **the same per-circle key**
  (`20260821120004_conflict_outcomes.sql:146`) and inserts the document
  at `:335`, holding the lock across the write until commit. So the
  document-filing transaction really is the lock holder the scenario
  needs.
- `hc.finalize_extraction` called `hc.detect_stage2_duplicate` at
  `20260821120005:156` with **no lock held**, and only then
  `advance_arrival` at `:164`. The detector is `language sql stable`, so
  it reads the snapshot of that assignment statement, and its candidate
  side reads `public.documents` — exactly the row the other transaction
  is about to commit.

The race is therefore real: A detects and misses → A blocks on the taint
lock → B commits its matching document and releases → A takes the lock,
never re-detects, and advances to `extracted`. The settled stage-2
question is silently skipped, and which way it goes depends on
transaction timing.

**One sharpening the finding did not make, recorded because it shapes
the test:** the lock-wait is not what *causes* the miss — plain snapshot
timing does that on its own, in a window of microseconds. What the
lock-wait adds is a *reliably reproducible* window, which is what makes
case 44 deterministic rather than flaky.

**The fix is the hoist, not a re-detect.** `v_to` is chosen *before*
`advance_arrival` is called — it is an argument to it — so "re-run the
predicate after acquiring the lock" cannot be done inside the existing
call shape without a second transition. Hoisting the lock into
`finalize_extraction` ahead of detection is what the codebase's own
R-rule already prescribes ("the per-circle lock BEFORE the row lock"),
and it is sufficient: in READ COMMITTED the detect call is a fresh
statement, so on the far side of the wait its snapshot sees the
committed document. Lock **order** is unchanged, so no new deadlock
class appears — `advance_arrival`'s own acquisition of the same key
becomes a re-entrant no-op, and nothing in `finalize_extraction` takes a
row lock before it. (`supabase:supabase-postgres-best-practices` was
loaded before this DDL was authored, per the standing gate; its
consistent-lock-ordering rule is the one that applies.)

### D2 — F2 accepted, and the severity premise corrected

The asymmetry is real and was confirmed: `hc.log_artifact_read` resolves
its actor with `where a.id = v_actor and a.deleted_at is null`
(`20260821120001:70–72`); `hc.list_known_senders` had only
`where a.id = v_actor` (`:120`).

**But the scenario the finding describes is currently unreachable, and
the record should say so.** `grep` over every migration finds **no code
path that ever writes `accounts.deleted_at`** — the column is read as a
guard in several places and written by nothing. There is no
account-deletion flow yet, so no soft-deleted account with a live
coordinator membership can exist. F2 is a **latent guard**, not a live
hole, and it is accepted on that basis: the guard belongs in place
*before* the deletion path is built, not after.

**The SND-02 family gap is queued, not silently fixed.**
`hc.accept_sender` (`20260818120006:77`) and `hc.revoke_sender` (`:170`)
resolve their actor with exactly the same unguarded lookup — so
`list_known_senders` was, as ADR-0020 recorded, "the SND-02 shape
verbatim". It was consistent with its siblings, and the finding is
really about the family. Those two are 4A-era **shipped** surfaces and
are writes, not reads; hardening the read while leaving the writes open
would be the more misleading state, and widening a 5A dispositions
migration into 4A authorization surfaces on a currently-unreachable
scenario is scope the owner should price, not this session. **Queued as
an owner item** (the ADR-0019 D15 mechanism that put `list_known_senders`
itself into this slice's M1): *when the account-deletion path is
designed, audit the whole live-actor family together — `accept_sender`,
`revoke_sender`, and every other definer resolving `hc.uid()` against
`public.accounts` without `deleted_at is null`.* Fixing the 5A-owned
function now costs nothing and creates no incoherence while the
scenario stays unreachable.

### D3 — F3 accepted: set semantics, and why not the boundary option

Both narrowings are reachable, which was checked rather than assumed:
`hc.write_proposals` admits **50** proposals with no document-kind limit
(`20260816010005:206–208`), and `hc.write_extractions` admits **200**
facts with **no per-field uniqueness** — `public.extractions` carries no
unique constraint on `(arrival_id, field)`
(`20260816010001:152–170`). So a second document proposal or a second
value of a key field could be silently ignored, and the outcome could
depend on payload **order**. The red leg demonstrates exactly that: with
categories `[financial, medical]` no suspect was raised, and with
`[medical, financial]` — the same two categories — one was.

**The fix restores symmetry.** The candidate side always matched with
`EXISTS` over all of a document's extractions; the arrival side now does
the same, reading every drafted document category and every value of
each canonical key field. **The settled matching contract does not
move**: same circle and subject, filed current documents, type + date +
≥ 1 corroborating pair, every contributing field PRESENT on both sides,
absence never wildcards, exact after normalisation, most-recently-filed
canonical target with ties on id, a re-run never matching itself. Only
the arbitrary first-value tie-break is removed. pgTAP 056:5–6 pin the
false-positive guard and "absence never wildcards" **through** the
change — they are green on both legs precisely so the contract can be
seen not to have moved.

**The reviewer's alternative — constrain the publication boundary to one
document proposal and one occurrence of each key field — is declined.**
It would refuse work the extraction schema legitimately produces: two
providers on one document, or a document and a task drafted from one
pass, are ordinary §6 outputs, and refusing them would turn a detector
tie-break into a restriction on what extraction may say. The settled
contract is a statement about the *predicate*, not about the payload's
shape.

**This aligns with a settled ruling rather than reopening one.** Q-A
settled §6.6's "same categories" as *the categories* — plural — of the
arrival's own pending document proposals, and `hc.record_context_for`
already gathers all of them distinctly. The detector's `LIMIT 1` was
inconsistent with the ruling the same slice had adopted; the fix closes
that gap. The reviewer's Q-A answer makes the same point.

## The pointed questions — ratified

The reviewer ratified **all seven** (Q-A–Q-G) with argument, including
the two the author most expected to be challenged (Q-C's direct
provenance edge, Q-D's enum-append placement). No question is amended.
**ADR-0020 is therefore ratified as written**, with this ADR carrying
the three fixes its D-numbers did not anticipate. Q-E is ratified with
the reviewer's own caveat recorded: the 431 → 442 → 448 archaeology was
taken on trust, not re-run.

**Q-B's annex is adopted.** TSD §4.8's "Keep both and ask: no fact
written; a task is drafted instead" gains **annex A11**, reconciling the
word "drafted" with Q9's settled committed-object behaviour: *"no fact
is written; the conflict's drafted task commits as the approval's one
object (unassigned — §3.6)."*

## The recorded observations — none a defect

1. **The evidence ledger was not independently reproduced.** Correct and
   expected: the reviewer had no repository access by construction. CI
   re-demonstrates the DB suites and the upgrade leg at the pushed head;
   the F12 per-directory binding was separately reproduced in-session by
   the author before commissioning (all six tree hashes matched, and the
   tail after `2eab0f3` is `docs/`-only).
2. **Conflict replay is narrower than full request equivalence.** Kept
   as-is. Q9 settles the outcome-bearing identity for this increment,
   and the reviewer explicitly declines to classify the broader semantics
   as a 5A defect. Recorded here so the question is findable when the
   5B approval surface is built.
3. **`arrivals.duplicate_of_document_id` is retained after resolution.**
   As designed (ADR-0020 D6) — the trace of the question that was asked.
   The consumer caution is real and belongs with the 5B surface: the
   pointer is not evidence that the arrival is still unresolved; the
   STATE is.

## What this round changed

- **`20260821120006_round15_fixes`** (M6) — three replaced functions,
  ownership and grants restated, no shipped migration edited.
- **pgTAP `056_round15_fixes`** — 8 assertions; **concurrency case 44** —
  the behavioural half of F1.
- **TSD annex A11** (Q-B), **`docs/coverage.md`** re-referenced, this ADR.

## Verification at the disposition head

Evidence head **`a0f194b`** (the M6 green commit — the last commit
moving a non-docs tree); everything after it is `docs/`-only, so the
F12 binding transfers:

- Clean-leg reset → `verify-migration-state` **exact 60 applied == 60
  files** (54 + 5 + M6)
- pgTAP **1497/1497 across 57 files** (1489 + 056's 8)
- Concurrency **70/70 across 44 cases**, teed
- `db:verify` clean under `--fail-on warning`
- vitest **448/448 across 53 files** — see the honesty note below
- lint / typecheck / production build clean; both CI scanner scripts
  exit 0
- The upgrade leg (base → `migration up` → 60 → both suites) is CI's to
  demonstrate at the pushed head, per the round's brief

**Honesty note on vitest.** The first run at this head reported
**447/448 with one failed file**, immediately after the database reset
and the concurrency suite (duration 178 s against a normal ~54 s). Two
subsequent runs were clean at 448/448 across 53 files. The failure was
**not identified before it stopped reproducing**, so it is recorded as
an unreproduced transient under load — consistent with the recorded
forks-worker spawn transient — and explicitly *not* claimed as
diagnosed. CI's own run is the independent check.

## Consequences

- **The migration bound is SPENT: 6 of ≤ 6.** Any further DDL before
  merge is an owner bound-amendment, not a session decision.
- `hc.finalize_extraction` now holds the per-circle lock for a strictly
  longer window — from before detection rather than from
  `advance_arrival`. The added span is one `stable` SQL query against
  `documents` + `extractions` on indexed columns, inside a transaction
  that was going to take the same lock a statement later. Extraction
  finalization is already serialized per circle by design; this does not
  change what contends, only for how long.
- **One owner-queue item opens**: the SND-02 live-actor family audit
  (D2), to be taken with the account-deletion path.
- ADR-0020 is ratified as written; TSD gains annex A11.
- Round 15 ends at the gate: **owner sign-off and merge (never squash)
  are the owner's**, each its own session unless the owner rules
  otherwise in-session.
