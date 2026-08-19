-- ============================================================================
-- 4A · M2 — the store/scan outcome writers the 1C substrate deliberately
-- lacks (docs/review/slice-4-plan.md M2; TSD §4.3/§4.5 as amended by
-- A5/A6; the D9 shape: transition-gated, one transaction, owner-only
-- write halves).
--
-- The contract these tests pin:
--   · hc.finalize_store(p_arrival, p_lease, p_storage_key, p_sha256,
--     p_mime_detected, p_byte_size) — gates received → stored through the
--     CAS (fence, graph, freeze carve-out all inherited); verifies the
--     content-addressed key shape circle/<circle>/arrival/<arrival>/<sha>
--     EXACTLY; re-checks the P5 caps against MEASURED bytes; writes
--     storage_key/content_sha256/mime_detected/byte_size only on a WON
--     transition. A lost transition (stale lease, cancelled) writes
--     nothing — the ING-08 orphan-row class extended to this finalizer.
--     store_failed stays the naked CAS edge (nothing was kept ⇒ nothing
--     to write; the graph already carries received → store_failed).
--   · hc.finalize_scan(p_arrival, p_lease, p_verdict, p_detail) — gates
--     stored → scanned | quarantined | scan_unavailable |
--     scan_inconclusive from the scanner adapter's four states (§1.6);
--     writes scan_verdict/scan_at on a won transition; caches DEFINITIVE
--     verdicts (clean 7-day freshness, infected retained — PRD §11.5) in
--     public.scan_results keyed by the arrival's own content_sha256;
--     unavailable/inconclusive are never cached (retryable is not a
--     fact). The four verdicts NEVER collapse (AC-INBOX-15).
--   · public.scan_results — sha256 → verdict cache, doubling as §11.5's
--     malware hash+verdict retention: zero request-path reach, RLS
--     forced; hc.scan_cache_lookup(p_sha256) is the worker's cache-hit
--     read (live rows only); hc.expire_scan_results() is the retention
--     sweep leg (clean rows past their 7 days deleted; infected rows
--     RETAINED — the §11.5 evidence).
--   · pgmq queue 'pipeline_work' exists (§1.4) with hc_pipeline holding
--     the data plane — the 4B relay/workers enqueue and drain it.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(45);

-- ----------------------------------------------------------------------------
-- Helpers (the 043 pattern).
-- ----------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid) returns uuid language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
          'authenticated', p_id || '@fixture.local', 'x', now(), now(), now(),
          '{}', '{}');
  return p_id;
end $$;

