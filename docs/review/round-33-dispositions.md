# Round 33 — post-merge dispositions

Authority: ADR-0048 records the owner's delegation verbatim and distinguishes the agent's decisions from owner-selected answers. Original findings at `06e82f4` are unchanged. PR #50 was already merged before this review; this follow-up does not backdate sign-off.

| Finding | Verdict | Applied artifact and test | Remaining acceptance |
|---|---|---|---|
| F-1 — failed reads become empty success | OWED | `db2bb76`: operational Supabase failures propagate to Home's retry state; known permission refusal retains its separate semantics. `tests/routes/home.test.ts` covers subjects, review count and arrivals, with positive empty-state and visible-content controls. | Code applied; person-facing closure is still owed under OW-34. Stage operational-failure and tier scenarios; no complete FIXED claim. |
| F-2 — date-only UTC cutoff | OWED | `c28eb42`: calendar-date eligibility uses recorded/subject zone; appointments use instants; floating values do not imply known past/future. `tests/hc/home-temporal.test.ts` executes the actual selection SQL against synthetic read-only PostgreSQL rows. Existing timeline tests additionally verify retained access to floating records. | Current latency and browser behavior remain OW-34. Historical p95 is not a benchmark of changed queries. |
| F-3 — populated day-one browser fixture | OWED | `271b06d`: A11Y-13 owns its synthetic account/circle, asserts initial zero arrivals and seeds only its own router state. The completion leg now clicks through to Home. | OW-34: execute alone, after earlier a11y legs, and in the complete staging gate. Written tests are not green evidence. |

Tally: **3 OWED, 0 FIXED**. This records outstanding proof, not an assertion that the product patches are absent. All three share OW-34's explicit current follow-up/staging acceptance unit. No new risk was accepted. This is an implementation checkpoint, not round closure or a claim that the burn-down quota has been satisfied.

## Pointed questions

Q-A through Q-F are decided in ADR-0048. Q-D's day-one card is coordinator-only, using the existing live membership read; no RLS or auth-state change. Q-B's durable completion signal remains a separate auth increment. Q-E's pre-existing below-cliff gap is OW-35 with a named acceptance condition. STP-04 remains pending. The actual review is post-merge.

## Coverage and ledger

HOME-05 is pending again because the new membership read and temporal predicates require a current benchmark. Its old measurements remain explicitly historical. No coverage row is promoted: 290 total, 259 green, 9 review, 22 pending.

Ledger after intake: 35 rows, OPEN 2 of 25, TAKEN 2, RISK 2, CLOSED 23, PROMOTED 6. OW-34 owns follow-up staging proof; OW-35 owns the pre-existing inbox test gap. G4/G7, G9/G3 and GATE-01 remain unchanged.
