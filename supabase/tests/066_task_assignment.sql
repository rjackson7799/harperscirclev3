-- ============================================================================
-- 7A · M1 — task assignment: hc.assign_task · hc.unassign_task (TSD §3.6;
-- PRD §4.5.5, §4.5.6, §7.3; AC-TASK-2/6/7; AC-PERM-10). SHR-02, pending
-- since 1D, flips at THIS layer. Pinned here BEFORE the migration exists.
--
-- THE CONTRACT THESE CASES PIN.
--   · The ASSIGNEE's taint is computed from HER OWN vectors (hc.ctx_for),
--     never the caller's, and it is computed as she would see the task once
--     it is hers (owner = her), so the care-circle own-task rung answers for
--     a caregiver exactly as the policy will.
--   · A person with NO context on the subject is refused outright — §4.5.5,
--     "not offered" — and no path is opened for them.
--   · A person who cannot clear the task's taint is refused UNLESS the caller
--     chooses exactly one of §4.5.6's two human paths:
--       1 · a WRITTEN INSTRUCTION — a new task row, taint = {schedule} only,
--           written_for/written_from set, the typed sentence and NOTHING of
--           the original's content; the original keeps its taint and stays
--           invisible to her even though she now holds it.
--       2 · an EXPLICIT NAMED SHARE — object_shares on the task AND the
--           named document, created together, both created_by_assignment_of
--           the task, behind a §5.7 step-up bound to 'share_object' and the
--           pair 'task:<id>+document:<id>' (a token minted for one object
--           cannot be spent on two).
--   · The paths exist ONLY for the crossing: supplying one for a person who
--     can already see the task is refused — path 1 would otherwise be a
--     task-creation channel that bypasses hc.approve_proposal.
--   · POST-CONDITION, asserted in-function from the assignee's live vectors
--     after the writes: an assignment never yields a task she cannot see.
--   · unassign_task revokes EXACTLY the shares this assignment created —
--     a foreign share (created_by_assignment_of IS NOT this task) is left
--     alone, and a coordinator may keep one by id (AC-TASK-7, SHR-02 both
--     ways); it closes the written instruction. Reassign = unassign + assign
--     in one transaction, task_reassigned logged.
--   · A freeze refuses assignment with the NAMED freeze_active (PRD §7.5 —
--     assignment is a widening act) and permits unassignment (it reduces
--     reach: the remove_member precedent).
--   · The AI role holds no EXECUTE — catalog-based (the segfault trap).
--   · hc.revise_object's task allowlist is NOT widened: status and
--     owner_member_id stay unaddressable through the generic patch.
--
-- The claim trigger (hc_claim_tasks, DEFERRED) is made IMMEDIATE after the
-- fixtures so every insert a function performs in this file is checked at
-- the statement — a pgTAP transaction rolls back and would otherwise never
-- fire it. Fixtures are written under session_replication_role = replica
-- (the concurrency runner's precedent) so they queue no claim events.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(50);

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

-- Mint a step-up token on a fresh session for p_user, bound to (op, target).
create function pg_temp.mint(p_user uuid, p_op text, p_target text, p_slot text)
returns void language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password',
      'timestamp', extract(epoch from now())::bigint)))::text, true);
  execute 'set local role authenticated';
  v := hc.mint_step_up(p_op, p_target) ->> 'token';
  execute 'reset role';
  perform set_config('t.' || p_slot, v, true);
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures: circle c1 · subjects s1 (Nell) and s2 (Marcus).
--   Sarah    coordinator, manage×5 on both subjects
--   Priya    coordinator, manage×5 (a second live coordinator)
--   Dan      family — manage on schedule, health, finances (NOT documents)
--   Ruth     family — summary on schedule + health (clears {schedule,health})
--   Marisol  care_circle — schedule summary only (the caregiver)
--   Lena     family — health VIEW, schedule hidden (path 2 works; path 1 cannot)
--   Omar     family — grants on MARCUS only: no context on Nell at all
-- Documents: d_src (medical, {health}) · d_fin (financial, {finances}) ·
-- d_legal (legal, {documents}) · d_s2 (Marcus's, {health}).
-- Tasks: t_plain {schedule} · t_tainted {schedule,health} (from d_src) ·
-- t_fin {schedule,finances} · t_sched2 {schedule} · t_done (done).
-- One FOREIGN share: d_fin → Lena, created_by_assignment_of NULL.
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
do $fx$
declare
  u_sarah   uuid := pg_temp.mk_user(gen_random_uuid());
  u_priya   uuid := pg_temp.mk_user(gen_random_uuid());
  u_dan     uuid := pg_temp.mk_user(gen_random_uuid());
  u_ruth    uuid := pg_temp.mk_user(gen_random_uuid());
  u_marisol uuid := pg_temp.mk_user(gen_random_uuid());
  u_lena    uuid := pg_temp.mk_user(gen_random_uuid());
  u_omar    uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; s2 uuid;
  m_sarah uuid; m_priya uuid; m_dan uuid; m_ruth uuid; m_marisol uuid;
  m_lena uuid; m_omar uuid;
  a1 uuid := gen_random_uuid();
  d_src uuid := gen_random_uuid(); d_fin uuid := gen_random_uuid();
  d_legal uuid := gen_random_uuid(); d_s2 uuid := gen_random_uuid();
  t_plain uuid := gen_random_uuid(); t_tainted uuid := gen_random_uuid();
  t_fin uuid := gen_random_uuid(); t_sched2 uuid := gen_random_uuid();
  t_done uuid := gen_random_uuid();
  sh_foreign uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u_sarah, 'member', 'Sarah'), (u_priya, 'member', 'Priya'),
    (u_dan, 'member', 'Dan'), (u_ruth, 'member', 'Ruth'),
    (u_marisol, 'member', 'Marisol'), (u_lena, 'member', 'Lena'),
    (u_omar, 'member', 'Omar');
  insert into public.circles (name, created_by) values ('Nell''s circle', u_sarah)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'ta1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Marcus', 'independent', '02138', 'America/New_York', 'clay',
          'ta2-' || substr(c1::text, 1, 8)) returning id into s2;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_sarah, 'coordinator', 'Sarah') returning id into m_sarah;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_priya, 'coordinator', 'Priya') returning id into m_priya;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_dan, 'family', 'Dan') returning id into m_dan;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_ruth, 'family', 'Ruth') returning id into m_ruth;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_marisol, 'care_circle', 'Marisol') returning id into m_marisol;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_lena, 'family', 'Lena') returning id into m_lena;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_omar, 'family', 'Omar') returning id into m_omar;

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_sarah, s1, d::hc.domain, 'manage', u_sarah),
           (c1, m_sarah, s2, d::hc.domain, 'manage', u_sarah),
           (c1, m_priya, s1, d::hc.domain, 'manage', u_sarah),
           (c1, m_priya, s2, d::hc.domain, 'manage', u_sarah);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_dan,     s1, 'schedule', 'manage',  u_sarah),
         (c1, m_dan,     s1, 'health',   'manage',  u_sarah),
         (c1, m_dan,     s1, 'finances', 'manage',  u_sarah),
         (c1, m_ruth,    s1, 'schedule', 'summary', u_sarah),
         (c1, m_ruth,    s1, 'health',   'summary', u_sarah),
         (c1, m_marisol, s1, 'schedule', 'summary', u_sarah),
         (c1, m_lena,    s1, 'health',   'view',    u_sarah),
         (c1, m_omar,    s2, 'schedule', 'summary', u_sarah),
         (c1, m_omar,    s2, 'health',   'summary', u_sarah);

  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (a1, c1, s1, 'upload');

  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (d_src,   c1, s1, 'Discharge summary · Jul 12', 'medical',   a1, now(), u_sarah, now(), 'Sarah', '{health}'),
         (d_fin,   c1, s1, 'Bank statement · Jul 2026',   'financial', a1, now(), u_sarah, now(), 'Sarah', '{finances}'),
         (d_legal, c1, s1, 'Power of attorney',            'legal',     a1, now(), u_sarah, now(), 'Sarah', '{documents}'),
         (d_s2,    c1, s2, 'Marcus''s referral',           'medical',   a1, now(), u_sarah, now(), 'Sarah', '{health}');

  insert into public.tasks (id, circle_id, subject_id, title, detail, due_on, due_zone,
    status, approved_by, approved_at, approver_display_name, taint)
  values
    (t_plain,   c1, s1, 'Call the pharmacy', null, null, null,
     'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_tainted, c1, s1, 'Follow the discharge instructions from Dr Okafor',
     'Wound care twice daily; the dressing protocol is on page 3',
     '2026-09-04', 'America/New_York',
     'open', u_sarah, now(), 'Sarah', '{schedule,health}'),
    (t_fin,     c1, s1, 'Pay the July invoice', null, null, null,
     'open', u_sarah, now(), 'Sarah', '{schedule,finances}'),
    (t_sched2,  c1, s1, 'Renew the parking permit', null, null, null,
     'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_done,    c1, s1, 'Book the follow-up', null, null, null,
     'done', u_sarah, now(), 'Sarah', '{schedule}');
  update public.tasks set owner_member_id = m_ruth, completed_by = u_ruth, completed_at = now()
   where id = t_done;

  -- the tainted task's lineage: drafted from the discharge summary
  insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
  values (c1, 'task', t_tainted, 'document', d_src);

  -- THE FOREIGN SHARE: a coordinator's own earlier share, no assignment behind it
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', d_fin, m_lena, u_sarah) returning id into sh_foreign;

  perform set_config('t.u_sarah', u_sarah::text, true);
  perform set_config('t.u_priya', u_priya::text, true);
  perform set_config('t.u_dan', u_dan::text, true);
  perform set_config('t.u_ruth', u_ruth::text, true);
  perform set_config('t.u_marisol', u_marisol::text, true);
  perform set_config('t.u_lena', u_lena::text, true);
  perform set_config('t.u_omar', u_omar::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.m_sarah', m_sarah::text, true);
  perform set_config('t.m_dan', m_dan::text, true);
  perform set_config('t.m_ruth', m_ruth::text, true);
  perform set_config('t.m_marisol', m_marisol::text, true);
  perform set_config('t.m_lena', m_lena::text, true);
  perform set_config('t.m_omar', m_omar::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.d_src', d_src::text, true);
  perform set_config('t.d_fin', d_fin::text, true);
  perform set_config('t.d_legal', d_legal::text, true);
  perform set_config('t.d_s2', d_s2::text, true);
  perform set_config('t.t_plain', t_plain::text, true);
  perform set_config('t.t_tainted', t_tainted::text, true);
  perform set_config('t.t_fin', t_fin::text, true);
  perform set_config('t.t_sched2', t_sched2::text, true);
  perform set_config('t.t_done', t_done::text, true);
  perform set_config('t.sh_foreign', sh_foreign::text, true);
end $fx$;
set session_replication_role = default;

-- From here every insert a FUNCTION performs meets the claim trigger at the
-- statement, exactly as it would at commit.
set constraints all immediate;

-- ----------------------------------------------------------------------------
-- 1–5 · Shape, privilege closure (catalog-based), the AI role, event types.
-- ----------------------------------------------------------------------------
select has_function('hc', 'assign_task', array['uuid', 'uuid', 'text', 'uuid', 'text'],
  'hc.assign_task(task, member, instruction, share_document, step_up_token) exists');
select has_function('hc', 'unassign_task', array['uuid', 'uuid[]'],
  'hc.unassign_task(task, keep_share_ids) exists');

select ok(
  (select count(*) = 2 and bool_and(
        pg_get_userbyid(p.proowner) = 'hc_internal'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('hc_admin', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname in ('assign_task', 'unassign_task')),
  'both writers are definers owned by hc_internal, executable by authenticated and by no other request-path role — asserted from the catalog, never by calling as a denied role');

select ok(
  (select count(*) = 2 and bool_and(not has_function_privilege('hc_pipeline', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname in ('assign_task', 'unassign_task')),
  'THE AI HAS NO PATH INTO ASSIGNMENT (PRD §6.5, AC-TASK-2): hc_pipeline holds no EXECUTE on either function, so no task is ever assigned by the system');

select is((select count(*)::int from hc.log_event_types
            where code in ('task_assigned', 'task_reassigned')), 2,
  'task_assigned and task_reassigned join the event vocabulary; task_unassigned has existed since 2A');

-- ----------------------------------------------------------------------------
-- 6–9 · A PLAIN ASSIGNMENT: the caregiver can clear {schedule} on her own
--       task (rung 4's own-task exception), so nothing else is needed.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L)) ->> 'path' $$,
  current_setting('t.t_plain'), current_setting('t.m_marisol'))),
  'plain',
  'a coordinator hands a {schedule} task to the caregiver: path "plain" — she can clear the taint, so no instruction and no share is asked for');

select is(pg_temp.scalar(format(
  $$ select (t.owner_member_id = %L and t.assigned_by = %L and t.assigned_at is not null)::text
       from public.tasks t where t.id = %L $$,
  current_setting('t.m_marisol'), current_setting('t.u_sarah'), current_setting('t.t_plain'))),
  'true',
  'the row carries the holder, the assigner and the moment');

select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select count(*)::text from public.tasks where id = %L $$,
  current_setting('t.t_plain'))),
  '1',
  'FROM HER OWN LIVE CONTEXT the caregiver reads the task she was handed — the care-circle ceiling excepts her own task (hc.visible_at rung 4)');

select is(pg_temp.scalar(format(
  $$ select l.actor_display_name || '/' || (l.target_member_id = %L)::text || '/'
            || (l.object_id = %L)::text || '/' || (l.detail ->> 'path')
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'task_assigned' $$,
  current_setting('t.m_marisol'), current_setting('t.t_plain'), current_setting('t.c1'))),
  'Sarah/true/true/plain',
  'AC-TASK-2: the assignment has a HUMAN actor in the log, naming the person, the task and the path');

-- ----------------------------------------------------------------------------
-- 10–12 · Refusals: cannot clear the taint and no path chosen · both paths ·
--         no context on the subject at all (§4.5.5: not offered).
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_marisol'))),
  'ERROR:P0001:assign_refused',
  'AC-TASK-6: the caregiver cannot clear {schedule,health}, so a plain assignment REFUSES — assignment never grants and never clears taint');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, 'Pick up the prescription', %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_marisol'), current_setting('t.d_src'))),
  'ERROR:P0001:assign_refused',
  'the two paths are EXCLUSIVE: an instruction and a share in one call is refused rather than doing both');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, 'Pick up the prescription')::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_omar'))),
  'ERROR:P0001:assign_refused',
  'PRD §4.5.5: a member with NO context on the subject is refused even with an instruction — the written task would be as invisible to him as the original, so the person is not offered');

