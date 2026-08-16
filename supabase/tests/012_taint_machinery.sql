-- ============================================================================
-- 1B · U5 — provenance & taint machinery (TSD §2.6): hc.link_provenance()
-- (the only edge writer: endpoint validation + cycle refusal + delta
-- growth), hc.propagate_taint_growth() (delta-only, UNION walk, depth 32,
-- marked-not-guessed at the limit, marked-and-committed on failure),
-- hc.reclassify_taint() (the ONLY shrinking path: manage-on-current-taint,
-- per-circle advisory lock, path-complete fixed point, row-scoped marker,
-- audience_changed), hc.sweep_provenance() (detector 3), plus the pure
-- hc.own_domain() / hc.taint_union().
--
-- Single-session behaviour here; growth-vs-shrink serialization and
-- failure atomicity across sessions are test:concurrency (U10).
--
-- RED (U5): none of the six functions exist — existence probes fail and
-- every behavioural probe reports 42883 where its outcome is demanded.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(45);

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

-- Fixtures. u1 = manage×5 member (reclassify caller identity), u2 = partial.
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; s1 uuid; s1b uuid; s2 uuid; m1 uuid; m2 uuid;
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid();
  d text;
  prev uuid; cur uuid;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Taint circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Far circle', u1)
    returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'tnt-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Frank', 'aging in place', '02138', 'America/New_York', 'clay',
          'tntb-' || substr(c1::text, 1, 8)) returning id into s1b;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'assisted living', '98101', 'America/Los_Angeles', 'moss',
          'tnt2-' || substr(c2::text, 1, 8)) returning id into s2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m2, s1, 'schedule', 'manage', u1);
  insert into public.arrivals (id, circle_id, subject_id, channel) values (a1, c1, s1, 'upload');
  insert into public.arrivals (id, circle_id, subject_id, channel) values (a2, c2, s2, 'upload');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s1b', s1b::text, true);
  perform set_config('t.a1', a1::text, true);

  -- record objects (as postgres; the write path is M6's)
  perform set_config('t.docA',   gen_random_uuid()::text, true);  -- medical {health}
  perform set_config('t.taskC',  gen_random_uuid()::text, true);  -- {schedule}
  perform set_config('t.tlD',    gen_random_uuid()::text, true);  -- care {health}
  perform set_config('t.docDia', gen_random_uuid()::text, true);  -- legal {documents}
  perform set_config('t.taskP',  gen_random_uuid()::text, true);
  perform set_config('t.taskQ',  gen_random_uuid()::text, true);
  perform set_config('t.tlDia',  gen_random_uuid()::text, true);
  perform set_config('t.docR',   gen_random_uuid()::text, true);  -- medical {health} → legal
  perform set_config('t.docR2',  gen_random_uuid()::text, true);  -- financial {finances}
  perform set_config('t.taskR',  gen_random_uuid()::text, true);  -- {schedule}
  perform set_config('t.docS1b', gen_random_uuid()::text, true);  -- other subject
  perform set_config('t.docX',   gen_random_uuid()::text, true);  -- other circle

  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values
    (current_setting('t.docA')::uuid,   c1, s1, 'Discharge', 'medical', a1, now(), u1, now(), 'Sarah', '{health}'),
    (current_setting('t.docDia')::uuid, c1, s1, 'Deed', 'legal', a1, now(), u1, now(), 'Sarah', '{documents}'),
    (current_setting('t.docR')::uuid,   c1, s1, 'Letter', 'medical', a1, now(), u1, now(), 'Sarah', '{health}'),
    (current_setting('t.docR2')::uuid,  c1, s1, 'Invoice', 'financial', a1, now(), u1, now(), 'Sarah', '{finances}'),
    (current_setting('t.docS1b')::uuid, c1, s1b, 'Frank''s form', 'legal', a1, now(), u1, now(), 'Sarah', '{documents}');
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values
    (current_setting('t.docX')::uuid, c2, s2, 'Far doc', 'legal', a2, now(), u1, now(), 'Sarah', '{documents}');
  insert into public.tasks (id, circle_id, subject_id, title,
    approved_by, approved_at, approver_display_name, taint)
  values
    (current_setting('t.taskC')::uuid, c1, s1, 'Follow up', u1, now(), 'Sarah', '{schedule}'),
    (current_setting('t.taskP')::uuid, c1, s1, 'P', u1, now(), 'Sarah', '{schedule}'),
    (current_setting('t.taskQ')::uuid, c1, s1, 'Q', u1, now(), 'Sarah', '{schedule}'),
    (current_setting('t.taskR')::uuid, c1, s1, 'R', u1, now(), 'Sarah', '{schedule}');
  insert into public.timeline_events (id, circle_id, subject_id, kind, summary,
    occurred_on, occurred_zone, approved_by, approved_at, approver_display_name, taint)
  values
    (current_setting('t.tlD')::uuid, c1, s1, 'care', 'Visit', '2026-08-01', 'America/New_York',
     u1, now(), 'Sarah', '{health}'),
    (current_setting('t.tlDia')::uuid, c1, s1, 'care', 'Dia', '2026-08-02', 'America/New_York',
     u1, now(), 'Sarah', '{health}');

  -- depth chain: 34 tasks, t(i+1) is the CHILD of t(i); root gets the delta
  prev := null;
  for i in 0..33 loop
    cur := gen_random_uuid();
    insert into public.tasks (id, circle_id, subject_id, title,
      approved_by, approved_at, approver_display_name, taint)
    values (cur, c1, s1, 'chain-' || i, u1, now(), 'Sarah', '{schedule}');
    if i = 0  then perform set_config('t.chain0',  cur::text, true); end if;
    if i = 31 then perform set_config('t.chain31', cur::text, true); end if;
    if i = 32 then perform set_config('t.chain32', cur::text, true); end if;
    if i = 33 then perform set_config('t.chain33', cur::text, true); end if;
    if prev is not null then
      insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
      values (c1, 'task', cur, 'task', prev);
    end if;
    prev := cur;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 1–6 · The machinery exists, with the pinned signatures.
-- ----------------------------------------------------------------------------
select ok(to_regprocedure('hc.taint_union(hc.domain[], hc.domain[])') is not null,
  'hc.taint_union(hc.domain[], hc.domain[]) exists');
select ok(to_regprocedure('hc.own_domain(hc.object_type, hc.doc_category, hc.timeline_kind, hc.domain)') is not null,
  'hc.own_domain(type, category, kind, declared) exists');
select ok(to_regprocedure('hc.link_provenance(hc.object_type, uuid, hc.object_type, uuid)') is not null,
  'hc.link_provenance(child, parent) exists');
select ok(to_regprocedure('hc.propagate_taint_growth(hc.object_type, uuid, hc.domain[])') is not null,
  'hc.propagate_taint_growth(node, delta) exists');
select ok(to_regprocedure('hc.reclassify_taint(hc.object_type, uuid)') is not null,
  'hc.reclassify_taint(object) exists');
select ok(to_regprocedure('hc.sweep_provenance()') is not null,
  'hc.sweep_provenance() exists');

-- ----------------------------------------------------------------------------
-- 7–10 · The pure pieces: the D3 mapping and the array union.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar($$
  select string_agg(hc.own_domain(t::hc.object_type, c::hc.doc_category,
                                  k::hc.timeline_kind, null)::text, ',')
  from (values
    ('document','medical',null), ('document','medications',null),
    ('document','labs',null), ('document','insurance',null),
    ('document','financial',null), ('document','legal',null),
    ('document','other',null),
    ('task',null,null),
    ('timeline_event',null,'medical'), ('timeline_event',null,'care'),
    ('timeline_event',null,'admin'), ('timeline_event',null,'memory'),
    ('episode',null,null)
  ) v(t, c, k) $$),
  'health,health,health,finances,finances,documents,documents,schedule,health,health,schedule,memories,memories',
  'own_domain: the ADR-0005 D3 mapping, row for row');

