-- ============================================================================
-- 1D · U3 — the access log's read side (TSD §2.8, §10.5; AC-PPL-7).
--
-- Reading the log is itself permission-filtered and the log is not a back
-- door into the domains it describes (§2.8): a circle-level entry
-- (subject_id null) is visible to every live member; an entry about a
-- subject requires ≥ log on the entry's domain via hc.visible_at — and an
-- entry about a subject with NO domain requires ≥ log on EVERY domain
-- (fail-closed all-domain, the 1C arrivals precedent). Freeze closes the
-- subject-scoped rows through the same one function while the freeze's
-- own circle-level entries stay visible (PRD §7.5 notifies every member).
--
-- Denial collapse (AC-PPL-7, staged from 1A): hc.log_denied() is the one
-- denial writer — actor forced to hc.uid() (no account parameter exists
-- to substitute, the A.5 pattern), live membership required, repeats
-- within the window collapse onto the head denial row by incrementing
-- collapsed_count/collapsed_until THROUGH a strict trigger carve-out:
-- those two presentation columns (excluded from the INV-11 hash by 1A
-- design), +1 exactly, denial rows only — every evidentiary column stays
-- immutable both ways, and DELETE stays unconditional (ADR-0009 records
-- the §2.8 "unconditionally" delta).
--
-- The signing interface (§2.8): hc.log_chain_heads() lists each circle's
-- (head_seq, head_hash) for the daily signer — a worker staged with
-- SIG-01; the function is owner-only, so the absent machinery is
-- non-callable (the boundary rule).
--
-- RED (U3): no grant, no policy, no hc.log_denied, no carve-out, no
-- hc.log_chain_heads — reads report 42501, signatures 42883-shaped nulls.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(24);

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
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- log×4, health HIDDEN
  u4 uuid := pg_temp.mk_user(gen_random_uuid());   -- removed member
  u0 uuid := pg_temp.mk_user(gen_random_uuid());   -- member of nothing
  c1 uuid; s1 uuid; m1 uuid; m2 uuid; m4 uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'),
    (u4, 'member', 'Gone'), (u0, 'member', 'Stranger');
  insert into public.circles (name, created_by) values ('Log circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'log-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join,
                                     removed_at)
  values (c1, u4, 'family', 'Gone', now()) returning id into m4;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
    if d <> 'health' then
      insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
      values (c1, m2, s1, d::hc.domain, 'log', u1);
    end if;
  end loop;

  -- chained entries, written through the one writer (as the maintenance
  -- role, a member of hc_internal): A circle-level, B health-domain,
  -- C schedule-domain, D subject-with-no-domain.
  perform hc.log(c1, 'member_joined', 'Sarah', u1);                                 -- A
  perform hc.log(c1, 'grant_changed', 'Sarah', u1, s1, m2,
                 'health'::hc.domain, null, 'log'::hc.access_level);                -- B
  perform hc.log(c1, 'grant_changed', 'Sarah', u1, s1, m2,
                 'schedule'::hc.domain, null, 'log'::hc.access_level);              -- C
  perform hc.log(c1, 'custodianship_declared', 'Sarah', u1, s1);                    -- D

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u4', u4::text, true);
  perform set_config('t.u0', u0::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · The grant and the policy, exact.
-- ----------------------------------------------------------------------------
select is((
  select coalesce(array_agg(g.privilege_type::text order by g.privilege_type::text), '{}'::text[])
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.table_name = 'access_log'
    and g.grantee = 'authenticated'),
  array['SELECT'],
  'access_log: authenticated holds SELECT and nothing else');

select is((
  select count(*)::int from pg_policy p
  where p.polrelid = 'public.access_log'::regclass
    and 'authenticated'::regrole::oid = any (p.polroles)), 1,
  'access_log: exactly one authenticated policy — the permission-filtered read (§2.8)');

-- ----------------------------------------------------------------------------
-- 3–9 · The filter: reader''s level on the entry''s domain, ≥ log; null
-- domain on a subject entry fails closed to all-domains; circle-level
-- entries reach every live member; outsiders and removed members reach
-- nothing.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.access_log where circle_id = %L $$,
  current_setting('t.c1'))), '4',
  'the manage×5 coordinator reads every entry');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and domain = 'health' $$,
  current_setting('t.c1'))), '0',
  'the member whose health is HIDDEN cannot see health-domain entries — the log is not a back door (§2.8)');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and domain = 'schedule' $$,
  current_setting('t.c1'))), '1',
  'log level on the domain suffices — activity is what log MEANS (§3.5)');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is null $$,
  current_setting('t.c1'))), '1',
  'circle-level entries (no subject) reach every live member');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is not null and domain is null $$,
  current_setting('t.c1'))), '0',
  'a subject entry with NO domain fails closed to all-domains — hidden health closes it (the 1C precedent)');

select is(pg_temp.call_as(current_setting('t.u0')::uuid, format(
  $$ select count(*)::text from public.access_log where circle_id = %L $$,
  current_setting('t.c1'))), '0',
  'a non-member reads nothing');

