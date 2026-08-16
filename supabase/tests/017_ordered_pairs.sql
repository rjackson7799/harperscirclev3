-- ============================================================================
-- 1B · U11 — RLS-07: the Appendix A.3 ordered-pair matrix (AC-PERM-8, G8).
-- Twenty cases GENERATED from one rule:
--
--   For each ordered pair (from, to) of distinct domains: construct an
--   object whose own domain is `to` and whose provenance graph reaches a
--   source in `from`; grant the member manage on `to` and hidden on
--   `from`; assert the object is absent from EVERY channel.
--
-- Channels in 1B: direct select (which is also every count — counts are
-- post-filter by construction) and hc.presence(). Search, the send-time
-- notification check and export are 1D/2+ machinery — pending rows in
-- docs/coverage.md, staged with their surfaces.
--
-- The constructor map is ADR-0005 D3 as data: memories → timeline_event
-- (memory) · health → timeline_event (medical) · schedule → task ·
-- documents → document (legal) · finances → document (financial). The
-- edge goes through hc.link_provenance(), so the child's taint is the
-- machinery's computation, not the fixture's claim. A sixth domain would
-- enter hc.all_domains(), fail INV-04 first, and then add its ten pairs
-- HERE without anyone remembering to.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(5);

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

-- One constructor, driven by the D3 map: returns (type, id) of a fresh
-- object whose OWN domain is p_domain, on (c1, s1), approved by u1.
create function pg_temp.make_obj(p_domain hc.domain, p_c uuid, p_s uuid,
                                 p_u uuid, p_a uuid)
returns table (otype hc.object_type, oid uuid) language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  if p_domain = 'schedule' then
    insert into public.tasks (id, circle_id, subject_id, title,
      approved_by, approved_at, approver_display_name, taint)
    values (v, p_c, p_s, 'pair task', p_u, now(), 'Sarah', array[p_domain]);
    return query select 'task'::hc.object_type, v;
  elsif p_domain in ('memories', 'health') then
    insert into public.timeline_events (id, circle_id, subject_id, kind, summary,
      occurred_on, occurred_zone, approved_by, approved_at, approver_display_name, taint)
    values (v, p_c, p_s,
            case p_domain when 'memories' then 'memory'::hc.timeline_kind else 'medical' end,
            'pair event', '2026-08-01', 'America/New_York',
            p_u, now(), 'Sarah', array[p_domain]);
    return query select 'timeline_event'::hc.object_type, v;
  else
    insert into public.documents (id, circle_id, subject_id, title, category,
      artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
    values (v, p_c, p_s, 'pair document',
            case p_domain when 'finances' then 'financial'::hc.doc_category else 'legal' end,
            p_a, now(), p_u, now(), 'Sarah', array[p_domain]);
    return query select 'document'::hc.object_type, v;
  end if;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m1 uuid; m2 uuid;
  a1 uuid := gen_random_uuid();
  v_from hc.domain; v_to hc.domain; d hc.domain;
  parent record; child record;
  v_sel int; v_pres int;
  v_tbl text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Pairs circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'pair-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (a1, c1, s1, 'upload');

  create temp table pair_results (
    from_d hc.domain, to_d hc.domain, child_type hc.object_type, child_id uuid,
    sel int, pres int) on commit drop;

  for v_from in select unnest(hc.all_domains()) loop
    for v_to in select unnest(hc.all_domains()) loop
      continue when v_from = v_to;

      -- construct: parent in `from`, child in `to`, edge via the machinery
      select * into parent from pg_temp.make_obj(v_from, c1, s1, u1, a1);
      select * into child  from pg_temp.make_obj(v_to,   c1, s1, u1, a1);
      perform hc.link_provenance(child.otype, child.oid, parent.otype, parent.oid);

      -- grants: manage on `to` (and the three bystander domains), NOTHING
      -- on `from` — the withheld source domain is the only obstacle
      delete from public.access_grants where member_id = m2;
      for d in select unnest(hc.all_domains()) loop
        if d <> v_from then
          insert into public.access_grants
            (circle_id, member_id, subject_id, domain, level, granted_by)
          values (c1, m2, s1, d, 'manage', u1);
        end if;
      end loop;

      -- the read, as the member (bare reads + granted functions only while
      -- the role is switched — PLT-04 discipline)
      perform set_config('request.jwt.claims',
        json_build_object('sub', u2, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      v_tbl := case child.otype when 'task' then 'tasks'
                    when 'timeline_event' then 'timeline_events'
                    else 'documents' end;
      execute format('select count(*) from public.%I where id = %L', v_tbl, child.oid)
        into v_sel;
      select count(*) into v_pres from hc.presence(s1) p
        where p.object_type = child.otype and p.id = child.oid;
      execute 'reset role';

      insert into pair_results values (v_from, v_to, child.otype, child.oid, v_sel, v_pres);
    end loop;
  end loop;

  perform set_config('t.u2', u2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.m2', m2::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.u1', u1::text, true);
end $$;

-- 1 · Twenty ordered pairs were generated — from ONE rule, no hand list.
select is((select count(*)::int from pair_results), 20,
  'the matrix is 5×4 ordered pairs, generated (a sixth domain adds its ten automatically)');

-- 2 · Direct select (and therefore every count): zero rows, all twenty.
select is((
  select coalesce(string_agg(from_d || '→' || to_d, ', ' order by from_d, to_d), 'all hidden')
  from pair_results where sel <> 0), 'all hidden',
  'A.3: manage on `to`, hidden on `from` ⇒ the derived object is ABSENT from direct select, all twenty pairs');

-- 3 · hc.presence(): absent there too — log level never crosses a
--     withheld source domain (AC-PERM-7 at the matrix).
select is((
  select coalesce(string_agg(from_d || '→' || to_d, ', ' order by from_d, to_d), 'all hidden')
  from pair_results where pres <> 0), 'all hidden',
  'A.3: the same twenty are absent from hc.presence()');

-- 4–5 · The positive control: restore manage on ALL five and the last
--       pair's child appears in both channels — the zeros above are the
--       taint arithmetic, not a broken fixture.
do $$
declare d hc.domain;
begin
  delete from public.access_grants where member_id = current_setting('t.m2')::uuid;
  for d in select unnest(hc.all_domains()) loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (current_setting('t.c1')::uuid, current_setting('t.m2')::uuid,
            current_setting('t.s1')::uuid, d, 'manage', current_setting('t.u1')::uuid);
  end loop;
end $$;

create function pg_temp.read_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

select is(pg_temp.read_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from public.%I where id = %L $$,
  (select case child_type when 'task' then 'tasks'
               when 'timeline_event' then 'timeline_events'
               else 'documents' end
   from pair_results order by from_d desc, to_d desc limit 1),
  (select child_id from pair_results order by from_d desc, to_d desc limit 1))), '1',
  'control: with manage on all five, the same object IS visible — the matrix zeros are the taint');

select is(pg_temp.read_as(current_setting('t.u2')::uuid, format(
  $$ select count(*)::text from hc.presence(%L) p where p.id = %L $$,
  current_setting('t.s1'),
  (select child_id from pair_results order by from_d desc, to_d desc limit 1))), '1',
  'control: and present in hc.presence() too');

select * from finish();
rollback;
