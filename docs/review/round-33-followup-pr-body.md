# Correct Home read failures, local-day selection and browser fixtures [DO NOT MERGE without owner sign-off]

Home could show an empty success message when reads failed, and date-only items could disappear from upcoming activity at noon UTC. The follow-up preserves operational failures as retry states, limits onboarding to known coordinators, and classifies dates by their recorded/subject local day. Floating or unrecognized-zone values remain available in the record without claiming a known past/future placement. No RLS, schema, auth-state or dependency changes.

The Home accessibility test now owns its synthetic circle instead of reusing data populated by earlier tests. Completion-to-Home navigation is asserted in the existing walkthrough. Both browser changes remain unrun.

Validation: 1,620/1,620 application tests at `ba61b99`; after the final zone guard, 85/85 affected tests at `845eb0b`. Whole-tree lint passed before that guard, changed-file lint afterward. Standard production build and TypeScript pass at the final product head. Build retains the tracing warning in unchanged OCR code; locked packages also report Node engine warnings. The full suite was not repeated after the final guard.

Review findings: `docs/review/round-33-findings.md`. Delegated decisions: ADR-0048. Dispositions retain three OWED evidence closures under OW-34; OW-35 records the existing inbox-leg gap. HOME-05 is pending until fresh latency evidence; staging/browser and production gates remain unchanged. This is a locally prepared PR body: the branch has not been pushed and no follow-up PR has been opened.

Next work: OW-34 staging verification and performance measurement. Completed-founder auth routing remains a separately planned increment. Owner sign-off remains required for merge; no deployment is authorized by this body.