select is(pg_temp.call_as(current_setting('t.u4')::uuid, format(
  $$ select count(*)::text from public.access_log where circle_id = %L $$,
  current_setting('t.c1'))), '0',
  'a removed member reads nothing — the next query, not the next sign-in (A.2 posture)');

-- ----------------------------------------------------------------------------
-- 10–16 · Denial collapse (AC-PPL-7): one writer, actor forced, live
-- membership required, repeats collapse onto the head row.
-- ----------------------------------------------------------------------------
select ok(to_regprocedure('hc.log_denied(uuid, hc.domain, uuid)') is not null,
  'hc.log_denied(circle, domain, subject) exists — and has NO actor parameter to substitute (A.5)');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'health'::hc.domain, %L))::text $$,
  current_setting('t.c1'), current_setting('t.s1'))), '5',
  'a denied member records the denial through the one writer (seq 5 chains on)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type = 'access_denied' $$,
  current_setting('t.c1'))), '1',
  'one denial row exists');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'health'::hc.domain, %L))::text $$,
  current_setting('t.c1'), current_setting('t.s1'))), '5',
  'a repeat within the window returns the SAME seq — collapsed, not appended');

select is(pg_temp.scalar(format(
  $$ select count(*)::text || ':' || max(collapsed_count)::text
     from public.access_log
     where circle_id = %L and event_type = 'access_denied' $$,
  current_setting('t.c1'))), '1:2',
  'still one denial row, collapsed_count = 2, so a script cannot flood the family''s log (AC-PPL-7)');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'finances'::hc.domain, %L) > 5)::text $$,
  current_setting('t.c1'), current_setting('t.s1'))), 'true',
  'a different domain is a NEW entry — collapse never merges across domains');

select is(pg_temp.call_as(current_setting('t.u0')::uuid, format(
  $$ select (hc.log_denied(%L, 'health'::hc.domain, null))::text $$,
  current_setting('t.c1'))), 'ERROR:P0001:denied_log_refused',
  'a non-member cannot write into a family''s log — one refusal shape (DEF-10)');

-- ----------------------------------------------------------------------------
-- 17–19 · The carve-out is STRICT: evidentiary columns immutable both
-- ways; presentation columns move only by exactly-one increment.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ update public.access_log set detail = '{"edited": true}' where circle_id = %L $$,
  current_setting('t.c1'))), '42501',
  'evidentiary columns stay immutable — the trigger still raises on any content change');

select is(pg_temp.errcode_as('postgres', format(
  $$ update public.access_log set collapsed_count = collapsed_count + 5
     where circle_id = %L and event_type = 'access_denied' $$,
  current_setting('t.c1'))), '42501',
  'the carve-out admits +1 exactly, with collapsed_until advancing — a bulk rewrite of the presentation columns raises');

select is(pg_temp.errcode_as('postgres', format(
  $$ delete from public.access_log where circle_id = %L $$,
  current_setting('t.c1'))), '42501',
  'DELETE stays unconditional (INV-09 unchanged)');

-- ----------------------------------------------------------------------------
-- 20–21 · Freeze: subject-scoped rows close; the circle-level trail stays.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is not null $$,
  current_setting('t.c1'))), '0',
  'an open freeze closes every subject-scoped entry — for the coordinator too (AC-PERM-11)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is null $$,
  current_setting('t.c1'))), '1',
  'circle-level entries stay visible under the freeze — the freeze''s own trail must be readable (PRD §7.5)');

-- ----------------------------------------------------------------------------
-- 22–24 · The signing interface: per-circle chain heads for the daily
-- signer (worker staged, SIG-01) — owner-only, so non-callable today.
-- ----------------------------------------------------------------------------
select ok(to_regprocedure('hc.log_chain_heads()') is not null,
  'hc.log_chain_heads() exists — (circle_id, head_seq, head_hash) for the signer');

select is(pg_temp.scalar(format(
  $$ select (h.head_seq = (select max(seq) from public.access_log where circle_id = %L)
             and h.head_hash = (select entry_hash from public.access_log
                                where circle_id = %L
                                order by seq desc limit 1))::text
     from hc.log_chain_heads() h where h.circle_id = %L $$,
  current_setting('t.c1'), current_setting('t.c1'), current_setting('t.c1'))), 'true',
  'the head listing is the chain head: max seq and its entry_hash, per circle');

select ok(coalesce(
      not has_function_privilege('authenticated', to_regprocedure('hc.log_chain_heads()'), 'execute')
  and not has_function_privilege('anon',          to_regprocedure('hc.log_chain_heads()'), 'execute')
  and not has_function_privilege('hc_pipeline',   to_regprocedure('hc.log_chain_heads()'), 'execute')
  and not has_function_privilege('hc_admin',      to_regprocedure('hc.log_chain_heads()'), 'execute'),
  false),
  'the signer''s door is owner-only until the SIG-01 worker exists — absent machinery is non-callable');

select * from finish();
rollback;
