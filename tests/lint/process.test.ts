import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// ============================================================================
// The process, enforced as code.
//
// ADR-0026 earned this rule and applied it only to product code: "a lesson
// recorded as a comment is a lesson that will recur … If it can be a scanner,
// a manifest, or an exact-set assertion, it must be." Every rule below was
// previously enforced by retyping it into a kickoff brief by hand — 13 briefs,
// ~1,670 lines, grown 4x, and already wrong once ("the kickoff told the
// reviewer two different things about the same failure, in the same numbered
// item").
//
// Three classes of assertion:
//   1. The doctrine is REACHABLE   — tracked, and next dev cannot capture it.
//   2. The doctrine stays SMALL    — caps, so it does not become the next
//                                     278-line kickoff.
//   3. The ledgers stay HONEST     — coverage.md and owed.md invariants.
//
// PARSING NOTE, and it is the trap this file was nearly caught by:
// docs/coverage.md contains ESCAPED pipes inside cells (`address\|domain`,
// `family\|care_circle`). A naive split('|') reports those rows as malformed.
// Split on unescaped pipes only. Rows also come in a 6-column variant that
// folds the test evidence into the status cell. The status is located by
// COLUMN INDEX, never by scanning cells for a keyword — `review` is a legal
// Layer value as well as a legal status, so a keyword scan inflates the tally.
// ============================================================================

const cells = (line: string): string[] =>
  line.split(/(?<!\\)\|/).map((s) => s.trim());

const STATUS_WORDS = new Set(['green', 'pending', 'review']);

// An assertion ID may carry a lowercase suffix — FRZ-16a/b, RLS-11a/b,
// APP-09a/b are real rows. The round-19 form of this regex required digits to
// the end and skipped all six WITHOUT a failure: the pending tally read 10
// where the file holds 12. A parser that drops rows silently is the defect
// class this file exists to catch, so the pattern is named and tested below.
const ASSERTION_ID = /^\*{0,2}[A-Z][A-Z0-9]*-\d+[a-z]?\*{0,2}$/;

// The status must be located by COLUMN, never by scanning cells for a keyword:
// the Layer column legitimately contains the value `review`, so a keyword scan
// reports a pgTAP row as review-status and the tally silently inflates. Rows in
// the 6-column variant have no Test cell, so their status is the last cell.
const COVERAGE_HEADER = '| ID | Assertion | Source | Layer | Slice | Status | Test |';
const STATUS_IDX = cells(COVERAGE_HEADER).indexOf('Status');

const statusOf = (row: string[]): string | undefined => {
  const cell = row[Math.min(STATUS_IDX, row.length - 2)] ?? '';
  const word = cell.replace(/\*\*/g, '').split(/[\s—(]/)[0];
  return STATUS_WORDS.has(word) ? word : undefined;
};

const lineCount = (path: string): number =>
  readFileSync(path, 'utf8').split(/\r?\n/).length;

const trackedFiles = new Set(
  execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean),
);

// ---------------------------------------------------------------------------
// 1. The doctrine is reachable
// ---------------------------------------------------------------------------
describe('doctrine is reachable from a fresh clone', () => {
  // CLAUDE.md and AGENTS.md were BOTH gitignored, on the reading that next dev
  // regenerates them. It does not. The consequence was that a fresh clone, a
  // fresh worktree and CI each had zero project doctrine — while every session
  // believed the charter was loaded.
  it('CLAUDE.md and AGENTS.md are tracked', () => {
    expect([...trackedFiles].filter((f) => f === 'CLAUDE.md')).toEqual(['CLAUDE.md']);
    expect([...trackedFiles].filter((f) => f === 'AGENTS.md')).toEqual(['AGENTS.md']);
  });

  it('the doctrine files are tracked', () => {
    for (const f of ['docs/process/traps.md', 'docs/process/slice.md', 'docs/owed.md']) {
      expect(trackedFiles.has(f), `${f} must be tracked`).toBe(true);
    }
  });

  // This is the invariant that keeps next dev OUT of CLAUDE.md.
  // writeAgentFiles() returns claudeMd:'skipped' only while AGENTS.md hosts the
  // marker pair. If the block ever migrates, next dev starts upserting into
  // CLAUDE.md and will sit inside the charter.
  it('AGENTS.md hosts the nextjs marker pair and CLAUDE.md hosts neither', () => {
    const agents = readFileSync('AGENTS.md', 'utf8');
    const claude = readFileSync('CLAUDE.md', 'utf8');

    expect(agents).toContain('<!-- BEGIN:nextjs-agent-rules -->');
    expect(agents).toContain('<!-- END:nextjs-agent-rules -->');
    expect(claude).not.toContain('BEGIN:nextjs-agent-rules');
    expect(claude).not.toContain('END:nextjs-agent-rules');
  });

  it('CLAUDE.md imports the traps file', () => {
    expect(readFileSync('CLAUDE.md', 'utf8')).toContain('@docs/process/traps.md');
  });
});

