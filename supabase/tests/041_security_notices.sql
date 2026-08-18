-- ============================================================================
-- 2A · M7 — revocation notices as security-class mail (TSD §5.9's explicit
-- exception, built exactly as far as §5.8 requires; delivery is slice 11).
--
-- A revocation notice is addressed to the person whose access just ended —
-- a send-time authorization check would suppress precisely the message
-- they are owed. So it goes to the VERIFIED ACCOUNT ADDRESS regardless of
-- circle access, and carries NO subject, domain, or record information:
-- it names the circle, says access changed, and says who changed it.
-- That is about them, not about the record.
--
-- The contract these tests pin:
--   · hc.remove_member enqueues ONE security-class 'membership_removed'
--     row to the removed member's account address.
--   · hc.set_grant enqueues ONE security-class 'access_changed' row on a
--     LOWER. A RAISE enqueues nothing (widening is not a revocation);
--     a same-level no-op enqueues nothing.
--   · The payload is EXACTLY {circle_name, changed_by} — the §5.9
--     content-free constraint pinned as an exact key set: no domain, no
--     level, no subject, nothing from a record table.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(8);

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

create function pg_temp.call_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated')::text, true);
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

create function pg_temp.mint_raise(p_user uuid, p_target text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password',
      'timestamp', extract(epoch from now())::bigint)))::text, true);
  execute 'set local role authenticated';
  v := hc.mint_step_up('raise_grant', p_target) ->> 'token';
  execute 'reset role';
  return v;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  u3 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m1 uuid; m2 uuid; m3 uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u3, 'member', 'Dan');
  insert into public.circles (name, created_by) values ('Notice circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'ntc-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Dan') returning id into m3;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m2, s1, 'health', 'view', u1),
         (c1, m3, s1, 'health', 'view', u1);

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.m2', m2::text, true);
  perform set_config('t.m3', m3::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–3 · A LOWER enqueues the content-free notice; raises and no-ops do not
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.set_grant(%L, %L, 'health', 'summary', null)) ->> 'after' $$,
  current_setting('t.m2'), current_setting('t.s1'))), 'summary',
  'fixture: Priya''s health grant is lowered');

select is((
  select array[m.class, m.template, m.recipient_account_id::text,
               (select array_agg(k order by k)
                from jsonb_object_keys(m.payload) k)::text]
  from public.outbound_mail m where m.template = 'access_changed'),
  array['security', 'access_changed', current_setting('t.u2'),
        '{changed_by,circle_name}'],
  'the lower enqueued ONE security-class notice to the member''s ACCOUNT address with EXACTLY {circle_name, changed_by} — no domain, no level, no subject (§5.9)');

do $$
declare tok text;
begin
  tok := pg_temp.mint_raise(current_setting('t.u1')::uuid,
    current_setting('t.m2') || ':' || current_setting('t.s1') || ':health');
  perform set_config('t.tok', tok, true);
end $$;
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.set_grant(%L, %L, 'health', 'view', %L)) ->> 'after' $$,
  current_setting('t.m2'), current_setting('t.s1'), current_setting('t.tok'))),
  'view', 'fixture: the grant is raised back');

select is((select count(*)::int from public.outbound_mail), 1,
  'the RAISE enqueued nothing — widening is not a revocation, and the no-op path writes nothing either');

-- ----------------------------------------------------------------------------
-- 5–8 · Removal notifies the person whose access ended
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.remove_member(%L, null)) ->> 'account_id' $$,
  current_setting('t.m3'))), current_setting('t.u3'),
  'fixture: Dan is removed');

select is((
  select array[m.class, lower(m.recipient_email::text),
               m.payload ->> 'circle_name', m.payload ->> 'changed_by']
  from public.outbound_mail m where m.template = 'membership_removed'),
  array['security', current_setting('t.u3') || '@fixture.local',
        'Notice circle', 'Sarah'],
  'the removal notice: security class, the account address regardless of circle access, naming the circle and who changed it');

select is((
  select (select array_agg(k order by k) from jsonb_object_keys(m.payload) k)::text
  from public.outbound_mail m where m.template = 'membership_removed'),
  '{changed_by,circle_name}',
  'the removal payload is EXACTLY {circle_name, changed_by} — that is about them, not about the record');

select is((select count(*)::int from public.outbound_mail where sent_at is null), 2,
  'exactly two notices queued unsent across the whole scenario — delivery is slice 11''s worker');

select * from finish();
rollback;
