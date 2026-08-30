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
--     in one transaction, task_reassigned logged. "This assignment's" =
--     this task's marker AND held by the person being unassigned (ADR-0033
--     cluster B): a share a coordinator KEPT stays with its holder through
--     the task's later cycles (53-60).
--   · An INSTRUCTION row is never p_task to assign/unassign (ADR-0033
--     cluster C); completing an original cancels its open instructions,
--     completing an instruction completes the original with the
--     instruction's actor, and completion revokes the assignment's shares
--     (D19.4, D19.6); revoke_share refuses a LIVE assignment's share and
--     accepts a kept one (D19.2); assignment closes the original's open
--     instructions unconditionally (R2/F-8). 61-75.
--   · The freeze is named to MEMBERS (ADR-0033 cluster E): the caller's
--     live membership in this circle is checked before the freeze, so a
--     stranger, a removed member and a nonexistent id are one shape
--     (76-77).
--   · The objected-to member is NOT a live coordinator during their own
--     freeze: unassign_task and revoke_share refuse them (ADR-0033 D19.1,
--     78-81).
--   · "Context on the subject" is AT LEAST ONE DELIBERATE log-or-higher
--     grant, asked of the assignee's ladder, not of the key's presence
--     (ADR-0033 D19.7, 82-84).
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

select plan(85);

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

-- Read one value as postgres and stash it: object_shares holds no
-- authenticated grant, so a share id is looked up OUTSIDE call_as and
-- passed in as a literal.
create function pg_temp.stash(p_slot text, p_sql text) returns void
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
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
  'ERROR:23514:new row for relation "tasks" violates check constraint "tasks_instruction_pair"',
  'a task with written_for but NO written_from is UNREPRESENTABLE — the pair is a CHECK on the table, so half an instruction cannot exist for the claim exemption to misread');

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
  current_setting('t.t_tainted'), current_setting('t.m_lena'), current_setting('t.d_legal'))),
  'ERROR:P0001:assign_refused',
  'PATH 2 without a step-up token refuses — sharing an object is a §5.7 operation and assignment does not get a cheaper door');

select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_plain'), 'tok_wrong');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, null, %L, %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_lena'), current_setting('t.d_legal'),
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
  'task:' || current_setting('t.t_tainted') || '+document:' || current_setting('t.d_legal'), 'tok_pair');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' $$,
  current_setting('t.t_tainted'), current_setting('t.m_lena'), current_setting('t.d_legal'),
  current_setting('t.tok_pair'))),
  'share',
  'PATH 2 with a live token bound to the pair: "Lena will be able to see: this task, and the power of attorney" — one act (the POA is a {documents} row she holds no grant on, so whatever she reads next is the share''s doing — R3/F-2)');

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
            (select count(*) from public.documents where id = %L)::text || '/' ||
            (select count(*) from public.tasks)::text || '/' ||
            (select string_agg(d.category::text, ',' order by d.category::text) from public.documents d) $$,
  current_setting('t.t_tainted'), current_setting('t.d_legal'))),
  '1/1/1/financial,legal,medical',
  'from her own live context Lena now reads the task AND the named document — the POA, which only the share can show her (health VIEW never reached a {documents} row; R3/F-2) — and nothing widened beyond: her whole world is this one task and three documents — the discharge summary from her own grant, the bank statement from the FOREIGN share, the POA from THIS share');

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
-- 34–37 · SHR-02, THE FOREIGN SHARE: a share this assignment did not create
--         is neither duplicated, adopted, nor revoked.
-- ----------------------------------------------------------------------------
select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_fin') || '+document:' || current_setting('t.d_fin'), 'tok_fin');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' $$,
  current_setting('t.t_fin'), current_setting('t.m_lena'), current_setting('t.d_fin'),
  current_setting('t.tok_fin'))),
  'share',
  'the bank statement was ALREADY shared with Lena by a coordinator''s own act: path 2 still goes through as a share');

select is(pg_temp.scalar(format(
  $$ select (select count(*)::text from public.object_shares sh
              where sh.object_id = %L and sh.member_id = %L and sh.revoked_at is null)
            || '/' ||
            (select (sh.created_by_assignment_of is null)::text from public.object_shares sh where sh.id = %L)
            || '/' ||
            (select string_agg(sh.object_type::text, ',') from public.object_shares sh
              where sh.created_by_assignment_of = %L and sh.revoked_at is null) $$,
  current_setting('t.d_fin'), current_setting('t.m_lena'), current_setting('t.sh_foreign'),
  current_setting('t.t_fin'))),
  '1/true/task',
  'ONE live row on the bank statement — the foreign one, neither duplicated nor adopted, still nobody''s assignment — and exactly one share created by this assignment: the task''s');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.unassign_task(%L)) ->> 'shares_revoked' $$,
  current_setting('t.t_fin'))),
  '1',
  'SHR-02 ONE WAY: unassigning revokes exactly the share the assignment created — the task''s, one row');