select is(pg_temp.scalar(
  $$ select hc.own_domain('profile_fact', null, null, 'finances')::text $$),
  'finances', 'own_domain: profile_fact carries its payload-declared domain');

select is(pg_temp.errcode_as('postgres',
  $$ select hc.own_domain('profile_fact', null, null, null) $$), 'P0001',
  'own_domain: an undeclared profile_fact domain is refused, never guessed');

select is(pg_temp.scalar(
  $$ select hc.taint_union('{schedule,health}', '{health,finances}')::text $$),
  '{health,schedule,finances}',
  'taint_union: sorted set union in enum order');

-- ----------------------------------------------------------------------------
-- 11–13 · Edge insert grows the child by the parent''s delta.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.link_provenance('task', %L, 'document', %L) $$,
  current_setting('t.taskC'), current_setting('t.docA'))), 'no_error',
  'a valid same-circle same-subject edge is accepted');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.provenance_edges
     where child_type = 'task' and child_id = %L
       and parent_type = 'document' and parent_id = %L $$,
  current_setting('t.taskC'), current_setting('t.docA'))), '1',
  'the edge row exists');

select is(pg_temp.scalar(format(
  $$ select (taint @> '{health,schedule}'::hc.domain[])::text
     from public.tasks where id = %L $$,
  current_setting('t.taskC'))), 'true',
  'the child gained the parent''s domains at link time (delta, no walk)');

