-- ============================================================================
-- hc.create_circle() — the founder path (TSD §2.3, AC-AUTH-6, PRD §7.5).
--
-- The load-bearing property: the custodianship declaration is seq = 1 in
-- the circle's hash chain, written before subjects, memberships and
-- grants. Plus: the two-subject cap, AC-ADMIN-3 as pure constraint
-- (ADR-0002 claim 7), the attach-parent-login regression (§3.13), and an
-- INDEPENDENT recomputation of the hash chain.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(23);

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

do $$
declare
  uf uuid := pg_temp.mk_user(gen_random_uuid());   -- founder
  up uuid := pg_temp.mk_user(gen_random_uuid());   -- later parent login
  ua uuid := pg_temp.mk_user(gen_random_uuid());   -- admin account
begin
  insert into public.accounts (id, kind, display_name) values
    (uf, 'member', 'Founder'), (up, 'member', 'Nell (parent login)'),
    (ua, 'admin',  'Operator');
  insert into public.admin_users (account_id, mfa_enrolled_at) values (ua, now());
  perform set_config('t.uf', uf::text, true);
  perform set_config('t.up', up::text, true);
  perform set_config('t.ua', ua::text, true);
end $$;

-- Unauthenticated first (request.jwt.claims is transaction-scoped, so this
-- must precede any as_user call): no identity, no circle.
select throws_ok(
  $$ select hc.create_circle('No one''s circle', '[{"first_name":"X"}]'::jsonb) $$,
  'P0001', null, 'no authenticated identity → normalised refusal');

-- ----------------------------------------------------------------------------
-- The founder path, as authenticated.
-- ----------------------------------------------------------------------------
select pg_temp.as_user(current_setting('t.uf')::uuid);
select set_config('t.res', hc.create_circle(
  'Nell & Frank''s circle',
  jsonb_build_array(
    jsonb_build_object('first_name', 'Nell',  'situation', 'recovering at home',
                       'postal_code', '02138', 'timezone', 'America/New_York',
                       'accent_color', 'sage',
                       'forwarding_local_part', 'cc6-nell-' || substr(gen_random_uuid()::text, 1, 8)),
    jsonb_build_object('first_name', 'Frank', 'situation', 'aging in place',
                       'postal_code', '02138', 'timezone', 'America/New_York',
                       'accent_color', 'clay',
                       'forwarding_local_part', 'cc6-frank-' || substr(gen_random_uuid()::text, 1, 8))),
  array['post-hospital discharge'])::text, true);
reset role;

select ok(exists (
    select 1 from public.circles
    where id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid
      and created_by = current_setting('t.uf')::uuid and state = 'setup'),
  'the circle row exists, founder-owned, in setup');

-- AC-AUTH-6, the §2.3 pgTAP invariant: seq = 1 is custodianship_declared
-- for EVERY circle (created through the founder path).
select is((
    select count(*)::int from public.access_log l
    where l.seq = 1 and l.event_type <> 'custodianship_declared'), 0,
  'no circle''s chain starts with anything but a custodianship declaration');

select is((
    select count(*)::int from public.access_log l
    where l.circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid
      and l.seq in (1, 2) and l.event_type = 'custodianship_declared'), 2,
  'two subjects → seq 1 AND 2 are the declarations, before any other event');

-- Round-5 finding 1: the receipt must be DURABLY subject-bound — a
-- preallocated subject id written under a deferred FK, not a free-text
-- name that two same-named subjects could each claim.
select is((
    select count(*)::int from public.access_log l
    join public.subjects s
      on s.id = l.subject_id and s.circle_id = l.circle_id
    where l.circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid
      and l.event_type = 'custodianship_declared'
      and s.first_name = l.detail ->> 'subject_name'
      and l.detail ->> 'custodian' = 'Founder'
      and l.detail ->> 'declared_on' is not null), 2,
  'each declaration is bound to its subject''s preallocated id AND names it (subject-bound receipt, round-5 F1)');

select is((select count(*)::int from public.subjects
           where circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid), 2,
  'both subjects created');

select is((
    select count(*)::int from public.circle_members m
    where m.circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid
      and m.subject_id is not null and m.account_id is null
      and m.custodian_member_id = (current_setting('t.res')::jsonb ->> 'founder_member_id')::uuid
      and m.tier = 'coordinator'), 2,
  'each subject holds a member row: no account, founder as custodian, coordinator tier (AC-PPL-3)');

select ok(exists (
    select 1 from public.circle_members m
    where m.id = (current_setting('t.res')::jsonb ->> 'founder_member_id')::uuid
      and m.account_id = current_setting('t.uf')::uuid
      and m.tier = 'coordinator' and m.removed_at is null),
  'the founder''s coordinator membership exists');

select is((
    select count(*)::int from public.access_grants g
    where g.member_id = (current_setting('t.res')::jsonb ->> 'founder_member_id')::uuid
      and g.level = 'manage'), 10,
  'founder holds manage on all five domains of both subjects');

select is((
    select count(*)::int from public.access_grants g
    join public.circle_members m on m.id = g.member_id
    where m.circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid
      and m.subject_id is not null
      and g.subject_id = m.subject_id and g.level = 'manage'), 10,
  'each subject-member row holds manage on all five of its OWN domains (PRD §7.5)');

select ok(
      jsonb_array_length(current_setting('t.res')::jsonb -> 'subject_ids') = 2
  and (current_setting('t.res')::jsonb ? 'circle_id')
  and (current_setting('t.res')::jsonb ? 'founder_member_id'),
  'the return names circle, founder membership and both subjects');

