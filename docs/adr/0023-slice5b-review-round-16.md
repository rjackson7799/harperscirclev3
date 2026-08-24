# ADR-0023 — round-16 dispositions: slice 5B, the app half of extraction + interpretation

**Status:** **ACCEPTED** — the dispositions record for round 16, ratified
AS AMENDED by the owner on 2026-08-23 and merged in the same session
(the ADR-0015 / ADR-0013 sign-off-with-merge pattern). **D24 carries the
sign-off**: four rulings, the two D17 verdicts the sign-off corrected,
the four defects it found in this document, and the slice-6
queue. **Merged at `c63bcae`** — a MERGE COMMIT, never a squash
(ADR-0006), parents `a9d9f43` + `318e2ad`, merged tree verified
IDENTICAL to `318e2ad`'s (`d6aea1ac`). **CI green on `main` at the merge
commit**, run `32694917229`. PR #10 closed as merged. The merge record
is D24's last section.

**Deciders:** the round-16 review session (owner ratifies at sign-off).

**Context:** Round 16 reviewed slice 5B on `slice/5b-app-extraction`,
against `docs/review/round-16-packet.md` and **ADR-0022** (Proposed).
Eight independent adversarial reviewers returned **113 findings** — 10
BLOCKER, 40 MAJOR, 33 MINOR, 30 OBSERVATION — landed **verbatim** at
`docs/review/round-16-findings.md` (`811db17`, `af4aaec`) before
anything here was argued, per the `5faccc4` precedent.

**The numbering:** ADR-0022 was 5B's as-built record, so this is
ADR-0023 — the next free number against `docs/adr/` at write time.

---

## D0 — how these dispositions were reached, and what that changed

Three rules governed this round, and each of them changed an outcome:

**1. A finding's PREMISE is verified against the tree before it is
argued** (the round-15 precedent, where F2's severity premise turned out
to be false). Every BLOCKER here was re-verified independently — three
of them by *executing* code rather than reading it. That mattered:
R3/F-1's claim about mupdf's geometry is surprising enough that reading
the code would not have settled it, and running it did.

**2. A reviewer's severity is the reviewer's, not this session's.** The
table in D14 records the reviewer's grade and this session's verdict
separately. Two findings are graded down with an argument; none is
graded down silently.

**3. An amended green assertion carries its argument in place.** Packet
Q-I is precisely about the danger of changing an assertion that already
passes. Three such amendments were necessary here, and each one is
commented at the site with the reason, not just in a commit message:
the model allowlist (`tests/ai/adapter.test.ts`), the fence helper
`restricted()` (`tests/lint/db-fence.test.ts`), and the record-context
fixtures (`tests/routes/worker-interpret.test.ts`). It would be poor
form to make the very move Q-I asks the review to scrutinise without
putting the reason on the record.

