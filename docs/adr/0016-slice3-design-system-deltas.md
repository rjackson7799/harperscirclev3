# ADR-0016 — Slice 3 design system: the Q1–Q7 rulings applied, and the build-found dispositions

**Status:** Built on `slice/3-design-system` (D1–D9, zero DDL) — ⏸ at
the review gate awaiting round 11; owner ratifies at the gate
(ADR-0006). The plan-gate rulings Q1–Q7 are recorded verbatim in
`docs/review/slice-3-plan.md` (SETTLED 2026-08-18); this ADR records
how they landed and every disposition the build itself surfaced.
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
   card measures ≈ 3.3:1, which the browser axe leg (contrast on) would
   red on every empty route. The quiet register survives at 12.5px; the
   deviation is pinned in `tests/design/data-display.test.tsx`.
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
5. **Avatar initials are a G12 watch item.** White initials on accent
   fills measure ≈ 3.0–5.2:1. The full name is the avatar's accessible
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