-- ----------------------------------------------------------------------------
-- 14–17 · Growth propagates to the GRANDCHILD — the §3.13 case that would
-- have shipped stale under a recompute-from-parents design.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.link_provenance('timeline_event', %L, 'task', %L) $$,
  current_setting('t.tlD'), current_setting('t.taskC'))), 'no_error',
  'the grandchild chain document → task → event is linked');

select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.propagate_taint_growth('document', %L, '{finances}') $$,
  current_setting('t.docA'))), 'no_error',
  'the root gains finances (re-categorisation into a wider domain)');

select is(pg_temp.scalar(format(
  $$ select (taint @> '{finances}'::hc.domain[])::text
     from public.documents where id = %L $$,
  current_setting('t.docA'))), 'true',
  'the delta applies at the start node itself');

select is(pg_temp.scalar(format(
  $$ select (taint @> '{finances}'::hc.domain[])::text
     from public.timeline_events where id = %L $$,
  current_setting('t.tlD'))), 'true',
  'the GRANDCHILD carries the delta — depth is no shelter');

-- ----------------------------------------------------------------------------
-- 18–20 · Diamond DAG: UNION, not UNION ALL — one visit, correct result.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format($$
  do $x$ begin
    perform hc.link_provenance('task', %L, 'document', %L);
    perform hc.link_provenance('task', %L, 'document', %L);
    perform hc.link_provenance('timeline_event', %L, 'task', %L);
    perform hc.link_provenance('timeline_event', %L, 'task', %L);
  end $x$;
  $$,
  current_setting('t.taskP'), current_setting('t.docDia'),
  current_setting('t.taskQ'), current_setting('t.docDia'),
  current_setting('t.tlDia'), current_setting('t.taskP'),
  current_setting('t.tlDia'), current_setting('t.taskQ'))), 'no_error',
  'diamond: both shoulders and both paths to the sink are linked');

select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.propagate_taint_growth('document', %L, '{memories}') $$,
  current_setting('t.docDia'))), 'no_error',
  'diamond: propagation over converging paths completes (UNION — no re-walk)');

select is(pg_temp.scalar(format(
  $$ select (taint @> '{memories}'::hc.domain[])::text
     from public.timeline_events where id = %L $$,
  current_setting('t.tlDia'))), 'true',
  'diamond: the sink carries the delta exactly once — union is idempotent under two paths');

