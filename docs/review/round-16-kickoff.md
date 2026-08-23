# Round-16 kickoff — third-party review of slice 5B (fresh session, by design)

HARPER'S CIRCLE — ROUND 16 REVIEW SESSION (slice 5B, the APP half of
extraction + interpretation). Working directory:
`c:\Users\HCI\Desktop\Projects\HarpersCirclev3`.

STATE — settled, do not redo or re-verify:
  5B IS BUILT AND GREEN on `slice/5b-app-extraction`, branched from
  main @ `a9d9f43` (CI run `32609469623` green, every step — the
  regress terminates there). Nine units B1–B9 plus two fix commits,
  red→green throughout, the failure signature in every red commit
  message. **The branch is PUSHED and CI-green on it.**
  Q1–Q9 are SETTLED verbatim in `docs/review/slice-5-plan.md`; the
  build executed on those rulings, no new plan gate.
  **5B is APP-ONLY:** `supabase/` is byte-identical to main, tree
  `6ac8a1cd17110dfcf8c33852e251f2c522621661`, 60 migrations / 57 pgTAP
  files. **The migration bound stays SPENT at 6 of ≤ 6** and was never
  approached. Dependencies: exactly the two Q3-approved runtime
  packages (`@anthropic-ai/sdk` 0.120.0, `mupdf` 1.28.0); the
  spike-contingent runtime reserve NOT consumed (B2's spike passed
  8/8); **the dev-dependency reserve UNSPENT — deliberately held for
  THIS round's dispositions.**
  Evidence is in `docs/review/round-16-packet.md`'s one-SHA block:
  vitest **631/631 across 62 files** (baseline 448/53) · clean-leg
  reset **exact 60** · pgTAP, concurrency, db:verify and the upgrade
  leg **green in CI** (the authority for the DB legs this increment did
  not touch) · lint/typecheck/production build clean, no warnings ·
  both scanner scripts exit 0 · gitleaks green · the local gate re-run
  in full · the mupdf spike 8/8 · the G9 harness dry-run 12/12 with
  nothing sent · PRF-07 cold + warm + concurrent legs RUN.

  **ONE FINDING IS ALREADY ON THE TABLE, found by the local gate and
  fixed on the branch: ADR-0022 D15.** `authenticated` holds a
  COLUMN-LEVEL select grant on `public.arrivals` (25 of 28 columns) and
  5A M5 added `duplicate_of_document_id` without extending it; B6's
  first draft selected it, and the ENTIRE Care Inbox rendered its empty
  state for every caller. The tree is fixed and green; what is still
  owed is one line of DDL, which is packet **Q-A** and the reason the
  dev-dep and any bound-amendment conversation belongs to this round.

THE TASK — the round-16 review leg, the ADR-0006/round-8 cadence:
  1. Read `docs/review/round-16-packet.md` WHOLE (head ledger first,
     the F12 per-directory tree binding, the one-SHA evidence block,
     the eight pointed questions Q-A–Q-H with recommended answers).
     Then **ADR-0022** (Proposed — this round ratifies or amends),
     against `docs/review/slice-5-plan.md`'s B1–B9 rows AS AMENDED by
     the post-gate integration, TSD §6 whole + §4.3–§4.10, §3.10,
     §1.9, §13.2 as amended by A5/A6/A9/A10/A11, and the inherited
     obligations in ADR-0019 (D7/D13/D15) + ADR-0020/0021.
  2. Open the PR at the START of this session (the branch is already
     pushed; "PR only at review start" is this moment). Confirm CI
     green on the pushed head — anonymous public API, `gh` is
     UNAUTHENTICATED, never device-flow; pending never counts.
  3. Commission/receive the adversarial third-party review of the
     packet; land findings verbatim as
     `docs/review/round-16-findings.md` (docs-only, before anything is
     argued — the 5faccc4 precedent).
  4. Dispositions: every finding accepted/declined WITH the argument,
     the ADR-0006 way; fixes red→green on the branch; the dispositions
     ADR (next free number, likely ADR-0023); coverage re-referenced
     with any row flips argued; TSD annexes landed if adopted.
  ⏸ STOP at the gate: owner sign-off and the merge (never squash) are
  the owner's, each its own session unless the owner rules otherwise
  in-session (the ADR-0015 sign-off-with-merge precedent exists).

WHERE A REVIEWER SHOULD PUSH HARDEST (the build session's own view):
  · **`lib/extraction/bands.ts`** — the all-high-risk mode as
    structure. If anything here is wrong, a config accident enables
    bands G9 never signed. Six failure shapes, each with a test.
  · **`tests/ai/adapter.test.ts`** — the adapter contract asserted on
    the REQUEST BODY, not on our source. Check that the things declared
    absent (fallbacks, the Files API, provider citations,
    `budget_tokens`) are absent for the right reasons, and that
    `maxRetries: 0` is argued rather than accidental.
  · **`lib/pipeline/render.ts`** + the spike's leg 7 — the orientation
    door. The wrong one is a SILENT citation failure: every bbox lands
    in the wrong place and nothing errors.
  · **ADR-0022 D6, D7, D15** — three things the app layer could not
    close inside the bound. Each is a pointed question; each has a
    recommended answer that may well be wrong.
  · **`docs/eval/g9-corpus-spec.md` §1 and §7** — the corpus states its
    own limits. A reviewer should decide whether those limits are
    acceptable for a G9 gate, because the owner will be asked to sign
    bands against them.

RECORDED TRAPS (the review-session subset): CI via the anonymous
  public API only · a "Start local Postgres" toomanyrequests failure is
  the ECR quota transient — re-run later, never a repo defect ·
  PowerShell: `git commit -F` never `-m` · tee concurrency output
  always · never interrupt a db reset; post-reset Kong 502 →
  `docker restart supabase_kong_HarpersCirclev3` · the clamav container
  cold-start race (docker start revives) if the gate re-runs · **the
  gate stack now needs the Anthropic FIXTURE SERVER on 8787 too** —
  playwright starts it as a second webServer; if the port is taken the
  gate fails at startup rather than reaching for a provider ·
  function-ACL denial SEGFAULTS this image — privilege closure stays
  catalog-based · a vitest failure under load that will not reproduce
  is recorded as an unreproduced transient, never claimed as diagnosed.

CONSTRAINTS: main stays green (all work on the branch) · **the
  migration bound is SPENT at 6 of ≤ 6 — any DDL, including Q-A's one
  line, is an OWNER BOUND-AMENDMENT first, never a session decision** ·
  shipped migrations never edited · the dependency bound stands at the
  two approved runtime packages; the dev-dep reserve is available to
  this round's dispositions and nothing else · **`claude-api` BEFORE
  ANY provider-shaped change** (it stands for every session touching
  `lib/ai/`) · `vercel:nextjs` and the AGENTS.md
  `node_modules/next/dist/docs/` guides before route work ·
  `supabase:supabase-postgres-best-practices` before any DDL authoring,
  which requires the amendment first · **G9/G3 stand: fixtures only, CI
  KEYLESS, the eval harness the SOLE real-key path; never real family
  data, and never a real document to a provider** · browser legs
  LOCAL-gate only · proposals REST at `pending` — the review screen is
  slice 6's · owner sole merge authority (ADR-0006) · pending never
  counts as green · an unanswered item defaults to NOT MERGED.
