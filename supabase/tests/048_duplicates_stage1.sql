-- ============================================================================
-- 4A · M6 — stage-1 duplicates (slice-4 plan M6; TSD §4.7 point 1;
-- PRD §8.9; ADR-0008 B1's recorded decision: the §4.7 edges append WITH
-- their machinery).
--
-- The contract these tests pin:
--   · hc.arrival_transitions appends THREE edges: the post-scan
--     human-wait entry (scan: stored → duplicate_suspected) and the two
--     resolution exits (gate: duplicate_suspected → scanned |
--     nothing_filed). ING-10's exact-set pin (027) re-pins same commit.
--   · hc.detect_duplicate — the exact content_sha256 match against
--     NON-DELETED arrivals in the circle (the same file forwarded
--     twice; stage-2's key-field match is slice 5), run INSIDE
--     finalize_scan's transaction: a CLEAN verdict with a live exact
--     match lands duplicate_suspected instead of scanned. The safety
--     answer still lands (scan_verdict clean + scan_at + cache) — the
--     duplicate question is held by the STATE, never by muddying the
--     verdict. Owner-only, non-definer, granted to nobody (the
--     write-halves pattern).
--   · hc.resolve_duplicate(p_arrival, p_resolution) — member surface,
--     manage-gated like cancel, R-rule lock, freeze-first named
--     (Q5 order), DEF-10 one-shape refusals. 'different' resumes to the
--     gate (a real gate lease + CAS edge + outbox re-queue — the SND-02
--     release precedent); 'same_thing' terminalizes nothing_filed with
--     reason duplicate_of_arrival, the ORIGINAL retained and readable —
--     NEVER auto-discarded in either direction (attach-as-additional-
--     source needs a filed document; refined with slices 5/6).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(24);

-- ----------------------------------------------------------------------------
-- Helpers (the 044/047 pattern).
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

-- Drive an arrival to 'stored' carrying p_sha, then run a CLEAN scan;
-- returns the arrival (zero-uuid sentinel on any fixture failure).
create function pg_temp.scan_clean(p_key text, p_sha bytea) returns uuid
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
  v_lease := pg_temp.claim(v_arr, 'scan');
  v_out := pg_temp.pipe(format(
    $q$ select hc.finalize_scan(%L, %L, 'clean', '{}'::jsonb)::text $q$,
    v_arr, v_lease));
  if v_out is distinct from 'advanced' then return pg_temp.zid(); end if;
  return v_arr;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Rosa'), (u2, 'member', 'Stranger');
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, format($sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', %L)),
    '{}'::text[])::text
$sql$, 'cc48-nell-' || substr(gen_random_uuid()::text, 1, 8))), true);
select set_config('t.c1', pg_temp.jf(current_setting('t.c1res'), 'circle_id'), true);
select set_config('t.s1',
  (select s.id::text from public.subjects s
   where s.circle_id = current_setting('t.c1')::uuid), true);

-- ----------------------------------------------------------------------------
-- 1–5 · The surface: edges, functions, grants, reason codes.
-- ----------------------------------------------------------------------------
select is((
  select count(*)::int from hc.arrival_transitions t
  where (t.stage, t.from_state::text, t.to_state::text) in
        (('scan', 'stored', 'duplicate_suspected'),
         ('gate', 'duplicate_suspected', 'scanned'),
         ('gate', 'duplicate_suspected', 'nothing_filed'))), 3,
  'the three §4.7 stage-1 edges are IN the closed allowlist (appended with their machinery, as B1 recorded)');

select has_function('hc', 'detect_duplicate', array['uuid', 'uuid', 'bytea']::name[],
  'hc.detect_duplicate exists — the exact-sha check');
select has_function('hc', 'resolve_duplicate', array['uuid', 'text']::name[],
  'hc.resolve_duplicate(p_arrival, p_resolution) exists — the member surface');

create temp view fn_exec48 as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(
  exists (select 1 from fn_exec48 where proname = 'resolve_duplicate'
                                    and rolname = 'authenticated')
  and not exists (select 1 from fn_exec48 where proname = 'resolve_duplicate'
                    and rolname in ('anon', 'hc_pipeline', 'hc_admin'))
  and not exists (select 1 from fn_exec48 where proname = 'detect_duplicate'
                    and rolname <> 'hc_internal'),
  'resolve is the member''s act; detect is reachable ONLY inside the scan finalizer (owner-only, the write-halves pattern)');

select is((
  select count(*)::int from hc.reason_codes
  where code in ('duplicate_resolved_different', 'duplicate_of_arrival')), 2,
  'the two resolution reason codes are seeded (duplicate_sha256 has existed since 1C)');

-- ----------------------------------------------------------------------------
-- 6–10 · Detection inside the scan finalizer.
-- ----------------------------------------------------------------------------
select set_config('t.a1',
  pg_temp.scan_clean('k48-a1', extensions.digest('twice', 'sha256'))::text, true);
select is((
  select a.state::text from public.arrivals a
  where a.id = current_setting('t.a1')::uuid),
  'scanned', 'the FIRST arrival of a sha scans clean to scanned — no false suspect');

select set_config('t.a2',
  pg_temp.scan_clean('k48-a2', extensions.digest('twice', 'sha256'))::text, true);
select is((
  select a.state::text from public.arrivals a
  where a.id = current_setting('t.a2')::uuid),
  'duplicate_suspected',
  'the SAME file arriving twice lands duplicate_suspected — the §4.7 point-1 catch');

select ok((
  select a.scan_verdict = 'clean' and a.scan_at is not null
  from public.arrivals a where a.id = current_setting('t.a2')::uuid),
  'the safety answer still lands — the duplicate question is held by the STATE, never by muddying the verdict');

