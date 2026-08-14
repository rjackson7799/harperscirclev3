// STEP 2 SPIKE — claim 12: can Storage be reached without the service-role
// key (storage policy with a user JWT, or a narrowly scoped custom role)?
// Decides whether the artifact route's service-role exception can shrink.
// THROWAWAY — deleted after evidence is classified (ADR-0002).
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';
import { supabaseEnv, report } from './env.mjs';

const env = supabaseEnv();
const API = env.API_URL; // http://127.0.0.1:54341
const SERVICE = env.SERVICE_ROLE_KEY;
const SECRET = env.JWT_SECRET;
const BUCKET = 'spike-artifacts';
const KEY = 'family/test.txt';

const b64u = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function mintJwt(claims) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({
    iss: 'supabase-demo', exp: Math.floor(Date.now() / 1000) + 3600, ...claims,
  }));
  const sig = b64u(createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

const call = async (method, path, token, body, contentType) => {
  const res = await fetch(`${API}/storage/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      apikey: token,
      ...(contentType ? { 'content-type': contentType } : {}),
    },
    body,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON body */ }
  return { status: res.status, data };
};

const db = new pg.Client({ connectionString: env.DB_URL });
await db.connect();

// --- setup with the service key (baseline capability, not under test) -------
await call('POST', '/bucket', SERVICE, JSON.stringify({ name: BUCKET, public: false }),
  'application/json');
const up = await call('POST', `/object/${BUCKET}/${KEY}`, SERVICE, 'hello from the spike',
  'text/plain');
report(12, 'setup: service key uploads an object', up.status === 200, `HTTP ${up.status}`);

const signBody = JSON.stringify({ expiresIn: 30 });

// --- baseline: service key can sign ----------------------------------------
const s0 = await call('POST', `/object/sign/${BUCKET}/${KEY}`, SERVICE, signBody,
  'application/json');
report(12, 'baseline: service key mints a 30s signed URL', s0.status === 200,
  `HTTP ${s0.status}`);

// --- probe 1: authenticated JWT, NO storage policy -> must refuse ----------
const userJwt = mintJwt({ sub: randomUUID(), role: 'authenticated', aud: 'authenticated' });
const s1 = await call('POST', `/object/sign/${BUCKET}/${KEY}`, userJwt, signBody,
  'application/json');
report(12, 'authenticated JWT with no storage policy is refused',
  s1.status >= 400, `HTTP ${s1.status}`);

// --- probe 2: authenticated JWT + a select policy on storage.objects -------
await db.query(`
  create policy spike_read on storage.objects
  for select to authenticated using (bucket_id = '${BUCKET}')`);
const s2 = await call('POST', `/object/sign/${BUCKET}/${KEY}`, userJwt, signBody,
  'application/json');
report(12, 'authenticated JWT + storage select policy mints a signed URL',
  s2.status === 200, `HTTP ${s2.status}`);

if (s2.status === 200 && s2.data?.signedURL) {
  const fetched = await fetch(`${API}/storage/v1${s2.data.signedURL}`);
  const text = await fetched.text();
  report(12, 'the user-minted signed URL streams the bytes',
    fetched.status === 200 && text === 'hello from the spike', `HTTP ${fetched.status}`);
} else {
  report(12, 'the user-minted signed URL streams the bytes', false, 'no URL to fetch');
}

// --- probe 3: a narrowly scoped custom role --------------------------------
// If the Storage API honours an arbitrary JWT role claim backed by a real
// Postgres role, the artifact route could hold a credential that can read
// storage and nothing else.
let probe3;
try {
  await db.query(`create role hc_spike_reader nologin`);
  await db.query(`grant usage on schema storage to hc_spike_reader`);
  await db.query(`grant select on storage.objects, storage.buckets to hc_spike_reader`);
  await db.query(`
    create policy spike_read_custom on storage.objects
    for select to hc_spike_reader using (bucket_id = '${BUCKET}')`);
  // storage-api must be able to SET ROLE into it
  await db.query(`grant hc_spike_reader to supabase_storage_admin`).catch(() => {});
  const customJwt = mintJwt({ sub: randomUUID(), role: 'hc_spike_reader' });
  probe3 = await call('POST', `/object/sign/${BUCKET}/${KEY}`, customJwt, signBody,
    'application/json');
  report(12, 'custom scoped role via JWT role claim', null,
    `HTTP ${probe3.status} ${JSON.stringify(probe3.data)}`);
} catch (e) {
  report(12, 'custom scoped role via JWT role claim', null, `setup failed: ${e.message}`);
}

// --- cleanup ----------------------------------------------------------------
await db.query(`drop policy if exists spike_read on storage.objects`);
await db.query(`drop policy if exists spike_read_custom on storage.objects`);
await db.query(`drop role if exists hc_spike_reader`).catch(() => {});
await call('DELETE', `/object/${BUCKET}/${KEY}`, SERVICE);
await call('DELETE', `/bucket/${BUCKET}`, SERVICE);
await db.end();
console.log('storage probe complete');
