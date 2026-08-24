## Slice 5B — extraction + interpretation, the app half (B1–B9) + the round-16 review [DO NOT MERGE without owner sign-off]

**Merge authority is the owner's alone (ADR-0006); the merge is a merge commit, never squash.** An unanswered item defaults to NOT MERGED.

### What this branch delivers

Nine units B1–B9 branched from `main` @ `a9d9f43` (CI run `32609469623`, success — the regress terminates there), then the round-16 review and its fixes. Red→green throughout, with the failure signature in every red commit message.

- **B1 — one governed corpus.** `fixtures/g9`, 28 items (16 development / 12 BLIND), **every byte generated** by `scripts/fixtures/g9-build.mjs` from a spec table inside that script. The partitions are a property of the TREE: `lib/eval/blind` is §1.7-fenced to `scripts/eval/**` and `tests/eval/**`. Plus `docs/eval/g9-corpus-spec.md`, which states its own limits.
- **B2 — the rasterizer.** The `mupdf` verification spike **8/8 legs PASS**, so the spike-contingent runtime reserve is not consumed. `lib/pipeline/render.ts` as §6.3 rules-as-code, the four named ceilings answering **from the header** before any decode, and the lease-scoped → promoted page lifecycle.
- **B3 — `lib/ai/`.** Six modules, one fence. The adapter contract is asserted **on the request body the provider receives**, against a local fixture server. `fallbacks`, the Files API, provider citations and `budget_tokens` are absent rather than configured off; `maxRetries: 0` is argued against §4.3's single durable attempt counter.
- **B4 — the extract worker.** `[stage]` gains `extract`; the claim carries `(model_id, prompt_version)`. **The all-high-risk mode is structural**: bands load only from an artifact whose sha256 is in a checked-in allowlist, matching model + prompt version + configuration hash, naming the BLIND partition, with every banded field present. `BAND_ARTIFACT_ALLOWLIST` ships **EMPTY**, and a test asserts it.
- **B5 — the interpret worker.** §4.8's conflict rule is **mechanical, not prompted**; an unchanged value proposes nothing at all; §3.10's boundary is enforced twice.
- **B6 — the stage-2 surface.** `ProvenanceLine` takes its first consumer (Q6 decided on its first branch, red-first). Shipped partially met; **completed in the review** — the copy now names the matched document.
- **B7 — the relay flip.** The `FIREABLE` set gains extract and interpret; `releaseDeferredWork` drains D13's backlog (11 messages on first live run).
- **B8 — inherited surfaces.** `lib/db/evidentiary.ts` **DELETED** (the ADR-0019 D7 interim retired) onto `hc.log_artifact_read`, which re-proves RLS-10 in-function. SND-03 goes live at `/[circle]/senders`.
- **B9 — the harnesses.** The G9 harness (the sole real-key path, `--dry-run` verified 12/12 with **nothing sent**), PRF-07 **run** not merely written, and the E2E extraction leg.

**5B was app-only when built; the round-16 review changed that.** The owner
granted a migration bound amendment (≤ 6 → ≤ 8) for four things, landed as
**M7** and **M8** with pgTAP **057** and **058**. Bound closes **SPENT at 8
of ≤ 8**; 62 migrations / 59 pgTAP files. Dependencies are unchanged —
exactly the two Q3-approved runtime packages — and **the dev-dependency
reserve is UNSPENT**.

**No provider is called anywhere.** CI is keyless, the local gate is keyless, and the eval harness is the sole real-key path — over synthetic material, never a real document. Nothing is production-activated: proposals REST at `pending`, because the review screen, item-level approval and the receipt are slice 6's.

### The round-16 review

`docs/review/round-16-findings.md` carries **113 findings verbatim** from
eight independent adversarial lenses (10 BLOCKER / 40 MAJOR / 33 MINOR /
30 OBSERVATION), landed before anything was argued. `ADR-0023`
dispositions **every one** with an argument, and two of the packet's own
recommendations are **declined** on the record (Q-B and Q-D — Q-D's
premise turned out to be false against the shipped schema).

**Twenty-five findings are fixed red→green on this branch** (plus one
partial), including **all eight BLOCKERs that were fixable** — the other
two are owner decisions, below.

> **Sign-off note (2026-08-23).** This body is the text posted to PR #10
> and is left as posted. The sign-off found two D17 rows still reading
> OWED for fixes that had landed (R3/F-9 at `f62305c`, R6/F-6 at
> `da68887`), so the correct figures are **27 fixed / 39 owed**, and this
> paragraph's "eight BLOCKERs fixable, two owner decisions" was right
> where ADR-0023's own Consequences bullet said seven and three. See
> ADR-0023 D24. Highlights:

- **§4.8's conflict arm was inert in production** — `hc.record_context_for`
  returns `profile_facts`; both consumers read `.facts`, so no conflict
  could ever be drafted and a dose change silently superseded the record.
- **A 300-dpi scan rendered at 617×824** — below even the standard tier —
  because `PT_PER_PX` is mupdf's *no-DPI fallback*, not a law. Every
  corpus fixture is density-free, which is why nothing caught it.
