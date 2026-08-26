## Slice 6B — the Care Inbox app increment (B1–B10, and the eight defects the close-out gate found) [DO NOT MERGE without owner sign-off]

**Merge authority is the owner's alone (ADR-0006); the merge is a merge commit, never squash.** An unanswered item defaults to NOT MERGED.

**Round 18 has NOT run yet.** This PR is open so the review can confirm CI on both the `push` and `pull_request` events, exactly as round 17's #11 was. The kickoff that starts that review is `docs/review/round-18-kickoff.md`.

### What this branch delivers

Ten units **B1–B10** branched from `main` @ `b0cc2b6` — round 17's merge commit (`d59de15`, ADR-0025 **ACCEPTED AS CORRECTED**) — plus the **S16.8 slot** and seven review legs. Red→green per unit, with the failure signature in every red commit message.

6A gave the database the power to express §4.2. **6B is the slice in which a person can finally see it:** the review screen, the two decisions, the receipt, the citation that lands on a region a human can look at, and a reading aid for a page that has no text layer.

- **B1 — the rasterizer swap, FIRST, before any consumer.** `mupdf` (AGPL) out; `pdfjs-dist` + `@napi-rs/canvas` in, each licence re-verified from its installed manifest with the output pasted into the red commit. True stored pixels read from the header; EXIF orientation normalised before geometry.
- **B2 — the rendered source, contracted.** Q6 decided on RENDER, and **the assertion is the mechanism: a network call attempted during an email render is a TEST FAILURE**, asserted rather than reviewed.
- **B3 — the pipeline owed batch.** The staging sweep by prefix age, `READ_VT_SECONDS` past the longest stage, `msg.facts` validated at runtime, `answer.dropped` counted.
- **B4 — the band consumer.** Q4's three-state result rendered honestly — `all_high` once globally, `uncalibrated` per fact. `HC-FIXTURE-503` → `HC-FIXTURE-OVERLOAD` (529).
- **B5 — the signal, THEN the fire, in that order,** as two commits. The Care Inbox tells the truth about itself before `fireWorker` joins the relay; the fire's own test asserts the signal is present, so a refactor that removes the signal fails the fire's test.
- **B6 — the Care Inbox hardened + the arrival route.** The three `{ data }` destructures read `error` and render an error state, never an empty one. `no-html-link-for-pages` **RETIRED**, with the reason written down.
- **B7 — the review screen, §4.2.3's three regions** — the slice's centre. **A11Y-07's structural half ships IN the screen**, not as a follow-up, per §8.7's rule that a structural accessibility failure found late *"is a redesign, not a fix."* No control anywhere approves more than one item.
- **S16.8 slot — `20260825120001_payload_contract.sql`**, the pre-authorised migration. Closes **ADR-0025 F-1's OWED residue** (064:21–32).
- **B8 — editing, the receipt, and the loop closing.** The decide route and a key that is a fact rather than a hope. A corrected value rides `p_edits`; **the `extractions` row is never rewritten**, because the extraction is the honest record of what the model read.
- **B9 — OCR (§6.9), A11Y-08, and the audit list pinned.** The reading aid, and the fence it reads through. OCR is never an approved fact and never provenance.
- **B10 — the corpus, and what would open G9.** The blind corpus 12 → 40, a scorer that measures citation correctness, and the threshold rule written down before any run can produce a signable artifact.

**Migrations 69 exact. The migration bound closes SPENT at 7 of ≤ 7** — there is no remaining DDL authority, and any round-18 disposition needing DDL requires a fresh owner amendment stated before a line is written. `PROMPT_VERSION` is `hc-6b-1+35dad2ec988dad6f`.

### The close-out: the gate was RED, and it was red for eight real product defects

**This is the headline, and it is not the green.** The close-out gate took **nine runs** to reach green. It found **eight defects**, F1–F8 — three of which no unit test in this repo could have seen. **Two fixes were wrong before the third was right.** One defect was **classified as environmental TWICE** before being found to be a regression this slice's own close-out had introduced. **Nothing was re-run to green.** The whole sequence is in ADR-0026 D15 and D17–D21, with the wrong turns left in.

| | The defect | Where it landed |
|---|---|---|
| **F1** | `input[type='file']` had no §8.7 touch floor | fixed at the class |
| **F2** | `String(row.received_at)` on a node-pg Date turned **all seven review legs red** — **round-16 R5/F-1 RECURRING** | fixed at the class: `lib/hc/rows.ts` + a scanner |
| **F3** | §6.9's OCR was **absent from the running app** | four attempts (D17) |
| **F4** | `require.resolve` on a **variable** → `Can't resolve <dynamic>` **481–556× per run**. **Classified as environmental twice** | D17 — the sharpest lesson here |
| **F5** | the artifact route awaited storage **with no bound** | D18 — recorded as the FIRST HALF of a fix, because r7 found the rest |
| **F6** | the bound was in the **wrong place**, and **per-call bounds do not compose** | D20 — ONE 15 s budget for the whole request, `lib/http/budget.ts` |
| **F7** | leg 17 counted EICAR's fixed sha across the **whole bucket**, so it **passed only on the first run after a storage reset** | D19 — scoped to the circle, pinned by a scanner test |
| **F8** | leg 33 had been running at **60–70% of its 120 s budget on every run it ever passed** | D21 |

