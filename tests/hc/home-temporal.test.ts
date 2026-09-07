import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pg from 'pg';

// Execute the ACTUAL wrappers' inner selection against CTE-only synthetic
// rows. No inserts, fixtures, reset, role switch or schema changes. The clock
// is bound in the captured SQL so UTC/local boundaries are deterministic.
let captured = '';
vi.mock('@/lib/db/request-role', () => ({
  withRequestRole: async (_role: unknown, _claims: unknown, fn: (q: unknown) => Promise<unknown>) =>
    fn({ query: async (sql: string) => { captured = sql; return { rows: [] }; } }),
}));

const db = new pg.Client({
  connectionString: process.env.HC_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54342/postgres',
});
beforeAll(async () => { await db.connect(); await db.query('begin read only'); });
afterAll(async () => { await db.query('rollback').catch(() => {}); await db.end(); });

function innerSelection(sql: string) {
  const marker = 'e.id in (';
  const start = sql.indexOf(marker) + marker.length;
  expect(start).toBeGreaterThan(marker.length);
  let depth = 1;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    if (sql[i] === ')' && --depth === 0) return sql.slice(start, i);
  }
  throw new Error('Home query has no complete inner selection');
}

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const SUBJECT = '22222222-0000-4000-8000-000000000002';
const EVENT = 'eeeeeeee-0000-4000-8000-000000000001';
const cases = [
  { name: 'Honolulu today after UTC noon', now: '2026-09-07T18:00Z', date: '2026-09-07', zone: 'Pacific/Honolulu', upcoming: true },
  { name: 'Honolulu last minute of local date', now: '2026-09-08T09:59Z', date: '2026-09-07', zone: 'Pacific/Honolulu', upcoming: true },
  { name: 'Honolulu next local day', now: '2026-09-08T10:01Z', date: '2026-09-07', zone: 'Pacific/Honolulu', upcoming: false },
  { name: 'Honolulu tomorrow while server is already tomorrow', now: '2026-09-07T01:00Z', date: '2026-09-07', zone: 'Pacific/Honolulu', upcoming: true },
  { name: 'Tokyo local day ahead of server', now: '2026-09-07T16:00Z', date: '2026-09-08', zone: 'Asia/Tokyo', upcoming: true },
  { name: 'Tokyo yesterday while server is still yesterday', now: '2026-09-07T16:00Z', date: '2026-09-07', zone: 'Asia/Tokyo', upcoming: false },
  { name: 'stored zone wins over subject zone', now: '2026-09-07T16:00Z', date: '2026-09-07', zone: 'Asia/Tokyo', subjectZone: 'Pacific/Honolulu', upcoming: false },
  { name: 'missing stored zone falls back to subject zone', now: '2026-09-07T18:00Z', date: '2026-09-07', zone: null, subjectZone: 'Pacific/Honolulu', upcoming: true },
];

async function selected(which: 'upcoming' | 'past', row: {
  now: string; date?: string; zone?: string | null; subjectZone?: string;
  local?: string; instant?: string; floating?: boolean;
}) {
  const tl = await import('@/lib/hc/timeline');
  if (which === 'upcoming') await tl.upcomingEvents({}, CIRCLE);
  else await tl.latestEventPerSubject({}, CIRCLE);
  const sql = innerSelection(captured)
    .replaceAll('public.timeline_events', 'event_fixture')
    .replaceAll('public.subjects', 'subject_fixture')
    .replaceAll('now()', '$3::timestamptz')
    .replaceAll('current_date', "($3::timestamptz at time zone 'UTC')::date");
  const result = await db.query(`with
    knobs as (select $2::integer as n),
    event_fixture as (
      select '${EVENT}'::uuid id, $1::uuid circle_id, '${SUBJECT}'::uuid subject_id,
        null::timestamptz deleted_at, $4::date occurred_on, $5::text occurred_zone,
        $6::timestamp local_at, $7::timestamptz instant, $8::boolean is_floating,
        $3::timestamptz approved_at),
    subject_fixture as (select '${SUBJECT}'::uuid id, $9::text timezone)
    ${sql}`, [CIRCLE, 4, row.now, row.date ?? null, row.zone ?? null,
    row.local ?? null, row.instant ?? null, row.floating ?? false,
    row.subjectZone ?? row.zone ?? 'Pacific/Honolulu']);
  return result.rows.some((r) => r.id === EVENT);
}

describe('Home temporal eligibility at real PostgreSQL boundaries', () => {
  it.each(cases)('$name', async (row) => {
    expect(await selected('upcoming', row)).toBe(row.upcoming);
    expect(await selected('past', row)).toBe(!row.upcoming);
  });
  it('zoned appointments use their instant on either side of a DST fallback', async () => {
    const row = { now: '2026-11-01T06:00Z', local: '2026-11-01T01:30', instant: '2026-11-01T06:30Z' };
    expect(await selected('upcoming', row)).toBe(true);
    expect(await selected('past', row)).toBe(false);
    expect(await selected('upcoming', { ...row, now: '2026-11-01T07:00Z' })).toBe(false);
    expect(await selected('past', { ...row, now: '2026-11-01T07:00Z' })).toBe(true);
  });
  it('floating times never acquire an implicit UTC instant', async () => {
    for (const now of ['2026-09-07T08:00Z', '2026-09-07T18:00Z']) {
      const row = { now, local: '2026-09-07T12:00', floating: true };
      expect(await selected('upcoming', row)).toBe(false);
      expect(await selected('past', row)).toBe(false);
    }
  });
  it('an unrecognized recorded zone cannot break the whole Home read or silently choose a different zone', async () => {
    const row = { now: '2026-09-07T18:00Z', date: '2026-09-07', zone: 'Unknown/Place' };
    expect(await selected('upcoming', row)).toBe(false);
    expect(await selected('past', row)).toBe(false);
  });
});