-- ----------------------------------------------------------------------------
-- 13–19 · PATH 1 — the written instruction.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, 'Pick up Nell''s new prescription at the Elm St pharmacy, before Friday')) ->> 'path' $$,
  current_setting('t.t_tainted'), current_setting('t.m_marisol'))),
  'instruction',
  'PATH 1: the coordinator types what the caregiver should see, and the assignment goes through as an instruction');

select is(pg_temp.scalar(format(
  $$ select (t.taint = '{schedule}'::hc.domain[] and t.taint_resolved
             and t.written_for_member_id = %L and t.written_from_task_id = %L
             and t.owner_member_id = %L and t.assigned_by = %L
             and t.approved_by = %L and t.approver_display_name = 'Sarah'
             and t.source_arrival_id is null and t.source_proposal_id is null
             and t.due_on = date '2026-09-04' and t.due_zone = 'America/New_York'
             and t.status = 'open')::text
       from public.tasks t where t.written_from_task_id = %L $$,
  current_setting('t.m_marisol'), current_setting('t.t_tainted'),
  current_setting('t.m_marisol'), current_setting('t.u_sarah'),
  current_setting('t.u_sarah'), current_setting('t.t_tainted'))),
  'true',
  'the instruction is its OWN object: taint = {schedule} only, written for Marisol, from the task she cannot see, approved by the person who wrote it, no arrival and no proposal behind it, the deadline carried over');

