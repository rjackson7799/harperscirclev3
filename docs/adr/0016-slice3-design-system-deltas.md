# ADR-0016 — Slice 3 design system: the Q1–Q7 rulings applied, and the build-found dispositions

**Status:** **Accepted with owner sign-off (2026-08-18)** — the
round-11 dispositions and the Q11-1–7 answers ratified and O1 ruled
**(b)** in the sign-off session (rulings S1–S3, recorded verbatim in
the sign-off addendum below); merge to main authorized in-session
(ADR-0006, merge commit never squash). The plan-gate rulings Q1–Q7 are
recorded verbatim in `docs/review/slice-3-plan.md` (SETTLED
2026-08-18); this ADR records how they landed and every disposition
the build and the round-11 review surfaced.
**Deciders:** build (owner ratifies at the gate)
**Context:** TSD §11.1 row 3 — the design system lands before the
surfaces. ZERO DDL (the ADR-0015 R8 batch carries forward untouched);
zero new runtime dependencies; dev-dependencies bounded to the
enumerated a11y tooling. The §11.4-2 conformance pre-pass ran at
planning; its durable record is `docs/review/design-conformance.md`.

---

## D1 — The Q2(a) contrast ruling, applied and pinned

The §11.4-2 pre-pass measured the §8.7-as-written text pairs below AA
4.5:1 (WCAG relative-luminance arithmetic; red run at commit `fbb3093`):

| Pair as §8 wrote it | Measured | Where |
|---|---|---|
| `--muted` on `--card` | 3.89:1 | meta, secondary copy |
| `--muted` on `--sand` | 3.24:1 | page-pattern context line |
| `--muted` on `--white` | 4.03:1 | quiet button |
| white on `--terracotta` | 4.16:1 | count badge |
| `--terracotta` on `--sand` | 3.35:1 | link hover |
| `--sage` on `--card` / `--chip-sage-bg` | 3.48 / 3.01:1 | tag chip |
| `--amber` on `--card` | 3.01:1 | due dates |

**Ruling applied:** minimal-delta text-role variants carry the words;
the measured palette keeps strokes, small fills, dots and tints. Landed
values (`app/globals.css` `:root`, pinned by `tests/design/tokens.test.ts`
and held ≥ 4.5:1 on every permitted surface by
`tests/design/contrast.test.ts`):

| Token | Value | Note |
|---|---|---|
| `--muted-text` | `#6C665A` | **darkened one step from the candidate `#6F695C`**, which measured 4.39:1 on `--sand` — the §8.3 context-line surface. The ruling's own mechanism ("exact hexes pinned by D1's red test") operating |
| `--sage-text` | `#526F5C` | **darkened from candidate `#5A7A62`**, which measured 4.00:1 on `--chip-sage-bg` — the chip's own fill |
| `--amber-text` | `#8A671F` | as ruled (5.03 card) |
| `--terracotta-text` | `#A04E2D` | as ruled (4.67 sand · 5.61 card) |
| `--terracotta-badge` | `#AD5330` | the ruled ≈ resolved exactly (white on it 5.18) |

**Q2(c2), the input boundary:** `--line` on white measures ≈ 1.32:1
against WCAG 1.4.11's 3:1 for the at-rest input border. Per the ruling
the at-rest aesthetic stays (label + placeholder + the compliant 2px
`--green` focus ring carry identification). **This is a named G12 audit
item**; the fallback — darkening the at-rest border toward
`--line-strong` or beyond — is preserved and costs one token flip.

## D2 — The font-loading substitution, ratified (Q7)

§8.2 specifies preconnect + Google Fonts link tags. The build keeps 2B's
`next/font` self-hosting (`app/layout.tsx`): the same two families at
the same weights/styles (Newsreader 400/500/600 + italics, Hanken
Grotesk 400/500/600/700, `display=swap`), served from the app's own
origin at build time. Zero third-party requests at page load, no CLS,
no `fonts.googleapis.com` in the serving path. The spec's intent (the
faces) is preserved; its mechanism is not.

## D3 — The §8.3 annex (Q7) and the §1.7 tree addition (Q5)

