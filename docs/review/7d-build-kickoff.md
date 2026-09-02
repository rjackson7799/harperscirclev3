# 7D · build kickoff — Tier 1, the product surfaces

**Entry:** ADR-0038 **D5** (RULED, owner sign-off 2026-08-31) names this
increment. Base `slice/7c-sensitive-pair` @ `2bdae46`, 7E closed, PR #34 held.
The charter, `docs/process/traps.md` and `docs/process/slice.md` bind and are
not restated here.

## Scope — 23 rows, re-derived by D7's own command

```
D=docs/review/round-27-dispositions.md
grep -E '^\| R[1-6]/F-[0-9]+ \| (MAJOR|MINOR|OBS) \|' $D \
  | awk -F'|' '{gsub(/ /,"",$5); print $5}' | sort | uniq -c   # 7D 23
```

R1/F-4 · R2/F-1..F-6 · R3/F-1..F-5, F-7, F-8 · R4/F-1..F-7 · R5/F-1, F-2.
**22 distinct fixes** — R3/F-8 is NOTED, closed by R2/F-3's fix.

## Tier — 1, and it does not move

7C is Tier 1; a tier is never lowered mid-slice (charter). Every unit below is
T1, so the split rule is satisfied by the increment holding no T3 unit at all —
7E took those. **Fail closed:** nothing here is argued down.

## Units, red → green

| # | Rows | The unit |
|---|---|---|
| U1 | R5/F-2, R5/F-1 + OW-24 | the request path's two bounds: the proxy's unstamped early return; the ingress read raced inside the route budget on both upload routes |
| U2 | R3/F-7, R4/F-6 | `LEVEL_RANK` narrowed, pinned to `enum_range` order, and derived once |
| U3 | R3/F-4, R4/F-5 | null is not hidden: the type, the frozen sentence, both consumers |
| U4 | R3/F-2, R3/F-3 | the step-up round-trip composed with `URLSearchParams`; `rs` validated |
| U5 | R3/F-1 | `changed` is read; the no-op gets its own marker and copy |
| U6 | R2/F-3, R3/F-8 | one step-up cookie per operation; `share/submit` bounces to `?share=…&e=step-up` |
| U7 | R2/F-1 | the category offer filtered by the caller's manage; the audience read's own catch |
| U8 | R2/F-2 | the preview names the derived objects ADR-0034 D7 ruled it names |
| U9 | R2/F-4 | Unshare only where it is one action; the words that withdraw the rest |
| U10 | R2/F-6, R1/F-4 | the viewer's two silences said; the text path splits a storage fact from a refusal |
| U11 | R2/F-5 | the subject nav survives its own filter; "All" drops `subject` |
| U12 | R4/F-1, R4/F-2, R4/F-7 | the provenance link, the episode's subject and fragment, the two comments, and the scanner ADR-0026 requires |
| U13 | R4/F-3 | the log discloses its window (the cursor is OW-26, slice 8) |
| U14 | R4/F-4 | the printable record is reachable by clicking, and a leg that clicks |
| U15 | R3/F-5 | the invite: revoke-before-redirect pinned, the expiry gate, `?resend=1` |
| U16 | — (F-a) | the `e2e/a11y.spec.ts` per-file budget — see the ruling below |

## The one plan-gate call this session makes — F-a

`e2e/a11y.spec.ts` is marginal at the config's 120 s default on this host
(`docs/review/7e-leg-audit.md` F-a: one untouched leg measured 116 s / 25 s /
25 s; three others timed out at ~123 s in one run and passed in 10–51 s in the
next, every failure inside memoized provisioning).

**RULED: a per-file budget of 300 s, not `workers: 1`.** `workers: 1` is
already the config's global setting, so it is not an available lever — and it
would not help if it were: the memo is discarded because a *failure* restarts
the worker, which `workers: 1` does not prevent. 300 s is the number 7E's own
new leg in this same file already declares; the file gets ONE budget rather
than two. `documents.spec`'s 420 s is the precedent for the mechanism
(`test.describe.configure`), not for the number.

**F-b is NOT ruled here.** The invite → create-account provisioning hang is an
UNREPRODUCED TRANSIENT (traps §1) and is not claimed as diagnosed. The gate
runs every leg once at `retries=0`; if it recurs it is classified from the
retained trace, never re-run to green.

## Not in this increment

- **The three DDL items stay named and stopped** for the slice-8 plan gate
  (D6): `hc.shares_for` carrying the assignment task's live status; a
  level-bound step-up `target_ref`; share-includes-bytes. Migrations **NONE**
  (5 of ≤ 6), **M6 UNCONSUMED**, dependencies 0, `PROMPT_VERSION` unmoved.
- **OW-26** (the log's cursor) is OPEN, home slice 8 — only the disclosure
  half lands here.
- The 7E handover's residual items (a second custodian in the browser fixture;
  the printed-log control in A11Y-10; the DOC-03 leg retitle) are **NOT
  PLANNED** here: none is one of the 23 ruled rows.
- Coverage cells and OW-05's counter move at **close-out**, not per unit.

## The gate

ONE complete run at the FINAL head, unconditional (ADR-0033 D19.14), through
`scripts/preflight.mjs` — exit 5 once after a commit, acknowledged by
re-running. **The tally is read from `.gate/e2e-run.json`**, never from console
text or the status mark (traps §4). No CLI reporter override: that is what
discharges **OW-25**'s last clause.
