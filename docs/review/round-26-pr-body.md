# [DO NOT MERGE without owner sign-off] Slice 7B — Tasks + Timeline, the record app increment

**Merge authority is the owner's alone (ADR-0006); the merge is a merge commit, never squash.** An unanswered item defaults to NOT MERGED. **Round 26 has not run**; the reviewer's kickoff is `docs/review/round-26-kickoff.md`, and the deltas doc that doubles as the Tier-2 packet is `docs/adr/0035-7b-record-app-deltas.md` (`Status: proposed`).

### What this branch delivers

The plan's "### 7B" table verbatim (`docs/review/slice-7-plan.md`), from `origin/main` @ `7d2d395` (one docs-only merge past the `abb0398` the kickoff named), red→green per unit with the failure signature in every red commit. **Migrations: NONE** (M6 closes UNCONSUMED; `supabase/` untouched). **Dependencies: 0** (13/15 dev, the reserve UNSPENT). `PROMPT_VERSION` hc-6b-3 does not move. Nothing is production-activated.

- **B1 — the floors made honest, and the gate fixed, FIRST.** `tests/hc/review.test.ts` live (OW-01 — its first run corrected the module's own comment); `q.query<R>` typed at the boundary with a tsc-run type pin (OW-02); the timestamp scanner carries the class, eight branches (OW-17); **`liveSessionClaims` is deleted** — pages render `unavailable`, form routes and `proxy.ts` answer 503 + retry-after + private,no-store, `/confirm` never claims success for a pass that did not run, and `tests/app/page-gate.test.ts` pins every gated file on disk both ways (OW-11/15/18; GTE-01); both floors select the columns that exist, fail honestly, label every row and show its source (OW-20).
- **B2 — Tasks.** `lib/hc/tasks`: one RLS-true join; the point of selection computed from `hc.circle_people` exactly as `hc.assign_task` computes it (D19.7 + the ladder), driven both ways live. The list with `Mine · Unassigned · Overdue · All` + subject, counts post-filter over the rendered tree; the detail with what · who · when · a source that resolves or is named-never-linked; assign in two taps; the §4.5.6 crossing screen with the sentence and EXACTLY two human paths (path 2 behind the §5.7 step-up bound to `task:<id>+document:<id>` — the `hc-step-up` cookie's first consumer); complete/snooze with the count; unassign with the coordinator's keep option; empty states per tier.
- **B3 — Timeline.** `lib/hc/timeline`: two threads, the switch, the LABELLED combined view; kinds medical · care · admin (`memory` never an empty filter) and a date range; the creation entry first; episodes as wrappers that conceal nothing; the source resolved as far as access reaches (arrival linked/counted-never-named, the extraction, the approver; manual = the person and the date); add by hand as ONE action for a view×5 member, the event the receipt.
- **B4 — the legs, the manifest, the receipt, the budget.** Five record legs (`e2e/record.spec.ts`) + two a11y legs — the record-surfaces audit found and fixed two real WCAG 2.2 defects before any reviewer could (`18fbdba`); the receipt's task and timeline links land on THE OBJECT; `review.spec` asserts the task is ON the page; A11Y-07's guard is an assertion (OW-06); an `AnswerBudget` on every 7B page and POST, pinned by scanner (OW-03).

**`docs/owed.md`: nine TAKEN rows flipped `CLOSED(sha)`** (OW-01/02/03/06/11/15/17/18/20). Coverage: TLN-01/02/03, GTE-01, A11Y-09 flip green; SHR-02, TSK-01, TSK-02 and NAV-01 gain their app halves; **TSK-03/04 are HELD pending** — built and unit-proven, their e2e leg green by title but not inside a complete gate run (below). RCP-02 stays pending (7C).

### Evidence, at ONE declared head — `716cd49`

Clean-leg reset **exact 74** · pgTAP **69 files, Σ 1,809, PASS** (teed) · concurrency **82/82** (teed) · `db:verify` **clean** · vitest **1168 / 90 files by run** (982/79 at the base) · lint / typecheck / production build **solo, exit 0** · gitleaks (CI-identical container) **547 commits, no leaks** · evidence vault-side at `04-evidence/round-26-gate-716cd49/`. After `18fbdba`, only two test files moved; `app/ lib/ components/ supabase/` did not.

**The gate (45 legs) — said plainly, ADR-0035 D11.** Four complete runs at `18fbdba` on the 8 GB host: two died to a diagnosed dev-server kill (`[WebServer] FATAL ERROR: Committing semi space failed`), then **43/45 twice** under a heap cap. **Zero product assertions failed in any run; every one of the 45 legs passed in run 3 or run 4; every miss carries its mechanism from the retained trace.** By title at the final head: the tasks leg PASSED alone (68 s); **reject-all was not observed green at the 7B head** — three stops, three named host mechanisms (245 s ×2; the dev overlay after worker OOM; Chromium `ERR_INSUFFICIENT_RESOURCES`), last green at the round-24 gate. **The gate is therefore NOT claimed green at this head; its disposition is Q-H, the round's to rule.**

### What is NOT claimed

A 45/45 single-run gate at this head (Q-H) · a live auth-outage browser observation (GTE-01's bound, Q-A; OW-09 stays the owner's) · claim/self-assignment (Q-D; no DDL at 7B) · budgets on the auth forms (Q-B) · tier-aware nav composition (7C C6) · Documents/People pages — the receipt says where they open (RCP-02) · A11Y-10/11 · episode drafting.

### The seven pointed questions (recommended answers in ADR-0035)

Q-A GTE-01's e2e wording · Q-B the auth forms' budget (ledger row, 7C) · Q-C the Timeline's founding-subject default · Q-D claim's landing · Q-E the creation entry's `log`×5 visibility bound · Q-F RCP-01's cell rewrite (round 26's, ADR-0025 D6) · Q-G the record spec's 300 s per-leg budget · **Q-H the gate's disposition**.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
