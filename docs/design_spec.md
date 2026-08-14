# Harper's Circle — Design Spec

**Version** 0.1 · extracted from the working prototype
**Purpose** The visual and interaction contract for the MVP build. Everything here is measured from `Harper's Circle Prototype.dc.html`, not invented. If a value isn't here, take it from the prototype rather than inventing one.
**Companion doc** `Harper's Circle — Project Scope.md` (what to build). This doc is how it should look and behave.

---

## 1. Design intent

Harper's Circle is used by people on hard days. The aesthetic follows from that.

**Warm paper, not clinical software.** The background is a warm sand tone, not white and not grey. Surfaces are cream cards on that sand. Nothing is cold, nothing is stark, nothing looks like a hospital portal or a productivity tool.

**Editorial, not dashboard.** Headlines are set in a serif at generous sizes. The product reads like a well-made letter or a good newspaper — considered, human, written by someone who cares. Body and interface text are a clean grotesque so the reading stays fast.

**Quiet by default, loud only when a person is needed.** The interface is low-contrast and calm. Saturated color appears in exactly three places: something needs review, something is due, something is good. Color is a signal, so it must stay rare. A screen where three things are orange is a screen where nothing is orange.

**Density without pressure.** A lot of information is on screen at once — that is the product's value — but it is grouped, labelled, and separated by generous whitespace so the eye lands somewhere specific. No walls, no grids of identical tiles.

**Anti-patterns.** No gradients as decoration. No drop shadows for depth (borders do that work). No progress rings, scores, streaks, badges, or gamification of any kind. No stock-photo optimism. No emoji in interface chrome — emoji appear only as category glyphs inside resource and content cards, where they read as pictograms.

---

## 2. Color

### Foundation

| Token | Hex | Use |
|---|---|---|
| Sand | `#EDE6D8` | Page background. The base plane everything sits on. |
| Cream | `#FBF8F1` | Chrome: top bar, left nav. The frame around the work. |
| Card | `#FDFBF6` | The default card surface, one step lighter than chrome. |
| White | `#FFFFFF` | Inputs, and cards nested inside a tinted panel. |
| Line | `#E7DFD0` | Standard border, and dividers. |
| Line strong | `#E1D8C7` | Borders on tinted surfaces (buttons, chips). |
| Wash | `#F0E8D9` | Soft fill: secondary buttons, hairline rules inside cards. |
| Scroll thumb | `#D8CDB9` | Scrollbars. |

### Ink

| Token | Hex | Use |
|---|---|---|
| Ink | `#24211B` | Headlines, primary values, names. |
| Ink 2 | `#4A463D` | Body copy inside cards. |
| Muted | `#857E70` | Secondary copy, metadata, timestamps, counts. |
| Faint | `#9A9382` | Placeholders, low-priority meta, dismiss glyphs. |
| Label | `#B0A891` | ALL-CAPS section labels, icon strokes in inactive states. |

### Signal

Four accents. Each carries one meaning and is not used decoratively.

| Token | Hex | Means | Appears as |
|---|---|---|---|
| Green | `#2F5B4E` | The system, trust, identity | Logo mark, links, primary actions, active nav |
| Terracotta | `#C1613C` | Needs a person | Review badges, "NEEDS YOU," appointments, the Memories heart |
| Amber | `#B98A2E` | Time pressure | Due dates, deadlines, expirations |
| Sage | `#6E8F73` | Handled, good | Confirmations, "THIS WEEK," saved items, positive tags |

Supporting: **Plum `#7A6E9B`** for the parent's own identity (avatar, profile chip) — a person, not a status. **Google blue `#4285F4`** only where an external calendar's own brand is being represented.

### Tinted panels

When a block needs to read as a distinct state rather than a plain card:

- **Positive / saved:** background `#F6FBF7`, border `#D6E7DA`, label text `#6E8F73`, body text `#33463F`.
- **Sage tag chip:** background `#E4EDE7`, text `#6E8F73`.

Follow the same construction for other states: a 4–6% tint of the accent as the fill, a 15–20% tint as the border, the accent itself as the label.

### Rules

1. One accent per card. If a card carries two signals, the more urgent one wins and the other becomes muted text.
2. Never use an accent as a large background field. Accents are strokes, small fills, text, and 2–8px dots.
3. Green is the product's voice; terracotta is the family's attention. Don't swap them for variety.
4. Sand and cream never appear as text colors, and ink never appears as a fill.

---

## 3. Typography

Two families, loaded from Google Fonts.

**Newsreader** (serif) — display. Weights 400/500/600 plus italics. Used for: page titles, card headlines, numbers that matter, day numerals, the wordmark, and the two "Connection" nav items (Memories, Family Album) where the serif marks a change in emotional register. Set at **weight 500** by default; 600 only for the wordmark.

**Hanken Grotesk** (sans) — everything else. Weights 400/500/600/700. Interface, body, labels, buttons, data.

