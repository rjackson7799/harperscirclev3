-- ============================================================================
-- 7A · M2 — task lifecycle: hc.complete_task · hc.snooze_task (PRD §4.5.1,
-- §4.5.3, §4.5.4, §4.6.4, §7.3; AC-TASK-1's second half, AC-TASK-2).
-- Pinned here BEFORE the migration exists.
--
-- THE CONTRACT THESE CASES PIN.
--   · complete_task: the HOLDER closes the work she was handed, or a
--     manage-holder closes it for her. PRD §7.3 names `view` ("can complete
--     work assigned to them"); the holder's bar here is that she can SEE the
--     task as its holder (>= summary) — because the care-circle ceiling is
--     `summary` and a caregiver's whole slice is "her assigned tasks", so a
--     `view` bar would make every task handed to a caregiver, and every
--     path-1 instruction, one she could read and never close. Argued in the
--     migration header; put to round 24 as a pointed question.
--   · A non-holder below manage is refused, whatever her level (§7.3 view:
--     "cannot change others' items").
--   · status = done, completed_by/at written; the holder stays attributed;
--     a done task is never deleted and stays readable (§4.5.3, §4.6.4);
--     completing it again is refused.
--   · snooze_task moves the date FORWARD, increments snooze_count, and
--     writes a record_revisions row naming the actor (§4.5.4: "by whom and
--     how many times"). An earlier date is an edit, not a snooze, and is
--     refused; a task with no date cannot be snoozed; the due pair travels
--     together (23514 never reaches a person).
--   · Both refuse under a freeze with the NAMED freeze_active (a freeze
--     suspends ALL interactive access, §3.8).
--   · The AI role holds no EXECUTE — catalog-based.
--   · hc.revise_object's task allowlist is NOT widened: status,
--     snooze_count and completed_at stay unaddressable through the patch.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(32);

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
-- Fixtures: circle c1 · subject s1 (Nell).
--   Sarah    coordinator, manage×5 (the approver of every fixture task)
--   Dan      family — manage on schedule + health (a non-holder at manage)
--   Lena     family — VIEW on schedule + health (a holder at view)
--   Ruth     family — summary on schedule + health (a non-holder at summary)
--   Marisol  care_circle — schedule summary (a holder at summary, the ceiling)
-- Tasks: t_lena {schedule,health} held by Lena, due 2026-09-04 ·
-- t_mar {schedule} held by Marisol, due 2026-09-10 · t_unowned {schedule},
-- nobody, no date · t_dan {schedule}, nobody, due 2026-09-02 ·
-- t_nodue {schedule} held by Lena, no date.
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
do $fx$
declare
  u_sarah   uuid := pg_temp.mk_user(gen_random_uuid());
  u_dan     uuid := pg_temp.mk_user(gen_random_uuid());
  u_lena    uuid := pg_temp.mk_user(gen_random_uuid());
  u_ruth    uuid := pg_temp.mk_user(gen_random_uuid());
  u_marisol uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid;
  m_sarah uuid; m_dan uuid; m_lena uuid; m_ruth uuid; m_marisol uuid;
  t_lena uuid := gen_random_uuid(); t_mar uuid := gen_random_uuid();
  t_unowned uuid := gen_random_uuid(); t_dan uuid := gen_random_uuid();
  t_nodue uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u_sarah, 'member', 'Sarah'), (u_dan, 'member', 'Dan'),
    (u_lena, 'member', 'Lena'), (u_ruth, 'member', 'Ruth'),
    (u_marisol, 'member', 'Marisol');
  insert into public.circles (name, created_by) values ('Nell''s circle', u_sarah)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'tl1-' || substr(c1::text, 1, 8)) returning id into s1;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_sarah, 'coordinator', 'Sarah') returning id into m_sarah;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_dan, 'family', 'Dan') returning id into m_dan;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_lena, 'family', 'Lena') returning id into m_lena;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_ruth, 'family', 'Ruth') returning id into m_ruth;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_marisol, 'care_circle', 'Marisol') returning id into m_marisol;

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_sarah, s1, d::hc.domain, 'manage', u_sarah);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_dan,     s1, 'schedule', 'manage',  u_sarah),
         (c1, m_dan,     s1, 'health',   'manage',  u_sarah),
         (c1, m_lena,    s1, 'schedule', 'view',    u_sarah),
         (c1, m_lena,    s1, 'health',   'view',    u_sarah),
         (c1, m_ruth,    s1, 'schedule', 'summary', u_sarah),
         (c1, m_ruth,    s1, 'health',   'summary', u_sarah),
         (c1, m_marisol, s1, 'schedule', 'summary', u_sarah);

  insert into public.tasks (id, circle_id, subject_id, title, due_on, due_zone,
    owner_member_id, assigned_by, assigned_at, status,
    approved_by, approved_at, approver_display_name, taint)
  values
    (t_lena,    c1, s1, 'Follow the discharge instructions', '2026-09-04', 'America/New_York',
     m_lena, u_sarah, now(), 'open', u_sarah, now(), 'Sarah', '{schedule,health}'),
    (t_mar,     c1, s1, 'Pick up the new prescription', '2026-09-10', 'America/New_York',
     m_marisol, u_sarah, now(), 'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_unowned, c1, s1, 'Call the pharmacy', null, null,
     null, null, null, 'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_dan,     c1, s1, 'Renew the parking permit', '2026-09-02', 'America/New_York',
     null, null, null, 'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_nodue,   c1, s1, 'Ask about the physio referral', null, null,
     m_lena, u_sarah, now(), 'open', u_sarah, now(), 'Sarah', '{schedule}');

  perform set_config('t.u_sarah', u_sarah::text, true);
  perform set_config('t.u_dan', u_dan::text, true);
  perform set_config('t.u_lena', u_lena::text, true);
  perform set_config('t.u_ruth', u_ruth::text, true);
  perform set_config('t.u_marisol', u_marisol::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.m_lena', m_lena::text, true);
  perform set_config('t.m_marisol', m_marisol::text, true);
  perform set_config('t.t_lena', t_lena::text, true);
  perform set_config('t.t_mar', t_mar::text, true);
  perform set_config('t.t_unowned', t_unowned::text, true);
  perform set_config('t.t_dan', t_dan::text, true);
  perform set_config('t.t_nodue', t_nodue::text, true);
end $fx$;
set session_replication_role = default;

-- ----------------------------------------------------------------------------
-- 1–5 · Shape, privilege closure (catalog-based), the AI role, event types.
-- ----------------------------------------------------------------------------
select has_function('hc', 'complete_task', array['uuid'],
  'hc.complete_task(task) exists');
select has_function('hc', 'snooze_task', array['uuid', 'date', 'text'],
  'hc.snooze_task(task, due_on, due_zone) exists');

select ok(
  (select count(*) = 2 and bool_and(
        pg_get_userbyid(p.proowner) = 'hc_internal'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('hc_admin', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname in ('complete_task', 'snooze_task')),
  'both writers are definers owned by hc_internal, executable by authenticated and by no other request-path role — from the catalog');

select ok(
  (select count(*) = 2 and bool_and(not has_function_privilege('hc_pipeline', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname in ('complete_task', 'snooze_task')),
  'the AI role holds no EXECUTE on either — completing and snoozing are a person''s acts (AC-TASK-2)');

select is((select count(*)::int from hc.log_event_types
            where code in ('task_completed', 'task_snoozed')), 2,
  'task_completed and task_snoozed join the event vocabulary');

-- ----------------------------------------------------------------------------
-- 6–7 · A non-holder at summary is refused, both verbs.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select hc.complete_task(%L)::text $$, current_setting('t.t_lena'))),
  'ERROR:P0001:complete_refused',
  'Ruth reads the task at summary and does not hold it: completing it refuses (§7.3 — "cannot change others'' items")');

select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select hc.snooze_task(%L, '2026-09-11', 'America/New_York')::text $$,
  current_setting('t.t_lena'))),
  'ERROR:P0001:snooze_refused',
  'and snoozing it refuses in its own one shape');

