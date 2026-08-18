# ADR-0011 — Forwarding-address local part: `<firstname>.<token>`

**Status:** Accepted (owner ruling, slice-2 kickoff, 2026-08-17)
**Date:** 2026-08-17
**Settles:** TSD §11.3 row 5 (decide before slice 2); confirms §5.1's proposal
**Touches:** onboarding completion-screen copy (PRD §4.1.3), Home (PRD §4.7.1),
`subjects.forwarding_local_part`

## Context

TSD §5.1 flags the one decision the PRD does not make: the mock shows
`nell@harperscircle.app`, but first names are not globally unique and collide
within the first dozen families. §5.1 proposes `<firstname>.<6-char token>` —
`nell.a7f3k2@harperscircle.app` — and §11.3 requires the ruling before slice 2
because the address appears in the completion-screen copy this slice builds.
The alternatives on the table: a per-circle subdomain
(`nell@harper-a7f3.harperscircle.app`) or bare first names with a collision
policy.

## Decision

**The local part is `<firstname>.<6-char token>`**, exactly as §5.1 proposes.
One column (`subjects.forwarding_local_part`), no subdomain machinery, no
collision policy.

## Why

1. **Still readable aloud and recognisably the subject's** — what the
   completion screen and Home need (PRD §4.1.3, §4.7.1).
2. **Unguessable**, which materially reduces drive-by spam at an address that
   is otherwise a published attack surface (PRD §4.2.8).
3. **Cheapest of the three.** The subdomain variant is harder to type and no
   shorter; bare first names need a collision policy that would surface as
   product behaviour ("why is my mother nell2?").

The cost — longer than the mock — is visual only; the completion screen and
Home already render the address with a copy control.

## Consequences

- Slice 2B's completion screen and Account copy render
  `<firstname>.<token>@harperscircle.app` per subject, with the copy control,
  and the inactive-until-verified state per §5.1's lifecycle table.
- Token allocation semantics (6 chars, charset, uniqueness) are ingestion-
  slice work (§5.1 provisioning is slice 4); nothing in slice 2 mints
  addresses — slice 2 only renders what `subjects.forwarding_local_part`
  will carry and states the inactive lifecycle.
- No TSD text moves: §5.1 already carries this as the primary design;
  §11.3 row 5 is now settled by this ADR.
