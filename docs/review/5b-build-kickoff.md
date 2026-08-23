# 5B build kickoff — the app increment, B1–B9 (fresh session, by design)

HARPER'S CIRCLE — SLICE 5B BUILD SESSION (the APP half of extraction +
interpretation; round-16 cadence). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  **5A IS MERGED TO MAIN AND STAMPED.** Merge commit `7893b80` (parents
  `7832d53` + `b5265cf`; PR #9, MERGE COMMIT never squash, merged tree
  verified identical to `b5265cf`'s), SHA stamped at `648ee7b` — both
  CI-green on `main` via the anonymous public API (runs `32600108722`
  and `32600314259`, every step including the upgrade leg with M6 in
  the chain). **Round 15 is CLOSED**: three findings (1 HIGH, 2 MEDIUM)
  accepted and fixed red→green in M6, all seven pointed questions
  Q-A–Q-G ratified, ADR-0021 **Accepted** with the owner's sign-off
  addendum S1–S4, **ADR-0020 ratified as written**, TSD annex A11
  adopted, coverage §5 re-referenced with no row flips.
  **THE PLAN IS RULED AND REVIEW-INTEGRATED.** `docs/review/slice-5-plan.md`
  is PLANNED–RULED with **Q1–Q9 SETTLED verbatim** (Q1–Q7 at the gate;
  Q8/Q9 at the post-gate review integration — that section is part of
  the plan's letter, not commentary). **5B executes on those rulings —
  there is NO new plan gate**, exactly as 5A did.
  **Slice 5's migration bound is SPENT: 6 of ≤ 6 (Q2).** 5B is the app
  half: `supabase/` is expected to stay **byte-identical to main**
  throughout (tree `6ac8a1cd…`, 60 migrations / 57 pgTAP files — the 4B
  `d7f2f36` precedent). Any DDL is an **owner bound-amendment first**,
  never a session decision.
  The regression net 5B must not dent (measured at `a0f194b`, carried
  through the merge): clean-leg reset exact **60** · pgTAP **1497/1497
  across 57 files** · concurrency **70/70 across 44 cases** (teed) ·
  db:verify clean under `--fail-on warning` · vitest **448/448 across
  53 files** · local gate **24/24** (walkthrough 11 + a11y 5 +
  ingestion 8) · lint/typecheck/production build clean · both CI
  scanner scripts exit 0.
  **RECORDED, NOT TO BE RE-LITIGATED:** vitest's first run at `a0f194b`
  reported 447/448 under load; two local re-runs and CI's own vitest
  step were clean; the failing test was never identified before it
  stopped reproducing. It stands as an **unreproduced transient,
  explicitly NOT diagnosed** — consistent with the recorded
  forks-worker class.

THE TASK — build 5B (app, B1–B9) per the SETTLED plan:
  Authority: `docs/review/slice-5-plan.md` (Q1–Q9 verbatim — the build
  executes on those rulings; the B-row letters **as amended by the
  post-gate integration** are BINDING) → TSD §6, §4.3–§4.10, §3.10,
  §1.9, §13.2 as amended by annexes A5/A6/A9/A10/**A11** →
  ADR-0017/0018/0019/**0020/0021** (the inherited items) →
  `docs/coverage.md` row conventions.
  1. FIRST ACTION: confirm `main` head (this kickoff's commit or a
     later docs-only) and CI green AT THAT HEAD — anonymous public API;
     `gh` is UNAUTHENTICATED, never device-flow; pending never counts.
     Branch **`slice/5b-app-extraction`** from it (Q7).
  2. SKILLS GATES — **`claude-api` BEFORE ANY provider-shaped code**
     (the adapter, the eval harness, the fixture server; this gate is
     new with this slice and stands for EVERY session that touches
     `lib/ai/`) · `vercel:nextjs` **and** the AGENTS.md
     `node_modules/next/dist/docs/` guides before route work ·
     `supabase:supabase-postgres-best-practices` **only if** DDL is
     ever authored — which requires the owner bound-amendment first ·
     `frontend-design` only if B6/B8's small surfaces need components
     the slice-3 system lacks (they should not — **compose, don't
     invent**).
  3. Build B1→B9 in order, red→green per unit, the failure signature in
     every red commit message. **B1 FIRST — corpus before any
     provider-shaped unit (Q5, settled).**
     · **B1 the G9 corpus** — labelled synthetic fixtures, NEVER real
       family material (PRD App. B); per-field labels on PRD §6.4's
       risk-class list; **ONE GOVERNED corpus, TWO consumers, immutable
       partitions** — a DEVELOPMENT partition for worker/adapter tests,
       the fixture server and prompt iteration, and a **BLIND
       EVALUATION partition read by scored runs ONLY**, so bands are
       never measured on their own development set. Deliverable
       includes the **corpus spec**: minimum support per field × source
       type, negative examples, ambiguous-label adjudication, and the
       proposed per-field bands the owner signs at the G9 gate.
     · **B2 the rasterizer — THE `mupdf` VERIFICATION SPIKE FIRST**
       (the vault's `verification-spike` pattern), before the install
       is treated as settled: born-digital PDF → page images + text
       layer · phone JPEG → 2576 px long edge, never below · encrypted
       → `needs_password` · undecodable → `unsupported_type` · PLUS the
       hostile-and-limits legs (malformed/truncated refuse cleanly;
       decompression/pixel-bomb shapes abort under explicit page-
       dimension, memory and wall-clock ceilings **BEFORE any provider
       dispatch**) · **EXIF orientation normalised BEFORE geometry** ·
       **deterministic geometry proven round-trip** (a normalised
       `{page, bbox}` cuts the visible crop). If the spike falsifies
       `mupdf`, the recorded alternatives are `pdfium` bindings or
       `pdfjs-dist` + canvas — and the ONE spike-contingent runtime
       reserve is consumed only with the spike's evidence in the
       commit. Then `lib/pipeline/render.ts` as §6.3 rules-as-code, and
       the **rendered-page lifecycle**: attempt-scoped staging keys,
       GC'd when a lease closes as anything but `advanced`, **PROMOTED
       write-once per-arrival on `advanced`**. **Slice-5 exit
       assertion: stored citation coordinates and promoted pages accept
       slice 6's OCR text as a later addition without changing either**
       (so Q6's deferral cannot force rework).
     · **B3 `lib/ai/` — the provider adapter.** ONE fenced module
       family (ESLint-fenced to the worker routes + eval harness, the
       `lib/hc` precedent). Structured outputs (`output_config.format`
       — a parseable object, never a JSON-shaped string); **the
       provider's citations feature NEVER sent** (§6.4's recorded
       incompatibility) — our own normalised `{page, bbox}`;
       `max_tokens` sized for thinking PLUS output (§6.1's truncation
       trap); the record-context prefix behind a `cache_control`
       breakpoint with the 512-token minimum **checked, not assumed**;
       operator context as `{"role":"system"}`, never in the arrival's
       turn; source text as delimited data; **`stop_reason` checked
       FIRST — a refusal is HTTP 200** and maps to the honest terminal
       path, never "unsafe" copy; **no server-side fallbacks, ever**;
       no Files API; model allowlist pinned with **`claude-fable-5`
       refused**; client-side timeout inside the lease deadline;
       `model_id` + `prompt_version` from config, recorded on every run.
     · **B4 the extract worker** — `[stage]` gains `extract`: claim →
       COMMIT → render (B2) → provider (B3) → `hc.finalize_extraction`.
       `risk_class` assigned **by field, before the call**; the
       all-high-risk mode is **STRUCTURAL, not configured** — bands
       load ONLY from an allowlisted eval artifact whose configuration
       hash matches the running `(model_id, prompt_version)` manifest,
       and a **missing, stale, altered or partial artifact FAILS CLOSED
       to all-high** (a test for each shape). Uncited facts become
       questions or are dropped. `maxDuration` set explicitly (§1.9).
       The P5 caps (≤200 facts, ≤8 KB values, ≤50 proposals) bound the
       schema asked for — **refusal-shaped, not truncation-shaped**.
     · **B5 the interpret worker** — `[stage]` gains `interpret`
       (claim's in-flight transition, ING-07): `hc.record_context_for`
       (M2) → the §6.6 record-aware pass → proposals AND conflicts
       drafted (**a high-risk change is ALWAYS a conflict, never a
       quiet update**), `anomaly_flags` set for injection shapes →
       `hc.finalize_interpretation` → `proposals_ready`. The structural
       guarantees restated **as tests, not prose**: the pipeline cannot
       reach another subject's record, and cannot act on its own
       conclusions (§3.10 — the blast radius of full injection success
       is a proposal a person must read).
     · **B6 stage-2 surface + copy** — the §4.7 p2 member surface on
       the EXISTING inbox machinery; copy cites the matched FILED
       document; `same_thing` lands the additional-source outcome,
       `different` resumes. **`ProvenanceLine.tsx` takes its first
       consumer here if build truth fits, else its design-conformance
       citation moves honestly to slice 6 — decided RED-FIRST, recorded
       either way (Q6).**
     · **B7 the relay flip + the seam consumed** — D13's defer branch
       flips to consume; the **+1 h deferred backlog drains**; the
       sweeper advances the new stages (**no sweeper change expected —
       stage-agnostic by construction, ASSERTED not assumed**). The Q7
       seam CLOSES: a gated arrival proceeds `extracting → extracted →
       interpreting → proposals_ready`, inbox reads `Needs you`.
     · **B8 inherited surfaces + boundary retirement** — the artifact
       route moves its access-log append onto M1's
       `hc.log_artifact_read`; **`lib/db/evidentiary.ts` is DELETED**
       (the D7 interim retired; evidence-before-bytes unchanged), fence
       and containment pins re-pinned to the shrunken surface. The
       known-senders member surface (M1's guarded read + the existing
       `hc.revoke_sender`): list + revoke, composed from slice-3
       components.
     · **B9 the eval harness, the p95 harness, the E2E leg** — (1) the
       G9 harness: the **BLIND** partition through the Batch API, keyed
       `(model_id, prompt_version)`, per-field precision/recall against
       B1's labels, **every run writes an immutable full-configuration
       manifest**; opt-in with a real key, **never CI**. (2) The §13.2
       p95 harness with its **method stated** (cohorts per document
       class, stated sample count, **warm and cold reported
       SEPARATELY**, the PRF-06 warm-p95 percentile method, single and
       concurrent queue depth), **report-only locally**; the hosted
       provider-inclusive measurement is a named `ai-provider.md`
       activation row carrying the PRF-06 **breach-clause** discipline.
       (3) The E2E extraction leg under the local-gate protocol
       (fixture server in the gate stack, the clamd-container
       precedent): upload → store → scan → gate → extract → interpret →
       `Needs you` on screen; a refusal fixture → `Couldn't read it`
       with the artifact still viewable; a needs-password fixture; the
       stage-2 same-email pair → suspect → both resolutions live;
       **walkthrough 11 + a11y 5 + ingestion 8 re-run UNCHANGED**.
  4. Coverage — **flip ONLY what this layer proves.** 5B closes the
     app halves left annotated at 5A — **EVD-01** (B8: route call +
     `lib/db/evidentiary.ts` deletion + fence re-pins) · **SND-03**
     (B8: the member surface) · **DUP-02** (B6: member surface + copy,
     ProvenanceLine per Q6) · **INJ-01** (B5: the worker-layer proof) —
     and opens/closes the 5B-only rows **RND-01** (B2) · **AIA-01**
     (B3) · **WRK-02** (B4/B5/B7) · **EVA-01** (B1/B9 — the G9 GATE
     itself closes at owner sign-off of the bands, before any real
     document, never quietly) · **PRF-07** (B9) · **UXA-02** (B6,
     review). **DO NOT TOUCH** the rows 5A closed outright: RTC-01,
     CTX-01, RUN-01, CNF-01.
  5. At each increment head, the plan's completion recipe: clean-leg
     reset **exact 60 UNCHANGED** · pgTAP **1497 UNCHANGED** ·
     concurrency **70/70 UNCHANGED**, teed · db:verify clean under
     `--fail-on warning` · upgrade leg green · vitest all green (counts
     exact) · **local gate 24/24 + the B9 extraction leg** under the
     protocol · lint/typecheck/production build clean · gitleaks clean
     · both scanner scripts exit 0. If `supabase/` is untouched as
     expected, say so with the tree hash rather than implying a DB
     re-verification that did not happen.
  6. At the end: the **5B as-built deltas ADR** (take the NEXT FREE
     number against `docs/adr/` at write time — the ADR-0019
     renumbering precedent; **likely ADR-0022**) · the **round-16
     packet** in the round-8 shape (head ledger from the start, one-SHA
     evidence block, F12 per-directory tree binding, pointed questions
     with recommended answers) · the **round-16 review kickoff**
     authored (the round-12/15 precedent) · branch pushed; **PR only at
     review start**.
  ⏸ STOP at the gate: round-16 review → dispositions → owner sign-off →
  merge are each their own fresh session (ADR-0006).

INHERITED OBLIGATIONS (verbatim in the plan and ADRs — read them):
  B8 discharges ADR-0019 D7 (the evidentiary-module retirement) and
  D15's known-senders member surface · B7 consumes ADR-0019 D13's
  deferred backlog · B9 discharges D15's §13.2 p95 gap to its honest
  local limit · **round-15's observations 2 and 3 are findable HERE**:
  (2) conflict replay is narrower than full request equivalence — Q9
  settles the outcome-bearing identity for the increment, the broader
  semantics belong with the approval surface; (3)
  `arrivals.duplicate_of_document_id` is retained after resolution by
  design (ADR-0020 D6) — **the pointer is NOT evidence the arrival is
  still unresolved; the STATE is** — a consumer caution for B6's
  surface · the **SND-02 live-actor family audit** (ADR-0021 D2/S2)
  rides with the account-deletion path, NOT with 5B · the G4 deploy
  rows and G7's hardening set stand on their checklists · §5.9's
  monthly-ceiling notification stays slice 11 · G12 still blocks the
  first non-founder invitee.

RECORDED TRAPS (the app-session set; memory-verified):
  **NODE_ENV stubs poison jsx runtimes on lazy TSX imports** — order
  the tests, never stub `development` · eslint-config-next plugin
  redefine guard (rules-only blocks); `recommended` contains `'off'`
  entries · scanner tests match their own comments · **forks-worker
  spawn failure is an infrastructure transient — re-run once**, and a
  vitest failure under load that will not reproduce is recorded as
  such, never claimed as diagnosed · `hc.*` rides the **request-role
  channel**, privileged ops the **maintenance boundary**, both fenced
  to `lib/hc` · **RELATIVE redirects** (the localhost/127.0.0.1 cookie
  trap) · replica-role teardown · gitleaks demo-JWT allowlist · WinNAT
  exclusion ranges eat the 543xx ports after reboot (elevated winnat
  restart + `supabase stop/start`) · **clamav container cold-start race
  (docker start revives) — the local gate needs it** · portless-but-
  healthy Mailpit tail · never interrupt a db reset; post-reset Kong
  502 → `docker restart supabase_kong_HarpersCirclev3` · **tee
  concurrency output ALWAYS** · **PowerShell: `git commit -F`, never
  `-m`** · `gh` UNAUTHENTICATED (CI via the anonymous public API;
  never device-flow) · a CI "Start local Postgres" `toomanyrequests`
  failure is the **ECR quota transient** — re-run later, never a repo
  defect.

CONSTRAINTS: repo authoritative, vault holds pointers · main stays
  green (all work on the branch) · **the migration bound is SPENT at
  6 of ≤ 6 — `supabase/` stays byte-identical (tree `6ac8a1cd…`);
  any DDL is an owner bound-amendment FIRST** · shipped migrations
  never edited · dependency bound: the **TWO approved runtime deps**
  (`@anthropic-ai/sdk`, `mupdf` — the latter behind B2's spike) + ONE
  spike-contingent runtime reserve + the standing dev-dep reserve;
  anything else is an owner amendment · **G9/G3 stand over the whole
  slice: fixtures only, CI KEYLESS, the eval harness the SOLE real-key
  path** · **never real family data — and under this slice's gates,
  never a real document to a provider** · browser legs LOCAL-gate only
  · the exit seam is honest: proposals REST at `pending`; the review
  screen, item-level approval and the receipt are **slice 6's** ·
  production activation stays G4/G7-gated throughout · owner sole merge
  authority (ADR-0006) · pending never counts as green · an unanswered
  item defaults to NOT MERGED.
