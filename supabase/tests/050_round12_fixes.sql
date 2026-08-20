-- ============================================================================
-- 4A · M8 — the round-12 external-pass blockers (ADR-0018 addendum;
-- findings file addendum X1/X2; PRD §11.5; TSD §4.7 point 1).
--
-- The contract these tests pin (red-first against the M6 state):
--   X1 · SAFETY-MONOTONIC scan evidence: an existing INFECTED
--        scan_results row is IMMUTABLE against a later clean verdict —
--        the §11.5 hash+verdict evidence can never be downgraded, never
--        given an expiry, never reached by the sweep. Upgrades stay
--        open (clean → infected always lands; infected re-scans refresh
--        the evidence detail; clean → clean refreshes freshness). The
--        cache read (hc.scan_cache_lookup) keeps answering 'infected'
--        so the 4B cache-hit path can never treat known-infected bytes
--        as clean.
--   X2 · CANONICAL-ORIGINAL duplicates: hc.detect_duplicate matches
--        only STRICTLY EARLIER live copies — (received_at, id) row
--        order, the deterministic total order (received_at ties inside
--        one transaction, e.g. identical attachments of one email,
--        break on id) — so of N identical live copies exactly ONE (the
--        earliest) is never a suspect, every suspect's match points at
--        an earlier arrival (no circular explanations), and the
--        outcome is scan-order-independent. The deleted-copy exclusion
--        (048:10) holds unchanged under the ordering.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(13);

-- ----------------------------------------------------------------------------
-- Helpers (the 048 pattern).
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
declare v text; m text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

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

create function pg_temp.zid() returns uuid language sql as $$
  select '00000000-0000-0000-0000-000000000000'::uuid;
$$;

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

create function pg_temp.claim(p_arr uuid, p_stage text) returns uuid
language plpgsql as $$
declare v uuid;
begin
  execute 'set local role hc_pipeline';
  select lease_id into v from hc.claim_stage(p_arr, p_stage);
  execute 'reset role';
  return v;
end $$;

-- Drive an arrival to 'stored' carrying p_sha (no scan yet).
create function pg_temp.store_only(p_key text, p_sha bytea) returns uuid
language plpgsql as $$
declare v_arr uuid; v_lease uuid; v_out text;
begin
  v_arr := pg_temp.mk_received(p_key);
  v_lease := pg_temp.claim(v_arr, 'store');
  v_out := pg_temp.pipe(format(
    $q$ select hc.finalize_store(%L, %L, %L, %L::bytea, 'application/pdf', 1024)::text $q$,
    v_arr, v_lease,
    'circle/' || current_setting('t.c1') || '/arrival/' || v_arr
      || '/' || encode(p_sha, 'hex'),
    p_sha));
  if v_out is distinct from 'advanced' then return pg_temp.zid(); end if;
  return v_arr;
end $$;

-- Scan an already-stored arrival with the given verdict + detail.
create function pg_temp.scan_only(p_arr uuid, p_verdict text, p_detail text default '{}')
returns text
language plpgsql as $$
declare v_lease uuid;
begin
  v_lease := pg_temp.claim(p_arr, 'scan');
  return pg_temp.pipe(format(
    $q$ select hc.finalize_scan(%L, %L, %L, %L::jsonb)::text $q$,
    p_arr, v_lease, p_verdict, p_detail));
end $$;

-- The canonical copy of a sha: least (received_at, id) among live copies.
create function pg_temp.canonical(p_sha bytea) returns uuid
language sql as $$
  select a.id from public.arrivals a
  where a.circle_id = current_setting('t.c1')::uuid
    and a.content_sha256 = p_sha and a.deleted_at is null
  order by a.received_at, a.id
  limit 1;