select is(pg_temp.scalar(format(
  $$ select t.title || '|' || coalesce(t.detail, 'NULL')
       from public.tasks t where t.written_from_task_id = %L $$,
  current_setting('t.t_tainted'))),
  'Pick up Nell''s new prescription at the Elm St pharmacy, before Friday|NULL',
  'THE LEAK CONTROL (kickoff push 1): the instruction carries the TYPED sentence and NOTHING of the original — not its title, not its detail. A caller with manage cannot launder the tainted content through the written-for row');

select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select count(*)::text from public.tasks where written_from_task_id = %L $$,
  current_setting('t.t_tainted'))),
  '1',
  'from her own live context the caregiver reads the instruction at summary (AC-TASK-6: a human-written instruction, and nothing else)');

select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select count(*)::text from public.tasks where id = %L $$,
  current_setting('t.t_tainted'))),
  '0',
  'and the ORIGINAL stays invisible to her — she is its holder now, and the own-task rung buys her nothing against {schedule,health} (003 rung 4 is a ceiling exception, not a grant)');

select is(pg_temp.scalar(format(
  $$ select (t.owner_member_id = %L and t.taint = '{schedule,health}'::hc.domain[])::text
       from public.tasks t where t.id = %L $$,
  current_setting('t.m_marisol'), current_setting('t.t_tainted'))),
  'true',
  'the original is assigned to her and keeps its taint — the assignment is a fact on the original, the instruction is what she reads');

