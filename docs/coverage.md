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
| FRZ-15 | Frozen arrival parked (claim AND advance refuse, store exempt); NO retry consumption (zero leases minted, asserted across a mid-wait race); terminal-transition refusal by the same predicate; outbox re-enqueue on dismissal IN the adjudication transaction (upheld/unresolved write nothing); sweeper skips parked work for re-queueing, exhaustion, stuck and queue-age; lost outbox message recovered by the ordinary sweeper | §4, A.5 | pgTAP + multi-session | 1C | green | 020:27–33 · 022:18–20 · 026:1–16 · concurrency 13–14; the pgmq relay itself is RLY-01 (pending) |
| FRZ-16 | Freeze suspends exports/deletions/invites at circle level | §2.3 | pgTAP | **2+** | **pending** | no invite-acceptance, export or deletion surface exists through 1C; retagged from 1B/1C (ADR-0007) |

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
| ING-02 | arrivals/proposals §3.4 read policies: summary reaches the arrival row (fail-closed all-domain taint; column grant excludes auth_detail and current_lease_id, so `select *` refuses for everyone); view reaches auth_detail through hc.arrival_auth_detail (DEF-10 one shape); proposals read at MANAGE over their own drafted taint (per-proposal selectivity); freeze closes all three; hc_admin privilege-absent; two-InitPlan/zero-SubPlan policy shape | §3.4, ADR-0007 | pgTAP | 1C | green | 025:1–7, 11–20 |
| ING-03 | A.1 health paired half, asserted in ONE member: the summary member who CAN read the arrival row gets ZERO extraction rows; view resolves them; single-domain view does not | A.1 | pgTAP | 1C | green | 025:8–10 |
| RLS-11a | A.3 search channel: twenty generated pairs absent across ALL THREE search relations; positive control | A.3; ADR-0009 D9 | pgTAP | 1D | green | 029:19–21 |
| RLS-11b | A.3 remaining channels: the send-time notification check, export | A.3 | pgTAP+ | **2+** | **pending** | surfaces land there |
| DSC-01 | dsc view-level read policy (EXISTS on the document at view — the §7.2 LEFT JOIN is the level decision); the search writer allowlist FINALIZED: hc_internal S/I/U + authenticated SELECT, DELETE for nobody | §2.5, §2.11 | pgTAP | 1D | green | 029:2–18 · 028:5 · 002:14, 19–20 · 010:44–48 |
| TNT-08 | Request-path callers landed: reclassify EXECUTE to authenticated, authorizing through visible_at UNDER the lock (freeze/cap/ceiling bind; unresolved needs manage-on-five; DEF-10 one shape); sweep scheduling via hc.run_taint_sweep (hc_pipeline); freeze and revocation mid-wait each defeat the reclassify | §2.6; ADR-0009 D5/D6 | pgTAP + multi-session | 1D | green | 032:1–6 · concurrency 24–25 |
| SHR-02 | Share revocation surfaces: hc.assign_task / unassign revokes assignment-created shares | §3.6, AC-TASK-7 | pgTAP | **2+ (tasks surface)** | **pending** | no task-assignment surface exists through 1D; retagged from 1C/1D (ADR-0009 D9) |
| PRF-06 | The quantitative gate ran and BREACHED (page p95 535–1,680 ms vs 250; search_broad 3,490 ms vs 2,500), so the breach clause executed: ladder→jsonb containment, visible_at→one inline-friendly expression, three page indexes. Post-rewrite ALL BOUNDS MET warm AND cold (page p95 ≤ 216 ms; scans p95 ≤ 1,915 ms; cold worst 1,630 ms); truth table + 033 grid green over the rewrite | ADR-0006 F7/Q6; ADR-0009 D7 | pgTAP + bench | 1D | green | 033:1–12 · scripts/bench/prf06.mjs (tables in round-8 packet) |
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
| SND-02 | known_senders accept/revoke member surfaces + held-mail release and the 30-day expiry of unaccepted stranger mail | §5.3–§5.4 | pgTAP | **auth slice** | **pending** | table + gate predicate are green (SND-01); no member surface exists |

