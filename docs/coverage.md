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
| RLS-09 | A.2 invite token replayed after acceptance creates nothing (AC-PERM-4) | A.2, §5.10 | pgTAP | **auth slice** | **pending** | acceptance path is slice 2 |
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
| FRZ-15 | Frozen arrival parked; no retry consumption; terminal-transition refusal; outbox re-enqueue on dismissal; sweeper recovery | §4, A.5 | pgTAP + worker | **1C** | **pending** | pipeline lands 1C |
| FRZ-16 | Freeze suspends exports/deletions/invites at circle level | §2.3 | pgTAP | **1B/1C** | **pending** | those surfaces land later |

## 1A — performance (TSD §3.2, §3.12; ADR-0002 n2; ADR-0003 f9)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| PRF-01 | Every textual `(select hc.ctx())` reference is an InitPlan node; any SubPlan is hashed (one-shot); zero per-row plans | ADR-0002 n2 | pgTAP | 1A | green | 008:1–4 |
| PRF-02 | **Measured** ctx() executions == textual references (1 and 2), never per row, over a visible scan at volume | ADR-0003 f9 | pgTAP | 1A | green | 008:5–7 |
| PRF-03 | Volume wall clock under the 250 ms O(rows) tripwire (measured 2.9 / 11.2 ms local; §1.8 page budget 1.5 s) | §3.12, §1.8 | pgTAP | 1A | green | 008:8–9 |
| PRF-04 | InitPlan/LEFT-JOIN null-extension regression against the real search schema | §7.2, ADR-0002 c1 | pgTAP | **1D** | **pending** | 000 carries the synthetic version |

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
| PLT-03 | ALTER TYPE … ADD VALUE upgrade-path fixture (55P04 rule exercised) | ADR-0002 n5, ADR-0003 f7 | pgTAP | **1C** | **pending** | first ADD VALUE migration is 1C |
| PLT-04 | Function-ACL-denial segfault on this image (backend signal 11) — closure asserted via catalog until fixed upstream | this slice | review | 1A | review | round-5 packet, upstream report |

## 1B — record schema and write path (TSD §2.4–§2.6, §3.5–§3.7; ADR-0005)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| ING-01 | §2.4 prerequisite tables (arrivals, proposals, approval_attempts, proposal_commits): shapes, checks, one-live lineage index, circle-consistent composites; fail-closed for every request-path role; arrivals granted to NOBODY | §2.4, ADR-0005 D1 | pgTAP | 1B | green | 009:1–39 |
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
| APR-06 | Step-up fail-closed: a non-null `p_step_up_token` is REFUSED until §5.7 validates — never accepted-and-ignored; signature stays §3.7-verbatim | ADR-0006 F6; TSD annex A3 | pgTAP | 1B | green | 018:1–2 |
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
| ING-02 | arrivals/proposals §3.4 read policies (summary reaches the arrival row; view reaches auth_detail) | §3.4 | pgTAP | **1C** | **pending** | ingestion RLS lands 1C |
| ING-03 | A.1 health paired half: extractions return nothing at summary | A.1 | pgTAP | **1C** | **pending** | extractions land 1C |
| RLS-11 | A.3 remaining channels: search, the send-time notification check, export | A.3 | pgTAP+ | **1D / 2+** | **pending** | surfaces land there |
| DSC-01 | dsc view-level read policy; the 1D search writer joins the (currently empty) dsc allowlist | §2.5, §2.11 | pgTAP | **1D** | **pending** | REC-05 holds it dark now |
| TNT-08 | Request-path callers for reclassify (re-categorisation surface) and sweep scheduling | §2.6 | pgTAP | **1D** | **pending** | owner-only in 1B |
| SHR-02 | Share revocation surfaces: hc.assign_task / unassign revokes assignment-created shares | §3.6, AC-TASK-7 | pgTAP | **1C/1D** | **pending** | share_object is the only writer in 1B |
| PRF-06 | 1D entry gate (quantitative — the round-6 deferral bound): 5,000-arrival realistic-fanout benchmark (dense provenance, multiple memberships/shares, warm+cold cache, p95/p99 over ≥20 runs); page-sized record queries p95 ≤ 250 ms; search/count full scans p95 ≤ 2.5 s; breach ⇒ the inline-friendly visible_at rewrite lands in 1D | ADR-0006 F7/Q6 | pgTAP+ | **1D** | **pending** | gate numbers fixed now; benchmark is 1D work |
| MNL-01 | Manual entry end-to-end (model pinned ADR-0006 Q12): a synthetic arrival with an explicit manual channel, created with its proposal in ONE transaction; payload `manual` flag must agree with the arrival channel (constraint lands with the creating machinery) | ADR-0006 F9/Q12 | pgTAP | **1C** | **pending** | proposal creation is 1C machinery |
| OPS-01 | 1D entry gate for staged owner-only machinery: scheduler identity for sweep/reclassify, retry policy, alerting on sweep findings > 0, batch/runtime bounds, max tolerated taint-inconsistency window ≤ 24 h once scheduled; failure posture stays over-taint (fail-closed availability cost, never exposure) | ADR-0006 F10/Q10 | review | **1D** | **pending** | no production invoker exists in 1B |
