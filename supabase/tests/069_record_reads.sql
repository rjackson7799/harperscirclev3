-- ============================================================================
-- 7A · M4 — record reads: hc.circle_people · hc.document_references ·
-- hc.shares_for · hc.shares_for_member (PRD §4.3.4, §4.3.5, §4.6.1, §4.6.2,
-- §7.5; AC-PPL-2/3; TSD §3.5's counted-never-named discipline, 063's shape).
-- Pinned here BEFORE the migration exists.
--
-- THE CONTRACT THESE CASES PIN.
--   · provenance_edges, object_shares and other members' access_grants keep
--     their hc_internal-only / own-rows-only policies. The READ is the
--     function, and each function filters per row through hc.visible_at.
--   · circle_people(circle): every live member AND every subject-member row
--     of ONE circle (a person may belong to several; the app names the
--     circle it is on), subjects as people "with no account attached and
--     their custodian named beside them", tier, declared slice, and levels
--     per subject per domain — every domain explicit, `hidden` spelled out,
--     so the ONE phrase module at 7B renders from a complete fact. Levels of
--     OTHER members are a coordinator's read; a family member gets the same
--     people, her own levels, and the subjects' standing, and null for the
--     rest. Pending and expired invites for coordinators only. A removed
--     member is absent. A frozen circle returns the people and NO levels.
--     A non-member and a nonexistent circle are ONE shape.
--   · document_references(document): every record object whose provenance
--     graph reaches the document, each at the CALLER's own level of the
--     destination — counted, never named (063): object_type survives,
--     object_id and label do not, `visible` explicit. Driven both ways.
--     Gated on seeing the document itself; nonexistent and hidden are one
--     shape.
--   · shares_for(type, id): live shares on an object, for a caller holding
--     manage on it — the control surface of "who it has been shared with";
--     an object the caller cannot manage, and one that does not exist,
--     return NOTHING (zero rows, never an empty shape, never an error — no
--     existence oracle). A revoked share is absent.
--   · shares_for_member(member): live shares a person holds, for a live
--     coordinator of the circle or the person herself, each object at the
--     CALLER's level — counted, never named; anyone else gets zero rows.
--   · The AI role holds no EXECUTE on any of the four — catalog-based.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(28);

-- ----------------------------------------------------------------------------
-- Helpers (the 038/063 pattern).
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

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  execute p_sql into v;
  return v;
exception when others then
  get stacked diagnostics m := message_text;
  return 'ERROR:' || sqlstate || ':' || m;
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