-- ----------------------------------------------------------------------------
-- 8–12 · The holder at view completes; the row, the log, the second attempt,
--        and the completed task stays readable — it is never deleted.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select (hc.complete_task(%L)) ->> 'status' $$, current_setting('t.t_lena'))),
  'done',
  'the holder at view completes the work assigned to her (PRD §7.3)');

select is(pg_temp.scalar(format(
  $$ select (t.status = 'done' and t.completed_by = %L and t.completed_at is not null
             and t.owner_member_id = %L and t.deleted_at is null)::text
       from public.tasks t where t.id = %L $$,
  current_setting('t.u_lena'), current_setting('t.m_lena'), current_setting('t.t_lena'))),
  'true',
  'status done, completed_by and completed_at written, the holder still attributed, nothing deleted (§4.5.3)');

select is(pg_temp.scalar(format(
  $$ select l.actor_display_name || '/' || (l.target_member_id = %L)::text || '/' || (l.object_id = %L)::text
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'task_completed' $$,
  current_setting('t.m_lena'), current_setting('t.t_lena'), current_setting('t.c1'))),
  'Lena/true/true',
  'AC-TASK-2: the completion has a human actor in the log, naming the holder and the task');

select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select hc.complete_task(%L)::text $$, current_setting('t.t_lena'))),
  'ERROR:P0001:complete_refused',
  'completing a done task refuses — done is terminal, and the first completion keeps its attribution');

