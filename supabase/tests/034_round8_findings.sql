-- ============================================================================
-- 1D · Round-8 findings, dispositioned (ADR-0010;
-- docs/review/round-8-findings.md F3/F4; F1's additions live in 031).
--
-- F3 — hc.log_denied validated its caller only (live membership), never
-- its p_subject_id: a stale or cross-circle subject rode the DEFERRABLE
-- INITIALLY DEFERRED declaration FK (round-5 F1) all the way to COMMIT,
-- aborting the otherwise-valid request with a raw 23503 far from the
-- call, instead of the DEF-10 uniform shape every other request-path
-- refusal keeps. No cross-tenant persistence was ever possible (the FK
-- holds); the defect was the SHAPE and the WHERE. As of M7 the function
-- refuses a subject that is not the circle's own at CALL time —
-- denied_log_refused, byte-identical to the stranger refusal, writing
-- nothing — and the deferred FK stays as the commit-time belt.
--
-- F4 — the read policy's subject_id-null branch was unconditionally
-- member-visible, so a denial logged with a domain but NO subject (a
-- normal log_denied shape — p_subject_id defaults to null) showed its
-- domain tag to members the per-domain filter would refuse (D1's
-- fail-closed-over-self-visibility intent, 030:5). M7 completes D1's
-- rule with the mirror of the 1C all-domains precedent: a subject entry
-- with no DOMAIN fails closed to all domains; a domained entry with no
-- SUBJECT fails closed to ALL SUBJECTS — visible only to a reader ≥ log
-- on that domain for every live subject of the circle, through the same
-- one function, so freeze arrives for free. Domain-less circle-level
-- entries (membership/freeze trail) are unchanged.
--
-- RED (round-8): F3 — the cross-circle and the nonexistent subject are
-- each ACCEPTED (a seq returns, rows land in-transaction) and the
-- deferred FK detonates at commit time (raw 23503, probed via SET
-- CONSTRAINTS ALL IMMEDIATE); F4 — the member with health hidden reads
-- back the health-tagged null-subject denial, and the freeze does not
-- close the domained null-subject rows.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(12);

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

-- The commit-time landmine detector: plpgsql's exception block is an
-- implicit savepoint, so a raised 23503 rolls the SET CONSTRAINTS back
-- and the rest of the file keeps its deferred semantics.
create function pg_temp.fk_probe() returns text
language plpgsql as $$
begin
  set constraints all immediate;
  return 'no_error';
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- coordinator, manage×5
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- log×4, health HIDDEN
  u9 uuid := pg_temp.mk_user(gen_random_uuid());   -- another circle's founder
  c1 uuid; s1 uuid; c9 uuid; s9 uuid; m1 uuid; m2 uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u9, 'member', 'Owen');
  insert into public.circles (name, created_by) values ('Round8 circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'r8-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
    if d <> 'health' then
      insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
      values (c1, m2, s1, d::hc.domain, 'log', u1);
    end if;
  end loop;

  -- the OTHER family, whose subject a bad caller might name
  insert into public.circles (name, created_by) values ('Round8 other circle', u9)
    returning id into c9;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c9, 'Ruth', 'aging in place', '02139', 'America/New_York', 'clay',
          'r8b-' || substr(c9::text, 1, 8)) returning id into s9;

  -- exactly ONE domain-less circle-level entry, for the unchanged branch
  perform hc.log(c1, 'member_joined', 'Sarah', u1);

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s9', s9::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–5 · F3: the subject must be the circle's own — refused at CALL time
-- in the ONE shape, writing nothing; commit stays clean.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'finances'::hc.domain, %L) > 0)::text $$,
  current_setting('t.c1'), current_setting('t.s1'))), 'true',
  'control: a denial about the circle''s own subject records through the one writer');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'health'::hc.domain, %L))::text $$,
  current_setting('t.c1'), current_setting('t.s9'))),
  'ERROR:P0001:denied_log_refused',
  'a CROSS-CIRCLE subject refuses at call time in the one shape — not a raw FK error at commit (round-8 F3)');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'health'::hc.domain, %L))::text $$,
  current_setting('t.c1'), gen_random_uuid())),
  'ERROR:P0001:denied_log_refused',
  'a NONEXISTENT subject is indistinguishable from an unauthorized one — DEF-10 holds on the last request-path door');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type = 'access_denied'
       and subject_id is not null and subject_id <> %L $$,
  current_setting('t.c1'), current_setting('t.s1'))), '0',
  'the refusals wrote NOTHING — no bad-subject row exists even inside the transaction');

select is(pg_temp.fk_probe(), 'no_error',
  'commit-time is clean: SET CONSTRAINTS ALL IMMEDIATE raises nothing — the refusal moved from a raw 23503 at commit to the call site (the deferred FK stays as the belt)');

-- ----------------------------------------------------------------------------
-- 6–10 · F4: a domained entry with no subject fails closed to ALL
-- SUBJECTS — the domain tag never rides the circle-wide branch.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'health'::hc.domain, null) > 0)::text $$,
  current_setting('t.c1'))), 'true',
  'control: a null-subject health denial records (the route layer may not know the subject)');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is null and domain = 'health' $$,
  current_setting('t.c1'))), '0',
  'the member whose health is HIDDEN cannot read the health-tagged null-subject denial — their own included, the D1 fail-closed intent made total (round-8 F4)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is null and domain = 'health' $$,
  current_setting('t.c1'))), '1',
  'manage×5 still reads it — ≥ log on the domain for EVERY live subject; the audit trail survives the filter');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select (hc.log_denied(%L, 'schedule'::hc.domain, null) > 0)::text $$,
  current_setting('t.c1'))), 'true',
  'control: a null-subject schedule denial records');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is null and domain = 'schedule' $$,
  current_setting('t.c1'))), '1',
  'the same member READS the schedule-tagged one (log on schedule for every subject) — the rule is the domain filter, not blanket darkness');

-- ----------------------------------------------------------------------------
-- 11–12 · F4 under freeze: the new branch closes with everything else;
-- the domain-less trail stays readable.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is null and domain is not null $$,
  current_setting('t.c1'))), '0',
  'an open freeze closes the domained null-subject rows too — same one function, same closure (AC-PERM-11)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and subject_id is null and domain is null $$,
  current_setting('t.c1'))), '1',
  'the domain-less circle-level trail stays visible under the freeze — unchanged (PRD §7.5)');

select * from finish();
rollback;