select is(pg_temp.scalar(format(
  $$ select (select (sh.revoked_at is null)::text from public.object_shares sh where sh.id = %L)
            || '/' ||
            (select count(*)::text from public.object_shares sh
              where sh.created_by_assignment_of = %L and sh.revoked_at is null) $$,
  current_setting('t.sh_foreign'), current_setting('t.t_fin'))),
  'true/0',
  'and the FOREIGN document share survives untouched — AC-PERM-10''s revoke half never reaches what the assignment did not grant');

-- ----------------------------------------------------------------------------
-- 38–41 · SHR-02, THE KEPT SHARE: a coordinator keeps one by id.
-- ----------------------------------------------------------------------------
select pg_temp.stash('sh_doc_tainted', format(
  $$ select sh.id::text from public.object_shares sh
      where sh.created_by_assignment_of = %L and sh.object_type = 'document' and sh.revoked_at is null $$,
  current_setting('t.t_tainted')));
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.unassign_task(%L, array[%L::uuid])) ->> 'shares_kept' $$,
  current_setting('t.t_tainted'), current_setting('t.sh_doc_tainted'))),
  '1',
  'a coordinator unassigns Lena and KEEPS the power-of-attorney share by id (AC-TASK-7: "unless a coordinator explicitly keeps it")');

select is(pg_temp.scalar(format(
  $$ select string_agg(sh.object_type::text || ':' || (sh.revoked_at is null)::text, ',' order by sh.object_type)
       from public.object_shares sh where sh.created_by_assignment_of = %L $$,
  current_setting('t.t_tainted'))),
  'document:true,task:false',
  'SHR-02 THE OTHER WAY: the kept share survives LIVE and still names the assignment it came from; the task share is revoked');

select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select (select count(*) from public.tasks where id = %L)::text || '/' ||
            (select count(*) from public.documents where id = %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.d_legal'))),
  '0/1',
  'from Lena''s live context: the task is gone on her NEXT query and the kept document is still there — revocation is live, and a kept share is a real one: the POA reaches her through the kept share and nothing else (R3/F-2)');

select is(pg_temp.scalar(format(
  $$ select (l.detail ->> 'former_owner_name') || '/' || (l.detail ->> 'shares_revoked') || '/'
            || (l.detail ->> 'shares_kept') || '/' || (l.detail ->> 'instructions_closed')
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'task_unassigned' and l.object_id = %L $$,
  current_setting('t.c1'), current_setting('t.t_tainted'))),
  'Lena/1/1/0',
  'the task_unassigned entry labels who held it and counts what was revoked, kept and closed (PRD §8.8''s shape, carried to member unassignment)');

-- ----------------------------------------------------------------------------
-- 42–44 · Keeping is a COORDINATOR's decision, and the keep list is exact.
-- ----------------------------------------------------------------------------
select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_sched2') || '+document:' || current_setting('t.d_legal'), 'tok_s2b');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' $$,
  current_setting('t.t_sched2'), current_setting('t.m_lena'), current_setting('t.d_legal'),
  current_setting('t.tok_s2b'))),
  'share',
  'fixture: the parking-permit task assigned to Lena with the POA named (she holds no schedule, so it is a crossing); the POA''s share is the KEPT one from the case above, so only the task share is new');

select pg_temp.stash('sh_task_sched2', format(
  $$ select sh.id::text from public.object_shares sh
      where sh.created_by_assignment_of = %L and sh.object_type = 'task' and sh.revoked_at is null $$,
  current_setting('t.t_sched2')));
select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.unassign_task(%L, array[%L::uuid])::text $$,
  current_setting('t.t_sched2'), current_setting('t.sh_task_sched2'))),
  'ERROR:P0001:unassign_refused',
  'Dan holds manage on the task and is not a coordinator: a keep list from him refuses WHOLE — keeping a share past its assignment is a coordinator''s explicit decision');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.unassign_task(%L, array[%L::uuid])::text $$,
  current_setting('t.t_sched2'), current_setting('t.sh_foreign'))),
  'ERROR:P0001:unassign_refused',
  'a keep id that is not THIS assignment''s live share (the foreign bank-statement share) refuses whole — the remove_member precedent: an explicit decision, never a guess');

-- ----------------------------------------------------------------------------
-- 45–48 · Refusal shapes: no holder · a done task · nonexistent · below manage.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select (hc.unassign_task(%L)) ->> 'shares_revoked' $$,
  current_setting('t.t_sched2'))),
  '1',
  'a manage-holder who is not a coordinator CAN unassign without a keep list — this assignment''s one share (the task''s) revoked; the POA''s kept share belongs to the OTHER assignment and is not touched');

