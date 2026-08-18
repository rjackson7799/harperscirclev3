import { beforeAll, describe, expect, it } from 'vitest';

// ============================================================================
// A6 · AC-AUTH-8 — the ceiling copy cannot drift (TSD §5.10; PRD §4.1.5).
//
// lib/permissions/tiers.ts is THE one module rendering the tier ceiling
// copy for BOTH screens (invite: under the tier selector; accept: before
// anything is asked) AND generating the default grants written at
// acceptance. Two halves pinned here:
//
//   1. The grant table matches hc.tier_defaults() EXACTLY, row for row,
//      for every invitable tier — the DB function is the ONE source
//      (IVT-02) and the app module is its snapshot. A drift on either
//      side reds this test.
//   2. Both screen renderings come out of the module: the <TierCeiling>
//      component (the only ceiling renderer the screens are allowed to
//      use) emits exactly the module's copy for its person variant.
//      The A5 route tests assert the screens render through it.
// ============================================================================

process.env.HC_DB_URL ??= 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';

let tiers: typeof import('@/lib/permissions/tiers');
let withRequestRole: typeof import('@/lib/db/request-role')['withRequestRole'];

beforeAll(async () => {
  tiers = await import('@/lib/permissions/tiers');
  ({ withRequestRole } = await import('@/lib/db/request-role'));
});

describe('A6 · the grant table snapshots hc.tier_defaults()', () => {
  it('every invitable tier matches the DB rows exactly', async () => {
    for (const tier of tiers.INVITABLE_TIERS) {
      const db = await withRequestRole(
        'authenticated',
        { role: 'authenticated' },
        async (q) =>
          (
            await q.query(
              'select domain::text as domain, level::text as level from hc.tier_defaults($1::hc.tier) order by domain',
              [tier],
            )
          ).rows,
      );
      const module_ = [...tiers.TIERS[tier].defaultGrants]
        .map(({ domain, level }) => ({ domain, level }))
        .sort((a, b) => a.domain.localeCompare(b.domain));
      expect(module_, `tier ${tier}`).toEqual(db);
    }
  });

  it('family has NO finances row — absence IS hidden (PRD §7.4)', () => {
    const domains = tiers.TIERS.family.defaultGrants.map((g) => g.domain);
    expect(domains).not.toContain('finances');
  });
});

describe('A6 · one copy source for both screens', () => {
  it('family ceiling names the subject, the summary-only start, and that it can rise (§4.1.5)', () => {
    const copy = tiers.ceilingCopy('family', { person: 'they', subjectNames: ['Nell'] });
    expect(copy).toContain('Nell');
    expect(copy.toLowerCase()).toContain('summary');
    expect(copy.toLowerCase()).toContain('raise');
    // PRD §4.1.5 writes "not her documents" for the Nell example; the DB
    // carries no subject gender, so the module speaks the product's voice
    // rule instead — the subject by name, never a guessed pronoun.
    expect(copy.toLowerCase()).toContain("not nell's documents");
  });

  it('care_circle ceiling states the task scope and that the ceiling does not rise (§4.1.5)', () => {
    const copy = tiers.ceilingCopy('care_circle', { person: 'they', subjectNames: ['Nell'] });
    expect(copy.toLowerCase()).toContain('only the tasks');
    expect(copy.toLowerCase()).toContain("doesn't rise");
    expect(copy.toLowerCase()).toContain('not documents');
  });

  it('the second-person variant says the same thing to the invitee', () => {
    const they = tiers.ceilingCopy('family', { person: 'they', subjectNames: ['Nell'] });
    const you = tiers.ceilingCopy('family', { person: 'you', subjectNames: ['Nell'] });
    expect(you).not.toEqual(they);
    for (const invariant of ['summary', 'Nell', 'financial']) {
      expect(you.toLowerCase()).toContain(invariant.toLowerCase());
      expect(they.toLowerCase()).toContain(invariant.toLowerCase());
    }
  });

  it('<TierCeiling> renders exactly the module copy (the screens render through it)', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { TierCeiling } = await import('@/lib/permissions/tier-ceiling');
    const { createElement } = await import('react');
    for (const tier of tiers.INVITABLE_TIERS) {
      for (const person of ['they', 'you'] as const) {
        const html = renderToStaticMarkup(
          createElement(TierCeiling, { tier, person, subjectNames: ['Nell', 'Marcus'] }),
        );
        const copy = tiers.ceilingCopy(tier, { person, subjectNames: ['Nell', 'Marcus'] });
        expect(html).toContain(
          copy.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;'),
        );
      }
    }
  });
});