select is(pg_temp.scalar(format(
  $$ select (l.detail ->> 'path') || '/' ||
            (l.detail ->> 'instruction_task_id' =
               (select t.id::text from public.tasks t where t.written_from_task_id = %L))::text
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'task_assigned' and l.object_id = %L $$,
  current_setting('t.t_tainted'), current_setting('t.c1'), current_setting('t.t_tainted'))),
  'instruction/true',
  'the log entry names the path and the instruction row it wrote');

-- ----------------------------------------------------------------------------
-- 20–21 · The claim-trigger exemption is EXACT. The instruction landed
--         through hc_claim_tasks (IMMEDIATE above) with no proposal_commits
--         row, so the exemption is real; these two drive its edges as
--         postgres — a row wearing only half the instruction's columns, and
--         one wearing all of them plus a source, are both still UNCLAIMED.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ insert into public.tasks (circle_id, subject_id, title, owner_member_id,
       written_for_member_id, approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'half an instruction', %L, %L, %L, now(), 'Sarah', '{schedule}')
     returning 'landed' $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.m_marisol'),
  current_setting('t.m_marisol'), current_setting('t.u_sarah'))),
  'ERROR:P0001:record_write_unclaimed',
  'a task with written_for but NO written_from is not an instruction and is still unclaimed — the exemption needs the pair');

