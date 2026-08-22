# Round 15 — third-party review findings (slice 5A, the extraction + interpretation DB increment; received 2026-08-21, verbatim)

*[Landing note — this paragraph is the landing session's, not the
reviewer's. The review was commissioned from **GPT 5.6 Sol**, a
different model family than the author, against the self-contained
round-15 commissioning package (the brief + `round-15-packet.md` +
ADR-0020 + `slice-5-plan.md` + the five migrations + pgTAP 051–055;
vault-side at `04-evidence/round-15-commission-2026-08-21/`), at PR
head `8011e5a` / evidence head `2eab0f3`, base `main` @ `7832d53`. The
reviewer returned **three findings — one HIGH, two MEDIUM — all seven
pointed questions Q-A–Q-G ratified, and three recorded observations**;
it did not supply the brief's one-line verdict header, and none has
been invented here. Everything below the rule is the reviewer's output
unedited. Dispositions are the next session's, per ADR-0006 — nothing
here is argued, accepted, or declined yet.]*

---

## What was independently verified

The supplied SQL independently establishes that:

- All newly introduced SECURITY DEFINER functions set search_path = '', use schema-qualified relations, and narrowly grant execution to their intended roles.
- hc.log_artifact_read derives its actor from hc.uid(), requires a live account and arrival, and repeats the stated hc.visible_at(..., 'arrival', ...) >= 'view' authorization predicate.
- hc.record_context_for derives circle and subject from the arrival, applies the documented caps, reports omissions, and uses explicit ordering and UTC rendering where required.
- Extraction runs are created in the extract claim transaction and closed structurally through the lease trigger.
- hc.write_extractions implements transactional supersede-not-append behavior and binds published fact stamps to the extraction run.
- Conflict outcomes are constrained to the three settled values and included in replay comparison.
- The stage-2 state has exactly the three settled graph edges, and the two resolution paths use a lease, CAS transition, and appropriate terminal or requeue behavior.
- The pgTAP tests cover the advertised ordinary authorization cases, single-document duplicate predicate, state graph, outcome behavior, run lifecycle, and deterministic single-target selection.

I did not independently verify the two GitHub Actions runs, recorded clean/upgrade suite totals, browser gate, directory hashes, or gitleaks result. I also could not verify definitions omitted from the package, including hc.visible_at, hc.log, hc.advance_arrival, prior table constraints, or the concurrency harness implementation.

## Findings

### HIGH — Stage-2 detection can miss a document filed concurrently

Location: supabase/migrations/20260821120005_duplicates_stage2.sql, hc.finalize_extraction, specifically the call to hc.detect_stage2_duplicate before hc.advance_arrival.

Failure scenario: Transaction A begins hc.finalize_extraction for an extracting arrival. Transaction B is concurrently approving a matching document in the same circle and has not committed it. A runs hc.detect_stage2_duplicate before acquiring the serialization point used by hc.advance_arrival, so its statement snapshot cannot see B's document. A then reaches hc.advance_arrival and waits for the per-circle advisory lock held by B. B commits the matching document; A acquires the lock but does not repeat detection, advances to extracted, and publishes without entering duplicate_suspected_stage2.

The final state therefore depends on transaction timing: the matching document exists before A commits, yet the arrival bypasses the settled stage-2 duplicate question.

Why existing tests do not catch it: Test 055 creates all candidate documents before calling finalize_extraction. The described concurrency additions cover stage-2 resolution versus freeze, but the package records no case racing duplicate detection against concurrent document approval/publication.

Recommended fix: Use M6 DDL to place detection behind the same serialization point that guards record publication, or otherwise re-run the predicate after acquiring that point and before choosing the CAS target. Add a two-session regression where a matching document commits while finalization is waiting; the finalization must enter duplicate_suspected_stage2.

### MEDIUM — Deleted coordinators retain the known-sender read capability

Location: supabase/migrations/20260821120001_inherited_obligations.sql, hc.list_known_senders.

Failure scenario: An account remains referenced by a live coordinator circle_members row but its public.accounts.deleted_at is set. hc.uid() still resolves that account ID. The function's account lookup checks only a.id = v_actor, unlike hc.log_artifact_read, which also requires a.deleted_at is null. The surviving membership predicate then authorizes the deleted account to enumerate live accepted sender addresses/domains and acceptance metadata.