-- ----------------------------------------------------------------------------
-- Fixtures: circle c1 · subjects s1 (Nell, custodian Sarah) and s2 (Marcus,
-- custodian Kim), both with their subject-member rows at manage×5.
--   Sarah    coordinator, manage×5 on both
--   Kim      coordinator, manage on four of Nell's domains and VIEW on
--            memories — a coordinator who is NOT manage×5, so rung 3 hides
--            an unresolved object from her
--   Dan      family — health manage, schedule summary
--   Priya    family — health summary (sees the discharge summary, not what
--            was drafted from it)
--   Ruth     family — documents summary, schedule summary; a share on d_med
--   Marisol  care_circle — schedule summary; shares on d_med and t1
--   Omar     REMOVED (removed_at set)
-- Invites: aunt@ pending · cousin@ EXPIRED · one accepted · one revoked.
-- Documents: d_med (medical, {health}) · d_unres (medical, UNRESOLVED).
-- Drafted from d_med: t1 (task, {schedule,health}) · e1 (timeline_event,
-- {health}) · pf1 (profile_fact, {health}, reads at VIEW).
-- Shares: sh_mar_doc (Sarah → Marisol, d_med) · sh_mar_task (Sarah →
-- Marisol, t1) · sh_ruth (Kim → Ruth, d_med) · sh_kim_unres (Sarah → Kim,
-- d_unres).
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
do $fx$
declare
  u_sarah uuid := pg_temp.mk_user(gen_random_uuid());
  u_kim   uuid := pg_temp.mk_user(gen_random_uuid());
  u_dan   uuid := pg_temp.mk_user(gen_random_uuid());
  u_priya uuid := pg_temp.mk_user(gen_random_uuid());
  u_ruth  uuid := pg_temp.mk_user(gen_random_uuid());
  u_mar   uuid := pg_temp.mk_user(gen_random_uuid());
  u_omar  uuid := pg_temp.mk_user(gen_random_uuid());
  u_acc   uuid := pg_temp.mk_user(gen_random_uuid());
  u_tom   uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; s1 uuid; s2 uuid;
  m_sarah uuid; m_kim uuid; m_dan uuid; m_priya uuid; m_ruth uuid; m_mar uuid;
  m_omar uuid; m_tom uuid; ms1 uuid; ms2 uuid;
  a1 uuid := gen_random_uuid();
  d_med uuid := gen_random_uuid(); d_unres uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid(); e1 uuid := gen_random_uuid(); pf1 uuid := gen_random_uuid();
  sh_mar_doc uuid; sh_mar_task uuid; sh_ruth uuid; sh_kim_unres uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name, slice) values
    (u_sarah, 'member', 'Sarah', 'the paperwork'), (u_kim, 'member', 'Kim', null),
    (u_dan, 'member', 'Dan', 'appointments'), (u_priya, 'member', 'Priya', null),
    (u_ruth, 'member', 'Ruth', null), (u_mar, 'member', 'Marisol', 'weekday mornings'),
    (u_omar, 'member', 'Omar', null), (u_acc, 'member', 'Accepted', null),
    (u_tom, 'member', 'Tom', null);
  insert into public.circles (name, created_by) values ('Nell''s circle', u_sarah)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Another circle', u_omar)
    returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'rr1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Marcus', 'independent', '02138', 'America/New_York', 'clay',
          'rr2-' || substr(c1::text, 1, 8)) returning id into s2;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_sarah, 'coordinator', 'Sarah') returning id into m_sarah;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_kim, 'coordinator', 'Kim') returning id into m_kim;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_dan, 'family', 'Dan') returning id into m_dan;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_priya, 'family', 'Priya') returning id into m_priya;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_ruth, 'family', 'Ruth') returning id into m_ruth;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_mar, 'care_circle', 'Marisol') returning id into m_mar;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join,
                                     removed_at, removed_by)
  values (c1, u_omar, 'family', 'Omar', now(), u_sarah) returning id into m_omar;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_tom, 'family', 'Tom') returning id into m_tom;
  insert into public.circle_members (circle_id, subject_id, custodian_member_id,
                                     tier, display_name_at_join)
  values (c1, s1, m_sarah, 'coordinator', 'Nell') returning id into ms1;
  insert into public.circle_members (circle_id, subject_id, custodian_member_id,
                                     tier, display_name_at_join)
  values (c1, s2, m_kim, 'coordinator', 'Marcus') returning id into ms2;

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_sarah, s1, d::hc.domain, 'manage', u_sarah),
           (c1, m_sarah, s2, d::hc.domain, 'manage', u_sarah),
           (c1, m_kim,   s2, d::hc.domain, 'manage', u_sarah),
           (c1, ms1,     s1, d::hc.domain, 'manage', u_sarah),
           (c1, ms2,     s2, d::hc.domain, 'manage', u_sarah);
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_kim, s1, d::hc.domain,
            case when d = 'memories' then 'view' else 'manage' end::hc.access_level, u_sarah);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_dan,   s1, 'health',    'manage',  u_sarah),
         (c1, m_dan,   s1, 'schedule',  'summary', u_sarah),
         (c1, m_priya, s1, 'health',    'summary', u_sarah),
         (c1, m_ruth,  s1, 'documents', 'summary', u_sarah),
         (c1, m_ruth,  s1, 'schedule',  'summary', u_sarah),
         (c1, m_mar,   s1, 'schedule',  'summary', u_sarah),
         (c1, m_tom,   s1, 'schedule',  'summary', u_sarah);

  insert into public.invites (circle_id, token_hash, invited_email, tier, subject_ids,
                              invited_by, created_at, expires_at, accepted_at, accepted_by, revoked_at)
  values
    (c1, extensions.digest('t-pending', 'sha256'), 'aunt@example.org', 'family', array[s1],
     u_sarah, now(), now() + interval '7 days', null, null, null),
    (c1, extensions.digest('t-expired', 'sha256'), 'cousin@example.org', 'family', array[s1],
     u_sarah, now() - interval '10 days', now() - interval '3 days', null, null, null),
    (c1, extensions.digest('t-accepted', 'sha256'), 'accepted@example.org', 'family', array[s1],
     u_sarah, now() - interval '2 days', now() + interval '5 days', now() - interval '1 day', u_acc, null),
    (c1, extensions.digest('t-revoked', 'sha256'), 'revoked@example.org', 'family', array[s1],
     u_sarah, now(), now() + interval '7 days', null, null, now());

  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (a1, c1, s1, 'upload');
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name,
    taint, taint_resolved)
  values (d_med,   c1, s1, 'Discharge summary · Jul 12', 'medical', a1, now(),
          u_sarah, now(), 'Sarah', '{health}', true),
         (d_unres, c1, s1, 'A lab result with a broken lineage', 'labs', a1, now(),
          u_sarah, now(), 'Sarah', '{health}', false);

  insert into public.tasks (id, circle_id, subject_id, title, status,
    approved_by, approved_at, approver_display_name, taint)
  values (t1, c1, s1, 'Book the follow-up', 'open', u_sarah, now(), 'Sarah', '{schedule,health}');
  insert into public.timeline_events (id, circle_id, subject_id, kind, summary, occurred_on,
    approved_by, approved_at, approver_display_name, taint)
  values (e1, c1, s1, 'medical', 'Discharged home', '2026-07-12',
          u_sarah, now(), 'Sarah', '{health}');
  insert into public.profile_facts (id, circle_id, subject_id, field, value, risk_class, domain,
    approved_by, approved_at, approver_display_name, taint)
  values (pf1, c1, s1, 'blood_type', '"O+"'::jsonb, 'standard', 'health',
          u_sarah, now(), 'Sarah', '{health}');
  insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
  values (c1, 'task', t1, 'document', d_med),
         (c1, 'timeline_event', e1, 'document', d_med),
         (c1, 'profile_fact', pf1, 'document', d_med);

  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', d_med, m_mar, u_sarah) returning id into sh_mar_doc;
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'task', t1, m_mar, u_sarah) returning id into sh_mar_task;
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', d_med, m_ruth, u_kim) returning id into sh_ruth;
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', d_unres, m_kim, u_sarah) returning id into sh_kim_unres;

  perform set_config('t.u_sarah', u_sarah::text, true);
  perform set_config('t.u_kim', u_kim::text, true);
  perform set_config('t.u_dan', u_dan::text, true);
  perform set_config('t.u_priya', u_priya::text, true);
  perform set_config('t.u_ruth', u_ruth::text, true);
  perform set_config('t.u_mar', u_mar::text, true);
  perform set_config('t.u_omar', u_omar::text, true);
  perform set_config('t.u_tom', u_tom::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s2', s2::text, true);
  perform set_config('t.m_dan', m_dan::text, true);
  perform set_config('t.m_ruth', m_ruth::text, true);
  perform set_config('t.m_mar', m_mar::text, true);
  perform set_config('t.m_kim', m_kim::text, true);
  perform set_config('t.ms1', ms1::text, true);
  perform set_config('t.d_med', d_med::text, true);
  perform set_config('t.d_unres', d_unres::text, true);
  perform set_config('t.t1', t1::text, true);
  perform set_config('t.sh_ruth', sh_ruth::text, true);
end $fx$;
set session_replication_role = default;

-- ----------------------------------------------------------------------------
-- 1–6 · Shape, privilege closure (catalog-based), the AI role.
-- ----------------------------------------------------------------------------
select has_function('hc', 'circle_people', array['uuid'],
  'hc.circle_people(circle) exists');
select has_function('hc', 'document_references', array['uuid'],
  'hc.document_references(document) exists');
select has_function('hc', 'shares_for', array['hc.object_type', 'uuid'],
  'hc.shares_for(object_type, object_id) exists');
select has_function('hc', 'shares_for_member', array['uuid'],
  'hc.shares_for_member(member) exists');

select ok(
  (select count(*) = 4 and bool_and(
        pg_get_userbyid(p.proowner) = 'hc_internal'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('hc_admin', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc'
      and p.proname in ('circle_people', 'document_references', 'shares_for', 'shares_for_member')),
  'all four are definer READS owned by hc_internal, executable by authenticated and by no other request-path role — the tables they read keep their hc_internal-only policies');

select ok(
  (select count(*) = 4 and bool_and(not has_function_privilege('hc_pipeline', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc'
      and p.proname in ('circle_people', 'document_references', 'shares_for', 'shares_for_member')),
  'the AI role holds no EXECUTE on any of the four');

-- ----------------------------------------------------------------------------
-- 7–10 · THE PEOPLE LIST for a coordinator: subjects as people, custodians
--        named, tiers and slices, levels per subject per domain, hidden
--        spelled out; the removed member absent.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(p.kind || ':' || p.display_name, ',' order by p.ord)
       from (select row_number() over () as ord, kind, display_name
               from hc.circle_people(%L)) p $$,
  current_setting('t.c1'))),
  'subject:Marcus,subject:Nell,member:Dan,member:Kim,member:Marisol,member:Priya,member:Ruth,member:Sarah,member:Tom,invite:aunt@example.org,invite:cousin@example.org',
  'every person in the circle: the two subjects first, as people; then the seven live members; then the two open invites — and Omar, removed, is not a person in this circle any more');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select p.is_subject::text || '/' || coalesce(p.account_id::text, 'NULL') || '/' || p.custodian_name
            || '/' || p.tier::text || '/' || (p.levels -> %L ->> 'finances')
       from hc.circle_people(%L) p where p.display_name = 'Nell' $$,
  current_setting('t.s1'), current_setting('t.c1'))),
  'true/NULL/Sarah/coordinator/manage',
  'AC-PPL-3: Nell is a person in the circle holding the highest access to her own record, with no account attached and her custodian named beside her (§7.5) — this is the model, not a placeholder');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (p.levels -> %L ->> 'health') || '/' || (p.levels -> %L ->> 'schedule') || '/'
            || (p.levels -> %L ->> 'finances') || '/' || coalesce(p.slice, 'NULL')
            || '/' || (select count(*)::text from jsonb_object_keys(p.levels -> %L))
       from hc.circle_people(%L) p where p.display_name = 'Dan' $$,
  current_setting('t.s1'), current_setting('t.s1'), current_setting('t.s1'),
  current_setting('t.s1'), current_setting('t.c1'))),
  'manage/summary/hidden/appointments/5',
  'AC-PPL-2''s fact: a coordinator reads what Dan can see per subject per domain — every one of the five domains explicit, hidden SPELLED OUT, so the ONE phrase module renders "Nell: …" from a complete fact and never infers a gap; his declared slice beside it');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select p.tier::text || '/' || (p.levels -> %L ->> 'schedule') || '/' || (p.levels -> %L ->> 'health')
            || '/' || coalesce(p.levels -> %L ->> 'schedule', 'NULL')
       from hc.circle_people(%L) p where p.display_name = 'Marisol' $$,
  current_setting('t.s1'), current_setting('t.s1'), current_setting('t.s2'),
  current_setting('t.c1'))),
  'care_circle/summary/hidden/hidden',
  'the caregiver: schedule summary on Nell, everything else hidden — and hidden on Marcus, whom she was never scoped for: the People list says so rather than omitting the subject');

