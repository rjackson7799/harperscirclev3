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
| INV-11 | `seq` unique per circle; gapless; chain linked; `entry_hash` recomputable from the stored row | §2.8 | pgTAP | 1A | green | 001:45, 51 · 006:13–15 |
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
| CTX-07 | ctx `shares` populated from `object_shares`; ctx body per §3.2 verbatim | §3.2 | pgTAP | **1B** | **pending** | — |

## 1A — identity-table RLS (§3.4 shape; Appendix A.1 subset)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| RLS-01 | A member reads own circle's rows; foreign circle returns **zero rows** (indistinguishable from nonexistence) | §3.4, AC-PERM-2 posture | pgTAP | 1A | green | 005:1–6 |
| RLS-02 | accounts self-row only; own grants only; admin_users and invites unreadable | plan d3 | pgTAP | 1A | green | 005:5–6, 10–11 |
| RLS-03 | Write privilege absent for authenticated on every 1A table (42501) | §3.7 posture | pgTAP | 1A | green | 005:7–9 |
| RLS-04 | anon holds nothing (42501) | §1.2 | pgTAP | 1A | green | 005:14 |
| RLS-05 | `hc_admin` gets `permission denied for table` — the A.1 distinguished failure mode, privilege absent, no policy consulted (AC-ADMIN-1) | A.1 | pgTAP | 1A | green | 005:15–17 |
| RLS-06 | A.1 five per-domain negative cases against record tables | A.1 | pgTAP | **1B** | **pending** | record tables land in 1B |
| RLS-07 | A.3 twenty ordered-pair matrix, generated from one rule | A.3 | pgTAP | **1B** | **pending** | needs provenance/taint |
| RLS-08 | A.2 revoked live session fails on next request from a second session | A.2 | multi-session | **1B** | **pending** | `test:concurrency` runner lands 1B |
| RLS-09 | A.2 invite token replayed after acceptance creates nothing (AC-PERM-4) | A.2, §5.10 | pgTAP | **auth slice** | **pending** | acceptance path is slice 2 |
| RLS-10 | A.2 artifact-route 404 indistinguishability; pre-revocation URL fails | A.2, §1.3 | HTTP | **slice 2+** | **pending** | route does not exist |

## 1A — circle creation (TSD §2.3, AC-AUTH-6)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| CIR-01 | `seq = 1` is `custodianship_declared` for every circle; two subjects ⇒ seq 1 AND 2, before any other event | §2.3 | pgTAP | 1A | green | 006:3–4 |
| CIR-02 | Declaration names subject (by name — its row does not exist yet), custodian, date | §2.3, PRD §7.5 | pgTAP | 1A | green | 006:5 |
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
| FRZ-07 | Rate limits: dismissed-prior claimant refused; 3/claimant/circle/30d; 10/circle/30d (constants → round-5 question) | PRD §7.5, plan d4 | pgTAP | 1A | green | 007:35–40, 51 |
| FRZ-08 | Direct INSERT/UPDATE/DELETE refused on both tables from EVERY request-path entry point (42501, before any policy) | §2.3 | pgTAP | 1A | green | 007:10–22 |
| FRZ-09 | `hc_internal` bounded: freezes never deleted; claims ledger append-only even for the writer role | §2.3 | pgTAP | 1A | green | 007:23–26 |
| FRZ-10 | Writer inventory exact: {request_freeze, adjudicate_freeze, grant_vectors} on freezes; {request_freeze} on claims | §2.3 | pgTAP | 1A | green | 007:52–53 |
| FRZ-11 | Freeze request/claim/adjudication are access-log events; claimant PII never in the log | PRD §7.5 | pgTAP | 1A | green | 007:30, 34, 46 |
| FRZ-12 | Adjudication outcomes: dismissed/upheld clear `frozen`; narrowed unresolved holds named subject, reopens the other; unnarrowed holds whole circle | §3.8 | pgTAP | 1A | green | 004:16–21 · 007:41–48 |
| FRZ-13 | Unresolved read-only carve-out (coordinators-not-objected-to capped at `view`); until it lands unresolved closes everyone (fail-closed staging) | §3.8, ADR-0003 f4 | pgTAP | **1B** | **pending** | — |
| FRZ-14 | `hc.approve_proposal()` refuses under freeze | §3.7 | pgTAP | **1B** | **pending** | function lands 1B |
| FRZ-15 | Frozen arrival parked; no retry consumption; terminal-transition refusal; outbox re-enqueue on dismissal; sweeper recovery | §4, A.5 | pgTAP + worker | **1C** | **pending** | pipeline lands 1C |
| FRZ-16 | Freeze suspends exports/deletions/invites at circle level | §2.3 | pgTAP | **1B/1C** | **pending** | those surfaces land later |

## 1A — performance (TSD §3.2, §3.12; ADR-0002 n2; ADR-0003 f9)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| PRF-01 | Every textual `(select hc.ctx())` reference is an InitPlan node; any SubPlan is hashed (one-shot); zero per-row plans | ADR-0002 n2 | pgTAP | 1A | green | 008:1–4 |
| PRF-02 | **Measured** ctx() executions == textual references (1 and 2), never per row, over a visible scan at volume | ADR-0003 f9 | pgTAP | 1A | green | 008:5–7 |
| PRF-03 | Volume wall clock under the 250 ms O(rows) tripwire (measured 2.9 / 11.2 ms local; §1.8 page budget 1.5 s) | §3.12, §1.8 | pgTAP | 1A | green | 008:8–9 |
| PRF-04 | InitPlan/LEFT-JOIN null-extension regression against the real search schema | §7.2, ADR-0002 c1 | pgTAP | **1D** | **pending** | 000 carries the synthetic version |

## Platform regression net (pre-1A)

| ID | Assertion | Source | Layer | Slice | Status | Test |
|---|---|---|---|---|---|---|
| PLT-01 | The 15 Postgres behavioural assumptions from the Step-2 spike | ADR-0002 | pgTAP | init | green | 000:1–15 |
| PLT-02 | Documents-first lock ordering (deadlock repro + rule) | ADR-0002 n3 | multi-session | **1B** | **pending** | `test:concurrency` runner |
| PLT-03 | ALTER TYPE … ADD VALUE upgrade-path fixture (55P04 rule exercised) | ADR-0002 n5, ADR-0003 f7 | pgTAP | **1C** | **pending** | first ADD VALUE migration is 1C |
| PLT-04 | Function-ACL-denial segfault on this image (backend signal 11) — closure asserted via catalog until fixed upstream | this slice | review | 1A | review | round-5 packet, upstream report |