-- The two-subject cap (PRD §2) — enforced in the function, deliberately
-- not pretended to be a CHECK (§2.3 note).
select pg_temp.as_user(current_setting('t.uf')::uuid);
select throws_ok(
  $$ select hc.create_circle('Too many',
       '[{"first_name":"A"},{"first_name":"B"},{"first_name":"C"}]'::jsonb) $$,
  'P0001', null, 'three subjects refused');
select throws_ok(
  $$ select hc.create_circle('Too few', '[]'::jsonb) $$,
  'P0001', null, 'zero subjects refused');
reset role;

-- ----------------------------------------------------------------------------
-- The hash chain, independently recomputed (§2.8): gapless, linked, and
-- every entry_hash reproducible from the stored row alone.
-- ----------------------------------------------------------------------------
select ok((
    select max(l.seq) = count(*) from public.access_log l
    where l.circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid),
  'seq is gapless');

select is((
    select count(*)::int from public.access_log l
    join public.access_log prev
      on prev.circle_id = l.circle_id and prev.seq = l.seq - 1
    where l.circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid
      and l.prev_hash is distinct from prev.entry_hash), 0,
  'every entry links to its predecessor''s hash');

-- Round-5 finding 2: the v1 canonical digest covers EVERY immutable
-- evidentiary column — session, request and correction linkage included.
-- collapsed_count/collapsed_until are deliberately outside it: mutable
-- presentation counters (1D denial collapse), never hashed evidence.
select is((
    select count(*)::int from public.access_log l
    where l.circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid
      and l.entry_hash is distinct from extensions.digest(
        coalesce(l.prev_hash, ''::bytea) || convert_to(
          jsonb_build_object(
            'v', 1,
            'circle_id', l.circle_id, 'seq', l.seq, 'event_type', l.event_type,
            'actor_account_id', l.actor_account_id,
            'actor_display_name', l.actor_display_name,
            'actor_session_id', l.actor_session_id, 'request_id', l.request_id,
            'subject_id', l.subject_id, 'target_member_id', l.target_member_id,
            'domain', l.domain, 'level_before', l.level_before,
            'level_after', l.level_after, 'object_type', l.object_type,
            'object_id', l.object_id, 'detail', l.detail,
            'corrects_id', l.corrects_id,
            'occurred_at', extract(epoch from l.occurred_at))::text, 'UTF8'),
        'sha256')), 0,
  'every entry_hash recomputes as the COMPLETE v1 canonical — no unhashed evidentiary column (round-5 F2)');

-- ----------------------------------------------------------------------------
-- AC-ADMIN-3 as pure constraint (ADR-0002 claim 7), and the §3.13
-- attach-parent-login regression.
-- ----------------------------------------------------------------------------
select throws_ok(format(
  $$ insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
     values (%L, %L, 'family', 'Operator') $$,
  current_setting('t.res')::jsonb ->> 'circle_id', current_setting('t.ua')),
  '23503', null,
  'an admin account cannot be inserted into circle_members — the composite FK finds no (id, member) row');

select throws_ok(format(
  $$ update public.accounts set kind = 'admin' where id = %L $$,
  current_setting('t.uf')),
  '23503', null,
  'an account holding a membership cannot be flipped to admin — the FK breaks');

select lives_ok(format(
  $$ update public.circle_members
     set account_id = %L
     where circle_id = %L and subject_id is not null
       and display_name_at_join = 'Nell' $$,
  current_setting('t.up'), current_setting('t.res')::jsonb ->> 'circle_id'),
  'attaching a parent login is one UPDATE and nothing else (auth §6)');

select ok(exists (
    select 1 from public.circle_members m
    where m.circle_id = (current_setting('t.res')::jsonb ->> 'circle_id')::uuid
      and m.account_id = current_setting('t.up')::uuid
      and m.subject_id is not null
      and m.custodian_member_id is not null),
  'the row still resolves to its subject, custodianship retained as history (PRD §7.5)');

-- Closure.
-- 4A M1 (R2/Q2): the signature gained p_relationship; the old overload
-- was DROPPED, never left beside it (the exact-inventory invariant).
select ok(has_function_privilege('authenticated', 'hc.create_circle(text,jsonb,text[],text)', 'execute'),
  'the founder path is callable by authenticated');
select ok(
      not has_function_privilege('anon',        'hc.create_circle(text,jsonb,text[],text)', 'execute')
  and not has_function_privilege('hc_pipeline', 'hc.create_circle(text,jsonb,text[],text)', 'execute')
  and not has_function_privilege('hc_admin',    'hc.create_circle(text,jsonb,text[],text)', 'execute'),
  'and by nothing else');

-- Round-5 finding 4: the universal property, driven from CIRCLES — a
-- circle with no declaration at all must fail this, not pass invisibly.
-- For every circle: one declaration per subject, occupying exactly the
-- leading sequence positions 1..n.
select is((
    select count(*)::int from public.circles c
    where (select count(*) from public.subjects s where s.circle_id = c.id)
          <> (select count(*) from public.access_log l
              where l.circle_id = c.id and l.event_type = 'custodianship_declared')
       or exists (select 1 from public.access_log l
                  where l.circle_id = c.id
                    and l.event_type = 'custodianship_declared'
                    and l.seq > (select count(*) from public.subjects s
                                 where s.circle_id = c.id))), 0,
  'EVERY circle: one declaration per subject, at seq 1..n exactly (round-5 F4)');

select * from finish();
rollback;