## 1D — derived & operational surfaces (TSD §2.8–§2.11, §7, §3.9; ADR-0009)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| SRCH-01 | Vectors by trigger in the writing transaction: tsv_summary = title(A)+summary(B) and NEVER extraction text; tasks/timeline one whole-row vector (no column carve-out exists); dsc built in ONE place from the SAME string the snippet is cut from (recomputed equality); extracted_text = the approved extraction values; ocr at weight D, findable, never outranking the title; the rename rebuilds BOTH vectors in the same transaction (A.5); trigger + grant + policy inventories exact; the only dsc-writing trigger lives ON documents (c3 order by construction) | §2.11, §7.1; ADR-0002 c3 | pgTAP | 1D | green | 028:1–29 · 011:17 · 002:19–20 |
| SRCH-02 | The §7.2 query per rung: view matches and snippets from tsv_full/search_text_full incl. TITLE matches (A.5); summary null-extends and falls through to exactly what it may read; body-only terms return zero AND a count identical to a term present nowhere (A.5); log/hidden/non-member/care-ceiling closed; a share widens the ONE named object through search and never propagates; freeze closes the channel | §7.2–§7.6; A.4/A.5 | pgTAP | 1D | green | 029:1–18 |
| LOG-01 | The §2.8 family read: circle-level entries member-visible (freeze trail stays readable under the freeze); subject entries at ≥ log on the entry's domain via visible_at; null-domain fails closed to all-domains; non-members and removed members read nothing; freeze closes subject rows for the coordinator too | §2.8, §10.5; ADR-0009 D1 | pgTAP | 1D | green | 030:1–9, 20–21 |
| LOG-02 | Denial collapse (AC-PPL-7): hc.log_denied — no actor parameter, live membership or ONE refusal shape, 1-hour collapse (same row, count+window advance; new row per domain); the immutability carve-out is STRICT (+1 exactly, presentation columns only, denial rows only; evidentiary columns and DELETE unchanged both ways) | §2.8; ADR-0009 D2 | pgTAP | 1D | green | 030:10–19 |
| ADM-02 | The §3.9 boundary: hc_admin reaches admin_meta/admin_ops alone (public binds at ACL absence — no direct entry, A.1 preserved on dsc/access_log/arrivals/ledger); the four CI assertions run on every migration — CI-1 zero table privilege, CI-2 probe-proven transitive column walk (nested view + derived form caught), CI-3 probe-proven function-indirection walk, CI-4 EXECUTE on nothing with admin_ops EMPTY; five hc_internal-owned views with pinned column lists (counts, states, dates, opaque ids; no content-suggesting column NAME); denials surface as the COLLAPSED total | §3.9, §9.2; ADR-0009 D4 | pgTAP | 1D | green | 031:1–23 |
| LDG-01 | Deletion-ledger interface (§2.9): ledger.tombstones exact columns (never content/title/filename), scope-checked, RLS-forced, zero request reach incl. hc_admin; hc.record_tombstone owner-only synchronous writer; append-only except the purge job's ONE executed_at mark; log_head_signatures immutable with zero request reach | §2.9, §2.8; ADR-0009 D3 | pgTAP | 1D | green | 032:14–26 |
| SIG-01 | The daily head-signing worker: KMS key, signatures written to the ledger store, chain heads from hc.log_chain_heads() | §2.8 | worker | **2+** | **pending** | interface green (030:22–24, 032:23–25); no worker runtime exists |
| DEL-01 | The deletion surface: user-originated request → hc.record_tombstone IN the deletion transaction → purge marks executed_at; restore-replay rehearsal (G6/G11) | §2.9, §10.3 | HTTP + worker | **2+** | **pending** | interface green (LDG-01); no deletion surface exists (FRZ-16 companion) |
| ADM-01 | admin_ops wrappers: the five §9.3 operations with operation-bound step-up, dual control (admin_action_approvals), normalized error codes, per-wrapper grants; the A.5 wrapper-identity assertions (stored identity immutable, no self-create-then-act, object-id probing one shape) | §3.9, §9.3; ADR-0009 D4 | pgTAP | **auth/admin slice (2+)** | **pending** | admin_ops EMPTY is the fail-closed boundary (031:16–17 pin it); step-up machinery is §5.7's |