select is(pg_temp.scalar(format(
  $$ insert into public.tasks (circle_id, subject_id, title, owner_member_id,
       written_for_member_id, written_from_task_id, source_arrival_id,
       approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'an instruction with a source', %L, %L, %L, %L, %L, now(), 'Sarah', '{schedule}')
     returning 'landed' $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.m_marisol'),
  current_setting('t.m_marisol'), current_setting('t.t_tainted'), current_setting('t.a1'),
  current_setting('t.u_sarah'))),
  'ERROR:P0001:record_write_unclaimed',
  'a row wearing the instruction pair AND a source arrival is not an instruction either — a person''s own sentence has no arrival behind it, so anything that does still needs its proposal');

-- ----------------------------------------------------------------------------
-- 22–24 · The paths exist ONLY for the crossing.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, 'A sentence Ruth does not need')::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_ruth'))),
  'ERROR:P0001:assign_refused',
  'Ruth clears {schedule,health} at summary, so an instruction for her is refused — path 1 is not a way to create tasks without a proposal');

select is(pg_temp.scalar(format(
  $$ select (t.owner_member_id = %L)::text || '/' ||
            (select count(*)::text from public.tasks i where i.written_for_member_id = %L)
       from public.tasks t where t.id = %L $$,
  current_setting('t.m_marisol'), current_setting('t.m_ruth'), current_setting('t.t_tainted'))),
  'true/0',
  'and the refused call wrote nothing: Marisol still holds the task and no row was written for Ruth');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, 'A sentence Lena could not read')::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_lena'))),
  'ERROR:P0001:assign_refused',
  'Lena holds health VIEW and no schedule at all: a {schedule} instruction would be invisible to her, so path 1 refuses (the in-function post-condition — an assignment never yields a task its holder cannot see)');

