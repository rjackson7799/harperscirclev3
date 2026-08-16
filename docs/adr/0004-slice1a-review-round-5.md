# ADR-0004 — Third-party review round 5: the built 1A kernel, findings, dispositions

**Status:** Accepted
**Date:** 2026-08-15
**Packet reviewed:** `docs/review/round-5-packet.md` and the slice branch
it describes (`slice/1a-authorization-kernel`, PR #1 @ `b958959`) —
migrations, policies, definer functions, tests, coverage manifest —
against PRD v1.3 and TSD §2.1–§2.3, §3.1–§3.8. This round reviews the
kernel **as built**; ADR-0003 (round 4) bound the design it implements.

**Reviewer verdict:** *safe with named minimum changes* — the
authorization boundary is fail-closed with no request-path escalation or
freeze-lift path found, but the custodianship receipt is not durably
subject-bound, the audit digest omits material columns, and two coverage
claims exceed what their tests prove. All named changes are applied on
the slice branch before merge (this document records where).

## Findings and dispositions

| # | Severity | Finding | Disposition | Applied where |
|---|---|---|---|---|
| 1 | SHOULD-FIX | Custodianship declarations carry only `subject_name`; two subjects may share a first name, and a later-modified creation path could log one name and create a different subject behind a superficially valid receipt | **Accepted.** Subject UUIDs are preallocated before the declaration loop; the `access_log (circle_id, subject_id)` FK becomes DEFERRABLE INITIALLY DEFERRED; declarations are written **with** the subject_id they precede, and the subjects are inserted under those ids in the same transaction. Name stays in `detail` for the human receipt | M10; `hc.create_circle()`; 006 (CIR-02) |
| 2 | SHOULD-FIX | The audit hash excludes `actor_session_id`, `request_id`, `corrects_id` (and the collapsed_* pair) — forged session/request/correction metadata would still verify; "recomputable from the stored row" held only for a projection | **Accepted.** A **versioned canonical digest** (`v: 1`) now covers every immutable evidentiary column including session, request and correction linkage. `collapsed_count`/`collapsed_until` are deliberately excluded **as mutable presentation counters** (the reviewer's own alternative): the hash covers immutable events, and 1D's denial-collapse design must not mutate hashed fields. `hc.log()` gains `p_corrects_id` so correction linkage is writable through the one writer. The independent 006 recompute reconstructs the complete v1 canonical | M10; `hc.log()` v1 entry; 006 (INV-11) |
| 3 | SHOULD-FIX | Per-claimant rate limiting compares raw text — case, whitespace or phone punctuation buys a fresh budget and evades the dismissed-claimant prohibition | **Accepted.** `hc.contact_key(text)` canonicalises (typed keys: lower/trim email-shaped input; digits-only for phone-shaped input) and is stored in `freeze_claims.claimant_contact_key`; all three rate-limit dimensions and the dismissed-prior rule key on it; the submitted form is retained verbatim in `claimant_contact`. Case/whitespace mutation tests added. No stronger intake identity verification implied | M10; `hc.request_freeze()`; 007 (FRZ-07) |
| 4 | SHOULD-FIX | CIR-01's universal claim starts from `access_log`, so a circle with **no** declaration at all passes invisibly | **Accepted.** The assertion is now driven from circles: for every circle, custodianship-declaration count equals subject count and those declarations occupy exactly seq 1..n; the no-foreign-seq-1 sweep is retained as a supplement. Manifest wording corrected | 006 (CIR-01); coverage.md |
| 5 | CONSIDER | FRZ-10's writer inventory is a `prosrc` text scan — a trigger, an out-of-schema function, unqualified names or dynamic SQL would escape it | **Partially adopted.** The proof now rests on catalogs: zero triggers on both freeze tables (asserted), the exact two-way table-privilege snapshot (002, already pinned), and the no-dynamic-SQL invariant (002); the prosrc scan is retained as a supplemental check and labelled as such. Full pg_depend derivation is not available for `$$`-quoted function bodies — noted as the mechanism's honest limit. No current extra writer exists (reviewer-confirmed) | 007 (FRZ-10); coverage.md |

## Rulings on the packet's eight dispositions

| # | Question | Ruling | Consequence applied |
|---|---|---|---|
| R1 | `hc.uid()` instead of `auth.uid()` in definer bodies | **Accepted permanently**, conditional on an equivalence regression: absent claims, `request.jwt.claim.sub`, legacy `request.jwt.claims`, conflicting claims (claim.sub wins), malformed json (same error class from both) | Equivalence block added to 002 |
| R2 | Catalog closure assertions vs the function-ACL segfault | **Accepted** for 1A; do **not** gate 1B on the upstream fix while `hc` stays out of PostgREST's exposed schemas; pin the exposed-schema list; gate any future exposure of `hc` on a live-denial test or a fixed image | `scripts/check-exposed-schemas.mjs` + CI step |
| R3 | Rate-limit constants (3/claimant/30d, 10/circle/30d, dismissed = permanent) | **Accepted as provisional defaults**, conditional on finding 3's canonicalisation; counsel owns the adjudication protocol, not necessarily these abuse-control numbers | Finding 3 applied |
| R4 | Minimal identity-table policy set | **Accepted** for 1A; no cross-circle or account-existence oracle found | none |
| R5 | `access_log` landing in 1A | **Accepted and necessary**; family reads/collapse/signing may stay pending (absence denies capability, opens nothing); findings 1–2 required before the receipt/chain count as complete evidence | Findings 1–2 applied |
| R6 | Empty `ctx.shares` placeholder | **Accepted** as fail-closed; CTX-07 stays pending until 1B | none |
| R7 | Declaration `subject_id` null as final representation | **Not accepted** — free-text name is not durable identity | Finding 1 applied |
| R8 | `gen_random_uuid()` for `pg_uuidv7` | **Accepted** (append locality only, §2.1 "where enabled") | none |

## Reviewer confirmations retained

No request-path role can assume `hc_internal` (postgres = documented
maintenance exemption) · hc_* roles NOLOGIN, `hc` not PostgREST-exposed ·
RLS enabled+forced on every public table · no definer accepts a
caller-supplied account identity; `ctx_for()`/`grant_vectors()` owner-only ·
search paths pinned, PUBLIC EXECUTE revoked, grant inventory matches the
migrations · no request-path write privilege on any 1A table · no path
updates or deletes freezes/claims · no time-based freeze expiry ·
adjudication's only transition updates an open freeze; nonexistent and
already-adjudicated ids share one P0001 shape · open freezes declaratively
whole-circle; narrowing requires metadata + rationale · `visible_at()`
guard order verified, the two mutation tests exercise the dangerous
regressions · removed memberships contribute nothing; reachable subjects
present even with empty grants · circle-consistent composites prevent
cross-circle attachment everywhere · identity policies return foreign rows
as zero rows, not differing errors · pending 1B–1D items are not presently
callable and not load-bearing for 1A safety.

## Process note

Fixes land as one red→green pair on the slice branch (signatures in the
red commit), followed by re-verification and a packet addendum. Per the
owner's decision, **this round's session stops before merge**: the merge
and the 1B kickoff wait for the owner's sign-off on the fixed branch.