### Scale

| Role | Spec |
|---|---|
| Page title | `500 34px/1.1 Newsreader` |
| Card headline | `500 22px Newsreader`, line-height 1.05 |
| Section headline | `500 18px Newsreader` (day numerals, sub-cards) |
| Wordmark | `600 17px Newsreader`, letter-spacing .2px |
| Serif nav item | `14.5px Newsreader` |
| Body | `13.5px` sans, line-height 1.5 |
| Card body | `12.5px` sans, line-height 1.5 |
| Nav item | `500 13.5px` sans |
| Row title | `600 14px` sans, line-height 1.25 |
| Meta | `11.5–12px` sans, muted |
| Micro meta | `10.5–11px` sans, faint |
| Section label | `700 10.5px`, letter-spacing .8–.9px, uppercase, label color |
| Eyebrow (in-card) | `700 10px`, letter-spacing .7px, uppercase, accent color |
| Badge / pill | `600–700 9.5–10.5px` |
| Button | `600 11.5–13px` sans |

Body line-height 1.5, headline line-height 1.0–1.3. Set `text-wrap: pretty` on paragraphs. Never below 10px.

### Voice

The type carries a voice; keep them consistent.

- Second person, present tense, plain words. "You say yes or edit." Not "Approve pending items."
- The product refers to the parent by name — "Nell's profile," "Everything Nell might need within reach of her own front door." Never "the patient," "the care recipient," or "the user."
- Sentence case everywhere except section labels and eyebrows.
- The middle dot `·` separates metadata clauses. It is the product's punctuation mark.
- State what happened, not what the system did: "already filed," not "auto-processing complete."
- Never alarm. Amber and terracotta do the urgency; the words stay level.

---

## 4. Layout

**Shell.** Sticky top bar (11px × 20px padding, cream, 1px bottom border) → below it a row of left nav (cream, 1px right border, 16px × 12px padding, 2px gap between items) and main content, capped at `max-width: 1240px`.

**Top bar contents, in order:** logo + wordmark · ask-the-record search field · (auto margin) · Feedback button · overlapping member avatars · current user with role beneath.

**Left nav.** Grouped, with a 1px divider and an ALL-CAPS label starting each group. The prototype's groups: primary actions (ungrouped) → `THE RECORD` → `CONNECTION`. Counts and review badges sit right-aligned inside the item. A utility button pins to the bottom via `margin-top: auto`.

**Page pattern.** Title (34px serif) → one line of muted 13.5px context, max-width ~620px → controls row if any → content. Content is grids of cards: `repeat(auto-fill, minmax(324px, 1fr))` with 14px gap for browsing; a two-column `main + rail` grid with 20px gap for the working screens.

**Spacing.** Card padding 16–18px. Gaps: 6px inside a chip row, 8–12px between related cards, 14px in a card grid, 20–22px between page blocks. Title-to-content 20–24px.

**Responsive.** Column counts, nav width, and shell direction are all computed in logic and injected as style holes (`shellStyle`, `navStyle`, `mainStyle`, `homeMainCols`, `homeCardsCols`) rather than written as media queries. Keep that pattern — the layout responds to a measured width, not a breakpoint list.

---

## 5. Components

### Card
`background: #FDFBF6; border: 1px solid #E7DFD0; border-radius: 13px; padding: 16–18px`. No shadow. Clickable cards get `cursor: pointer` and nothing else — no hover lift, no shadow bloom. Interior dividers are `1px solid #F0E8D9` with 6–12px of padding above.

Radii, consistently: **13px** cards · **12px** compact rows · **9–10px** inputs, nav items, buttons · **20px** pills · **50%** avatars.

### Card with eyebrow
The standard summary card: uppercase 10px accent eyebrow → 22px serif headline → 12px muted explanation. Three lines, that order, no icon.

### Badge / pill
- **Count badge:** terracotta fill, white text, `700 10.5px`, `1px 7px`, radius 20px.
- **Category badge:** tinted fill + accent text, `700 9.5px`, `2px 8px`, radius 9px.
- **Tag chip:** `#E4EDE7` fill, sage text, `600 10.5px`, `3px 9px`, radius 11px.
- **Removable chip:** white fill, tinted border, radius 20px, `6px 13px`, ending in a `×` in faint at 14px.

### Button
- **Primary:** green fill, white text, radius 9px.
- **Secondary:** `#F0E8D9` fill, `#E1D8C7` border, `#4A463D` text, radius 20px, `6px 13px`, `600 11.5px`.
- **Quiet:** white fill, `#E1D8C7` border, muted text, radius 9px, full-width where it's a utility.
- Buttons with an icon use `display:flex; gap:7px; align-items:center`.

### Input
White fill, `1px solid #E7DFD0`, radius 9–10px, `8–9px × 12–13px`, 13px sans, `outline: none`, placeholder in faint. A leading 14–15px icon in `#B0A891`. Inputs inside a composed control (the zip field) drop their own border and sit borderless inside a shared shell.