**What the round found that the packet did not anticipate.** The packet
opened with Q-A — one line of DDL for a column grant — as its headline.
That is not where the weight landed. The review found a **falsified core
mechanism** (§4.8's conflict arm was inert in production), a **silent
product-quality defect on the most common real-world input** (a scanned
document at 300 dpi rendered below the standard tier), a **bypassable
G9 partition fence**, an **unpassable G9 gate**, and an **unrecorded
AGPL obligation**. Q-A remains correct and remains owed; it is no longer
the largest thing on the table.

---

## D1 — ACCEPTED and FIXED: the record-context key mismatch (R4/F-1)

**The single most consequential finding of the round.**
`hc.record_context_for` returns its facts section under `profile_facts`
(migration `20260821120002`, pinned by pgTAP `052:350`). Both TypeScript
consumers read `.facts`. The Map in `currentFacts()` and the Set in
`knownFactIds()` were therefore **empty on every call in production**,
which means:

- no `profile_fact` was ever converted to a conflict — §4.8's rule that
  a change to an existing value is ALWAYS a conflict was inert;
- the restatement suppression never fired;
- **every** model-drafted conflict was dropped by the allowlist, so the
  pipeline could not emit a `conflict` proposal at all;
- a dose change therefore reached review as a plain `profile_fact`, and
  `hc.approve_proposal`'s non-conflict branch silently supersedes the
  current row — **the quiet update §4.8 and AC-INBOX-6 exist to
  forbid**.

**Why a green suite could not see it, and what that costs the ADR.**
The unit fixtures *invented* the shape: `RECORD = { facts: { rows: … } }`.
A mocked fixture asserting a shape the database does not return is a
test of the fixture. ADR-0022 D8's claim — "§4.8's conflict rule is
MECHANICAL, not prompted" — described code that could not run, and the
INJ-01 coverage cell's "a conflict may only quote a fact id the call was
GIVEN — enforced twice" described two enforcement points guarding an
empty set.

**Fixed** (`5337064` RED → `c15d764` GREEN). The RED commit corrected the
*fixtures* to the definer's shape rather than adding a new test, and the
production defect reproduced exactly: `expected 'profile_fact' to be
'conflict'`. The durable guard reads the **shipped migration** — a mock
cannot drift from a shape asserted against the source of truth. This is
the same shape of guard R7 argues for on the grant class in Q-A, and it
is why that argument is accepted below.

---

## D2 — ACCEPTED and FIXED: declared resolution silently downsampled photos (R3/F-1, R3/F-2)

**Two BLOCKERs with one cause.** mupdf sizes an image page as
`pixels × 72 / declared_resolution`, and falls back to 96 dpi — a page
point being 0.75 stored pixels — **only when the image declares no
resolution at all**. `PT_PER_PX = 0.75` was that fallback, documented as
a property of the image path. Every fixture in `fixtures/g9` is
density-free, which is the only reason it looked like a law.

Reproduced directly against `node_modules/mupdf` on an unmodified corpus
fixture with only a JFIF density header prepended:

| declared | reported geometry | rendered long edge |
|---|---|---|
| none (the corpus) | 1928×2576 | **2576** ✓ |
| 150 dpi | 1234×1649 | 1649 |
| 300 dpi | 617×824 | **824** |
| 600 dpi | 308×412 | **412** |

Every flatbed and every phone "Scan to JPEG" writes that tag, typically
at 200–300 dpi. So a family scanning a discharge summary got a page
rendered **3.1× below its own resolution and below even the standard
tier**, with `outcome: rendered`, no ceiling fired, and nothing logged.
§6.3 says a photo is never downsampled. The failure is invisible at the
surface: it shows up as a missed or low-confidence `medication_dose`,
indistinguishable from an ordinary model miss.

R3/F-2 is the same number gating `page_dimensions`, so the effective
ceiling scaled as `80 Mpx × (dpi/96)²` and the corpus's own 900 Mpx bomb
was **accepted and decoded** once its header claimed 600 dpi.

**Fixed** (`d8b5db5` RED → `2a8f1c7` GREEN). `storedPixels()` reads the
true raster dimensions from the header — JPEG SOF (skipping C4/C8/CC,
which share the marker range and are not frame headers), PNG IHDR, GIF
logical screen descriptor — returning null for anything it cannot parse,
where the declared-points proxy still applies. Three properties held
deliberately:

- **No `mupdf.Image` is constructed.** That constructor reports the
  stored frame with EXIF ignored, and §6.4's citation space is the page
  as a person SEES it. `declaredPixels()` takes the header pixels and
  ORIENTS them to the displayed frame, using the page's own bounds as
  the authority on which way round EXIF 5–8 landed. R3/F-10 verified
  "only ever opens documents" holds; it still holds.
- **Still answered from the header, before any decode** — `storedPixels`
  runs once beside the magic sniff, before the first `loadPage`.
- **`PT_PER_PX` is unchanged and still correct where it is used**: a PDF
  page's points are real typographic points with no stored raster. Its
  docstring now says it is the *no-resolution fallback*, which is the
  sentence that was missing.

The mupdf spike was re-run at the fixed head: the script reports 8/8, and
leg 8 still measures 36.3 vs 220.4. **Read that as 7/8** — R7/F-3 is
ACCEPTED below and re-scores leg 5 FALSIFIED, because it contains no
assertion and passes unconditionally while the criterion it claims
("malformed input refuses cleanly") is not met: mupdf repairs. The
honest hostile-input posture is "malformed input is repaired and
processed". Corrected here at sign-off rather than left to contradict its
own disposition in D17's R7 table, four hundred lines below (D24).

---

## D3 — ACCEPTED and FIXED: the adapter was binary to git (R2/F-19, R7/F-7)

Two lenses found the same byte independently. `lib/ai/client.ts` used a
raw NUL as a cache-key separator, so git classified the module as
binary — and every consequence landed on the review controls this
slice's central claim rests on:

- `git show 88ed484 --stat -- lib/ai/client.ts` → `Bin 0 -> 7268 bytes`,
  `1 file changed, 0 insertions(+), 0 deletions(-)`. **The commit that
  introduced the entire provider adapter has no diff**, and no future
  change to it could be reviewed line by line in `git diff`, `gh pr
  diff`, or the GitHub UI.
- `rg maxRetries lib/ai/` returned **nothing, exit 1** — ripgrep skips
  binary files silently. That is what most editors and the Grep tool
  use.
- CI's secret scan is `gitleaks detect -s /repo`, git-history mode over
  `git log -p` patches. A binary blob yields no patch content, so **the
  one file that reads `ANTHROPIC_API_KEY` was the one file the repo's
  only credential scanner could not read.**

ADR-0022 D4 argues that a grep over `lib/ai` is a weaker guarantee than
wire assertions. It was right for a reason it did not intend: the grep
could not see the file at all.

**Fixed** (`bd2038a` RED → `ea25d61` GREEN) — one character. The
separator stays a NUL at runtime (a byte that cannot occur in a URL or
an API key, which is why it was chosen); the source is text. Verified
after: `grep`/`rg` both return lines 21 and 86, and a probe edit now
diffs as `2 ++` rather than `Bin`.

The guard asserts the property for **every tracked source file**, not
for that path — and it immediately found a second offender: the findings
document itself, because the reviewers quoted the offending line
verbatim. That is disclosed at the head of the findings file rather than
silently repaired: "verbatim" is that document's whole contract, and an
undisclosed edit to it would be worse than the byte.

---

## D4 — ACCEPTED and FIXED: the senders page threw on every non-empty list (R5/F-1)

`KnownSender` declares `accepted_at: string`; `hc.list_known_senders`
declares `timestamptz`; node-pg parses OID 1184 to a `Date`; `lib/hc/inbox.ts`
cast the rows blind, so the lie survived typecheck; and
`senders/page.tsx:66` called `.slice(0, 10)` on it inside the JSX map —
outside the try/catch, with no `error.tsx` anywhere under `app/`.

So **every non-empty senders list threw at render**. The page worked
only in the zero-senders empty state and the refusal state, which are
exactly the two states the tests covered. SND-03's revoke half was
unreachable through the surface it shipped on — the gap ADR-0019 D15
opened and coverage says 5B closed.

**This is D15's failure mode repeating inside the same slice**: the
mocked test fixed `accepted_at` as a string literal, the live-DB leg
asserted only `toBeTruthy()` (a `Date` is truthy), and no e2e or a11y
leg opens `/[circle]/senders` at all.

**Fixed** (`06cffef` RED → `e0804ee` GREEN) at the **boundary**, not in
the page: `listKnownSenders` normalises to an ISO string where the rows
cross out of node-pg. The page was one consumer; the blind cast lied to
every future one.

**The coverage gap that let it ship is NOT fixed and is dispositioned
separately** — see D9.

---

## D5 — ACCEPTED and FIXED: the configuration-hash pin was a tautology (R2/F-1)

`PROMPT_VERSION` is derived as `` `${PROMPT_VERSION_NAME}+${configurationHash()}` ``,
and the test that claimed to pin it read:

```ts
expect(configurationHash()).toBe(PROMPT_VERSION.split('+')[1]);
```

which compares a value to itself. It could not fail for any edit to any
covered input. ADR-0022 D4's claim — "changing the configuration without
bumping the version reds … §6.10's 'not shippable without a re-run',
made mechanical" — had **no mechanism behind it**, and `ai-provider.md`'s
G9-4 row rested on the same nothing.

**Fixed** (`14831f1` RED → `07fdacd` GREEN): the hash is pinned to the
literal `d6512861eefa1fc4`, and a second assertion pins `PROMPT_VERSION`
to `hc-5b-1+<that literal>` so the pair cannot drift. Edit a schema, a
parameter, a prompt or a §6.3 render rule and both red. The comment
records how to regenerate it, and that regenerating belongs in the same
commit as the ADR recording the G9 re-run.

**The safety consequence was contained and that is worth stating:**
because `loadBands` fails closed and ships with an empty allowlist, a
drifted `prompt_version` could not have enabled bands. What was lost was
the *detection*, not the guard. That is why this is graded a fixed
BLOCKER rather than an emergency.

---

## D6 — ACCEPTED and FIXED: the allowlist admitted a model the adapter cannot use (R2/F-7)

The `claude-api` skill was loaded before this change, per the standing
rule for every session touching `lib/ai/`. It is explicit on both
points:

- **Mid-conversation system messages** are supported on Claude Opus 5,
  Opus 4.8, Fable 5 and Mythos 5 — "**Not available on Claude Sonnet
  5** … Treat it as unsupported and catch the 400."
- **Minimum cacheable prefix**: Claude Opus 5 = **512** tokens; Claude
  Sonnet 5 = **1024**.

`MODEL_ALLOWLIST` admitted `claude-sonnet-5`. `operatorMessages()` emits
`{role:'system'}` **unconditionally**, and `processInterpret` uses it on
the no-facts re-queue path. On Sonnet 5 that is a 400, which
`callProvider` maps to `unavailable`, which burns all three durable
attempts across ~15 minutes and terminalises the arrival. `interpret.ts`'s
512-token assertion is also wrong for it. And `ai-provider.md` told an
operator, in writing, that they could ship it.

**Fixed** (`14831f1` RED → `07fdacd` GREEN). The allowlist is
`['claude-opus-5']`; the ops doc says why. An allowlist must admit only
models that support everything the adapter sends without a capability
branch — widening it again is not a config change, it requires the
adapter to branch first, and the amended test says so.

---

## D7 — ACCEPTED and FIXED: the blind partition had three ways around its fence (R6/F-2, R6/F-3, R7/F-2)

ADR-0022 D1 calls the partitions "a property of the tree, not of
anyone's discipline." Three independent bypasses made that a convention:

1. **The fence guarded a wrapper.** `lib/eval/blind.ts` is two lines
   over `itemsIn('blind')`, and `itemsIn` / `corpusManifest` were
   exported from `lib/eval/corpus`, which nothing fenced.
   `corpusManifest().items` handed any file in the tree all 28 items
   with every label, and lint stayed clean.
2. **Dynamic import walked past it.** ESLint's core
   `no-restricted-imports` registers only `ImportDeclaration`,
   `ExportNamedDeclaration` and `ExportAllDeclaration` — there is no
   `ImportExpression` handler. The tree already leans on this hole
   elsewhere: `scripts/bench/prf07.ts:147` dynamically imports
   `@/lib/storage/artifacts`, whose static form `fenceStoragePlane`
   would red.
3. **The fixture server read the corpus as DATA.** It iterated every
   item with no partition filter, so the gate-stack server could answer
   from BLIND labels complete with their citation geometry. No import
   rule can reach a `readFileSync` of a JSON path.

Nothing in the tree *did* any of these — the breach was of the
guarantee, not of the behaviour. But the whole argument for trusting G9
bands is that we would not have to take that on trust.

**Fixed** (`95ce3b3` RED → `ef67a83` GREEN):

- `lib/eval/manifest.ts` is new and holds the full manifest, §1.7-fenced
  to `scripts/eval/**`, `tests/eval/**` and `lib/eval/**`.
  `lib/eval/corpus` keeps only the development half and **can no longer
  name a partition** — `corpusItem(id)` searches `developmentCorpus()`,
  so `corpusItem('blind-eob-01')` throws instead of returning a scored
  item. `blind.ts` reads the manifest module directly, so the fence now
  guards the thing rather than a wrapper over it.
- A `no-restricted-syntax` rule closes the dynamic form, attached beside
  every existing fence block.
- The fixture server skips any non-development item before it can match
  a label — and the test **drives the real matcher** rather than
  grepping for the line, feeding every blind item its own label values
  (the strongest possible signal) and asserting null each time.

**R6/F-1 is a different question and is NOT fixed here** — fencing a set
correctly does not make the set adequate. See D11.

---
## D8 — OWNER BOUND-AMENDMENT, recommended TAKE: Q-A's grant, and the invariant that closes its class

**The packet's Q-A stands, and R7 improves the argument for it.** The
packet argues the grant as product completeness — a shipped feature
half-built for a slice. R7 is right that this is the weaker case. The
real one is that **the cause is still live**: 5A M5 added a column to a
table carrying a 25-of-28 column-level grant, nothing re-pinned it, and
the only reason anyone knows is that a browser leg went red. Deferring
means shipping a slice knowing the grant list and the table have
drifted — a correctness fact about the permission model, not a copy
nicety.

**One correction to D15 that the owner needs before deciding.** R5/F-3
checked the grant D15 reasons about and found the ADR's list of withheld
columns wrong in two of three entries. Measured live against
`information_schema.column_privileges`:

```
28 columns; 25 granted to authenticated
WITHHELD: auth_detail, current_lease_id, duplicate_of_document_id
```

- `duplicate_of_arrival_id` **does not exist** — the string appears
  exactly once in the repo, in that ADR line.
- `ingest_idempotency_key` is **granted**, not withheld.
- `auth_detail` — the one withholding with a real security rationale,
  spelled out in `20260816010007`'s own header — is **omitted from the
  list entirely**.

The recommendation ("extend by one column, do not replace with a table
grant") is right; its stated reason was evidence-free. An owner reading
D15's list would conclude a table-wide grant costs nothing, and it would
expose the verbatim DMARC/SPF/DKIM verdict blob that
`hc.arrival_auth_detail` exists to gate at VIEW.

**The second half of Q-A — the pgTAP invariant — is ACCEPTED, and
belongs in the same disposition.** But R7 is right that it must be
specified correctly: "every column a member surface selects" is not
mechanically knowable from the DB, because the select lists live in
TypeScript string literals. The invariant that *is* mechanical, and that
would have caught this, is the inverse — assert that the column-grant
set on each member-readable `public` table **equals a checked-in
expected set**, so any future migration adding a column to
`public.arrivals` reds until someone decides whether members may read
it. That is the `hc.log_event_types` / ING-10 exact-set pattern this
project already uses, applied to `information_schema.column_privileges`.

**And R5/F-4 shows the app-side guard is narrower than D15 claims.** The
regression guard is a denylist of one literal over `.select()` strings.
Postgres checks column privilege on **every referenced column**, proven
live:

```
SELECT list            -> REFUSED     WHERE only  -> REFUSED
ORDER BY only          -> REFUSED     auth_detail WHERE -> REFUSED
```

So `.eq(…)`, `.is(…)` and `.order('duplicate_of_document_id')` each
reproduce D15 exactly, and the guard reads none of them. The guard's
*form* is right; its *predicate* is the instance, not the class.

**Disposition: the migration is an OWNER BOUND-AMENDMENT — the bound is
SPENT at 6 of ≤ 6 and no session may take it.** Recommended contents if
the owner grants it, in one migration:

1. `grant select (duplicate_of_document_id) on public.arrivals to authenticated;`
2. the `column_privileges` exact-set invariant above, in pgTAP;
3. **Q-B's `render_bounds_exceeded` reason code** — see D9, which argues
   why it should ride along rather than queue.

Until it lands, DUP-02 and UXA-02 stay as they are, and the coverage
Status column gains the caveat R7/F-10 asks for (D13).

---

## D9 — Q-B: DECLINED as recommended, AMENDED to "take it with Q-A"

The packet recommends queueing `render_bounds_exceeded` to the next
DB-opening slice, priced as "a more accurate operational label for a
full migration evidence leg." **This session disagrees, with R7.**

Two facts change the price. First, Q-A is already opening a migration if
the owner grants D8, so the evidence leg is being paid for anyway, and
adding one `reason_codes` row is an insert into a seed table with a
pgTAP exact-set re-pin — the 2A M6 / 4A M6 pattern, already routine.

Second, and worse than the packet says: the mapping site has a **second,
categorically wrong** mapping in it. R7/F-6 and R3/F-9 both land here.
`render.ts` refuses with four *named* reasons — `page_bound`,
`page_dimensions`, `wall_clock`, `output_size` — and `normalizeExit`
collapses all four to `archive_bounds_exceeded`. So a render that ran
out of **wall clock** is recorded as an archive-bounds breach. That is
not imprecision; it is the operational tier recording a different event
than the one that happened. Given D2, "how often does `page_dimensions`
fire, and on what?" is exactly the question that would have surfaced the
DPI bug, and it is unanswerable from the record.

**Recommended: if the owner grants D8's amendment, `render_bounds_exceeded`
rides in the same migration**, and the app maps the four named reasons
distinctly. If the owner declines the amendment entirely, Q-B queues as
the packet proposes — but the operational tier keeps mislabelling the
most common hostile-input outcome for another slice, and that should be
a decision rather than a default.

---

## D10 — Q-D: DECLINED. The premise is false against the shipped schema

The packet recommends ACCEPT-and-record, on the stated grounds that
"making the state reachable means teaching exhaustion which failure was
last — **DDL on `hc.stage_budgets`**". R7/F-6 checked, and both halves
of the vocabulary are **already shipped and already granted**:

```sql
-- 20260816010009_round7_fixes.sql:63
('extract',   'extracting',   'extract_timeout'),
-- 20260816010001_pipeline_tables.sql:45
('provider_timeout',  'The provider call exceeded the stage wall clock'),
```

`extracting → extract_timeout` is a legal edge in
`hc.arrival_transitions` and `provider_timeout` is a seeded reason code.
The app can reach the state **today, with no DDL at all** —
`grep -rn provider_timeout app/ lib/` returns nothing because the code is
simply never called.

So the recommendation asks the owner to accept a permanent gap on the
grounds that closing it costs a migration and a more complicated
exhaustion contract. It costs neither.

**Disposition: DECLINE the recommendation. Map the wall-clock refusal to
`extract_timeout` / `provider_timeout` as an app-layer fix** — red→green,
inside every bound, no DDL — and leave the exhaustion contract exactly
as it is. The packet is right that the family never sees the difference,
but that is an argument about copy, not about whether the operational
tier should record what happened; this project has consistently ruled
the other way (`scan_infected` was never collapsed with
`scan_unavailable`).

**Not taken in this session** — it is bundled with D9's mapping work,
which is cheapest done once, and D9 turns on the owner's answer to D8.
Recorded here as owed either way.

R4/F-9 additionally shows Q-D's list is incomplete: `provider_timeout`,
`storage_write_failed`, `sweeper_requeue`, the `scanning` state, and
`pipeline_leases.outcome = 'failed'` all likewise have no producer.
ACCEPTED as an accuracy correction to the packet; no code change.

---

## D11 — OWNER DECISION: the G9 corpus cannot pass its own gate (R6/F-1)

**A reviewer asked to judge Q-G answered plainly: it would not sign
bands against this apparatus.** Not because of the limits §1 and §7
state — those are unusually honest — but because of a limit they do not
state.

§1 says the corpus measures our extraction contract "on material of
known content." The content is known to `corpus.json`; **it is not in
the material.** The photo/scanned encoder never renders a glyph:
`paintRows` uses `row.text` only to size a rectangle. Decoded through
the project's own mupdf, `blind-pill-01.jpg` yields **0 characters and 8
gray levels**, while `blind-eob-01.pdf` yields 248 characters. The
labelled string `Elmwood Drug` exists in the manifest and nowhere in the
bytes the model is given.

Of 12 blind items, **4 carry any readable rendition**. The consequence
is arithmetic, before a single request is sent:

| field | stated support / types | readable | max recall | proposed floor |
|---|---|---|---|---|
| document_date | 11 / 3 | 4 / 1 | 0.36 | 0.95 |
| medication_dose | 6 / 3 | 2 / 1 | 0.33 | 0.95 |
| appointment_date | 4 / 3 | **1** / 1 | 0.25 | 0.90 |

**No proposed floor is reachable**, and the §4 minimums
`tests/eval/corpus.test.ts` enforces (≥3 blind items, ≥2 source types
per banded field) are satisfied entirely by items on which extraction is
impossible — effective source-type coverage is **1** for every banded
field.

A gate that cannot be passed is not a conservative gate; it is a gate
that gets argued around at the meeting where it fails.

**This is an OWNER DECISION and this session does not take it**, because
it decides what the corpus *is*, and §7 already prices the three
options. The honest choices are: render text into the raster path;
**or** shrink the blind set to the items that carry a readable rendition
and restate §4's support table and §6's floors against that real number.
This session's recommendation is the second as an immediate correction
(a floor against an honest n=2 is worth more than a floor against a
stated n=6 that is really n=2), with §7 row 1 or row 2 bought
deliberately afterwards.

**Related, and also owner-facing:** R7/F-4 found the BLIND partition
contains **zero email-body items**, and §6.3's email row was truncated in
the as-built record — see D12.

---

## D12 — ACCEPTED, owed, not fixed: §6.3's email row and its consequences (R7/F-4)

TSD §6.3 row 4 reads "Email body | **Text, with the rendered message as
a second source**". `render.ts`'s header docstring reproduces the table
with the second half deleted, and the code matches the altered row:
`pages: []`, text only. The corpus spec propagated the same truncation;
the corpus manifest preserved the full clause.

Three consequences, none previously recorded:

1. `validateFacts` has an explicit "pageCount 0 means text-only: page 1
   is the only legal page" branch and still *requires* a bbox. So every
   email-body fact is stored with `{page:1, bbox:[…]}` **against a
   rendering that was never produced and never promoted** — §6.4's crop
   is unsatisfiable for that whole source class, and PRD §6.4's
   high-risk "crop on screen before approve activates" cannot be met for
   it in slice 6.
2. The corpus's `dev-email-01` labels carry line-fraction bboxes against
   that same absent rendering.
3. The BLIND partition has **no email item at all**, so no banded field
   has any email evidence.

**Email is the channel the forwarding address exists to serve.** This is
the finding R7 nominates as the most valuable it produced: a deliverable
in neither the delivered set nor the named-exclusion set.

**ACCEPTED. Not fixed here**, because the honest fix is a §6.3 decision
(render the message as a second source, or amend the TSD row) plus a
corpus spec row — and it composes with D11, which the owner must answer
first. RND-01's coverage cell must stop reading "the table row by row"
until it is settled; see D13.

---
## D13 — OWNER DECISION: `mupdf` is AGPL-3.0-or-later, and no governance document says so (R7/F-1)

```
$ node -e "console.log(require('./node_modules/mupdf/package.json').license)"
AGPL-3.0-or-later
```

Across `docs/review/slice-5-plan.md`, `docs/adr/0022-*.md`,
`docs/review/round-16-packet.md` and `docs/ops/ai-provider.md` there are
20 mentions of `mupdf` and **zero** mentions of its licence. Q3 approved
it on capability grounds — "the §6.3 rasterizer … in one zero-native-dep
package" — and priced the alternatives (`pdfium` bindings, `pdfjs-dist`
+ canvas) on packaging and platform. Both alternatives are **permissive**
(BSD-3, Apache-2.0), so the licence is a *differentiator* between the
options the plan compared, and it was priced out of the comparison
silently.

`mupdf` is imported directly by `lib/pipeline/render.ts`, server-side, in
the request path of a hosted service. AGPL §13's network clause is the
term that matters for SaaS, and Artifex dual-licenses MuPDF precisely
because of it.

**This session does not decide it and cannot.** It is an owner call with
cost and IP consequences: offer Corresponding Source, buy a commercial
licence from Artifex, or migrate the rasterizer to a permissive
alternative — and it gets harder to reverse with every slice built on
`lib/pipeline/render.ts`.

**What this session records:** the *governance* defect stands
independently of the legal answer. ADR-0022 says "exactly the two
Q3-approved runtime packages" and a future reader concludes the
dependency posture is fully governed. It is not. **Recommended: the
dependency bound gains a licence column, and no future dependency is
argued without it.** That is a plan-format change, not a code change,
and it is cheap.

---

## D14 — ACCEPTED as a product finding for the OWNER: §4.5's cancel window (R8/F-2, R8/F-3)

Packet Q-I(2) asked the review to decide whether §4.5's promise survives
5B "even though no test currently fails." R8's answer is that it does
not, and this session agrees.

**The mechanism** (R8/F-2, verified here): `fireWorker` is called for
scan, gate and interpret — and **never for extract**.

```
route.ts:153  fireWorker(origin, 'scan',      key)
route.ts:197  fireWorker(origin, 'gate',      key)
route.ts:399  fireWorker(origin, 'interpret', key)
```

`gate → extract` is the only hand-off in the pipeline with no eager
fire, and no trigger writes a `pipeline_outbox` row on `scanned →
extracting`. Extraction therefore begins **only on the relay's
once-a-minute cron tick**. ADR-0022 D10 says "the seam is consumed"; the
gate leg of it is still open, and nothing records that.

**The window** that leaves:

| segment | width |
|---|---|
| `extracting`, waiting for the relay | **0–60 s, mean 30 s** |
| `extracting`, extract running | 1.4–6.9 s (PRF-07, D12's table) |
| `extracted` → `interpreting` | sub-second (fired immediately) |

**Median ≈ 35 s**, most of it cron dead time.

**Why that is a product finding and not a latency note.** The Care Inbox
is a plain server component with no revalidation — a member watching it
sees a stale snapshot, and the button they can see may already be dead.
There is no post-`proposals_ready` equivalent anywhere in `app/(app)/`.
And PRD §4.8 ships eight emails, exactly one of which concerns an
arrival: **"Ready to review," sent when the arrival reaches `Needs you`
— the precise instant cancel stops being offered.** For the forwarding
channel, which is the product's headline loop, a family is told a
document arrived only after they can no longer stop it being read. PRD
§4.2.2 lists cancel as one of three things a family can do at
**Reading**; nothing tells them Reading is happening.

The amended e2e leg makes the point without meaning to: it has to
upload its own file and hand-drive `store`, `scan` and `gate` to make
the affordance exist at all.

**Disposition: ACCEPTED, escalated to the owner, not fixed here.** The
fix is a product decision, not a bug fix — an arrival-received signal, a
deliberate hold before `extract` claims, or an amendment to §4.2.2 and
§4.5 saying cancel is a race the family is not expected to win. **And
the owner should decide it BEFORE anyone adds the missing eager fire**,
which is otherwise an obvious latency win that would silently collapse
the window to seconds with no test failing.

**R8/F-1 rides with it and IS owed as a fix:** the fourth Q7 seam row
was never amended. `tests/routes/worker-stage.test.ts:297` still pins
`expect(fetchMock).not.toHaveBeenCalled(); // no consumer to fire (Q7)`
under a title reading "nothing consumes yet", and `route.ts:236` carries
the matching stale comment. Both are false at HEAD. Left for the same
change that answers the product question, so the comment and the
behaviour land together rather than the comment being corrected to
describe something the owner may be about to change.

---

## D15 — Q-C, Q-E, Q-F, Q-G, Q-H, Q-I: ratified, with the amendments named

- **Q-C** (`hc.extractions_for`) — **RATIFIED.** The behaviour is
  correct: a re-queued interpret re-normalises and reads the same source
  material, and the operator note says the facts were absent. One
  amendment to the record (R7): the cost is framed as "more expensive
  for image-only sources", but for a re-queued interpret it also means a
  **second provider dispatch of full-resolution page images** for a
  document already read once, on a path that fires without a person
  asking. Priced honestly, the queue item ranks higher.
- **Q-E** (`source_extraction_ids`) — **RATIFIED unreservedly.** The one
  deferral in the set that is a genuine design choice: the consumer does
  not exist, the shape depends on what the review screen needs, and
  guessing now mints a column that gets rebuilt.
- **Q-F** (the fixture server cannot prove vision) — **RATIFIED, and the
  condition R7 attached is now MET.** The reasoning was always right
  (making the server "recognise" images would be Q5's rejected second
  fixture world in a new costume); the implementation was not, because
  the server read all 28 items. D7 fixed that, so Q-F is now true as
  stated.
- **Q-G** (the corpus states its limits) — **RATIFIED as to the spec's
  honesty; the substantive answer is D11.** Ratifying §1 and §7 as
  written is right. It does not resolve that §1 describes material the
  corpus does not contain.
- **Q-H** (the TypeScript runner) — **RATIFIED, figure corrected.** The
  reasoning is the strongest in the packet: the reserve is one slot held
  for review dispositions and spending it before the review would
  pre-empt exactly this round. Two corrections (R7/F-12): it is **126
  lines across two files**, not "~40 lines" in one, and the unnamed half
  is `scripts/ts-resolve-hook.mjs`, a `module.register` resolver hook —
  the component most likely to break on a Node upgrade. **The
  dev-dependency reserve remains UNSPENT**: nothing in these
  dispositions needed it.
- **Q-I(1)** — **RATIFIED WITH AMENDMENT**; the missed fourth row is
  D14's R8/F-1.
- **Q-I(2)** — **the amendment RATIFIED, the product finding FILED** —
  D14. R8/F-4's dropped circle-wide count is accepted as a real but
  harmless trade: `hc.cancel_arrival` updates `where id = p_arrival`, so
  collateral cancellation is structurally impossible.
- **Q-I(3)** — **RATIFIED; DUP-02's app half may stay green.** The
  suspension is correctly scoped (one dedicated client, one statement,
  reset and closed, no pooling) and the stage-2 predicate reads none of
  what `replica` silences. Two corrections: the precedent argument
  should be narrowed, because every prior use is teardown or an
  unguarded table and this is the first guarded record-table *setup*
  (R8/F-6); and "cannot file the honest way until slice 6" is
  overstated, since §4.9 wants a `proposal_commits` row, not a surface
  (R8/F-6). Decisive for the verdict: **pgTAP 055 makes the same
  concession**, filing its canonical document unclaimed and escaping the
  trigger only because the file ends in `rollback;` (R8/F-9). Holding
  the app half at `review` would not close a gap the pgTAP half also
  has.

---

## D16 — S-1: an evidence-block correction this session owes on its own account

While checking the test-count delta for D2, this session measured the
true baseline in a clean worktree at `6e615fe`:

```
Test Files  62 passed (62)
     Tests  632 passed (632)
```

The packet's one-SHA block records vitest as **631/631**. The correct
figure is **632**. It is one test, and it changes nothing about the
substance — but the one-SHA block is the mechanism the whole review
cadence trusts, and this session is not entitled to a lighter standard
than the one it applied to the build session. It joins R7/F-8 (two legs
sourced from a run three commits behind the declared evidence head) and
R7/F-9 (the ledger's last row naming ADR-0022, which did not move after
that head, and omitting `docs/coverage.md`, which did) as evidence-block
accuracy items. All three are **ACCEPTED**; none is a defect in the
tree.

Arithmetic at this ADR's head: **632 baseline + 25 added = 657**.

---
## D17 — every finding, dispositioned

**All 113 findings appear below.** Verdicts: **FIXED** (red→green on this
branch) · **OWED** (accepted, argued, scheduled, not fixed here) ·
**OWNER** (escalated — a decision this session may not take) ·
**ACCEPTED-NOTE** (accepted as a record correction; no code change) ·
**DECLINED** (with the argument) · **NOTED** (a verified positive or an
observation needing nothing).

Severity is the **reviewer's**. Where this session grades differently it
says so in the argument.

### R1 — the band loader and the risk catalogue

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | MAJOR | **FIXED** | `draftPayloads` now takes the `BandMode` and calls `effectiveRiskClass`; `processInterpret` loads bands exactly as `processExtract` does. The `riskClassFor` import is gone from the route entirely, so the catalogue is reachable from the worker ONLY through the band mode — lint proved the bypass was the sole user. `0ae61f3` RED → `681e839` GREEN. |
| F-2 | MAJOR | **FIXED** | `containsInstruction` collapses any run of non-alphanumerics to one space before searching, so the phrase matches however it is written — `"do not"`, `"do-not"`, `"do  not"`, or split across a line break. Same commits as F-1. |
| F-3 | MINOR | **FIXED** | The reviewer's analysis was exactly right: the trailing boundary test was doing no work. Dropping it catches `Stopping`/`Stopped`/`Starting`/`Holding`/`Discontinued` while the LEADING boundary still excludes `restarted` and `household` — both negatives are asserted in the same test so a future widening cannot revive them. Same commits as F-1. |
| F-4 | MINOR | **OWED** | `typeof null === 'object'`, so `fields: null` passes the shape guard and throws at the field loop — the one malformed shape that does not fail closed, and it lands in an unacked-redelivery poison loop. One `!artifact.fields ||`. Reachability requires a signed artifact, hence not urgent. |
| F-5 | MINOR | **ACCEPTED-NOTE** | `confidenceBand` has no consumer, no test, and its docblock's "slice 5 records the answer" is false — nothing records a band. ADR-0022's docblock is corrected rather than the function deleted: slice 6 is its consumer and the `null`-means-two-things ambiguity should be resolved *before* that screen is written, not after. |
| F-6 | MINOR | **OWED** | `HC_BANDS_ARTIFACT` appears in exactly one file and in no ops row, so an owner can complete every G9 checklist step and still run all-high forever, with no log line reporting the band mode. Add the row and a mode log. |
| F-7 | MINOR | **OWED** | `artifact_partial` has five rejection conditions and one test. All five behave correctly (verified by the reviewer), so this is coverage, not correctness — but in the file the packet calls "must not be wrong", an untested branch is one a refactor can invert. |
| F-8 | OBS | **NOTED** | `readonly` is erased at runtime; `Object.freeze` is a one-word improvement. No constructible exploit — mutating it requires code execution inside the bundle, at which point `loadBands` can be called with an explicit allowlist anyway. |
| F-9 | OBS | **NOTED** | Ordering is correct and deliberate (digest before parse). The missing size bound is unreachable while the allowlist is empty; worth a `statSync` when G9 opens. |
| F-10 | OBS | **NOTED** | `precision`/`recall` are declared and unvalidated. The corpus spec already says nothing reads them until the owner signs, so it is a stated gap. Composes with D11. |
| F-11 | OBS | **NOTED** | Prototype-key lookup returns `'low'` for `constructor`. Not constructible — field names are gated by `isKnownField` and the function has no consumers. `Object.create(null)` closes it for free. |

### R2 — the provider adapter

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | **BLOCKER** | **FIXED** | D5. The pin compared a value to itself; now a literal. |
| F-2 | MAJOR | **OWED** | The timeout test's deadline (1.5 s) is under `FINALIZE_RESERVE_MS` (20 s), so `providerTimeoutMs` returns 0 and the request is never dispatched — the 1 ms runtime proves it. The `HC-FIXTURE-HANG` branch is dead code at the gate, and §1.9's "our timeout cuts, not the platform's" is unproven. Fix the fixture's deadline. |
| F-3 | MAJOR | **OWED** | The configuration hash omits the trailing user instruction, the delimiter builders, and `asJPEG(90)` + the codec choice — so the *pixels the model sees* can change with an identical hash. Now that D5 made the hash load-bearing, widening its inputs is the natural follow-on. |
| F-4 | MAJOR | **OWED** | `scripts/eval/run.ts` re-implements block assembly instead of calling the shared builder, so bands are signed from a third construction site with no wire assertions. Composes with R3/F-12 and R6/F-6; all three say the eval and the worker are only equal by inspection. |
| F-5 | MAJOR | **OWED** | Confirmed against the `claude-api` skill: the SDK's default `maxRetries: 2` covers 408/409/429/5xx and honours `retry-after`, and `maxRetries: 0` discards it. The ADR's argument is sound for *timeout* retries and never distinguishes 429; a transient rate-limit burns three durable attempts over 900 s, and a permanent 400 is retried three times and then labelled "budget exhausted". Needs a status-aware arm, not a retry loop — the lease stays the only counter. |
| F-6 | MAJOR | **OWED** | `usage` is carried and never read: no log, no column, no metric. §6.6's "checked, not assumed" is implemented as a struct field that is garbage-collected. `ai-provider.md`'s SMOKE-6 already defers the real check, so the ADR and the coverage cell overstate what exists. |
| F-7 | MAJOR | **FIXED** | D6. |
| F-8 | MAJOR | **OWED** | `maxRenderedBytes` is 64 MB; the API limit is **32 MB per request** and inline base64 inflates by 4/3, so renders between ~24 MB and 64 MB are accepted by our ceiling and rejected by the provider — then mislabelled "budget exhausted" per F-5. The Files API decision is defensible; the size budget it requires was never set. |
| F-9 | MAJOR | **OWED** | `model_context_window_exceeded` is in the SDK's `StopReason` union and unhandled, so it falls through to "no text content" → `provider_error`. At 200 pages × ~4784 tokens the request is near the window, so the state is reachable by a document PRD §13.3 permits. |
| F-10 | MAJOR | **FIXED** | The client pins `logLevel: 'warn'`, so the environment cannot raise it. `b4bfe65` RED → `dd86a39` GREEN. |
| F-11 | MAJOR | **FIXED** | `assertProviderEgress()` runs before every dispatch and refuses a real credential aimed at an overridden base URL. Keyed on whether the key IS a credential (`sk-ant-`), not on a fixture allowlist — the first draft used the gate literal and broke 21 tests that use a different one, which is the argument. Same commits. |
| F-12 | MINOR | **OWED** | Of four "absence" assertions, one (`server-side-fallback`) is vacuous — it is a *header* value and the fixture records no headers — and all four run only against the extract path. |
| F-13 | MINOR | **ACCEPTED-NOTE** | The fixture server validates nothing, so the wire tests prove absence-by-substring and never acceptance. `ai-provider.md` SMOKE-3 already defers schema acceptance to a live smoke test, so the gap is acknowledged; D4's "the wire is the contract" framing overstates what the gate can show. |
| F-14 | MINOR | **OWED** | `overloaded_error` is HTTP **529**, not the 503 the fixture returns. Cosmetic today only because F-5 collapses all statuses; load-bearing the moment F-5 is fixed, so fix them together. |
| F-15 | MINOR | **ACCEPTED-NOTE** | `config.ts`'s stated reason for `MAX_TOKENS = 24_000` is backwards: the SDK's threshold is ~21,333 and the guard is *bypassed* by supplying an explicit timeout, not satisfied. The value may stay; the comment must stop claiming the opposite of the SDK's behaviour. |
| F-16 | OBS | **NOTED** | One cache test reads the previous test's request. Fails loudly rather than passing wrongly if order changes; `server.reset()` exists and is unused. |
| F-17 | OBS | **NOTED** | Honest and correctly disclosed. Records which validators ride on the untested vision path — useful input to D11. |
| F-18 | OBS | **NOTED** | The key is a `Map` key for the process lifetime. No leak path constructible; hashing it is free. |
| F-19 | **BLOCKER** | **FIXED** | D3. |
| F-20 | OBS | **NOTED** | Confirms the keyless posture is sound and narrows F-19's scanner claim to gitleaks specifically. |

### R3 — the render pipeline

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | **BLOCKER** | **FIXED** | D2. |
| F-2 | **BLOCKER** | **FIXED** | D2. |
| F-3 | MAJOR | **OWED** | Attempt staging leaks on every non-graceful exit — there is no `try/finally` and no sweeper for `render/attempt/**`. The prefix is keyed by a lease id that exists only in the dead invocation's stack, so the orphan is unreachable by construction. Up to 64 MB of a family's rendered medical pages, with no expiry and outside any future DEL-01 cascade. Same defect as R4/F-4. |
| F-4 | MAJOR | **OWED** | `maxRenderedBytes` counts encoded output while the WASM heap churns ~20 MB per pixmap and nothing is `destroy()`ed — measured 3.5 MB counted against a 463 MB process peak. "The memory bound with a name" bounds the wrong quantity. |
| F-5 | MAJOR | **OWED** | `wall_clock` is sampled between pages, and `toPixmap` exposes no interrupt — so a single pathological page runs unbounded and the final page is never checked. The test passes `maxWallClockMs: 0`, which cannot distinguish a deadline from a sample. |
| F-6 | MAJOR | **OWED** | **Every corpus item is single-page**, the text layer is concatenated with no page markers, and image blocks go on the wire unlabelled — so `citation.page` is always 1, the range check is trivially satisfied, and the image-order↔page-number correspondence is exercised by nothing. One coordinate over from the orientation door that *was* closed. Composes with D11. |
| F-7 | MAJOR | **OWED** | The harness discards the citation before scoring — `Prediction` is `{field, value}` only — so **nothing anywhere measures whether a bbox lands on its value**. A model with perfect values and uniformly wrong boxes scores 1.00. Composes with D11: the bands would be signed on a run in which citation correctness was never measured. |
| F-8 | MINOR | **OWED** | `promotedPageKey`'s default ext is `png` while every photo/scan/pill-bottle promotes as `.jpg`, and the contract test calls exactly that default. The exported builder encodes the wrong answer for the majority of arrivals; slice 6 would hit it. |
| F-9 | MINOR | **FIXED** | Corrected at sign-off: this row was written before the owner's ruling and still read OWED. Q-B rode with Q-A as D9 recommended, so `normalizeExit` now maps each ceiling to its own outcome — `wall_clock` to `extract_timeout`/`provider_timeout`, the other three to M7's `render_bounds_exceeded`, and `archive_bounds_exceeded` goes back to naming the archive case 4A seeded it for. `f05d101` RED → `f62305c` GREEN (D20). |
| F-10 | OBS | **NOTED** | **Verified positive.** The orientation door is exclusive in production code; `new mupdf.Image` appears only in the spike; 8/8 legs pass at HEAD and leg 8 reproduces 36.3 vs 220.4. Two honest limits named (the control proves mupdf, not `render.ts`; leg 6's ceiling check shares `PT_PER_PX`) — the second is exactly what hid D2. |
| F-11 | OBS | **NOTED** | **Verified positive.** `serverExternalPackages` is correct, the pin would red if removed, and no other dependency needs it. |
| F-12 | MINOR | **OWED** | The harness normalises with the *declared* mime while the worker sniffs. Agrees on today's 28 fixtures; latent. With F-4 and R6/F-6. |
| F-13 | OBS | **NOTED** | `cropRect` has no production consumer (slice 6 is it), and the interpret re-queue re-renders a whole document to recover text it discards the pages of. The second half is a real cost on a sweeper-rescued path — folded into Q-C's re-pricing (D15). |

### R4 — the worker state machine

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | **BLOCKER** | **FIXED** | D1. |
| F-2 | MAJOR | **FIXED** | The owner granted the fourth amendment item (D21). **M8** adds `interpret / interpreting → extract_failed` — the terminal `hc.stage_budgets` already names as interpret's `exhaust_state`, so no enum value, no label and no reason code moved, and the app needed no change at all: it had always made this call. `9e97117` RED → `ef48079` GREEN. |
| F-3 | MAJOR | **FIXED** | The conversion writes `domain`, `risk_class` (through the band mode) and a `task` block, so all three §4.8 outcomes are reachable. A conflict with no domain is DROPPED rather than drafted un-approvable — M2's context carries no domain, so the parent cannot supply it. `bafa5af` RED → `df45fca` GREEN. |
| F-4 | MAJOR | **OWED** | Same leak as R3/F-3; fix once. |
| F-5 | MAJOR | **FIXED** | `archivePipelineWork` strips `facts` before archiving — one choke point, so no ack path can forget it. `lookupLineage` reads only `channel`/`circle_id`, both retained and asserted. `hc_pipeline` already held UPDATE on the pgmq tables, so no DDL. `3fcb871` RED → `f6cbc1f` GREEN. |
| F-6 | MAJOR | **OWED** | `promoteRenderedPages` runs *after* `finalizeExtraction` returned `advanced` and is non-atomic with no repair path: a partial promotion leaves an `extracted` arrival whose citations reference pages that have no artifact, permanently. |
| F-7 | MAJOR | **OWED** | The read visibility timeout (120 s) is shorter than the extract stage (up to 300 s), so mid-flight redelivery is the *normal* case — and the second reader archives the in-flight message unconditionally, destroying pgmq's redelivery guarantee for that work. Claim-before-work means no double dispatch; the cost is the queue silently doing no work. |
| F-8 | MINOR | **ACCEPTED-NOTE** | `PER_MESSAGE_RESERVE_MS` (20 s) is sized for a finalize where the worst-case message is 300 s, so the budget cannot keep an invocation inside `maxDuration`. Recovery is correct; the comment overstates the arithmetic. |
| F-9 | MINOR | **ACCEPTED-NOTE** | Q-D's unreachable list is short by five — see D10. |
| F-10 | MINOR | **OWED** | A stage-2 duplicate always yields a silent `invalid_state` at interpret, which §4.2 says means "raise a defect signal". `processGate` warns; `processInterpret` returns it silently. Make it a warn, or absorb it explicitly. |
| F-11 | MINOR | **OWED** | `msg.facts` is trusted with no runtime validation: a non-array skips *both* the artifact re-read and the operator note, producing exactly the thin-answer-that-looks-normal D6 rules out. Plus an unbounded hand-off over an unindexed archive scan. |
| F-12 | MINOR | **OWED** | A `profile_fact` with `field: null` is drafted and raises `23502` at approval — a raw Postgres error at the moment a person clicks approve. Guard where `domain` is already guarded. |
| F-13 | OBS | **NOTED** | **Verified positive.** `releaseDeferredWork` holds on all four axes; the threshold is *derived* from `READ_VT_SECONDS` so it cannot drift. One cosmetic gap named (`firedStages` never adds `'interpret'`, harmless because the segment is cosmetic). |
| F-14 | OBS | **NOTED** | **Verified positive** on the prefix namespaces. The `if (error) return null` conflation is a design observation worth a note. |
| F-15 | OBS | **OWED** | `processInterpret` discards `answer.dropped`. It mattered more than it looked: under D1's defect *every* conflict was dropped and the counter that would have said so was never printed. |

### R5 — the member surfaces

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | **BLOCKER** | **FIXED** | D4. |
| F-2 | MAJOR | **OWED** | Three `{ data }` destructures still drop `error`. B6's fix removed one *input* to D15 and left the amplifier: a refused query is still indistinguishable from an empty one. Reachable today with no code change — a non-UUID circle segment returns 200 with a blank Care Inbox; a DB blip shows a forty-item family its first-run empty state. |
| F-3 | MAJOR | **ACCEPTED-NOTE** | D15's "the grant is deliberate" names three withheld columns and two are wrong. Corrected in D8, because that list is what an owner would reason from when deciding the amendment. |
| F-4 | MAJOR | **FIXED** | The guard is now an ALLOWLIST over every clause — select, eq, is, in, order — checked against the same exact set pgTAP 057 pins from the DB side, so the two cannot drift without one going red. `7e83761` RED → `7c86c38` GREEN. |
| F-5 | MAJOR | **FIXED** | The line now states the contract M5 implements: "the document type and date, and at least one detail read from this document". Fixed alongside Q-A's completion, because a title beside an over-claim is worse than an over-claim alone. `7e83761` RED → `7c86c38` GREEN. |
| F-6 | MINOR | **OWED** | `/[circle]/senders` has **no browser coverage at all**, which is why D4's render throw shipped. D11's a11y argument for keeping it out of nav protects a surface never measured. Add both routes to the audit list and pin the list. |
| F-7 | MINOR | **OWED** | Every `?e=` marker these submit routes emit is written and never read — no page declares `searchParams`. A revoke refused for *authorization* renders as an emptied list. Authorization itself verified sound in-definer. |
| F-8 | MINOR | **OWED** | The only link to `/senders` sits inside the non-empty branch, so whatever empties `parents` also removes the path to the surface governing who may write. Move it to the shared branch. |
| F-9 | OBS | **ACCEPTED-NOTE** | Postgres says `permission denied for table arrivals`, not `for column`. The ADR and two comments quote a string Postgres does not emit — an on-call engineer would grep for the wrong thing. |
| F-10 | OBS | **NOTED** | The cancel-leg amendment is honest; one circle-wide assertion traded for a stronger binding one. See D15's Q-I(2) and R8/F-4. |
| F-11 | OBS | **NOTED** | **Verified positive**, line by line: the definer swap dropped no check and added two. |
| F-12 | OBS | **NOTED** | **Verified positive** by exhaustive enumeration — the ADR's claim holds. Two durability caveats folded into D8. |
| F-13 | OBS | **OWED** | Dead `documents` mock scaffolding remains from the RED draft. Worth removing: it would silently serve fixtures to the one query shape most likely to reintroduce D15. |

### R6 — the corpus, the scorer, the harness

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | **BLOCKER** | **OWNER** | D11. |
| F-2 | **BLOCKER** | **FIXED** | D7. |
| F-3 | MAJOR | **FIXED** | D7. |
| F-4 | MAJOR | **OWED** | The harness emits `{precision, recall, support, tp, fp, fn}`; the loader requires `high`/`medium` per field. The signed digest would fail closed as `artifact_partial` **forever**, indistinguishable from the shipping default at the call site — and no one has written down how a measured number becomes a threshold. Must be settled with D11 before any real run. |
| F-5 | MAJOR | **FIXED** | `node scripts/fixtures/g9-build.mjs --check` is a CI step. `7e83761`. |
| F-6 | MAJOR | **FIXED** | Corrected at sign-off: this row was written before the closing increment and still read OWED. `scripts/eval/predict.ts` calls the WORKER's own `validateFacts` rather than reimplementing it, `--collect` re-normalises each item to recover the page count it needs, and the refusals are COUNTED AND PRINTED rather than swallowed — a fact cited onto a page the rendering does not have is a §10.4 signal, not a rounding error. The bias this removes ran ONE way and it was the unsafe one: an owner would have signed bands better than the product they describe. `7677c0b` RED → `da68887` GREEN (D20). |
| F-7 | MAJOR | **FIXED** | D7. |
| F-8 | MINOR | **ACCEPTED-NOTE** | Exact string equality after `lower(btrim())`. Defensible given the prompt's verbatim instruction, and the concrete failure set (dates in prose, a dropped currency symbol, `coverage_determination` free text) is real. Worth stating in the spec so a low number is not misread as a reading failure — and so no one "fixes" it by loosening the matcher after seeing the result. |
| F-9 | MINOR | **ACCEPTED-NOTE** | The no-global-number property is real in the emitted object and one line of arithmetic away in the artifact. D12's claim should read "reports no global number". |
| F-10 | MINOR | **OWED** | Expected labels collapse last-wins, predictions first-wins, and `support` counts once per item — so the first multi-valued item silently halves claimed support and scores the wrong one. §7 prices exactly that growth. |
| F-11 | MINOR | **OWED** | `absent_fields` is never read; non-banded fields get artifact rows with `precision: 0` that no band covers. Harms what a person reads at sign-off. |
| F-12 | OBS | **ACCEPTED-NOTE** | "THE ONLY REAL-KEY PATH IN THE PROJECT" is literally false — `lib/ai/client.ts` reads the key in production. The surrounding prose means "the only path ever run against a real credential today"; the sentence should say that. |
| F-13 | OBS | **NOTED** | **Verified positive** by execution: `--dry-run` cannot send; the credential check is strictly after the return. One gap named — the manifest records no `ANTHROPIC_BASE_URL`, one line. |
| F-14 | OBS | **NOTED** | **Verified positive.** The reviewer tried to defeat the manifest-completeness walk and could not. |
| F-15 | OBS | **NOTED** | No request-shape divergence attributable to `ts-run`; two honest gaps named. The real "eval ≠ worker" defect is F-6. |
| F-16 | MINOR | **OWED** | Re-collecting a batch throws `EEXIST` *after* the API round-trip, and this is the one command that costs money to produce. Needs an idempotent read. |
| F-17 | OBS | **OWED** | The PDF writer truncates non-Latin-1 silently; no current label is affected. A `throw` on any code point > 0xFF makes the next one a build failure instead of a silent mislabel. |

### R7 — governance conformance

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | **BLOCKER** | **OWNER** | D13. |
| F-2 | **BLOCKER** | **FIXED** | D7. |
| F-3 | MAJOR | **ACCEPTED-NOTE** | Spike leg 5 contains no `assert` and passes unconditionally — and it is the leg whose plan criterion ("refuses cleanly") is **not met**: mupdf repairs. D2 discloses the behaviour honestly and scores it a pass; the count "8/8" is what the Q3 reserve-not-consumed conclusion rests on. Re-score it 7/8 with leg 5 FALSIFIED, and record "malformed input is repaired and processed" as the hostile-input posture it is. |
| F-4 | MAJOR | **OWED/OWNER** | D12. |
| F-5 | MAJOR | **OWED** | Same as R2/F-6; the coverage cell and D4 both overstate. |
| F-6 | MAJOR | **DECLINED (the packet's answer), ACCEPTED (the finding)** | D10. |
| F-7 | MAJOR | **FIXED** | D3. |
| F-8 | MINOR | **ACCEPTED-NOTE** | Two CI-sourced legs in the one-SHA block come from a run three commits behind the declared evidence head, and a green run at the actual PR head goes uncited. Harmless here; the precedent is not. With D16. |
| F-9 | MINOR | **ACCEPTED-NOTE** | The ledger's last row names ADR-0022 (which did not move after the evidence head) and omits `docs/coverage.md` (which did, substantively). With D16. |
| F-10 | MINOR | **ACCEPTED** | DUP-02's Status column reads a bare `green` while its evidence cell says "partially met". The same table gets this right twice (EVA-01, PRF-07). Fixed in the coverage flip — D18. |
| F-11 | MINOR | **FIXED** (the title) / **ACCEPTED** (the count) | The gate leg is retitled to what it exercises. The "24/24 UNCHANGED" framing stands corrected in the record rather than in code: the gate is now **29/29 at the closing head** with the DUP-02 leg deliberately amended, and D23 states that plainly instead of asserting an unchanged count. `36a4735`. |
| F-12 | OBS | **ACCEPTED-NOTE** | Q-H's "~40 lines" is 126 across two files — D15. |
| F-13 | OBS | **ACCEPTED-NOTE** | The *direct* dependency bound is honoured exactly (2 runtime, 0 dev, no overrides). Eight production packages arrive transitively, two of them webhook-signature libraries this product does not use. Worth naming because "two runtime deps" is the sentence that will be remembered. |
| F-14 | OBS | **ACCEPTED-NOTE** | ARC validation and the D11 hop-binding tightening are in the plan's named-exclusion list and not in the packet's. Both have live checklist homes; the packet's completeness claim is not quite true. |

### R8 — packet Q-I

| # | Sev | Verdict | Argument |
|---|---|---|---|
| F-1 | MAJOR | **OWED** | D14 — the fourth seam row, deliberately held with the product decision. |
| F-2 | MAJOR | **ACCEPTED** | D14 — verified here: `fireWorker` fires for scan, gate, interpret and never extract. |
| F-3 | MAJOR | **OWNER** | D14 — the product finding. |
| F-4 | MINOR | **ACCEPTED-NOTE** | The dropped circle-wide count is a real trade and a harmless one: `hc.cancel_arrival` updates a single id, so collateral cancellation is structurally impossible. Restoring it costs nothing and is worth doing with D14. |
| F-5 | MINOR | **ACCEPTED-NOTE** | "An UNKNOWN stage is still deferred" is unreachable from any in-branch producer — a forward-compat guard, not a live one. The comment should say so. |
| F-6 | MINOR | **ACCEPTED-NOTE** | The precedent argument is narrowed (every prior use is teardown or an unguarded table; this is the first guarded record-table *setup*), and "cannot file honestly until slice 6" is overstated — §4.9 wants a `proposal_commits` row, not a surface. |
| F-7 | OBS | **NOTED** | `replica` also silences both search triggers and all FK enforcement. The predicate reads none of it; worth one sentence in the leg's comment, which names only the claim trigger. |
| F-8 | MINOR | **FIXED** | Retitled to "suspected, CITED by name, and `different` resumes". `same_thing` stays covered by `tests/routes/inbox.test.ts` (surface) and pgTAP 055/056 (transition), and the leg now says so. `36a4735`. |
| F-9 | OBS | **NOTED** | Decisive for Q-I(3): pgTAP 055 files its canonical document unclaimed too, escaping the trigger by `rollback`. The gap is not specific to the gate leg. |
| F-10 | OBS | **OWED** | The live idempotence assertion is a global claim over a shared queue; it holds today by file ordering and teardown. Scope it to the circle under test. |

---
## D18 — what the owner is being asked to decide

Five items are escalated. None can be taken by a session, and each
blocks something.

| # | Decision | Blocks | This session's recommendation |
|---|---|---|---|
| 1 | **The migration bound.** SPENT at 6 of ≤ 6. Q-A's grant, the `column_privileges` invariant, and (if granted) Q-B's reason code all need one amendment. | DUP-02/UXA-02 completing; the grant-drift class staying open; the four refusal reasons staying collapsed | **TAKE it**, for the cause rather than the copy: the grant list and the table have demonstrably drifted, and only a browser leg caught it. Put all three in one migration. |
| 2 | **`mupdf` is AGPL-3.0-or-later** and unrecorded. | Nothing in the tree; everything about the product's distribution posture | **Decide before slice 6 builds more on `render.ts`.** Independently: the dependency bound gains a licence column. |
| 3 | **The G9 corpus cannot pass its own gate.** 8 of 12 blind items carry no rendition of their labels; no proposed floor is arithmetically reachable. | The G9 gate; signing any band | **Restate §4/§6 against the readable set now** (an honest n=2 beats a stated n=6 that is really n=2), then buy §7 row 1 or row 2 deliberately. |
| 4 | **§4.5's cancel window is ~35 s** on a non-refreshing surface, and the only arrival email fires when it closes. | Nothing today (nothing is production-activated) | **Rule on it before anyone adds the missing `gate → extract` eager fire**, which is an obvious latency win that would silently collapse the window further. |
| 5 | **§6.3's email row** was truncated in the as-built record; email facts cite a rendering that is never produced, and the blind partition has no email item. | Slice 6's crop for email arrivals; G9 covering the primary intake channel | **Settle the row** (render the message as a second source, or amend the TSD) with decision 3, since they compose. |

---

## D19 — `docs/coverage.md`, re-referenced: no row flips on a disposition

**Round 15's rule holds: dispositions strengthen rows, they do not flip
them.** Nothing here turns a pending row green. Four rows are AMENDED
because the review falsified something their evidence cell asserts, and
every amendment is a *weakening* or a caveat — which is the direction
that needs an argument, so here it is.

| Row | Change | Why |
|---|---|---|
| **INJ-01** | Evidence cell corrected; stays green | The cell says "A conflict may only quote a fact id the call was GIVEN — enforced twice, in the adapter and again at the worker." Both enforcement points existed and both guarded an **empty set** (D1), so the §4.8 half of this row described code that could not run. It runs now, and the cell says when it started to. |
| **DUP-02** | Status gains its caveat | R7/F-10: the row read a bare `green` while its own evidence cell said "partially met". The same table does this correctly twice already (EVA-01, PRF-07). Now `green (stage-2 copy partially met — Q-A/ADR-0023 D8)`. |
| **RND-01** | Evidence cell amended; stays green | Two corrections. The §6.3 claim "the table row by row" is not true for **email** (D12), and the resolution rule was silently wrong for any raster declaring a dpi (D2). The row is still green because the machinery is right and now demonstrably so — but a reader must not take "row by row" at face value while D12 is open. |
| **AIA-01** | Evidence cell amended; stays green | "the cache telemetry carried back so §6.6's 512-token minimum is MEASURED not assumed" is false — nothing reads `usage` (R2/F-6). `ai-provider.md`'s SMOKE-6 already carries the real check as an unticked box, so the checklist was honest and the coverage cell was not. Also records the allowlist narrowing (D6). |
| **EVA-01** | Evidence cell amended; **stays green, gate still OPEN** | The row already says the G9 GATE ITSELF IS OPEN, which is why it does not flip. What it must now also say is *why it cannot presently be closed*: D11's arithmetic. The fence claim in the same cell is true again after D7, and the cell now names the module that makes it true. |
| **SND-03** | Evidence cell amended; stays green | The app half was unreachable through its own surface until D4. Green survives because the pair is proven live end-to-end at the wrapper level and the surface is now fixed — but the cell records that no browser leg opens `/[circle]/senders` (R5/F-6), which is why it shipped broken. |

**No row is flipped to green by this ADR, and PRF-07, SIG-01, A11Y-08,
G12 and the deploy-level rows are untouched.**

---


## D20 — the owner's rulings, and the closing increment they authorised

**On 2026-08-23 the owner ruled on three of the five items in D18:**

1. **The migration bound: AMENDED, ≤ 6 → ≤ 7**, for exactly three things —
   Q-A's grant, the `column_privileges` exact-set invariant, and Q-B's
   `render_bounds_exceeded`. Landed as **M7**
   (`20260823060001_round16_fixes.sql`) with pgTAP **057**. Bound closes
   **SPENT at 7 of ≤ 7**.
2. **Scope before the gate: the closing increment.**
3. **The PR: the owner opens it.**

**5B is therefore NO LONGER APP-ONLY.** `supabase/` has moved, so the
ADR-0015 F12 per-directory binding no longer transfers the DB legs from
CI — they were re-run here and are recorded in D22. The packet's claim
that "the migration bound stays SPENT at 6 of ≤ 6 and was never
approached" was true when written and is superseded by the amendment.

**What the increment closed, red→green, every red carrying its failure
signature:**

| Finding | Commits |
|---|---|
| M7 — the grant, the invariant, the reason code | `287f544` → `08f7b7a` |
| R4/F-3 — a converted conflict was un-approvable on two of three outcomes | `bafa5af` → `df45fca` |
| R2/F-10, R2/F-11 — the log level and the egress assertion | `b4bfe65` → `dd86a39` |
| Q-B, Q-D — each render ceiling lands its own reason | `f05d101` → `f62305c` |
| Q-A completion, R5/F-4, R5/F-5, R6/F-5 | `7e83761` → `7c86c38` |
| R4/F-5 — the ack keeps lineage and drops the values | `3fcb871` → `f6cbc1f` |
| R6/F-6 — the eval scores the published prediction | `7677c0b` → `da68887` |

**Q-A is complete.** The §4.7 p2 copy now reads *"This looks like the
discharge summary you filed on July 12."* — what the plan's B6 row asked
for, and what DUP-02/UXA-02 have been carrying as partially met.

**Q-D closed with NO DDL**, which was the whole point of declining the
packet's recommendation in D10: `extract_timeout` was already a legal
edge and `provider_timeout` an already-seeded code, and nothing had ever
called either.

**Three amendments to already-green assertions** were required, and each
carries its argument at the site rather than only in a commit message —
the model allowlist, the D15 select guard, and the bounds-refusal
mapping. In every case the property the leg existed for is preserved and
only the claim changes. Packet Q-I is precisely about this move; making
it silently while dispositioning Q-I would have been indefensible.

**Two of this session's own assertions were wrong and were corrected
rather than the code bent to fit them:** the stage-2 title reads
lowercase mid-sentence (the plan's own example does too), and the date
renders "July 12" because `formatShortDate` is the house authority — the
plan's "Jul 12" was illustrative.

---

## D21 — a FOURTH amendment item, discovered by fixing the third

**R4/F-2 cannot be fixed in the app layer, and the review did not know
that when it was dispositioned.** D17 recorded it as OWED with "needs
either the edge or an app-layer remap". Enumerated live against
`hc.arrival_transitions` while building the Q-B/Q-D mapping:

```
extract     extracting  -> extract_timeout | extract_failed | extracted
                           needs_password  | unsupported_type
                           duplicate_suspected_stage2
interpret   interpreting -> proposals_ready
```

`interpret` has **exactly one edge**. There is no failure target from
`interpreting` at all, so every remap this session could write returns
`invalid_state` — which is what the finding describes. The stage cannot
terminalize a provider refusal, the lease runs to its deadline, the
sweeper re-queues, and **attempts 2 and 3 re-call the provider** before
the arrival lands `extract_failed` with `interpret_budget_exhausted` —
the wrong reason for what happened, at three times the cost.

**Recommended: a fourth item on the amendment** — one
`hc.arrival_transitions` row, `interpret / interpreting →
interpret_failed` (or `extract_failed`, if the owner prefers not to add
a state), plus the pgTAP pin. It is the same shape and the same evidence
leg as M7's three, and it is the last thing standing between the
interpret stage and an honest terminal.

**Not taken.** The amendment named three things and this session does not
extend it on its own authority, which is the whole point of the bound.

---

## D22 — evidence at the closing head

Every leg re-run, because `supabase/` moved and nothing transfers by F12
this round.

| Leg | Result |
|---|---|
| Clean-leg reset | `migration state exact: 61 applied == supabase/migrations` |
| pgTAP | **Files=58, Tests=1506, Result: PASS** (1497 baseline; 057 adds 9) |
| Concurrency | **70/70 assertions passed** (teed) |
| `db:verify` | **No schema errors found** (`--fail-on warning`) |
| Upgrade leg | base `a9d9f43` reset → exact 60 → `migration up` → exact 61 → pgTAP **1506 PASS** → concurrency **70/70** |
| vitest | **64 files, 685 passed (685)** — the true baseline is **632**, not the packet's 631 (D16) |
| typecheck · lint | clean |
| G9 harness dry-run | **12/12 requests build; NOTHING was sent** |
| `g9-build.mjs --check` | `corpus matches the spec` — now a CI step (R6/F-5) |

**The local gate has NOT been re-run at this head, and that is stated
rather than glossed.** Port 8787 is held by a `node` process started
2026-08-22 18:51 — a leftover fixture server from the build session's
gate run, predating this round's R7/F-2 partition filter. Playwright
starts the fixture server as a second `webServer`, so the gate would
either fail at startup or, worse, run against a stale server that still
answers from the BLIND partition. Killing another session's process is
not this session's call. **The gate is owed at the closing head**, and it
matters here more than usual: the inbox and senders surfaces both
changed, and the gate is what caught D15.

---
## D23 — M8, the gate, and the evidence at the signed-off head

**The owner granted the fourth amendment item** (D21) on 2026-08-23, in
response to this session's recommendation. **M8**
(`20260823070001_interpret_terminal.sql`) adds one row —
`interpret / interpreting → extract_failed` — and the migration bound
closes **SPENT at 8 of ≤ 8**.

Three things did NOT move, deliberately: no `hc.arrival_state` enum
value (`interpret_failed` would have needed a label and every exact-set
pin over the enum, to say what the reason code already says), no
family-facing label (`extract_failed` reads "Couldn't read it", honest
for a refusal too), and no reason code (`provider_refusal` /
`provider_error` were seeded at 4A). **The app needed no change at all** —
`processInterpret` had always made exactly this call; the graph refused
it.

**Two shipped exact-set pins went red and were amended with the argument
in place** — `027` test 2 (the seeded allowlist string) and `055` test 2
(21 → 22 rows). That is the ING-10 pattern paying for itself twice in one
round: M7 *added* such a pin over column grants because that class had
none, and here two existing ones caught a graph change the moment it
landed. `055` still asserts all three Q8 edges **by name**; only the
count moved, and it moved because a different migration answered a
different finding.

**One bug in this session's own test**, recorded rather than smoothed
over: `058` leg 7 named `hc.pipeline_leases` where the table is
`public.pipeline_leases`. `pg_temp.tq` wraps the error instead of
aborting the file, so it surfaced as a clean failed assertion — which is
what that helper is for.

### The local gate, run at the closing head

**It failed first, and it was right to.** The DUP-02 leg pinned the
generic copy and went red the moment Q-A landed — with a comment three
lines below saying that naming the matched document "needs a column grant
`authenticated` does not hold". It holds it now, so the leg asserts the
named citation and the corrected provenance line, and its title stops
claiming coverage it never had (R7/F-11, R8/F-8).

A **stale fixture server** on port 8787, started 2026-08-22 18:51, blocked
the first attempt. That is the failure mode the kickoff warns about and
it is the SAFE one — the gate fails at startup rather than reaching for a
provider. It also predated this round's R7/F-2 partition filter, so
reusing it would have run the gate against a server that still answered
from the BLIND partition. Killed after confirming no peer run was live.

```
npx playwright test --trace on   →   29 passed (4.3m)
onboarding 11 · a11y 5 · ingestion 8 · extraction 5
```

**On "24/24 UNCHANGED":** this round does not claim it, and R7/F-11 is
why. Two legs were deliberately amended across the round — ingestion's
cancel leg (the build session's, ratified at Q-I(2)) and extraction's
DUP-02 leg (this session's, above). The honest statement is **29/29 at
the closing head with two argued amendments**, not an unchanged count.

### Evidence, all of it re-run

| Leg | Result |
|---|---|
| Clean-leg reset | `migration state exact: 62 applied == supabase/migrations` |
| pgTAP | **Files=59, Tests=1513, PASS** (1497 at 5A; 057 adds 9, 058 adds 7) |
| Concurrency | **70/70** (teed) |
| `db:verify` | **No schema errors found** (`--fail-on warning`) |
| Upgrade leg | base `a9d9f43` → exact 60 → `migration up` → exact 62 → pgTAP **1513 PASS** → concurrency **70/70** |
| vitest | **64 files, 685 passed (685)** |
| typecheck · lint | clean |
| **Local gate** | **29/29** on a clean reset, no credential anywhere in the run |
| G9 harness dry-run | **12/12 build; NOTHING sent** |
| `g9-build.mjs --check` | `corpus matches the spec` — a CI step since `7e83761` |

**Dependency bound untouched**: still exactly the two Q3-approved runtime
packages, and **the dev-dependency reserve is still UNSPENT** — nothing
in this round's dispositions needed it.

---

## D24 — THE OWNER SIGN-OFF: four rulings, and what they moved

**The owner signed off on 2026-08-23 in session, the ADR-0015 /
ADR-0013 sign-off-with-merge pattern.** CI was re-confirmed green at the
PR head first, through the anonymous public API: run `32688855803`,
**23 steps, every one `success`**, the single `skipped` being the
on-failure log capture. PR #10 `open`, `mergeable_state: clean`, base
`main` @ `a9d9f43` — unmoved, so no divergence and no conflict surface.

### The four rulings

**1. `mupdf` is AGPL-3.0-or-later — RECORD NOW, SWAP IN SLICE 6** (D13).
The obligation is recorded where the dependency was argued:
`docs/review/slice-5-plan.md`'s Q3 bound now carries a **licence
column** — `@anthropic-ai/sdk` MIT, `mupdf` AGPL-3.0-or-later, both
verified from their installed manifests — and **no dependency is argued
anywhere in this project again without its licence in the same
argument.** Migrating `lib/pipeline/render.ts` to a permissive rasterizer
is a **NAMED SLICE-6 GATE ITEM**, taken before slice 6 builds further on
it: the alternatives the plan already priced are `pdfjs-dist` + canvas
(Apache-2.0) and `pdfium` bindings (BSD-3). Compliance by offering
Corresponding Source, and a commercial licence from Artifex, both remain
available and would each be a fresh ruling. Nothing in the tree changes
today — the swap is slice 6's, and it gets more expensive every slice it
waits.

**2. The G9 corpus — RESTATE §4/§6 AGAINST THE READABLE SET** (D11), which
is this session's own recommendation taken as written.
`docs/eval/g9-corpus-spec.md` is amended, and its numbers are now
MEASURED rather than declared:

| blind items | | extractable characters | distinct gray levels |
|---|---|---|---|
| born-digital PDF | 4 | 204–253 | 235–242 — antialiased glyphs |
| scanned PDF | 1 | **0** | 40 |
| photo JPEG | 7 | **0** | **7–8** — flat 8×8 blocks |

§1 now states the real limit: the photo-class encoder never renders a
glyph, so for eight of twelve blind items the labelled value lives in
`corpus.json` and in **no byte the model is given**. §4 gains **§4.1**
(labelled support — the old table, KEPT, because it is what a grown
corpus must reach), **§4.2** (readable support, which governs) and
**§4.3**, which states plainly that the minimums are NOT met: two fields
of twelve clear ≥ 3 items, **nothing** clears ≥ 2 source types, and
effective source-type coverage is **1** for every banded field. §6 keeps
every floor — they are what the product requires — and now carries the
**ceiling this corpus can demonstrate** beside each, with a `Signable?`
column reading **NO** twelve times of twelve, because max recall
(0.25–0.50) sits below the lowest floor (0.85).

`tests/eval/corpus.test.ts` makes it mechanical, driving the pipeline's
own `normalizeArrival` rather than trusting a label: the readable blind
set is pinned as an exact four-item set, per-field readable support as an
exact table, and **the shortfall itself is asserted** — 22
minimum-misses, which is the fact that keeps the G9 gate closed. The old
"the corpus spec is MET" block is retitled "is MEASURED" and its legs
renamed to say LABELLED, with the argument at the site (D0's rule for
amending a green assertion). **That leg is written to go RED when the
corpus grows** — §7 row 1 or row 2 — and the red is the signal to re-pin
the numbers in the same commit as the ADR recording the change, never to
loosen them. A floor is not lowered to meet an apparatus.

**3. §4.5's cancel window — SIGNAL FIRST, THEN THE EAGER FIRE** (D14). The
`gate → extract` eager fire stays **FORBIDDEN** until an arrival-received
signal exists — a Care Inbox that revalidates, or a "we're reading it"
notice at Reading — so PRD §4.2.2's promise is true at the moment it is
made. The two are a **PAIR** and slice 6 takes them in that order: the
signal, then the fire. Because the behaviour is settled, R8/F-1's held
comments are corrected rather than left describing a gap — this ruling is
the disposition D14 was waiting for:

- `app/api/worker/[stage]/route.ts` no longer says "nothing consumes it
  yet". It says the fire is deliberately withheld, and why.
- `tests/routes/worker-stage.test.ts`'s title no longer claims "nothing
  consumes yet", which was false at HEAD — scan, gate and interpret all
  fire. **The assertion is unchanged**; what changed is that it now pins
  a decision instead of a gap.
- `tests/routes/relay.test.ts` gains the honest limit R8/F-5 asked for:
  an `extract` outbox row reaches the relay from no in-branch producer,
  so that case is forward-compat, not live.

**4. ADR-0023 is RATIFIED as amended, ADR-0022 is AMENDED, and the merge
is taken in session** as a **MERGE COMMIT, never a squash** (ADR-0006).

### What the sign-off itself corrected — four defects in this document

The sign-off tested D17's ARGUMENTS, per this document's own instruction
about where to push hardest, and four of its own statements did not
survive:

1. **R3/F-9 read OWED and is FIXED.** The row was written before the
   owner's ruling and was never revisited when Q-B rode with Q-A.
   Verified in the tree at `f62305c`.
2. **R6/F-6 read OWED and is FIXED.** Same cause — D20's closing
   increment lists it and the D17 row did not follow. Verified:
   `scripts/eval/predict.ts` imports the worker's own `validateFacts`.
3. **"Seven BLOCKERs … are fixed" and "Three BLOCKERs are escalated" are
   both wrong.** Counted from the table: **10 BLOCKERs — 8 FIXED, 2
   OWNER** (R6/F-1, R7/F-1). The third escalation was the migration
   bound, which is an amendment item and not a finding, and the owner
   GRANTED it during the round — so it is not escalated at all any more.
   The PR body had this right; this ADR did not.
4. **D2 reported the mupdf spike as 8/8** while R7/F-3, four hundred
   lines below, ACCEPTED the re-score to 7/8 with leg 5 falsified. A
   document that contradicts its own disposition teaches a reader to
   trust neither half. Corrected at the site, with the argument.

**The honest counts at sign-off, tallied mechanically from D17: 27 FIXED
· 39 OWED · 3 OWNER · 19 ACCEPTED-NOTE · 21 NOTED · 2 ACCEPTED · 1
DECLINED-and-ACCEPTED · 1 OWED/OWNER = 113.** The kickoff's "25 FIXED,
41 OWED" is superseded by exactly those two rows. Two fewer owed items is
a small thing; a slice-6 kickoff carrying two queue entries that are
already done is not.

### ADR-0022's amendment list was SHORT BY FOUR

The "Status of ADR-0022" paragraph named five falsified claims. The
sign-off found **ten**, and folded all of them into ADR-0022 as a head
index plus a marker at every site, with **the original prose preserved
everywhere** — the D3 precedent: a record that is quietly rewritten stops
being an as-built record. The four it did not name:

- **D2's "all eight PASS"** — 7/8, leg 5 falsified (R7/F-3). That is the
  count the Q3 reserve-not-consumed conclusion rests on.
- **D7's "no reason code of its own"** — closed by M7, and worse than
  recorded while it was open: a wall-clock overrun was persisted as an
  archive breach.
- **D10's "the seam is consumed"** — the one that matters most, because
  it reads as permission to add the very eager fire ruling 3 forbids.
- **D12's three figures** — 126 lines not ~40, *reports* rather than
  *emits* no global number, and "the SOLE real-key path" as a literal
  claim.

Plus the **Context** paragraph and its matching Consequences bullet —
"5B is APP-ONLY … 60 migrations / 57 pgTAP files … the bound stays SPENT
at 6 of ≤ 6" — superseded by the owner's own two amendments.

### One source defect the sign-off found and fixed

`normalizeExit`'s docstring in `app/api/worker/[stage]/route.ts` carried
a sentence truncated mid-clause — "The migration bound is spent, so a" —
where the round-16 note had been spliced in over the original. Comment
only, no behaviour; but it is the mapping site D9/D10 argue about, and
the record there has to read cleanly. Repaired, with the tense corrected
to match a gap that has since closed.

### Evidence at the sign-off head

This leg is **documentation, two comment repairs and one new test
block**. Nothing under `supabase/` or `fixtures/` moved — verified,
`git diff --stat 98843af -- supabase/ fixtures/` is empty — so the DB
legs are INHERITED from D23's head under the ADR-0015 F12 per-directory
binding. That is stated rather than glossed:

| Leg | Result |
|---|---|
| vitest | **64 files, 689 passed (689)** — D23's 685 plus this leg's four new §4.2 legs, which land in an existing file |
| typecheck · lint | clean (`next typegen && tsc --noEmit`; `eslint`) |
| Clean-leg reset · pgTAP · concurrency · `db:verify` · upgrade leg | **INHERITED from D23** — exact 62 · 1513 PASS across 59 files · 70/70 · clean · base→60→62. `supabase/` is byte-identical to that head |
| Local gate | **INHERITED from D23** (29/29). NOT re-run, and why: a peer session holds a `next dev` server and a fixture server on port 8787, and `test:e2e` is one of the four GLOBAL commands that destroys a peer's in-flight run with no error on either side |
| G9 harness dry-run | **INHERITED from D23** (12/12 build, nothing sent). No harness code moved |

**The migration bound stays SPENT at 8 of ≤ 8** — this leg authored no
DDL and needed none. **The dependency bound is untouched**, and the
**dev-dependency reserve is still UNSPENT**.

### The slice-6 queue, as it stands after sign-off

**39 findings remain OWED**, each argued in D17, none of them
production-facing because nothing is production-activated. The
ruling-driven items now join them, and these are what a slice-6 kickoff
should carry first:

1. **The arrival-received signal, THEN the `gate → extract` eager fire**
   — in that order (ruling 3). Everything else about §4.5 waits on it.
2. **Migrate the rasterizer off `mupdf`** (ruling 1), before slice 6
   builds further on `render.ts`.
3. **§6.3's email row and the corpus's email gap** (D12): email facts
   cite a rendering that is never produced, and the blind partition has
   no email item at all — on the channel the forwarding address exists to
   serve.
4. **§7 row 1 or row 2 of the corpus spec**, bought deliberately. That is
   what makes any band signable.
5. **R6/F-4**: the harness writes a manifest `loadBands` rejects as
   `artifact_partial` FOREVER, and nobody has written down how a measured
   number becomes a threshold. Settle it with the corpus.
6. **R3/F-3 + R4/F-4** (attempt staging leaks; nothing sweeps
   `render/attempt/**`) · **R4/F-6** (partial promotion is permanent) ·
   **R4/F-7** (the 120 s read VT is shorter than the 300 s stage) ·
   **R2/F-5** (no 429/`retry-after` handling) · **R2/F-8** (the 64 MB
   render ceiling exceeds the API's 32 MB request limit) · **R2/F-9**
   (`model_context_window_exceeded` unhandled) · **R3/F-6 + R3/F-7** (no
   multi-page fixture, and nothing anywhere scores whether a bbox lands
   on its value).

---

### The merge — stamped after the fact, per the 4A `95dab27` pattern

**PR #10 merged as a MERGE COMMIT, never a squash** (ADR-0006):
**`c63bcae`**, parents `a9d9f43` (main, unmoved through the whole round)
+ `318e2ad` (the branch head). The merged tree is verified **IDENTICAL**
to `318e2ad`'s — both `d6aea1ac` — and **every one of the 39 commit SHAs
this ADR cites is reachable from `main`**, every red→green pair among them
included: extracted from the document and checked one by one with
`git merge-base --is-ancestor`, all 39 resolvable and all 39 ancestors.
So every failure signature these ADRs quote survives in the history
rather than only in prose. 69 commits, 111
files, +19,025 / −206.

**CI green on `main` at the merge commit: run `32694917229`, 23 steps,
the only non-success the on-failure database-log capture, skipped as
designed.**

**One honest note about that run, because this round penalised exactly
this kind of imprecision (R7/F-8).** On a push to `main` the upgrade leg
is a DELIBERATE no-op — `git merge-base HEAD origin/main` equals `HEAD`,
so it prints "HEAD is the base — no increment to rehearse" and exits 0
(`.github/workflows/ci.yml:86`, which says so in its own comment). The
rehearsal that matters therefore comes from the **branch head**, run
`32694256623`, where it ran for 38 s: base reset → exact 60 →
`migration up` → exact 62 → pgTAP → concurrency. Both runs are cited
because neither alone covers the claim.

**Round 16 closes. Slice 5B is on `main`.** Nothing is
production-activated: proposals rest at `pending`, the review screen is
slice 6's, the G9 gate is OPEN, `BAND_ARTIFACT_ALLOWLIST` is EMPTY, and
G3/G9/G4/G7 all still block.

---

## Consequences

- **EIGHT of the ten BLOCKERs are fixed on the branch** — corrected at
  sign-off from "seven", counted from the D17 table (D24) — **and
  nineteen further MAJOR/MINOR findings with them, 27 in all** —
  red→green, each with its
  failure signature in the red commit message: the record-context key
  (D1), the DPI geometry and the pixel ceiling (D2), the binary adapter
  (D3), the senders crash (D4), the tautological hash pin (D5), the
  model allowlist (D6), and the three fence bypasses (D7) — plus R1/F-1/F-2/F-3, the interpret arm's risk-class bypass and the §6.5 keyword rule, at `0ae61f3`/`681e839`.
- **TWO BLOCKERs were escalated** and could not be closed by a review
  session: the AGPL question (R7/F-1) and the corpus (R6/F-1). **The
  owner ruled on both at sign-off — D24.** The third item this bullet
  used to name — the migration bound, jointly with Q-A — is an amendment
  rather than a finding, and the owner granted it twice during the round.
- **§4.8's conflict arm now runs.** It did not before D1, which means
  the interpretation half of this slice was, in production, incapable of
  producing the proposal kind §4.8 exists to guarantee. That is the
  single most important sentence in this document.
- **A 300-dpi scan now renders at the tier §6.3 promises.** Before D2 it
  rendered at 617×824 and said `rendered`.
- **The migration bound was AMENDED by the owner twice — to ≤ 7 (D20) and
  then to ≤ 8 (D21/D23) — and closes SPENT at 8 of ≤ 8.** `supabase/` is no longer byte-identical to main, so
  5B is no longer app-only and the DB legs are re-run rather than
  inherited — D22. A **fourth** amendment item is recommended and NOT
  taken at the time; it was granted afterwards and is now M8 (D23).
- **The dependency bound is UNTOUCHED**: still exactly the two
  Q3-approved runtime packages. **The dev-dependency reserve remains
  UNSPENT** — nothing in these dispositions needed it, which is the
  answer to Q-H's implicit question.
- **`docs/coverage.md` is re-referenced in D19** — no row flips green on
  a disposition; two rows gain caveats and one is argued down.
- **The G9 gate remains OPEN**, `BAND_ARTIFACT_ALLOWLIST` remains EMPTY,
  and D11 gives the owner a reason it cannot be closed as the corpus
  stands.
- **Nothing is production-activated.** Proposals still rest at
  `pending`; G3/G9/G4/G7 all still block.

## Status of ADR-0022

**AMENDED, and accepted as amended — the amendments are now IN it.** The
as-built record is accurate in most of its detail and wrong in **ten**
specific claims, not the five this paragraph originally named.

The five: D8's conflict mechanism (D1), D2/D3's geometry (D2), D4's hash
enforcement (D5) and cache "measurement" (R2/F-6), D1's "property of the
tree" (D7), and D15's list of withheld columns (D8). **The five the
sign-off added:** D2's "all eight PASS" (R7/F-3), D7's "no reason code of
its own" (closed by M7), **D10's "the seam is consumed"** (D14 — the most
actionable of them, because it reads as permission to add the eager fire
the owner has just forbidden), D12's three figures (R7/F-12, R6/F-9,
R6/F-12), and the Context paragraph's APP-ONLY claim with its matching
Consequences bullet.

All ten are folded into ADR-0022 at sign-off — a head index keyed by
section plus a marker at every site, **the original prose preserved
everywhere** — so a future reader of the as-built record is not misled by
it, and is not misled about what was corrected either. D24 records the
fold.
