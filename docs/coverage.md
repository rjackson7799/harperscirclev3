# Coverage manifest

Authoritative **per assertion** (ADR-0003 findings 4 and 6). A requirement
spanning layers is split into one assertion per layer; an assertion whose
machinery lands in a later slice is `pending` and **never green**. Layers:
`pgTAP` · `multi-session` · `HTTP` · `storage` · `worker` · `review`
(properties enforced by reading the migrations, not by a runtime probe).
Tests live in `supabase/tests/`; `NNN:x–y` means that file's pgTAP case
numbers.

Statuses: **green** (asserted, passing) · **pending** (staged to the named
slice; the absent machinery is non-callable today) · **review** (process
property, verified at review gates).

## 1A — schema and privilege invariants (TSD §2.1–§2.3, §3.13)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| INV-01 | Every table in `public` has RLS enabled **and** forced | §2.1 | pgTAP | 1A | green | 001:31 |
| INV-02 | `hc.access_level` ordinal sequence ascending | §2.2, ADR-0002 c8 | pgTAP | 1A | green | 001:19 |
| INV-03 | Every §2.2 enum exists with exact ordered labels | §2.2 | pgTAP | 1A | green | 001:19–28 |
| INV-04 | `hc.all_domains()` = `enum_range(null::hc.domain)`; `hc.dom()` round-trips it | §2.2, §3.3 | pgTAP | 1A | green | 001:29–30 |
| INV-05 | Every FK between two circle-scoped tables is circle-consistent | §2.1 | pgTAP | 1A | green | 001:37 (catalog sweep) + fk_ok cases 32–34, 38–39, 49–50 |
| INV-06 | AC-ADMIN-3 declarative: composite FK to `accounts(id, kind)`; admin refused from membership (23503); member cannot flip to admin (23503) | §2.3, ADR-0002 c7 | pgTAP | 1A | green | 001:32 · 006:17–18 |
| INV-07 | One membership row per subject (partial unique) | §2.3 | pgTAP | 1A | green | 001:35 |
| INV-08 | `admin_users.mfa_enrolled_at` NOT NULL (AC-ADMIN-5) | §2.3 | pgTAP | 1A | green | 001:36 |
| INV-09 | `access_log` rejects UPDATE and DELETE **both ways** (privilege absent + unconditional trigger) | §2.8 | pgTAP | 1A | green | 001:41–43, 46–48 |
| INV-10 | Denial entries name no object (`denial_names_no_object`, AC-PPL-7) | §2.8 | pgTAP | 1A | green | 001:44 |
| INV-11 | `seq` unique per circle; gapless; chain linked; `entry_hash` recomputes as the **complete v1 canonical** — every immutable evidentiary column incl. session/request/correction linkage (collapsed_* excluded as mutable presentation, by design); the declaration FK is DEFERRABLE | §2.8; ADR-0004 F1/F2 | pgTAP | 1A | green | 001:45, 51, 54 · 006:13–16 |
| INV-12 | Invite token hash unique (single-use anchor) | §2.3 | pgTAP | 1A | green | 001:40 |
| INV-13 | No unexpected PUBLIC grants: tables zero; functions zero; deny-by-default ACLs in place for runner and `hc_internal` | ADR-0003 f8 | pgTAP | 1A | green | 001:13–14 · 002:5, 12 |
| INV-14 | Two-way privilege snapshot: our five roles hold exactly the expected inventory; anon/hc_pipeline/hc_admin hold **nothing** | §1.2, §3.7 | pgTAP | 1A | green | 002:10–11 |
| INV-15 | `hc_internal` policy list pinned to its exact sixteen names (cannot grow silently) | §3.4 | pgTAP | 1A | green | 002:13 |

## 1A — definer-function invariants (plan §definer; ADR-0003 finding 8)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| DEF-01 | Non-login owner: every `hc` function owned by `hc_internal`; NOLOGIN | plan | pgTAP | 1A | green | 001:4 · 002:1 |
| DEF-02 | SECURITY DEFINER only where required (exactly six) | plan | pgTAP | 1A | green | 002:3 |
| DEF-03 | `search_path` pinned on every definer (+ `hc.log`) | plan | pgTAP | 1A | green | 002:4 |
| DEF-04 | PUBLIC EXECUTE revoked per-function **and** by global default privileges | plan | pgTAP | 1A | green | 002:5 · 001:13–14 |
| DEF-05 | Exact overload inventory — no unexpected executable overloads | plan | pgTAP | 1A | green | 002:2 |
| DEF-06 | Explicit grants to named callers, exactly | plan | pgTAP | 1A | green | 002:6 |
| DEF-07 | No request-path/admin role a member of (or SET ROLE into) `hc_internal` (postgres = documented maintenance exemption) | plan | pgTAP | 1A | green | 002:7 |
| DEF-08 | No unreviewed dynamic SQL (1A allowlist is empty) | plan | pgTAP | 1A | green | 002:8 |
| DEF-09 | No caller-selectable identity outside `hc.ctx_for()`/`hc.grant_vectors()`; both executable by nothing request-facing | §3.2 | pgTAP | 1A | green | 004:22–25 · 007:54–55 |
| DEF-10 | Uniform result shapes: unauthorized vs nonexistent indistinguishable (`P0001` pair) | §3.9 posture | pgTAP | 1A | green | 007:41, 45 |
| DEF-11 | Owner and caller schema USAGE verified | plan | pgTAP | 1A | green | 001:16–18 · 002:9 |
| DEF-12 | Creation, ownership, revoke, grants atomic within one migration | plan | review | 1A | review | migration files M2, M6–M9 |

## 1A — `hc.visible_at()` truth table (TSD §3.3, §3.13, A.4)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| VIS-01 | Clause order 1→5 asserted independently (1-before-5, 2-before-4/5, 3-before-5, 3-not-falling-through) | §3.3 | pgTAP | 1A | green | 003:10, 12, 21, 16 |
| VIS-02 | Unresolved/NULL/empty taint → hidden at every rung below manage (AC-PERM-9); manage-on-five clears | §3.3, A.4 | pgTAP | 1A | green | 003:15–22 |
| VIS-03 | Freeze closes custodian and coordinators; share does not lift; missing/NULL `frozen` key freezes (AC-PERM-11) | §3.3, §3.8 | pgTAP | 1A | green | 003:11–14 |
| VIS-04 | A share cannot manufacture subject context (revoked-grants + kept-share case) | §3.3, A.4 | pgTAP | 1A | green | 003:9–10 |
| VIS-05 | care_circle ceiling incl. null owner; share passes the ceiling to view (AC-TASK-5) | §3.3 | pgTAP | 1A | green | 003:23–26 |
| VIS-06 | Share widens ONE named object to view — never a domain, never another id/type, never past manage | §3.3 | pgTAP | 1A | green | 003:27–31 |
| VIS-07 | Ladder = min over taint as containment; `hidden` in taint ⇒ object does not exist (AC-PERM-6/7) | §3.1 | pgTAP | 1A | green | 003:5–8, 32–36 |
| VIS-08 | `hc.dom()` refuses unknown domain names (22P02) | §2.2 | pgTAP | 1A | green | 003:4 |
| VIS-09 | Mutation test: freeze-clause removal → 003:11–14 red; lineage-clause removal → 003:16–21 red; restored green | plan | review | 1A | review | recorded in PR description |

## 1A — authorization context (TSD §3.2)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| CTX-01 | A row for EVERY reachable subject; all-hidden subjects present-but-empty | §3.2 | pgTAP | 1A | green | 004:4–5, 10 |
| CTX-02 | Removed membership contributes nothing (circles and subjects) | §3.2 | pgTAP | 1A | green | 004:2, 6 |
| CTX-03 | Cumulative vectors: manage ⊆ view ⊆ summary ⊆ log | §3.2 | pgTAP | 1A | green | 004:7–11 |
| CTX-04 | `frozen`: open ⇒ whole circle; narrowed unresolved ⇒ named subject (other reopens); unnarrowed unresolved ⇒ whole circle; dismissed clears | §3.8, ADR-0001/0003 | pgTAP | 1A | green | 004:16–21 |
| CTX-05 | `hc.ctx_for(account)` ≡ `hc.ctx()` for that account; memberless ctx empty-but-well-formed | §3.2 | pgTAP | 1A | green | 004:26–27 |
| CTX-06 | ctx `shares` key present-and-empty (placeholder) | plan d2 | pgTAP | 1A | green | 004:15 |
| CTX-07 | ctx `shares` populated from `object_shares`; ctx body per §3.2 verbatim (subjects entries additionally carry `cap`, ADR-0005 D5) | §3.2 | pgTAP | 1B | green | 015:6–7, 14–16 |