-- ----------------------------------------------------------------------------
-- 11–13 · A family member: the same PEOPLE, her own levels and the subjects'
--         standing, null for everyone else; no invites.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select string_agg(p.kind || ':' || p.display_name, ',' order by p.ord)
       from (select row_number() over () as ord, kind, display_name
               from hc.circle_people(%L)) p $$,
  current_setting('t.c1'))),
  'subject:Marcus,subject:Nell,member:Dan,member:Kim,member:Marisol,member:Priya,member:Ruth,member:Sarah,member:Tom',
  'a family member gets the same people — existence of members is circle-level (circle_members_select already says so) — and NO invites');

select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select coalesce((select p.levels -> %L ->> 'documents' from hc.circle_people(%L) p where p.display_name = 'Ruth'), 'NULL')
            || '/' ||
            coalesce((select p.levels::text from hc.circle_people(%L) p where p.display_name = 'Dan'), 'NULL')
            || '/' ||
            coalesce((select p.levels -> %L ->> 'health' from hc.circle_people(%L) p where p.display_name = 'Nell'), 'NULL') $$,
  current_setting('t.s1'), current_setting('t.c1'), current_setting('t.c1'),
  current_setting('t.s1'), current_setting('t.c1'))),
  'summary/NULL/manage',
  'her OWN levels are hers to read (access_grants_select_own says the same), the subject''s standing is public, and Dan''s levels are NOT hers — null, not hidden, so the app cannot mistake "not yours to know" for "he has none"');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(p.display_name || ':' || p.invite_status || ':' || (p.invite_expires_at > now())::text, ',' order by p.display_name)
       from hc.circle_people(%L) p where p.kind = 'invite' $$,
  current_setting('t.c1'))),
  'aunt@example.org:pending:true,cousin@example.org:expired:false',
  '§4.6.2 / §8.5: "Invited · expires Friday" and "Invite expired · send again" — pending and expired, for a coordinator; the accepted and the revoked invites are not people');