create function pg_temp.probe(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

-- Run one scalar statement as hc_pipeline, capturing the error signature.
create function pg_temp.pipe(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute 'set local role hc_pipeline';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then p_out
              else p_out::jsonb ->> p_field end;
$$;

-- Int extractor: null (never an abort) when the probe failed.
create function pg_temp.jint(p_out text, p_field text) returns int
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then null
              else (p_out::jsonb ->> p_field)::int end;
$$;

-- The red-leg sentinel: fixture helpers return this instead of null so
-- top-level ::uuid casts never abort the file.
create function pg_temp.zid() returns uuid language sql as $$
  select '00000000-0000-0000-0000-000000000000'::uuid;
$$;

-- The scan_results row as jsonb; null when absent — and null (never an
-- abort) while the table itself does not exist yet (the red leg).
create function pg_temp.sr(p_sha bytea) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  select to_jsonb(r) into v
  from public.scan_results r where r.content_sha256 = p_sha;
  return v;
exception when undefined_table then return null;
end $$;

-- A fresh arrival at 'received' (channel upload), as the pipeline mints it.
create function pg_temp.mk_received(p_key text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  execute 'set local role hc_pipeline';
  v := hc.create_arrival(
    current_setting('t.c1')::uuid, current_setting('t.s1')::uuid, 'upload',
    p_ingest_idempotency_key => p_key);
  execute 'reset role';
  return v;
end $$;

-- Claim a stage for an arrival; returns the lease id (null on any
-- non-claimed outcome — the caller's assertions will say why).
create function pg_temp.claim(p_arr uuid, p_stage text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  execute 'set local role hc_pipeline';
  select lease_id into v from hc.claim_stage(p_arr, p_stage);
  execute 'reset role';
  return v;
end $$;

-- The canonical content-addressed key for an arrival + sha.
create function pg_temp.key_for(p_arr uuid, p_sha bytea) returns text
language sql as $$
  select 'circle/' || current_setting('t.c1') || '/arrival/' || p_arr
         || '/' || encode(p_sha, 'hex');
$$;

-- Drive one arrival to 'stored' (happy store), then claim the scan stage;
-- stashes the scan lease in t.lease. Red-leg safe: any fixture failure
-- returns the zero-uuid sentinel (assertions then fail cleanly) rather
-- than aborting the file.
create function pg_temp.mk_stored(p_key text, p_sha bytea) returns uuid
language plpgsql as $$
declare v_arr uuid; v_lease uuid; v_out text;
begin
  v_arr := pg_temp.mk_received(p_key);
  v_lease := pg_temp.claim(v_arr, 'store');
  v_out := pg_temp.pipe(format(
    $q$ select hc.finalize_store(%L, %L, %L, %L::bytea, 'application/pdf', 1024)::text $q$,
    v_arr, v_lease, pg_temp.key_for(v_arr, p_sha), p_sha));
  if v_out is distinct from 'advanced' then
    perform set_config('t.lease', pg_temp.zid()::text, true);
    return pg_temp.zid();
  end if;
  perform set_config('t.lease',
    coalesce(pg_temp.claim(v_arr, 'scan'), pg_temp.zid())::text, true);
  return v_arr;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Rosa');
  perform set_config('t.u1', u1::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', 'cc44-nell-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);
select set_config('t.c1', pg_temp.jf(current_setting('t.c1res'), 'circle_id'), true);
select set_config('t.s1',
  (select s.id::text from public.subjects s
   where s.circle_id = current_setting('t.c1')::uuid), true);

-- ----------------------------------------------------------------------------
-- 1–9 · The surface: functions, table, queue, grants, posture.
-- ----------------------------------------------------------------------------
select has_function('hc', 'finalize_store',
  array['uuid', 'uuid', 'text', 'bytea', 'text', 'bigint']::name[],
  'hc.finalize_store exists — the store outcome writer');
select has_function('hc', 'finalize_scan',
  array['uuid', 'uuid', 'text', 'jsonb']::name[],
  'hc.finalize_scan exists — the scan outcome writer');
select has_function('hc', 'scan_cache_lookup', array['bytea']::name[],
  'hc.scan_cache_lookup exists — the worker''s cache-hit read');
select has_function('hc', 'expire_scan_results', '{}'::name[],
  'hc.expire_scan_results exists — the §11.5 retention sweep leg');
select has_table('public', 'scan_results',
  'public.scan_results exists — sha256 → verdict cache and §11.5 retention');

select ok(exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'pgmq' and c.relname = 'q_pipeline_work' and c.relkind = 'r'),
  'the pgmq queue pipeline_work exists (§1.4 — the relay/workers'' transport)');

create temp view fn_exec44 as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(
  (select count(*)::int from fn_exec44
   where proname in ('finalize_store', 'finalize_scan', 'scan_cache_lookup',
                     'expire_scan_results')
     and rolname = 'hc_pipeline') = 4
  and not exists (
   select 1 from fn_exec44
   where proname in ('finalize_store', 'finalize_scan', 'scan_cache_lookup',
                     'expire_scan_results')
     and rolname in ('anon', 'authenticated', 'hc_admin')),
  'all four surfaces are hc_pipeline-only (catalog-asserted — the drain posture, never dialled)');

select ok(coalesce((
  select c.relrowsecurity and c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'scan_results'), false),
  'scan_results: RLS enabled AND forced');

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public' and c.relname = 'scan_results'
    and r.rolname in ('anon', 'authenticated', 'hc_pipeline', 'hc_admin')), 0,
  'scan_results: zero request-path/worker/admin privileges — reads ride the definers');

-- ----------------------------------------------------------------------------
-- 10–15 · finalize_store: the happy path writes everything, once,
-- transition-gated.
-- ----------------------------------------------------------------------------
do $$
declare
  v_arr uuid := pg_temp.mk_received('k-happy');
  v_sha bytea := extensions.digest('body-happy', 'sha256');
begin
  perform set_config('t.arr', v_arr::text, true);
  perform set_config('t.sha', encode(v_sha, 'hex'), true);
  perform set_config('t.lease',
    coalesce(pg_temp.claim(v_arr, 'store'), pg_temp.zid())::text, true);
end $$;

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, %L, %L::bytea, 'application/pdf', 2048)::text $$,
  current_setting('t.arr'), current_setting('t.lease'),
  pg_temp.key_for(current_setting('t.arr')::uuid, decode(current_setting('t.sha'), 'hex')),
  decode(current_setting('t.sha'), 'hex'))),
  'advanced',
  'finalize_store: a fenced, graph-legal store WINS and reports advanced');