- **The provider adapter was binary to git** (one NUL byte): no diff in
  any review surface, invisible to `rg`, outside gitleaks.
- **The senders page threw on every non-empty list**; SND-03's revoke half
  was unreachable through its own surface.
- **The blind-partition fence had three bypasses**; the G9 gate's
  guarantee was a convention, not a property of the tree.
- **Extracted values (`ssn`, `date_of_birth`, doses) outlived the arrival**
  in a never-pruned queue archive, outside the deletion ledger.

**Three items are escalated and remain the owner's:** `mupdf` is
AGPL-3.0-or-later and unrecorded; the G9 corpus cannot pass its own gate
(8 of 12 blind items contain no rendition of their labels); and §4.5's
cancel window is now ~35 s on a non-refreshing surface, with the only
arrival email firing as it closes.

### The finding the build session put on the table itself

**ADR-0022 D15 — one column grant, and an empty Care Inbox.** `authenticated` holds a COLUMN-LEVEL select grant on `public.arrivals` (25 of 28 columns); 5A M5 added `duplicate_of_document_id` without extending it. B6's first draft named it in the inbox select, Postgres refused per-column, supabase-js returned an ERROR rather than rows, and the page's own empty branch took over — **the entire Care Inbox rendered its first-run empty state, for every caller, on every arrival.** A 4B gate leg going red was the tell; nothing else in the stack could have found it.

The tree was fixed on the branch with a guard asserting on the **SELECT STRING**, because a render assertion cannot tell "no arrivals" from "the query was refused" — which is exactly how this passed a green unit suite.

**The review closed it properly.** The owner granted the bound amendment, so **M7** lands the grant, the §4.7 p2 copy now reads *"This looks like the discharge summary you filed on July 12."* — the plan's B6 text — and **DUP-02 and UXA-02 both read green**. M7 also carries an `information_schema.column_privileges` **exact-set invariant**, so any future column added to `public.arrivals` reds pgTAP until someone rules on whether members may read it: the class is closed, not just the instance. The app-side guard became an allowlist over every clause, since Postgres refuses on `where`/`order by` references too.

### Evidence at the closing head — every leg re-run, nothing inherited by F12

| Leg | Result |
|---|---|
| Clean-leg reset | `migration state exact: 62 applied == supabase/migrations` |
| pgTAP | **Files=59, Tests=1513, PASS** (57 files / 1497 at 5A; 057 adds 9, 058 adds 7) |
| Concurrency | **70/70** assertions (teed) |
| `db:verify` | **No schema errors found** (`--fail-on warning`) |
| Upgrade leg | base `a9d9f43` → exact 60 → `migration up` → exact 62 → pgTAP **1513 PASS** → concurrency **70/70** |
| vitest | **685 passed (685) across 64 files** (true baseline 632 — the packet's 631 is corrected in ADR-0023 D16) |
| lint · typecheck | clean |
| **Local gate** | **29/29** on a clean reset — onboarding 11 · a11y 5 · ingestion 8 · extraction 5. No credential anywhere in the run |
| mupdf spike | 8/8 — `SPIKE VERDICT: mupdf carries §6.3`, re-run after the DPI fix |
| G9 harness dry-run | 12/12 requests build; **nothing sent** |
| G9 corpus `--check` | `corpus matches the spec` — **now a CI step** |
| PRF-07 | cold + warm(d1) + warm(d4) run; table in ADR-0022 D12 |

`supabase/` moved with M7 and M8, so **nothing is inherited by the ADR-0015 F12 per-directory binding this round** — every leg above was re-run at the closing head, including the four DB legs the original packet took from CI.

**On "24/24 UNCHANGED":** this branch does not claim it. Two gate legs were deliberately amended, each argued in place — ingestion's cancel leg (the build session's, ratified at packet Q-I(2)) and extraction's DUP-02 leg (the review's, once Q-A made the citation possible). The honest statement is **29/29 with two argued amendments**.

During the build, three gate runs were needed and **each found something real**: a Windows-only `file://` comparison in the fixture server's CLI guard, the column-grant finding above, and two fixture assumptions (the cancel leg's seam, and §4.9's deferred claim trigger doing its job). **No failed leg was re-run to green.**

### The review

`docs/review/round-16-packet.md` carries the head ledger, the F12 per-directory binding and **nine pointed questions Q-A–Q-I with recommended answers**. All nine are answered in `ADR-0023`: Q-A, Q-C, Q-E, Q-F, Q-G, Q-H and Q-I ratified (several with amendments named), **Q-B and Q-D declined** with the argument.

**Read in this order:** `docs/review/round-16-findings.md` (the 113 findings, verbatim, unargued) → `docs/adr/0023-slice5b-review-round-16.md` (every disposition, with the argument) → `docs/adr/0022-5b-app-extraction-deltas.md`, which is **AMENDED rather than ratified**: five of its claims were falsified and each is corrected by a numbered disposition.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
