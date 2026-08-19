# Round 11 — third-party review findings (received 2026-08-18, verbatim)

> Reviewed: round-11 packet at head `1b0ec91` (evidence heads `e80aaef`
> and `0b371e1`; CI run 32212021485 / run 57 at the head, completed
> **success** — confirmed first, per the session brief).
> Verdict: **approve with findings — none blocking.** Two high findings
> (both unsurfaced judgment calls, the packet's own standard), three
> evidence-quality findings. No code defect found; every load-bearing
> claim I re-verified held.
> Dispositions: next session's ADR.

---

## What was independently verified (the ground the findings stand on)

- **CI at the head:** run 57 (`32212021485`) at `1b0ec91`, completed,
  success. Not finding #1.
- **Zero DDL:** `git rev-parse fe2aed6:supabase 1b0ec91:supabase` →
  `53a8517490f7f5348bca5ab9c1f42c9163b2919d` both. Hash-asserted claim
  reproduced.
- **The ledger:** `git log fe2aed6..1b0ec91` matches the packet's
  addendum commit-for-commit, 21 commits, no force-push artifacts; every
  red commit message carries concrete failure signatures (counts, the
  measured ratios, the module-not-found lists). Spot-read all eight red
  messages.
- **Token pin vs TSD §8.1 + A8:** every name and value in
  [tokens.test.ts](tests/design/tokens.test.ts) compared by hand against
  TSD §8.1's block and A8's five variants — exact, both directions
  (exact-set equality is asserted, so no extras can hide).
- **Contrast arithmetic:** recomputed all 20 permitted pairs with my own
  WCAG implementation (not `lib/design/contrast.ts`). All 20 hold;
  minimum is `--muted-text` on `--sand` at **4.59:1**. Every red-run
  number in the packet/ADR reproduced to the second decimal (3.89, 3.24,
  4.03, 4.16, 3.35, 3.48, 3.01, 3.01), both candidate failures
  reproduced (4.39 on sand, 4.00 on the chip fill), and the ADR's landed
  ratios reproduced (5.18, 5.03, 4.67, 5.61). Two recorded numbers did
  NOT reproduce — finding 3.
- **D8 route contracts:** `git diff fe2aed6..1b0ec91` over `app/api` and
  every `route.ts` → **empty**. `tests/` shows 14 new files, 1604
  insertions, **zero modifications** to carried files — "149 carried
  unamended" is structurally true, and the file count reconciles
  (21 carried + 12 design + 2 lint = 35). Zero raw `<button>` elements
  remain anywhere in `app/`.
- **The a11y lint floor:** [eslint.config.mjs:53-84](eslint.config.mjs#L53-L84)
  elevates every *enabled* recommended rule to error (off stays off,
  stated honestly in the comment) plus `control-has-associated-label` at
  error with the form-field carve-out.
  [a11y-fence.test.ts](tests/lint/a11y-fence.test.ts) drives it both
  ways through the ESLint API, asserts severity 2, pins the carve-out
  fixture, and proves the floor reaches `app/` paths, not only
  `components/`.
- **Untouched-claims:** `.github/workflows`, `e2e/onboarding.spec.ts`,
  `vitest.config.ts`, `playwright.config.ts` — all zero diff.
  `package.json` diff is exactly the four exact-pinned devDeps; runtime
  dependencies unchanged.
- **Structural scans re-run by hand:** the only first-party CSS file is
  `app/globals.css`; the only `@media` in it is reduced-motion (with
  `animation-iteration-count: 1 !important` present); `box-shadow` and
  bare `outline: none` appear nowhere in `app/`, `components/`, `lib/`.
  Container queries sit on the 900/899 boundary.
- **Coverage rows vs the tests:** A11Y-07, A11Y-08, G12-01 are
  **pending**, not green ([coverage.md:324-326](docs/coverage.md#L324-L326));
  every green row maps to a test file that actually asserts the row's
  claim (spot-verified DS-01/04/05/06, A11Y-01/02/04/05/06 against the
  test sources).
- **The e2e leg vs its description:** [e2e/a11y.spec.ts](e2e/a11y.spec.ts)
  is 5 tests; `CONTRAST_EXEMPT` is exactly the three named selectors;
  axe runs contrast-ON with the full 2.2-AA tag set; 390×844 viewport;
  the keyboard leg clicks the Mailpit confirmation link before the
  password sign-in (the `e80aaef` fix, exactly as the packet narrates);
  reduced-motion emulation has its positive control. The composed-control
  fixture carries the `0b371e1` fix (label outside the shell,
  `aria-labelledby`).

Recorded run evidence (279/279, 16/16 gate runs, traces) taken as
settled per the session brief; nothing above contradicts it.

---

## High findings (unsurfaced judgment calls — the packet's own standard)

### 1. The §8.5 duration bound was re-scoped from "infinite pulses" to "infinite loops," and the ruling lives only in a test comment

§8.5 (and design_spec §6): "Nothing longer than 250ms **except the
deliberate infinite pulses**." The build ships three non-pulse
animations over the bound — `rdot` 1.2s, `eqp` 0.9s, `kb` 18s — and the
enforcement encodes the wider reading:
[motion.test.ts:21](tests/design/motion.test.ts#L21) defines
`INFINITE = {hp, hpo, hpg, rdot, eqp, kb}` with the comment "the three
pulses **plus the ambient indicators**." The DS-05 coverage row says
"finite ≤250ms," which quietly presumes the same reading.

The reading is defensible — the spec's own table calls `kb` "slow" and
an indicator must loop, so the rule as written contradicts its own
inventory — but that is precisely a substantive spec-interpretation
call, and it appears in neither ADR-0016 nor the packet's
judgment-call list. The chosen durations are in the conformance §3
re-measure ledger, but the *rule-scope* decision is not argued anywhere
review-facing. Secondary, same file: the easing pin
([motion.test.ts:22](tests/design/motion.test.ts#L22)) admits `ease-out`
and `linear` for **any** animation, though ease-out is "the pulses' own
spec" — a future ease-out entrance animation would pass the pin. Today
only the pulses use ease-out and only `kb` uses linear, so nothing is
wrong in the tree; the pin is just looser than the prose that justifies
it.

**Disposition wanted:** an ADR-0016 addendum naming the loop-scope
reading (and, if desired, tightening the easing pin to
per-animation-class expectations). Docs-plus-test-comment change at
most; no sheet change needed.

### 2. Five action links render raw `button-primary` markup; the decision is surfaced only in a test comment, and the browser touch audit never measures them

The packet (D8) says "every raw `<button className="button-*">`
replaced by `<Button>`" — true as scoped, and ADR-0016 D6.9 carries the
qualifier "on `<button>`." But five anchors still write button classes
raw:
[created/page.tsx:30](app/(app)/[circle]/invite/created/page.tsx#L30) ·
[accept/[token]/page.tsx:94](app/(auth)/accept/[token]/page.tsx#L94) ·
[accept/[token]/page.tsx:105](app/(auth)/accept/[token]/page.tsx#L105) ·
[setup/complete/page.tsx:84](app/setup/complete/page.tsx#L84) ·
[setup/step/4/page.tsx:34](app/setup/step/4/page.tsx#L34). The decision
that link-as-button stays a raw `<a>` (no `LinkButton` in the
component set) is stated only in
[migration.test.tsx:15](tests/design/migration.test.tsx#L15) ("links
styled as buttons stay `<a>`, deliberately") — a test comment is
neither the packet nor the ADR, which is where the packet says
judgment calls live.

The consequence is real, if small: the e2e touch audit's selector list
([e2e/a11y.spec.ts:49-50](e2e/a11y.spec.ts#L49-L50)) is `button,
[role="button"], select, .nav-link, .chip-dismiss, input` — these five
button-styled standalone CTAs (which do NOT qualify for the WCAG 2.5.8
inline exception the inline-link exemption invokes) are never measured.
They clear 44px today because `.button-primary` sets `min-height: 44px`
regardless of element, so this is an audit-coverage gap, not a floor
violation. Same shape: the radio carve-out defers to the wrapping
`<label>` ([e2e/a11y.spec.ts:57](e2e/a11y.spec.ts#L57)) but labels are
not in the selector list, so the deferred-to target is also unmeasured
(covered in the sheet by `.choice-list label { min-height: 44px }`).

**Disposition wanted:** name the link-as-button call in the ADR, and
either add `a[class*="button-"]` (and the label case) to the audit
selector or record why the sheet-level pin suffices. No behavior
change.

---

## Evidence-quality findings

### 3. Two recorded contrast measurements do not reproduce

- **`--faint` on `--card`** computes **2.96:1**, not the "≈ 3.3:1"
  recorded in ADR-0016 D6.2, design-conformance §2.3, and the packet's
  Q11-2 framing. The error is direction-safe (2.96 is *worse*, so the
  EmptyState ruling is strengthened), but G12 will work from the
  recorded number.
- **Avatar initials** (ADR-0016 D6.5): white on the four assignable
  fills computes **3.12 (amber) · 3.60 (sage) · 4.16 (terracotta) ·
  4.63 (plum)** — a range of ≈ 3.1–4.6:1, not the recorded
  "≈ 3.0–5.2:1." The 5.2 endpoint is white on `--terracotta-badge`
  (5.18), which is a badge fill, not an avatar fill per
  [accents.ts:15-20](lib/design/accents.ts#L15-L20). The recorded range
  wrongly implies some avatar fill clears AA by a margin; in fact only
  plum does, barely.

Both are watch-item inputs to G12; the numbers should be corrected in
the dispositions ADR so the gate audits from true values.

### 4. The conformance §3 re-measure ledger is incomplete against its own class of entry

design-conformance §3 exists to name in-range picks and unpinned
choices for prototype re-measure. It names meta 12 (of 11.5–12), micro
11 (of 10.5–11), card padding 17 (of 16–18), avatar 28 (of 27–29) —
but omits picks of exactly the same class:

- input border-radius **10** of §8.4's 9–10, and input padding
  **9×13** of 8–9 × 12–13 ([globals.css:129-130](app/globals.css#L129-L130))
- provenance **11.5px** of §8.6's 11–12 ([globals.css:561](app/globals.css#L561))
- card-divider padding **9px** of §8.4's 6–12 ([globals.css:419-420](app/globals.css#L419-L420))
- nav-link radius `--r-control` (9) of §8.4's 9–10 for nav items

Also unflagged anywhere: the seed's `.auth-card h1` **26px** and
`.setup-card h1` **28px** overrides ([globals.css:595](app/globals.css#L595),
[globals.css:663](app/globals.css#L663)) match no §8.2 role (page title
is 34, card headline 22). They predate the slice (verified present at
`fe2aed6`) and D8 rightly left them alone, but a conformance record
that says "conformant" for §8.2 should name the two carried
off-scale headline sizes, if only as a re-measure row.

### 5. The Q11-3 debate concerns a selector with zero consumers

`.step-indicator` is defined in the sheet and named the "softest"
CONTRAST_EXEMPT entry in the packet, ADR-0016 D6.4, and
design-conformance §4 — but **no file in `app/` or `components/`
renders it**, and none did at `fe2aed6` either (seed class, never
consumed; verified by grep at both trees). The G12 watch item as
written implies a live use to re-audit. Likewise `.micro-meta`'s only
wiring is the TopBar role chip
([TopBar.tsx:34](components/shell/TopBar.tsx#L34)), which never renders
today because the layout passes `{ name }` only
([layout.tsx](app/(app)/[circle]/layout.tsx)) — so the exclusion list's
entire *live* footprint at this head is nav group labels and the
dev-only styleguide headings. Not wrong, but the review record should
say what the exemption actually excludes today. Q11-3's answer below
builds on this.

---

## The pointed questions, answered

**Q11-1 — the two Q2 candidate corrections: ACCEPT (ratify the landed
values).** Independently recomputed: the candidates fail exactly as
claimed (`#6F695C` → 4.39:1 on sand; `#5A7A62` → 4.00:1 on the chip
fill) and the landed values hold on every permitted surface. The Q2
ruling explicitly delegated exactness to the red test ("exact hexes
pinned by D1's red test"), so this is the mechanism operating, not a
deviation from it. One number for the record: the system's tightest
pair is now `--muted-text` on `--sand` at **4.59:1** — 0.09 of
headroom. That is fine (the pin reds any drift), but the dispositions
ADR should name it so nobody "warms up" sand by a step without
expecting CI to red.

**Q11-2 — EmptyState off faint: ACCEPT muted-text.** The recomputed
ratio makes the case stronger than the packet does: faint on card is
2.96:1, not 3.3 (finding 3). A scan carve-out for the only content on
screen would invert the scan's purpose, and the quiet register
survives at 12.5px. The deviation is correctly pinned in the test and
recorded in ADR/conformance. Correct the number while ratifying.

**Q11-3 — CONTRAST_EXEMPT scope: AMEND.** Keep `.section-label` and
`.micro-meta` under the exemption with the G12 re-audit — their live
uses today (nav group labels; a role chip that doesn't yet render) fit
§8.7's redundancy reservation. But do not carry a named G12 watch item
for `.step-indicator` as if it renders somewhere: it has no consumer
(finding 5). Recommended disposition: either delete the dead class and
its exclusion-list entry now (shrinking the list to two — the packet's
own alternative, at zero visual cost because nothing renders it), or
pre-rule that its first consumer lands on `--muted-text`. Deferring a
known-soft redundancy claim on markup that doesn't exist yet is
exactly the kind of item G12 should not inherit.

**Q11-4 — the 44px pill: ACCEPT real boxes.** A pseudo-element hit
extension would satisfy WCAG 2.5.8's letter while making the browser
audit's `getBoundingClientRect` measurement meaningless — the audit
would then measure something other than the target. The deepened
secondary pill is the spec's own floor applied to the spec's own false
claim about the prototype ("the prototype's buttons clear this" — the
seed measured ~29px, named in D7's red commit). The re-measure ledger
already flags the prototype revisit. Consistent with keeping D6.3's
inline-text-link exemption.

**Q11-5 — the working-grid ratio: ACCEPT as placeholder.**
`minmax(0, 2fr) minmax(0, 1fr)` is a reasonable reading of "main +
rail" (the spec pins only the 20px gap), it is flagged in conformance
§3, and the sheet collapses it to one column under 900px so there is
no phone-primary risk. The first working surface re-measures the
prototype; until then nothing consumes `.grid-working` in a shipped
route.

**Q11-6 — the unused adapter slot: CONFIRM.** The `package.json` diff
against `fe2aed6` is exactly the four devDeps, all exact-pinned;
runtime dependencies unchanged; `vitest-axe` absent from the tree;
axe-core is driven directly by
[axe.test.tsx](tests/design/axe.test.tsx). Skipping a stale 0.1.0
wrapper in favour of the underlying engine consumes the enumerated
bound under its ceiling, and the review-disposition reserve slot is
demonstrably intact.

**Q11-7 — nav tier-awareness deferral: ACCEPT.** The layout reads the
session only for the user chip; membership context is not in the
layout, so a tier-aware nav this slice would be invented state — the
worse failure mode. The guarded destination keeps its refusal contract
(the carried invite-screen tests, unamended and green). The deferral
is a named G12 watch item and correctly bound to "the first slice that
reads membership in the layout."

---

## Verdict

**Approve with findings.** The increment does what the packet says it
does, and the packet's evidence discipline held up under independent
recomputation everywhere except the two numbers in finding 3. Nothing
blocks: findings 1–2 want naming (ADR addendum + a selector-list
line), findings 3–5 want the record corrected. All are docs-or-test
scope; none touches the shipped surface. The two high findings exist
because the packet set the standard that a judgment call not surfaced
in the packet or ADR-0016 is itself a finding — held to that standard,
the motion-bound reading and the link-as-button call were surfaced
only in test comments.