select ok((
  select a.state = 'stored'
     and a.storage_key = pg_temp.key_for(a.id, a.content_sha256)
     and encode(a.content_sha256, 'hex') = current_setting('t.sha')
     and a.mime_detected = 'application/pdf'
     and a.byte_size = 2048
  from public.arrivals a where a.id = current_setting('t.arr')::uuid),
  'the artifact facts land WITH the won transition: content-addressed key, sha, sniffed mime, MEASURED bytes');

select ok((
  select l.closed_at is not null and l.outcome = 'advanced'
  from public.pipeline_leases l where l.id = current_setting('t.lease')::uuid),
  'the store lease closes advanced in the same transaction');

select is((
  select count(*)::int from public.arrival_events e
  where e.arrival_id = current_setting('t.arr')::uuid
    and e.from_state = 'received' and e.to_state = 'stored' and e.attempt = 1), 1,
  'exactly one received → stored event, carrying the attempt');

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, %L, %L::bytea, 'application/pdf', 2048)::text $$,
  current_setting('t.arr'), current_setting('t.lease'),
  pg_temp.key_for(current_setting('t.arr')::uuid, decode(current_setting('t.sha'), 'hex')),
  decode(current_setting('t.sha'), 'hex'))),
  'stale_lease',
  'a replayed finalize on the closed lease is absorbed (stale_lease), never re-written');

select is((
  select count(*)::int from public.arrival_events e
  where e.arrival_id = current_setting('t.arr')::uuid), 2,
  'the trail holds exactly intake + store — the replay evented nothing');

-- ----------------------------------------------------------------------------
-- 16–21 · finalize_store: input refusals fire BEFORE any transition — the
-- arrival is untouched and the lease stays open.
-- ----------------------------------------------------------------------------
do $$
declare
  v_arr uuid := pg_temp.mk_received('k-refuse');
begin
  perform set_config('t.arr', v_arr::text, true);
  perform set_config('t.lease',
    coalesce(pg_temp.claim(v_arr, 'store'), pg_temp.zid())::text, true);
end $$;

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, 'somewhere/else', %L::bytea, 'application/pdf', 10)::text $$,
  current_setting('t.arr'), current_setting('t.lease'),
  extensions.digest('body-refuse', 'sha256'))),
  'ERROR:P0001',
  'a key that is not THIS arrival''s content address refuses loudly');

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, %L, '\x0102'::bytea, 'application/pdf', 10)::text $$,
  current_setting('t.arr'), current_setting('t.lease'),
  pg_temp.key_for(current_setting('t.arr')::uuid, extensions.digest('body-refuse', 'sha256')))),
  'ERROR:P0001',
  'a sha that is not 32 bytes refuses loudly');

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, %L, %L::bytea, 'application/pdf', 52428801)::text $$,
  current_setting('t.arr'), current_setting('t.lease'),
  pg_temp.key_for(current_setting('t.arr')::uuid, extensions.digest('body-refuse', 'sha256')),
  extensions.digest('body-refuse', 'sha256'))),
  'ERROR:P0001',
  'MEASURED bytes over the P5 cap refuse — the declared size never grandfathers the real one');

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, %L, %L::bytea, %L, 10)::text $$,
  current_setting('t.arr'), current_setting('t.lease'),
  pg_temp.key_for(current_setting('t.arr')::uuid, extensions.digest('body-refuse', 'sha256')),
  extensions.digest('body-refuse', 'sha256'), repeat('x', 256))),
  'ERROR:P0001',
  'an overlong sniffed mime refuses (the P5 bound)');

