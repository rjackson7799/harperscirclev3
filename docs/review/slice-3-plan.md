# Slice 3 — Design system: the slice plan

**Status:** **SIGNED OFF — merge authorized, 2026-08-18.** Round-11
verdict: **approve with findings, none blocking**
(`docs/review/round-11-findings.md`, verbatim at `a44ba23`);
dispositions in ADR-0016's round-11 addendum (High-1/High-2/EQ-3/EQ-4
accepted at `ec808d7`; EQ-5 rejected on its factual premise with the
record improvement accepted). The owner ruled in the sign-off session
(ADR-0016's sign-off addendum, S1–S3 verbatim): **O1 = (b)** —
`.step-indicator` adopts `--muted-text`, CONTRAST_EXEMPT shrinks to
two (fix `7670421`, `app/` + `e2e/` only; F12 re-proof at that head:
gate **16/16 in 3.3m**, walkthrough 11/11 unchanged, a11y 5/5 with the
step indicator scanned live, vitest 279/279, lint/typecheck clean,
`db:reset` 46 exact, zero DDL still hash-asserted `53a8517…`); the
five dispositions and the Q11-1–7 answers **ratified as presented**;
**merge authorized** (ADR-0006, merge commit never squash). The owner
ruled Q1–Q7 at the plan gate (recorded verbatim below).

**Authority:** TSD §11.1 row 3 ("Tokens, components, motion, the §8.7
accessibility floor — before the surfaces, not after") → TSD §8 whole →
`design_spec.md` §2–§6 as the source of measured values (§7 and §10 as
constraints) → §11.4 item 2 (design-spec conformance, run in planning —
findings below) → §11.2 G12 (blocks the first invitee who is not the
founder; CI checks from the first component) → PRD §13.2 (p95 1.5 s),
§13.4 (phone primary, 390px), §13.5 (WCAG 2.2 AA), §3.3/AC-PPL-6 (no
charts) → binding ADRs 0006 (owner sole merge authority) / 0014 / 0015 →
`docs/coverage.md` row conventions.

**Branch:** `slice/3-design-system` (branched from main @ `8805a78` or
later) — red→green per unit, failure signatures in every red commit,
merge commit never squash.

**ZERO DDL — confirmed in planning.** Every unit below is app-layer
(CSS, components, lint, tests, docs). No unit needs a migration, so the
ADR-0015 R8 batched bound amendment **carries forward untouched** — it
remains the hard entry criterion (migration 1) of the next slice that
opens the DB, expected slice 4 (ingestion). If any review round of this
slice ever demands DDL, the R8 batch lands first and the bound needs the
owner's recorded approval BEFORE anything is written. APP-09b stays
pending; shipped migrations are never edited.

**Dependency bound (the migration-reserve analogue):** ZERO new runtime
dependencies — no Tailwind, no component library, no CSS-in-JS; the
system is hand-rolled on CSS custom properties, the seed's discipline.
Dev-dependencies bounded to the enumerated a11y tooling: `axe-core` +
its vitest adapter, `@axe-core/playwright`, `eslint-plugin-jsx-a11y`
(explicit — today it rides in transitively via eslint-config-next),
plus **one reserved slot** for review dispositions. Anything past that
is an owner-approved bound amendment.

**Skills gates (build sessions):** `frontend-design` before any
token/component authoring · `vercel:nextjs` (and the AGENTS.md
`node_modules/next/dist/docs/` guides) before any scaffold/layout work.
The HonuVault `patterns/` check for `#portable` design-token systems is
**done in planning: no such entry exists** (the vault's patterns are
DB/process ones) — nothing to reuse; at slice completion the
token-pin + contrast-math CI harness (D1) is the promotion candidate
back into `patterns/` as `#portable`.

---

## What exists (do not rebuild) — verified against the tree

- **`app/globals.css` — the 2B seed** (deliberately minimal, no
  Tailwind; slice-2-plan §2B note). Verified present: all §8.1
  foundation + ink + signal color tokens except `--google-blue`; the
  positive tinted panel under **drifted names** (`--panel-positive-bg/
  -border/-body` vs §8.1's `--positive-bg/-border/-label/-body`;
  `--positive-label` missing entirely); `--chip-sage-bg` and the four
  radii tokens (`--r-card/-row/-control/-pill`) missing. Base resets,
  link colors, scrollbar styling, `text-wrap: pretty`, body type at
  13.5px — all §8.8-conformant. Semantic classes (`.auth-card`,
  `.setup-card`, `.button-primary/-secondary/-quiet`, `.notice`,
  `.field*`, `.choice-list`, `.step-indicator`, `.mono-address`) that
  every 2B screen renders through.
- **Two §8.7 rows already partially shipped in the seed:** the 2px
  `--green` `:focus-visible` ring (globals.css:116–123) and a
  `prefers-reduced-motion` block (globals.css:312–319) — **which is
  missing `animation-iteration-count: 1 !important`**, so an infinite
  pulse would spin hot at .01ms once §8.5's pulses exist. D5 fixes and
  pins it. Buttons and choice rows already carry `min-height: 44px`.
- **`app/layout.tsx`:** Newsreader + Hanken Grotesk via `next/font`
  (self-hosted at build; exposes `--font-serif`/`--font-sans`). This is
  an implementation substitution for §8.2's "preconnect + Google Fonts
  link" — kept deliberately (zero third-party requests at page load,
  no CLS) and ratified in Q7's ADR.
- **The 2B screens** (auth · setup 1–4 + completion · account · accept
  · wasnt-me · the (app) timeline/tasks/invite stubs): all render from
  the seed classes and tokens. **No `app/(app)/[circle]/layout.tsx`
  exists** — the stubs wrap themselves in `.auth-shell`/`.setup-card`;
  the §8.3 shell lands here (D3) and the stubs migrate onto it (D8).
- **The regression net this slice must not dent:** app tests **149/149
  across 21 vitest files** · the §11.4-3 walkthrough **11/11**
  (`docs/ops/e2e-local-gate.md`, the R6 local gate) · lint/typecheck/
  build clean · DB legs (46 exact · pgTAP 1134 · concurrency 55 ·
  db:verify) untouched by design — `supabase/` is not opened.
- **Patterns to extend, not invent:** the ESLint-API-driven fence test
  (`tests/lint/db-fence.test.ts`) — D2's a11y lint tests follow it; the
  flat `eslint.config.mjs` with named config blocks; the e2e local-gate
  protocol doc — D7 appends the a11y leg to it.
- **Not built anywhere (verified):** zero `@keyframes` in the tree; no
  `components/` directory; no icon set; no axe/jsx-a11y-explicit/
  stylelint tooling; no styleguide surface.

**How the existing screens migrate without regressing (the D8 rule):**
the 149-file suite pins route *contracts* (bytes, headers, refusal
shapes, call order), not markup aesthetics, and the walkthrough drives
roles/labels — so the migration is CSS-and-composition only: screens
adopt the shared components where one is 1:1 (buttons, cards, notices,
fields, empty states), route handlers and response bodies untouched.
Any test that does pin markup is amended in the same commit with the
change named. Full re-proof at the increment head: 149 + the new files
green, walkthrough 11/11 unchanged, production build clean.

---

## The §11.4 item-2 conformance pre-pass (run in this planning session)

Every token, component and rule in `design_spec.md` §2–§6 traced into
TSD §8, and §8 checked against the §7/§10 constraints. Result:
**conformant, with two recorded substitutions, one transcription gap,
and one measured contrast conflict** — D9 turns this pass into the
durable `docs/review/design-conformance.md` with implementation + test
refs per row.

- **§2 → §8.1:** every hex, the tinted-panel construction rule, and the
  four color rules carried exactly. ✓
- **§3 → §8.2:** the full scale table, voice rules, Newsreader-500
  default, 10px floor — carried exactly. ✓ *(Substitution to ratify:
  `next/font` self-hosting vs the §8.2 Google-Fonts link — Q7.)*
- **§4 → §8.3:** shell metrics, page pattern, grids, spacing carried. ✓
  The responsive substitution (container queries for the prototype's
  measured-width style holes) is already recorded *inside* §8.3. **Gap:
  the top-bar contents order (logo+wordmark · ask-the-record search ·
  feedback · member avatars · current user+role) and the left-nav
  grouping (primary ungrouped → `THE RECORD` → `CONNECTION`, counts
  right-aligned, utility pinned bottom) live only in design_spec §4 —
  §8.3 does not restate them.** Q7 proposes the annex line; D3 builds
  from design_spec §4 either way.
- **§5 → §8.4:** all components carried; the input's `outline: none` is
  §8.7's named defect and the seed already ships the fix. ✓
- **§6 → §8.5:** the seven animations carried exactly; §8's
  `<PulseProvider>` is a build mechanism, not a deviation. ✓
- **§7 constraint:** nothing in §8 or this plan renders a chart,
  progress bar or percentage (AC-PPL-6); §7's "prototype data is
  labelled" rule binds the surface slices, uncontradicted here. ✓
- **§10 deferrals:** no dark mode (no `prefers-color-scheme` handling
  ships — §8.8); photography placeholder; parent-facing view out of
  scope with its scale never inherited. ✓ — all respected below.

### The contrast conflict (the finding this pass exists to catch)

§8.7 sets **WCAG 2.2 AA** as the target *and* names `--muted` on
`--card` the lightest permitted body-adjacent pair. Computed in this
session (WCAG relative-luminance arithmetic; D1's red test pins exact
values):

| Pair (as specified) | Where §8 uses it | Ratio | AA 4.5:1 |
|---|---|---|---|
| `--ink-2` on `--card` | card body | ≈ 9.1 | ✓ |
| white on `--green` | primary button | ≈ 7.7 | ✓ |
| `--ink-2` on `--wash` | secondary button | ≈ 7.7 | ✓ |
| `--green` on `--sand` | links | ≈ 6.2 | ✓ |
| `--muted` on `--card` | meta 11.5–12px, secondary copy | **≈ 3.9** | ✗ |
| `--muted` on `--white` | quiet button 12px | **≈ 4.0** | ✗ |
| white on `--terracotta` | count badge `700 10.5px` | **≈ 4.2** | ✗ |
| `--terracotta` on `--sand` | link hover | **≈ 3.4** | ✗ |
| `--sage` on `--card` | tag chip `600 10.5px` | **≈ 3.5** | ✗ |
| `--amber` on `--card` | due dates | **≈ 3.0** | ✗ |
| `--line` on `--white` | input boundary at rest | ≈ 1.3 vs 1.4.11's 3:1 | ✗ |

None of these text sizes qualifies as WCAG "large" (18.66px bold /
24px), so AA-large allowances do not apply. `--faint`/`--label` are
exempted by §8.7's own rule (redundant text only) — an exemption that
holds only while review enforces the rule. **This is exactly the class
of structural failure G12 turns into a redesign if found late; Q2 puts
it to the owner now**, with the minimal-delta resolution recommended.

---

## The increment — unit map (build order; one PR-able increment, per Q1)

| # | Unit | Contents | Spec |
|---|---|---|---|
| D1 | Tokens complete + pinned | `app/globals.css` gains the missing §8.1 tokens (`--google-blue`, `--chip-sage-bg`, `--positive-label`, `--r-card/-row/-control/-pill`) and the `--panel-positive-*` → `--positive-*` rename with usages updated same-commit (Q6); plus the Q2-ruled contrast variants. `tests/design/tokens.test.ts` parses `:root` and asserts the exact §8.1 name→value map — the token pin. `tests/design/contrast.test.ts`: WCAG ratio arithmetic (pure function, `lib/design/contrast.ts`) over the permitted-pair table — the §8.7 contrast assertion, red first against the measured conflicts, green under the Q2 ruling. | §8.1, §8.7 |
| D2 | The a11y lint floor — BEFORE any component | `eslint.config.mjs` gains a named `hc/a11y` block: `eslint-plugin-jsx-a11y` flat/recommended (explicit devDep) + the icon-only-control label enforcement (§8.7's named rule) at error. `tests/lint/a11y-fence.test.ts` drives it through the ESLint API (the db-fence pattern): an unlabeled icon-only button fixture MUST red; a labeled one passes. `tests/lint/no-bare-outline.test.ts`: scans all first-party CSS and JSX `style` props — zero `outline: none` (§8.7's forbidden defect; the global focus ring is the only outline story). Rides the existing CI Lint + vitest steps — nothing new in ci.yml; "CI checks from the first component" is thereby literal. | §8.7, §11.2 G12 |
| D3 | Type roles, page pattern, shell, grids | Type-scale classes in globals.css for every §8.2 role not yet present (section headline 18 · serif/sans nav items · row title · meta/micro-meta · section label · eyebrow · badge — names from the §8.2 role column). `components/shell/`: `TopBar` (contents in design_spec §4 order; the ask-the-record slot exists in the API but renders nothing until slice 8 — never promise what isn't built), `LeftNav` driven by a nav manifest (`components/shell/nav-manifest.ts`: href · label · group · serif flag; only live routes listed — Timeline, Tasks, Invite, Account; groups appear as slices land), `Shell` (container-type: inline-size; §8.3 container queries verbatim; max-width 1240). `PageHeader` (34px title + one ≤620px muted context line). Grid classes: browsing `repeat(auto-fill, minmax(324px, 1fr))`/14px, working `main + rail`/20px. New `app/(app)/[circle]/layout.tsx` mounts the shell. | §8.2, §8.3; design_spec §4 |
| D4 | Core components | `components/ui/`: `Card` (no shadow; radii map; clickable = cursor only), `CardWithEyebrow` (eyebrow → 22px serif → muted explanation, three lines, no icon), `CountBadge`/`CategoryBadge`/`TagChip`/`RemovableChip` (the × in faint at 14px glyph size with a padded ≥44px hit area — §8.7), `Button` (primary/secondary/quiet wrapping the seed classes — screens keep working mid-migration), `Input`/`Field` (label association mandatory; composed-control borderless variant), `Avatar` (accent fill, cream ring, −8px stack) + `lib/design/accents.ts` — the person→accent assignment primitive (stable per member; plum reserved for the parent's own identity; each subject keeps one accent — PRD §4.0), `Legend` (7px dot + 11px muted label, hairline rule above — the required companion of every color-coded view). `components/icons/`: `Icon` base (24×24 viewBox, fill=none, stroke 1.6, round caps/joins, currentColor) + only the glyphs the shell and existing screens need — product icons land with their surfaces (YAGNI). | §8.4 |
| D5 | Motion | The seven §8.5 keyframes exactly (`mfade` · `tin` · `hp/hpo/hpg` · `rdot` · `eqp` · `bdrop` · `kb`) as tokens + utility classes; nothing over 250ms except the pulses, no easing past `ease`. The reduced-motion query completed with `animation-iteration-count: 1 !important` (the seed's gap) — written ONCE against the animation tokens. `components/motion/PulseProvider.tsx`: a second concurrent pulse registration throws in development and logs once in production; unregister on unmount. `tests/design/pulse-provider.test.tsx` pins the contract both modes; `tests/design/motion.test.ts` pins the keyframe inventory + the reduced-motion block including iteration-count. | §8.5, §8.7 |
| D6 | Data display primitives | `lib/format/dates.ts`: the three §2.7 temporal kinds rendered honestly — a due date is a date ("Sunday, July 12"), an appointment is a local time with its zone, a floating time says so; relatives ("just now", "this week"). `components/ui/CalendarNumeral` (9.5px uppercase month over 18px serif day, 38px fixed column), `EmptyState` (one 12.5px faint sentence, no illustration, no CTA), `ProvenanceLine` (muted 11–12px source line — the interface half of N2, consumed from slice 5 on). Counts stay plain prose; NO chart/progress/percentage component exists to import (AC-PPL-6 structurally). | §8.6, §2.7 |
| D7 | axe + the browser a11y leg | Dev-deps land (bound above). CI (jsdom): `tests/design/axe.test.tsx` renders every component composition from the styleguide fixtures (Q4) via static markup and runs axe — color-contrast off in jsdom (no layout; D1's math test owns it), everything else on. Local gate (browser truth): `e2e/a11y.spec.ts` under the R6 protocol — per existing route: axe WCAG 2.2 AA scan (contrast ON), 390px pass (§8.8 phone-primary), touch-target audit ≥44px including every × glyph, `reducedMotion: 'reduce'` emulation asserting no running infinite animation, keyboard traversal of sign-in and a setup step (Tab order, Enter submits, ring visible). `docs/ops/e2e-local-gate.md` gains the leg. Q3 rules the CI/local split. | §8.7; ADR-0015 R6 |
| D8 | Screen migration | Every 2B screen + the (app) stubs onto the system: buttons/cards/notices/fields/empty states through `components/`, stubs re-homed under the D3 shell, copy and route contracts byte-untouched. The full regression net re-proven at the unit head: 149 + new tests green · walkthrough 11/11 · build clean. Any markup-pinning test amended same-commit with the change named. | §8 whole; slice-2 §2B |
| D9 | Conformance record + ADR-0016 + coverage | `docs/review/design-conformance.md`: the §11.4-2 table (every design_spec §2–§6 item → §8 ref → implementation ref → test ref) — the pre-pass above made durable. **ADR-0016** records: the Q2 contrast ruling (with measured ratios), the font-loading substitution, the §8.3 annex line (Q7), the components/ addition to the §1.7 tree (Q5), the reduced-motion iteration-count fix, the Q3 CI/local split. Coverage rows (below) flipped with refs, pendings annotated. | §11.4-2 |

**Styleguide (Q4, rides D4–D7):** `app/styleguide/page.tsx`, dev-gated —
`notFound()` in production, pinned by a route test — rendering every
component in composition: D7's axe fixture, the frontend-design review
surface, and the living reference for the four review-enforced §8.1
rules (one accent per card · accents never large fields · green=product
voice vs terracotta=family attention · sand/cream never text, ink never
fill).

---

## Test surface

**What pins tokens (CI):** D1's token-pin test (exact §8.1 name→value
map — a palette or radius drift reds CI) + the contrast-math assertion
over the permitted pairs (the §8.7 "contrast assertion over the token
pairs", literally) + D5's keyframe/reduced-motion inventory pin.

**What pins a11y in CI (from the first component):** the jsx-a11y block
at error through `npm run lint` · the icon-label and no-bare-outline
fence tests through the ESLint API · jsdom axe over every component
composition · the 44px hit-area contract in component tests. All ride
the existing CI Lint/vitest steps — ci.yml itself does not change.

**What the walkthrough gains (local gate, R6):** `e2e/a11y.spec.ts` —
per-route browser axe at AA with contrast on · the 390px pass · the
touch-target audit · reduced-motion emulation · keyboard traversal.
The §11.4-3 walkthrough itself stays 11/11 **unchanged** — it is D8's
regression instrument, not this slice's new surface.

**What stays out, named:** §8.7's review-screen keyboard row and the
OCR "machine-read" labelling ship with their surfaces (slices 6 and
5/6) on this slice's primitives — pending rows below, never green
early. G12 itself is a review gate at the first non-founder invitee.

## Coverage rows to open (docs/coverage.md gains "## 3 — design system")

| ID | Assertion (compressed) | Layer | Status at slice end |
|---|---|---|---|
| DS-01 | §8.1 token set exact — names AND values pinned; tinted-panel construction; Q2 variants | app | green |
| DS-02 | §8.2 type roles render to spec; Newsreader-500 default; nothing below 10px | app | green |
| DS-03 | §8.3 shell + page pattern + grids; container-query responsiveness (no JS measurement, no viewport breakpoints) | app + e2e | green |
| DS-04 | §8.4 component contracts (no-shadow card, radii map, chip ×-hit-area, avatar ring/stack, legend composition, icon conventions) | app | green |
| DS-05 | §8.5 motion inventory exact; ≤250ms/`ease` bounds; PulseProvider single-pulse enforcement dev+prod | app | green |
| DS-06 | §8.6 primitives: three temporal kinds, plain counts, one-sentence empty states, provenance line; no chart primitive exists (AC-PPL-6) | app + review | green |
| DS-07 | The 2B surface migrated with zero contract regression (149 suite + walkthrough green unchanged at the head) | app + e2e | green |
| DS-08 | §11.4-2 conformance record complete (design-conformance.md); the review-enforced rules named as standing properties: the four §8.1 color rules · §8.2 voice (second person, name never "the patient", sentence case, the `·` separator, never alarm) · §8.6 plain counts / human dates / one-sentence empty states | review | review |
| A11Y-01 | 2px `--green` focus ring on every interactive element; bare `outline: none` unwritable (lint) | app | green |
| A11Y-02 | ONE reduced-motion query drops every animation to opacity-only INCLUDING iteration-count | app + e2e | green |
| A11Y-03 | 44px touch targets incl. padded × glyphs, audited in-browser at 390px | e2e (local gate) | green |
| A11Y-04 | Contrast: permitted token pairs ≥ 4.5:1 computed (per Q2 ruling); `--faint`/`--label` exemption bound to the redundancy rule | app + review | green |
| A11Y-05 | Accessible label on every icon-only control — jsx-a11y at error, fence-tested | app | green |
| A11Y-06 | axe: every component composition in CI (jsdom, contrast off) · every route in the browser leg (contrast on) | app + e2e | green |
| A11Y-07 | Full keyboard operation of the review screen incl. citation navigation | e2e | **pending → slice 6** |
| A11Y-08 | OCR "machine-read — may contain errors" labelling + navigation parity | app + e2e | **pending → slice 5/6** |
| G12-01 | G12 whole: WCAG 2.2 AA audit against the built surface, before the first non-founder invitee | review | **pending → gate** |

---

## Owner decisions — SETTLED 2026-08-18 (the plan-gate rulings)

The owner ruled on the seven batched questions below at the plan gate,
2026-08-18. Recorded verbatim; the build executes on these:

- **Q1 — SETTLED:** Single increment D1–D9, one PR, one review round
  (round 11).
- **Q2 — SETTLED:** Contrast: option **(a)** — minimal-delta text-role
  variants (`--muted-text`, `--sage-text`, `--amber-text`,
  `--terracotta-text`, `--terracotta-badge`; exact hexes pinned by D1's
  red test at ≥ 4.5:1). Fills/dots/tints keep the measured §2 palette.
  **(c2)** Input boundary: keep the at-rest aesthetic; record the 1.4.11
  disposition in ADR-0016 as a named G12 audit item with the
  darker-border fallback preserved.
- **Q3 — SETTLED:** CI/local split as planned: lint + contrast math +
  jsdom axe in CI; browser legs (route axe, touch targets, reduced
  motion, keyboard) in the R6 local gate, protocol-documented.
- **Q4 — SETTLED:** Dev-gated `/styleguide` route: yes (`notFound()` in
  production, pinned by test).
- **Q5 — SETTLED:** `components/{shell,ui,icons,motion}/` at root;
  §1.7 one-line addition via ADR-0016.
- **Q6 — SETTLED:** Rename `--panel-positive-*` → §8.1's `--positive-*`
  in D1, usages same-commit.
- **Q7 — SETTLED:** ADR-0016 docs bundle ratified: `next/font`
  substitution · §8.3 annex line (top-bar order + nav grouping) ·
  reduced-motion iteration-count erratum.

The questions as put to the owner (with the recommendations that were
accepted) are preserved below for the record.

## Owner decisions needed — the batched questions (round-10 pattern)

**Q1 — Increment shape.** Single increment (D1–D9, one PR, one review
round — round 11), or a 3A/3B split (3A = D1–D7 system + checks with
the styleguide as proof surface → review; 3B = D8–D9 migration +
conformance → review)? **Recommended: single.** There is no DB half to
isolate for scrutiny (the 2A/2B rationale), the units interlock, and a
system reviewed before it has migrated one real screen reviews worse,
not better — D8 is the proof the system works.

**Q2 — The contrast conflict (the substantive ruling).** The measured
§8.1 palette puts muted meta, sage chips, amber due dates, terracotta
hover links and the white-on-terracotta count badge at ≈3.0–4.2:1 —
below the AA 4.5:1 that §8.7's own target requires at their sizes.
Options: **(a) — recommended: minimal-delta text-role variants.** Keep
every measured value for what accents actually are per §8.1 rule 2
(strokes, small fills, dots, tints); add darkened *text/badge* variants
used wherever these colors carry words at text size — candidates,
verified ≥4.5 in planning, exact values pinned by D1's red test:
`--muted-text #6F695C` · `--sage-text #5A7A62` · `--amber-text
#8A671F` · `--terracotta-text #A04E2D` · `--terracotta-badge ≈#AD5330`
(count-badge fill). The warm-paper identity survives in the fills; the
words become readable; ADR-0016 + design_spec/TSD annex record it.
**(b)** accept AA-large-only ratios as a recorded deviation riding
§8.7's redundancy rule — G12 then inherits open WCAG 1.4.3 failures on
timestamps and badges, at a gate that calls structural failure a
redesign. **(c)** raise the type sizes — against the measured scale.
Sub-ruling **(c2), input boundary:** `--line` on white is ≈1.3:1 vs
WCAG 1.4.11's 3:1 for the at-rest input border. Recommended: keep the
aesthetic at rest (label + placeholder + the compliant focus ring carry
identification), record the 1.4.11 disposition in ADR-0016 as a named
G12 audit item with the darker-border option preserved as the fallback.

**Q3 — Where §8.7's "CI from the first component" meets R6's "browsers
stay out of CI".** Recommended: the split D7 encodes — lint + contrast
math + jsdom axe per component in CI (runs on every push, from the
first component, literally); browser truth (route axe, touch targets,
reduced-motion, keyboard) as a formalized leg of the R6 local gate,
protocol-documented and artifact-retained. ADR-0016 records the
reading; R6's own re-visit clause stands as the surface grows.

**Q4 — Styleguide surface.** A dev-gated `/styleguide` route
(`notFound()` in production, test-pinned) rendering every component in
composition — D7's axe fixture, the review surface for the four
§8.1 rules, and the reference future slices build against.
**Recommended: yes.** Alternative: test-only fixtures, no route —
loses the human review surface for a rule set §8 explicitly assigns to
review.

**Q5 — Component home.** `components/{shell,ui,icons,motion}/` at the
repo root (the Next.js convention; `lib/` stays logic-only per §1.7's
spirit), recorded as a one-line §1.7 tree addition in ADR-0016.
**Recommended: yes.**

**Q6 — The seed rename.** `--panel-positive-*` → §8.1's exact
`--positive-*` names (+ the missing `--positive-label`), usages updated
in the same commit, D1's pin making the names immovable after.
**Recommended: yes** — design_spec §9 makes the token tables the source
of variable names; the drift dies now or calcifies.

**Q7 — The ADR-0016 docs bundle.** Ratify together: the `next/font`
substitution for §8.2's Google-Fonts link (zero third-party requests;
the two families at the named weights preserved) · the §8.3 annex line
carrying design_spec §4's top-bar contents order and left-nav grouping
into the TSD (the transcription gap above) · the reduced-motion
iteration-count completion as a §8.7 erratum. All docs-only, the A1/A2
annex precedent. **Recommended: yes.**

---

## Completion recipe (the increment) + gate cadence

**Per unit:** red commit with the failure signature in the message →
green → the unit's tests join the suite. **At the increment head:**
lint · typecheck · production build clean — app tests all green (149
carried + the D-suite; count recorded exactly) — walkthrough **11/11
unchanged** + the a11y leg green under the local-gate protocol — DB
legs re-proven untouched by CI (reset 46 exact · pgTAP 1134/1134 ·
concurrency 55/55 · db:verify clean; `supabase/` tree hash unchanged
all slice) — coverage rows flipped with refs, pendings annotated,
never early — ADR-0016 + design-conformance.md complete — review
packet in the round-8 shape (head ledger from the start, one-SHA
evidence block, per-directory tree binding per ADR-0015 F12, pointed
questions with recommended answers).

**The gate cadence, each leg its own fresh session:** this plan → owner
rulings on Q1–Q7 (recorded in the plan's Status or a kickoff ADR) →
build red→green per unit → review packet → third-party review (round
11) → dispositions ADR → owner sign-off → merge commit (never squash,
owner sole authority). Constraints standing throughout: main stays
green · zero DDL (any exception: R8 first + recorded owner approval
before a line is written) · never real family data · the dependency
bound above.
