# Build follow-up — Home, round 33

Use the slice procedure and ADR-0048's delegated decisions.

## STATE

- Branch `review/round33-handoff`; findings committed at `06e82f4`.
- Base main `de05145` includes merged PR #50. Its product tree equals `7de7dac`.
- Tier 2; migrations 0 of 0; new dependencies 0 of 0.
- Prior review: 25 original mocked Home tests and one positive control passed; two error-state expectations failed. No new DB/browser/build evidence.
- No coverage status is promoted by this kickoff. G4/G7 and the staging/browser exposure remain.

## TASK

1. F-1/Q-D: distinguish operational errors from empty reads and restrict the day-one display to known coordinators.
2. F-2: distinguish dates, zoned appointments and floating values when selecting past/upcoming rows.
3. F-3/Q-E: isolate the two-state browser fixture and assert completion-to-Home navigation.
4. Record exact fresh results, remaining evidence and dispositions; prepare a follow-up PR body.

## WHERE TO PUSH

- A timeout must not become an empty block; successful RLS zero rows must not become an error.
- Date-only eligibility must survive UTC noon and subject-local midnight on both sides of UTC.
- The Home browser case must not depend on preceding legs leaving their circle empty.

## GATE

STOP before merge or production activation. Routine corrections and evidence work are delegated; new DDL, permission-policy or auth-state changes are not.
