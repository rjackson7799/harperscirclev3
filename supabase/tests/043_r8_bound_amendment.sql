-- ============================================================================
-- 4A · M1 — the ADR-0015 R8 batched bound amendment (slice 4's HARD entry
-- criterion; docs/review/slice-4-plan.md "Migration 1 — the spec").
--
-- The contract these tests pin, item by item:
--   1 · APP-09b's access-log half (R1): hc.log_event_types gains
--       'signed_out'; hc.log_sign_out() — SECURITY DEFINER, authenticated
--       EXECUTE, ZERO parameters (actor = hc.uid(), nothing spoofable) —
--       writes the §5.5 entry as a CIRCLE-LEVEL row (subject-less,
--       domain-less: visible to every live member under the 1D read
--       policy) once per LIVE membership of the actor. A removed
--       membership logs nothing; zero memberships is a quiet zero, not a
--       refusal. The app call is 4B; APP-09b flips there.
--   2 · The four maintenance-definer conversions (R3): hc.create_account
--       (own row only — no target parameter exists), hc.describe_invite
--       (anon + authenticated; token-keyed, DEF-10 one-shape null for
--       malformed and unknown alike — the pre-auth accept screen's read),
--       hc.set_slice (own row; a ghost target refuses LOUDLY — the
--       round-10 F7 posture), hc.set_opening_context (the founder's own
--       in-setup circle; the ADR-0015 F7 zero-row postcondition is now
--       IN-FUNCTION: forged, foreign and non-setup ids all land in ONE
--       refusal shape).
--   3 · The step-1 relationship column (R2, Q2 SETTLED):
--       circle_members.relationship — text, bounded ≤ 120, nullable for
--       pre-existing rows — written by hc.create_circle (signature gains
--       p_relationship) on the FOUNDER's membership row only.
--   4 · hc_runtime (R3): NOLOGIN, member of anon + authenticated (the
--       SET ROLE channel) and NOTHING else — the INV-14 two-way pin.
--       Local login credential rides seed.sql, never a migration; its
--       membership is therefore tolerated, never required (the upgrade
--       leg runs without seed).
--   5 · The worker claim/lease primitive (round-10 F9's DB half):
--       hc.claim_security_actions(p_limit) — hc_pipeline-only; claims the
--       oldest unclaimed pending rows (claimed_until = now() + 5 min,
--       FOR UPDATE SKIP LOCKED) so concurrent sweeps are disjoint by
--       construction; a lapsed claim is reclaimable; a completed action
--       is never claimed; hc.complete_security_action is UNCHANGED and
--       still completes a claimed row.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(72);

-- ----------------------------------------------------------------------------
-- Helpers (the 006/039 pattern: fixtures as postgres in DO blocks, probes
-- through role-switching helpers that capture error signatures instead of
-- aborting the file).
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

-- Run one scalar statement as the given account (authenticated + jwt),
-- returning the scalar or 'ERROR:<sqlstate>'.
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

-- Run one scalar statement as a bare role (anon / hc_pipeline), same shape.
create function pg_temp.probe_role(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

-- Field extractor that survives an error signature (red-leg friendly).
create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then p_out
              else p_out::jsonb ->> p_field end;
$$;

-- Id extractor: null (never an abort) when the probe failed.
create function pg_temp.jid(p_out text, p_field text) returns uuid
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then null
              else (p_out::jsonb ->> p_field)::uuid end;
$$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- Rosa: founder of c1/c2/c3
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- Zero: no memberships
  u3 uuid := pg_temp.mk_user(gen_random_uuid());   -- no accounts row yet
  u4 uuid := pg_temp.mk_user(gen_random_uuid());   -- Ghost: soft-deleted
  u5 uuid := pg_temp.mk_user(gen_random_uuid());   -- Ana: relationship founder
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Rosa'), (u2, 'member', 'Zero'), (u5, 'member', 'Ana');
  insert into public.accounts (id, kind, display_name, deleted_at)
  values (u4, 'member', 'Ghost', now());
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.u4', u4::text, true);
  perform set_config('t.u5', u5::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–4 · Unauthenticated first (claims are transaction-scoped; nothing has
-- set them yet): every own-row definer refuses in the normalised shape.
-- ----------------------------------------------------------------------------
select throws_ok($$ select hc.log_sign_out() $$, 'P0001', null,
  'log_sign_out: no authenticated identity, normalised refusal');
select throws_ok($$ select hc.create_account('Nia') $$, 'P0001', null,
  'create_account: no authenticated identity, normalised refusal');
select throws_ok($$ select hc.set_slice('x') $$, 'P0001', null,
  'set_slice: no authenticated identity, normalised refusal');
select throws_ok($$ select hc.set_opening_context(gen_random_uuid(), array['x']) $$,
  'P0001', null,
  'set_opening_context: no authenticated identity, normalised refusal');

-- ----------------------------------------------------------------------------
-- 5–11 · The batch's surface exists: event type + the six new functions.
-- ----------------------------------------------------------------------------
select ok(exists (select 1 from hc.log_event_types where code = 'signed_out'),
  'log_event_types gains signed_out (APP-09b''s DB half)');

select has_function('hc', 'log_sign_out', '{}'::name[],
  'hc.log_sign_out() exists — zero parameters, actor = hc.uid()');
select has_function('hc', 'create_account', array['text']::name[],
  'hc.create_account(p_display_name) exists — own row, no target parameter');
select has_function('hc', 'describe_invite', array['text']::name[],
  'hc.describe_invite(p_token) exists — the pre-auth accept read');
select has_function('hc', 'set_slice', array['text']::name[],
  'hc.set_slice(p_slice) exists — own row');
select has_function('hc', 'set_opening_context', array['uuid', 'text[]']::name[],
  'hc.set_opening_context(p_circle, p_context) exists');
select has_function('hc', 'claim_security_actions', array['integer']::name[],
  'hc.claim_security_actions(p_limit) exists — the F9 DB half');

-- ----------------------------------------------------------------------------
-- 12–18 · The EXECUTE surface (name-based catalog probes: absent objects
-- fail the test, never the file).
-- ----------------------------------------------------------------------------
create temp view fn_exec as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(exists (select 1 from fn_exec where proname = 'describe_invite'
                                          and rolname = 'anon'),
  'describe_invite: anon EXECUTE (the accept screen precedes any session)');
select ok(exists (select 1 from fn_exec where proname = 'describe_invite'
                                          and rolname = 'authenticated'),
  'describe_invite: authenticated EXECUTE');
select ok(exists (select 1 from fn_exec where proname = 'log_sign_out'
                                          and rolname = 'authenticated')
      and not exists (select 1 from fn_exec where proname = 'log_sign_out'
                                              and rolname = 'anon'),
  'log_sign_out: authenticated EXECUTE, anon none (sign-out is a member act)');
select ok(exists (select 1 from fn_exec where proname = 'create_account'
                                          and rolname = 'authenticated')
      and not exists (select 1 from fn_exec where proname = 'create_account'
                                              and rolname = 'anon'),
  'create_account: authenticated only');
select ok(exists (select 1 from fn_exec where proname = 'set_slice'
                                          and rolname = 'authenticated')
      and not exists (select 1 from fn_exec where proname = 'set_slice'
                                              and rolname = 'anon'),
  'set_slice: authenticated only');
select ok(exists (select 1 from fn_exec where proname = 'set_opening_context'
                                          and rolname = 'authenticated')
      and not exists (select 1 from fn_exec where proname = 'set_opening_context'
                                              and rolname = 'anon'),
  'set_opening_context: authenticated only');
select ok(exists (select 1 from fn_exec where proname = 'claim_security_actions'
                                          and rolname = 'hc_pipeline')
      and not exists (select 1 from fn_exec where proname = 'claim_security_actions'
                                              and rolname in ('anon', 'authenticated')),
  'claim_security_actions: hc_pipeline only — the drain posture');

-- ----------------------------------------------------------------------------
-- 19–23 · hc_runtime (item 4): the INV-14 two-way pin.
-- ----------------------------------------------------------------------------
select ok(exists (select 1 from pg_roles
                  where rolname = 'hc_runtime' and not rolcanlogin),
  'hc_runtime exists and is NOLOGIN (credentials ride deploy/seed, never DDL)');

-- Re-pinned at 5A M1 (Q4 — SETTLED): the two memberships carry INHERIT
-- FALSE — the bare credential inherits nothing; SET ROLE (the channel)
-- rides the SET option, pinned in 051 alongside the flip itself.
select is((
  select array_agg(rr.rolname || ':inherit=' || m.inherit_option::text
                   order by rr.rolname)
  from pg_auth_members m
  join pg_roles rm on rm.oid = m.member and rm.rolname = 'hc_runtime'
  join pg_roles rr on rr.oid = m.roleid),
  array['anon:inherit=false', 'authenticated:inherit=false']::text[],
  'hc_runtime is a member of anon + authenticated and NOTHING else (two-way exact), INHERIT FALSE on both (5A M1, Q4)');

select ok(
  exists (select 1 from pg_auth_members m
          join pg_roles rm on rm.oid = m.roleid and rm.rolname = 'hc_runtime'
          join pg_roles mm on mm.oid = m.member and mm.rolname = 'postgres')
  and not exists (select 1 from pg_auth_members m
          join pg_roles rm on rm.oid = m.roleid and rm.rolname = 'hc_runtime'
          join pg_roles mm on mm.oid = m.member
          where mm.rolname not in ('postgres', 'hc_runtime_login')),
  'hc_runtime''s members: postgres (test SET ROLE) plus at most the seeded local login — nothing broader can assume it');

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname in ('public', 'hc') and c.relkind = 'r'
    and r.rolname = 'hc_runtime'), 0,
  'hc_runtime holds ZERO direct table privileges — its whole reach is the membership channel');

select is((
  select count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and r.rolname = 'hc_runtime'), 0,
  'hc_runtime holds ZERO direct function grants — the enumerated surface rides anon/authenticated');

-- ----------------------------------------------------------------------------
-- Fixtures for the behaviour half: three circles founded by Rosa; her c3
-- membership then removed (fixture-level; remove_member''s own contract is
-- 038''s). Each subject payload is complete — the columns are NOT NULL.
-- ----------------------------------------------------------------------------
select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', 'cc43-nell-' || substr(gen_random_uuid()::text, 1, 8))),
    array['post-hospital discharge'])::text
$sql$), true);
select set_config('t.c2res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Frank''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Frank', 'situation', 'aging in place',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'clay',
    'forwarding_local_part', 'cc43-frank-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);
select set_config('t.c3res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Ivy''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Ivy', 'situation', 'aging in place',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'moss',
    'forwarding_local_part', 'cc43-ivy-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);

update public.circle_members
   set removed_at = now(), removed_by = current_setting('t.u1')::uuid
 where circle_id = (pg_temp.jf(current_setting('t.c3res'), 'circle_id'))::uuid
   and account_id = current_setting('t.u1')::uuid;

-- ----------------------------------------------------------------------------
-- 24–28 · Item 1 behaviour: one circle-level entry per LIVE membership.
-- ----------------------------------------------------------------------------
select is(pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  'select hc.log_sign_out()::text'), 'logged'), '2',
  'log_sign_out: two live memberships, one removed → logged = 2');