-- ----------------------------------------------------------------------------
-- 14–16 · One shape for a non-member and a nonexistent circle; a frozen
--         circle returns the people and NO levels; the freeze dismissed.
-- ----------------------------------------------------------------------------
select is(
  pg_temp.call_as(current_setting('t.u_omar')::uuid, format(
    $$ select count(*)::text from hc.circle_people(%L) $$, current_setting('t.c1')))
  || '|' ||
  pg_temp.call_as(current_setting('t.u_sarah')::uuid,
    $$ select count(*)::text from hc.circle_people(gen_random_uuid()) $$),
  'ERROR:P0001:people_refused|ERROR:P0001:people_refused',
  'a removed member and a nonexistent circle land in the same one shape (DEF-10) — the People list is no existence oracle');

do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select count(*)::text || '/' || count(*) filter (where p.levels is null)::text
       from hc.circle_people(%L) p where p.kind <> 'invite' $$,
  current_setting('t.c1'))),
  '9/9',
  'a FROZEN circle: the people are still people (the family can see who is in the circle) and nobody has a level — a freeze suspends all interactive access, and the list does not pretend otherwise');
select is(pg_temp.scalar(
  $$ select (hc.adjudicate_freeze(
       (select f.id from public.freezes f
        where f.circle_id = current_setting('t.c1')::uuid and f.state = 'open'),
       'dismissed', 'Test adjudicator')) ->> 'outcome' $$), 'dismissed',
  'fixture: the freeze is dismissed');

