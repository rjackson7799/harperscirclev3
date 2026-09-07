import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { completionPromises } from '@/lib/setup/completion-copy';

// ============================================================================
// 9B U3 · /setup/complete — THE POST-SETUP DESTINATION (PRD §4.1.3, §4.7.1;
// AC-AUTH-5; slice-9 plan unit 3).
//
// Until Home existed the completion screen's only way forward was *Invite
// someone*: a founder who had just finished setup had nowhere to land but
// back through /setup, which resumes to step 4 forever. Home is where that
// goes now — and on day one Home IS this screen's own job continued, the
// forwarding address and the one instruction (§4.7.1).
//
// WHAT IS NOT REPOINTED, and why: an ACCEPTED INVITE still lands family on
// the Timeline and the care circle on their tasks. PRD §4.1.4 rule 4 says it
// in those words — "Family lands on the Timeline. Care circle lands on their
// assigned tasks. Nobody lands on an empty dashboard and nobody lands on
// Home" — and the PRD binds. tests/routes/accept.test.ts still pins both.
//
// AC-AUTH-5 is unchanged and re-asserted here: the screen names ONLY
// surfaces Phase 1 built.
//
// Test class: MOCKED ROUTE CONTRACT.
// ============================================================================

const session = { readLiveSession: vi.fn() };
vi.mock('@/lib/auth/session', () => session);

type Result = { data: unknown; error: unknown };
const TABLES = new Map<string, Result>();
function chain(table: string): Record<string, unknown> {
  const proxy: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit']) proxy[m] = () => proxy;
  const answer = (): Promise<unknown> =>
    Promise.resolve(TABLES.get(table) ?? { data: [], error: null });
  proxy.single = () => ({ then: (...a: unknown[]) => answer().then(...(a as [never])) });
  proxy.then = (...a: unknown[]) => answer().then(...(a as [never]));
  proxy.catch = (...a: unknown[]) => answer().catch(...(a as [never]));
  return proxy;
}
vi.mock('@/lib/db/user', () => ({
  asUser: async () => ({ from: (t: string) => chain(t), auth: { getClaims: vi.fn() } }),
}));

vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  },
}));

const CIRCLE = '11111111-0000-4000-8000-000000000001';
const CLAIMS = { sub: '33333333-0000-4000-8000-000000000003', role: 'authenticated' };

async function renderComplete() {
  const { default: Page } = await import('@/app/setup/complete/page');
  return renderToStaticMarkup(
    await Page({ searchParams: Promise.resolve({ circle: CIRCLE }) }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  TABLES.clear();
  session.readLiveSession.mockResolvedValue({ kind: 'signed-in', claims: CLAIMS });
  TABLES.set('subjects', {
    data: [
      {
        id: '22222222-0000-4000-8000-000000000002',
        first_name: 'Nell',
        situation: 'At home, with help twice a week',
        forwarding_local_part: 'nell.k7m2qp',
      },
    ],
    error: null,
  });
  TABLES.set('accounts', {
    data: { email: 'sarah@example.com', email_verified_at: '2026-08-01T10:00:00Z' },
    error: null,
  });
});

describe('9B U3 · the post-setup destination is Home', () => {
  it('the completion screen leads into the circle, at Home', async () => {
    const html = await renderComplete();
    expect(html).toContain(`href="/${CIRCLE}"`);
  });

  it('and it still says the one instruction, with the address it points at', async () => {
    const html = await renderComplete();
    expect(html).toContain('nell.k7m2qp@harperscircle.app');
    expect(html).toContain(completionPromises.instruction);
  });

  // AC-AUTH-5, re-asserted where the new affordance lands: nothing here
  // names a surface Phase 1 did not build.
  it('names no surface Phase 1 did not build', async () => {
    const html = await renderComplete();
    for (const unbuilt of ['Weekly Brief', 'weekly brief', 'checklist', 'Local resources']) {
      expect(html).not.toContain(unbuilt);
    }
  });

  // An unverified founder cannot invite yet — and Home is not an invite, so
  // the way into the circle does not wait on the mailbox.
  it('an unverified founder still gets the way in', async () => {
    TABLES.set('accounts', {
      data: { email: 'sarah@example.com', email_verified_at: null },
      error: null,
    });
    const html = await renderComplete();
    expect(html).toContain(`href="/${CIRCLE}"`);
    expect(html).toContain(completionPromises.inviteDisabledReason);
  });
});