select is((
  select count(*)::int from public.access_log l
  where l.circle_id = (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid
    and l.event_type = 'signed_out'
    and l.actor_account_id = current_setting('t.u1')::uuid
    and l.subject_id is null and l.domain is null), 1,
  'c1 carries exactly one signed_out entry — circle-level (subject-less, domain-less), actor = uid');

select is((
  select count(*)::int from public.access_log l
  where l.circle_id = (pg_temp.jf(current_setting('t.c2res'), 'circle_id'))::uuid
    and l.event_type = 'signed_out'), 1,
  'c2 carries its own entry — per membership, per chain');

select is((
  select count(*)::int from public.access_log l
  where l.circle_id = (pg_temp.jf(current_setting('t.c3res'), 'circle_id'))::uuid
    and l.event_type = 'signed_out'), 0,
  'the REMOVED c3 membership logs nothing');

select is(pg_temp.jf(pg_temp.probe(current_setting('t.u2')::uuid,
  'select hc.log_sign_out()::text'), 'logged'), '0',
  'zero live memberships → a quiet zero, never a refusal');

-- ----------------------------------------------------------------------------
-- 29–34 · Item 2 behaviour: create_account (own row, idempotent-by-replay).
-- ----------------------------------------------------------------------------
select is(pg_temp.jf(pg_temp.probe(current_setting('t.u3')::uuid,
  $$ select hc.create_account('Nia')::text $$), 'created'), 'true',
  'create_account: the caller''s own row is created');

select ok(exists (
  select 1 from public.accounts a
  where a.id = current_setting('t.u3')::uuid
    and a.kind = 'member' and a.display_name = 'Nia'),
  'the row is kind = member, keyed hc.uid(), named as asked');

select is((
  select lower(a.email::text) from public.accounts a
  where a.id = current_setting('t.u3')::uuid),
  lower(current_setting('t.u3') || '@fixture.local'),
  'the 2A insert mirror rides the definer''s insert — email lands from auth.users');

select is(pg_temp.jf(pg_temp.probe(current_setting('t.u3')::uuid,
  $$ select hc.create_account('Other')::text $$), 'created'), 'false',
  'a replayed bootstrap changes nothing and says so');

select is((
  select a.display_name from public.accounts a
  where a.id = current_setting('t.u3')::uuid), 'Nia',
  'the replay wrote nothing — the original name stands');

select is(pg_temp.probe(current_setting('t.u3')::uuid,
  $$ select hc.create_account('  ')::text $$), 'ERROR:P0001',
  'a blank display name refuses loudly');

-- ----------------------------------------------------------------------------
-- Invite fixtures: four states in c1, tokens sha256-only (the §2.3 shape).
-- ----------------------------------------------------------------------------
do $$
declare
  v_circle uuid := (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid;
  v_nell uuid;
begin
  if v_circle is null then return; end if;   -- red leg: fixtures absent, tests fail cleanly
  select s.id into v_nell from public.subjects s where s.circle_id = v_circle;
  insert into public.invites
    (circle_id, token_hash, invited_email, tier, subject_ids, invited_by, expires_at)
  values
    (v_circle, extensions.digest(repeat('ab', 32), 'sha256'), 'kin@fixture.local',
     'family', array[v_nell], current_setting('t.u1')::uuid, now() + interval '7 days');
  insert into public.invites
    (circle_id, token_hash, invited_email, tier, subject_ids, invited_by, expires_at, revoked_at)
  values
    (v_circle, extensions.digest(repeat('cd', 32), 'sha256'), 'kin@fixture.local',
     'family', array[v_nell], current_setting('t.u1')::uuid, now() + interval '7 days', now());
  insert into public.invites
    (circle_id, token_hash, invited_email, tier, subject_ids, invited_by, created_at, expires_at)
  values
    (v_circle, extensions.digest(repeat('ef', 32), 'sha256'), 'kin@fixture.local',
     'family', array[v_nell], current_setting('t.u1')::uuid,
     now() - interval '8 days', now() - interval '1 day');
  insert into public.invites
    (circle_id, token_hash, invited_email, tier, subject_ids, invited_by, expires_at,
     accepted_at, accepted_by)
  values
    (v_circle, extensions.digest(repeat('12', 32), 'sha256'), 'kin@fixture.local',
     'family', array[v_nell], current_setting('t.u1')::uuid, now() + interval '7 days',
     now(), current_setting('t.u2')::uuid);
end $$;

-- ----------------------------------------------------------------------------
-- 35–45 · Item 2 behaviour: describe_invite (anon-first; DEF-10 null shape).
-- ----------------------------------------------------------------------------
select set_config('t.di', pg_temp.probe_role('anon',
  format($$ select hc.describe_invite(%L)::text $$, repeat('ab', 32))), true);

select is(pg_temp.jf(current_setting('t.di'), 'state'), 'pending',
  'a live invite describes as pending — to anon, before any session exists');
select is(pg_temp.jf(current_setting('t.di'), 'circle_name'), 'Nell''s circle',
  'the description names the circle');
select is(pg_temp.jf(current_setting('t.di'), 'inviter_name'), 'Rosa',
  'the description names the inviter');
select is(pg_temp.jf(current_setting('t.di'), 'tier'), 'family',
  'the description carries the tier ceiling');
select is(pg_temp.jf(current_setting('t.di'), 'subject_names'), '["Nell"]',
  'the description names the subjects the invite covers');

select is(pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.describe_invite(%L)::text $$, repeat('ab', 32))), 'state'),
  'pending', 'authenticated reads the same shape');