select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.unassign_task(%L)::text $$, current_setting('t.t_sched2'))),
  'ERROR:P0001:unassign_refused',
  'unassigning a task nobody holds refuses');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_done'), current_setting('t.m_marisol')))
  || '/' || pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(gen_random_uuid(), %L)::text $$, current_setting('t.m_marisol'))),
  'ERROR:P0001:assign_refused/ERROR:P0001:assign_refused',
  'a DONE task is not assignable (completed work stays attributed, §4.5.3), and a nonexistent task lands in the same one shape (DEF-10) — two calls joined OUTSIDE the statement, so each half must refuse on its own (R3/F-4: inside one statement the first raise ended evaluation and either half satisfied the string)');

select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_sched2'), current_setting('t.m_marisol'))),
  'ERROR:P0001:assign_refused',
  'a member at summary cannot assign — manage on the task is the bar (PRD §7.3: manage can assign; view "cannot change others'' items")');

-- ----------------------------------------------------------------------------
-- 49 · The slice trap: hc.revise_object's task allowlist is NOT widened.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"status":"done"}'::jsonb)::text $$,
  current_setting('t.t_plain')))
  || '/' || pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.revise_object('task', %L, jsonb_build_object('owner_member_id', %L))::text $$,
  current_setting('t.t_plain'), current_setting('t.m_ruth'))),
  'ERROR:P0001:revise_invalid_field/ERROR:P0001:revise_invalid_field',
  'status and owner_member_id stay unaddressable through the generic patch — the allowlist is title, detail, due_on, due_zone and nothing this migration adds');

-- ----------------------------------------------------------------------------
-- 50 · Same holder: a quiet no-op (the set_grant precedent).
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
-- 51–52 · Freeze: assignment refuses with the NAMED signature; unassignment
--         by a live coordinator is permitted (it reduces reach — the
--         remove_member precedent, set_grant's lower arm).
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

-- ----------------------------------------------------------------------------
-- 53–60 · ADR-0033 cluster B (R1/F-2, R2/F-1, R3/F-2, R6/F-2): a share a
--         coordinator KEPT survives the task's LATER assignment cycles.
--         `created_by_assignment_of` names the TASK, not the cycle, so both
--         revoke loops key on the FORMER HOLDER as well (R1's remedy, ruled
--         at D19): "this assignment's shares" = this task's marker AND held
--         by the person being unassigned. Lena's kept POA share (38) still
--         carries t_tainted's marker; Ruth's and Dan's cycles on the SAME
--         task must not reach it (55–58), and her own next cycle still ends
--         it (60).
--         The world here: the freeze from 51–52 is still open and assignment
--         refuses under it (51), so it is removed first. Nothing else moves.
-- ----------------------------------------------------------------------------
delete from public.freezes where circle_id = current_setting('t.c1')::uuid;

select is(pg_temp.scalar(format(
  $$ select (sh.revoked_at is null)::text || '/' || (sh.created_by_assignment_of = %L)::text || '/'
            || (select (t.owner_member_id is null)::text from public.tasks t where t.id = %L)
       from public.object_shares sh where sh.id = %L $$,
  current_setting('t.t_tainted'), current_setting('t.t_tainted'), current_setting('t.sh_doc_tainted'))),
  'true/true/true',
  'the world after 52: Lena''s kept POA share is live, still carries t_tainted''s marker, and nobody holds the task');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L)) ->> 'path' $$,
  current_setting('t.t_tainted'), current_setting('t.m_ruth'))),
  'plain',
  'CYCLE 2: Sarah assigns the same task to Ruth, PLAIN — she clears {schedule,health} at summary, no path, no new share');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (r ->> 'former_owner_name') || '/' || (r ->> 'shares_revoked')
       from (select hc.unassign_task(%L) r) u $$,
  current_setting('t.t_tainted')))
  || '/' || pg_temp.scalar(format(
  $$ select (sh.revoked_at is null)::text from public.object_shares sh where sh.id = %L $$,
  current_setting('t.sh_doc_tainted'))),
  'Ruth/0/true',
  'UNASSIGN, cycle 2, no keep list: Ruth is the former holder, NOTHING is revoked, and Lena''s kept share is still live — the loop is keyed on the holder, not on the task''s marker alone (R1/F-2, R2/F-1, R6/F-2)');

select pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_tainted'), current_setting('t.m_ruth')));
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (r ->> 'former_member_id' = %L)::text || '/' || (r ->> 'shares_revoked')
       from (select hc.assign_task(%L, %L) r) a $$,
  current_setting('t.m_ruth'), current_setting('t.t_tainted'), current_setting('t.m_dan')))
  || '/' || pg_temp.scalar(format(
  $$ select (sh.revoked_at is null)::text from public.object_shares sh where sh.id = %L $$,
  current_setting('t.sh_doc_tainted'))),
  'true/0/true',
  'REASSIGN, cycle 3: Ruth to Dan in one transaction — the former holder is Ruth (assign_task returns former_member_id), NOTHING is revoked, and Lena''s kept share is still live: the reassign loop has no keep list and, keyed on the holder, never needed one');

