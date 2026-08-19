-- ============================================================================
-- 4A · M5 — forwarding activation (slice-4 plan M5; TSD §5.1; the
-- AC-AUTH-3/4 absence mechanism) + the §5.2 resolver the webhook needs.
--
-- The contract these tests pin:
--   · hc.activate_forwarding(p_subject) — flips forwarding_active_at
--     ONLY when the circle founder's email is verified (the
--     postgres-owned mirror is the ground truth — the AC-AUTH-4
--     pattern); caller must be a live COORDINATOR of the subject's
--     circle; idempotent (a replay answers activated:false and never
--     logs twice); writes the §5.1 access-log entry (subject-bound,
--     event 'forwarding_activated'); a live freeze refuses NAMED
--     (freeze_active — activation enables ingestion, a security-state
--     write under the R-rule); unauthorized and nonexistent land in ONE
--     shape. Deactivation stays with the deletion surface (DEL-01,
--     later slice — named, not dropped).
--   · hc.resolve_forwarding(p_local_part) — the §5.2 step-2 read
--     (local part → circle/subject + active flag), hc_pipeline-only.
--     Case-blind (lower(text) — the citext trap); unknown and deleted
--     answer null in ONE shape (the webhook's 550 path is defence in
--     depth); an INACTIVE address resolves with forwarding_active =
--     false — a message reaching it is provisioning drift, worth
--     logging distinctly, never silently absorbed.
--     [Build-time addition to M5's listed contents, flagged for round
--     12: B2 step 2 has no surface without it and 4B may not add DDL.]
--   · hc.log_event_types gains 'forwarding_activated' and
--     'artifact_read' (the §1.3 step-6 entry the artifact route needs).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(21);

-- ----------------------------------------------------------------------------
-- Helpers. probe here captures sqlstate AND message — the named
-- freeze_active / email_unverified diagnoses are part of the contract.
-- ----------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid, p_confirmed boolean default true) returns uuid
language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
          'authenticated', p_id || '@fixture.local', 'x',
          case when p_confirmed then now() end, now(), now(), '{}', '{}');
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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid(), false);  -- founder, NOT yet verified
  u2 uuid := pg_temp.mk_user(gen_random_uuid());          -- stranger
  u3 uuid := pg_temp.mk_user(gen_random_uuid());          -- family-tier member
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Rosa'), (u2, 'member', 'Stranger'), (u3, 'member', 'Kin');
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, format($sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', %L)),
    '{}'::text[])::text
$sql$, 'cc47-nell-' || substr(gen_random_uuid()::text, 1, 8))), true);
select set_config('t.c1', pg_temp.jf(current_setting('t.c1res'), 'circle_id'), true);
select set_config('t.s1',
  (select s.id::text from public.subjects s
   where s.circle_id = current_setting('t.c1')::uuid), true);
select set_config('t.lp1',
  (select s.forwarding_local_part::text from public.subjects s
   where s.id = current_setting('t.s1')::uuid), true);

-- The family-tier member (no coordinator authority).
do $$
begin
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (current_setting('t.c1')::uuid, current_setting('t.u3')::uuid,
          'family', 'Kin');
end $$;

-- ----------------------------------------------------------------------------
-- 1–5 · The surface.
-- ----------------------------------------------------------------------------
select ok(exists (select 1 from hc.log_event_types where code = 'forwarding_activated'),
  'log_event_types gains forwarding_activated (§5.1)');
select ok(exists (select 1 from hc.log_event_types where code = 'artifact_read'),
  'log_event_types gains artifact_read (the §1.3 step-6 entry the artifact route needs)');

select has_function('hc', 'activate_forwarding', array['uuid']::name[],
  'hc.activate_forwarding(p_subject) exists');
select has_function('hc', 'resolve_forwarding', array['text']::name[],
  'hc.resolve_forwarding(p_local_part) exists — the §5.2 step-2 read');

create temp view fn_exec47 as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(
  exists (select 1 from fn_exec47 where proname = 'activate_forwarding'
                                    and rolname = 'authenticated')
  and not exists (select 1 from fn_exec47 where proname = 'activate_forwarding'
                                            and rolname in ('anon', 'hc_pipeline', 'hc_admin'))
  and exists (select 1 from fn_exec47 where proname = 'resolve_forwarding'
                                        and rolname = 'hc_pipeline')
  and not exists (select 1 from fn_exec47 where proname = 'resolve_forwarding'
                                            and rolname in ('anon', 'authenticated', 'hc_admin')),
  'activate is the member''s act (authenticated only); resolve is the webhook''s (hc_pipeline only) — catalog-asserted');

-- ----------------------------------------------------------------------------
-- 6–12 · Activation behaviour.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.activate_forwarding(%L)::text $$, current_setting('t.s1'))),
  'ERROR:P0001:email_unverified',
  'an UNVERIFIED founder cannot activate — named, actionable (the AC-AUTH-4 gate on the mirror''s ground truth)');

select ok((
  select s.forwarding_active_at is null from public.subjects s
  where s.id = current_setting('t.s1')::uuid),
  'and the address stays unprovisioned — 550-by-absence holds (AC-AUTH-3)');

