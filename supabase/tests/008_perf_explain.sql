-- ============================================================================
-- Performance shape at representative volume (TSD §3.2, §3.12; ADR-0002
-- note 2; ADR-0003 finding 9).
--
-- Three instruments:
--   1. EXPLAIN: every textual (select hc.ctx()) reference hoists to an
--      InitPlan — never a per-row SubPlan.
--   2. An instrumented hc.ctx() (replaced INSIDE this rolled-back
--      transaction) counts ACTUAL executions: the invariant is "once per
--      textual reference, never once per row".
--   3. Wall clock against the §3.12/§1.8-derived budget. The 250 ms bound
--      is a regression tripwire for O(rows) behaviour with CI headroom,
--      not a tight SLA; measured figures go in the round-5 packet.
--
-- Volume: 100 circles × 2 subjects × 7 members, full manage grants for the
-- founder — ~1.4k memberships, ~7.2k grants; the caller is a live member
-- of 5 circles (10 reachable subjects).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(9);

create function pg_temp.as_user(p_id uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ----------------------------------------------------------------------------
-- Volume fixtures, set-based.
-- ----------------------------------------------------------------------------
do $$
declare v_caller uuid;
begin
  create temp table fx_accounts as
    select gen_random_uuid() as id, i as n from generate_series(1, 700) i;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  select '00000000-0000-0000-0000-000000000000', id, 'authenticated',
         'authenticated', id || '@volume.local', 'x', now(), now(), now(), '{}', '{}'
  from fx_accounts;

  insert into public.accounts (id, kind, display_name)
  select id, 'member', 'Member ' || n from fx_accounts;

  -- 100 circles, founder = account (c-1)*7+1; members 2..7 join it.
  create temp table fx_circles as
    select c as cn, (select id from fx_accounts where n = (c-1)*7+1) as founder,
           gen_random_uuid() as cid
    from generate_series(1, 100) c;

  insert into public.circles (id, name, created_by)
  select cid, 'Circle ' || cn, founder from fx_circles;

  create temp table fx_subjects as
    select gen_random_uuid() as sid, f.cid, f.cn, s as sn
    from fx_circles f, generate_series(1, 2) s;

  insert into public.subjects (id, circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  select sid, cid, 'Subject ' || cn || '-' || sn, 's', 'z', 'UTC', 'sage',
         'vol-' || cn || '-' || sn || '-' || substr(sid::text, 1, 8)
  from fx_subjects;

  create temp table fx_members as
    select gen_random_uuid() as mid, f.cid, f.cn, m as mn,
           (select id from fx_accounts where n = (f.cn-1)*7+m) as acct
    from fx_circles f, generate_series(1, 7) m;

  insert into public.circle_members (id, circle_id, account_id, tier, display_name_at_join)
  select mid, cid, acct, case when mn = 1 then 'coordinator'
                              when mn <= 5 then 'family' else 'care_circle' end::hc.tier,
         'Member ' || mn
  from fx_members;

  -- founder: manage on everything; others: view on subject 1's five domains.
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  select m.cid, m.mid, s.sid, d, 'manage', m.acct
  from fx_members m
  join fx_subjects s on s.cid = m.cid
  cross join unnest(enum_range(null::hc.domain)) d
  where m.mn = 1;

  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  select m.cid, m.mid, s.sid, d, 'view',
         (select mm.acct from fx_members mm where mm.cid = m.cid and mm.mn = 1)
  from fx_members m
  join fx_subjects s on s.cid = m.cid and s.sn = 1
  cross join unnest(enum_range(null::hc.domain)) d
  where m.mn between 2 and 5;

  -- The caller: member #2 of circles 1..5 is five DIFFERENT accounts; make
  -- one account a member of circles 2..5 as well so it reaches 5 circles.
  select acct into v_caller from fx_members where cn = 1 and mn = 2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  select cid, v_caller, 'family', 'Caller' from fx_circles where cn between 2 and 5;

  perform set_config('t.caller', v_caller::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1 · EXPLAIN shape: InitPlans == textual ctx references; SubPlans == 0.
-- ----------------------------------------------------------------------------
create function pg_temp.plan_of(p_sql text) returns text language plpgsql as $$
declare v text := ''; l text;
begin
  for l in execute 'explain (format text) ' || p_sql loop
    v := v || l || e'\n';
  end loop;
  return v;
end $$;

-- Count plan NODES only: headers sit on their own line ("  InitPlan 1"),
-- while per-row references appear inline as "(InitPlan 1).col1" — the
-- newline anchor separates the two.
create function pg_temp.count_nodes(p_text text, p_kind text) returns int
language sql as $$
  select regexp_count(p_text, '\n\s*' || p_kind || ' \d')
$$;

-- M1's deny-by-default covers pg_temp helpers too, and a function call
-- denied by ACL segfaults this image (see 004) — grant the helpers to the
-- roles that invoke them.
grant execute on function pg_temp.plan_of(text) to authenticated;

select pg_temp.as_user(current_setting('t.caller')::uuid);

select set_config('t.plan_subjects',
  pg_temp.plan_of('select * from public.subjects'), true);
select set_config('t.plan_members',
  pg_temp.plan_of('select * from public.circle_members'), true);
select set_config('t.plan_grants',
  pg_temp.plan_of('select * from public.access_grants'), true);
select set_config('t.plan_circles',
  pg_temp.plan_of('select * from public.circles'), true);

reset role;

select ok(
      pg_temp.count_nodes(current_setting('t.plan_subjects'), 'InitPlan') = 1
  and pg_temp.count_nodes(current_setting('t.plan_subjects'), 'SubPlan') = 0,
  'subjects: ONE textual ctx reference → exactly one InitPlan, zero SubPlans');
select ok(
      pg_temp.count_nodes(current_setting('t.plan_members'), 'InitPlan') = 1
  and pg_temp.count_nodes(current_setting('t.plan_members'), 'SubPlan') = 0,
  'circle_members: one InitPlan, zero SubPlans');
-- The EXISTS half of the own-rows policy plans as a HASHED SubPlan: built
-- once per query (the runtime count below proves ctx ran exactly twice),
-- with the second ctx reference hoisted to an InitPlan inside it. The
-- invariant: both references are InitPlans, and any SubPlan present is
-- hashed — a one-shot structure, never a per-row re-execution.
select ok(
      pg_temp.count_nodes(current_setting('t.plan_grants'), 'InitPlan') = 2
  and pg_temp.count_nodes(current_setting('t.plan_grants'), 'SubPlan')
        = regexp_count(current_setting('t.plan_grants'), 'hashed SubPlan \d'),
  'access_grants: two InitPlans for two textual refs; any SubPlan is hashed (one-shot)');
select ok(
      pg_temp.count_nodes(current_setting('t.plan_circles'), 'InitPlan') = 1
  and pg_temp.count_nodes(current_setting('t.plan_circles'), 'SubPlan') = 0,
  'circles: one InitPlan, zero SubPlans');

-- ----------------------------------------------------------------------------
-- 2 · Exact execution count, measured (per textual reference, never per
--     row — ADR-0003 finding 9's restated invariant). hc.ctx() is replaced
--     inside this transaction with a counting shim delegating to
--     hc.ctx_for(hc.uid()) (parity proven in 004); rollback restores it.
-- ----------------------------------------------------------------------------
create temp sequence ctx_calls;
select nextval('ctx_calls');   -- currval becomes readable

create function pg_temp.bump_ctx() returns jsonb
language plpgsql stable
as $$
begin
  perform nextval('ctx_calls');
  return hc.ctx_for(hc.uid());
end $$;

grant execute on function pg_temp.bump_ctx() to hc_internal;
grant usage, select, update on sequence ctx_calls to hc_internal;
grant usage, select on sequence ctx_calls to authenticated;   -- currval reads below run as the caller

create or replace function hc.ctx()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select pg_temp.bump_ctx();
$$;

select pg_temp.as_user(current_setting('t.caller')::uuid);

select set_config('t.c0', currval('ctx_calls')::text, true);
select set_config('t.rows_subjects',
  (select count(*) from public.subjects)::text, true);
select set_config('t.c1', currval('ctx_calls')::text, true);
select set_config('t.rows_grants',
  (select count(*) from public.access_grants)::text, true);
select set_config('t.c2', currval('ctx_calls')::text, true);

reset role;

select is(current_setting('t.c1')::int - current_setting('t.c0')::int, 1,
  format('subjects scan over %s visible rows executed ctx() exactly ONCE',
         current_setting('t.rows_subjects')));
select is(current_setting('t.c2')::int - current_setting('t.c1')::int, 2,
  'access_grants scan executed ctx() exactly TWICE — once per textual reference, never per row');

select ok(current_setting('t.rows_subjects')::int = 10,
  'the caller reaches exactly the 10 subjects of their 5 circles at volume');

-- ----------------------------------------------------------------------------
-- 3 · Wall clock at volume (real hc.ctx() — rollback of the shim happens at
--     transaction end, so restore it explicitly for the timing runs).
-- ----------------------------------------------------------------------------
create or replace function hc.ctx()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', hc.uid(),
    'circles', coalesce((select array_agg(distinct m.circle_id)
                         from public.circle_members m
                         where m.account_id = hc.uid() and m.removed_at is null),
                        '{}'::uuid[]),
    'subjects', coalesce((
      select jsonb_object_agg(s.subject_id::text, jsonb_build_object(
        'c',       s.circle_id,
        'member',  s.member_id,
        'tier',    s.tier,
        'frozen',  s.frozen,
        'manage',  s.manage, 'view', s.view, 'summary', s.summary, 'log', s.log))
      from hc.grant_vectors(hc.uid()) s), '{}'::jsonb),
    'shares', '{}'::jsonb);
$$;

create function pg_temp.ms_of(p_sql text) returns numeric language plpgsql as $$
declare t0 timestamptz; t1 timestamptz;
begin
  t0 := clock_timestamp();
  execute p_sql;
  t1 := clock_timestamp();
  return round(extract(epoch from (t1 - t0)) * 1000, 2);
end $$;
grant execute on function pg_temp.ms_of(text) to authenticated;

select pg_temp.as_user(current_setting('t.caller')::uuid);
select set_config('t.ms_subjects',
  pg_temp.ms_of('select count(*) from public.subjects')::text, true);
select set_config('t.ms_grants',
  pg_temp.ms_of('select count(*) from public.access_grants')::text, true);
reset role;

select cmp_ok(current_setting('t.ms_subjects')::numeric, '<', 250::numeric,
  format('subjects read at volume: %s ms (< 250 ms tripwire; §1.8 page budget 1500 ms)',
         current_setting('t.ms_subjects')));
select cmp_ok(current_setting('t.ms_grants')::numeric, '<', 250::numeric,
  format('access_grants read at volume: %s ms (< 250 ms tripwire)',
         current_setting('t.ms_grants')));

select * from finish();
rollback;
