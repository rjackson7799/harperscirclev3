import { describe, expect, it } from 'vitest';
import playwrightConfig from '../../playwright.config';

// ============================================================================
// 7C 7E · OW-25 (ADR-0038 D1, Q-E) — THE GATE'S RECORD IS CONFIG-BORNE,
// NEVER FLAG-BORNE.
//
// r5 ran 57/57 green and left NO machine-readable record and NO per-test
// trace. Two separate holes, and the round ruled both into one condition:
//
//   · the JSON reporter was a CLI override (`--reporter=list,json`), and
//     `PLAYWRIGHT_JSON_OUTPUT_FILE` never materialised its file in ANY run —
//     so the tally had to be read from teed console text, which traps §4
//     forbids ("NEVER GREP THE PLAYWRIGHT STATUS MARK");
//   · `trace: 'retain-on-failure'` means a GREEN run retains nothing by
//     design. Q-E's ruling: "a reporter-only condition reintroduces this
//     round's gap at the next green."
//
// So this file pins both AGAINST THE RESOLVED CONFIG OBJECT, not against its
// source text: a comment cannot satisfy it and a flag cannot be forgotten.
// The acceptance condition OW-25 carries — "discharged by a gate run whose
// JSON record is produced with no CLI override" — is exactly what an
// override-free config makes possible.
//
// Test class: STATIC PIN over the imported config (no DB, no browser).
// ============================================================================

/** Where the JSON record must NOT live: Playwright wipes `outputDir`
 *  (`test-results/`) at the START of every run, including a peer session's
 *  (traps §6). A record inside it is destroyed by the next run before anyone
 *  reads it — which is how r3's only RED gate record came within seventy
 *  seconds of being lost. `.gate/` is the gate's own state directory
 *  (scripts/preflight.mjs), already git-ignored, and nothing wipes it. */
const WIPED_DIR = 'test-results/';

type ReporterEntry = string | [string, Record<string, unknown>?];

function reporterEntries(): ReporterEntry[] {
  const r = playwrightConfig.reporter as ReporterEntry | ReporterEntry[] | undefined;
  if (r === undefined) return [];
  return Array.isArray(r) && !(typeof r[0] === 'string' && r.length <= 2 && typeof r[1] !== 'string')
    ? (r as ReporterEntry[])
    : ([r] as ReporterEntry[]);
}

function jsonReporter(): [string, Record<string, unknown>] | undefined {
  for (const entry of reporterEntries()) {
    if (Array.isArray(entry) && entry[0] === 'json') return [entry[0], entry[1] ?? {}];
  }
  return undefined;
}

describe('OW-25 · the gate run records itself, with no CLI override', () => {
  it('playwright.config.ts declares a reporter — the record is not a flag someone must remember', () => {
    expect(playwrightConfig.reporter, 'playwright.config.ts sets no `reporter`').toBeDefined();
  });

  it('one of the reporters is `json`, with an explicit outputFile — the tally is READ FROM JSON, never from console text (traps §4)', () => {
    const json = jsonReporter();
    expect(json, 'no ["json", { outputFile }] entry in `reporter`').toBeDefined();
    expect(typeof json![1].outputFile, 'the json reporter carries no outputFile path').toBe(
      'string',
    );
  });

  it('the JSON record is written OUTSIDE test-results/ — Playwright wipes that directory at the start of every run, a peer session included', () => {
    const outputFile = String(jsonReporter()?.[1].outputFile ?? '');
    expect(outputFile.replace(/\\/g, '/')).not.toContain(WIPED_DIR);
  });

  it("trace is 'on' — a GREEN run retains a trace per test, which 'retain-on-failure' does not (Q-E: the r5 gap)", () => {
    expect(playwrightConfig.use?.trace).toBe('on');
  });

  // ── The pin's own controls (traps §9) ────────────────────────────────────
  it('control: the reporter reader finds the json entry among several, and reports undefined when there is none', () => {
    const pick = (r: ReporterEntry[]) =>
      r.find((e) => Array.isArray(e) && e[0] === 'json') as
        | [string, Record<string, unknown>]
        | undefined;
    expect(pick([['list'], ['json', { outputFile: '.gate/x.json' }]])?.[1].outputFile).toBe(
      '.gate/x.json',
    );
    expect(pick([['list'], ['html']])).toBeUndefined();
  });

  it('control: a path inside test-results/ is REJECTED by the same predicate that accepts .gate/', () => {
    expect('test-results/run.json'.replace(/\\/g, '/')).toContain(WIPED_DIR);
    expect('.gate/e2e-run.json'.replace(/\\/g, '/')).not.toContain(WIPED_DIR);
  });
});