This contradicts the function's claimed live-actor authority boundary and leaves a sensitive administrative read available unless every account-deletion path synchronously removes all memberships.

Why existing tests do not catch it: Test 051 exercises no identity, coordinator, non-coordinator, foreign account, and nonexistent circle cases, but does not soft-delete the calling coordinator while leaving its membership live.

Recommended fix: Use M6 DDL to require public.accounts.deleted_at is null in hc.list_known_senders, matching hc.log_artifact_read, and add a pgTAP fixture proving a deleted coordinator receives the normalized sender_refused result.

### MEDIUM — Duplicate detection examines only one drafted document proposal

Location: supabase/migrations/20260821120005_duplicates_stage2.sql, hc.detect_stage2_duplicate, CTE me, category subquery using LIMIT 1.

Failure scenario: One extraction publication contains two document proposals. The first category has no matching filed document; the second category, with the same extracted date and corroborating field, does. The detector selects only one proposal category through LIMIT 1, evaluates candidates solely against that category, returns null, and finalization advances to extracted. Reversing proposal order can change the outcome.

Multiple document proposals are compatible with the surrounding array-shaped interface, and hc.record_context_for explicitly gathers all distinct pending document categories. The detector silently narrowing that set to one category is therefore inconsistent with the supplied data model.

The same structural concern applies to repeated key fields in p_facts: each key subquery takes one row without rejecting duplicates or defining which occurrence is authoritative.

Why existing tests do not catch it: Test 055's publication helper creates at most one document proposal, and its fact helper creates at most one value for each key field. It therefore cannot expose category narrowing or repeated-key ambiguity.

Recommended fix: Use M6 DDL either to enforce exactly one document proposal and one occurrence of each canonical key field at the publication boundary, or make detection evaluate every drafted document category with an explicitly defined rule for repeated fields. Add pgTAP cases for two document proposals and duplicate key-field entries.

## Answers to Q-A–Q-G

Q-A — Ratify
Using the arrival's own pending document-proposal categories is coherent with the interpretation sequence and preserves the intended arrival-dependent document section. It also avoids returning every historical category indiscriminately. The M5 detector must, however, honor the full category set rather than selecting one arbitrary proposal.

Q-B — Ratify the build and adopt the annex
The settled Q9 decision says the task commits as the approval's one object. Requiring a drafted task block avoids database-authored copy, and committing it unassigned preserves the separate assignment decision. Annex A11 accurately reconciles the earlier word "drafted" with the settled committed-object behavior.

Q-C — Ratify
Given the settled premise that a confirmed second copy adds citation provenance rather than a new information class, a direct document-from-arrival edge without taint growth is internally coherent. Extending a general taint-propagating primitive with exceptional no-growth behavior would broaden a more dangerous surface.

Q-D — Ratify
Placing the enum append at M4's tail respects the recorded PostgreSQL enum-visibility rule, keeps every use in the following migration, edits no shipped migration, and preserves M6 for review dispositions. The placement is unusual but technically and procedurally justified.

Q-E — Ratify
The package supplies a coherent test-count history from 431 to 442 to 448 and states that 448 was checked at the exact base. I did not independently rerun that archaeology, so the numeric evidence remains taken on trust.

Q-F — Ratify
The bare runtime login failing before it can resolve schema hc is the expected stronger consequence of removing inherited privileges. Testing the membership catalog through the explicit request-role channel correctly distinguishes the intended SET ROLE capability from forbidden bare-login inheritance.

Q-G — Ratify
Only use_new approves and publishes the proposed high-risk value. keep refuses that value, while keep_both commits a task rather than the value. Requiring value confirmation for the latter outcomes would misdescribe what the person is confirming.

## Recorded dissents and observations

Observation — The evidence ledger was not independently reproduced
The CI conclusions, suite totals, upgrade rehearsal, browser results, directory bindings, and secret scan are internally consistent in the package but were not independently rerun. This is not a defect finding.

Observation — Conflict replay remains deliberately narrower than full request equivalence
The replay comparison binds proposal, actor, and conflict outcome, but not the complete edit payload or presented expected version. Q9 settles the outcome-bearing identity requested for this increment, so this review does not classify the broader replay semantics as a slice-5A defect.

Observation — Direct provenance retains the canonical pointer
Keeping arrivals.duplicate_of_document_id after resolution is useful audit history. Consumers must treat it as the recorded target of the resolved question, not as proof that the arrival remains unresolved.
