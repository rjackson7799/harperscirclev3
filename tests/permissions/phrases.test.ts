import { beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';

// ============================================================================
// 7C C3 · the level→phrase module, pinned LIVE the way tiers.ts is
// (AC-PPL-2; settled item 1: ONE module maps the five levels to five
// phrases, and the level words and the grants they describe cannot drift
// apart because the same module renders both).
//
//   · the module's level vocabulary IS hc.access_level's, plus hidden as
//     absence (the tiers.ts convention) — pinned against the enum itself;
//   · the plain line rendered over hc.tier_defaults' OWN rows says what the
//     tier's grants enforce and NEVER names a hidden domain — for the family
//     tier, `finances` has no row and the line must not contain the word;
//   · full access is manage×5 and nothing less.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let phrases: typeof import('@/lib/permissions/phrases');
let raw: pg.Client;

beforeAll(async () => {
  phrases = await import('@/lib/permissions/phrases');
  raw = new pg.Client({ connectionString: process.env.HC_DB_URL });
  await raw.connect();
  return async () => {
    await raw.end();
  };
});

/** hc.all_domains(), live — the domain set hc.member_levels writes a key
 *  for on EVERY subject. Used to build the shapes the DB actually emits. */
async function allDomains(): Promise<string[]> {
  const r = await raw.query(`select hc.all_domains()::text[] as d`);
  return (r.rows[0].d as string[]).slice().sort();
}

async function tierLevels(tier: string): Promise<Record<string, string>> {
  const r = await raw.query(
    `select domain::text as domain, level::text as level from hc.tier_defaults($1::hc.tier)`,
    [tier],
  );
  return Object.fromEntries(r.rows.map((row) => [row.domain, row.level]));
}

describe('the vocabulary is the enum, plus hidden as absence', () => {
  it("LEVEL_WORD and LEVEL_PHRASE carry exactly hc.access_level's values MINUS hidden — hidden has NO word by design (nothing implies the domain exists), so an unworded level can never leak into a sentence", async () => {
    const r = await raw.query(
      `select enum_range(null::hc.access_level)::text[] as levels`,
    );
    const enumLevels = (r.rows[0].levels as string[]).sort();
    expect(enumLevels).toContain('hidden');
    const worded = enumLevels.filter((l) => l !== 'hidden');
    expect(Object.keys(phrases.LEVEL_WORD).sort()).toEqual(worded);
    expect(Object.keys(phrases.LEVEL_PHRASE).sort()).toEqual(worded);
  });

  it('DOMAIN_LABEL carries exactly hc.domain values', async () => {
    const r = await raw.query(`select enum_range(null::hc.domain)::text[] as domains`);
    const enumDomains = (r.rows[0].domains as string[]).sort();
    expect(Object.keys(phrases.DOMAIN_LABEL).sort()).toEqual(enumDomains);
  });
});

describe('the ladder itself (7D · R3/F-7 + R4/F-6)', () => {
  it("LEVEL_RANK's keys are EXACTLY hc.access_level's five — an absent key is a silent `undefined` at the type level, and `n > undefined` is false, which misclassifies a raise as a lower", async () => {
    const r = await raw.query(`select enum_range(null::hc.access_level)::text[] as levels`);
    const enumLevels = (r.rows[0].levels as string[]).slice().sort();
    expect(Object.keys(phrases.LEVEL_RANK).sort()).toEqual(enumLevels);
  });

  it("the ranks increase STRICTLY along the enum's OWN order — the ladder the care ceiling offers by and the step-up route demands by is the ladder the DB compares by, and nothing else pinned that", async () => {
    const r = await raw.query(`select enum_range(null::hc.access_level)::text[] as levels`);
    const inEnumOrder = r.rows[0].levels as string[];
    const ranks = inEnumOrder.map((l) => phrases.LEVEL_RANK[l as keyof typeof phrases.LEVEL_RANK]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(ranks.length);
    // and hidden is the FLOOR: D6's "the ceiling offers NOTHING above itself"
    // reads the same map, so the floor being the floor is load-bearing too.
    expect(inEnumOrder[0]).toBe('hidden');
  });

  it('GRANT_LEVELS is that enum, in that order — the ONE list the surfaces offer from', async () => {
    const r = await raw.query(`select enum_range(null::hc.access_level)::text[] as levels`);
    expect([...phrases.GRANT_LEVELS]).toEqual(r.rows[0].levels as string[]);
  });

  it('DOMAINS is hc.domain, so no surface re-types it', async () => {
    const r = await raw.query(`select enum_range(null::hc.domain)::text[] as domains`);
    expect([...phrases.DOMAINS].sort()).toEqual((r.rows[0].domains as string[]).sort());
  });
});
describe("the plain line over hc.tier_defaults' own rows", () => {
  it("family: the line says what the tier's grants enforce and never names the hidden domain", async () => {
    const line = phrases.plainLine(await tierLevels('family'));
    expect(line).toContain(phrases.LEVEL_WORD.summary);
    expect(line).toContain(phrases.LEVEL_WORD.log);
    expect(line).toContain(phrases.DOMAIN_LABEL.documents);
    expect(line).not.toContain('finances');
  });

  it('care_circle: summary of schedule, and nothing else named', async () => {
    const line = phrases.plainLine(await tierLevels('care_circle'));
    expect(line).toContain(phrases.LEVEL_WORD.summary);
    expect(line).toContain(phrases.DOMAIN_LABEL.schedule);
    expect(line).not.toContain('finances');
    expect(line).not.toContain(phrases.DOMAIN_LABEL.health);
  });

  it('coordinator: manage×5 is full access, one phrase, no enumeration', async () => {
    const line = phrases.plainLine(await tierLevels('coordinator'));
    expect(line).toBe(phrases.LEVEL_WORD.manage);
  });

  it('no grants at all is its own honest phrase, and null (not yours to know) is empty', () => {
    expect(phrases.plainLine({})).toBe('nothing in this record');
    expect(phrases.plainLine(null)).toBe('');
    expect(phrases.plainLine(undefined)).toBe('');
  });
});

// ── 7E · R4/F-10 (ADR-0038, ACCEPTED · TAKEN(7E)) ─────────────────────────
//
// The pin above is the strongest single assertion in the increment, and it
// never exercises a shape the database emits. Neither does anything else in
// the file. Verified against the two definers by reading them:
//
//   hc.member_levels (20260829120004_record_reads.sql:81) aggregates over
//   `unnest(hc.all_domains())` with `coalesce(g.level, 'hidden')` — so a
//   subject key maps to a map with EVERY domain spelled out, `hidden`
//   included. It is never `{}`. `{}` above is the outer object for a circle
//   with no subjects, not a subject entry.
//
//   hc.member_levels_frozen (20260829120005_round24_m5_reads.sql:1659) sets a
//   frozen subject's ENTRY to null and leaves the rest — so the per-subject
//   value the page hands plainLine can be null. That shape is not in this
//   file at all.
//
// Nothing is wrong: the all-hidden map reaches the same branch as `{}`. But
// what is pinned is the shape the tree happens to construct, not the shape
// the record produces — the round's recurring defect, in the file whose
// whole discipline is to pin LIVE.
describe('the shapes the record actually emits (R4/F-10)', () => {
  it('a member with no grants: every domain spelled out as hidden — NOT {} — is the honest phrase', async () => {
    const domains = await allDomains();
    expect(domains.length).toBeGreaterThanOrEqual(5);
    // hc.member_levels writes this, per subject, for a member with no rows.
    const allHidden = Object.fromEntries(domains.map((d) => [d, 'hidden']));
    expect(phrases.plainLine(allHidden)).toBe('nothing in this record');
    // and it names no domain at all — hidden has no word by design.
    for (const d of domains) {
      expect(phrases.plainLine(allHidden)).not.toContain(d);
    }
  });

  it("a frozen subject's entry is null, and null renders NOTHING — the freeze implies nothing either", async () => {
    const domains = await allDomains();
    // What hc.member_levels_frozen hands the page: the map is present, this
    // subject's value is null. The page indexes by subject id, so plainLine
    // receives the null — not an empty map, which would SAY something.
    const frozen: Record<string, Record<string, string> | null> = {
      'a0000000-0000-4000-8000-00000000000a': null,
      'b0000000-0000-4000-8000-00000000000b': Object.fromEntries(
        domains.map((d) => [d, 'view']),
      ),
    };
    expect(phrases.plainLine(frozen['a0000000-0000-4000-8000-00000000000a'])).toBe('');
    expect(phrases.plainLine(frozen['b0000000-0000-4000-8000-00000000000b'])).toBe(
      phrases.LEVEL_WORD.view,
    );
    // The distinction the freeze depends on: nothing-to-know is EMPTY, and
    // no-grants is a sentence. They must not collapse into each other.
    expect(phrases.plainLine(null)).not.toBe(phrases.plainLine({}));
  });

  it("one hidden among four worded is ENUMERATED, never the whole-record phrase (D5's central case)", async () => {
    const domains = await allDomains();
    const hiddenOne = domains[domains.length - 1];
    const fourWorded = Object.fromEntries(
      domains.map((d) => [d, d === hiddenOne ? 'hidden' : 'view']),
    );
    const line = phrases.plainLine(fourWorded);
    // NOT the single-word phrase: four of five is not everything, and
    // rendering it as everything is the failure this case exists for.
    expect(line).not.toBe(phrases.LEVEL_WORD.view);
    // It enumerates the four it can name, and never the fifth.
    for (const d of domains) {
      if (d === hiddenOne) continue;
      expect(line).toContain(phrases.DOMAIN_LABEL[d as keyof typeof phrases.DOMAIN_LABEL]);
    }
    expect(line).not.toContain(
      phrases.DOMAIN_LABEL[hiddenOne as keyof typeof phrases.DOMAIN_LABEL],
    );
    expect(line).toContain(phrases.LEVEL_WORD.view);
  });
});