select is(pg_temp.scalar(format(
  $$ select (select count(*)::text from public.access_log l
              where l.circle_id = %L and l.event_type = 'object_share_revoked'
                and l.target_member_id = %L and l.object_id = %L)
            || '/' ||
            (select count(*)::text from public.access_log l
              where l.circle_id = %L and l.event_type = 'task_reassigned'
                and l.object_id = %L and l.detail ->> 'former_owner_name' = 'Ruth') $$,
  current_setting('t.c1'), current_setting('t.m_lena'), current_setting('t.d_legal'),
  current_setting('t.c1'), current_setting('t.t_tainted')))
  || '/' || pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.d_legal'))),
  '0/1/1',
  'the log never says Lena lost the POA (no object_share_revoked names her on it), the one task_reassigned entry names Ruth, and from Lena''s live context the POA is still there — a row only the kept share can show her');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (r ->> 'former_owner_name') || '/' || (r ->> 'shares_revoked')
       from (select hc.unassign_task(%L) r) u $$,
  current_setting('t.t_tainted')))
  || '/' || pg_temp.scalar(format(
  $$ select (sh.revoked_at is null)::text from public.object_shares sh where sh.id = %L $$,
  current_setting('t.sh_doc_tainted'))),
  'Dan/0/true',
  'UNASSIGN, cycle 3 ends: Dan is the former holder, nothing revoked, the kept share still live — three cycles of the same task later, the coordinator''s decision at 38 stands');

select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_tainted') || '+document:' || current_setting('t.d_legal'), 'tok_pair2');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' $$,
  current_setting('t.t_tainted'), current_setting('t.m_lena'), current_setting('t.d_legal'),
  current_setting('t.tok_pair2')))
  || '/' || pg_temp.scalar(format(
  $$ select count(*)::text from public.object_shares sh
      where sh.created_by_assignment_of = %L and sh.member_id = %L and sh.revoked_at is null $$,
  current_setting('t.t_tainted'), current_setting('t.m_lena'))),
  'share/2',
  'CYCLE 4, Lena herself again by path 2 naming the POA: the kept share is live, so only the task share is new — two live shares of hers now carry this task''s marker');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (r ->> 'former_member_id' = %L)::text || '/' || (r ->> 'shares_revoked')
       from (select hc.assign_task(%L, %L) r) a $$,
  current_setting('t.m_lena'), current_setting('t.t_tainted'), current_setting('t.m_ruth')))
  || '/' || pg_temp.scalar(format(
  $$ select (sh.revoked_at is null)::text from public.object_shares sh where sh.id = %L $$,
  current_setting('t.sh_doc_tainted')))
  || '/' || pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select count(*)::text from public.documents where id = %L $$,
  current_setting('t.d_legal'))),
  'true/2/false/0',
  'the CONTROL, and the remedy''s consequence: reassigning Lena to Ruth revokes BOTH of Lena''s shares — the new task share and the POA share kept at 38 — because keying on the holder makes a kept share HERS, and her own next cycle on the same task ends with it (R1''s remedy as ruled at D19; R6''s marker-clearing would have left it). The POA is gone from her live context');

-- ----------------------------------------------------------------------------
-- 61–75 · ADR-0033 cluster C — the guards, and "the ORIGINAL is the work".
--         R2/F-4 + R6/F-6: an instruction row is refused as p_task by both
--         assign_task and unassign_task. D19.4 (R1/F-4, R2/F-5): completing
--         an original cancels its open instructions; completing an
--         instruction completes the original with the instruction's actor.
--         D19.6 (R2/F-7): completion revokes the assignment's shares.
--         D19.2 (R6/F-5, R2/F-10): revoke_share refuses a share a LIVE
--         assignment created; a kept one is an ordinary share again.
--         R2/F-8: assign_task closes the original's open instructions
--         unconditionally, so remove_member's orphan is closed by the next
--         assignment. R3/F-5 (test only): the post-condition's second arm
--         and the assignee shapes.
--         The world here: t_tainted is Ruth's (60); t_plain, t_sched2 and
--         t_fin are nobody's; every share of Lena's but the foreign one is
--         revoked; no freeze.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, 'Collect the dressing kit from the pharmacy before Friday')) ->> 'path' $$,
  current_setting('t.t_tainted'), current_setting('t.m_marisol'))),
  'instruction',
  'fixture for the guards: the tainted task goes from Ruth to Marisol by PATH 1 — she cannot clear {health}, so it is a crossing and a reassign — and the instruction row is what she reads');
