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