## 1A — identity-table RLS (§3.4 shape; Appendix A.1 subset)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| RLS-01 | A member reads own circle's rows; foreign circle returns **zero rows** (indistinguishable from nonexistence) | §3.4, AC-PERM-2 posture | pgTAP | 1A | green | 005:1–6 |
| RLS-02 | accounts self-row only; own grants only; admin_users and invites unreadable | plan d3 | pgTAP | 1A | green | 005:5–6, 10–11 |
| RLS-03 | Write privilege absent for authenticated on every 1A table (42501) | §3.7 posture | pgTAP | 1A | green | 005:7–9 |
| RLS-04 | anon holds nothing (42501) | §1.2 | pgTAP | 1A | green | 005:14 |
| RLS-05 | `hc_admin` gets `permission denied for table` — the A.1 distinguished failure mode, privilege absent, no policy consulted (AC-ADMIN-1) | A.1 | pgTAP | 1A | green | 005:15–17 |
| RLS-06 | A.1 five per-domain negatives against record tables, each with a distinguishing positive control; the five hc_admin permission-denied variants | A.1 | pgTAP | 1B | green | 010:31–45 |
| RLS-07 | A.3 twenty ordered-pair matrix, generated from one rule (1B channels: direct select = every count, hc.presence; search/notification/export staged — RLS-11) | A.3 | pgTAP | 1B | green | 017:1–5 |
| RLS-08 | A.2 revoked live session: the NEXT query on the SAME connection returns zero rows | A.2 | multi-session | 1B | green | test:concurrency case 4 |
| RLS-09 | A.2 invite token replayed after acceptance creates nothing (AC-PERM-4) — sequential AND racing (a revocation committing mid-wait defeats the acceptance the same way) | A.2, §5.10 | pgTAP + multi-session | 2A | green | 037:25–27 · concurrency 27 |
| RLS-10 | A.2 artifact-route 404 indistinguishability; pre-revocation URL fails | A.2, §1.3 | HTTP | **slice 2+** | **pending** | route does not exist |

## 1A — circle creation (TSD §2.3, AC-AUTH-6)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| CIR-01 | Universal, driven from **circles** (a circle with no declaration cannot pass invisibly): every circle carries one declaration per subject at exactly seq 1..n, before any other event; the seq-1 sweep retained as supplement | §2.3; ADR-0004 F4 | pgTAP | 1A | green | 006:3–4, 23 |
| CIR-02 | Declaration is **durably subject-bound**: preallocated subject id under the deferred FK, plus name/custodian/date in detail | §2.3, PRD §7.5; ADR-0004 F1 | pgTAP | 1A | green | 006:5 |
| CIR-03 | Subject-member rows: no account, founder custodian, coordinator tier (AC-PPL-3) | §2.3 | pgTAP | 1A | green | 006:7 |
| CIR-04 | Founder manage×5 per subject; each subject-member manage×5 on own record | §2.3, PRD §7.5 | pgTAP | 1A | green | 006:9–10 |
| CIR-05 | Two-subject cap refused in-function (deliberately not a fake CHECK) | §2.3 note | pgTAP | 1A | green | 006:11–12 |
| CIR-06 | Attach-parent-login: one UPDATE, row still subject-bound, custodianship retained (§3.13 regression) | §2.3, auth §6 | pgTAP | 1A | green | 006:19–20 |
| CIR-07 | Unauthenticated refusal; EXECUTE to authenticated only | plan | pgTAP | 1A | green | 006:1, 21–22 |

## 1A — freeze (TSD §2.3, §3.8; ADR-0001 as amended by ADR-0003)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| FRZ-01 | Open freeze cannot name a subject (`freezes_open_is_whole_circle`) | ADR-0001 | pgTAP | 1A | green | 007:1 |
| FRZ-02 | No non-open state without adjudication metadata (`freezes_outcome_is_adjudicated`) | ADR-0003 f2 | pgTAP | 1A | green | 007:2 |
| FRZ-03 | No narrowing without recorded assessment (`freezes_narrowing_is_assessed`) — direct AND through the function | ADR-0003 f2/f3 | pgTAP | 1A | green | 007:3, 42 |
| FRZ-04 | One OPEN freeze per circle; per-circle scope; re-freeze after a finding allowed | PRD §7.5 | pgTAP | 1A | green | 007:5–6, 49–50 |
| FRZ-05 | Claims disposition ⟷ attachment check; every report recorded incl. rate-limited | ADR-0003 f1 | pgTAP | 1A | green | 007:7–9, 33, 37–38, 40 |
| FRZ-06 | Second claimant attaches to the same freeze — report never swallowed | ADR-0003 f1 | pgTAP | 1A | green | 007:31–33 |
| FRZ-07 | Rate limits key on the **canonical contact** (hc.contact_key; verbatim form retained): dismissed-prior claimant refused; 3/claimant/circle/30d; 10/circle/30d; case/whitespace variants share one budget | PRD §7.5; ADR-0004 F3/R3 | pgTAP | 1A | green | 007:35–40, 51, 57–59 |
| FRZ-08 | Direct INSERT/UPDATE/DELETE refused on both tables from EVERY request-path entry point (42501, before any policy) | §2.3 | pgTAP | 1A | green | 007:10–22 |
| FRZ-09 | `hc_internal` bounded: freezes never deleted; claims ledger append-only even for the writer role | §2.3 | pgTAP | 1A | green | 007:23–26 |
| FRZ-10 | Writer proof rests on catalogs: exact table-privilege snapshot + zero triggers on both freeze tables + no dynamic SQL; the prosrc inventory scan is the labelled supplemental check | §2.3; ADR-0004 F5 | pgTAP | 1A | green | 002:8, 10–11 · 007:52–53, 56 |
| FRZ-11 | Freeze request/claim/adjudication are access-log events; claimant PII never in the log | PRD §7.5 | pgTAP | 1A | green | 007:30, 34, 46 |
| FRZ-12 | Adjudication outcomes: dismissed/upheld clear `frozen`; narrowed unresolved holds named subject, reopens the other; unnarrowed holds whole circle | §3.8 | pgTAP | 1A | green | 004:16–21 · 007:41–48 |
| FRZ-13 | Unresolved read-only carve-out: coordinators-not-objected-to at frozen=false + cap=view (visible_at applies least(result, cap) LAST); null objected_to ⇒ everyone closed | §3.8, ADR-0005 D2/D5 | pgTAP | 1B | green | 016:1–17 |
| FRZ-14 | `hc.approve_proposal()` refuses under freeze — open AND unresolved, named signature freeze_active | §3.7 | pgTAP | 1B | green | 013:17–18 |
| FRZ-15 | Frozen arrival parked (claim AND advance refuse, store exempt); NO retry consumption (zero leases minted, asserted across a mid-wait race); terminal-transition refusal by the same predicate; outbox re-enqueue on dismissal IN the adjudication transaction (upheld/unresolved write nothing); sweeper skips parked work for re-queueing, exhaustion, stuck and queue-age; lost outbox message recovered by the ordinary sweeper | §4, A.5 | pgTAP + multi-session | 1C | green | 020:27–33 · 022:18–20 · 026:1–16 · concurrency 13–14; the pgmq relay itself is RLY-01 (pending) |
| FRZ-16a | Freeze suspends INVITES at circle level: creation AND acceptance refuse with the named freeze_active (open or unresolved, however narrowed); a freeze committing while an acceptance waits defeats it. Built as SUSPEND per TSD §2.3 — PRD §7.5 says "voided"; divergence flagged (ADR-0012) | §2.3, PRD §7.5 | pgTAP + multi-session | 2A | green | 037:15–17 · concurrency 26 |
| FRZ-16b | Freeze suspends exports and deletions at circle level | §2.3 | pgTAP | **2+** | **pending** | no export or deletion surface exists through 2A (DEL-01/G5 companions); split from FRZ-16 (ADR-0012) |

