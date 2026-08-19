-- ============================================================================
-- 4A · M4 — PST-01: the product-facing state (slice-4 plan M4; TSD §4.4;
-- PRD §4.2.2's vocabulary; the A.4 parent-rollup existence oracle).
--
-- The contract these tests pin:
--   · hc.state_rank / hc.state_label — the CLOSED mapping from every
--     internal hc.arrival_state to a rank (ascending progress; stuck
--     states rank below the moving states of their phase — the "least
--     advanced" a family should see first) and to one of PRD §4.2.2's
--     fifteen product strings. A 22nd enum value without a rank/label
--     fails this suite (the all_domains precedent).
--   · hc.product_state(p_arrival) — a leaf answers its own label; a
--     parent reports its LEAST-ADVANCED live child. Live = not deleted
--     and not cancelled (a member's deliberate stop must not drag three
--     filed siblings to "Cancelled"); a parent with no live children
--     falls back to its own state. The rollup runs over the CALLER's
--     visible children only (A.4 — an invisible child must not steer
--     what this caller reads). authenticated EXECUTE; nonexistent,
--     unauthorized, below-cliff and deleted land in ONE refusal shape
--     (DEF-10 — no existence oracle).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(19);

-- ----------------------------------------------------------------------------
-- Helpers (the 043/044 pattern).
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

create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then p_out
              else p_out::jsonb ->> p_field end;
$$;

-- Guarded mapping probes: null (never an abort) while the fns are absent.
create function pg_temp.rank_of(p text) returns int
language plpgsql as $$
begin
  return hc.state_rank(p::hc.arrival_state);
exception when others then return null;
end $$;

create function pg_temp.label_of(p text) returns text
language plpgsql as $$
begin
  return hc.state_label(p::hc.arrival_state);
exception when others then return null;
end $$;

-- A fixture arrival in an arbitrary state (postgres-side, fixtures only).
create function pg_temp.mk_arr(p_state text, p_parent uuid default null) returns uuid
language plpgsql as $$
declare v uuid;
begin
  insert into public.arrivals
    (circle_id, subject_id, parent_arrival_id, channel, state, byte_size)
  values (current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
          p_parent, 'email', p_state::hc.arrival_state, 100)
  returning id into v;
  return v;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  u3 uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Rosa'), (u2, 'member', 'Stranger'), (u3, 'member', 'Narrow');
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', 'cc46-nell-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);
select set_config('t.c1', pg_temp.jf(current_setting('t.c1res'), 'circle_id'), true);
select set_config('t.s1',
  (select s.id::text from public.subjects s
   where s.circle_id = current_setting('t.c1')::uuid), true);

-- Narrow (u3): a live member holding manage on FOUR of five domains —
-- the pinned 027:31 cliff, carried to this oracle.
do $$
declare v_m uuid;
begin
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (current_setting('t.c1')::uuid, current_setting('t.u3')::uuid,
          'coordinator', 'Narrow')
  returning id into v_m;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  select current_setting('t.c1')::uuid, v_m, current_setting('t.s1')::uuid,
         d, 'manage', current_setting('t.u1')::uuid
  from unnest(array['memories','health','schedule','documents']::hc.domain[]) d;
end $$;

-- ----------------------------------------------------------------------------
-- 1–7 · The surface and the closed mapping.
-- ----------------------------------------------------------------------------
select has_function('hc', 'state_rank', array['hc.arrival_state']::name[],
  'hc.state_rank exists');
select has_function('hc', 'state_label', array['hc.arrival_state']::name[],
  'hc.state_label exists — PRD §4.2.2''s vocabulary');
select has_function('hc', 'product_state', array['uuid']::name[],
  'hc.product_state(p_arrival) exists — PST-01');

create temp view fn_exec46 as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(
  (select count(*)::int from fn_exec46
   where proname in ('product_state', 'state_label', 'state_rank')
     and rolname = 'authenticated') = 3
  and not exists (select 1 from fn_exec46
   where proname in ('product_state', 'state_label', 'state_rank')
     and rolname in ('anon', 'hc_admin')),
  'the three surfaces are authenticated (the family''s vocabulary), never anon/admin');

select is((
  select count(*)::int from unnest(enum_range(null::hc.arrival_state)) s
  where pg_temp.rank_of(s::text) is null), 0,
  'every internal state has a rank — a 22nd enum value fails this suite');

select is((
  select count(distinct pg_temp.rank_of(s::text))::int
  from unnest(enum_range(null::hc.arrival_state)) s), 21,
  'ranks are distinct — the least-advanced choice is total, never arbitrary');

select is((
  select array_agg(distinct pg_temp.label_of(s::text) order by pg_temp.label_of(s::text))
  from unnest(enum_range(null::hc.arrival_state)) s),
  array['Arrived', 'Cancelled', 'Checking', 'Couldn''t read it',
        'Couldn''t store it', 'Filed', 'Held · not safe to open',
        'Held · unknown sender', 'Held · we couldn''t check it',
        'Looks like a duplicate', 'Needs a password', 'Needs you',
        'Nothing filed', 'Reading', 'Unsupported file'],
  'the label set is EXACTLY PRD §4.2.2''s fifteen product strings');

-- ----------------------------------------------------------------------------
-- 8–13 · Leaf mappings and the honest edges.
-- ----------------------------------------------------------------------------
select set_config('t.a1', pg_temp.mk_arr('scanned')::text, true);
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.a1'))),
  'Arrived', 'a leaf maps purely: scanned → Arrived (stored and cleared)');