$$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Rosa');
  perform set_config('t.u1', u1::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, format($sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', %L)),
    '{}'::text[])::text
$sql$, 'cc50-nell-' || substr(gen_random_uuid()::text, 1, 8))), true);
select set_config('t.c1', pg_temp.jf(current_setting('t.c1res'), 'circle_id'), true);
select set_config('t.s1',
  (select s.id::text from public.subjects s
   where s.circle_id = current_setting('t.c1')::uuid), true);

-- ----------------------------------------------------------------------------
-- 1–5 · X1: the infected evidence row survives a later clean verdict.
-- ----------------------------------------------------------------------------
do $$
declare v uuid;
begin
  v := pg_temp.store_only('k50-x1', extensions.digest('evidence', 'sha256'));
  perform pg_temp.scan_only(v, 'infected', '{"sig": "eicar-test"}');
end $$;

select ok((
  select r.verdict = 'infected' and r.expires_at is null
  from public.scan_results r
  where r.content_sha256 = extensions.digest('evidence', 'sha256')),
  'an infected scan seeds the §11.5 evidence row: verdict infected, expires_at null (retained)');

do $$
declare v uuid;
begin
  v := pg_temp.store_only('k50-y1', extensions.digest('evidence', 'sha256'));
  perform pg_temp.scan_only(v, 'clean', '{}');
end $$;

select is((
  select r.verdict from public.scan_results r
  where r.content_sha256 = extensions.digest('evidence', 'sha256')),
  'infected',
  'a LATER clean verdict for the same sha does NOT downgrade the evidence — infected wins (safety-monotonic)');

select ok((
  select r.expires_at is null from public.scan_results r
  where r.content_sha256 = extensions.digest('evidence', 'sha256')),
  '…and the row gains NO expiry — the sweep can never reach the evidence');

select is((
  select r.detail ->> 'sig' from public.scan_results r
  where r.content_sha256 = extensions.digest('evidence', 'sha256')),
  'eicar-test',
  '…and the evidence detail is untouched by the refused downgrade');

select is(
  hc.scan_cache_lookup(extensions.digest('evidence', 'sha256')) ->> 'verdict',
  'infected',
  '…and the cache read still answers infected — known-infected bytes can never cache-hit as clean (the 4B skip-scan path is safe)');

-- ----------------------------------------------------------------------------
-- 6–8 · X1: the open directions stay open.
-- ----------------------------------------------------------------------------
do $$
declare v uuid;
begin
  v := pg_temp.store_only('k50-z1', extensions.digest('upgrade', 'sha256'));
  perform pg_temp.scan_only(v, 'clean', '{}');
  v := pg_temp.store_only('k50-w1', extensions.digest('upgrade', 'sha256'));
  perform pg_temp.scan_only(v, 'infected', '{}');
end $$;

select ok((
  select r.verdict = 'infected' and r.expires_at is null
  from public.scan_results r
  where r.content_sha256 = extensions.digest('upgrade', 'sha256')),
  'clean → infected UPGRADES: the verdict flips to infected and the expiry is removed (monotonic toward safety)');

do $$
declare v uuid;
begin
  v := pg_temp.store_only('k50-v1', extensions.digest('evidence', 'sha256'));
  perform pg_temp.scan_only(v, 'infected', '{"sig": "eicar-test-2"}');
end $$;

select ok((
  select r.verdict = 'infected' and r.expires_at is null
  from public.scan_results r
  where r.content_sha256 = extensions.digest('evidence', 'sha256')),
  'infected → infected refreshes the evidence and stays unexpiring');

do $$
declare v uuid;
begin
  v := pg_temp.store_only('k50-cc1', extensions.digest('freshness', 'sha256'));
  perform pg_temp.scan_only(v, 'clean', '{}');
  v := pg_temp.store_only('k50-cc2', extensions.digest('freshness', 'sha256'));
  perform pg_temp.scan_only(v, 'clean', '{}');
end $$;

select ok((
  select r.verdict = 'clean' and r.expires_at is not null
  from public.scan_results r
  where r.content_sha256 = extensions.digest('freshness', 'sha256')),
  'clean → clean stays a refreshable 7-day cache row — the cache half is unchanged');