select pg_temp.stash('i_tainted', format(
  $$ select i.id::text from public.tasks i where i.written_from_task_id = %L and i.status = 'open' $$,
  current_setting('t.t_tainted')));

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.i_tainted'), current_setting('t.m_dan'))),
  'ERROR:P0001:assign_refused',
  'an INSTRUCTION is not assignable onward (R2/F-4, R6/F-6): "the assignment is a fact on the original; the instruction is what she reads" — one shape, and nothing moves');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.unassign_task(%L)::text $$, current_setting('t.i_tainted')))
  || '/' || pg_temp.scalar(format(
  $$ select (select (i.owner_member_id = %L and i.status = 'open')::text from public.tasks i where i.id = %L)
            || '/' || (select (t.owner_member_id = %L)::text from public.tasks t where t.id = %L) $$,
  current_setting('t.m_marisol'), current_setting('t.i_tainted'),
  current_setting('t.m_marisol'), current_setting('t.t_tainted'))),
  'ERROR:P0001:unassign_refused/true/true',
  'and not unassignable by itself either — the instruction still names Marisol, still open, and she still holds the original: the instruction''s lifecycle is the original''s (unassign 41, reassign 31, and now completion)');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (r ->> 'status') || '/' || (r ->> 'instructions_closed')
       from (select hc.complete_task(%L) r) c $$,
  current_setting('t.t_tainted')))
  || '/' || pg_temp.scalar(format(
  $$ select i.status from public.tasks i where i.id = %L $$, current_setting('t.i_tainted'))),
  'done/1/cancelled',
  'D19.4, THE ORIGINAL IS THE WORK: Sarah completes the original — its open instruction is CANCELLED the way unassign closes it, never left open in Marisol''s list (R1/F-4, R2/F-5)');

select pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, 'Pay the July invoice at the clinic desk')::text $$,
  current_setting('t.t_fin'), current_setting('t.m_marisol')));
select pg_temp.stash('i_fin', format(
  $$ select i.id::text from public.tasks i where i.written_from_task_id = %L and i.status = 'open' $$,
  current_setting('t.t_fin')));
select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select (r ->> 'status') || '/' || (r ->> 'original_task_id' = %L)::text
       from (select hc.complete_task(%L) r) c $$,
  current_setting('t.t_fin'), current_setting('t.i_fin')))
  || '/' || pg_temp.scalar(format(
  $$ select t.status || '/' || (t.completed_by = %L)::text from public.tasks t where t.id = %L $$,
  current_setting('t.u_marisol'), current_setting('t.t_fin'))),
  'done/true/done/true',
  'and the other direction: Marisol completes her INSTRUCTION at summary — the ORIGINAL is completed with HER as its actor, and the return names it');

select is(pg_temp.scalar(format(
  $$ select count(*) filter (where l.object_id = %L)::text || '/' ||
            count(*) filter (where l.object_id = %L)::text || '/' ||
            (select (l2.detail ->> 'via_instruction_task_id' = %L)::text from public.access_log l2
              where l2.circle_id = %L and l2.event_type = 'task_completed' and l2.object_id = %L)
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'task_completed' and l.object_id in (%L, %L) $$,
  current_setting('t.t_fin'), current_setting('t.i_fin'),
  current_setting('t.i_fin'), current_setting('t.c1'), current_setting('t.t_fin'),
  current_setting('t.c1'), current_setting('t.t_fin'), current_setting('t.i_fin'))),
  '1/1/true',
  'two task_completed entries — the instruction''s and the original''s — and the original''s says which instruction completed it');

select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_sched2') || '+document:' || current_setting('t.d_legal'), 'tok_c3');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' $$,
  current_setting('t.t_sched2'), current_setting('t.m_lena'), current_setting('t.d_legal'),
  current_setting('t.tok_c3')))
  || '/' || pg_temp.scalar(format(
  $$ select count(*)::text from public.object_shares sh
      where sh.created_by_assignment_of = %L and sh.member_id = %L and sh.revoked_at is null $$,
  current_setting('t.t_sched2'), current_setting('t.m_lena'))),
  'share/2',
  'fixture: the parking permit goes to Lena by path 2 naming the POA — both shares created afresh (her earlier ones ended at 60)');
select pg_temp.stash('sh_task_c3', format(
  $$ select sh.id::text from public.object_shares sh
      where sh.created_by_assignment_of = %L and sh.object_type = 'task' and sh.revoked_at is null $$,
  current_setting('t.t_sched2')));

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.revoke_share(%L)::text $$, current_setting('t.sh_task_c3')))
  || '/' || pg_temp.scalar(format(
  $$ select (sh.revoked_at is null)::text from public.object_shares sh where sh.id = %L $$,
  current_setting('t.sh_task_c3'))),
  'ERROR:P0001:revoke_refused/true',
  'D19.2: a share a LIVE assignment created is not revocable on its own — withdrawing it would leave Lena holding a task she cannot see, and the post-condition is a standing invariant, not a moment (R6/F-5, R2/F-10); withdrawal goes through unassign_task. The share stands');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (r ->> 'status') || '/' || (r ->> 'shares_revoked')
       from (select hc.complete_task(%L) r) c $$,
  current_setting('t.t_sched2')))
  || '/' || pg_temp.scalar(format(
  $$ select (select count(*)::text from public.object_shares sh
              where sh.created_by_assignment_of = %L and sh.revoked_at is null)
            || '/' ||
            (select count(*)::text from public.access_log l
              where l.circle_id = %L and l.event_type = 'object_share_revoked'
                and l.target_member_id = %L and l.detail ->> 'assignment_of' = %L
                and l.detail ->> 'completed' = 'true') $$,
  current_setting('t.t_sched2'), current_setting('t.c1'), current_setting('t.m_lena'),
  current_setting('t.t_sched2'))),
  'done/2/0/2',
  'D19.6: completion REVOKES the assignment''s shares — the assignment is over, so its grants end with it (R2/F-7): both of Lena''s shares revoked and logged with the assignment they came from');

