# Third-party review packet — round 11: slice 3, the design system

**Requesting review of:** slice `3 — Design system` (TSD §8 whole), one
increment D1–D9 per the Q1 ruling, on `slice/3-design-system`, branched
from main @ `fe2aed6` (the accepted plan). ZERO DDL — `supabase/` tree
hash `53a8517490f7f5348bca5ab9c1f42c9163b2919d` at both `fe2aed6` and
this head, asserted below. Zero new runtime dependencies.

**Authority order:** master plan → TSD §11.1 row 3 → TSD §8 whole (+
Amendment A8, this slice) → `design_spec.md` §2–§6 as measured source
(§7/§10 as constraints) → §11.4-2 (the conformance record) → §11.2 G12
→ PRD §13.2/§13.4/§13.5, §3.3/AC-PPL-6 → ADRs 0006/0014/0015 → the
settled Q1–Q7 rulings (`docs/review/slice-3-plan.md`, 2026-08-18) →
`docs/coverage.md` conventions.

**Review style requested:** as rounds 6–10 — decision-completeness over
line-by-line; the packet's claims are checkable against the tree and
the red→green history. Every deviation and judgment call is surfaced
here or in ADR-0016; finding one that is not is itself a finding.

## What round 11 reviews

The design system landing BEFORE the surfaces: §8.1 tokens complete and
pinned (with the Q2 contrast ruling applied), the a11y lint floor landed
before the first component existed, §8.2 type roles, the §8.3 shell with
container-query responsiveness, §8.4 components, §8.5 motion with the
single-pulse enforcer, §8.6 data-display primitives (AC-PPL-6
structurally), the Q3-split axe legs, the 2B surface migrated with zero
contract regression, and the D9 docs bundle (ADR-0016 · TSD A8 ·
design-conformance.md · coverage rows).

## The increment, unit by unit (build order; red→green per unit)

- **D1 tokens** — `:root` now the exact §8.1 set + the Q2 text-role
  variants; `--panel-positive-*` → `--positive-*` (Q6) usages
  same-commit; seed text usages re-pointed (quiet button, field-help,
  auth-meta, link hover). Pins: exact-set token equality; 20 permitted
  pairs ≥ 4.5:1 from the live sheet.
- **D2 lint floor (before any component)** — `hc/a11y`: jsx-a11y
  recommended at error + `control-has-associated-label` with form
  fields carved out (the rule never walks up to a wrapping label;
  `label-has-associated-control` owns fields). Fence-tested through the
  ESLint API both ways + the no-bare-outline scanner.
- **D3 type roles + shell** — the §8.2 role classes; TopBar in §4 order
  with honest slots (search/feedback render NOTHING until built);
  manifest-driven LeftNav (live routes only; groups appear as slices
  land; aria-current is truth and styling); Shell owning the one main
  landmark; PageHeader; both grids; container queries on §8.3's own
  900px boundary — the ONLY @media in first-party CSS is
  reduced-motion.
- **D4 components** — Card (no shadow; `box-shadow` unwritable),
  CardWithEyebrow, CountBadge (Q2 badge fill), CategoryBadge
  (construction-rule tint via color-mix — no unpinned hex),
  TagChip, RemovableChip (44px padded ×), Button (wraps seed classes),
  Field/Input (structural label association), Avatar/AvatarStack +
  `lib/design/accents.ts` (stable FNV-1a assignment; plum seq-1; green
  excluded), Legend, the Icon conventions base (product glyphs land
  with their surfaces). Q4 styleguide: dev-gated, notFound() in
  production pinned, every composition rendered.
- **D5 motion** — the seven §8.5 animations exactly (nine keyframes,
  every one consumed); pulses as pseudo-element border rings (no
  shadows), 2.2s ease-out with their accents; reduced-motion completed
  ONCE with iteration-count; PulseProvider throws dev / logs once prod
  / unregisters on unmount.
