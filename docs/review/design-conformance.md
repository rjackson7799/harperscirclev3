# Design conformance — the §11.4-2 record (slice 3, D9)

The §11.4 item-2 check ("design-spec conformance: every token, component
and rule in design_spec §2–§6 traced into TSD §8, and §8 checked against
§7/§10") ran as a pre-pass in the slice-3 planning session and is made
durable here with implementation and test refs per row. Companion
records: `docs/adr/0016-slice3-design-system-deltas.md` (rulings and
dispositions) · TSD Amendment A8 (the annexed shell content and token
variants) · `docs/review/slice-3-plan.md` (the settled Q1–Q7 rulings).

Result: **conformant**, with the recorded substitutions and deviations
in §2 below — every one ruled (Q2/Q7) or named for the round-11 gate.

## 1 · The trace (design_spec → TSD §8 → implementation → tests)

| Spec item | design_spec | TSD | Implementation | Tests |
|---|---|---|---|---|
| Foundation/ink/signal palette, exact hexes | §2 | §8.1 | `app/globals.css` `:root` | `tests/design/tokens.test.ts` (exact set equality, names AND values) |
| Tinted panel (positive/saved) + chip fill; construction rule | §2 | §8.1 | `:root` `--positive-*`, `--chip-sage-bg`; `CategoryBadge` builds new tints via `color-mix` at 5% (the construction rule verbatim — no unpinned hex enters the tokens) | tokens pin · `tests/design/components.test.tsx` |
| Radii map 13/12/9/20 | §5 | §8.1 | `--r-card/-row/-control/-pill`, consumed by every exact-slot rule | tokens pin · components CSS pins |
| Q2 text-role variants | — (ruled) | A8 | `--muted-text/-sage-text/-amber-text/-terracotta-text/-terracotta-badge` | `tests/design/contrast.test.ts` (every permitted pair ≥ 4.5:1) |
| The four colour rules (one accent per card · never large fields · green vs terracotta · sand/cream never text, ink never fill) | §2 rules | §8.1 | review-enforced; `/styleguide` is the review surface (its header names them) | DS-08 (review row) |
| Type scale, all roles | §3 | §8.2 | element defaults (h1 34 · h2 22 · body 13.5) + the role classes (`.wordmark` `.section-headline` `.nav-item[-serif]` `.row-title` `.meta` `.micro-meta` `.section-label` `.eyebrow` `.badge`) | `tests/design/type-scale.test.ts` |
| Newsreader 500 default; 600 wordmark only; families | §3 | §8.2 | `app/layout.tsx` (next/font — recorded substitution) + serif rules | type-scale test (serif via `--font-serif`) |
| Never below 10px | §3 | §8.2 | every first-party `font-size` ≥ 10px | type-scale floor scan |
| Voice rules | §3 | §8.2 | screen copy (2B, byte-untouched in D8) | DS-08 (review row) |
| Shell metrics (sticky cream topbar 11×20 · nav 16×12/2px gap/1px right border · main ≤ 1240) | §4 | §8.3 | `.shell/.topbar/.left-nav/.shell-main`; `components/shell/Shell.tsx` | `tests/design/shell.test.tsx` |
| Top-bar content order · nav grouping · counts right-aligned · utility pinned | §4 | A8 | `TopBar.tsx` (slots render nothing until built) · `LeftNav.tsx` + `nav-manifest.ts` | shell test (order, aria-current, groups, count slot, serif flag) |
| Page pattern (34px title → ≤620px muted context) | §4 | §8.3 | `PageHeader.tsx` + `.page-header/.page-context` | shell test |
| Grids (browsing auto-fill minmax(324px,1fr)/14px · working main+rail/20px) | §4 | §8.3 | `.grid-browsing/.grid-working` | shell test |
| Responsive to measured width, no breakpoints | §4 | §8.3 (recorded substitution) | container queries on `.shell` (`container-type: inline-size`), the §8.3 900px boundary; the ONLY `@media` is reduced-motion | shell test (media-query scan) |
| Card (no shadow · clickable = cursor only · wash dividers) | §5 | §8.4 | `Card.tsx` + `.card/.card-clickable/.card-divider`; `box-shadow` unwritable | components test |
| Card with eyebrow (three lines, that order, no icon) | §5 | §8.4 | `CardWithEyebrow.tsx` | components test |
| Count badge · category badge · tag chip · removable chip | §5 | §8.4 | `CountBadge/CategoryBadge/TagChip/RemovableChip.tsx` + CSS; ×-dismiss 14px glyph with ≥44px padded hit area | components test · touch-targets test · e2e audit |
| Buttons (primary/secondary/quiet) | §5 | §8.4 | seed classes + `Button.tsx` (the single writer on `<button>` in `app/`) | components test · migration test |
| Input (white fill, line border, faint placeholder; composed-control borderless) | §5 | §8.4 | global input rules + `Input.tsx`/`Field.tsx` (nested-label association structural) + `.composed-control` | components test · a11y-fence carve-out fixture |
| Avatar (accent fill · cream ring · −8px stack · one accent per person/subject) | §5 | §8.4 | `Avatar.tsx`/`AvatarStack` + `lib/design/accents.ts` (FNV-1a id hash, stable under roster change; plum reserved seq-1; green excluded) | components test |
| Icons (24×24 · fill none · stroke 1.6 currentColor · round caps · 13–16px) | §5 | §8.4 | `components/icons/Icon.tsx` — the conventions base; product glyphs land with their surfaces | components test |
| Legend (7px dot + 11px muted label, hairline above; every colour-coded view) | §5 | §8.4 | `Legend.tsx` + CSS | components test |
| The seven animations exactly; ≤250ms/ease bounds; one pulse per screen | §6 | §8.5 | `@keyframes mfade/tin/hp/hpo/hpg/rdot/eqp/bdrop/kb` + utility classes; `components/motion/PulseProvider.tsx` (throws dev / logs once prod / unregisters) | `tests/design/motion.test.ts` · `tests/design/pulse-provider.test.tsx` |
| Reduced motion: ONE query, opacity-only, iteration-count included | §8/§10.1 | §8.7 | the single `@media (prefers-reduced-motion)` block | motion test · e2e reduced-motion emulation |
| Provenance visible (N2's interface half) | §7 | §8.6 | `ProvenanceLine.tsx` (consumed from slice 5 on) | data-display test |
| Counts plain; NO charts/progress/percentages | §7 | §8.6 | nothing to import — structurally absent | data-display AC-PPL-6 scan |
| Dates human; the three §2.7 temporal kinds | §7 | §8.6/§2.7 | `lib/format/dates.ts` (due date refuses timestamps; appointment renders intended local + zone; floating says so; relatives in the viewer's zone) + `CalendarNumeral.tsx` | data-display test |
| Empty states: one sentence, no illustration, no CTA | §7 | §8.6 | `EmptyState.tsx` (colour deviation recorded — §2.3 below) | data-display test · migration test |
| Focus ring 2px green; bare outline:none unwritable | §8 | §8.7 | seed's `:focus-visible` ring; scanner | `tests/lint/no-bare-outline.test.ts` · e2e keyboard ring assertion |
| 44px touch targets incl. × glyphs | §8 | §8.7 | min-heights across control classes; chip-dismiss padded | touch-targets test · e2e audit at 390px |
| Icon-only-control labels via jsx-a11y | §8 | §8.7 | `hc/a11y` ESLint block (recommended at error + control-has-associated-label with the form-field carve-out) | `tests/lint/a11y-fence.test.ts` |
| Contrast floor & the faint/label redundancy exemption | §8 | §8.7 | Q2 variants; the named `CONTRAST_EXEMPT` list in the browser leg | contrast test · e2e axe (contrast ON) |
| axe + checks from the first component | §8 | §8.7 | jsdom axe over every styleguide composition (CI) + per-route browser axe (local gate) | `tests/design/axe.test.tsx` · `e2e/a11y.spec.ts` |
| Phone-primary 390px | — | §8.8 | container-query stacking; audited | e2e 390px pass + no-horizontal-scroll |
| No dark mode · photography placeholder · parent view out of scope | §10 | §8.8 | no `prefers-color-scheme` anywhere; `kb` exists unused; nothing inherited | (absence — reviewable by grep) |

## 2 · Recorded substitutions and deviations

1. **`next/font` self-hosting** for §8.2's Google-Fonts link — ruled
   (Q7), ADR-0016 D2.
2. **Container queries** for the prototype's measured-width style holes
   — recorded inside TSD §8.3 itself; boundary 900px is §8.3's own.
3. **EmptyState colour**: `--muted-text`, not §8.6's faint — ADR-0016
   D6.2 (the sentence is the only content; the redundancy exemption
   cannot cover it; faint on card measures **2.96:1** — corrected from
   the recorded ≈ 3.3:1 by round-11 EQ-3, direction-safe — and reds the
   browser axe leg).
4. **10px floor resolutions**: category badge and calendar month land at
   10px, not §8's 9.5px — ADR-0016 D6.1.
5. **44px made true**: secondary/quiet buttons and inputs gain
   min-height 44px — the spec's own claim, which the measured seed
   values did not satisfy — ADR-0016 D6.3.
6. **Q2 candidate adjustments**: `--muted-text` and `--sage-text`
   darkened one step by the red test's own pin — ADR-0016 D1.

## 3 · Unpinned by the spec — chosen in build, flagged for prototype re-measure

| Value | Chosen | Where |
|---|---|---|
| Left-nav width | 220px | `.left-nav` |
| Top-bar item gap | 14px | `.topbar` |
| Main content padding | 22px 20px | `.shell-main` |
| Working-grid ratio | `minmax(0,2fr) minmax(0,1fr)` | `.grid-working` |
| tin / rdot / eqp / bdrop / kb durations | .25s / 1.2s / .9s / .2s / 18s | motion block |
| Meta size (range 11.5–12) | 12px | `.meta` |
| Micro-meta size (range 10.5–11) | 11px | `.micro-meta` |
| Card padding (range 16–18) | 17px | `.card` |
| Avatar size (range 27–29) | 28px | `.avatar` |
| Nav active-state fill | `--wash` + `--green` text | `.nav-link[aria-current]` |
| Top-bar logo mark | wordmark only, mark pending its measured asset | `TopBar.tsx` |
| Input border-radius (range 9–10) | 10px | the shared input rule |
| Input padding (range 8–9 × 12–13) | 9px 13px | the shared input rule |
| Provenance size (range 11–12) | 11.5px | `.provenance` |
| Card-divider padding above (range 6–12) | 9px | `.card-divider` |
| Nav-link radius (range 9–10) | `--r-control` (9px) | `.nav-link` |
| **Carried seed, off-scale (re-measure):** `.auth-card h1` | 26px — matches no §8.2 role (page title 34, card headline 22); present at `fe2aed6`, rightly untouched by D8 | `.auth-card h1` |
| **Carried seed, off-scale (re-measure):** `.setup-card h1` | 28px — same class of carry as above | `.setup-card h1` |

(The five range picks and two carried off-scale headline rows were
added by the round-11 EQ-4 disposition — same entry class as the rows
above them, omitted by the original ledger.)

## 4 · G12 watch items (named, never silently green)

- **1.4.11 input boundary** (`--line` on white ≈ 1.32:1 at rest) —
  Q2(c2) ruling; darker-border fallback preserved. ADR-0016 D1.
- **The `CONTRAST_EXEMPT` list** (`.step-indicator`, `.section-label`,
  `.micro-meta`) — each use re-audited against §8.7's redundancy rule.
  The live footprint at this head (round-11 EQ-5 disposition):
  `.step-indicator` renders on setup steps 1–4 via
  `lib/setup/steps.tsx` (`--label` on `--card`, **2.29:1** at 10.5px
  uppercase — and it is the SOLE carrier of step position, so the
  redundancy claim is not met by this use; remedy is owner question O1,
  ADR-0016 round-11 addendum); `.section-label` on the nav group labels
  and the dev-only styleguide headings; `.micro-meta` has no live
  render yet (TopBar's role chip is its only writer and the layout
  passes `{ name }` only).
- **Avatar initials** (white on the four assignable fills 3.12 amber ·
  3.60 sage · 4.16 terracotta · 4.63 plum — corrected by round-11 EQ-3;
  only plum clears AA, barely; aria-hidden with the name as accessible
  name) — ADR-0016 D6.5.
- **Nav tier-awareness** (Invite visible to non-coordinators until
  membership context reaches the layout) — ADR-0016 D6.6.
- A11Y-07 (review-screen keyboard, slice 6) and A11Y-08 (OCR
  labelling, slice 5/6) ship with their surfaces on this slice's
  primitives.

## 5 · Review-enforced standing properties (DS-08)

Checked at every review gate, unenforceable by tokens alone: the four
§8.1 colour rules · §8.2 voice (second person; the parent by name,
never "the patient"; sentence case; the `·` separator; state what
happened; never alarm) · §8.6's plain counts, human dates,
one-sentence empty states · colour never the only carrier of meaning
(legend/badge/eyebrow words). The dev-gated `/styleguide` is the
standing review surface.