## 1A — performance (TSD §3.2, §3.12; ADR-0002 n2; ADR-0003 f9)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| PRF-01 | Every textual `(select hc.ctx())` reference is an InitPlan node; any SubPlan is hashed (one-shot); zero per-row plans | ADR-0002 n2 | pgTAP | 1A | green | 008:1–4 |
| PRF-02 | **Measured** ctx() executions == textual references (1 and 2), never per row, over a visible scan at volume | ADR-0003 f9 | pgTAP | 1A | green | 008:5–7 |
| PRF-03 | Volume wall clock under the 250 ms O(rows) tripwire (measured 2.9 / 11.2 ms local; §1.8 page budget 1.5 s) | §3.12, §1.8 | pgTAP | 1A | green | 008:8–9 |
| PRF-04 | InitPlan/LEFT-JOIN null-extension regression against the real search schema: measured ctx() == 6 textual refs over a 300-row §7.2 scan, never per row; the summary caller's row arrives NULL-extended, not filtered | §7.2, ADR-0002 c1; ADR-0009 D7 | pgTAP | 1D | green | 029:10, 22–23 · 000 keeps the synthetic pin |

## Round-5 conditions (ADR-0004)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| UID-EQ | `hc.uid()` ≡ `auth.uid()`: absent claims, claim.sub, legacy claims, conflicting (claim.sub wins), malformed → same error class | ADR-0004 R1 | pgTAP | 1A | green | 002:14–18 |
| PIN-01 | PostgREST exposed schemas pinned to [public, graphql_public] — `hc` never exposed; exposure gated on live-denial test or fixed image | ADR-0004 R2 | CI | 1A | green | scripts/check-exposed-schemas.mjs + ci.yml step |

## Platform regression net (pre-1A)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| PLT-01 | The 15 Postgres behavioural assumptions from the Step-2 spike | ADR-0002 | pgTAP | init | green | 000:1–15 |
| PLT-02 | Lock ordering: raw opposite-order repro deadlocks (exactly one 40P01 ×3); the same contention through approve serializes on the per-circle advisory lock (×10, zero deadlocks) | ADR-0002 n3, ADR-0005 D6 | multi-session | 1B | green | test:concurrency cases 1–2 |
| PLT-03 | ALTER TYPE … ADD VALUE upgrade-path fixture: M3 ADDs claimed/exhausted and uses neither; M4 is first use; 021 pins the eight labels in order, proves the committed pair casts, and probes 55P04 LIVE against the real enum; the CI upgrade leg applies the split increment to the shipped base on every run | ADR-0002 n5, ADR-0003 f7 | pgTAP + CI | 1C | green | 021:1–3 · ci.yml upgrade leg |
| PLT-04 | Function-ACL-denial segfault on this image (backend signal 11) — closure asserted via catalog until fixed upstream | this slice | review | 1A | review | round-5 packet, upstream report |