- **D6 data display** — `lib/format/dates.ts` (a due date REFUSES a
  timestamp; appointments render the intended local time with the zone
  derived at the stored instant; floating says so; relatives in the
  viewer's zone), CalendarNumeral, EmptyState, ProvenanceLine; no chart
  primitive exists to import, scanned.
- **D7 axe legs** — CI: jsdom axe over every styleguide composition
  (contrast off; positive control proves the harness bites) + the 44px
  floor pinned in the sheet (made true for secondary/quiet/inputs).
  Local gate: `e2e/a11y.spec.ts` per route at 390px — axe AA contrast
  ON, touch audit, no horizontal scroll, keyboard traversal with the
  computed ring, reduced-motion emulation with its positive control.
  Protocol: `docs/ops/e2e-local-gate.md`.
- **D8 migration** — stubs re-homed under the shell (2B copy verbatim),
  every raw `<button className="button-*">` replaced by `<Button>`,
  nested-label fields by Field/Input where exactly 1:1. NO
  markup-pinning test needed amendment (the route tests pin copy and
  contracts, both unchanged); the migration test pins the new
  structure.
- **D9 docs** — ADR-0016 · TSD A8 · design-conformance.md · coverage.

## The substantive judgment calls (each argued in ADR-0016; dispute any)

1. **Q2 candidates darkened by the pin itself** (ADR-0016 D1):
   `--muted-text #6F695C→#6C665A` (candidate 4.39:1 on sand — the §8.3
   context-line surface); `--sage-text #5A7A62→#526F5C` (candidate
   4.00:1 on the chip's own fill). The ruling's mechanism operating as
   written.
2. **EmptyState on `--muted-text`, not §8.6's faint** (D6.2): the
   sentence is the only content; the redundancy exemption cannot cover
   it; faint reds the contrast-on browser leg.
3. **The §8.2 floor resolves 9.5px to 10px twice** (D6.1): category
   badge, calendar month.
4. **44px made true** (D6.3): secondary/quiet buttons and inputs gain
   min-height 44 — the spec claims the prototype clears it; the
   measured seed values did not.
5. **CONTRAST_EXEMPT** (D6.4): `.step-indicator`, `.section-label`,
   `.micro-meta` excluded from browser contrast scanning under §8.7's
   own redundancy rule — the step indicator's redundancy claim is the
   softest; G12 re-audits.
6. **The adapter slot unused** (D6.8): vitest-axe (0.1.0, stale) not
   installed; axe-core driven directly. devDeps landed:
   eslint-plugin-jsx-a11y 6.10.2 · jsdom 30.0.1 · axe-core 4.13.0 ·
   @axe-core/playwright 4.13.0, all exact. Reserve slot INTACT.
7. **Nav tier-awareness deferred** (D6.6) and **avatar initials
   G12-watched** (D6.5).
8. **Unpinned-by-spec values chosen** (D6.7): the re-measure ledger in
   design-conformance §3 (nav 220 · topbar gap 14 · main pad 22×20 ·
   working grid 2:1 · five durations · range picks).

## Red→green history (failure signatures in every red commit)

| Unit | Red | Green |
|---|---|---|
| rulings | — | `74a7039` (docs-only) |
| D1 | `fbb3093` (11 failures; six measured ratios 3.01–4.16 + token pin) | `606602f` |
| D2 | `ff07513` (4 failures; the floor genuinely absent) | `5858011` |
| D3 | `2409940` (29 failures; no role classes, no components/, no shell CSS) | `b9ff8ae` |
| D4 | `12ec24c` (21 failures; nothing exists) | `3b21559` |
| D5 | `89b088a` (keyframe inventory []; seed's iteration-count gap NAMED) | `b178923` |
| D6 | `4ce6bc5` (modules absent; AC-PPL-6 scan green at birth by design) | `1733fc5` |
| D7 | `4bf8eb1` (3 failures; secondary ~29px, quiet ~38px, inputs ~40px) | `c10872e` |
| D8 | `cc7f8ce` (8 shell offenses; 13 raw-button files) | `04d57d2` |
| D9 | — | `102032c` (docs-only) |
| D7 fix | gate run 1 (the leg's own red — see below) | `e80aaef` |

## Defects found and handled inside the increment

- The seed's reduced-motion block lacked `animation-iteration-count`
  (the §8.7 snippet has it; the sheet didn't) — D5's red run names it,
  D5 closes it.
- The measured contrast conflicts (the §11.4-2 finding) — Q2 ruled,
  D1 landed, including the two candidate corrections above.
- The seed's secondary/quiet/inputs below the 44px floor — D7's red
  run measures them, D7 closes it.
- The a11y leg's own first gate run found a defect IN THE NEW SPEC:
  its keyboard test password-signed-in an unverified account, which
  the product refuses unconditionally (the probed GoTrue fact,
  ADR-0014 D3 — the app answered `/sign-in?e=unverified` exactly as
  specified). Classified from the retained trace as spec-defect (not
  product, not flake); fixed at `e80aaef` (the leg now clicks the
  Mailpit confirmation link first, the walkthrough's own pattern);
  full re-run at the new head below. The walkthrough itself was 11/11
  in BOTH runs.
- eslint-config-next's jsx-a11y subset does not carry the recommended
  floor (alt-text and tabindex-no-positive were UNENFORCED) — D2's red
  run proves it, D2 closes it.

## Verification evidence (ONE SHA — `e80aaef`, this head before the packet commit)

- `supabase/` tree hash **unchanged all slice**:
  `53a8517…` at `fe2aed6` == at head (zero DDL, asserted).
- **App tests: 279/279 across 35 files** (vitest, live stack) — the
  149 carried, unamended, + 130 new across 14 files (12 design + 2
  lint). Run after `db:reset` (46 exact, verify-migration-state clean).
- **Lint** clean (with the new floor at error over the real tree) ·
  **typecheck** clean · **production build** clean (30/30 pages;
  /styleguide prerenders as its production 404).
- **The local gate** (protocol run, `npx playwright test --trace on`,
  Chromium, stack per `docs/ops/e2e-local-gate.md`):
  **walkthrough 11/11 UNCHANGED · a11y leg 5/5 green** — per-route axe
  AA (contrast on) · 390px + no horizontal scroll · touch audit ·
  keyboard traversal with the computed 2px green ring · reduced-motion
  emulation with its positive control.
  **Gate record:** `e80aaef` · 2026-08-18 · local (win32, Chromium,
  hermetic reset 46-exact first) · **16/16 in 2.4m** · traces
  (`--trace on`) in `test-results/`, retained vault-side with the run
  record. Run 1 (at `102032c`, 12 passed / 1 failed): the a11y spec's
  own defect, classified from the retained trace and fixed at
  `e80aaef` — see "Defects found" above; the walkthrough was 11/11 in
  both runs.
- **DB legs ride CI** at every push (reset 46 exact · pgTAP 1134 ·
  concurrency 55 · db:verify) — `supabase/` untouched, so the branch
  runs re-prove the unchanged baseline.

## Per-directory tree binding (ADR-0015 F12) — what changed, at this head

| Tree | Changed? | Contents |
|---|---|---|
| `supabase/` | **NO** (hash-asserted) | — |
| `app/` | yes | globals.css (tokens/type/shell/components/motion/§8.6) · (app)/[circle]/layout.tsx NEW · styleguide/ NEW · every screen's D8 component adoption (copy byte-untouched) |
| `components/` | **NEW** | shell/ ui/ icons/ motion/ (Q5 home) |
| `lib/` | yes | design/contrast.ts NEW · design/accents.ts NEW · format/dates.ts NEW (nothing else touched) |
| `tests/` | yes | design/ NEW (12 files) · lint/a11y-fence + no-bare-outline NEW (db-fence untouched) |
| `e2e/` | yes | a11y.spec.ts NEW (onboarding.spec.ts UNTOUCHED) |
| `docs/` | yes | slice-3-plan (rulings) · ADR-0016 · TSD A8 · design-conformance · coverage §3 · e2e-local-gate a11y leg · this packet |
| config | yes | eslint.config.mjs (hc/a11y block) · package.json (4 exact devDeps) — ci.yml UNTOUCHED, vitest/playwright configs UNTOUCHED |

## Pointed questions for round 11 (recommended answers inline)

**Q11-1 — The two Q2 candidate corrections.** The ruling named
candidate hexes and delegated exactness to the red test; two candidates
failed real surfaces (sand context line; chip fill) and were darkened
one step. Ratify the landed values? **Recommended: yes** — the
alternative (keeping the candidates) ships pairs at 4.0–4.39:1 against
the ruling's own ≥ 4.5 pin.

**Q11-2 — EmptyState off faint.** Accept muted-text as the empty-state
colour (ADR-0016 D6.2), or keep §8.6's faint and carve empty states out
of the contrast-on browser scan? **Recommended: accept muted-text** —
an empty sentence is the only content on a hospital-corridor phone; a
scan carve-out for unreadable primary content inverts the point of the
scan.

**Q11-3 — CONTRAST_EXEMPT scope.** Is the three-selector exclusion
(step-indicator, section-label, micro-meta) the right reading of
§8.7's redundancy exemption, given the step indicator's step-position
is not strictly stated elsewhere? **Recommended: keep, G12 re-audits**
— alternatively rule now that the step indicator adopts `--muted-text`
and shrink the list to two.

**Q11-4 — The 44px pill.** min-height 44 visibly deepens the secondary
pill vs the prototype's ~29px. Accept (the spec's own floor), or
prefer a pseudo-element hit-extension that preserves the compact
visual? **Recommended: accept** — real boxes keep the audit honest; the
prototype re-measure can revisit.

**Q11-5 — The working-grid ratio.** `2fr/1fr` is a chosen reading of
"main + rail" (the spec pins only the 20px gap). Accept as the
placeholder until the first working surface re-measures the prototype?
**Recommended: yes** — flagged in design-conformance §3.

**Q11-6 — The unused adapter slot.** Confirm the dependency ledger
(four exact devDeps; vitest-axe skipped as stale; reserve intact)?
**Recommended: yes.**

**Q11-7 — Nav tier-awareness.** Accept the deferral (Invite visible to
all members; refusal surface downstream) to the first slice that reads
membership in the layout? **Recommended: yes** — a tier-aware nav
without membership context in the layout would be invented state.

## Files

New: `components/**` (11 ui + 4 shell + 1 icon + 1 motion + manifest) ·
`lib/design/{contrast,accents}.ts` · `lib/format/dates.ts` ·
`app/(app)/[circle]/layout.tsx` · `app/styleguide/{page,fixtures}.tsx` ·
`e2e/a11y.spec.ts` · `tests/design/*` (12) · `tests/lint/{a11y-fence,
no-bare-outline}.test.ts` · `docs/adr/0016…` ·
`docs/review/design-conformance.md`.
Modified: `app/globals.css` · the 16 D8 screens · `eslint.config.mjs` ·
`package.json`/lock · `docs/{TSD.md,coverage.md,ops/e2e-local-gate.md,
review/slice-3-plan.md}`.

## Addendum — the owner eyeball pass (post-packet, pre-review)

The owner reviewed the rendered system by hand (2026-08-18: /sign-in
and /styleguide against the four §8.1 rules — the Q4 surface doing its
job): **approved, one visual finding** — the composed-control fixture
nested its label inside the shared shell. Fixed at `0b371e1`
(fixture-only; label outside, aria-labelledby association; no screen
uses the composed control yet). Per the F12 binding rule the gate
re-ran at that head:
**`0b371e1` · 2026-08-18 · local (hermetic reset first) · 16/16 in
3.6m** — walkthrough 11/11 unchanged, a11y leg 5/5; traces retained.
A `.env.local` (git-ignored, local demo defaults from .env.example) now
exists for hand-browsing — the recorded gate still injects its own env
and needs none.

## Addendum — auditability block (head ledger from the start)

`fe2aed6` (main, the accepted plan) → `74a7039` rulings SETTLED →
`fbb3093` D1 red → `606602f` D1 green → `ff07513` D2 red → `5858011`
D2 green → `2409940` D3 red → `b9ff8ae` D3 green → `12ec24c` D4 red →
`3b21559` D4 green → `89b088a` D5 red → `b178923` D5 green → `4ce6bc5`
D6 red → `1733fc5` D6 green → `4bf8eb1` D7 red → `c10872e` D7 green →
`cc7f8ce` D8 red → `04d57d2` D8 green → `102032c` D9 docs → this
packet. Every red commit message carries its failure signatures; no
force-pushes; merge (never squash) after owner sign-off (ADR-0006).
