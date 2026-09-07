# ADR-0048 — Round 33 follow-up decisions under delegated authority

Status: authorized for implementation under the owner's delegation below; not merge or production authorization.

## Authority

Owner instruction, verbatim:

> also, i don't want to be interrupted too much.  Use your best judgement and past history of decisions to push forward with this development.  Only ask me for critical items that need my approval.  if we ae burning tokens too quickly or are reaching our limit, feel free to reduce to a lower model like Sol.

The decisions below are the implementing agent's exercise of that delegation, not statements that the owner individually selected each recommendation. The prior explicit request to implement the handoff plan remains in force. Review findings were committed first at `06e82f4`. Review, dispositions and corrections may continue in this task under this instruction; the normal fresh-session pauses are waived for this handoff. Owner-only merge and production gates remain.

## Decisions

| Item | Decision |
|---|---|
| F-1 | Correct operational read failures so Home offers a retry, never a false empty result. Successful empty RLS results stay empty. Preserve Q5's separate handling of a permission refusal when enumerating arrivals; all other returned errors are operational failures. |
| F-2 | Correct temporal eligibility without DDL. Date-only rows use their stored zone, falling back to the subject's zone when absent. Earlier local dates are past; today and later are upcoming. Zoned appointments use their instant. Floating rows remain visible in recent activity and the record but do not claim a known past/future instant. |
| F-3 | Give the Home browser leg an independent synthetic circle; no deletion of shared fixture data. |
| Q-A | No performance migration in this follow-up. Preserve residual measurements and remeasure before a separately planned optimization. |
| Q-B | Defer completed-founder resume routing to a separate auth increment with a durable completion signal; no auth-state change here. |
| Q-C | STP-04 remains pending until its browser half is earned. |
| Q-D | Amend slice-9 Q5 for display only: the day-one card is coordinator-only. Other tiers use their visible router. No privileged existence probe or permission-policy change. Unknown membership does not qualify. |
| Q-E | Include a completion-to-Home browser assertion with F-3. Keep the pre-existing below-cliff gap separately visible with a named acceptance condition; do not silently rewrite historical findings. |
| Q-F | Record the actual sequence: PR #50 merged, then independent review, then these delegated decisions. No retroactive review/sign-off claim. |

## Bounds and evidence

Follow-up remains Tier 2, matching 9B: read-query and route corrections, no policy/auth-state change. Migration bound **0**; runtime and development dependency bounds **0**. No Tier-1 work is authorized by this record; escalate any discovered need for it before writing it. The browser repairs accompany the Tier-2 surface fixes, not an unrelated Tier-3 increment.

Regression expectations precede fixes and their failure signatures are committed. Existing app tests plus targeted DB temporal cases, lint/typecheck/build are required where the host can safely produce them. Browser evidence belongs to staging under ADR-0046 D7; written legs never count as run. F-1/F-2/F-3 remain evidence-pending until their applicable proof is earned; no new risk acceptance is inferred. All production gates remain unchanged.

Read-side clarification during verification: existing zone columns permit arbitrary text. Missing recorded zone still falls back to the subject zone; an unrecognized non-null zone leaves placement unknown. Matching against PostgreSQL's known zone names prevents an exception without guessing a replacement or changing the write boundary.