-- ----------------------------------------------------------------------------
-- 25–31 · PATH 2 — the explicit named share, behind the §5.7 step-up.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, null, %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_lena'), current_setting('t.d_src'))),
  'ERROR:P0001:assign_refused',
  'PATH 2 without a step-up token refuses — sharing an object is a §5.7 operation and assignment does not get a cheaper door');

select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_plain'), 'tok_wrong');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, null, %L, %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_lena'), current_setting('t.d_src'),
  current_setting('t.tok_wrong'))),
  'ERROR:P0001:assign_refused',
  'a token minted for ONE object (task:<id>) cannot be spent on the pair — the binding is share_object + task:<id>+document:<id>, both named');

select is(pg_temp.scalar(format(
  $$ select (s.consumed_at is null)::text || '/' ||
            (select count(*)::text from public.object_shares sh
              where sh.member_id = %L and sh.revoked_at is null and sh.created_by_assignment_of is not null)
       from public.step_up_tokens s where s.token_hash = extensions.digest(%L, 'sha256') $$,
  current_setting('t.m_lena'), current_setting('t.tok_wrong'))),
  'true/0',
  'the mismatched token is NOT consumed and no share was written');

select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_tainted') || '+document:' || current_setting('t.d_src'), 'tok_pair');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' $$,
  current_setting('t.t_tainted'), current_setting('t.m_lena'), current_setting('t.d_src'),
  current_setting('t.tok_pair'))),
  'share',
  'PATH 2 with a live token bound to the pair: "Lena will be able to see: this task, and the discharge summary from Jul 12" — one act');

select is(pg_temp.scalar(format(
  $$ select (select string_agg(sh.object_type::text, ',' order by sh.object_type)
               from public.object_shares sh
              where sh.member_id = %L and sh.revoked_at is null
                and sh.created_by_assignment_of = %L)
            || '/' ||
            (select (s.consumed_at is not null)::text from public.step_up_tokens s
              where s.token_hash = extensions.digest(%L, 'sha256')) $$,
  current_setting('t.m_lena'), current_setting('t.t_tainted'), current_setting('t.tok_pair'))),
  'document,task/true',
  'BOTH shares exist, both created_by_assignment_of the task, and the token is consumed exactly once');

select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select (select count(*) from public.tasks where id = %L)::text || '/' ||
            (select count(*) from public.documents where id = %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.d_src'))),
  '1/1',
  'from her own live context Lena now reads the task AND the named document — and nothing widened beyond those two rows');

select is(pg_temp.scalar(format(
  $$ select (select count(*)::text from public.access_log l
              where l.circle_id = %L and l.event_type = 'task_reassigned'
                and l.object_id = %L and l.detail ->> 'former_owner_name' = 'Marisol')
            || '/' ||
            (select t.status from public.tasks t where t.written_from_task_id = %L)
            || '/' ||
            (select (t.owner_member_id = %L)::text from public.tasks t where t.id = %L) $$,
  current_setting('t.c1'), current_setting('t.t_tainted'), current_setting('t.t_tainted'),
  current_setting('t.m_lena'), current_setting('t.t_tainted'))),
  '1/cancelled/true',
  'that was a REASSIGN from Marisol: one task_reassigned entry naming her, her written instruction CLOSED, Lena the holder — unassign + assign in one transaction, the whole check re-run');

-- ----------------------------------------------------------------------------
-- 32–33 · Path 2's document: this subject, and the caller holds manage on it.
-- ----------------------------------------------------------------------------
select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_fin') || '+document:' || current_setting('t.d_s2'), 'tok_s2');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, null, %L, %L)::text $$,
  current_setting('t.t_fin'), current_setting('t.m_lena'), current_setting('t.d_s2'),
  current_setting('t.tok_s2'))),
  'ERROR:P0001:assign_refused',
  'a document of ANOTHER subject cannot ride an assignment — Marcus''s referral is not Nell''s task''s source, and the refusal is one shape');

select pg_temp.mint(current_setting('t.u_dan')::uuid, 'share_object',
  'task:' || current_setting('t.t_sched2') || '+document:' || current_setting('t.d_legal'), 'tok_dan');