select is((
  select e.reason_code from public.arrival_events e
  where e.arrival_id = current_setting('t.a2')::uuid
    and e.to_state = 'duplicate_suspected'),
  'duplicate_sha256', 'the suspect event carries its normalized reason');

do $$
declare b1 uuid;
begin
  b1 := pg_temp.scan_clean('k48-b1', extensions.digest('gone', 'sha256'));
  update public.arrivals set deleted_at = now() where id = b1;
  perform set_config('t.b2',
    pg_temp.scan_clean('k48-b2', extensions.digest('gone', 'sha256'))::text, true);
end $$;
select is((
  select a.state::text from public.arrivals a
  where a.id = current_setting('t.b2')::uuid),
  'scanned', 'a DELETED prior copy does not suspect — the match runs over non-deleted arrivals only');

-- ----------------------------------------------------------------------------
-- 11–16 · Resolution: 'different' resumes to the gate.
-- ----------------------------------------------------------------------------
select set_config('t.rd', pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.resolve_duplicate(%L, 'different')::text $$,
  current_setting('t.a2'))), true);
select is(pg_temp.jf(current_setting('t.rd'), 'resolution'), 'different',
  'a member with manage resolves: different');
select is((
  select a.state::text from public.arrivals a
  where a.id = current_setting('t.a2')::uuid),
  'scanned', 'the arrival RESUMES to the gate''s entry state');
select is((
  select count(*)::int from public.arrival_events e
  where e.arrival_id = current_setting('t.a2')::uuid
    and e.from_state = 'duplicate_suspected' and e.to_state = 'scanned'
    and e.reason_code = 'duplicate_resolved_different'), 1,
  'through a real gate lease and the CAS — one edge event, reason named');
select is((
  select count(*)::int from public.pipeline_outbox o
  where o.arrival_id = current_setting('t.a2')::uuid
    and o.reason_code = 'duplicate_resolved_different'), 1,
  'and the outbox re-queue row lands in the SAME transaction (the SND-02 release precedent)');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.resolve_duplicate(%L, 'different')::text $$,
  current_setting('t.a2'))),
  'ERROR:P0001:resolve_invalid_state',
  'an already-resolved arrival refuses with the named state diagnosis (the authorized caller''s honest answer)');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.resolve_duplicate(%L, 'discard')::text $$,
  current_setting('t.a2'))),
  'ERROR:P0001:resolve_refused',
  'there is no discard resolution — NEVER auto-discarded is also never member-discarded here');

-- ----------------------------------------------------------------------------
-- 17–20 · Resolution: 'same_thing' terminalizes, the original retained.
-- ----------------------------------------------------------------------------
do $$
begin
  perform pg_temp.scan_clean('k48-d1', extensions.digest('same', 'sha256'));
  perform set_config('t.d2',
    pg_temp.scan_clean('k48-d2', extensions.digest('same', 'sha256'))::text, true);
end $$;

select is(pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.resolve_duplicate(%L, 'same_thing')::text $$,
  current_setting('t.d2'))), 'resolution'), 'same_thing',
  'same thing: the member confirms');
select is((
  select a.state::text from public.arrivals a
  where a.id = current_setting('t.d2')::uuid),
  'nothing_filed', 'the arrival terminalizes as nothing_filed');
select is((
  select e.reason_code from public.arrival_events e
  where e.arrival_id = current_setting('t.d2')::uuid
    and e.to_state = 'nothing_filed'),
  'duplicate_of_arrival', 'with the duplicate_of_arrival reason');
select ok((
  select a.deleted_at is null and a.storage_key is not null
  from public.arrivals a where a.id = current_setting('t.d2')::uuid),
  'and the original is RETAINED and readable — never auto-discarded in either direction');

-- ----------------------------------------------------------------------------
-- 21–24 · Refusal shapes: one-shape unauthorized, wrong state named,
-- freeze first and named.
-- ----------------------------------------------------------------------------
select ok(
  pg_temp.probe(current_setting('t.u2')::uuid, format(
    $$ select hc.resolve_duplicate(%L, 'different')::text $$,
    current_setting('t.a2'))) = 'ERROR:P0001:resolve_refused'
  and pg_temp.probe(current_setting('t.u2')::uuid, format(
    $$ select hc.resolve_duplicate(%L, 'different')::text $$,
    gen_random_uuid())) = 'ERROR:P0001:resolve_refused',
  'a non-member''s real and ghost probes are byte-identical — no existence oracle');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.resolve_duplicate(%L, 'different')::text $$,
  current_setting('t.a1'))),
  'ERROR:P0001:resolve_invalid_state',
  'a scanned (never-suspected) arrival refuses with the state diagnosis — authorized callers get the truth');

do $$
declare v_arr uuid;
begin
  v_arr := pg_temp.scan_clean('k48-f1', extensions.digest('frozen', 'sha256'));
  perform set_config('t.f1', v_arr::text, true);
  update public.arrivals set state = 'duplicate_suspected' where id = v_arr;
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.resolve_duplicate(%L, 'different')::text $$,
  current_setting('t.f1'))),
  'ERROR:P0001:freeze_active',
  'a live freeze refuses NAMED, before anything else (the Q5 order)');

select ok((
  select a.state::text = 'duplicate_suspected' from public.arrivals a
  where a.id = current_setting('t.f1')::uuid)
  and not exists (select 1 from public.pipeline_outbox o
                  where o.arrival_id = current_setting('t.f1')::uuid),
  'and the refused resolution moved nothing — state held, no re-queue row');

select * from finish();
rollback;