### Avatar
Circle, 27–29px, accent fill, white initial at `600 11px`, `2px solid #FBF8F1` ring. Stacks overlap at `margin-left: -8px`. Each person keeps one assigned accent throughout the product — the color is that person's identity, not decoration.

### Icons
Inline SVG on a 24×24 viewBox, `fill="none"`, `stroke-width: 1.6` (1.7–1.8 for the smallest), round caps and joins. Rendered at 13–16px. Stroke is `currentColor` so the icon inherits nav state; hard-coded stroke only where the icon carries its own meaning (the terracotta Memories heart). Line-drawn and geometric — never filled, never duotone.

### Legend
Where a view uses color to encode kind (the calendar), a legend follows below a hairline rule: a 7px dot in the accent + 11px muted label, in a flex row with 14px gaps. Any color-coded view must carry one.

---

## 6. Motion

Motion is confirmation and invitation. It never entertains.

| Name | Spec | Use |
|---|---|---|
| `mfade` | 8px rise + fade, `.25s ease` | Every screen change. The only page transition. |
| `tin` | 14px rise + fade | Items entering a list. |
| `hp` / `hpo` / `hpg` | Expanding ring pulse, `2.2s ease-out infinite`, amber / terracotta / green | One element per screen, maximum. Marks the single thing that wants a person. |
| `rdot` | 3px bob, staggered | Thinking / reading indicator. |
| `eqp` | scaleY bars | Audio playback only. |
| `bdrop` | Opacity fade | Modal backdrops. |
| `kb` | Slow scale + drift | Photographic backdrops only. |

Rules: nothing longer than 250ms except the deliberate infinite pulses. No easing more dramatic than `ease`. No spring, no bounce, no stagger for effect. **At most one pulsing element on screen** — its whole job is to be the only one.

---

## 7. Data display

**Provenance is visible.** Anything the AI produced shows where it came from, in muted 11–12px beneath or beside the value. This is a visual requirement, not a backend one: a fact without a visible source is a bug.

**Counts are plain.** `{{ n }} in the Care Inbox`, `{{ n }} open tasks`. No progress bars, no percentages, no charts in the MVP.

**Dates are human.** "Sunday, July 12," "just now," "this week." Calendar cards split the numeral into a 9.5px uppercase month over an 18px serif day, in a 38px fixed-width column.

**Empty states are a sentence,** 12.5px faint, no illustration and no call to action: "Nothing on the books for this month."

**Prototype data is labelled as prototype data,** in muted 12px, wherever it's shown.

---

## 8. Accessibility

The primary user is often 45–60 and reading on a phone at a hospital; the parent may read it too.

- Body text at 13.5px is the floor for prose. Meta below 12px is for supporting information only — never the only place a fact appears.
- Meaning is never carried by color alone. Every color-coded item also carries a word: a legend, a badge label, or an eyebrow.
- Interactive targets: 44px minimum on touch. The prototype's nav rows and buttons clear this; small `×` dismiss glyphs need a padded hit area in the build.
- Contrast: muted `#857E70` on card `#FDFBF6` is the lightest permitted combination for body-adjacent text; faint `#9A9382` and label `#B0A891` are reserved for text that repeats information available elsewhere.
- Honor `prefers-reduced-motion`: drop all pulses and entrance animations to opacity-only. Not yet implemented in the prototype — required for the build.
- Every icon-only control gets an accessible label. Focus states must be visible; the prototype sets `outline: none` on inputs and does not replace it. Fix in the build: a 2px green focus ring.

---

## 9. Implementation notes

- **Fonts:** preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`, then load Newsreader (`400;500;600` + italic 400/500, optical size `6..72`) and Hanken Grotesk (`400;500;600;700`) with `display=swap`.
- **Resets:** `* { box-sizing: border-box }`, `body { margin: 0 }`, body background sand, body color ink, body font Hanken Grotesk with `system-ui, sans-serif` fallback.
- **Links:** `a { color: #2F5B4E }`, `a:hover { color: #C1613C }`. Define these before anything else ships.
- **Scrollbars:** 10px, thumb `#D8CDB9` at radius 6px, transparent track.
- **Styling approach:** the prototype is inline-styled with computed style values injected from logic for anything responsive or stateful. Keep that discipline in the build — if it moves toward a class-based system, the token tables in §2 and §3 are the source for the variable names.

---

## 10. Open

1. Focus rings, reduced-motion, and touch-target padding are specified above but not yet in the prototype.
2. No dark mode. The warm-paper identity doesn't translate directly; if it's wanted, it needs its own palette rather than an inversion.
3. Photography is placeholder throughout. Real family imagery will change how the Memories and Album surfaces feel and may need its own treatment rules.
4. The parent-facing phone view exists in the prototype but is out of MVP scope; its type scale should be re-derived (larger) rather than inherited when it's built.