select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_plain') || '+document:' || current_setting('t.d_legal'), 'tok_c4');
select pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, null, %L, %L)::text $$,
  current_setting('t.t_plain'), current_setting('t.m_lena'), current_setting('t.d_legal'),
  current_setting('t.tok_c4')));
select pg_temp.stash('sh_doc_c4', format(
  $$ select sh.id::text from public.object_shares sh
      where sh.created_by_assignment_of = %L and sh.object_type = 'document' and sh.revoked_at is null $$,
  current_setting('t.t_plain')));
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.unassign_task(%L, array[%L::uuid])) ->> 'shares_kept' $$,
  current_setting('t.t_plain'), current_setting('t.sh_doc_c4'))),
  '1',
  'fixture: the pharmacy call goes to Lena by path 2 naming the POA, and Sarah unassigns her KEEPING the POA share');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select ((hc.revoke_share(%L)) ->> 'member_id' = %L)::text $$,
  current_setting('t.sh_doc_c4'), current_setting('t.m_lena')))
  || '/' || pg_temp.scalar(format(
  $$ select (sh.revoked_at is not null)::text from public.object_shares sh where sh.id = %L $$,
  current_setting('t.sh_doc_c4'))),
  'true/true',
  'a KEPT share is an ordinary share again — its assignment is over — so "revocable in one action" (§4.3.5) still holds for it');

-- R2/F-8: the orphan remove_member leaves. A fresh tainted task, an
-- instruction for Marisol, then remove_member's effect by hand under replica
-- (round9_fixes:484-497 clears the holder of every open task and closes
-- nothing).
set session_replication_role = replica;
do $$
declare t_c uuid := gen_random_uuid();
begin
  insert into public.tasks (id, circle_id, subject_id, title, status,
    approved_by, approved_at, approver_display_name, taint)
  values (t_c, current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
          'Ask Dr Okafor about the new dressing', 'open',
          current_setting('t.u_sarah')::uuid, now(), 'Sarah', '{schedule,health}');
  perform set_config('t.t_c', t_c::text, true);
end $$;
set session_replication_role = default;
select pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, 'Ask Dr Okafor about the new dressing at the Tuesday visit')::text $$,
  current_setting('t.t_c'), current_setting('t.m_marisol')));
select pg_temp.stash('i_c', format(
  $$ select i.id::text from public.tasks i where i.written_from_task_id = %L and i.status = 'open' $$,
  current_setting('t.t_c')));
set session_replication_role = replica;
update public.tasks set owner_member_id = null, assigned_by = null, assigned_at = null
 where id = current_setting('t.t_c')::uuid;
set session_replication_role = default;
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (r ->> 'path') || '/' || (r ->> 'instructions_closed')
       from (select hc.assign_task(%L, %L) r) a $$,
  current_setting('t.t_c'), current_setting('t.m_ruth')))
  || '/' || pg_temp.scalar(format(
  $$ select i.status from public.tasks i where i.id = %L $$, current_setting('t.i_c'))),
  'plain/1/cancelled',
  'R2/F-8: the orphan remove_member leaves — original unowned, instruction open — is CLOSED by the next assignment of the original, whoever the former holder was: closure is keyed on written_from_task_id, not on a former holder');

-- R3/F-5: the post-condition's SECOND arm (unresolved lineage) and the
-- assignee shapes. Fixture rows under replica.
set session_replication_role = replica;
do $$
declare t_u uuid := gen_random_uuid(); m_subject uuid; u_gone uuid := pg_temp.mk_user(gen_random_uuid()); m_gone uuid;
begin
  insert into public.tasks (id, circle_id, subject_id, title, status,
    approved_by, approved_at, approver_display_name, taint, taint_resolved)
  values (t_u, current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
          'Review the second opinion', 'open',
          current_setting('t.u_sarah')::uuid, now(), 'Sarah', '{schedule,health}', false);
  insert into public.circle_members (circle_id, subject_id, custodian_member_id, tier, display_name_at_join)
  values (current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
          current_setting('t.m_sarah')::uuid, 'coordinator', 'Nell')
  returning id into m_subject;
  insert into public.accounts (id, kind, display_name) values (u_gone, 'member', 'Gone');
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join, removed_at, removed_by)
  values (current_setting('t.c1')::uuid, u_gone, 'family', 'Gone', now(), current_setting('t.u_sarah')::uuid)
  returning id into m_gone;
  perform set_config('t.t_u', t_u::text, true);
  perform set_config('t.m_subject', m_subject::text, true);
  perform set_config('t.m_gone', m_gone::text, true);