-- ----------------------------------------------------------------------------
-- 17–20 · DOCUMENT REFERENCES: everything in the record that references it,
--         counted-never-named at the caller's own level, driven both ways.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(r.object_type::text || ':' || coalesce(r.label, 'NULL') || ':' || r.visible::text
                       || ':' || (r.object_id is not null)::text, ',' order by r.object_type)
       from hc.document_references(%L) r $$,
  current_setting('t.d_med'))),
  'task:Book the follow-up:true:true,timeline_event:Discharged home:true:true,profile_fact:blood_type:true:true',
  '§4.3.4 "everything else in the record that references it": the task, the event and the fact drafted from the discharge summary, NAMED to a coordinator who can see each');

select is(pg_temp.call_as(current_setting('t.u_priya')::uuid, format(
  $$ select string_agg(r.object_type::text || ':' || coalesce(r.label, 'NULL') || ':' || r.visible::text
                       || ':' || (r.object_id is not null)::text, ',' order by r.object_type)
       from hc.document_references(%L) r $$,
  current_setting('t.d_med'))),
  'task:NULL:false:false,timeline_event:Discharged home:true:true,profile_fact:NULL:false:false',
  'COUNTED, NEVER NAMED (063''s discipline): Priya reads the document at health summary — the event is hers to see; the task carries {schedule,health} and she holds no schedule, the fact reads at VIEW; both are reported as existing and neither is named nor handed to her');

select is(
  pg_temp.call_as(current_setting('t.u_tom')::uuid, format(
    $$ select count(*)::text from hc.document_references(%L) $$, current_setting('t.d_med')))
  || '|' ||
  pg_temp.call_as(current_setting('t.u_sarah')::uuid,
    $$ select count(*)::text from hc.document_references(gen_random_uuid()) $$),
  'ERROR:P0001:references_refused|ERROR:P0001:references_refused',
  'Tom holds schedule summary and nothing on health: he cannot see the document, so he cannot see what references it — refused in the same one shape as a nonexistent document (DEF-10)');