select set_config('t.a2', pg_temp.mk_arr('proposals_ready')::text, true);
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.a2'))),
  'Needs you', 'proposals_ready → Needs you');

select set_config('t.a3', pg_temp.mk_arr('store_failed')::text, true);
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.a3'))),
  'Couldn''t store it',
  'store_failed → Couldn''t store it — nothing was kept, and the label never implies a copy exists');

select set_config('t.a4', pg_temp.mk_arr('quarantined')::text, true);
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.a4'))),
  'Held · not safe to open',
  'quarantined → its OWN label, never collapsed with not-knowing (AC-INBOX-15)');

select set_config('t.a5', pg_temp.mk_arr('scan_unavailable')::text, true);
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.a5'))),
  'Held · we couldn''t check it',
  'scan_unavailable → the fail-closed not-knowing label');

select set_config('t.a6', pg_temp.mk_arr('received')::text, true);
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.a6'))),
  'Checking', 'received → Checking (not yet cleared, not yet renderable)');

-- ----------------------------------------------------------------------------
-- 14–16 · The parent rollup (the A.4 oracle, with the PRD §4.4 family).
-- ----------------------------------------------------------------------------
do $$
declare v_p uuid;
begin
  v_p := pg_temp.mk_arr('extracted');
  perform set_config('t.p', v_p::text, true);
  perform set_config('t.k1', pg_temp.mk_arr('proposals_ready', v_p)::text, true);
  perform set_config('t.k2', pg_temp.mk_arr('proposals_ready', v_p)::text, true);
  perform set_config('t.k3', pg_temp.mk_arr('extract_failed', v_p)::text, true);
  perform set_config('t.k4', pg_temp.mk_arr('needs_password', v_p)::text, true);
end $$;

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.p'))),
  'Needs a password',
  'the §4.4 four-child family: two Needs you + Couldn''t read it + Needs a password → the parent reports the LEAST-advanced');

do $$
begin
  update public.arrivals set deleted_at = now()
   where id = current_setting('t.k4')::uuid;
end $$;
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.p'))),
  'Couldn''t read it',
  'a DELETED child leaves the rollup — the next least-advanced live child reports');

do $$
begin
  update public.arrivals set state = 'cancelled'
   where id = current_setting('t.k3')::uuid;
end $$;
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.p'))),
  'Needs you',
  'a CANCELLED child leaves the rollup too — a deliberate stop never drags its siblings');

-- ----------------------------------------------------------------------------
-- 17–19 · DEF-10: one refusal shape, no existence oracle, the cliff holds.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $$ select hc.product_state(%L) $$, gen_random_uuid())),
  'ERROR:P0001', 'a nonexistent arrival refuses in the one shape');

select ok(
  pg_temp.probe(current_setting('t.u2')::uuid, format(
    $$ select hc.product_state(%L) $$, current_setting('t.a1'))) = 'ERROR:P0001'
  and pg_temp.probe(current_setting('t.u2')::uuid, format(
    $$ select hc.product_state(%L) $$, gen_random_uuid())) = 'ERROR:P0001',
  'a non-member''s real and ghost probes are byte-identical — no existence oracle');

select is(pg_temp.probe(current_setting('t.u3')::uuid, format(
  $$ select hc.product_state(%L) $$, current_setting('t.a1'))),
  'ERROR:P0001',
  'manage on four of five domains → refused in the SAME shape (the 027:31 cliff, carried to this oracle)');

select * from finish();
rollback;