select ok((
  select a.state = 'received' and a.storage_key is null
     and a.content_sha256 is null and a.mime_detected is null
  from public.arrivals a where a.id = current_setting('t.arr')::uuid),
  'every refusal left the arrival untouched: still received, no artifact facts');

select ok((
  select l.closed_at is null
  from public.pipeline_leases l where l.id = current_setting('t.lease')::uuid),
  'and the lease still open — the worker retries or fails honestly');

-- ----------------------------------------------------------------------------
-- 22–25 · finalize_store: lost transitions write NOTHING (the ING-08
-- orphan-row class extended): a superseded worker, then a cancelled state.
-- ----------------------------------------------------------------------------
do $$
declare
  v_arr uuid := pg_temp.mk_received('k-stale');
  l1 uuid; l2 uuid;
begin
  l1 := pg_temp.claim(v_arr, 'store');
  update public.pipeline_leases set deadline = now() - interval '1 second'
   where id = l1;                                    -- attempt 1 dies at the provider
  l2 := pg_temp.claim(v_arr, 'store');               -- attempt 2 takes ownership
  perform set_config('t.arr', v_arr::text, true);
  perform set_config('t.l1', l1::text, true);
  perform set_config('t.l2', l2::text, true);
end $$;

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, %L, %L::bytea, 'application/pdf', 10)::text $$,
  current_setting('t.arr'), current_setting('t.l1'),
  pg_temp.key_for(current_setting('t.arr')::uuid, extensions.digest('late', 'sha256')),
  extensions.digest('late', 'sha256'))),
  'stale_lease',
  'the SUPERSEDED worker''s finalize loses the fence — even arriving first');

select ok((
  select a.storage_key is null and a.content_sha256 is null and a.state = 'received'
  from public.arrivals a where a.id = current_setting('t.arr')::uuid),
  'and wrote NOTHING — no orphaned artifact facts on a lost transition (ING-08''s class)');

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, %L, %L::bytea, 'application/pdf', 10)::text $$,
  current_setting('t.arr'), current_setting('t.l2'),
  pg_temp.key_for(current_setting('t.arr')::uuid, extensions.digest('late', 'sha256')),
  extensions.digest('late', 'sha256'))),
  'advanced',
  'the CURRENT attempt finalizes normally after the late worker was refused');

do $$
declare
  v_arr uuid := pg_temp.mk_received('k-cancel');
  l1 uuid;
begin
  l1 := pg_temp.claim(v_arr, 'store');
  update public.arrivals set state = 'cancelled', cancelled_at = now()
   where id = v_arr;                -- fixture-level: the CAS diagnosis is
                                    -- state-driven whatever produced it
  perform set_config('t.arr', v_arr::text, true);
  perform set_config('t.l1', l1::text, true);
end $$;

select is(pg_temp.pipe(format(
  $$ select hc.finalize_store(%L, %L, %L, %L::bytea, 'application/pdf', 10)::text $$,
  current_setting('t.arr'), current_setting('t.l1'),
  pg_temp.key_for(current_setting('t.arr')::uuid, extensions.digest('c', 'sha256')),
  extensions.digest('c', 'sha256'))),
  'cancelled',
  'a cancelled arrival answers cancelled (discard-and-GC signal) and takes no artifact facts');

-- ----------------------------------------------------------------------------
-- 26–36 · finalize_scan: four verdicts, four distinct exits, definitive
-- verdicts cached, retryable ones not.
-- ----------------------------------------------------------------------------
select set_config('t.arr',
  pg_temp.mk_stored('k-scan-clean', extensions.digest('scan-clean', 'sha256'))::text, true);