-- ----------------------------------------------------------------------------
-- 21–25 · Refusals at edge insert: cycles, missing, cross-circle,
-- cross-subject, unsupported endpoint types.
-- ----------------------------------------------------------------------------
select throws_ok(format(
  $$ select hc.link_provenance('document', %L, 'timeline_event', %L) $$,
  current_setting('t.docA'), current_setting('t.tlD')),
  'P0001', 'provenance_cycle',
  'the proposed parent is already a descendant of the child — refused BEFORE the write');

select throws_ok(format(
  $$ select hc.link_provenance('task', %L, 'document', %L) $$,
  current_setting('t.taskC'), gen_random_uuid()),
  'P0001', 'provenance_endpoint_invalid',
  'a missing endpoint is refused');

select throws_ok(format(
  $$ select hc.link_provenance('task', %L, 'document', %L) $$,
  current_setting('t.taskC'), current_setting('t.docX')),
  'P0001', 'provenance_endpoint_invalid',
  'a cross-circle edge is refused, not tolerated — same shape as missing (no oracle)');

select throws_ok(format(
  $$ select hc.link_provenance('task', %L, 'document', %L) $$,
  current_setting('t.taskC'), current_setting('t.docS1b')),
  'P0001', 'provenance_endpoint_invalid',
  'a cross-subject edge is refused — same shape again');

select throws_ok(format(
  $$ select hc.link_provenance('task', %L, 'arrival', %L) $$,
  current_setting('t.taskC'), current_setting('t.a1')),
  'P0001', 'provenance_endpoint_unsupported',
  'non-record endpoint types are staged to 1C — refused, never half-linked');

-- ----------------------------------------------------------------------------
-- 26–29 · The depth limit: applied where reachable, MARKED where not.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.propagate_taint_growth('task', %L, '{finances}') $$,
  current_setting('t.chain0'))), 'no_error',
  'a 34-deep chain does not error — the walk stops at its cap');

select is(pg_temp.scalar(format(
  $$ select (taint @> '{finances}'::hc.domain[])::text from public.tasks where id = %L $$,
  current_setting('t.chain31'))), 'true',
  'depth 31: inside the cap, the delta applied');

select is(pg_temp.scalar(format(
  $$ select taint_resolved::text from public.tasks where id = %L $$,
  current_setting('t.chain32'))), 'false',
  'depth 32: still reachable AT the limit ⇒ taint_resolved = false — never a guess (AC-PERM-9)');

select is(pg_temp.scalar(format(
  $$ select (taint @> '{finances}'::hc.domain[])::text from public.tasks where id = %L $$,
  current_setting('t.chain33'))), 'false',
  'depth 33: beyond the frontier nothing is silently widened');

-- ----------------------------------------------------------------------------
-- 30–32 · Write-path failure ⇒ marked and committed, not aborted (§2.6
-- mechanism 1). Deterministic injection: a trigger that detonates on one
-- row mid-walk.
-- ----------------------------------------------------------------------------
create function pg_temp.boom() returns trigger language plpgsql as $$
begin
  if new.id = current_setting('t.taskC')::uuid then
    raise exception 'injected walk failure';
  end if;
  return new;
end $$;
create trigger zz_boom before update on public.tasks
  for each row execute function pg_temp.boom();

select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.propagate_taint_growth('document', %L, '{memories}') $$,
  current_setting('t.docA'))), 'no_error',
  'a failure inside the walk does NOT abort the caller — aborting would leave the OLD, permissive taint');

select is(pg_temp.scalar(format(
  $$ select taint_resolved::text from public.documents where id = %L $$,
  current_setting('t.docA'))), 'false',
  'the affected root is marked taint_resolved = false — fail closed by §3.3 clause 3');

drop trigger zz_boom on public.tasks;

select is(pg_temp.scalar(format(
  $$ select (not exists (select 1 from public.tasks
                         where id = %L and taint @> '{memories}'::hc.domain[])
         and not exists (select 1 from public.timeline_events
                         where id = %L and taint @> '{memories}'::hc.domain[]))::text $$,
  current_setting('t.taskC'), current_setting('t.tlD'))), 'true',
  'failure atomicity: the walk''s partial updates rolled back to the savepoint — no row keeps a half-applied delta');