select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.assign_task(%L, %L, null, %L, %L)::text $$,
  current_setting('t.t_sched2'), current_setting('t.m_lena'), current_setting('t.d_legal'),
  current_setting('t.tok_dan'))),
  'ERROR:P0001:assign_refused',
  'Dan manages the task but not the documents domain: naming a legal document he cannot manage refuses — the share half of path 2 is share_object''s own bar');

-- ----------------------------------------------------------------------------
-- 34–35 · SHR-02, THE FOREIGN SHARE: a share this assignment did not create
--         is neither duplicated, adopted, nor revoked.
-- ----------------------------------------------------------------------------
select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_fin') || '+document:' || current_setting('t.d_fin'), 'tok_fin');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' || '/' ||
            (select count(*)::text from public.object_shares sh
              where sh.object_id = %L and sh.member_id = %L and sh.revoked_at is null)
            || '/' ||
            (select (sh.created_by_assignment_of is null)::text from public.object_shares sh where sh.id = %L) $$,
  current_setting('t.t_fin'), current_setting('t.m_lena'), current_setting('t.d_fin'),
  current_setting('t.tok_fin'), current_setting('t.d_fin'), current_setting('t.m_lena'),
  current_setting('t.sh_foreign'))),
  'share/1/true',
  'the bank statement was ALREADY shared with Lena by a coordinator''s own act: path 2 creates the task share and leaves the document''s foreign share as it is — one live row, still nobody''s assignment');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.unassign_task(%L)) ->> 'shares_revoked' || '/' ||
            (select (sh.revoked_at is null)::text from public.object_shares sh where sh.id = %L)
            || '/' ||
            (select count(*)::text from public.object_shares sh
              where sh.created_by_assignment_of = %L and sh.revoked_at is null) $$,
  current_setting('t.t_fin'), current_setting('t.sh_foreign'), current_setting('t.t_fin'))),
  '1/true/0',
  'SHR-02 ONE WAY: unassigning revokes exactly the share the assignment created (the task''s) and the FOREIGN document share survives untouched — AC-PERM-10''s revoke half never reaches what it did not grant');

-- ----------------------------------------------------------------------------
-- 36–39 · SHR-02, THE KEPT SHARE: a coordinator keeps one by id.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.unassign_task(%L, array[(select sh.id from public.object_shares sh
        where sh.created_by_assignment_of = %L and sh.object_type = 'document' and sh.revoked_at is null)]))
        ->> 'shares_kept' $$,
  current_setting('t.t_tainted'), current_setting('t.t_tainted'))),
  '1',
  'a coordinator unassigns Lena and KEEPS the discharge-summary share by id (AC-TASK-7: "unless a coordinator explicitly keeps it")');

select is(pg_temp.scalar(format(
  $$ select string_agg(sh.object_type::text || ':' || (sh.revoked_at is null)::text, ',' order by sh.object_type)
       from public.object_shares sh where sh.created_by_assignment_of = %L $$,
  current_setting('t.t_tainted'))),
  'document:true,task:false',
  'SHR-02 THE OTHER WAY: the kept share survives LIVE and still names the assignment it came from; the task share is revoked');

select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select (select count(*) from public.tasks where id = %L)::text || '/' ||
            (select count(*) from public.documents where id = %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.d_src'))),
  '0/1',
  'from Lena''s live context: the task is gone on her NEXT query and the kept document is still there — revocation is live, and a kept share is a real one');

select is(pg_temp.scalar(format(
  $$ select (l.detail ->> 'former_owner_name') || '/' || (l.detail ->> 'shares_revoked') || '/'
            || (l.detail ->> 'shares_kept') || '/' || (l.detail ->> 'instructions_closed')
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'task_unassigned' and l.object_id = %L $$,
  current_setting('t.c1'), current_setting('t.t_tainted'))),
  'Lena/1/1/0',
  'the task_unassigned entry labels who held it and counts what was revoked, kept and closed (PRD §8.8''s shape, carried to member unassignment)');