end $$;
set session_replication_role = default;
select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_u') || '+document:' || current_setting('t.d_legal'), 'tok_u');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, null, %L, %L)::text $$,
  current_setting('t.t_u'), current_setting('t.m_lena'), current_setting('t.d_legal'),
  current_setting('t.tok_u'))),
  'ERROR:P0001:assign_refused',
  'R3/F-5, the post-condition''s SECOND arm: a task whose lineage is UNRESOLVED is hidden by rung 3 from everyone below manage×5 — a share cannot show it, so path 2 refuses whole');

select is(pg_temp.scalar(format(
  $$ select (select (s.consumed_at is null)::text from public.step_up_tokens s
              where s.token_hash = extensions.digest(%L, 'sha256'))
            || '/' ||
            (select count(*)::text from public.object_shares sh where sh.created_by_assignment_of = %L)
            || '/' ||
            (select (t.owner_member_id is null)::text from public.tasks t where t.id = %L) $$,
  current_setting('t.tok_u'), current_setting('t.t_u'), current_setting('t.t_u'))),
  'true/0/true',
  'and the refusal rolled everything back: the token is NOT consumed, no share was written, nobody holds it');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_plain'), current_setting('t.m_subject')))
  || '/' || pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_plain'), current_setting('t.m_gone'))),
  'ERROR:P0001:assign_refused/ERROR:P0001:assign_refused',
  'R3/F-5, the assignee shapes: a subject-member row (nobody to do the work) and a REMOVED member are refused in the one shape — two separate calls, joined outside the statement (069:14''s shape)');

-- ----------------------------------------------------------------------------
-- 76–77 · ADR-0033 cluster E (R1/F-6, R2/F-3): the freeze is named to
--         MEMBERS. A freeze is opened (the one from 51–52 went at 53). A
--         STRANGER — an account with no membership anywhere — and the
--         REMOVED member from 75 meet one shape whether the task exists or
--         not; a live member still meets the named signature.
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
do $$
declare u uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u, 'member', 'Stranger');
  perform set_config('t.u_stranger', u::text, true);
  perform set_config('t.u_gone', (select m.account_id::text from public.circle_members m
                                    where m.id = current_setting('t.m_gone')::uuid), true);
end $$;
set session_replication_role = default;
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;
select is(pg_temp.call_as(current_setting('t.u_stranger')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_plain'), current_setting('t.m_ruth')))
  || '/' || pg_temp.call_as(current_setting('t.u_gone')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_plain'), current_setting('t.m_ruth')))
  || '/' || pg_temp.call_as(current_setting('t.u_stranger')::uuid, format(
  $$ select hc.assign_task(gen_random_uuid(), %L)::text $$,
  current_setting('t.m_ruth'))),
  'ERROR:P0001:assign_refused/ERROR:P0001:assign_refused/ERROR:P0001:assign_refused',
  'under a freeze a STRANGER and a REMOVED member assigning an existing task, and the stranger a nonexistent one, meet ONE shape — before, the existing task answered freeze_active and told an outsider that the task exists and the circle is frozen; the named signature is for members (PRD §7.5). Three calls, joined outside the statement');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L)::text $$,
  current_setting('t.t_plain'), current_setting('t.m_ruth'))),
  'ERROR:P0001:freeze_active',
  'and a live member still meets the NAMED freeze_active — the order moved, the signature did not (51 again, with the membership check in front of it)');

-- ----------------------------------------------------------------------------
-- 78–81 · ADR-0033 cluster D (D19.1 — R1/F-5, R6's Q-F): the objected-to
--         member is NOT "a live coordinator" during their own freeze. The
--         open freeze from 76 is adjudicated UNRESOLVED by hand, naming
--         Priya — a second live coordinator — as the objected-to member.
--         t_c is Ruth's (72); the foreign bank-statement share is Lena's.
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
update public.freezes
   set state = 'unresolved', adjudicated_at = now(),
       adjudicated_by = current_setting('t.u_sarah')::uuid,
       objected_to_member_id = (select m.id from public.circle_members m
                                 where m.circle_id = current_setting('t.c1')::uuid
                                   and m.account_id = current_setting('t.u_priya')::uuid)
 where circle_id = current_setting('t.c1')::uuid and state = 'open';
set session_replication_role = default;

select is(pg_temp.call_as(current_setting('t.u_priya')::uuid, format(
  $$ select hc.unassign_task(%L)::text $$, current_setting('t.t_c'))),
  'ERROR:P0001:unassign_refused',
  'the objected-to coordinator may NOT unassign under the finding that names her — "all interactive access suspended" (PRD §7.5) includes reduction; before, she walked through the live-coordinator door the freeze leaves open (R1/F-5, Q-F)');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.unassign_task(%L)) ->> 'former_owner_name' $$, current_setting('t.t_c'))),
  'Ruth',
  'and a coordinator the finding does NOT name still reduces under it — the remove_member precedent stands for everyone but the objected-to member');