// ---------------------------------------------------------------------------
// 2. The doctrine stays small
// ---------------------------------------------------------------------------
describe('always-loaded doctrine stays within its caps', () => {
  // These caps are the whole anti-bloat mechanism. traps.md carries an
  // eviction rule in its own header — adding a trap requires removing one, or
  // showing the removed one is now enforced by a scanner. Without a mechanical
  // cap that rule is a good intention, and good intentions produced the
  // 278-line kickoff this file exists to retire.
  // Each cap is set just above where its file honestly sits — the job is to
  // stop DRIFT, and a cap can only do that from the real starting point. The
  // headroom is deliberately single-digit so the next addition has to argue
  // for itself. Raising a cap is a diff with a reason in the commit message.
  const CAPS: Record<string, number> = {
    'CLAUDE.md': 90,
    'docs/process/traps.md': 215,
    'docs/process/slice.md': 210,
  };

  for (const [path, cap] of Object.entries(CAPS)) {
    it(`${path} is at most ${cap} lines`, () => {
      expect(lineCount(path)).toBeLessThanOrEqual(cap);
    });
  }

  // Kickoffs written before the doctrine landed are grandfathered. The list
  // may SHRINK and must never grow: a new kickoff over 90 lines is restating
  // something that is now auto-loaded.
  const LEGACY_KICKOFFS = new Set([
    '4b-build-kickoff.md',
    '5a-build-kickoff.md',
    '5b-build-kickoff.md',
    'round-12-kickoff.md',
    'round-12-signoff-kickoff.md',
    'round-13-kickoff.md',
    'round-15-kickoff.md',
    'round-15-signoff-kickoff.md',
    'round-16-kickoff.md',
    'round-16-signoff-kickoff.md',
    'round-17-kickoff.md',
    'round-18-kickoff.md',
    'slice-6-plan-kickoff.md',
  ]);

  const kickoffs = [...trackedFiles].filter((f) =>
    /^docs\/review\/.*kickoff\.md$/.test(f),
  );

  it('the legacy kickoff list names only files that exist (it cannot be padded)', () => {
    const present = new Set(kickoffs.map((f) => f.split('/').pop()!));
    const fictions = [...LEGACY_KICKOFFS].filter((f) => !present.has(f));
    expect(fictions).toEqual([]);
  });

  it('every kickoff written after the retune is at most 90 lines', () => {
    const offenders = kickoffs
      .filter((f) => !LEGACY_KICKOFFS.has(f.split('/').pop()!))
      .map((f) => ({ f, n: lineCount(f) }))
      .filter(({ n }) => n > 90);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. The ledgers stay honest
// ---------------------------------------------------------------------------
describe('docs/coverage.md invariants', () => {
  const rows = readFileSync('docs/coverage.md', 'utf8')
    .split(/\r?\n/)
    .map((l, i) => ({ n: i + 1, c: cells(l) }))
    .filter(({ c }) => ASSERTION_ID.test(c[1] ?? ''))
    .map(({ n, c }) => ({ n, c, id: (c[1] ?? '').replace(/\*/g, '') }));

  it('finds the full assertion set', () => {
    expect(rows.length).toBeGreaterThan(200);
  });

  // ADR-0006 declares this manifest authoritative PER ASSERTION. An ID naming
  // two different assertions defeats that at the root: a packet citing CTX-01
  // is citing one of two things and the reader cannot tell which.
  //
  // Two collisions exist today and are grandfathered so the check can ship.
  // The list is SHRINK-ONLY — a fix must delete its entry, and a new collision
  // fails. Renaming either row is a coverage edit and belongs to a round.
  const KNOWN_DUPLICATE_IDS = new Set(['CTX-01', 'REV-01']);

  it('assertion IDs are unique, except the two grandfathered collisions', () => {
    const byId = new Map<string, number[]>();
    for (const r of rows) byId.set(r.id, [...(byId.get(r.id) ?? []), r.n]);
    const dupes = [...byId].filter(([, ns]) => ns.length > 1).map(([id]) => id);
    expect(dupes.filter((id) => !KNOWN_DUPLICATE_IDS.has(id))).toEqual([]);
  });

  it('the grandfathered duplicate list cannot be padded with fictions', () => {
    const byId = new Map<string, number>();
    for (const r of rows) byId.set(r.id, (byId.get(r.id) ?? 0) + 1);
    const notActuallyDuplicated = [...KNOWN_DUPLICATE_IDS].filter(
      (id) => (byId.get(id) ?? 0) < 2,
    );
    expect(notActuallyDuplicated).toEqual([]);
  });

  it('every assertion row carries exactly one recognised status', () => {
    const offenders = rows
      .filter(({ c }) => statusOf(c) === undefined)
      .map(({ n }) => n);
    expect(offenders).toEqual([]);
  });

  // "pending never counts as green" is the oldest standing rule in the project
  // (ADR-0006). The failure it guards against is a green claim with nothing
  // behind it, so the assertion is: a green row carries evidence SOMEWHERE —
  // either a Test cell, or evidence folded into the status cell (the 6-column
  // variant, e.g. "green — pgTAP 043:2-4 …").
  it('no green row is without evidence', () => {
    const offenders = rows
      .filter(({ c }) => statusOf(c) === 'green')
      .filter(({ c }) => {
        const statusCell = (c[Math.min(STATUS_IDX, c.length - 2)] ?? '').replace(/\*\*/g, '');
        // The 6-column variant folds the evidence into the status cell
        // ("green — pgTAP 044:1,7,10–25 · …"); the 7-column form puts it in Test.
        const inlineEvidence = statusCell.trim().length > 'green'.length;
        // NOT c[c.length - 1]: splitting "| a | b |" yields a trailing empty
        // cell after the final pipe, so the last element is always ''.
        const testCell = c.length - 2 > STATUS_IDX ? (c[STATUS_IDX + 1] ?? '') : '';
        return !inlineEvidence && !testCell;
      })
      .map(({ n }) => n);
    expect(offenders).toEqual([]);
  });
});

describe('docs/owed.md invariants', () => {
  const text = readFileSync('docs/owed.md', 'utf8');
  // The cap lives in the file as data, so ratcheting it down is a one-line diff
  // with a ruling behind it — and the test can never disagree with the prose,
  // because it reads the same value the prose is generated from.
  const CAP = Number(text.match(/<!--\s*owed-cap:\s*(\d+)\s*-->/)?.[1]);
  const rows = text
    .split(/\r?\n/)
    .map((l, i) => ({ n: i + 1, l }))
    .filter(({ l }) => /^\|\s*OW-\d+/.test(l))
    .map(({ n, l }) => ({ n, c: cells(l) }));

  // Header-indexed, for the same reason as coverage.md: the last element of a
  // split row is the empty string after the trailing pipe, never a real cell.
  // The ledger was populated at the retune refresh (2026-08-29); until then
  // this passed trivially against an empty table, and a wrong index would
  // have been a silent false-pass rather than a failure.
  const OWED_HEADER =
    '| ID | Origin | Sev | Claim | Acceptance condition | Status | Evidence |';
  const OWED_STATUS_IDX = cells(OWED_HEADER).indexOf('Status');
  const OWED_ACCEPT_IDX = cells(OWED_HEADER).indexOf('Acceptance condition');

  it('the ledger header matches the shape this test parses', () => {
    expect(text).toContain(OWED_HEADER);
  });

  const statusCell = (c: string[]) => (c[OWED_STATUS_IDX] || '').replace(/\*\*/g, '');
  const isOpen = (c: string[]) => /^OPEN\b/.test(statusCell(c));

  it('declares a machine-readable cap that the prose agrees with', () => {
    // A ledger whose prose promises a different number than the scanner
    // enforces is the round-16 defect in miniature: a document disagreeing
    // with its own table.
    expect(Number.isInteger(CAP)).toBe(true);
    expect(text).toContain(`Cap: ${CAP} OPEN`);
  });

  it(`no more than ${CAP} items are OPEN`, () => {
    expect(rows.filter(({ c }) => isOpen(c)).length).toBeLessThanOrEqual(CAP);
  });

  it('every OPEN row carries an acceptance condition', () => {
    // "an owed item without one is a wish" — ADR-0027 D17, previously a
    // human instruction, now a failing test.
    const offenders = rows
      .filter(({ c }) => isOpen(c))
      .filter(({ c }) => !(c[OWED_ACCEPT_IDX] && c[OWED_ACCEPT_IDX].length > 3))
      .map(({ n }) => n);
    expect(offenders).toEqual([]);
  });

  // The status column is a closed vocabulary (owed.md "Status vocabulary").
  // A row reading `owed`, `deferred` or `carried` is the pre-ledger state
  // coming back under a new spelling — the thing the cap cannot see.
  const STATUS_RE =
    /^(OPEN|TAKEN\([^)]+\)|CLOSED\([0-9a-f]{7,40}\)|KILLED\([^)]+\)|RISK\([^)]+\)|PROMOTED\([^)]+\))$/;

  it('every ledger row carries a status from the vocabulary', () => {
    const offenders = rows
      .filter(({ c }) => !STATUS_RE.test(statusCell(c).trim()))
      .map(({ n }) => n);
    expect(offenders).toEqual([]);
  });

  it('the OPEN count the prose states is the count the table holds', () => {
    // Round 16 shipped an ADR whose prose said seven where its table said
    // eight. The ledger states its own count; it must be the re-tallied one.
    const open = rows.filter(({ c }) => isOpen(c)).length;
    expect(text).toContain(`**OPEN: ${open} / ${CAP}.**`);
  });

  it('every CLOSED row names a resolvable commit', () => {
    const offenders = rows
      .filter(({ c }) => /^CLOSED/.test(statusCell(c)))
      .filter(({ c }) => {
        const sha = statusCell(c).match(/\b([0-9a-f]{7,40})\b/)?.[1];
        if (!sha) return true;
        try {
          execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
          return false;
        } catch {
          return true;
        }
      })
      .map(({ n }) => n);
    expect(offenders).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. The parser itself, driven against synthetic input
// ---------------------------------------------------------------------------
// Repo discipline: "a scanner matches its own comments — every scanner carves
// out comment lines and has negative tests." A scanner that only ever runs
// against a passing tree has never been shown to fail, and a check that cannot
// fail is decoration. Each case below is a defect this file was actually
// caught by while being written.
describe('the coverage parser, on synthetic rows', () => {
  const row = (s: string) => cells(s);

  it('splits on unescaped pipes only', () => {
    // Three real rows (SND-02, IVT-01, DEC-01) carry `\|` inside a cell.
    // A naive split reports them as 8-column and they read as malformed.
    // String.raw so the source reads exactly as coverage.md does. Written with
    // a Bash heredoc first, which silently ate one backslash and turned `\|`
    // into a plain pipe — the traps file's own heredoc warning, earned again.
    const c = row(String.raw`| SND-02 | exactly-one-of address\|domain | §5.3 | pgTAP | 4A | green | 045:1 |`);
    expect(c.length - 2).toBe(7);
    expect(c[2]).toContain(String.raw`address\|domain`);
  });

  it('does not mistake the Layer column for the Status column', () => {
    // `review` is a legal LAYER ("process property, verified at review gates")
    // as well as a legal status. A keyword scan over all cells reports this
    // pgTAP row as review-status and the tally silently inflates.
    const c = row('| DEF-12 | atomic within one migration | plan | review | 1A | green | M2 |');
    expect(statusOf(c)).toBe('green');
  });

  it('reads the status of a 6-column row from its last cell', () => {
    const c = row('| BAT-02 | the four maintenance ops | ADR-0015 | pgTAP | 4A/4B | green — pgTAP 043:2–4 |');
    expect(statusOf(c)).toBe('green');
  });

  it('rejects a status word it does not recognise', () => {
    const c = row('| XXX-01 | something | §1 | pgTAP | 1A | probably | t |');
    expect(statusOf(c)).toBeUndefined();
  });

  it('flags a green row whose Test cell is empty', () => {
    const c = row('| XXX-02 | something | §1 | pgTAP | 1A | green |  |');
    const statusCell = (c[Math.min(STATUS_IDX, c.length - 2)] ?? '').replace(/\*\*/g, '');
    const inlineEvidence = statusCell.trim().length > 'green'.length;
    const testCell = c.length - 2 > STATUS_IDX ? (c[STATUS_IDX + 1] ?? '') : '';
    expect(inlineEvidence || Boolean(testCell)).toBe(false);
  });

  it('accepts a green row whose evidence is inline in the status cell', () => {
    const c = row('| STO-01 | store | §4.3 | pgTAP | 4A/4B | green — pgTAP 044:1,7 |');
    const statusCell = (c[Math.min(STATUS_IDX, c.length - 2)] ?? '').replace(/\*\*/g, '');
    expect(statusCell.trim().length > 'green'.length).toBe(true);
  });

  it('recognises a suffixed assertion ID', () => {
    // FRZ-16a/b, RLS-11a/b and APP-09a/b are real rows. The round-19 regex
    // required digits to the end and skipped all six without a failure.
    expect(ASSERTION_ID.test('FRZ-16b')).toBe(true);
    expect(ASSERTION_ID.test('**RLS-11a**')).toBe(true);
    expect(ASSERTION_ID.test('16b')).toBe(false);
    expect(ASSERTION_ID.test('FRZ-16bb')).toBe(false);
  });

  it('normalises bold status cells', () => {
    expect(statusOf(row('| X-1 | a | b | pgTAP | 1A | **pending** | t |'))).toBe('pending');
  });
});
