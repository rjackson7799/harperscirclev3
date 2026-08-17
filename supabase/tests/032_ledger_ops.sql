-- ============================================================================
-- 1D · U5 — operational surfaces: the reclassify request path (TNT-08),
-- sweep scheduling inside OPS-01's bounds, the deletion-ledger and
-- head-signature interfaces (§2.9, §2.8), and the DEF-10 oracles across
-- them.
--
-- RECLASSIFY (TNT-08): hc.reclassify_taint becomes the re-categorisation
-- surface's DB entry point — EXECUTE to authenticated. As a request path
-- it must authorize through hc.visible_at (manage on the CURRENT taint,
-- re-read under the per-circle lock), because the raw grant-vector check
-- it carried as an owner-only function is freeze-blind and ceiling-blind:
-- a frozen circle's coordinator and a care_circle member with manage
-- grants must BOTH be refused (§3.8, VIS-05) — recorded as the TNT-08
-- hardening in ADR-0009. Nonexistent and unauthorized keep ONE shape.
--
-- SWEEP (OPS-01): hc.run_taint_sweep() is the scheduler's entry point —
-- hc_pipeline EXECUTE (the RLY-01 worker's identity), each run recorded
-- in hc.sweep_runs, findings surfaced to the operator through
-- admin_meta.sweep_health (alert rule: findings > 0 pages; last_run_at
-- age > 24 h means the window is breached). hc.sweep_provenance itself
-- stays owner-only; the pass is idempotent, so the next tick is the
-- retry policy.
--
-- LEDGER (§2.9): schema `ledger` is the local stand-in for the ledger
-- INSTANCE (separate backup lineage in production — ADR-0009 records the
-- stand-in). tombstones: never the content, never a title, never a
-- filename; written synchronously by hc.record_tombstone (owner-only —
-- the deletion surface is DEL-01, staged); append-only except the purge
-- job's executed_at mark, through a strict trigger carve-out.
-- log_head_signatures (§2.8): the daily signer's store — SIG-01 staged,
-- zero request-path reach, append-only.
--
-- RED (U5): reclassify unexecutable by authenticated (and ceiling/freeze
-- unbound), no sweep_runs/run_taint_sweep/sweep_health, no ledger schema.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(26);

create function pg_temp.errcode_as(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := returned_sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

create function pg_temp.call_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.pipeline_scalar(p_sql text) returns text
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

create function pg_temp.admin_scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute 'set local role hc_admin';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

-- PLT-04 discipline: a function-ACL denial SEGFAULTS this image's backend,
-- so the request-path reclassify calls are gated on the CATALOG state —
-- in RED they report NOT_GRANTED instead of dialling the crash.
create function pg_temp.reclassify_as(p_user uuid, p_type text, p_id uuid) returns text
language plpgsql as $$
begin
  if not coalesce(has_function_privilege('authenticated',
       to_regprocedure('hc.reclassify_taint(hc.object_type, uuid)'), 'execute'), false) then
    return 'NOT_GRANTED';
  end if;
  return pg_temp.call_as(p_user, format(
    $q$ select (hc.reclassify_taint(%L::hc.object_type, %L)) ->> 'completed' $q$,
    p_type, p_id));
end $$;

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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- coordinator, manage×5
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- schedule-manage only
  u3 uuid := pg_temp.mk_user(gen_random_uuid());   -- care_circle, manage×5 grants
  c1 uuid; s1 uuid; m1 uuid; m2 uuid; m3 uuid;
  cf uuid; sf uuid; mf uuid;
  a1 uuid := gen_random_uuid(); af uuid := gen_random_uuid();
  doc1 uuid := gen_random_uuid(); task1 uuid := gen_random_uuid();
  docf uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u3, 'member', 'Marisol');
  insert into public.circles (name, created_by) values ('Ops circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Frozen ops circle', u1)
    returning id into cf;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'ops-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (cf, 'Ruth', 'memory care', '60614', 'America/Chicago', 'moss',
          'opf-' || substr(cf::text, 1, 8)) returning id into sf;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'care_circle', 'Marisol') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (cf, u1, 'coordinator', 'Sarah') returning id into mf;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1),
           (c1, m3, s1, d::hc.domain, 'manage', u1),
           (cf, mf, sf, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m2, s1, 'schedule', 'manage', u1);
  insert into public.arrivals (id, circle_id, subject_id, channel) values
    (a1, c1, s1, 'upload'), (af, cf, sf, 'upload');

  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc1, c1, s1, 'Ops invoice', 'financial', a1, now(), u1, now(), 'Sarah',
          '{finances}'),
         (docf, cf, sf, 'Frozen doc', 'financial', af, now(), u1, now(), 'Sarah',
          '{finances}');
  insert into public.tasks (id, circle_id, subject_id, title,
    approved_by, approved_at, approver_display_name, taint)
  values (task1, c1, s1, 'Ops task', u1, now(), 'Sarah', '{schedule}');

  -- the frozen circle: open freeze
  insert into public.freezes (circle_id) values (cf);

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.doc1', doc1::text, true);
  perform set_config('t.task1', task1::text, true);
  perform set_config('t.docf', docf::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–6 · TNT-08: the reclassify request path.
-- ----------------------------------------------------------------------------
select ok(coalesce(has_function_privilege('authenticated',
  to_regprocedure('hc.reclassify_taint(hc.object_type, uuid)'), 'execute'), false),
  'TNT-08: hc.reclassify_taint is EXECUTE-granted to authenticated — the re-categorisation surface''s entry point');

select is(pg_temp.reclassify_as(current_setting('t.u1')::uuid, 'document',
  current_setting('t.doc1')::uuid), 'true',
  'a manage-on-current-taint member reclassifies through the REQUEST PATH');

select is(pg_temp.reclassify_as(current_setting('t.u2')::uuid, 'document',
  current_setting('t.doc1')::uuid), 'ERROR:P0001:reclassify_refused',
  'manage on every domain in the current taint, or nothing — through the request path too');

select is(pg_temp.reclassify_as(current_setting('t.u1')::uuid, 'document',
  gen_random_uuid()),
  pg_temp.reclassify_as(current_setting('t.u2')::uuid, 'document',
  current_setting('t.doc1')::uuid),
  'DEF-10 through the request path: nonexistent and unauthorized are INDISTINGUISHABLE');

select is(pg_temp.reclassify_as(current_setting('t.u3')::uuid, 'task',
  current_setting('t.task1')::uuid), 'ERROR:P0001:reclassify_refused',
  'the care ceiling binds the shrink path: manage-level GRANTS do not clear the tier (VIS-05; the TNT-08 hardening)');

select is(pg_temp.reclassify_as(current_setting('t.u1')::uuid, 'document',
  current_setting('t.docf')::uuid), 'ERROR:P0001:reclassify_refused',
  'an open freeze closes the shrink path — for the coordinator too (§3.8; the TNT-08 hardening)');

-- ----------------------------------------------------------------------------
-- 7–13 · OPS-01: scheduled sweeps, recorded runs, the operator's alert
-- surface.
-- ----------------------------------------------------------------------------
select is((
  select array_agg(a.attname::text order by a.attnum)
  from pg_attribute a
  where a.attrelid = to_regclass('hc.sweep_runs')
    and a.attnum > 0 and not a.attisdropped),
  array['id','kind','started_at','finished_at','findings','detail'],
  'hc.sweep_runs: every pass leaves a record — kind, when, findings, counts');

select ok(coalesce(
      has_function_privilege('hc_pipeline',
        to_regprocedure('hc.run_taint_sweep()'), 'execute')
  and not has_function_privilege('authenticated',
        to_regprocedure('hc.run_taint_sweep()'), 'execute')
  and not has_function_privilege('hc_admin',
        to_regprocedure('hc.run_taint_sweep()'), 'execute')
  and not has_function_privilege('anon',
        to_regprocedure('hc.run_taint_sweep()'), 'execute'),
  false),
  'OPS-01 scheduler identity: hc.run_taint_sweep is hc_pipeline''s alone — the RLY-01 worker runtime, nothing request-facing');

select is(pg_temp.pipeline_scalar(
  $$ select (hc.run_taint_sweep())::text $$), '0',
  'a clean graph sweeps to zero findings');

select is(pg_temp.scalar(
  $$ select count(*)::text from hc.sweep_runs
     where kind = 'provenance' and finished_at is not null and findings = 0 $$), '1',
  'the run is recorded: kind, finished_at, findings — the ≤24 h window is measurable (OPS-01)');

-- poison: a dangling edge (detector 3's case), then the sweep finds it
do $$
begin
  insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
  values (current_setting('t.c1')::uuid, 'task', current_setting('t.task1')::uuid,
          'document', gen_random_uuid());
end $$;

select is(pg_temp.pipeline_scalar(
  $$ select (hc.run_taint_sweep())::text $$), '1',
  'the poisoned graph sweeps to ONE finding — a defect signal, not routine');

select is(pg_temp.scalar(format(
  $$ select taint_resolved::text from public.tasks where id = %L $$,
  current_setting('t.task1'))), 'false',
  'the finding''s posture is OVER-taint: the touched child is marked unresolved, fail-closed (OPS-01)');

select is(pg_temp.admin_scalar(
  $$ select (last_findings > 0)::text || ':' ||
            (last_run_at >= now() - interval '24 hours')::text
     from admin_meta.sweep_health where kind = 'provenance' $$), 'true:true',
  'the operator''s alert surface: findings > 0 and run recency, through admin_meta (alert rule: page on findings, page on stale last_run_at)');

-- ----------------------------------------------------------------------------
-- 14–20 · The deletion ledger (§2.9): interface landed, surface staged.
-- ----------------------------------------------------------------------------
select ok((select count(*) from pg_namespace where nspname = 'ledger') = 1,
  'schema ledger exists — the local stand-in for the ledger INSTANCE (ADR-0009)');

select is((
  select array_agg(a.attname::text order by a.attnum)
  from pg_attribute a
  where a.attrelid = to_regclass('ledger.tombstones')
    and a.attnum > 0 and not a.attisdropped),
  array['id','circle_id','object_type','object_id','storage_keys','scope',
        'requested_by','requested_at','executed_at','reason'],
  'tombstones: §2.9''s columns exactly — never the content, never a title, never a filename');

select ok(to_regprocedure('hc.record_tombstone(uuid, text, uuid, text[], text, uuid, text)') is not null,
  'hc.record_tombstone exists — written SYNCHRONOUSLY by the deletion path when DEL-01 lands');

select is((
  select count(*)::int from pg_proc p
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where p.oid = to_regprocedure('hc.record_tombstone(uuid, text, uuid, text[], text, uuid, text)')
    and r.rolname in ('anon','authenticated','hc_pipeline','hc_admin')), 0,
  'the tombstone writer is owner-only — the deletion surface is staged (DEL-01), so the interface is non-callable');

select is(pg_temp.scalar(format(
  $$ select (hc.record_tombstone(%L, 'document', %L, array['circle/x/arrival/y/z'],
                                 'item', %L, 'member request')
             is not null)::text $$,
  current_setting('t.c1'), current_setting('t.doc1'), current_setting('t.u1'))), 'true',
  'a tombstone records: ids, storage keys, scope, requester — requested_at now, executed_at open');

select is(pg_temp.errcode_as('postgres',
  $$ update ledger.tombstones set reason = 'rewritten' $$), '42501',
  'tombstones are append-only: no column but executed_at may ever change');

select is(pg_temp.errcode_as('postgres',
  $$ update ledger.tombstones set executed_at = now() where executed_at is null $$),
  'no_error',
  'the ONE admissible mutation: the purge job marks executed_at (§2.9)');

-- ----------------------------------------------------------------------------
-- 21–24 · Closure on the ledger surfaces; the signature store.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('authenticated', $$ select * from ledger.tombstones $$),
  '42501',
  'no member surface on tombstones — deletion visibility is a product question for DEL-01, fail closed now');

select is(pg_temp.errcode_as('hc_admin', $$ select * from ledger.tombstones $$),
  '42501',
  'hc_admin cannot read the deletion ledger — the A.1 failure mode extends to it');

select is((
  select array_agg(a.attname::text order by a.attnum)
  from pg_attribute a
  where a.attrelid = to_regclass('ledger.log_head_signatures')
    and a.attnum > 0 and not a.attisdropped),
  array['id','circle_id','seq','entry_hash','signature','key_id','signed_at'],
  'log_head_signatures: the daily signer''s store (§2.8) — SIG-01 staged, shape landed');

select is(pg_temp.errcode_as('postgres',
  $$ insert into ledger.log_head_signatures (circle_id, seq, entry_hash, signature, key_id)
     values (gen_random_uuid(), 1, '\x00'::bytea, '\x00'::bytea, 'k1') $$),
  'no_error',
  'the signer''s insert path works for the maintenance role (the worker''s own credential arrives with SIG-01)');

-- ----------------------------------------------------------------------------
-- 25–26 · Signature rows never change; request paths never reach them.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres',
  $$ update ledger.log_head_signatures set signature = '\x01'::bytea $$), '42501',
  'a recorded signature is immutable — re-signing is a NEW row');

select is(pg_temp.errcode_as('authenticated',
  $$ select * from ledger.log_head_signatures $$), '42501',
  'no request-path reach on the signature store');

select * from finish();
rollback;