select is(pg_temp.probe_role('anon',
  $$ select coalesce(hc.describe_invite('zz')::text, '<null>') $$), '<null>',
  'a malformed token answers null — one shape');
select is(pg_temp.probe_role('anon',
  format($$ select coalesce(hc.describe_invite(%L)::text, '<null>') $$,
         repeat('99', 32))), '<null>',
  'an unknown well-formed token answers the SAME null — no oracle');
select is(pg_temp.jf(pg_temp.probe_role('anon',
  format($$ select hc.describe_invite(%L)::text $$, repeat('cd', 32))), 'state'),
  'revoked', 'a revoked invite says revoked');
select is(pg_temp.jf(pg_temp.probe_role('anon',
  format($$ select hc.describe_invite(%L)::text $$, repeat('ef', 32))), 'state'),
  'expired', 'an expired invite says expired');

select is(pg_temp.jf(pg_temp.probe_role('anon',
  format($$ select hc.describe_invite(%L)::text $$, repeat('12', 32))), 'state'),
  'used', 'an accepted invite says used');

-- ----------------------------------------------------------------------------
-- 46–48 · Item 2 behaviour: set_slice (own row; ghosts refuse loudly).
-- ----------------------------------------------------------------------------
select is(pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  $$ select hc.set_slice('Sandwich generation')::text $$), 'updated'), 'true',
  'set_slice: the caller''s own row updates');