-- ----------------------------------------------------------------------------
-- 40–42 · Keeping is a COORDINATOR's decision, and the keep list is exact.
-- ----------------------------------------------------------------------------
select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_sched2') || '+document:' || current_setting('t.d_src'), 'tok_s2b');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' $$,
  current_setting('t.t_sched2'), current_setting('t.m_lena'), current_setting('t.d_src'),
  current_setting('t.tok_s2b'))),
  'share',
  'fixture: the parking-permit task assigned to Lena with the discharge summary named (she holds no schedule, so it is a crossing)');

select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.unassign_task(%L, array[(select sh.id from public.object_shares sh
        where sh.created_by_assignment_of = %L and sh.object_type = 'document' and sh.revoked_at is null)])::text $$,
  current_setting('t.t_sched2'), current_setting('t.t_sched2'))),
  'ERROR:P0001:unassign_refused',
  'Dan holds manage on the task and is not a coordinator: a keep list from him refuses WHOLE — keeping a share past its assignment is a coordinator''s explicit decision');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.unassign_task(%L, array[%L::uuid])::text $$,
  current_setting('t.t_sched2'), current_setting('t.sh_foreign'))),
  'ERROR:P0001:unassign_refused',
  'a keep id that is not THIS assignment''s live share (the foreign bank-statement share) refuses whole — the remove_member precedent: an explicit decision, never a guess');

-- ----------------------------------------------------------------------------
-- 43–46 · Refusal shapes: no holder · a done task · nonexistent · below manage.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select (hc.unassign_task(%L)) ->> 'shares_revoked' $$,
  current_setting('t.t_sched2'))),
  '2',
  'a manage-holder who is not a coordinator CAN unassign without a keep list — both assignment shares revoked');

select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.unassign_task(%L)::text $$, current_setting('t.t_sched2'))),
  'ERROR:P0001:unassign_refused',
  'unassigning a task nobody holds refuses');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text || hc.assign_task(gen_random_uuid(), %L)::text $$,
  current_setting('t.t_done'), current_setting('t.m_marisol'), current_setting('t.m_marisol'))),
  'ERROR:P0001:assign_refused',
  'a DONE task is not assignable (completed work stays attributed, §4.5.3), and a nonexistent task lands in the same one shape (DEF-10)');

select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_sched2'), current_setting('t.m_marisol'))),
  'ERROR:P0001:assign_refused',
  'a member at summary cannot assign — manage on the task is the bar (PRD §7.3: manage can assign; view "cannot change others'' items")');

-- ----------------------------------------------------------------------------
-- 47 · The slice trap: hc.revise_object's task allowlist is NOT widened.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"status":"done"}'::jsonb)::text
         || hc.revise_object('task', %L, jsonb_build_object('owner_member_id', %L))::text $$,
  current_setting('t.t_plain'), current_setting('t.t_plain'), current_setting('t.m_ruth'))),
  'ERROR:P0001:revise_invalid_field',
  'status and owner_member_id stay unaddressable through the generic patch — the allowlist is title, detail, due_on, due_zone and nothing this migration adds');

-- ----------------------------------------------------------------------------
-- 48 · Same holder: a quiet no-op (the set_grant precedent).
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L)) ->> 'changed' || '/' ||
            (select count(*)::text from public.access_log l
              where l.circle_id = %L and l.event_type in ('task_assigned', 'task_reassigned')
                and l.object_id = %L) $$,
  current_setting('t.t_plain'), current_setting('t.m_marisol'),
  current_setting('t.c1'), current_setting('t.t_plain'))),
  'false/1',
  'assigning a task to the person who already holds it changes nothing and logs nothing');

-- ----------------------------------------------------------------------------
-- 49–50 · Freeze: assignment refuses with the NAMED signature; unassignment
--         is permitted (it reduces reach — the remove_member precedent).
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_sched2'), current_setting('t.m_ruth'))),
  'ERROR:P0001:freeze_active',
  'PRD §7.5 "no new grants": a freeze refuses assignment with the named freeze_active — handing a task to someone is a widening act');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.unassign_task(%L)) ->> 'former_owner_name' $$,
  current_setting('t.t_plain'))),
  'Marisol',
  'and a freeze permits unassignment — containment never blocks reduction');

select * from finish();
rollback;