select is(pg_temp.pipe(format(
  $$ select hc.finalize_scan(%L, %L, 'clean', '{"engine":"clamav"}'::jsonb)::text $$,
  current_setting('t.arr'), current_setting('t.lease'))),
  'advanced', 'clean: stored → scanned');

select ok((
  select a.state = 'scanned' and a.scan_verdict = 'clean' and a.scan_at is not null
  from public.arrivals a where a.id = current_setting('t.arr')::uuid),
  'the verdict and its moment land on the arrival');

select ok(
  (pg_temp.sr(extensions.digest('scan-clean', 'sha256')) ->> 'verdict') = 'clean'
  and (pg_temp.sr(extensions.digest('scan-clean', 'sha256')) ->> 'expires_at')::timestamptz
        > now() + interval '6 days',
  'a clean verdict is cached with 7-day freshness (the cache half)');

select set_config('t.arr',
  pg_temp.mk_stored('k-scan-inf', extensions.digest('scan-inf', 'sha256'))::text, true);

select is(pg_temp.pipe(format(
  $$ select hc.finalize_scan(%L, %L, 'infected', '{"sig":"EICAR"}'::jsonb)::text $$,
  current_setting('t.arr'), current_setting('t.lease'))),
  'advanced', 'infected: stored → quarantined — the scanner CONFIRMED malware');

select ok((
  select a.state = 'quarantined' and a.scan_verdict = 'infected'
  from public.arrivals a where a.id = current_setting('t.arr')::uuid),
  'quarantine is its own state, never collapsed with not-knowing (AC-INBOX-15)');

select ok(
  pg_temp.sr(extensions.digest('scan-inf', 'sha256')) is not null
  and (pg_temp.sr(extensions.digest('scan-inf', 'sha256')) ->> 'verdict') = 'infected'
  and (pg_temp.sr(extensions.digest('scan-inf', 'sha256')) ->> 'expires_at') is null,
  'the malware hash+verdict is RETAINED (expires_at null) — PRD §11.5''s evidence');

select is((
  select e.reason_code from public.arrival_events e
  where e.arrival_id = current_setting('t.arr')::uuid and e.to_state = 'quarantined'),
  'scan_infected', 'the quarantine event carries its normalized reason');

select set_config('t.arr',
  pg_temp.mk_stored('k-scan-un', extensions.digest('scan-un', 'sha256'))::text, true);
select is(pg_temp.pipe(format(
  $$ select hc.finalize_scan(%L, %L, 'unavailable', '{}'::jsonb)::text $$,
  current_setting('t.arr'), current_setting('t.lease'))),
  'advanced', 'unavailable: stored → scan_unavailable — we do not know, said plainly');
select ok(
  pg_temp.sr(extensions.digest('scan-un', 'sha256')) is null
  and (select a.state = 'scan_unavailable' and a.scan_verdict = 'unavailable'
       from public.arrivals a where a.id = current_setting('t.arr')::uuid),
  'not-knowing is never cached — a scanner outage is not a fact about the bytes');

select set_config('t.arr',
  pg_temp.mk_stored('k-scan-inc', extensions.digest('scan-inc', 'sha256'))::text, true);
select is(pg_temp.pipe(format(
  $$ select hc.finalize_scan(%L, %L, 'inconclusive', '{}'::jsonb)::text $$,
  current_setting('t.arr'), current_setting('t.lease'))),
  'advanced', 'inconclusive: stored → scan_inconclusive — the fourth verdict, distinct');
select ok(
  pg_temp.sr(extensions.digest('scan-inc', 'sha256')) is null
  and (select a.state = 'scan_inconclusive' from public.arrivals a
       where a.id = current_setting('t.arr')::uuid),
  'inconclusive is not cached either');

-- ----------------------------------------------------------------------------
-- 37–40 · finalize_scan: refusals and lost transitions.
-- ----------------------------------------------------------------------------
select set_config('t.arr',
  pg_temp.mk_stored('k-scan-bad', extensions.digest('scan-bad', 'sha256'))::text, true);

