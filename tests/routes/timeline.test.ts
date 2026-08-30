import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ============================================================================
// 7B B1 · the Timeline floor made honest (OW-20; the slice-7 plan's
// measurement 1). `timeline/page.tsx:29` selected `title, happened_on`; the
// columns are `summary` and §2.7's temporal shape (`occurred_on` ·
// `local_at / iana_zone / instant` · `is_floating`). Before B3 builds the
// thread on top of it:
//
//   · the page selects the columns that EXIST and renders each temporal
//     shape by its own rule (§8.6 "dates are human", §2.7: a date is a date,
//     an appointment is a local time with its zone, a floating time says so);
//   · a read error is an ERROR STATE — never "Nothing on the timeline yet";
//   · every row is subject-labelled (AC-TL-4) and carries its ProvenanceLine
//     (AC-TL-2's floor: the approver and the date, from the row itself).
//
// Test class: MOCKED ROUTE CONTRACT (the live authority is the B4 record legs).
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

const from = vi.fn();
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ from, auth: { getClaims: vi.fn(), getUser: vi.fn() } }),
}));

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const SUBJECT = '22222222-0000-4000-8000-000000000002';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

type Row = Record<string, unknown>;
let events: Row[] = [];
let subjects: Row[] = [];
let readErrors: { timeline_events?: string; subjects?: string } = {};
const selected: Record<string, string[]> = {};

function chain(table: string, result: Row[], error: { message: string } | null) {
  const p = Promise.resolve(error ? { data: null, error } : { data: result, error: null });
  const proxy: Record<string, unknown> = {};
  for (const m of ['eq', 'is', 'in', 'order', 'limit', 'gte', 'lte', 'neq']) {
    proxy[m] = vi.fn(() => proxy);
  }
  proxy.select = vi.fn((columns: string) => {
    (selected[table] ??= []).push(columns);
    return proxy;
  });
  proxy.then = p.then.bind(p);
  proxy.catch = p.catch.bind(p);
  return proxy;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  events = [];
  subjects = [{ id: SUBJECT, first_name: 'Nell', created_at: '2026-08-01T00:00:00Z' }];
  readErrors = {};
  for (const k of Object.keys(selected)) delete selected[k];
  from.mockImplementation((table: string) => {
    if (table === 'timeline_events') {
      return chain(table, events, readErrors.timeline_events ? { message: readErrors.timeline_events } : null);
    }
    if (table === 'subjects') {
      return chain(table, subjects, readErrors.subjects ? { message: readErrors.subjects } : null);
    }
    return chain(table, [], null);
  });
});

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  const { default: Page } = await import('@/app/(app)/[circle]/timeline/page');
  return renderToStaticMarkup(
    await Page({ params: Promise.resolve({ circle: CIRCLE }), searchParams: Promise.resolve(searchParams) }),
  );
}

const base: Row = {
  circle_id: CIRCLE,
  subject_id: SUBJECT,
  kind: 'medical',
  episode_id: null,
  occurred_on: null,
  occurred_zone: null,
  local_at: null,
  iana_zone: null,
  instant: null,
  is_floating: false,
  source_arrival_id: null,
  source_proposal_id: null,
  approved_by: CLAIMS.sub,
  approved_at: '2026-08-20T10:00:00Z',
  approver_display_name: 'Sarah',
};
const DATED: Row = { ...base, id: 'e-1', summary: 'Discharged from Riverbend', occurred_on: '2026-07-12', occurred_zone: 'America/New_York' };
const APPOINTMENT: Row = {
  ...base,
  id: 'e-2',
  summary: 'Cardiology follow-up',
  local_at: '2026-09-04T15:00:00',
  iana_zone: 'America/Denver',
  instant: '2026-09-04T21:00:00Z',
};
const FLOATING: Row = { ...base, id: 'e-3', summary: 'Call from the nurse', local_at: '2026-08-01T09:30:00', is_floating: true };

describe('B1 · the floor selects the columns that exist', () => {
  it('asks for `summary` and the §2.7 temporal shape — never `title` or `happened_on`', async () => {
    await render();
    const columns = (selected.timeline_events ?? []).join(' ');
    expect(columns).toMatch(/\bsummary\b/);
    expect(columns).toMatch(/\boccurred_on\b/);
    expect(columns).toMatch(/\blocal_at\b/);
    expect(columns).toMatch(/\biana_zone\b/);
    expect(columns).toMatch(/\binstant\b/);
    expect(columns).toMatch(/\bis_floating\b/);
    expect(columns).not.toMatch(/\btitle\b/);
    expect(columns).not.toMatch(/\bhappened_on\b/);
  });
});

describe('B1 · an error is an ERROR STATE, never an empty one', () => {
  it('a refused events read renders the alert and never the empty sentence', async () => {
    readErrors.timeline_events = 'column timeline_events.title does not exist';
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).toMatch(/couldn&#x27;t load/i);
    expect(html).not.toContain('Nothing on the');
  });

  it('a refused subjects read is the same honest state', async () => {
    events = [DATED];
    readErrors.subjects = 'boom';
    const html = await render();
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('Discharged from Riverbend');
  });
});

describe('B1 · every row is subject-labelled, provenanced, and dated by its own temporal kind', () => {
  it('a dated event renders as a date; an appointment with its zone; a floating time says so', async () => {
    events = [DATED, APPOINTMENT, FLOATING];
    const html = await render();
    expect(html).toContain('Discharged from Riverbend');
    expect(html).toContain('July 12');
    expect(html).not.toContain('2026-07-12');
    expect(html).toContain('Cardiology follow-up');
    expect(html).toMatch(/September 4 · 3:00 PM MDT/);
    expect(html).toContain('Call from the nurse');
    expect(html).toContain('(no time zone given)');
    // AC-TL-4: the subject's name on every row.
    expect(html.split('Nell').length - 1).toBeGreaterThanOrEqual(3);
    // design spec §7 / AC-TL-2's floor: the approver, on every row.
    expect(html.split('class="provenance"').length - 1).toBe(3);
    expect(html).toContain('Sarah');
  });

  it('the empty state stays one sentence when there is genuinely nothing', async () => {
    const html = await render();
    expect(html).toContain('class="empty-state"');
    expect(html).not.toContain('role="alert"');
  });
});
