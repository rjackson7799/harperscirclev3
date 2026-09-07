**9A: the freeze guard.** One migration, four pgTAP files, and the documents.
Put to **round 32** at **Tier 1**.

⏸ **This PR merges nothing.** The owner is sole merge authority; no session
merges its own work; the merge is `--no-ff`. The review is its own fresh
session and its findings land **VERBATIM** before anything is argued.

---

## ⛔ THE BROWSER GATE IS UNRUN. IT DID NOT PASS.

Stated first so it cannot be missed. The 66-leg gate was **not run** at the
evidence head, and **nothing in this branch claims 9A's surfaces were
re-proven.**

This is an owner ruling, not an omission: slice-9 plan **Q10**, an amendment to
a ruled plan made on the record on 2026-09-06 and **before** this packet was
assembled. The gate moves into **9B's** run over the same nine files. The debt
is `docs/owed.md` **OW-32**, `OPEN`.

The one run there is — 2026-09-04, at `efc2164` — is **RED**: **66 legs, 62
passed · 4 unexpected · 0 flaky · 0 skipped**, three timeouts at 1.55× the 8C
durations and one timing assertion. It is **classified as host starvation on
four supports**, none of them a bare resource number, and it was **not re-run
and not re-diagnosed** by this round. Its record and all four traces are
preserved outside the repo. Detail is in the packet.

---

## What changed

| | |
|---|---|
| **Branch** | `slice/9-freeze-guard` from `origin/main` @ `1eab0e5`, re-verified unmoved by a fetch |
| **Evidence head** | **`efc2164`** — every commit above it is docs-only |
| **Tier** | **1** — a migration and a `SECURITY DEFINER` body |
| **Migrations** | **ONE.** M1, `20260904120001_claim_task_freeze_guard`. Bound **1 of ≤ 4**; M2 CLOSED UNCONSUMED, M3 and M4 untouched |
| **Dependencies** | **0 runtime, 0 dev.** `package.json` and the lockfile byte-identical to base |
| **`lib/ai/`** | byte-identical to base; `PROMPT_VERSION` does not move |

**`app/`, `components/`, `lib/`, `tests/`, `scripts/` and every root file are
byte-identical to BASE** — not merely unchanged since the evidence head. Only
`supabase/` and `docs/` moved. 9A edits no browser surface, which is also the
first support under the deferred gate.

**M1 — the guard.** A `create or replace` over `hc.claim_task` adding the
explicit `state in ('open','unresolved')` test against `public.freezes`, read
straight from the table and **placed ABOVE the level test** (`:138–140` against
`:155`). Below it, FRZ-13's `least(result, cap)` lets a non-objected-to
coordinator reach `view` — this function's admission floor — and the guard is
never asked. `20260903120001` is untouched.

**`002:21–22`** — the invariant, not the instance: a catalog-driven `pg_proc`
assertion that every `hc.*` definer reaching `hc.visible_at(` **and writing**
must test `public.freezes`, exempt set pinned by name. **Written RED on
`hc.claim_task` itself, before the guard existed.** It caught
`hc.log_artifact_read` on its first run — a function no finding had named.

**`070:41–45`** — the pair **with its control**: a carve-out coordinator refused
under an `unresolved` freeze, **her READ still resolving at exactly `view`**
(without which the first case passes for the wrong reason), and the lift. Plus
the two refusals 8A's header claimed and the file never built.

**`071`** — the `STP-03:` label moved onto the four cases that discriminate,
**evidenced by a probe rather than a passing test**, and a cascade trap
recorded in the file's own header.

---

## Evidence at `efc2164` — stated exactly

reset exact **77** migrations · pgTAP **71 files Σ 1,871 PASS** · concurrency
**83/83** · `db:verify` clean · lint / typecheck / production build clean ·
vitest **1,563 / 1,563** in **106** files · **browser gate UNRUN (above)** ·
**gitleaks not run locally and not claimed** (a CI step; no CI evidence is
claimed for anything here).

**Ledgers**, re-tallied with `tests/lint/process.test.ts`'s own parser and
never by eye:

```
COVERAGE rows: 289 {"green":259,"review":9,"pending":21}
OWED rows: 32 cap: 25 {"CLOSED":22,"RISK":1,"TAKEN":1,"PROMOTED":6,"OPEN":2}
```

Exactly one row moves: **FRZ-17 `pending` → `green`**, Slice cell `8 → 9` →
`9A`. `OW-27`, `OW-29`, `OW-30`, `OW-31` → **`CLOSED(efc2164)`**; **`OW-32`**
opens, taking the ledger **1 → 2 / 25**. `STP-03` does not move; `OW-28` /
`STP-04` are 9B's and are untouched.

---

## What to attack first

1. **The guard's PLACEMENT** above the level test — below it, `least(result,
   cap)` routes around it and the guard is dead code for the one caller it
   exists for.
2. **`002:21`'s exempt set**, where `hc.log_artifact_read` is pinned exempt
   **by ARGUMENT and not by threshold**: its only write is an audit append
   recording a PERMITTED read, and refusing it would make the read UNLOGGED.
   That is the softest joint in the increment.
3. **The `071` relabel**, whose evidence is a **probe**, and whose whole-file
   form misleads by cascade — the trap is now in the file's header.

## Six pointed questions, in ADR-0045

`docs/adr/0045-9a-freeze-guard-deltas.md`, **`proposed` / unstamped**, carries
Q-A…Q-F with the author's recommendation attached to each. **An unanswered
pointed question defaults to NOT PLANNED** (ADR-0006) and the 9B build does not
start.

Q-A the `log_artifact_read` exemption · **Q-B the invariant's reader clause is
UNDER-inclusive and that direction is nowhere argued** · Q-C the four task-write
definers now disagree about naming the freeze · Q-D marker vs re-leading
STP-03's citation · **Q-E `OW-32`'s acceptance says "the 66 legs at the 9B
head", but 9B adds legs, so that run cannot report 66** · Q-F FRZ-17 is green at
the pgTAP layer alone.

## Documents

- `docs/review/round-32-packet.md` — the packet, including the full *What is
  NOT claimed* list (12 items).
- `docs/adr/0045-9a-freeze-guard-deltas.md` — `proposed`, D1–D7 and Q-A…Q-F.
- `docs/review/round-32-kickoff.md` — the brief, committed first.

**Nothing is production-activated.** G4 and G7 block, G9 is OPEN, G3 is open,
G12-01 stays `pending` at `gate`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
