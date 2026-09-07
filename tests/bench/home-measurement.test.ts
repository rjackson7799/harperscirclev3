import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), dispose: vi.fn(),
  membership: vi.fn(), tasks: vi.fn(), latest: vi.fn(), upcoming: vi.fn(), recent: vi.fn(),
}));
vi.mock('@playwright/test', () => ({ request: { newContext: async () => mock } }));
vi.mock('@/lib/hc/tasks', () => ({ myMembership: mock.membership, myOpenTasks: mock.tasks, listTasks: mock.tasks }));
vi.mock('@/lib/hc/timeline', () => ({ latestEventPerSubject: mock.latest, upcomingEvents: mock.upcoming, recentEvents: mock.recent }));

const originalArgv = process.argv;
const router = '<main><h1>Home</h1><section aria-labelledby="subject-1">How Nell is</section></main>';
const dayOne = '<main><h1>Home</h1><p>Nell\'s forwarding address</p></main>';
const retry = '<main><h1>Home</h1><p role="alert">We could not load this. Try again.</p></main>';
function response(body: string, status = 200) {
  return { status: () => status, text: async () => body };
}
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  process.argv = ['node', 'benchmark', 'synthetic@example.invalid', 'synthetic-password', 'circle'];
  vi.stubEnv('RUNS', '3');
  vi.stubEnv('MODE', 'router');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'table').mockImplementation(() => {});
  mock.post.mockResolvedValue({ status: () => 303, headers: () => ({ location: '/circle' }) });
  mock.get.mockResolvedValue(response(router));
});
afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it.each([
  ['warm-up retry', 1, retry],
  ['timed retry', 6, retry],
  ['timed sign-in landing', 6, '<main><h1>Sign in</h1></main>'],
  ['timed wrong Home branch', 6, dayOne],
])('invalidates the measurement on a 200 %s response', async (_label, badIndex, body) => {
  let index = 0;
  mock.get.mockImplementation(async () => response(index++ === badIndex ? body : router));
  await expect(import('../../scripts/bench/home-p95.mjs')).rejects.toThrow();
  expect(mock.dispose).toHaveBeenCalledOnce();
  expect(console.log).not.toHaveBeenCalled();
});

it.each(['router', 'day-one'])('keeps five warm-ups and three timed samples for valid %s', async (mode) => {
  vi.stubEnv('MODE', mode);
  mock.get.mockResolvedValue(response(mode === 'router' ? router : dayOne));
  await import('../../scripts/bench/home-p95.mjs');
  expect(mock.get).toHaveBeenCalledTimes(9); // control + 5 warm + 3 timed
  expect(mock.dispose).toHaveBeenCalledOnce();
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('3 timed requests'));
});

it('includes a slow live membership read in the DB tripwire verdict', async () => {
  process.argv = ['node', 'benchmark', 'circle-id', 'account-id'];
  let clock = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  mock.membership.mockImplementation(async () => { clock += 400; return { id: 'member', tier: 'family', subjects: [] }; });
  for (const read of [mock.tasks, mock.latest, mock.upcoming, mock.recent]) {
    read.mockImplementation(async () => { clock += 10; return []; });
  }
  vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('benchmark complete'); });
  await expect(import('../../scripts/bench/home-reads-p95')).rejects.toThrow('benchmark complete');
  expect(mock.membership).toHaveBeenCalledTimes(30); // 5 warm + 25 timed
  expect(mock.membership).toHaveBeenCalledWith({ sub: 'account-id', role: 'authenticated' }, 'circle-id');
  expect(console.table).toHaveBeenCalledWith(expect.arrayContaining([
    expect.objectContaining({ read: 'myMembership', n: 25, p95_ms: 400 }),
  ]));
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('BREACH'));
});