select is((
  select a.slice from public.accounts a
  where a.id = current_setting('t.u1')::uuid), 'Sandwich generation',
  'the declared slice persisted');
select is(pg_temp.probe(current_setting('t.u4')::uuid,
  $$ select hc.set_slice('x')::text $$), 'ERROR:P0001',
  'a soft-deleted account''s write refuses LOUDLY — zero rows is an invariant violation, never silence (round-10 F7)');

-- ----------------------------------------------------------------------------
-- 49–53 · Item 2 behaviour: set_opening_context (F7 postcondition
-- in-function; forged, foreign and non-setup land in ONE shape).
-- ----------------------------------------------------------------------------
select is(pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.set_opening_context(%L, array['post-hospital discharge', 'bills piling up'])::text $$,
         pg_temp.jf(current_setting('t.c1res'), 'circle_id'))), 'updated'), 'true',
  'set_opening_context: the founder''s own in-setup circle updates');
select is((
  select c.opening_context from public.circles c
  where c.id = (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid),
  array['post-hospital discharge', 'bills piling up'],
  'the multi-select persisted');
select is(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.set_opening_context(%L, array['x'])::text $$,
         gen_random_uuid())), 'ERROR:P0001',
  'a forged circle id refuses loudly');
select is(pg_temp.probe(current_setting('t.u2')::uuid,
  format($$ select hc.set_opening_context(%L, array['x'])::text $$,
         pg_temp.jf(current_setting('t.c1res'), 'circle_id'))), 'ERROR:P0001',
  'a FOREIGN founder''s circle refuses in the same shape');