select is(pg_temp.pipe(format(
  $$ select hc.finalize_scan(%L, %L, 'suspicious', '{}'::jsonb)::text $$,
  current_setting('t.arr'), current_setting('t.lease'))),
  'ERROR:P0001',
  'a verdict outside the adapter''s four states refuses loudly — no fifth state sneaks in');

select is(pg_temp.pipe(format(
  $$ select hc.finalize_scan(%L, %L, 'clean', %L::jsonb)::text $$,
  current_setting('t.arr'), current_setting('t.lease'),
  (select jsonb_build_object('blob', repeat('x', 17000))::text))),
  'ERROR:P0001',
  'an oversized detail refuses (the 16 KB auth_detail precedent)');

do $$
begin
  update public.pipeline_leases set deadline = now() - interval '1 second'
   where id = current_setting('t.lease')::uuid;
  perform set_config('t.l2',
    coalesce(pg_temp.claim(current_setting('t.arr')::uuid, 'scan'), pg_temp.zid())::text, true);
exception when others then null;   -- red leg: the missing surface is the finding
end $$;

select is(pg_temp.pipe(format(
  $$ select hc.finalize_scan(%L, %L, 'clean', '{}'::jsonb)::text $$,
  current_setting('t.arr'), current_setting('t.lease'))),
  'stale_lease',
  'the superseded scanner''s verdict is refused by the fence');

select ok((
  select a.scan_verdict is null and a.scan_at is null and a.state = 'stored'
  from public.arrivals a where a.id = current_setting('t.arr')::uuid)
  and pg_temp.sr(extensions.digest('scan-bad', 'sha256')) is null,
  'and wrote NOTHING — no verdict, no cache row, on a lost transition');

-- ----------------------------------------------------------------------------
-- 41–44 · The cache read and the retention sweep.
-- ----------------------------------------------------------------------------
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.scan_cache_lookup(%L::bytea)::text $$,
  extensions.digest('scan-clean', 'sha256'))), 'verdict'),
  'clean', 'the worker''s cache-hit read answers a live clean verdict');

select is(pg_temp.pipe(format(
  $$ select coalesce(hc.scan_cache_lookup(%L::bytea)::text, '<null>') $$,
  extensions.digest('never-seen', 'sha256'))),
  '<null>', 'an unknown sha is a miss — null, not an error');

do $$
begin
  update public.scan_results set expires_at = now() - interval '1 second'
   where content_sha256 = extensions.digest('scan-clean', 'sha256');
exception when others then null;   -- red leg: the table is the finding
end $$;

select is(pg_temp.pipe(format(
  $$ select coalesce(hc.scan_cache_lookup(%L::bytea)::text, '<null>') $$,
  extensions.digest('scan-clean', 'sha256'))),
  '<null>', 'a clean verdict past its 7 days is a MISS — freshness is the cache contract');

select ok(
  coalesce(pg_temp.jint(pg_temp.pipe('select hc.expire_scan_results()::text'),
                        'removed') >= 1, false)
  and pg_temp.sr(extensions.digest('scan-clean', 'sha256')) is null
  and pg_temp.sr(extensions.digest('scan-inf', 'sha256')) is not null,
  'the sweep deletes expired CLEAN rows and RETAINS the malware evidence (§11.5, both halves)');

-- ----------------------------------------------------------------------------
-- 45 · The pgmq privilege split: hc_pipeline rides the DATA plane
-- (send/read family) and never the control plane (create/drop/purge) —
-- catalog-asserted, the standing closure discipline.
-- ----------------------------------------------------------------------------
create temp view pgmq_exec as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'pgmq' and a.privilege_type = 'EXECUTE';

select ok(
  not exists (select 1 from pgmq_exec
              where proname in ('create', 'drop_queue', 'purge_queue')
                and rolname = 'hc_pipeline')
  and exists (select 1 from pgmq_exec
              where proname = 'send' and rolname = 'hc_pipeline')
  and exists (select 1 from pgmq_exec
              where proname = 'read' and rolname = 'hc_pipeline'),
  'hc_pipeline holds the pgmq DATA plane (send/read granted) and none of the control plane (create/drop/purge absent)');

select * from finish();
rollback;
