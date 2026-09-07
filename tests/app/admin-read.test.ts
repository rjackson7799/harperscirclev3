import { beforeEach, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const mock = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn(), release: vi.fn(), connect: vi.fn() }));
vi.mock('@/lib/auth/admin-session', () => ({ readAdminSession: mock.session }));
vi.mock('pg', () => ({ Pool: class { connect = mock.connect; } }));
import { asAdmin } from '@/lib/db/admin';
const client = {} as SupabaseClient;
beforeEach(() => {
  vi.resetAllMocks();
  process.env.HC_ADMIN_DB_URL = 'postgresql://synthetic.invalid/probe';
  mock.session.mockResolvedValue({ kind:'verified-session', identity:{sub:'actor',session_id:'session',aal:'aal2',exp:2000000000} });
  mock.connect.mockResolvedValue({ query:mock.query, release:mock.release });
  mock.query.mockResolvedValue({rows:[]});
  mock.query.mockImplementation(async sql => sql.startsWith('select admin_ops.')
    ? {rows:[{result:{kind:'ok',stats:{circles_total:7}}}]} : {rows:[]});
});
it('exposes no arbitrary SQL interface', () => {
  expect(Object.keys(asAdmin())).toEqual(['readPlatformStats']);
});
it.each(['denied','unavailable'])('returns %s before connecting', async kind => {
  mock.session.mockResolvedValue({kind});
  expect(await asAdmin().readPlatformStats(client)).toEqual({kind});
  expect(mock.connect).not.toHaveBeenCalled();
});
it('pins role and claims inside a committed transaction', async () => {
  expect(await asAdmin().readPlatformStats(client)).toEqual({kind:'ok',stats:{circles_total:7}});
  const calls = mock.query.mock.calls.map(c => c[0]);
  expect(calls[0]).toBe('begin');
  expect(calls).toContain('set local role hc_admin');
  expect(calls.at(-1)).toBe('commit');
  expect(mock.release).toHaveBeenCalledWith(false);
});
it('does not deliver counts while commit is pending', async () => {
  let finish!: () => void;
  let started!: () => void;
  const atCommit = new Promise<void>(resolve => { started=resolve; });
  const commit = new Promise<void>(resolve => { finish=resolve; });
  const implementation = mock.query.getMockImplementation()!;
  mock.query.mockImplementation(async (sql,...args) => {
    if(sql==='commit') { started(); await commit; return {rows:[]}; }
    return implementation(sql,...args);
  });
  let delivered=false;
  const result=asAdmin().readPlatformStats(client).then(value => {delivered=true;return value;});
  await atCommit;
  expect(delivered).toBe(false);
  finish();
  expect((await result).kind).toBe('ok');
});
it.each(['commit','select admin_ops.'])('suppresses results and destroys the connection on %s failure', async failing => {
  const implementation=mock.query.getMockImplementation()!;
  mock.query.mockImplementation(async (sql,...args) => {
    if(sql.startsWith(failing)) throw new Error('private SQL DETAIL');
    return implementation(sql,...args);
  });
  expect(await asAdmin().readPlatformStats(client)).toEqual({kind:'unavailable'});
  expect(mock.release).toHaveBeenCalledWith(true);
});
it('commits a database denial so its audit persists', async () => {
  mock.query.mockResolvedValue({rows:[{result:{kind:'denied',private:'never return'}}]});
  expect(await asAdmin().readPlatformStats(client)).toEqual({kind:'denied'});
  expect(mock.query).toHaveBeenCalledWith('commit');
});