update public.circles set state = 'active'
 where id = (pg_temp.jf(current_setting('t.c2res'), 'circle_id'))::uuid;
select is(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.set_opening_context(%L, array['x'])::text $$,
         pg_temp.jf(current_setting('t.c2res'), 'circle_id'))), 'ERROR:P0001',
  'a circle past setup refuses in the same shape — the write window is step 3 only');

-- ----------------------------------------------------------------------------
-- 54–59 · Item 3: the relationship column and its one writer.
-- ----------------------------------------------------------------------------
select has_column('public', 'circle_members', 'relationship',
  'circle_members.relationship exists (Q2: the owner-named table)');

select throws_ok(format($$
  update public.circle_members set relationship = repeat('x', 121)
  where circle_id = %L and account_id = %L $$,
  pg_temp.jf(current_setting('t.c1res'), 'circle_id'), current_setting('t.u1')),
  '23514', null,
  'the column is bounded ≤ 120 at the table (belt to the function''s braces)');

select set_config('t.c4res', pg_temp.probe(current_setting('t.u5')::uuid, $sql$
  select hc.create_circle('Mae''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Mae', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'dune',
    'forwarding_local_part', 'cc43-mae-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[], 'Her daughter')::text
$sql$), true);

-- (to_jsonb access: a missing column reads as null and FAILS the test
-- instead of aborting the file — the red leg reports every assertion)
select is((
  select to_jsonb(m) ->> 'relationship' from public.circle_members m
  where m.circle_id = pg_temp.jid(current_setting('t.c4res'), 'circle_id')
    and m.account_id = current_setting('t.u5')::uuid),
  'Her daughter',
  'create_circle writes the step-1 relationship on the FOUNDER''s membership row, in its own transaction (F1 closed)');

select is((
  select count(*)::int from public.circle_members m
  where m.circle_id = pg_temp.jid(current_setting('t.c4res'), 'circle_id')
    and to_jsonb(m) ->> 'relationship' is not null), 1,
  'the subject-member row carries none — the fact describes the founder');

select ok((
  select (to_jsonb(m) ->> 'relationship') is null
    and to_jsonb(m) ? 'relationship' from public.circle_members m
  where m.circle_id = (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid
    and m.account_id = current_setting('t.u1')::uuid),
  'a circle created without the answer stays null — nullable for pre-existing rows');

select is(pg_temp.probe(current_setting('t.u5')::uuid, format($sql$
  select hc.create_circle('Overlong', jsonb_build_array(jsonb_build_object(
    'first_name', 'X', 'situation', 's', 'postal_code', 'p', 'timezone', 'UTC',
    'accent_color', 'sage',
    'forwarding_local_part', 'cc43-x-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[], %L)::text
$sql$, repeat('x', 121))), 'ERROR:P0001',
  'an overlong relationship refuses before anything is written');

-- ----------------------------------------------------------------------------
-- 60–72 · Item 5: the claim primitive.
-- ----------------------------------------------------------------------------
select has_column('public', 'security_actions', 'claimed_until',
  'security_actions.claimed_until exists — the claim lease');

do $$
declare
  v_u1 uuid := current_setting('t.u1')::uuid;
  e1 uuid; e2 uuid; e3 uuid;
  a1 uuid; a2 uuid; a3 uuid;
begin
  insert into public.security_events (account_id, kind, token_hash, token_expires_at)
  values (v_u1, 'suspicious_signin', extensions.digest('t1', 'sha256'), now() + interval '15 minutes')
  returning id into e1;
  insert into public.security_events (account_id, kind, token_hash, token_expires_at)
  values (v_u1, 'suspicious_signin', extensions.digest('t2', 'sha256'), now() + interval '15 minutes')
  returning id into e2;
  insert into public.security_events (account_id, kind, token_hash, token_expires_at)
  values (v_u1, 'suspicious_signin', extensions.digest('t3', 'sha256'), now() + interval '15 minutes')
  returning id into e3;

  insert into public.security_actions (event_id, account_id, action, created_at)
  values (e1, v_u1, 'global_signout_force_reset', now() - interval '3 minutes')
  returning id into a1;
  insert into public.security_actions (event_id, account_id, action, created_at)
  values (e2, v_u1, 'global_signout_force_reset', now() - interval '2 minutes')
  returning id into a2;
  insert into public.security_actions (event_id, account_id, action, created_at)
  values (e3, v_u1, 'global_signout_force_reset', now() - interval '1 minute')
  returning id into a3;

  perform set_config('t.a1', a1::text, true);
  perform set_config('t.a2', a2::text, true);
  perform set_config('t.a3', a3::text, true);
end $$;

select is(pg_temp.probe_role('hc_pipeline',
  $$ select coalesce(string_agg(id::text, ',' order by created_at), '<none>')
     from hc.claim_security_actions(2) $$),
  current_setting('t.a1') || ',' || current_setting('t.a2'),
  'a claim takes the OLDEST unclaimed pending rows, in order — the longest-owed kill first');

select is((
  select count(*)::int from public.security_actions a
  where a.id in (current_setting('t.a1')::uuid, current_setting('t.a2')::uuid)
    and (to_jsonb(a) ->> 'claimed_until')::timestamptz > now()), 2,
  'claimed rows carry a live claim lease');

select is(pg_temp.probe_role('hc_pipeline',
  $$ select coalesce(string_agg(id::text, ',' order by created_at), '<none>')
     from hc.claim_security_actions(5) $$),
  current_setting('t.a3'),
  'a second claim sees ONLY the unclaimed remainder — disjoint by construction');

select is(pg_temp.probe_role('hc_pipeline',
  $$ select coalesce(string_agg(id::text, ',' order by created_at), '<none>')
     from hc.claim_security_actions(5) $$),
  '<none>',
  'everything claimed → the next sweep gets nothing, and nothing errors');

do $$ begin
  update public.security_actions set claimed_until = now() - interval '1 second'
   where id = current_setting('t.a1')::uuid;
exception when undefined_column then null;   -- red leg: the column is the finding
end $$;
select is(pg_temp.probe_role('hc_pipeline',
  $$ select coalesce(string_agg(id::text, ',' order by created_at), '<none>')
     from hc.claim_security_actions(5) $$),
  current_setting('t.a1'),
  'a LAPSED claim is reclaimable — a crashed worker delays a kill, never loses it');

select is(pg_temp.jf(pg_temp.probe_role('hc_pipeline',
  format($$ select hc.complete_security_action(%L)::text $$,
         current_setting('t.a1'))), 'completed'), 'true',
  'complete_security_action is UNCHANGED and completes a claimed row');

do $$ begin
  update public.security_actions set claimed_until = now() - interval '1 second'
   where id in (current_setting('t.a2')::uuid, current_setting('t.a3')::uuid);
exception when undefined_column then null;   -- red leg: the column is the finding
end $$;
select is(pg_temp.probe_role('hc_pipeline',
  $$ select coalesce(string_agg(id::text, ',' order by created_at), '<none>')
     from hc.claim_security_actions(5) $$),
  current_setting('t.a2') || ',' || current_setting('t.a3'),
  'a COMPLETED action is never re-claimed; lapsed pending ones are');

select is(pg_temp.probe_role('hc_pipeline',
  $$ select hc.claim_security_actions(0)::text limit 1 $$),
  'ERROR:P0001', 'a zero limit refuses loudly');
select is(pg_temp.probe_role('hc_pipeline',
  $$ select hc.claim_security_actions(null)::text limit 1 $$),
  'ERROR:P0001', 'a null limit refuses loudly');
select is(pg_temp.probe_role('hc_pipeline',
  $$ select hc.claim_security_actions(101)::text limit 1 $$),
  'ERROR:P0001', 'a limit past the batch bound refuses loudly (the F9 backlog bound is 20/run)');

-- CATALOG-BASED closure, deliberately: a live function-ACL denial
-- segfaults this image's backend (the recorded 1A trap) — the privilege's
-- ABSENCE is asserted from the catalog, never dialled.
select ok(
  not coalesce((select has_function_privilege('authenticated', p.oid, 'execute')
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'hc' and p.proname = 'claim_security_actions'),
               true),
  'a request role cannot claim — the drain posture holds (catalog-asserted)');

select is((
  select count(*)::int from public.security_actions a
  where a.completed_at is null
    and a.id not in (select x.id from hc.pending_security_actions() x)), 0,
  'pending_security_actions is UNCHANGED: every incomplete action stays listed (claims are leases, not consumption)');

select * from finish();
rollback;