The top-bar content order and left-nav grouping lived only in
design_spec §4; TSD §8.3 did not restate them. **TSD Amendment A8**
(this slice, docs-only) carries them into §8.3, and adds the one-line
§1.7 tree entry: `components/{shell,ui,icons,motion}/` at the repo root
— presentation components; `lib/` stays logic-only. Implementation:
`components/shell/{TopBar,LeftNav,Shell,PageHeader}.tsx` +
`nav-manifest.ts` (live routes only — groups appear as slices land),
mounted by `app/(app)/[circle]/layout.tsx`.

## D4 — The reduced-motion completion (Q7 erratum)

TSD §8.7's own snippet already includes
`animation-iteration-count: 1 !important`; the 2B seed's block did not —
an infinite pulse would have spun hot at .01ms. D5 completed the ONE
query with iteration-count (pinned by `tests/design/motion.test.ts`,
including the there-is-exactly-one-query scan). Recorded as an erratum
against the seed, not the TSD.

## D5 — The Q3 CI/local split, recorded

"CI checks from the first component" (§8.7) meets "browsers stay out of
CI" (ADR-0014/R6) as ruled: **CI** carries the lint floor
(`hc/a11y` at error + the fence tests), the contrast arithmetic, the
token/motion pins, and jsdom axe over every styleguide composition
(color-contrast off — jsdom has no layout; D1's math owns it). **The R6
local gate** carries browser truth: `e2e/a11y.spec.ts` — per-route axe
at WCAG 2.2 AA with contrast ON, the 390px pass, the ≥44px touch audit
including × glyphs, reduced-motion emulation, keyboard traversal —
protocol-documented in `docs/ops/e2e-local-gate.md`. R6's re-visit
clause stands as the surface grows.

## D6 — Dispositions the build surfaced (each needs the gate's eyes)

1. **The §8.2 floor resolves two §8-internal 9.5px values to 10px.**
   The category badge (`700 9.5px`) and the calendar-numeral month
   (`9.5px uppercase`) sit below §8.2's "never below 10px". The floor
   wins; both land at 10px (inside the badge role's 9.5–10.5 range).
2. **EmptyState renders `--muted-text`, not §8.6's faint.** An
   empty-state sentence is the ONLY content on screen, so §8.7's
   redundancy exemption for `--faint` cannot cover it — and faint on
   card measures **2.96:1** (corrected from the recorded ≈ 3.3:1 by
   round-11 EQ-3 — direction-safe: the true number is worse, so this
   ruling is strengthened), which the browser axe leg (contrast on)
   would red on every empty route. The quiet register survives at
   12.5px; the deviation is pinned in `tests/design/data-display.test.tsx`.
3. **The 44px touch floor made true.** design_spec §8 claims the
   prototype's buttons clear 44px; the seed's secondary/quiet pills and
   inputs measured ≈ 29–40px. `min-height: 44px` landed on
   `.button-secondary`, `.button-quiet` and the shared input rule
   (`tests/design/touch-targets.test.ts`); the browser audit measures
   real boxes at 390px. Inline text links stay exempt (WCAG 2.5.8's
   inline exception).
4. **The `--faint`/`--label` exemption is an explicit exclusion list.**
   The browser axe scan excludes exactly `.step-indicator`,
   `.section-label`, `.micro-meta` (the roles §8.7 reserves for
   redundant text). G12 re-audits each concrete use against the
   redundancy claim — the step indicator's is the softest and is
   flagged in design-conformance.
5. **Avatar initials are a G12 watch item.** White initials on the four
   assignable fills measure **3.12 (amber) · 3.60 (sage) · 4.16
   (terracotta) · 4.63 (plum)** — corrected from the recorded
   ≈ 3.0–5.2:1 by round-11 EQ-3; the old 5.2 endpoint was white on
   `--terracotta-badge` (5.18), a badge fill, not an avatar fill. Only
   plum clears AA, barely. The full name is the avatar's accessible
   name and the initial is `aria-hidden` (axe therefore does not flag
   it); whether the visible initial needs more is G12's call. No avatar
   renders on a shipped route this slice.
6. **Nav tier-awareness is deferred.** The left nav lists live routes
   for every member (Invite included); a non-coordinator reaching the
   invite screen gets the existing refusal surface. Tier-aware nav
   needs membership context in the layout — it lands with the first
   surface slice that reads membership there (5+).
7. **Values the spec leaves unpinned, chosen and named** for prototype
   re-measure — the full list with values lives in
   `docs/review/design-conformance.md` §"Unpinned values" (nav width
   220 · top-bar gap 14 · main padding 22×20 · working-grid 2fr/1fr ·
   tin/rdot/eqp/bdrop/kb durations · meta 12 of 11.5–12 · micro 11 of
   10.5–11 · card padding 17 of 16–18 · avatar 28 of 27–29 · the
   top-bar logo mark pending its measured asset).
8. **The dependency ledger.** Runtime: ZERO added. Dev (all exact):
   `eslint-plugin-jsx-a11y@6.10.2` (was transitive; explicit per plan),
   `jsdom@30.0.1` (the DOM runtime Q3's ruled "jsdom axe" CI leg names;
   also the pulse-provider contract's mount/unmount truth),
   `axe-core@4.13.0`, `@axe-core/playwright@4.13.0`. The enumerated
   "vitest adapter" slot went UNUSED — `vitest-axe` is a stale 0.1.0
   wrapper and axe-core is driven directly — so the bound is consumed
   under its ceiling and **the review-disposition reserve slot is
   intact**.
9. **The single-writer pins.** `box-shadow` and bare `outline: none`
   are unwritable in first-party styles (scanned); `<Button>` is the
   single writer of button classes on `<button>` in `app/`
   (`tests/design/migration.test.tsx`); no chart/progress/percentage
   primitive exists to import (AC-PPL-6, scanned).

---

**Verification at the increment head:** the completion recipe's full
re-proof — recorded in the round-11 packet (`docs/review/`): lint ·
typecheck · production build · the app suites with exact counts · the
walkthrough 11/11 unchanged + the a11y leg under the local-gate
protocol · DB legs riding CI with `supabase/` tree hash unchanged all
slice.

---

## Addendum — round-11 dispositions (2026-08-18, the dispositions session)

Round-11 verdict (`docs/review/round-11-findings.md`, committed
verbatim at `a44ba23`): **approve with findings — none blocking**; two
high findings (unsurfaced judgment calls, the packet's own standard),
three evidence-quality. Every disposition below was re-verified against
the tree in this session before answering — including re-deriving every
disputed number with a session-local independent WCAG implementation —
and the accepted fixes landed at **`ec808d7`** (`tests/` + `e2e/` only;
the F12 accounting closes this addendum). The one question the build
must not decide is batched for the owner at the end.

### High-1 — the §8.5 loop-scope reading: ACCEPTED; ruled here, and the easing pin is now per-animation

The reading, previously argued only in the motion test's comments, is
hereby the ADR's: **§8.5's "nothing longer than 250ms except the
deliberate infinite pulses" covers the six deliberate infinite loops** —
the three pulses (`hp`/`hpo`/`hpg`, 2.2s ease-out, the spec verbatim)
**plus the three ambient indicators** (`rdot` 1.2s · `eqp` 0.9s · `kb`
18s) — because the spec's own inventory demands it: an indicator loops
or it is not an indicator, and §8.5's own table calls `kb` "slow". The
rule as written contradicts its own inventory; the loop-scope reading
resolves the contradiction in the inventory's favour. Everything finite
stays ≤ 250ms — DS-05's "finite ≤250ms" is this reading, now named
review-facing. The secondary finding is fixed, not just conceded: the
easing pin no longer admits ease-out/linear for ANY animation —
`ec808d7` pins easing **per animation** (entrances/ambient `ease` ·
pulses `ease-out` · `kb` `linear`), bite-verified by mutation (`bdrop`
ease→ease-out, which the old pin admitted, reds with "bdrop easing is
its own spec: expected 'ease-out' to be 'ease'").

### High-2 — link-as-button: ACCEPTED; the call is ADR-named and the audit now measures it

The judgment call, surfaced from its test comment
(`tests/design/migration.test.tsx:15`) into the record: **action links
styled as buttons stay `<a>`, deliberately — there is no LinkButton in
the component set.** All five current sites navigate
(`invite/created` → invite · `accept/[token]` → sign-in and
create-account · setup step 4 → complete · complete → invite); an
element that navigates is an anchor, and a wrapper component would
spend a component for zero semantic gain. `<Button>` stays the single
writer of button classes **on `<button>`** (D6.9's qualifier,
unchanged). The audit gap is closed at `ec808d7`: the e2e touch audit
now measures `a[class*="button-"]` (a button-styled standalone CTA
never qualifies for WCAG 2.5.8's inline exception) and
`label:has(input[type=radio|checkbox])` — the very target the radio
carve-out defers to — with two in-spec positive controls pinning live
subjects on audited routes (the choice labels at setup step 1; the
anchor CTA on `/setup/complete`). Honest reach note: the audited route
list touches two of the five anchors (setup step 4, complete);
`invite/created` and `accept/[token]` are not audited routes this
slice, so the sheet-level pin (`tests/design/touch-targets.test.ts` —
`min-height: 44px` on the CLASS, element-agnostic) remains the floor's
primary carrier everywhere; audit route-list growth rides R6's re-visit
clause as the surface grows.

### EQ-3 — the two recorded numbers: ACCEPTED; corrected in place from an independent recomputation

Both of the reviewer's numbers reproduced exactly under this session's
own WCAG implementation (not `lib/design/contrast.ts`): **faint on card
2.96:1** (direction-safe — D6.2's ruling is strengthened) and **avatar
initials 3.12 (amber) · 3.60 (sage) · 4.16 (terracotta) · 4.63
(plum)**; the recorded 5.2 endpoint was white on `--terracotta-badge`
(5.18) — a badge fill, not an avatar fill per `lib/design/accents.ts`.
D6.2 and D6.5 above and `design-conformance.md` §2/§4 now carry the
true values; G12 audits from them. Only plum clears AA, barely — the
corrected range makes D6.5's watch item sharper than the packet
implied, which is the point of correcting it.

### EQ-4 — the conformance §3 ledger: ACCEPTED; the seven missing rows added

The five same-class range picks (input radius 10 of 9–10 · input
padding 9×13 of 8–9 × 12–13 · provenance 11.5 of 11–12 · card-divider
9 of 6–12 · nav-link radius 9 of 9–10) and the two carried seed
off-scale headline sizes (`.auth-card h1` 26 · `.setup-card h1` 28 —
present at `fe2aed6`, matching no §8.2 role, rightly left alone by D8)
are now `design-conformance.md` §3 rows. Docs-only.

### EQ-5 — "zero consumers": REJECTED on the factual premise; the record improvement ACCEPTED

The finding's ground does not hold. **`.step-indicator` renders today,
on four live routes:** `lib/setup/steps.tsx:86` (`StepIndicator`) is
imported by every `app/setup/step/{1,2,3,4}/page.tsx`, identically at
`fe2aed6`, and the carried walkthrough ASSERTS its text on all four
steps (`e2e/onboarding.spec.ts:57/69/98/108`, "Step N of 4" — 11/11 in
every recorded gate run, including this session's). The reviewer's
grep covered `app/` and `components/`; the renderer lives in `lib/`.
The a11y leg itself audits those routes, so the exclusion guards live
markup, not dead. The micro-meta half is CONFIRMED as found:
`TopBar.tsx:34`'s role chip is the class's only markup writer and never
renders — the layout passes `{ name }` only. The accepted improvement —
say what the exemption excludes TODAY — is now conformance §4: the live
footprint is `.step-indicator` on setup steps 1–4 (`--label` on
`--card`, **2.29:1** at 10.5px uppercase), `.section-label` on the nav
group labels and the dev-only styleguide headings, `.micro-meta`
nothing yet.

### Q11-3 as amended — answered on the corrected premise; the remedy is the owner's (O1)

Both amended options dissolve with the premise: there is no dead class
to delete (deleting it un-styles four live screens and breaks the
walkthrough), and no "first consumer" to pre-rule — the consumer
shipped with the seed. What survives, sharpened: **the step indicator
is the SOLE carrier of step position** (the step headlines never
restate "N of 4"), so §8.7's redundancy condition — the exemption's own
ground — is **not met** by this use, and the live pair measures 2.29:1.
It is exactly the softest entry, as every record already said; the
remedy is a visual-register call on four screens the owner has
eyeballed, so it is O1 below, not decided here.

### For the record (the reviewer's Q11-1 note)

The system's tightest text pair is **`--muted-text` on `--sand` at
4.59:1** — 0.09 of headroom. Any warming of `--sand` reds D1's pin in
CI; that is the mechanism working as designed, but nobody should be
surprised when it does.

### O1 — the batched owner question (sign-off session)

**The step indicator's colour, given it renders live at 2.29:1 as the
sole carrier of step position:**

- **(a) Keep `--label` and the CONTRAST_EXEMPT entry; G12 re-audits
  against the live setup screens.** Zero cost now; carries a redundancy
  claim this addendum concedes is unmet into G12.
- **(b) Rule now: `.step-indicator` adopts `--muted-text` (5.51:1 on
  card) and the exclusion list shrinks to two.** One token flip in
  `app/globals.css` + one selector removed in `e2e/a11y.spec.ts`; F12
  cost: one full local-gate re-run (~4–5m, protocol known); visual
  cost: the eyebrow darkens on four screens the owner has eyeballed.

**Build-side recommendation: (b)** — the exemption's own condition is
not met, and a G12 deferral would inherit a claim already conceded —
but the register change is owner-visible, so it is not decided here.

### F12 accounting and the run record

`a44ba23` → `ec808d7` (this session's fix commit): `tests/` and `e2e/`
moved; `app/`, `lib/`, `supabase/` (hash still `53a8517…`), and config
untouched. Re-proof at `ec808d7`, per the binding rule:

- `db:reset` **46 exact** · `verify-migration-state` clean
- vitest **279/279 across 35 files** (live stack)
- lint clean · typecheck clean
- **local gate 16/16 in 4.5m** (`npx playwright test --trace on`,
  Chromium, win32, hermetic reset first): walkthrough **11/11
  unchanged** · a11y leg 5/5 with the widened audit and both positive
  controls green; traces in `test-results/`, retained vault-side with
  the run record.

Every commit after `ec808d7` this session is `docs/` only and inherits
this run.

---

## Addendum — owner sign-off (2026-08-18, the sign-off session)

CI confirmed green at the presented head FIRST (run 59, `32220853460`,
at `64cef28` — completed, success; public API, anonymous). The owner
ruled in-session (ADR-0006, sole authority); recorded verbatim:

| # | Question | Ruling |
|---|---|---|
| S1 | O1 — the step indicator's colour, given it renders live at 2.29:1 as the sole carrier of step position | **"(b) Adopt --muted-text now"** — `.step-indicator` adopts `--muted-text` (5.51:1 on card); CONTRAST_EXEMPT shrinks to `.section-label` + `.micro-meta` |
| S2 | Ratify the round-11 record: the five dispositions (High-1/High-2/EQ-3/EQ-4 accepted, EQ-5 rejected on its factual premise with the record improvement accepted) and the Q11-1–7 answers as dispositioned (Q11-1/2/4/5/7 accept · Q11-6 confirm · Q11-3 as answered on the corrected premise) | **"Ratify all as presented"** |
| S3 | Merge authorization — PR to main, MERGE COMMIT never squash (the PR #6 pattern), merged tree verified identical, CI green on main confirmed | **"Authorized — merge on green"** |

S1 landed at **`7670421`** (`app/globals.css` + `e2e/a11y.spec.ts`
only) and the full F12 re-proof ran at that head:

- `db:reset` **46 exact** · `verify-migration-state` clean
- vitest **279/279 across 35 files** (live stack)
- lint clean · typecheck clean
- **local gate 16/16 in 3.3m** (`npx playwright test --trace on`,
  Chromium, win32, hermetic reset first): walkthrough **11/11
  unchanged** · a11y leg 5/5 — the step indicator now contrast-scanned
  LIVE on all four setup screens (no longer exempt); traces in
  `test-results/`, retained vault-side
  (`04-evidence/gate-7670421-2026-08-18/`).
- `supabase/` tree hash still `53a8517…` at `7670421` — zero DDL all
  slice; the R8 batch untouched.

Consequences of S1: conformance §4's CONTRAST_EXEMPT watch item is
re-scoped (the list is two; the step indicator is scanned, not
exempt); D6.4's three-selector description and the round-11 addendum's
2.29:1 footprint stand as the historical record this ruling supersedes.
Every commit after `7670421` this session is `docs/` only and inherits
this run.
