// Actual Admin boundary integration tests. Fixed loopback; no hosted override.
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  throw new Error('Disposable GitHub runner required');
}
const report = { checks: [], stage: 'setup' };
const url = 'postgresql://postgres:postgres@127.0.0.1:54342/postgres';
const connections = [];
async function connection() {
  const c = new pg.Client({ connectionString: url, statement_timeout: 15000 });
  await c.connect(); connections.push(c); return c;
}
function check(ok, name) {
  if (!ok) { report.failedCheck = name; throw new Error('assertion failed'); }
  report.checks.push(name);
}
function totp(secret) {
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) {
    const value = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
    if (value < 0) throw new Error('invalid fixture secret');
    bits += value.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  return ((digest.readUInt32BE(digest[19] & 15) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
async function admitted(c, user, session, inTransaction = false) {
  if (!inTransaction) await c.query('begin');
  await c.query('set local role hc_admin');
  await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({
    sub:user, session_id:session, aal:'aal2', exp:Math.floor(Date.now()/1000)+3600,
  })]);
  const result = await c.query('select admin_ops.read_platform_stats($1) as result', [randomUUID()]);
  await c.query('reset role');
  if (!inTransaction) await c.query('commit');
  return result.rows[0].result.kind === 'ok';
}
async function register(c, user) {
  await c.query("insert into public.accounts(id,kind,display_name) values($1,'admin','Synthetic operator')", [user]);
  await c.query('insert into public.admin_users(account_id,mfa_enrolled_at) values($1,now())', [user]);
}
async function removeFixture(c, user) {
  await c.query('delete from public.admin_users where account_id=$1', [user]);
  await c.query('delete from public.accounts where id=$1', [user]);
  await c.query('delete from auth.users where id=$1', [user]);
}
async function blocking(observer, waiter, blocker) {
  for (let i = 0; i < 100; i++) {
    const r = await observer.query('select $2::int=any(pg_blocking_pids($1)) as blocked', [waiter, blocker]);
    if (r.rows[0].blocked) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('expected lock dependency absent');
}
let db;
try {
  db = await connection();
  check((await db.query('select count(*)::int as n from auth.users')).rows[0].n === 0, 'fresh runner has no auth users');
  report.stage = 'real MFA lifecycle';
  const status = JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '--output', 'json'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  check(status.API_URL === 'http://127.0.0.1:54341', 'auth endpoint is fixed loopback');
  const auth = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }).auth;
  const signup = await auth.signUp({ email: `admin-probe-${randomUUID()}@example.invalid`, password: `${randomUUID()}Aa9!` });
  check(!signup.error && !!signup.data.session, 'real signup creates session');
  const user = signup.data.user.id;
  await register(db,user);
  const enroll = await auth.mfa.enroll({ factorType: 'totp' });
  check(!enroll.error && !!enroll.data?.totp?.secret, 'real TOTP enrollment succeeds');
  const factor = enroll.data.id;
  const initial = await db.query('select status from hc.admin_auth_factors where id=$1', [factor]);
  check(initial.rows[0]?.status === 'unverified', 'unverified factor mirrored');
  const verified = await auth.mfa.challengeAndVerify({ factorId: factor, code: totp(enroll.data.totp.secret) });
  check(!verified.error, 'real TOTP challenge succeeds');
  const token = (await auth.getSession()).data.session.access_token;
  const claims = (await auth.getClaims(token)).data.claims;
  check(claims.aal === 'aal2' && await admitted(db, user, claims.session_id), 'real aal2 session and bound verified factor mirrored');
  const unenroll = await auth.mfa.unenroll({ factorId: factor });
  check(!unenroll.error, 'real factor removal succeeds');
  check(!await admitted(db, user, claims.session_id), 'factor removal denies prior aal2 session');
  check(!(await auth.signOut({ scope: 'global' })).error, 'global signout succeeds');
  const sessions = await db.query('select count(*)::int as n from hc.admin_auth_sessions where account_id=$1', [user]);
  check(sessions.rows[0].n === 0, 'global signout removes mirrored sessions');
  const stale = await auth.getUser(token);
  report.staleTokenGetUserAccepted = !stale.error && !!stale.data.user;
  await removeFixture(db,user);

  report.stage = 'concurrent revocation';
  const reader = await connection(); const writer = await connection();
  const readerPid = (await reader.query('select pg_backend_pid() as pid')).rows[0].pid;
  const writerPid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
  for (const target of ['mfa_factors', 'sessions']) {
    for (const order of ['revoke-first', 'read-first', 'revoke-rollback']) {
      const u = randomUUID(), f = randomUUID(), s = randomUUID();
      await db.query("insert into auth.users(id,aud,role,email) values($1,'authenticated','authenticated',$2)", [u, `${u}@example.invalid`]);
      await db.query("insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values($1,$2,'totp','verified',now(),now())", [f,u]);
      await db.query("insert into auth.sessions(id,user_id,factor_id,aal) values($1,$2,$3,'aal2')", [s,u,f]);
      await register(db,u);
      await reader.query('begin'); await writer.query('begin');
      const remove = () => writer.query(`delete from auth.${target} where id=$1`, [target === 'sessions' ? s : f]);
      if (order === 'read-first') {
        check(await admitted(reader,u,s,true), `${target}: read before revocation admits`);
        const pending = remove().then(() => null, e => e);
        await blocking(db,writerPid,readerPid);
        await reader.query('commit');
        if (await pending) throw new Error('revocation failed after read');
        await writer.query('commit');
        check(!await admitted(db,u,s), `${target}: read-first revocation denies next read`);
      } else {
        await remove();
        const pending = admitted(reader,u,s,true).then(value => ({value}), () => ({failed:true}));
        await blocking(db,readerPid,writerPid);
        await writer.query(order === 'revoke-first' ? 'commit' : 'rollback');
        const result = await pending;
        check(!result.failed && result.value === (order === 'revoke-rollback'), `${target}: ${order} controls waiting read`);
        await reader.query('commit');
      }
      await removeFixture(db,u);
    }
  }
  report.result = 'PASS';
} catch {
  report.result = 'FAIL';
  // Only fixed local check names are exposed; never auth responses or tokens.
  report.failure = 'Probe failed at the recorded stage; raw error suppressed';
  process.exitCode = 1;
} finally {
  for (const c of connections) await c.end().catch(() => {});
  writeFileSync('admin-live-result.json', JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