-- ----------------------------------------------------------------------------
-- 9–12 · X2: canonical-original duplicates — exactly one original.
-- ----------------------------------------------------------------------------
do $$
declare a uuid; b uuid;
begin
  -- BOTH copies exist before EITHER scans (identical attachments created
  -- together — the external pass's sequential defect, no race required).
  a := pg_temp.store_only('k50-p1', extensions.digest('pair', 'sha256'));
  b := pg_temp.store_only('k50-p2', extensions.digest('pair', 'sha256'));
  perform pg_temp.scan_only(a, 'clean', '{}');
  perform pg_temp.scan_only(b, 'clean', '{}');
end $$;

select is((
  select count(*)::int from public.arrivals a
  where a.content_sha256 = extensions.digest('pair', 'sha256')
    and a.state = 'duplicate_suspected'), 1,
  'two identical copies, both stored before either scans: EXACTLY ONE is the suspect — never both');

select ok((
  select a.state = 'scanned' from public.arrivals a
  where a.id = pg_temp.canonical(extensions.digest('pair', 'sha256'))),
  '…and the non-suspect is the CANONICAL copy — least (received_at, id): the original is deterministic, not scan-order luck');

do $$
declare ids uuid[]; i int;
begin
  ids := array[
    pg_temp.store_only('k50-t1', extensions.digest('triple', 'sha256')),
    pg_temp.store_only('k50-t2', extensions.digest('triple', 'sha256')),
    pg_temp.store_only('k50-t3', extensions.digest('triple', 'sha256'))];
  -- scan in REVERSE creation order: the outcome must not depend on it.
  for i in reverse 3..1 loop
    perform pg_temp.scan_only(ids[i], 'clean', '{}');
  end loop;
end $$;

select ok((
  select count(*) filter (where a.state = 'scanned') = 1
     and count(*) filter (where a.state = 'duplicate_suspected') = 2
     and bool_and(a.state = 'scanned')
           filter (where a.id = pg_temp.canonical(extensions.digest('triple', 'sha256')))
  from public.arrivals a
  where a.content_sha256 = extensions.digest('triple', 'sha256')),
  'three identical copies scanned in reverse order: the canonical earliest is the ONE non-suspect, scan-order-independent');

select ok(
  hc.detect_duplicate(
    pg_temp.canonical(extensions.digest('pair', 'sha256')),
    current_setting('t.c1')::uuid,
    extensions.digest('pair', 'sha256')) is null
  and (
    select hc.detect_duplicate(a.id, a.circle_id, a.content_sha256)
    from public.arrivals a
    where a.content_sha256 = extensions.digest('pair', 'sha256')
      and a.id <> pg_temp.canonical(extensions.digest('pair', 'sha256')))
    = pg_temp.canonical(extensions.digest('pair', 'sha256')),
  'detect_duplicate is asymmetric: the canonical copy matches NOTHING; the later copy matches the canonical — no circular explanations');

-- ----------------------------------------------------------------------------
-- 13 · X2: the deleted-copy exclusion holds under the ordering.
-- ----------------------------------------------------------------------------
do $$
declare d1 uuid; d2 uuid;
begin
  d1 := pg_temp.store_only('k50-g1', extensions.digest('guard', 'sha256'));
  perform pg_temp.scan_only(d1, 'clean', '{}');
  update public.arrivals set deleted_at = now() where id = d1;
  d2 := pg_temp.store_only('k50-g2', extensions.digest('guard', 'sha256'));
  perform pg_temp.scan_only(d2, 'clean', '{}');
  perform set_config('t.g2', d2::text, true);
end $$;

select is((
  select a.state::text from public.arrivals a
  where a.id = current_setting('t.g2')::uuid),
  'scanned',
  'an earlier DELETED copy still never matches — the 048:10 exclusion carries under the canonical ordering');

select * from finish();
rollback;