select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select count(*)::text || '/' || coalesce(max(t.status), 'NULL')
       from public.tasks t where t.id = %L $$, current_setting('t.t_lena'))),
  '1/done',
  'a completed task stays READABLE at summary — it is the evidence of a person''s contribution (§4.6.4), never removed from the record');

-- ----------------------------------------------------------------------------
-- 13–17 · The holder at summary — the caregiver — snoozes: the date moves,
--         the count increments, a revision row names the actor.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select (hc.snooze_task(%L, '2026-09-17', 'America/New_York')) ->> 'snooze_count' $$,
  current_setting('t.t_mar'))),
  '1',
  'the caregiver holding the task at summary (the care ceiling) snoozes it a week');

select is(pg_temp.scalar(format(
  $$ select t.due_on::text || '/' || t.due_zone || '/' || t.snooze_count::text
       from public.tasks t where t.id = %L $$, current_setting('t.t_mar'))),
  '2026-09-17/America/New_York/1',
  'the date moved and the count is 1 (§4.5.4: "moves the date and records that it was snoozed")');

select is(pg_temp.scalar(format(
  $$ select r.revision_no::text || '/' || r.changer_display_name || '/' || (r.changed_by = %L)::text
            || '/' || (r.before ->> 'due_on') || '>' || (r.after ->> 'due_on')
            || '/' || (r.before ->> 'snooze_count') || '>' || (r.after ->> 'snooze_count')
       from public.record_revisions r
      where r.object_type = 'task' and r.object_id = %L $$,
  current_setting('t.u_marisol'), current_setting('t.t_mar'))),
  '1/Marisol/true/2026-09-10>2026-09-17/0>1',
  '"by whom and how many times": a record_revisions row names the actor and carries the date and the count before and after');

select is(pg_temp.scalar(format(
  $$ select l.actor_display_name || '/' || (l.detail ->> 'from_due_on') || '/' || (l.detail ->> 'to_due_on')
            || '/' || (l.detail ->> 'snooze_count')
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'task_snoozed' and l.object_id = %L $$,
  current_setting('t.c1'), current_setting('t.t_mar'))),
  'Marisol/2026-09-10/2026-09-17/1',
  'the log entry names the actor, both dates and the count');

select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select ((hc.snooze_task(%L, '2026-09-24', 'America/New_York')) ->> 'snooze_count') || '/' ||
            ((hc.snooze_task(%L, '2026-10-01', 'America/New_York')) ->> 'revision_no') $$,
  current_setting('t.t_mar'), current_setting('t.t_mar'))),
  '2/3',
  'a task snoozed again and again counts up, one revision per snooze — "a task snoozed four times is a signal the family should be able to see"');

-- ----------------------------------------------------------------------------
-- 18–20 · A snooze moves FORWARD; the pair travels together; no date, no snooze.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select hc.snooze_task(%L, '2026-09-20', 'America/New_York')::text $$,
  current_setting('t.t_mar'))),
  'ERROR:P0001:snooze_refused',
  'an EARLIER date is not a snooze — it is an edit, and edits go through hc.revise_object with their own revision');

select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select hc.snooze_task(%L, '2026-10-08', null)::text $$,
  current_setting('t.t_mar'))),
  'ERROR:P0001:snooze_refused',
  'the due pair travels together (tasks_check): a date without its zone refuses in the one shape, never as a raw 23514 at a person''s click');

select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select hc.snooze_task(%L, '2026-10-08', 'America/New_York')::text $$,
  current_setting('t.t_nodue'))),
  'ERROR:P0001:snooze_refused',
  'a task with no date cannot be snoozed — there is no date to move; giving it one is an edit');

-- ----------------------------------------------------------------------------
-- 21–24 · The caregiver completes at summary; a manage-holder completes and
--         snoozes work nobody holds.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_marisol')::uuid, format(
  $$ select (hc.complete_task(%L)) ->> 'status' $$, current_setting('t.t_mar'))),
  'done',
  'THE ARGUED CASE: the caregiver holds the task at summary — the care ceiling — and closes it. A view bar would make every task handed to a caregiver one she could read and never finish');

select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select (hc.complete_task(%L)) ->> 'status' $$, current_setting('t.t_unowned'))),
  'done',
  'a manage-holder completes a task nobody holds');

select is(pg_temp.scalar(format(
  $$ select (t.completed_by = %L and t.owner_member_id is null)::text
       from public.tasks t where t.id = %L $$,
  current_setting('t.u_dan'), current_setting('t.t_unowned'))),
  'true',
  'and the completion is attributed to him while the task stays nobody''s — the doer and the holder are two different facts');

