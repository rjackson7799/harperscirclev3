-- ============================================================================
-- hc.ctx() / hc.grant_vectors() — the authorization context (TSD §3.2).
--
-- The load-bearing shape assertions: a row for EVERY reachable subject
-- including all-hidden ones (present-but-empty is fail-closed; absent is
-- not), cumulative arrays, the frozen flag's §3.8 semantics at 1A staging
-- (open ⇒ whole circle; unresolved unnarrowed ⇒ whole circle; unresolved
-- narrowed ⇒ the named subject only, the other record reopens; the 1B
-- coordinator read-only carve-out is pending in coverage.md), and
-- hc.ctx_for()'s closure (A.5: executable by nothing request-facing).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(27);

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

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

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

-- set-equality between a ctx jsonb domain array and a domain list
create function pg_temp.samedom(p jsonb, q text[]) returns boolean
language sql as $$
  select hc.dom(p) <@ q::hc.domain[] and q::hc.domain[] <@ hc.dom(p)
$$;

-- ----------------------------------------------------------------------------
-- Fixtures:
--   c1 (u1 coordinator, m1): subjects sA (grants: manage health, view
--       schedule) and sB (NO grants — the present-but-empty case)
--   c2 (u1 family, m1b):     subject sC (grant: log memories)
--   c3 (u1 REMOVED):         subject sD (must not appear anywhere)
--   u2: coordinator of c3 so it has a live owner
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  u3 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; c3 uuid;
  sa uuid; sb uuid; sc uuid; sd uuid;
  m1 uuid; m1b uuid; m3 uuid;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Dan'), (u3, 'member', 'Ghost');
  insert into public.circles (name, created_by) values ('One', u1) returning id into c1;
  insert into public.circles (name, created_by) values ('Two', u2) returning id into c2;
  insert into public.circles (name, created_by) values ('Three', u2) returning id into c3;

  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values
    (c1, 'Ann',  's', 'z', 'UTC', 'sage', 'ctx-a-' || substr(c1::text, 1, 8)),
    (c1, 'Ben',  's', 'z', 'UTC', 'clay', 'ctx-b-' || substr(c1::text, 1, 8));
  select id into sa from public.subjects where circle_id = c1 and first_name = 'Ann';
  select id into sb from public.subjects where circle_id = c1 and first_name = 'Ben';
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Cy', 's', 'z', 'UTC', 'moss', 'ctx-c-' || substr(c2::text, 1, 8))
    returning id into sc;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c3, 'Di', 's', 'z', 'UTC', 'dust', 'ctx-d-' || substr(c3::text, 1, 8))
    returning id into sd;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u1, 'family', 'Sarah') returning id into m1b;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join,
                                     removed_at)
  values (c3, u1, 'family', 'Sarah', now());
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c3, u2, 'coordinator', 'Dan') returning id into m3;

  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values
    (c1, m1,  sa, 'health',   'manage', u1),
    (c1, m1,  sa, 'schedule', 'view',   u1),
    (c2, m1b, sc, 'memories', 'log',    u2);

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.c3', c3::text, true);
  perform set_config('t.sa', sa::text, true);
  perform set_config('t.sb', sb::text, true);
  perform set_config('t.sc', sc::text, true);
  perform set_config('t.sd', sd::text, true);
  perform set_config('t.m1', m1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- Shape, as u1.
-- ----------------------------------------------------------------------------
select pg_temp.as_user(current_setting('t.u1')::uuid);
select set_config('t.ctx', hc.ctx()::text, true);
reset role;

select is((current_setting('t.ctx')::jsonb ->> 'account')::uuid,
          current_setting('t.u1')::uuid, 'ctx.account is the caller');

select is(jsonb_array_length(current_setting('t.ctx')::jsonb -> 'circles'), 2,
  'ctx.circles: live memberships only — the removed c3 contributes nothing');
select ok((current_setting('t.ctx')::jsonb -> 'circles')
            @> to_jsonb(current_setting('t.c1')::uuid)
      and (current_setting('t.ctx')::jsonb -> 'circles')
            @> to_jsonb(current_setting('t.c2')::uuid),
  'ctx.circles contains both live circles');

select is((select count(*)::int
           from jsonb_object_keys(current_setting('t.ctx')::jsonb -> 'subjects')), 3,
  'a row for EVERY reachable subject — three, not only the granted ones');
select ok(current_setting('t.ctx')::jsonb -> 'subjects' ? current_setting('t.sb'),
  'the all-hidden subject is PRESENT-but-empty — absence would be indistinguishable from not-my-circle (§3.2)');
select ok(not (current_setting('t.ctx')::jsonb -> 'subjects' ? current_setting('t.sd')),
  'a removed membership''s subject is absent — clause 1 then means precisely not-in-my-circles');

select ok(pg_temp.samedom(current_setting('t.ctx')::jsonb -> 'subjects'
            -> current_setting('t.sa') -> 'manage', array['health']),
  'sA.manage = {health}');
select ok(pg_temp.samedom(current_setting('t.ctx')::jsonb -> 'subjects'
            -> current_setting('t.sa') -> 'view', array['health','schedule']),
  'sA.view is CUMULATIVE: manage ⊆ view — {health, schedule}');
select ok(pg_temp.samedom(current_setting('t.ctx')::jsonb -> 'subjects'
            -> current_setting('t.sa') -> 'log', array['health','schedule']),
  'sA.log accumulates everything held at log or better');
select ok(
      pg_temp.samedom(current_setting('t.ctx')::jsonb -> 'subjects'
        -> current_setting('t.sb') -> 'manage', '{}')
  and pg_temp.samedom(current_setting('t.ctx')::jsonb -> 'subjects'
        -> current_setting('t.sb') -> 'log', '{}'),
  'sB: all four vectors empty — hidden by arithmetic, not by absence');
select ok(
      pg_temp.samedom(current_setting('t.ctx')::jsonb -> 'subjects'
        -> current_setting('t.sc') -> 'log', array['memories'])
  and pg_temp.samedom(current_setting('t.ctx')::jsonb -> 'subjects'
        -> current_setting('t.sc') -> 'view', '{}'),
  'sC: log-only grant reaches log and nothing above');

select is(current_setting('t.ctx')::jsonb -> 'subjects'
            -> current_setting('t.sa') ->> 'tier', 'coordinator',
  'tier rides the membership of the subject''s circle');
select is(current_setting('t.ctx')::jsonb -> 'subjects'
            -> current_setting('t.sc') ->> 'tier', 'family',
  'a different tier in a different circle');
select is((current_setting('t.ctx')::jsonb -> 'subjects'
            -> current_setting('t.sa') ->> 'member')::uuid,
          current_setting('t.m1')::uuid,
  'the member id is the caller''s membership in that circle');

select is(current_setting('t.ctx')::jsonb -> 'shares', '{}'::jsonb,
  'shares key present and empty until object_shares lands in 1B (coverage: pending)');

-- ----------------------------------------------------------------------------
-- Freeze semantics on the flag (direct state manipulation as postgres; the
-- definer functions are M8's unit).
-- ----------------------------------------------------------------------------
create function pg_temp.ctx_of(p uuid) returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform pg_temp.as_user(p);
  v := hc.ctx();
  execute 'reset role';
  return v;
end $$;

insert into public.freezes (circle_id) values (current_setting('t.c2')::uuid);

select ok((pg_temp.ctx_of(current_setting('t.u1')::uuid) -> 'subjects'
            -> current_setting('t.sc') ->> 'frozen')::boolean,
  'an OPEN freeze freezes every subject in its circle');
select ok(not (pg_temp.ctx_of(current_setting('t.u1')::uuid) -> 'subjects'
            -> current_setting('t.sa') ->> 'frozen')::boolean,
  'a freeze in one circle does not touch another circle''s subjects');

insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
update public.freezes
   set state = 'unresolved', subject_id = current_setting('t.sa')::uuid,
       narrowing_rationale = 'cross-subject exposure assessed: joint material none',
       adjudicated_at = now(), adjudicated_by = 'adjudicator'
 where circle_id = current_setting('t.c1')::uuid and state = 'open';

select ok((pg_temp.ctx_of(current_setting('t.u1')::uuid) -> 'subjects'
            -> current_setting('t.sa') ->> 'frozen')::boolean,
  'a NARROWED unresolved finding keeps the named subject frozen');
select ok(not (pg_temp.ctx_of(current_setting('t.u1')::uuid) -> 'subjects'
            -> current_setting('t.sb') ->> 'frozen')::boolean,
  '…and the other subject''s record reopens (ADR-0001 consequence)');

update public.freezes
   set subject_id = null
 where circle_id = current_setting('t.c1')::uuid and state = 'unresolved';

select ok((pg_temp.ctx_of(current_setting('t.u1')::uuid) -> 'subjects'
            -> current_setting('t.sa') ->> 'frozen')::boolean
      and (pg_temp.ctx_of(current_setting('t.u1')::uuid) -> 'subjects'
            -> current_setting('t.sb') ->> 'frozen')::boolean,
  'an UNNARROWED unresolved finding stays whole-circle by default (ADR-0003 finding 3)');

update public.freezes
   set state = 'dismissed', subject_id = null,
       adjudicated_at = now(), adjudicated_by = 'adjudicator'
 where circle_id in (current_setting('t.c1')::uuid, current_setting('t.c2')::uuid);

select ok(not exists (
    select 1 from jsonb_each(pg_temp.ctx_of(current_setting('t.u1')::uuid) -> 'subjects') e
    where (e.value ->> 'frozen')::boolean),
  'dismissed clears the flag everywhere — full access restored');

-- ----------------------------------------------------------------------------
-- Closure: hc.ctx_for() and hc.grant_vectors() are callable by NOTHING
-- request-facing (A.5 — no account parameter to substitute anywhere).
-- Catalog assertions, NOT live denied calls: this stack's image (Supabase
-- PG 17.6) segfaults the backend on ANY function call refused by ACL as a
-- request-path role — reproduced minimally with a one-line SQL function and
-- recorded for the round-5 packet as an upstream report. The property under
-- test is the absent privilege, which the catalog states exactly.
-- ----------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'hc.ctx_for(uuid)', 'execute'),
  'authenticated cannot execute hc.ctx_for()');
select ok(not has_function_privilege('hc_pipeline', 'hc.ctx_for(uuid)', 'execute'),
  'hc_pipeline cannot execute hc.ctx_for()');
select ok(not has_function_privilege('hc_admin', 'hc.ctx_for(uuid)', 'execute'),
  'hc_admin cannot execute hc.ctx_for()');
select ok(not has_function_privilege('authenticated', 'hc.grant_vectors(uuid)', 'execute'),
  'authenticated cannot execute hc.grant_vectors()');

-- Parity: the internal wrapper computes exactly what the caller''s own ctx
-- computes (freezes now all dismissed; content identical).
select is(hc.ctx_for(current_setting('t.u1')::uuid),
          pg_temp.ctx_of(current_setting('t.u1')::uuid),
  'hc.ctx_for(account) ≡ hc.ctx() for that account');

-- A memberless account: empty but well-formed (fail closed, not absent keys).
select ok(
      pg_temp.ctx_of(current_setting('t.u3')::uuid) -> 'subjects' = '{}'::jsonb
  and jsonb_array_length(pg_temp.ctx_of(current_setting('t.u3')::uuid) -> 'circles') = 0,
  'no memberships → empty subjects map and empty circles array');

select * from finish();
rollback;