-- The founder clicks the real confirmation: the postgres-owned mirror
-- carries the fact to accounts.
do $$
begin
  update auth.users set email_confirmed_at = now()
   where id = current_setting('t.u1')::uuid;
end $$;

select set_config('t.act', pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.activate_forwarding(%L)::text $$, current_setting('t.s1'))), true);
select is(pg_temp.jf(current_setting('t.act'), 'activated'), 'true',
  'a verified founder activates');
select ok((
  select s.forwarding_active_at is not null from public.subjects s
  where s.id = current_setting('t.s1')::uuid),
  'forwarding_active_at is set — null ceased being the MTA''s absence signal for this subject');
select is((
  select count(*)::int from public.access_log l
  where l.circle_id = current_setting('t.c1')::uuid
    and l.event_type = 'forwarding_activated'
    and l.subject_id = current_setting('t.s1')::uuid
    and l.actor_account_id = current_setting('t.u1')::uuid), 1,
  'the §5.1 access-log entry lands — subject-bound, actor named');

select is(pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.activate_forwarding(%L)::text $$, current_setting('t.s1'))),
  'activated'), 'false',
  'a replay answers activated:false — idempotent');
select is((
  select count(*)::int from public.access_log l
  where l.circle_id = current_setting('t.c1')::uuid
    and l.event_type = 'forwarding_activated'), 1,
  'and never logs twice');

-- ----------------------------------------------------------------------------
-- 13–16 · Refusals: freeze named; unauthorized/nonexistent one shape.
-- ----------------------------------------------------------------------------
select set_config('t.c2res', pg_temp.probe(current_setting('t.u1')::uuid, format($sql$
  select hc.create_circle('Frank''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Frank', 'situation', 'aging in place',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'clay',
    'forwarding_local_part', %L)),
    '{}'::text[])::text
$sql$, 'cc47-frank-' || substr(gen_random_uuid()::text, 1, 8))), true);
select set_config('t.s2',
  (select s.id::text from public.subjects s
   where s.circle_id = pg_temp.jf(current_setting('t.c2res'), 'circle_id')::uuid), true);

do $$
begin
  insert into public.freezes (circle_id)
  values (pg_temp.jf(current_setting('t.c2res'), 'circle_id')::uuid);
end $$;

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.activate_forwarding(%L)::text $$, current_setting('t.s2'))),
  'ERROR:P0001:freeze_active',
  'a live freeze refuses NAMED — activation enables ingestion, and a freeze suspends exactly that');

select is(pg_temp.probe(current_setting('t.u2')::uuid, format(
  $$ select hc.activate_forwarding(%L)::text $$, current_setting('t.s1'))),
  'ERROR:P0001:forwarding_refused',
  'a non-member refuses in the one shape');
select is(pg_temp.probe(current_setting('t.u2')::uuid, format(
  $$ select hc.activate_forwarding(%L)::text $$, gen_random_uuid())),
  'ERROR:P0001:forwarding_refused',
  'a ghost subject refuses in the SAME shape — no existence oracle');
select is(pg_temp.probe(current_setting('t.u3')::uuid, format(
  $$ select hc.activate_forwarding(%L)::text $$, current_setting('t.s1'))),
  'ERROR:P0001:forwarding_refused',
  'a family-tier member refuses too — activation is a coordinator act');

-- ----------------------------------------------------------------------------
-- 17–21 · The resolver.
-- ----------------------------------------------------------------------------
select set_config('t.res', pg_temp.pipe(format(
  $$ select hc.resolve_forwarding(%L)::text $$, current_setting('t.lp1'))), true);
select ok(
  pg_temp.jf(current_setting('t.res'), 'circle_id') = current_setting('t.c1')
  and pg_temp.jf(current_setting('t.res'), 'subject_id') = current_setting('t.s1')
  and pg_temp.jf(current_setting('t.res'), 'forwarding_active') = 'true',
  'a known ACTIVE local part resolves to its circle and subject');

select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.resolve_forwarding(%L)::text $$, upper(current_setting('t.lp1')))),
  'forwarding_active'), 'true',
  'resolution is case-blind (lower(text) — the citext trap never bites here)');

select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.resolve_forwarding(%L)::text $$,
  (select s.forwarding_local_part::text from public.subjects s
   where s.id = current_setting('t.s2')::uuid))), 'forwarding_active'), 'false',
  'a known INACTIVE address resolves with forwarding_active false — provisioning drift is visible, never absorbed');

select is(pg_temp.pipe(
  $$ select coalesce(hc.resolve_forwarding('cc47-no-such-part')::text, '<null>') $$),
  '<null>', 'an unknown local part answers null — the webhook''s defence-in-depth 550');

do $$
begin
  update public.subjects set deleted_at = now()
   where id = current_setting('t.s2')::uuid;
end $$;
select is(pg_temp.pipe(format(
  $$ select coalesce(hc.resolve_forwarding(%L)::text, '<null>') $$,
  (select s.forwarding_local_part::text from public.subjects s
   where s.id = current_setting('t.s2')::uuid))),
  '<null>', 'a deleted subject''s address answers the SAME null — one shape');

select * from finish();
rollback;