select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select (hc.snooze_task(%L, '2026-09-09', 'America/New_York')) ->> 'snooze_count' $$,
  current_setting('t.t_dan'))),
  '1',
  'and snoozes one — manage on the taint suffices without holding it');

-- ----------------------------------------------------------------------------
-- 25–27 · Refusal shapes: a done task cannot be snoozed · nonexistent ·
--         a view-holder cannot touch a task she does not hold.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select hc.snooze_task(%L, '2026-10-08', 'America/New_York')::text $$,
  current_setting('t.t_lena'))),
  'ERROR:P0001:snooze_refused',
  'a done task cannot be snoozed');

select is(pg_temp.call_as(current_setting('t.u_dan')::uuid,
  $$ select hc.complete_task(gen_random_uuid())::text $$),
  'ERROR:P0001:complete_refused',
  'a nonexistent task lands in the same one shape (DEF-10) — no existence oracle');

select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select hc.complete_task(%L)::text $$, current_setting('t.t_dan'))),
  'ERROR:P0001:complete_refused',
  'Lena holds VIEW on the task''s whole taint and does not hold the task: refused — view completes work assigned to HER, not work assigned to nobody');

-- ----------------------------------------------------------------------------
-- 28 · The slice trap: hc.revise_object's task allowlist is NOT widened.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"snooze_count":5}'::jsonb)::text $$,
  current_setting('t.t_dan')))
  || '/' || pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.revise_object('task', %L, '{"completed_at":"2026-09-01T00:00:00Z"}'::jsonb)::text $$,
  current_setting('t.t_dan'))),
  'ERROR:P0001:revise_invalid_field/ERROR:P0001:revise_invalid_field',
  'snooze_count and completed_at stay unaddressable through the generic patch — the count is a fact the snooze writes, not a field a person edits');

-- ----------------------------------------------------------------------------
-- 29–30 · Freeze: both verbs refuse with the NAMED signature.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;
select is(pg_temp.call_as(current_setting('t.u_lena')::uuid, format(
  $$ select hc.complete_task(%L)::text $$, current_setting('t.t_nodue'))),
  'ERROR:P0001:freeze_active',
  'a freeze suspends ALL interactive access (§3.8): completing refuses with the named freeze_active');

select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.snooze_task(%L, '2026-09-16', 'America/New_York')::text $$,
  current_setting('t.t_dan'))),
  'ERROR:P0001:freeze_active',
  'and so does snoozing');

-- ----------------------------------------------------------------------------
-- 31–32 · ADR-0033 cluster E (R1/F-6, R2/F-3): the freeze is named to
--         MEMBERS. The freeze from 29–30 is still open; a STRANGER — an
--         account with no membership anywhere — meets one shape on an open
--         task, a done one and a nonexistent one.
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
do $$
declare u uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u, 'member', 'Stranger');
  perform set_config('t.u_stranger', u::text, true);
end $$;
set session_replication_role = default;
select is(pg_temp.call_as(current_setting('t.u_stranger')::uuid, format(
  $$ select hc.complete_task(%L)::text $$, current_setting('t.t_dan')))
  || '/' || pg_temp.call_as(current_setting('t.u_stranger')::uuid, format(
  $$ select hc.complete_task(%L)::text $$, current_setting('t.t_lena')))
  || '/' || pg_temp.call_as(current_setting('t.u_stranger')::uuid,
  $$ select hc.complete_task(gen_random_uuid())::text $$),
  'ERROR:P0001:complete_refused/ERROR:P0001:complete_refused/ERROR:P0001:complete_refused',
  'under the freeze a STRANGER completing an OPEN task, a DONE one and a nonexistent one meets ONE shape — before, the open task answered freeze_active and the done one complete_refused: an open/done oracle on top of a freeze oracle, handed to an outsider (R1/F-6, R2/F-3). Three calls, joined outside the statement');

select is(pg_temp.call_as(current_setting('t.u_stranger')::uuid, format(
  $$ select hc.snooze_task(%L, '2026-09-16', 'America/New_York')::text $$, current_setting('t.t_dan')))
  || '/' || pg_temp.call_as(current_setting('t.u_stranger')::uuid,
  $$ select hc.snooze_task(gen_random_uuid(), '2026-09-16', 'America/New_York')::text $$),
  'ERROR:P0001:snooze_refused/ERROR:P0001:snooze_refused',
  'and so for snoozing: the named freeze_active is for members (PRD §7.5), and a stranger with a uuid learns nothing');

select * from finish();
rollback;