-- ----------------------------------------------------------------------------
-- 33–39 · Reclassification: the only shrinking path. Path-complete, so a
-- domain held via a SECOND path survives the shrink of the first.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format($$
  do $x$ begin
    perform hc.link_provenance('task', %L, 'document', %L);
    perform hc.link_provenance('task', %L, 'document', %L);
  end $x$;
  $$,
  current_setting('t.taskR'), current_setting('t.docR'),
  current_setting('t.taskR'), current_setting('t.docR2'))), 'no_error',
  'reclassify fixture: taskR draws from BOTH docR (health) and docR2 (finances)');

select is(pg_temp.errcode_as('postgres', format(
  $$ update public.documents set category = 'legal', taint_resolved = false where id = %L $$,
  current_setting('t.docR'))), 'no_error',
  'the category moves Medical → Legal (driver column; taint untouched, resolved marked pending)');

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u1'), 'role', 'authenticated')::text, true);
select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.reclassify_taint('document', %L) $$,
  current_setting('t.docR'))), 'no_error',
  'a manage-on-current-taint caller may reclassify');

select is(pg_temp.scalar(format(
  $$ select taint::text from public.documents where id = %L $$,
  current_setting('t.docR'))), '{documents}',
  'the reclassified root recomputes to exactly its new own domain');

select is(pg_temp.scalar(format(
  $$ select taint::text from public.tasks where id = %L $$,
  current_setting('t.taskR'))), '{schedule,documents,finances}',
  'path-complete: health is gone with its only path; finances SURVIVES via the second path');

select is(pg_temp.scalar(format(
  $$ select taint_resolved::text from public.documents where id = %L $$,
  current_setting('t.docR'))), 'true',
  'a completed recomputation restores taint_resolved = true — the one legitimate false→true');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type = 'audience_changed' $$,
  current_setting('t.c1'))), '1',
  'the reclassification names both audiences in the access log (AC-DOC-6)');

-- ----------------------------------------------------------------------------
-- 40–41 · Reclassify refusals: insufficient manage, nonexistent object —
-- ONE shape (DEF-10).
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u2'), 'role', 'authenticated')::text, true);
select throws_ok(format(
  $$ select hc.reclassify_taint('task', %L) $$,
  current_setting('t.taskR')),
  'P0001', 'reclassify_refused',
  'manage on every domain in the CURRENT taint, or nothing');

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('t.u1'), 'role', 'authenticated')::text, true);
select throws_ok(format(
  $$ select hc.reclassify_taint('document', %L) $$,
  gen_random_uuid()),
  'P0001', 'reclassify_refused',
  'a nonexistent object refuses with the SAME shape — no existence oracle');

-- ----------------------------------------------------------------------------
-- 42 · profile_facts carries its declared domain (D3 materialised) so
-- recomputation can read own_domain from the row.
-- ----------------------------------------------------------------------------
select has_column('public', 'profile_facts', 'domain',
  'profile_facts.domain: the payload-declared own domain, stored (ADR-0005 D3)');

-- ----------------------------------------------------------------------------
-- 43–45 · The sweep: dangling and cross-circle edges are found and marked.
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format($$
  insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
  values (%L, 'task', %L, 'document', %L),
         (%L, 'task', %L, 'document', %L) $$,
  current_setting('t.c1'), current_setting('t.taskP'), gen_random_uuid(),
  current_setting('t.c1'), current_setting('t.taskQ'), current_setting('t.docX'))),
  'no_error',
  'sweep fixture: a dangling parent and a cross-circle parent, inserted past the front door');

select is(pg_temp.scalar(
  $$ select (hc.sweep_provenance() >= 2)::text $$), 'true',
  'the sweep finds both defects — the paths we did not think of');

select is(pg_temp.scalar(format(
  $$ select (bool_and(not taint_resolved))::text from public.tasks
     where id in (%L, %L) $$,
  current_setting('t.taskP'), current_setting('t.taskQ'))), 'true',
  'both affected children are marked taint_resolved = false');

select * from finish();
rollback;