**Two of those — F7 and F8 — were *passing* legs that were checking less than they claimed.** The round-18 kickoff asks the review to disposition **the suite** on that basis, not merely the eight fixed defects.

### Evidence at the evidence head `7496cbc`

`7496cbc` is the last commit that moved a non-docs tree. Docs-only commits after it carry ADR-0026, the coverage rows, the packet, the kickoff and this body. **The rule, checkable at whatever head you read:** `git diff --name-only 7496cbc..HEAD` lists only paths under `docs/`.

Every command run SOLO:

| Check | Result |
|---|---|
| **browser gate (38 legs, teed)** | **38 passed (7.6 m)** — `r9`, a fully green gate |
| `vitest` | **877 / 877** across 75 files |
| `lint` · `typecheck` · production `build` | clean · clean · clean, **zero `<dynamic>` warnings** |
| `db:reset` → `verify-migration-state` | **exact 69** |

**Carried forward from `bc3bc85` on a stated reason, re-checked at the final head rather than asserted** — `git diff --name-only bc3bc85..HEAD` touches **zero** files under `supabase/` and **zero** under `scripts/concurrency/`: `test:db` **1622/65 PASS** · `test:concurrency` **75/75** + the upgrade leg · `db:verify --fail-on warning` clean · gitleaks **418 commits, no leaks** · G9 dry-run **40/40 built, nothing sent**.

**PRF-07 is report-only.** Worst figure **20 479 ms — scanned PDF at queue depth 4 = 34.1%** of §13.2's 60 s budget. Stated as PRF-06 requires: **that says our machinery leaves the provider ~40 s, NOT that the budget is met.**

**Fourteen coverage rows moved** — twelve to green, two asserted unchanged (`RCP-02` pending tagged 7, `UXA-03` pending). **SIG-01 is NOT absorbed.**

### CI — green, and what it does not cover

The branch was pushed on owner authority during close-out; before that, **no 6B commit had CI of any kind.** **Every CI run this branch has ever had concluded `success` on attempt 1** (runs 151 onward — confirm the newest yourself rather than trusting this line). CI runs `test:db` and `test:concurrency` from a cold database — twice per run, counting the upgrade leg — so the carry-forward above is corroborated by a machine that is not the build host.

**Two gaps, named here rather than left to be discovered:**

1. **CI does not run the browser gate.** Local by design. The 38-leg gate, and therefore every finding F1–F8, is **local evidence only**.
2. **CI does not run `npm run build`.** F4 was a *build-time* signal, so **CI would not have caught F4.** The zero-warning build claim is local-only. This is a defect in the pipeline; whether it is round 18's to disposition is the review's call.

Also: artifact and log downloads require authentication, so per-step conclusions and durations can be read from the public API but **suite tallies never can**. Do not quote one as if from CI.

### What is NOT claimed

- **Nothing is production-activated.** G4 and G7 still block.
- **The G9 gate STAYS OPEN.** Slice 6 does not close it — scoring being honest is not the same as bands being signed.
- **`BAND_ARTIFACT_ALLOWLIST` stays EMPTY.**
- **The slice-5B queue stays 39 OWED.**
- **RCP-02** is staged forward to row 7: Documents and People & roles do not exist. The receipt names every destination and 6B links only the two that resolve.
- **No real family data** was used anywhere.
- **Recorded as owed, not done:** `statement_timeout` on the request-role channel (F6's budget protects **the person, not the pool**); a bound on the artifact route's **body stream**; seven unbounded outbound fetches; and the fence transient — now **five occurrences across two fence files**, the fifth of which **cannot be named** because that run was not teed.

### Read in this order

1. `docs/review/round-18-kickoff.md` — the review session prompt: settled state, the task, the three places to attack hardest, and the standing traps.
2. `docs/review/round-18-packet.md` — **whole**, head ledger first. Its last row is a **RULE, not a SHA** (round-17 F-4; the packet tried once during close-out and was false ten minutes later — the correction is recorded in it). Five pointed questions Q1–Q5 with recommended answers.
3. `docs/adr/0026-6b-care-inbox-app-deltas.md` — **Status: proposed.** This round **ratifies or amends** it. D15 and D17–D21 are the close-out record.

Against `docs/review/slice-6-plan.md`'s **B1–B10 rows (the letters are BINDING)**, and the inherited obligations in **ADR-0025** and **ADR-0023**.

**Q1 carries an owner position** (recorded 2026-08-25: `@tesseract.js-data/eng` accepted as **data** for the Q3 engine, not a fourth argued runtime dependency). **A position is not a disposal** — it is the round's to rule on. **DEC-01's coverage cell records the S16.8 residue closure; F-1's FIXED-IN-PART verdict stays the round's to move** (RULING 5).