select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select string_agg(r.object_type::text || ':' || r.visible::text, ',' order by r.object_type)
       from hc.document_references(%L) r $$,
  current_setting('t.d_med'))),
  'task:false,timeline_event:false,profile_fact:false',
  'AC-PERM-10 at the read: Ruth holds a NAMED SHARE on the discharge summary and reads it at view — and every object derived from it is counted and not named, because a share never propagates');

-- ----------------------------------------------------------------------------
-- 21–24 · SHARES ON AN OBJECT: the manage-holder''s control surface; nothing
--         for anyone else, nothing for what does not exist; revoked absent.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(s.display_name || ':' || s.granter_name || ':' || (s.created_by_assignment_of is null)::text, ',' order by s.display_name)
       from hc.shares_for('document', %L) s $$,
  current_setting('t.d_med'))),
  'Marisol:Sarah:true,Ruth:Kim:true',
  '"who it has been shared with" (§4.3.4): each live share on the document, the person and who granted it, whether an assignment made it');

select is(
  pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
    $$ select count(*)::text from hc.shares_for('document', %L) $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
    $$ select count(*)::text from hc.shares_for('document', %L) $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_sarah')::uuid,
    $$ select count(*)::text from hc.shares_for('document', gen_random_uuid()) $$),
  '0/2/0',
  'Ruth reads the document through her share and cannot MANAGE it: zero rows, never an error; Dan manages health and reads the two; a nonexistent object is zero rows too — not an empty shape, not an oracle');

do $$
begin
  update public.object_shares set revoked_at = now() where id = current_setting('t.sh_ruth')::uuid;
end $$;
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(s.display_name, ',' order by s.display_name) from hc.shares_for('document', %L) s $$,
  current_setting('t.d_med'))),
  'Marisol',
  'a revoked share is not a share: Ruth''s is gone from the list');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(s.display_name || ':' || (s.created_by_assignment_of is null)::text, ',' order by s.display_name)
       from hc.shares_for('task', %L) s $$,
  current_setting('t.t1'))),
  'Marisol:true',
  'shares are per object: the task drafted from the document has its own list — Marisol''s task share, and NOT the document''s shares (§7.6, a share never reaches a derived object)');

-- ----------------------------------------------------------------------------
-- 25–28 · SHARES A PERSON HOLDS: a coordinator or the person herself; each
--         object at the CALLER''s level — counted, never named.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(s.object_type::text || ':' || coalesce(s.label, 'NULL') || ':' || s.visible::text, ',' order by s.object_type)
       from hc.shares_for_member(%L) s $$,
  current_setting('t.m_mar'))),
  'document:Discharge summary · Jul 12:true,task:Book the follow-up:true',
  '"visible on both the document and the person" (§4.3.5): on Marisol''s entry, what has been shared with her — named to a coordinator who can see each');

select is(pg_temp.call_as(current_setting('t.u_mar')::uuid, format(
  $$ select string_agg(s.object_type::text || ':' || coalesce(s.label, 'NULL') || ':' || s.visible::text, ',' order by s.object_type)
       from hc.shares_for_member(%L) s $$,
  current_setting('t.m_mar'))),
  'document:Discharge summary · Jul 12:true,task:Book the follow-up:true',
  'and the person herself reads her own — each object at HER level, which a share lifts to view');

select is(
  pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
    $$ select count(*)::text from hc.shares_for_member(%L) $$, current_setting('t.m_mar')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_sarah')::uuid,
    $$ select count(*)::text from hc.shares_for_member(gen_random_uuid()) $$),
  '0/0',
  'Dan is neither a coordinator nor Marisol: zero rows; a nonexistent member is zero rows — no existence oracle');

select is(pg_temp.call_as(current_setting('t.u_kim')::uuid, format(
  $$ select string_agg(s.object_type::text || ':' || coalesce(s.label, 'NULL') || ':' || s.visible::text
                       || ':' || (s.object_id is not null)::text, ',' order by s.object_type)
       from hc.shares_for_member(%L) s $$,
  current_setting('t.m_kim'))),
  'document:NULL:false:false',
  'COUNTED, NEVER NAMED, the other way: Kim holds a share on a document whose lineage is UNRESOLVED; she is a coordinator with view on memories rather than manage×5, so rung 3 hides it from her — her own share is reported as existing and is neither named nor handed to her');

select * from finish();
rollback;