## 1B — record schema and write path (TSD §2.4–§2.6, §3.5–§3.7; ADR-0005)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| ING-01 | §2.4 prerequisite tables (arrivals, proposals, approval_attempts, proposal_commits): shapes, checks, one-live lineage index, circle-consistent composites; fail-closed for every request-path role (1B posture; 1C opened exactly the staged reach — ING-02, machinery grants in 002's snapshot) | §2.4, ADR-0005 D1 | pgTAP | 1B | green | 009:1–39 |
| REC-01 | Shared tenancy/provenance/taint block NOT NULL on all five record tables; approved_* carry NO default | §2.5 | pgTAP | 1B | green | 010:7–8 |
| REC-02 | dsc pins circle AND subject via the ONE composite FK (carries the cascade; the §2.1 sweep forbids the circle-blind second FK) | §2.5, §2.1 | pgTAP | 1B | green | 010:15–18 · 001:37 |
| REC-03 | profile_facts supersession: one current per (subject, field); supersede-then-insert is the only path; approval marks old and links old↔new | §2.5, AC-INBOX-6 | pgTAP | 1B | green | 010:19–22 · 013:21–24 |
| REC-04 | §2.7 temporal shapes: three accepted, conflation refused | §2.7 | pgTAP | 1B | green | 010:23–26 |
| REC-05 | dsc: ZERO grants in both directions for every role incl. hc_internal until 1D | §2.5, plan | pgTAP | 1B | green | 010:44–48 · 002:19 |
| GRD-01 | Provenance quartet immutable on all five record tables + proposals (per-column on documents, 16-probe sweep elsewhere) | §3.7, N2 | pgTAP | 1B | green | 011:1–5 |
| GRD-02 | Taint never shrinks; marker row-scoped to new.id; false→true resolved only under the marker; true→false always open | §3.7, PRD §7.6 | pgTAP | 1B | green | 011:6–15 |
| GRD-03 | Trigger inventory exact: guard ×6 + claim ×5; dsc none | §3.7, §2.4 | pgTAP | 1B | green | 011:17 · 002:20 |
| TNT-01 | link_provenance: ONE refusal shape for missing/cross-circle/cross-subject; unsupported endpoint types refused; cycle refused BEFORE the write | §2.6 | pgTAP | 1B | green | 012:21–25 |
| TNT-02 | Delta growth: child at link, GRANDCHILD at propagate (the stale-recompute regression), diamond idempotent | §2.6, §3.13 | pgTAP | 1B | green | 012:11–20 |
| TNT-03 | Depth cap: applied under it, MARKED at it, nothing silently widened past it | §2.6, AC-PERM-9 | pgTAP | 1B | green | 012:26–29 |
| TNT-04 | Walk failure ⇒ marked-and-committed; partial updates rolled back to the savepoint | §2.6 mech 1 | pgTAP | 1B | green | 012:30–32 |
| TNT-05 | Reclassify: manage-on-current-taint; path-complete (a second path retains its domain); resolved restored only by completed recompute; audience_changed names both audiences; nonexistent/unauthorized ONE shape | §2.6, AC-DOC-6, DEF-10 | pgTAP | 1B | green | 012:33–41 |
| TNT-06 | Sweep marks dangling and cross-circle edges (detector 3) | §2.6 mech 3 | pgTAP | 1B | green | 012:43–45 |
| TNT-07 | Growth-vs-shrink serialize on the per-circle advisory lock (blocking asserted from pg_locks; serial-equivalent result); an aborted link writes nothing | §2.6, ADR-0005 D6 | multi-session | 1B | green | test:concurrency case 3 |
| APR-01 | Full approval: claim → object with provenance → edges → log → recorded result, one transaction; idempotent replay returns the STORED result | §3.7, §2.4, AC-INBOX-12 | pgTAP | 1B | green | 013:3–12 |
| APR-02 | Refusals: version drift distinct; nonexistent/unauthorized/decided/key-misuse ONE shape; the care ceiling binds the writer; high-risk unconfirmed refused | §3.7, DEF-10, PRD §6.4 | pgTAP | 1B | green | 013:13–16, 19, 28–29 |
| APR-03 | Taint at write = the D7 union (own ∪ drafted ∪ parents' CURRENT taints), manage on the union; drafted covers parents (1C drafting contract) | ADR-0005 D7 as amended by ADR-0006 | pgTAP | 1B | green | 013:5 · 018:12–13 |
| APR-06 | Step-up, as amended by 2A M2 (A3: "§5.7 replaces this guard"): a non-null `p_step_up_token` is now VALIDATED — operation/target/actor-bound, consumed in-transaction; an invalid, foreign or replayed token refuses; null still approves; signature stays §3.7-verbatim | ADR-0006 F6; TSD annex A3; ADR-0012 | pgTAP | 1B→2A | green | 018:1–2 (invalid refused) · 036:24–28 |
| APR-07 | Idempotency hardening: replay actor-bound (another actor gets approval_refused, not the stored result); key bounded 1..200, empty refused | ADR-0006 P5 | pgTAP | 1B | green | 018:3–6 |
| APR-08 | Duplicate payload parents collapse to ONE edge; no raw 23505 escapes the definer | ADR-0006 P5 | pgTAP | 1B | green | 018:7–8 |
| APR-09 | Drift refusal (D7 amended): parents' CURRENT union beyond own ∪ drafted → `proposal_taint_changed`, post-authorization (order pinned: authorization outranks it); the refusal writes nothing | ADR-0006 F8/Q4 | pgTAP | 1B | green | 018:9–11 |
| APR-04 | Manual entry through the same function: source_arrival_id null, provenance of the same shape | §3.7, AC-TL-2 | pgTAP | 1B | green | 013:25–27 |
| APR-05 | Unclaimed writes die in BOTH places: the insert policy (hc_internal, 42501) and the deferred claim trigger (everything else, P0001; SECURITY DEFINER per M10) | §3.7, §2.4 | pgTAP | 1B | green | 013:30–31 |
| REV-01 | revise_object: manage at write time; per-type content allowlist; provenance/taint unaddressable; profile_facts supersede-only; revision row (before/after, sequenced) in-transaction | §3.7 | pgTAP | 1B | green | 014:1–13 |
| SHR-01 | share_object: one-transaction validation (existence, circle+subject agreement, live grantee, granter manage); ONE refusal shape; logged; end-to-end widening of ONE object; no propagation; revocation closes on the next query; a committed freeze refuses at the next evaluation | §2.5, §3.6, AC-PERM-10 | pgTAP | 1B | green | 015:1–16 · 018:14 |
| RAC-01 | R-rule, freeze vs approval: a freeze committing while an approval waits on the per-circle lock defeats it WITH the named FRZ-14 signature (`freeze_active`, nothing written) | ADR-0006 F1; TSD annex A4 | multi-session | 1B | green | test:concurrency case 5 |
| RAC-02 | R-rule, grant revocation and membership removal vs approval: either committing mid-wait defeats the approval (ctx evaluates under the lock) | ADR-0006 F1 | multi-session | 1B | green | test:concurrency cases 6–7 |
| RAC-03 | R-rule, transitions vs revision: authorization binds to the version the write touches — a stale-taint edit is refused and the row unchanged; a freeze committing mid-wait defeats the revision | ADR-0006 F1 | multi-session | 1B | green | test:concurrency cases 8, 10 |
| RAC-04 | R-rule, the shrink path: reclassify re-reads and authorizes UNDER the lock — an actor without manage on the grown taint is refused | ADR-0006 F1 | multi-session | 1B | green | test:concurrency case 9 |
| PRS-01 | presence(): ids/dates/types only — no title column EXISTS; log on every taint domain per row; circle pre-filter bounds arbitrary p_subject; freeze closes it | §3.5 | pgTAP | 1B | green | 016:18–24 |
| WRT-01 | Writer allowlist (catalog-based): exact grantee×privilege inventory for documents + dsc from information_schema.role_table_grants; exact pg_trigger inventory | plan | pgTAP | 1B | green | 002:19–20 |
| PRF-05 | Record policies at volume: two InitPlans per §3.4 two-clause policy, zero SubPlans; measured ctx executions == 2 over a 2,000-row scan (the deterministic O(rows) tripwire); wall clock RECORDED (~0.95 s quiet, 1:4 load variance — round-6 question) | §3.12, ADR-0003 f9 | pgTAP | 1B | green | 008:10–14 |
| MUT-01 | Mutation: guard_row shrink-guard removed ⇒ 011:6, 7, 9, 14 red by name; restored green | plan | review | 1B | review | round-6 packet |
| MUT-02 | Mutation: tasks_internal_write with_check dropped ⇒ 013:31 red; the deferred-trigger branch (013:30) stays green — the belts are independent; restored green | plan | review | 1B | review | round-6 packet |
| UPG-01 | Upgrade leg: pinned 1A baseline (10 migrations @ 03a0c12) materialised in a TEMP worktree; ONLY the 1B migrations applied on top; both suites green; worktree removed | plan | review | 1B | review | round-6 packet + addendum |
| UPG-02 | The upgrade rehearsal and db:verify are repeatable CI merge gates: exact two-way migration-state check after every reset (clean and base), increment applied via `supabase migration up`, both suites re-run against the upgraded database, schema lint failing on warnings | ADR-0006 F5 | CI | 1B | green | ci.yml + scripts/verify-migration-state.mjs |

## 1B → staged forward (new pending rows)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| ING-02 | arrivals/proposals §3.4 read policies: summary reaches the arrival row (fail-closed all-domain taint; column grant excludes auth_detail and current_lease_id, so `select *` refuses for everyone); view reaches auth_detail through hc.arrival_auth_detail (DEF-10 one shape); proposals read at MANAGE over their own drafted taint (per-proposal selectivity); freeze closes all three; hc_admin privilege-absent; two-InitPlan/zero-SubPlan policy shape | §3.4, ADR-0007 | pgTAP | 1C | green | 025:1–7, 11–20 |
| ING-03 | A.1 health paired half, asserted in ONE member: the summary member who CAN read the arrival row gets ZERO extraction rows; view resolves them; single-domain view does not | A.1 | pgTAP | 1C | green | 025:8–10 |
| RLS-11a | A.3 search channel: twenty generated pairs absent across ALL THREE search relations; positive control | A.3; ADR-0009 D9 | pgTAP | 1D | green | 029:19–21 |
| RLS-11b | A.3 remaining channels: the send-time notification check, export | A.3 | pgTAP+ | **2+** | **pending** | surfaces land there |
| DSC-01 | dsc view-level read policy (EXISTS on the document at view — the §7.2 LEFT JOIN is the level decision); the search writer allowlist FINALIZED: hc_internal S/I/U + authenticated SELECT, DELETE for nobody | §2.5, §2.11 | pgTAP | 1D | green | 029:2–18 · 028:5 · 002:14, 19–20 · 010:44–48 |
| TNT-08 | Request-path callers landed: reclassify EXECUTE to authenticated, authorizing through visible_at UNDER the lock (freeze/cap/ceiling bind; unresolved needs manage-on-five; DEF-10 one shape); sweep scheduling via hc.run_taint_sweep (hc_pipeline); freeze and revocation mid-wait each defeat the reclassify | §2.6; ADR-0009 D5/D6 | pgTAP + multi-session | 1D | green | 032:1–6 · concurrency 24–25 |
| SHR-02 | Share revocation surfaces: hc.assign_task / unassign revokes assignment-created shares | §3.6, AC-TASK-7 | pgTAP | **2+ (tasks surface)** | **pending** | no task-assignment surface exists through 1D; retagged from 1C/1D (ADR-0009 D9) |
| PRF-06 | The quantitative gate ran and BREACHED (page p95 535–1,680 ms vs 250; search_broad 3,490 ms vs 2,500), so the breach clause executed: ladder→jsonb containment, visible_at→one inline-friendly expression, three page indexes. Post-rewrite the GATE — warm 25-run p95 — is ALL BOUNDS MET (page p95 ≤ 216 ms; scans p95 ≤ 1,915 ms); the "margins ≥ 3×" claim is the SCAN queries', not the page tripwire's. The cold leg is a report-only diagnostic (exits 0 by design): cold warm-up can transiently exceed the 250 ms page tripwire on a cold or contended host (round-8 reviewer observed 280–329 ms) while staying far inside PRD §13.2's 1.5 s p95 page budget (round-8 F2); truth table + 033 grid green over the rewrite | ADR-0006 F7/Q6; ADR-0009 D7 as amended by ADR-0010 | pgTAP + bench | 1D | green | 033:1–12 · scripts/bench/prf06.mjs (tables in round-8 packet) |
| MNL-01 | Manual entry end-to-end (model pinned ADR-0006 Q12): hc.create_manual_proposal creates the synthetic manual-channel arrival WITH its proposal in ONE transaction (any refusal leaves neither row, incl. across a mid-wait freeze race); hc.assert_manual_flag makes flag/channel disagreement unrepresentable BOTH ways; manual documents refused; approval flows through hc.approve_proposal with null source_arrival_id (APR-04 as built); create_arrival refuses the manual channel | ADR-0006 F9/Q12; ADR-0007 | pgTAP + multi-session | 1C | green | 024:1–17 · 020:6 · concurrency 15 |
| OPS-01 | RULED AND LANDED (ADR-0009 D6): scheduler identity = the RLY-01 worker as hc_pipeline (sweeper_pass per minute; run_taint_sweep nightly, recorded in hc.sweep_runs); retry = idempotent next tick; alerting = admin_meta.sweep_health (page on findings > 0; page on last_run_at > 24 h — the missing row IS the signal); bounds = worker statement_timeout 60 s + §13.3 scale; window ≤ 24 h; posture over-taint (findings marked unresolved) | ADR-0006 F10/Q10; ADR-0009 D6 | pgTAP + review | 1D | green | 032:7–13 · ADR-0009 D6 |

## 1C — ingestion state machine (TSD §2.4, §4; ADR-0007)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| ING-04 | §2.4 pipeline tables (arrival_events, pipeline_leases, known_senders, extractions, pipeline_outbox) + hc.reason_codes/hc.stage_budgets seeded: shapes, circle-consistent composites, citation_present structural, live-unique senders, arrivals.current_lease_id circle-consistent, arrival_events append-only, fail-closed staging; DELETE granted to nobody | §2.4, §4.3 | pgTAP | 1C | green | 019:1–40 |
| ING-05 | hc.advance_arrival: the six enumerated outcomes each produced by their own scenario (A.5 row 1); stale_lease in all four shapes with state UNCHANGED and NO event row (the silent-skip regression); the event insert takes already-bound values; reason codes FK-bound — a raw provider string is unrepresentable; cancelled outranks the fence (recorded reorder) | §4.2, A.5 | pgTAP | 1C | green | 020:14–26, 34 |
| ING-06 | hc.create_arrival intake: idempotent on (circle, key) — a replay returns the same id; channels closed (manual/sms refused); children inherit circle AND subject; accept-and-store proceeds under freeze; P5 caps (50 MB, 200 pages, key ≤ 200, auth_detail ≤ 16 KB, address/display/message-id/mime bounds) each refused before any write | §4.1, §4.6, ADR-0006 P5 | pgTAP | 1C | green | 020:2–13, 27 |
| ING-07 | hc.claim_stage: budget claimed before the provider call; claim-while-live refused (stale_lease); expiry transfers ownership (superseded lease marked expired, fenced from publishing — A.5 pgTAP half); exhaustion = terminal state + enumerated reason, no fifth lease; redelivery acks out (already_advanced from the event trail); interpret's in-flight transition at claim, reclaim after mid-flight death without duplicate events; commit-standalone proven two-session | §4.3, A.5 | pgTAP + multi-session | 1C | green | 022:1–24 · concurrency 11–12 |
| ING-08 | Publication is ONE transaction gated by the transition (§4.5): finalize_extraction/finalize_interpretation run the CAS first; a cancellation between the provider returning and finalization leaves ZERO extractions and proposals (A.5 orphan row, single-session AND racing two-session); every P5 refusal (≤200 facts, ≤8 KB values, cited-or-refused, ≤50 proposals, ≤64 KB payloads, ≤20 in-circle parents, own-arrival extraction ids) writes NOTHING and rolls the transition back; write halves owner-only and lease-bound (F6 posture) | §4.5, A.5, ADR-0006 P5 | pgTAP + multi-session | 1C | green | 023:1–5, 7–10, 14–21, 25 · concurrency 16 |
| ING-09 | The 1C drafting contract (APR-03/APR-09 modelled, not fought): hc.draft_proposal sets taint = own_domain ∪ parents' CURRENT taints at draft; a machinery draft approves cleanly through hc.approve_proposal; a conflict draft requires parents and carries their union (A.4 conflict oracle bound); profile_fact without a declared domain refused (D3 fail-closed) | ADR-0005 D7 as amended; A.4 | pgTAP | 1C | green | 023:4–6, 19, 22–24 |
| CNL-01 | hc.cancel_arrival (§4.5): any member who can approve (manage over the all-domain taint); freeze-first Q5 order (named freeze_active); nonexistent/unauthorized ONE shape (DEF-10); cancel_invalid_state post-authorization; records actor + event + closes the lease as cancelled | §4.5 | pgTAP | 1C | green | 023:7, 10–13 |
| SND-01 | hc.sender_recognised: address and domain match case-blind on live rows only; a display name wearing a known address NEVER matches (PRD §4.2.8); the gate claims and advances scanned → extracting/held with enumerated reasons | §4.3, §5.3, AC-INBOX-7 | pgTAP | 1C | green | 020:35 · 022:21 |
| SWP-01 | hc.sweeper_pass (§4.11): expires dead workers' leases; terminalizes budget-spent UNFROZEN arrivals with stated reasons under the R-rule lock in circle order — **re-validating state, stage, live lease, freeze, deletion and budget against the row-locked LIVE row, updating conditionally on the re-read state (round-7 B2)**; lists re-queueables; stuck > 24 h (from last event) excludes human-wait states and parked work; queue-age > 4 h excludes parked; idempotent; steps 3–5 are read-only advisory listings revalidated by claim_stage | §4.11; ADR-0008 B2 | pgTAP + multi-session | 1C | green | 026:1–3, 10–17 · concurrency 17–21 |
| RAC-05 | R-rule extended to pipeline writers: a freeze committing while advance_arrival / claim_stage / create_manual_proposal waits on the per-circle lock defeats each — parked state unchanged, zero leases minted, neither manual row surviving | ADR-0007; ADR-0006 A4 | multi-session | 1C | green | concurrency 13–15 |
| RAC-06 | The writer-by-writer race matrix (round-7 M3 — replaces the general "R-rule extends to every writer" sentence): sweeper vs cancellation / claim-exhaust / freeze / claim+finalize; two sweepers single-terminalization; drain vs drain disjoint; relay-crash vs ack boundary; intake vs intake conflicting AND matching; structural exclusions (adjudication-outbox atomicity, ungated intake) recorded in ADR-0008 | ADR-0008 M3 | multi-session | 1C | green | concurrency 17–23; ADR-0008 §matrix |
| ING-10 | Transition-graph closure (round-7 B1): hc.arrival_transitions is the CLOSED §4.3 stage-exit allowlist (exact seeded set pinned); the CAS refuses skipped stages, backward transitions, terminal revival and WRONG-STAGE leases with invalid_state, mutating nothing; stage-bound controls still advance; §4.7 duplicate edges append with their machinery | §4.2/§4.3 as amended by A6; ADR-0008 B1 | pgTAP | 1C | green | 027:1–10 |
| ING-11 | Intake idempotency identity (round-7 M2): a key replay returns the prior id ONLY when subject/channel/parent/message-id/sender (case-blind) agree; conflicts raise idempotency_conflict writing NOTHING — sequential per-field AND concurrent (the unique-violation loser conflicts, never aliases; a matching concurrent replay still aliases) | §4.1 as amended by A6; ADR-0008 M2 | pgTAP + multi-session | 1C | green | 027:19–26 · concurrency 23 |
| OBX-01 | Outbox delivery contract (round-7 B3): claim/ack at-least-once — an unacked claim past the 300 s window re-delivers; an acked row never does; double-ack idempotent; ack binds to a claim; concurrent drains disjoint (SKIP LOCKED); hc.outbox_ack is hc_pipeline-only; the sweeper stays the backstop; end-to-end pgmq delivery is RLY-01 (pending) | §4.2 as amended by A6; ADR-0008 B3 | pgTAP + multi-session | 1C | green | 027:11–18 · concurrency 22 · 026:7–10 |
| BGT-01 | Budget seeds are PROVISIONAL operational hypotheses (round-7 M5, Q10 overturned): frequency/max-elapsed math and revision criteria in ADR-0008; the no-rapid-burn property asserted — duplicate queue deliveries against a live gate lease consume nothing; per-outcome metrics and pre-exhaustion alerts land behind OPS-01/RLY-01 | ADR-0008 M5 | pgTAP + review | 1C | green | 027:30; ADR-0008 §budgets |
| MUT-03 | Mutation: advance_arrival's freeze clause removed ⇒ 020:28–32 red by name (the whole freeze-parking family); restored green | plan | review | 1C | review | round-7 packet |

## 1C → staged forward (new pending rows)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| RLY-01 | The outbox relay and sweeper scheduler as workers: pgmq delivery of claimed outbox rows (claim/ack, OBX-01) and sweeper re-queue lists; kill-before-transition and outbox-loss end-to-end (the A.5 worker-layer halves). **Scope ruling (ADR-0008 M1): 1C = database state-machine substrate complete; the OPERATIONAL pipeline is NOT complete and is production-disabled until this row lands** | §4.2, §4.11, A.5; ADR-0008 M1 | worker | **2+** | **pending** | no worker runtime exists; the DB halves are green (FRZ-15, SWP-01, OBX-01) |
| UXA-01 | Inbox-surface entry gate (round-7 M4 — D7 approval is CONDITIONAL on it): visibility matrix by role composition; a coordinator-diagnosis guarantee (a status affordance not gated on all five domains, or a documented coordinator grant-shape requirement); the below-cliff representation of "an item is processing" without existence leakage; the share-based disclosure flow. The cliff itself is a pinned fact (manage on 4 of 5 ⇒ zero rows) | ADR-0008 M4 | review | **inbox surface (2+)** | **pending** | no member-facing surface exists; 027:31–32 pin the facts |
| PST-01 | hc.product_state / state_label (§4.4): the family-facing label; a parent reports the least-advanced VISIBLE child (the A.4 parent-rollup oracle) | §4.4, A.4 | pgTAP | **2+** | **pending** | the inbox surface lands with the app slice |
| CNF-01 | Conflict resolution outcomes (§4.8): use-new/keep/keep-both surfaces; drafting is live (kind='conflict' with union taint, ING-09) but approval of conflict kinds stays refused until the outcome machinery exists | §4.8 | pgTAP | **2+** | **pending** | approve_proposal refuses non-object kinds (1B behaviour, unchanged) |
| SND-02 | known_senders accept/revoke member surfaces + held-mail release and the 30-day expiry of unaccepted stranger mail: coordinator-only acceptance (exactly-one-of address\|domain; freeze_active under any freeze); release in the SAME transaction via a real gate lease + the CAS release edge + outbox re-queue (relay = RLY-01, sweeper backstop); revocation immediate on live rows; expiry to nothing_filed reason held_expired, skipping frozen circles, accepted-meanwhile senders, and no-held-event arrivals; acceptance takes the R-rule lock BEFORE its predicates (M8, round-9 F2) — a freeze committing mid-wait defeats it with no sender row, no log entry, nothing released | §5.3–§5.4; round-9 F2 (ADR-0013) | pgTAP + multi-session | 2A | green | 040:1–24 · concurrency 30 |

## 1D — derived & operational surfaces (TSD §2.8–§2.11, §7, §3.9; ADR-0009)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| SRCH-01 | Vectors by trigger in the writing transaction: tsv_summary = title(A)+summary(B) and NEVER extraction text; tasks/timeline one whole-row vector (no column carve-out exists); dsc built in ONE place from the SAME string the snippet is cut from (recomputed equality); extracted_text = the approved extraction values; ocr at weight D, findable, never outranking the title; the rename rebuilds BOTH vectors in the same transaction (A.5); trigger + grant + policy inventories exact; the only dsc-writing trigger lives ON documents (c3 order by construction) | §2.11, §7.1; ADR-0002 c3 | pgTAP | 1D | green | 028:1–29 · 011:17 · 002:19–20 |
| SRCH-02 | The §7.2 query per rung: view matches and snippets from tsv_full/search_text_full incl. TITLE matches (A.5); summary null-extends and falls through to exactly what it may read; body-only terms return zero AND a count identical to a term present nowhere (A.5); log/hidden/non-member/care-ceiling closed; a share widens the ONE named object through search and never propagates; freeze closes the channel | §7.2–§7.6; A.4/A.5 | pgTAP | 1D | green | 029:1–18 |
| LOG-01 | The §2.8 family read: domain-less circle-level entries member-visible (freeze trail stays readable under the freeze); subject entries at ≥ log on the entry's domain via visible_at; a subject entry with no domain fails closed to ALL DOMAINS; a domained entry with no subject fails closed to ALL SUBJECTS — ≥ log on that domain for every live subject, empty set dark, freeze closing it through the same one function (round-8 F4); non-members and removed members read nothing; freeze closes subject rows for the coordinator too | §2.8, §10.5; ADR-0009 D1 as amended by ADR-0010 | pgTAP | 1D | green | 030:1–9, 20–21 · 034:6–12 |
| LOG-02 | Denial collapse (AC-PPL-7): hc.log_denied — no actor parameter, live membership or ONE refusal shape, subject-in-circle validated at CALL time in the same shape (nonexistent and cross-circle indistinguishable, writing nothing; the deferred declaration FK stays as the commit-time belt — round-8 F3), 1-hour collapse (same row, count+window advance; new row per domain); the immutability carve-out is STRICT (+1 exactly, presentation columns only, denial rows only; evidentiary columns and DELETE unchanged both ways) | §2.8; ADR-0009 D2 as amended by ADR-0010 | pgTAP | 1D | green | 030:10–19 · 034:1–5 |
| ADM-02 | The §3.9 boundary: hc_admin reaches admin_meta/admin_ops alone (public binds at ACL absence — no direct entry, A.1 preserved on dsc/access_log/arrivals/ledger); the CI assertions run on every migration — CI-1 zero table privilege, CI-2 transitive column walk (probe-proven for column refs through nested views and derived forms; the subid-0 whole-row shape on mixed tables is probe-CONFIRMED uncatchable by the walk and the name scan — the recorded residual), CI-2b the mechanical closure: every admin_meta view definition pinned by md5(pg_get_viewdef), any change reds the suite and forces review (round-8 F1), CI-3 probe-proven function-indirection walk, CI-4 EXECUTE on nothing with admin_ops EMPTY; five hc_internal-owned views with pinned column lists (counts, states, dates, opaque ids; no content-suggesting column NAME); denials surface as the COLLAPSED total | §3.9, §9.2; ADR-0009 D4 as amended by ADR-0010 | pgTAP | 1D | green | 031:1–25 |
| LDG-01 | Deletion-ledger interface (§2.9): ledger.tombstones exact columns (never content/title/filename), scope-checked, RLS-forced, zero request reach incl. hc_admin; hc.record_tombstone owner-only synchronous writer; append-only except the purge job's ONE executed_at mark; log_head_signatures immutable with zero request reach | §2.9, §2.8; ADR-0009 D3 | pgTAP | 1D | green | 032:14–26 |
| SIG-01 | The daily head-signing worker: KMS key, signatures written to the ledger store, chain heads from hc.log_chain_heads() | §2.8 | worker | **2+** | **pending** | interface green (030:22–24, 032:23–25); no worker runtime exists |
| DEL-01 | The deletion surface: user-originated request → hc.record_tombstone IN the deletion transaction → purge marks executed_at; restore-replay rehearsal (G6/G11) | §2.9, §10.3 | HTTP + worker | **2+** | **pending** | interface green (LDG-01); no deletion surface exists (FRZ-16 companion) |
| ADM-01 | admin_ops wrappers: the five §9.3 operations with operation-bound step-up, dual control (admin_action_approvals), normalized error codes, per-wrapper grants; the A.5 wrapper-identity assertions (stored identity immutable, no self-create-then-act, object-id probing one shape) | §3.9, §9.3; ADR-0009 D4 | pgTAP | **admin slice (2+)** | **pending** | admin_ops EMPTY is the fail-closed boundary (031:16–17 pin it); the §5.7 step-up machinery LANDED (2A M2) — the wrappers remain the admin slice's |

## 2B — app increment (TSD §5.5–§5.11 app halves, §1.7; PRD §4.1; ADR-0013 contracts, ADR-0014/0015)

Layers gain `app` (vitest — the CI "Application tests" step) and `e2e`
(the Playwright §11.4-3 walkthrough — a formalized LOCAL gate,
`docs/ops/e2e-local-gate.md`; ADR-0014, ratified ADR-0015 F11).

**Test classes, stated per round-10 finding 10 — a mocked call-order
assertion is never described as live-authority proof:**

- *mocked route contract* — vitest with collaborators mocked; proves the
  boundary's order, shapes and refusals (tests/routes/*,
  tests/setup/*, tests/app/*, tests/config/*, tests/lint/*).
- *live DB integration* — vitest against the running database with real
  request-role/maintenance authority (tests/db/*, tests/hc/*,
  tests/permissions/* — the snapshot reads hc.tier_defaults() live).
- *live GoTrue probe* — `scripts/probe-gotrue.mjs` against the running
  stack (ADR-0015 F14; re-run on any GoTrue/Supabase upgrade).
- *browser E2E* — the walkthrough, full live stack.

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| APP-01 | The §5.5 config pin: config.toml at §5.5 exact (min 10 / no composition / 720h timebox / recovery 1800 s / TOTP on / anon+SMS+social+web3 off / GoTrue rate limits pinned on) + the hosted-parity doc naming every hosted-only control (HIBP, WAF, per-type expiries) | §5.5; ADR-0013 F1 | app | 2B | green | tests/config/auth-config.test.ts |
| APP-02 | §1.7 for real: index exports exactly the four-factory surface; asAdmin/asPipeline sessions ARE their NOLOGIN roles (positive + 42501 negatives; function-ACL negatives catalog-probed per the segfault trap); the request-role channel assumes anon/authenticated transaction-boxed with verified claims, leaves no residue either way, refuses non-request roles; ESLint fences (service-role → artifact allowlist + gotrue-admin; request-role/maintenance → lib/hc only) driven through the ESLint API | §1.2/§1.7; ADR-0013 F1 | app | 2B | green | tests/db/* · tests/lint/db-fence.test.ts |
| APP-03 | The F1 contract wired: sign-in, step-up re-auth and recovery are the ONLY password paths; sign-in and step-up consult hc.auth_throttle BEFORE GoTrue (positive wait short-circuits with §4.1.7 copy, GoTrue never called), record failure + drive the §5.11 notice as anon, record success AS the proven user (no identifier); recovery records reset_completed identity-bound and is NEVER throttle-gated (AC-AUTH-12); wrappers proven live (escalation at the 5th failure; identity-bound clear; sessionless recordSuccess refused) | ADR-0013 F1; §5.6 | app | 2B | green | tests/routes/sign-in.test.ts · tests/routes/reset.test.ts · tests/routes/account.test.ts · tests/hc/throttle.test.ts |
| APP-04 | Non-enumeration byte-identity: sign-in failure bytes identical for wrong-password vs no-account (no GoTrue text escapes); throttled response existence-independent; reset request identical for account and ghost; create-account identical status/Location/body for fresh vs exists with the verification mail requested in both branches — the fresh branch's Set-Cookie recorded as the accepted §5.5 deviation WITH its full framing (an account-existence oracle observable as post-redirect auth state, rate-limit-boxed — ADR-0015 F5/R5); the invite-variant address derives from the TOKEN server-side. Partial-commit compensation (ADR-0015 F6): un-confirm/bootstrap failure deletes the just-created user and answers a neutral retry, abort failure fails loudly, resend refusals logged never shaped — failure-injection tests per boundary | §5.5; PRD §4.1.7; ADR-0015 F5/F6 | app | 2B | green | tests/routes/sign-in.test.ts · tests/routes/create-account.test.ts · tests/routes/reset.test.ts |
| APP-05 | Wasnt-me app half (ADR-0013 F3 contract): GET renders and touches nothing; destruction ONLY on the explicit POST — execute → IMMEDIATE kill (DB session revocation + rotation) → complete, in that order; a GoTrue outage leaves the durable pending row for the sweep; refusals one neutral shape. The sweep hardened at round 10 (ADR-0015 F3/F9/F15): invoker CHECKED IN (vercel.json cron */10 + the CRON_SECRET GET path), both secrets timing-safe and length-blind, drain oldest-first capped at 20/run with per-action isolation, response reports drained/of/deferred/oldest_pending_age_s; ops contract docs/ops/security-actions-worker.md (30-min max tolerated age) | §5.11; ADR-0013 F3; ADR-0015 F3/F9/F15 | app | 2B | green | tests/routes/wasnt-me.test.ts · tests/routes/worker.test.ts · tests/config/vercel-cron.test.ts |
| APP-06 | The founder door: Step N of 4 on exactly the four step screens (AC-AUTH-2); resume from durable state — no circle→1, circle+empty context→3, context→4 (AC-AUTH-9); step 1 HOLDS both answers to step 2 (relationship validated and carried to circle creation — ADR-0015 F1/R2; the durable column is a batch item); step 2 writes THROUGH hc.create_circle with ADR-0011 local parts, closed situation list, per-subject zips (second defaults), declared slice; step-3 write guarded to the founder's own in-setup circle WITH the zero-row postcondition — a forged/stale/missing circle id REFUSES the advance, and the maintenance writes report their row counts live (ADR-0015 F7); completion promises pinned to Phase 1 only (AC-AUTH-5) with the §7.5 line saying the smaller true thing | PRD §4.1.3; AC-AUTH-2/5/9; ADR-0015 F1/F7 | app | 2B | green | tests/setup/founder-door.test.ts · tests/hc/circle.test.ts · tests/db/maintenance.test.ts |
| APP-07 | The invitee door: the module ceiling renders BEFORE anything is asked (both screens through the ONE renderer — AC-AUTH-8's other half); AC-AUTH-11 — a different identity gets NO accept control, forced re-auth as the invited address (case-blind); dead tokens = who invited + ask-for-a-new-one, nothing created; landings by tier (family→Timeline, care→tasks); invites lifecycle proven live (issue as verified coordinator; describe pre-auth keyed on the unguessable token; accept writes membership+grants; replay refuses) | PRD §4.1.4–§4.1.5; §5.10 | app | 2B | green | tests/routes/accept.test.ts · tests/routes/invite-screen.test.ts · tests/hc/invites.test.ts |
| APP-08 | AC-AUTH-8 — the snapshot: the tiers module's grant table equals hc.tier_defaults() row for row LIVE (family incl. the no-finances-row absence; care schedule-only), and both screens' ceiling copy comes out of the one module | §5.10; AC-AUTH-8 | app | 2B | green | tests/permissions/tiers-snapshot.test.ts |
| APP-09a | AC-AUTH-10, the sign-out half: scope 'global' + page gates server-validate session liveness (getUser), so a second browser dies within seconds — E2E-verified | §5.5; AC-AUTH-10 | app + e2e | 2B | green | tests/routes/account.test.ts · e2e walkthrough step 11 |
| APP-09b | AC-AUTH-10, the access-log half: structurally unwritable in 2B — no sign-out event type, hc.log hc_internal-only, reserve spent. OWNER-AMENDED OUT of A7's 2B scope (ADR-0015 R1) and a MANDATORY item of the batched bound amendment at the next DB-opening slice (ADR-0015 R8); pending until that migration lands | §5.5; ADR-0015 R1/R8 | app | **next DB slice** | **pending** | ADR-0015 §batch |
| APP-10 | AC-PERM-3's app half (the §5.8 sessions row): remove_member → immediate DB session revocation, ONE transaction (tokens revoked then sessions deleted; session-bound tokens cascade — FK rule pinned; ADR-0015 F8); a refusal revokes nothing; a still-unexpired JWT in a LIVE second browser context reads NOTHING on its next request (RLS is the enforcement); the revoked/cascaded refresh token cannot mint a session (probe F5, live) | §5.8; §4.6.3; ADR-0015 F8 | app + e2e | 2B | green | tests/routes/account.test.ts · tests/db/maintenance.test.ts · e2e walkthrough step 10 · scripts/probe-gotrue.mjs F5 |
| APP-11 | The six GoTrue facts ADR-0014 D3/D4 rest on, as an EXECUTABLE probe against the pinned image (confirmation gates the password grant unconditionally; password checked first; refresh works unconfirmed; no per-user admin logout; the DB kill defeats old refresh tokens; resend accepted unconfirmed) — 6/6 at the 2B gate; RE-RUN ON ANY GOTRUE/SUPABASE UPGRADE, a FAIL re-opens ADR-0014 D3 | ADR-0015 F14; ADR-0014 D3/D4 | live GoTrue probe | 2B | green | scripts/probe-gotrue.mjs |
| E2E-01 | The §11.4 item 3 walkthrough end to end: founder cold start → two subjects (divergent situations/zips) → seq-1 custodianship declarations (DB-asserted) → abandon-and-resume at step 3 → completion (two ADR-0011 addresses, unverified inactive state, no invite affordance, AC-AUTH-5 absences) → real mail-click verification flips the mirror → invite at summary-only with the ceiling under the selector → invitee: ceiling before anything, fixed-address create-account, accept, Timeline landing → AC-PERM-3 → AC-AUTH-10 | §11.4-3; AC-AUTH-1 | e2e | 2B | green | e2e/onboarding.spec.ts (11 steps; local gate, ADR-0014) |

## 2A — auth machinery (TSD §5.5–§5.11; ADR-0011/ADR-0012)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| AUT-01 | §5.6 progressive throttle, as amended by M8 (round-9 F1): existence-blind ledger keyed on hc.contact_key (byte-identical answers, account or ghost; case/whitespace variants share one budget); schedule 0/30/120/900 s over a trailing-15-min window cut at the last success-class event by identity seq; ONE refusal shape; 24 h same-key prune; FAILURE is the only request-role-assertable outcome (record_auth_failure, anon AND authenticated — §5.7 re-auth attempts throttled by the same counters); SUCCESS-class recording is identity-bound and authenticated-only (record_auth_success: no identifier parameter — the cleared key derives from hc.uid(); a stranger's success clears nothing); record_auth_attempt(text,text) is GONE; anon USAGE on hc landed here (EXECUTE stays per-function, PIN-01 unmoved) | §5.6, §5.5; round-9 F1 (ADR-0013) | pgTAP + multi-session | 2A | green | 035:1–21, 28–35, 38–39 · concurrency 28 |
| AUT-02 | AC-AUTH-12 as a test: 200 adversarial failures over 30 min never exceed the 900 s box; the wait is 0 the moment the latest failure ages past 15 min; success/reset_completed clear instantly through the identity-bound recorder — held under two-session contention (anon bursts, the holder's own authenticated success clearing for the other session) | §5.6; PRD §4.1.8 | pgTAP + multi-session | 2A | green | 035:22–27, 36–37 · concurrency 28 |
| STP-01 | §5.7 step_up_tokens VERBATIM: mint authenticated-only on a FRESH session (newest amr ≤ 300 s; aal recorded as the factor actually used; strongest-factor clause app-enforced — auth schema ungrantable, ADR-0012); sha256-only, 5-min expiry; consume owner-only, operation+target(null-strict)+account-bound, single-use via the atomic conditional UPDATE — exactly one of two racers wins | §5.7 | pgTAP + multi-session | 2A | green | 036:1–23 · concurrency 29 |
| STP-02 | The §5.7 operations wired at 2A: share_object REQUIRES a live bound token (the 3-arg overload is GONE); approve_proposal validates-and-consumes what is presented (A3's interim guard retired — see APR-06); raise_grant born requiring (GRT-01); export/deletions/transfer/email-password change are born with the requirement in their slices | §5.7; annex A3 | pgTAP | 2A | green | 036:24–34 · 038:7–10 |
| IVT-01 | Invite issuance and revocation: coordinator-only (checked first — no oracle); AC-AUTH-4 IN-FUNCTION off the postgres-owned email_confirmed_at mirror (live, never cached); tier family\|care_circle only; live-in-circle subjects deduped; sha256-only 32-byte token returned once, 7-day expiry; revocation pending-only; both logged | §5.10, §4.1.2 (AC-AUTH-4) | pgTAP | 2A | green | 037:1–14, 32–34 |
| IVT-02 | Acceptance: §5.10's ONE-transaction conditional UPDATE under the R-rule lock; case-blind address binding AFTER the claim, so a mismatched session neither accepts nor consumes (AC-AUTH-11's DB half); expiry refused; membership + the EXACT PRD §7.4 tier defaults in the same transaction (family: memories/health/schedule summary + documents log, finances = NO ROW; care: schedule summary per covered subject) — hc.tier_defaults() is the ONE source AC-AUTH-8's app module (2B) snapshots against | §5.10; PRD §7.4, §4.1.4 | pgTAP | 2A | green | 037:18–31 |
| IVT-03 | Membership continuity: a LIVE member's acceptance refuses (membership is not stackable); a REMOVED member re-invited REACTIVATES the original member row under the unconditional unique(circle_id, account_id) — the same actor id keeps naming the same person (N2) | §2.3; N2 | pgTAP | 2A | green | 037:35–37 |
| GRT-01 | hc.set_grant: coordinator-only, per-subject per-domain; RAISE requires a §5.7 token bound to member:subject:domain and refuses under any freeze (named freeze_active — PRD §7.5 "no new grants"); LOWER never demands either; 'hidden' DELETES the row (absence IS hidden, the tier-defaults representation); the care ceiling binds structurally even against a valid token; AC-PERM-5 log with both levels; same-level no-op is silent (absorbs the §5.7 race — ADR-0012); subject-member rows untouchable; target and actor re-read UNDER the R-rule lock (M8, round-9 F2's class) — a target removal committing mid-wait defeats a token-carrying raise with the token unconsumed | §5.8; PRD §4.6.3/§7.4/§7.5; round-9 F2 (ADR-0013) | pgTAP + multi-session | 2A | green | 038:1–22 · concurrency 29, 31 |
| GRT-02 | hc.remove_member: ONE transaction under the R-rule lock — removed_at+removed_by; every grant row deleted; live shares revoked unless EXPLICITLY kept (strict keep-list, refuse-whole); open tasks unassigned with the former holder in task_unassigned entries at the SAME timestamp as member_removed (PRD §8.8); done tasks keep attribution; the last live coordinator is irremovable (§12.7); returns account_id for the 2B session revocation (the §5.8 sessions row); the actor's own coordinatorship re-validates UNDER the R-rule lock (M8, round-9 F2's class) — a coordinator removed mid-wait removes nobody (§4.6.3 immediate) | §5.8; PRD §8.8/§12.7; round-9 F2 (ADR-0013) | pgTAP + multi-session | 2A | green | 038:23–34 · concurrency 31 |
| WMN-01 | "This wasn't me" (§5.11): the notice path is NON-ENUMERATING (byte-identical {noted:true}, account or ghost, threshold or not; count re-derived internally); ≥5 failures against a real account → ONE security_events row + ONE security-class mail in one transaction, the plaintext token ONLY in the queue payload (never returned to the sign-in caller); token = a COLUMN of its event (binding structural), sha256-only, 15-min expiry (verbatim — flagged, ADR-0012), single-use atomic; execute returns account_id for the 2B session kill + forced reset AND (M8, round-9 F3) durably enqueues the owed kill in the SAME transaction — public.security_actions, UNIQUE(event_id) exactly-once, zero request reach, worker surface (pending/complete) hc_pipeline-only and retry-safe; "token consumed with the promise unperformed" is unrepresentable; two racers: exactly one consumes, exactly one action; cadence one live notice per account | §5.11, §5.5; PRD §4.1.7; round-9 F3 (ADR-0013) | pgTAP + multi-session | 2A | green | 039:1–23 · 042:1–22 · concurrency 32 |
| NTC-01 | The §5.9 class split, built exactly as far as revocation notices require: outbound_mail with the class COLUMN, zero request-path reach; a LOWER enqueues access_changed and a removal enqueues membership_removed — security-class, to the ACCOUNT address regardless of circle access, payload EXACTLY {circle_name, changed_by} (content-free pinned as an exact key set); raises/no-ops enqueue nothing; delivery, templates and the other messages are slice 11 | §5.9, §5.8 | pgTAP | 2A | green | 041:1–8 |