select is(pg_temp.call_as(current_setting('t.u_priya')::uuid, format(
  $$ select hc.revoke_share(%L)::text $$, current_setting('t.sh_foreign'))),
  'ERROR:P0001:revoke_refused',
  'the same door in revoke_share: the objected-to coordinator may not revoke a share under her own finding');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select ((hc.revoke_share(%L)) ->> 'member_id' = %L)::text $$,
  current_setting('t.sh_foreign'), current_setting('t.m_lena'))),
  'true',
  'and Sarah, not named, still may — revocation reduces reach and a freeze never blocks reduction for anyone the finding does not name');

-- ----------------------------------------------------------------------------
-- 82–84 · ADR-0033 cluster G (D19.7 — R3/F-1, R6/F-4): "context on the
--         subject" is AT LEAST ONE DELIBERATE log-or-higher GRANT. Omar
--         holds grants on MARCUS only; on Nell his ctx entry is the one
--         grant_vectors manufactures for every live member — four empty
--         arrays — and the old gate (is the key null?) never fired for him
--         or for anyone. The freeze is removed first.
-- ----------------------------------------------------------------------------
delete from public.freezes where circle_id = current_setting('t.c1')::uuid;
select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_plain') || '+document:' || current_setting('t.d_legal'), 'tok_g');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.assign_task(%L, %L, null, %L, %L)::text $$,
  current_setting('t.t_plain'), current_setting('t.m_omar'), current_setting('t.d_legal'),
  current_setting('t.tok_g'))),
  'ERROR:P0001:assign_refused',
  'PATH 2 to a member with NO deliberate grant on Nell REFUSES — §4.5.5 "not offered": before, rung 5 lifted the two named objects to view for a member hidden on every domain, the post-condition passed, and a person the PRD says is not offered held the task and the document (R3/F-1 probe A6, R6/F-4)');

select is(pg_temp.scalar(format(
  $$ select (select (s.consumed_at is null)::text from public.step_up_tokens s
              where s.token_hash = extensions.digest(%L, 'sha256'))
            || '/' ||
            (select count(*)::text from public.object_shares sh
              where sh.created_by_assignment_of = %L and sh.member_id = %L)
            || '/' ||
            (select (t.owner_member_id is null)::text from public.tasks t where t.id = %L) $$,
  current_setting('t.tok_g'), current_setting('t.t_plain'), current_setting('t.m_omar'),
  current_setting('t.t_plain')))
  || '/' || pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(e.v, ',' order by e.k)
       from hc.circle_people(%L) p, jsonb_each_text(p.levels -> %L) e(k, v)
      where p.member_id = %L $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.m_omar'))),
  'true/0/true/hidden,hidden,hidden,hidden,hidden',
  'nothing was written — the token stands, no share, nobody holds it — and the People list (hc.circle_people: hidden ×5 for Omar on Nell) and the database now AGREE, which is what ADR-0032 D1 promised');

set session_replication_role = replica;
insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
values (current_setting('t.c1')::uuid, current_setting('t.m_omar')::uuid, current_setting('t.s1')::uuid,
        'memories', 'log', current_setting('t.u_sarah')::uuid);
set session_replication_role = default;
select pg_temp.mint(current_setting('t.u_sarah')::uuid, 'share_object',
  'task:' || current_setting('t.t_plain') || '+document:' || current_setting('t.d_legal'), 'tok_g2');
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.assign_task(%L, %L, null, %L, %L)) ->> 'path' $$,
  current_setting('t.t_plain'), current_setting('t.m_omar'), current_setting('t.d_legal'),
  current_setting('t.tok_g2'))),
  'share',
  'ONE deliberate grant at log — memories, the lowest rung that is a grant — IS context: the same assignment now goes through by path 2. The share is still what shows him the task; the grant is what makes him someone the subject''s circle chose to tell anything at all');

-- ----------------------------------------------------------------------------
-- 85 · R3/F-3 (test only): unassign_task's MANAGE bar has its negatives.
--      Omar holds the pharmacy call through a share (84) — a holder at view;
--      Ruth holds summary on schedule. Neither may unassign; before, nothing
--      in the suite would have gone red had the bar dropped to summary.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_omar')::uuid, format(
  $$ select hc.unassign_task(%L)::text $$, current_setting('t.t_plain')))
  || '/' || pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select hc.unassign_task(%L)::text $$, current_setting('t.t_plain')))
  || '/' || pg_temp.scalar(format(
  $$ select (t.owner_member_id = %L)::text from public.tasks t where t.id = %L $$,
  current_setting('t.m_omar'), current_setting('t.t_plain'))),
  'ERROR:P0001:unassign_refused/ERROR:P0001:unassign_refused/true',
  'the HOLDER at view and a sibling at summary are both refused — manage on the task is the bar for unassignment too (PRD §7.3: view "cannot change others'' items", and reducing is still changing); Omar still holds it (R3/F-3)');

select * from finish();
rollback;
