## Slice 7A — the four destinations, database increment (M1–M4) [DO NOT MERGE without owner sign-off]

**Merge authority is the owner's alone (ADR-0006); the merge is a merge commit, never squash.** An unanswered item defaults to NOT MERGED.

**Round 24 has NOT run yet.** This PR is open so the review can confirm CI on both the `push` and `pull_request` events. The kickoff that starts the review is `docs/review/round-24-kickoff.md`; the packet is `docs/review/round-24-packet.md`; the deltas ADR is `docs/adr/0032-7a-destinations-db-deltas.md` (`Status: proposed`).

### What this branch delivers

Four migrations **M1–M4** of the ≤ 6 bound (slice-7 plan Q2, the table verbatim), branched from `origin/main` @ `da51c00`, red→green per unit with the failure signature in every red commit, plus the four named concurrency cases. **M5 stays reserved** for this round's dispositions; **M6 closes UNCONSUMED** (Q2: the one-round-trip window ACCEPTED, LOG-03 opened never green).

- **M1 `task_assignment` — FIRST, SHR-02's function.** `hc.assign_task` computes the assignee's taint from HER OWN vectors, refuses a person with no context on the subject, hands a task plainly to one who can clear the taint, and otherwise takes exactly one of §4.5.6's two human paths: a **written instruction** (a `{schedule}` row carrying the typed sentence and nothing of the original; the original stays invisible to her though she holds it) or an **explicit named share** of task + document together behind a step-up bound to the pair. An in-function post-condition: an assignment never yields a task its holder cannot see. `hc.unassign_task` revokes exactly its own shares — a foreign share untouched, a coordinator's keep by id — and closes the instruction. The AI role holds no EXECUTE.
- **M2 `task_lifecycle`.** `hc.complete_task` / `hc.snooze_task`: the holder closes her work, or a manage-holder does; done is terminal and never deleted; a snooze moves forward only, counts, and writes one revision row naming the actor. The one argued line — the holder at `summary`, where §7.3 names `view` — is in the migration header and put to the round (Q-A).
- **M3 `document_audience`.** `hc.document_audience` names, by name and level before/after, exactly who gains and loses under a proposed category, on the move's own gate (manage on BOTH domains). `hc.recategorize_document` moves category, taint (through the ONE shrinking path), every derived object and the index row in one transaction, and logs both audiences by name. `hc.revoke_share` unshares in one action.
- **M4 `record_reads`.** Four definer reads, never wider than the RLS they stand in for and with NO policy moved: `hc.circle_people(circle)` (subjects as people, custodians named, levels per subject per domain with `hidden` spelled out, invites for coordinators, no levels under a freeze), `hc.document_references`, `hc.shares_for`, `hc.shares_for_member` — `document_references` and `shares_for_member` counted-never-named at the caller's own level (at `log` and above since ADR-0033 cluster A); `shares_for` names grantees to a manage-holder and returns zero rows to everyone else, which is not a count-never-name read (ADR-0033 R5/F-4).
- **Concurrency 50–53:** assign vs `remove_member` on one member (both orders) · two coordinators re-categorising one document · unassign racing a coordinator's keep (both orders) · a freeze committing mid-assignment.

**Migrations 69 → 73. pgTAP 65 → 69 files. Concurrency 49 → 53 cases. Zero dependencies added.** `PROMPT_VERSION` does not move.

### Evidence, at ONE declared head — `4cc3aa0`

Clean-leg reset **exact 73** · pgTAP **1,761 across 69 files, PASS** · concurrency **81/81** (teed, zero NOT OK) · `db:verify --fail-on warning` **clean** · upgrade leg **69 → migration up → 73, then 1,761/1,761 + 81/81 on the upgraded database** · vitest **982 across 79 files** · lint · typecheck · production build **clean, zero resolution warnings** · gitleaks **505 commits, no leaks** · local browser gate **38 legs, NOT RUN at this head** — none of `app/ lib/ e2e/` moved; `supabase/` did, and Q-G puts that to the round rather than deciding it here.

Every commit after `4cc3aa0` is docs-only: `git diff --name-only 4cc3aa0..HEAD -- . ':(exclude)docs'` returns empty. vitest at the docs head (the coverage/owed/kickoff invariants): **79/79 files, 982/982** — the third attempt; the first hung after ~40 files and the second timed out one live-DB `beforeAll` at 10 s (the file alone: 10/10 in 2.24 s) — **two UNREPRODUCED TRANSIENTS, recorded in the packet, not claimed as diagnosed.**

### What is NOT claimed

No app surface, route or e2e leg (7B/7C) · the browser gate at this head (Q-G) · claim / self-assignment (Q-H) · a non-coordinator's view of others' levels (Q-C) · the second, machinery-written `audience_changed` entry per move is stated, not hidden (Q-D) · M5 is unspent.

### Coverage

`docs/coverage.md` gains `## 7` with twenty-one rows; the pgTAP halves of TSK-01, TSK-02, DOC-03, DOC-04 and **SHR-02 (pending since 1D)** are green with their app halves named as owed; everything app-shaped is `pending` tagged 7B/7C; RCP-02 and A11Y-09/10/11 do not move; LOG-03 opens never green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
