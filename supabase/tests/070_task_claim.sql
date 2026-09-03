-- ============================================================================
-- 8A · M1 — task claim: hc.claim_task (PRD §4.5.1 "Claims"; AC-TASK-1's
-- claim half; AC-TASK-2; PRD §6.5; ADR-0036 Q-D; ADR-0032 D8 — "Claim
-- (self-assignment) is NOT provided", the 7A build failed closed).
-- docs/review/slice-8-plan.md, "Migration bound (Q2)", row M1 — BINDING.
-- Pinned here BEFORE the migration exists. TSK-05 flips at THIS layer.
--
-- THE CONTRACT THESE CASES PIN.
--   · hc.claim_task(p_task) takes ONE argument. The caller takes an
--     UNASSIGNED, OPEN task for HERSELF and can name no one else.
--   · Refused unless hc.visible_at(ctx, subject, taint, taint_resolved,
--     'task', task, owner_member_id) >= 'view' — the claimant's OWN vectors
--     (hc.ctx()), asked of the task AS IT STANDS (owner null), so a
--     care-circle member's rung-4 ceiling answers exactly as tasks_select
--     does for her today: hidden unless a named share widens it.
--   · Refused if owner_member_id is not null — even when it is hers already.
--     Moving held work is unassign + assign, and that stays manage's.
--   · `summary` does not claim (plan Q2: "summary-may-claim rejected") —
--     summary is a title; view is the task.
--   · ONE SHAPE, claim_refused, for a non-reader, an owned task, a summary
--     holder, a done task, an instruction row, a nonexistent id, a stranger,
--     AND a frozen circle: the freeze reaches this function through
--     hc.visible_at rung 2 alone and nothing names it (plan Q2 row M1:
--     "refused under freeze through the same one function"). Driven as
--     ORDERED PAIRS — the same person on a task she can claim and one she
--     cannot — and the refusal strings joined OUTSIDE the statement: a
--     refusal that discriminates is an oracle.
--   · Writes owner_member_id = the claimant's member row, assigned_by = her
--     account, assigned_at — the columns assign_task writes, so a claimed
--     task is a handed task to every other writer (reassign names her as
--     the former holder; her complete_task closes it).
--   · Logs task_claimed with the claimant as actor AND target; no
--     task_assigned, no task_reassigned, no object_shared.
--   · NO SHARE AND NO INSTRUCTION ROW BY ANY PATH — asserted as SET
--     EQUALITY of object_shares and of instruction rows before/after every
--     path, never as the absence of an INSERT; and the task count is exact.
--   · THE AI HAS NO PATH: hc_pipeline holds no EXECUTE — catalog-based (the
--     PG17 ACL-denial segfault: never probed by calling as a denied role).
--
-- Levels are read as postgres through hc.ctx_for(account) — hc.visible_at
-- holds no authenticated EXECUTE and is never called as that role here.
-- Fixtures under session_replication_role = replica (the 066 precedent);
-- the claim trigger is made IMMEDIATE after them so any insert a function
-- performs is checked at the statement.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(40);

-- ----------------------------------------------------------------------------
-- Helpers (the 066/067 pattern).
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

-- The claim, as p_user, returning the member id it wrote or the refusal.
create function pg_temp.claim_as(p_user text, p_task text) returns text
language plpgsql as $$
begin
  return pg_temp.call_as(current_setting('t.' || p_user)::uuid, format(
    $q$ select (hc.claim_task(%L)) ->> 'member_id' $q$, current_setting('t.' || p_task)));
end $$;

-- A member's level on a task from HER OWN vectors, computed as postgres.
create function pg_temp.level_of(p_user text, p_task text) returns text
language plpgsql as $$
declare v text;
begin
  select hc.visible_at(hc.ctx_for(current_setting('t.' || p_user)::uuid),
                       t.subject_id, t.taint, t.taint_resolved,
                       'task', t.id, t.owner_member_id)::text
    into v from public.tasks t where t.id = current_setting('t.' || p_task)::uuid;
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures: circle c1 · subjects s1 (Nell) and s2 (Marcus).
--   Sarah     coordinator, manage×5 on both (the approver of every task)
--   Dan       family — manage on schedule + health (manage does not claim
--             held work either)
--   Lena      family — VIEW on schedule + health (the claimant)
--   Ruth      family — summary on schedule + health (summary does not claim)
--   Kim       family — VIEW on schedule ONLY (a reader of {schedule}, a
--             non-reader of {schedule,health}: the level decides)
--   Omar      family — view on MARCUS's schedule only: no context on Nell
--   Marisol   care_circle — schedule summary (the ceiling; a named share
--             is the one widening she holds)
--   Stranger  an account with no membership anywhere
-- Tasks (Nell, {schedule} unless said): t_plain · t_plain2 · t_sched2 ·
-- t_sched3 · t_sched4 · t_sched5 · t_sched6 · t_tainted {schedule,health} ·
-- t_shared (shared to Marisol by name, no assignment behind it) ·
-- t_owned (held by Ruth) · t_done (done) · t_instr (an instruction row,
-- written for Ruth from t_owned, nobody's) · t_s2 (Marcus's).
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
do $fx$
declare
  u_sarah uuid := pg_temp.mk_user(gen_random_uuid());
  u_dan   uuid := pg_temp.mk_user(gen_random_uuid());
  u_lena  uuid := pg_temp.mk_user(gen_random_uuid());
  u_ruth  uuid := pg_temp.mk_user(gen_random_uuid());
  u_kim   uuid := pg_temp.mk_user(gen_random_uuid());
  u_omar  uuid := pg_temp.mk_user(gen_random_uuid());
  u_marisol uuid := pg_temp.mk_user(gen_random_uuid());
  u_stranger uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; s2 uuid;
  m_sarah uuid; m_dan uuid; m_lena uuid; m_ruth uuid; m_kim uuid; m_omar uuid;
  m_marisol uuid;
  t_plain uuid := gen_random_uuid(); t_plain2 uuid := gen_random_uuid();
  t_sched2 uuid := gen_random_uuid(); t_sched3 uuid := gen_random_uuid();
  t_sched4 uuid := gen_random_uuid(); t_sched5 uuid := gen_random_uuid();
  t_sched6 uuid := gen_random_uuid(); t_tainted uuid := gen_random_uuid();
  t_shared uuid := gen_random_uuid(); t_owned uuid := gen_random_uuid();
  t_done uuid := gen_random_uuid(); t_instr uuid := gen_random_uuid();
  t_s2 uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u_sarah, 'member', 'Sarah'), (u_dan, 'member', 'Dan'),
    (u_lena, 'member', 'Lena'), (u_ruth, 'member', 'Ruth'),
    (u_kim, 'member', 'Kim'), (u_omar, 'member', 'Omar'),
    (u_marisol, 'member', 'Marisol'), (u_stranger, 'member', 'Stranger');
  insert into public.circles (name, created_by) values ('Nell''s circle', u_sarah)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'tc1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Marcus', 'independent', '02138', 'America/New_York', 'clay',
          'tc2-' || substr(c1::text, 1, 8)) returning id into s2;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_sarah, 'coordinator', 'Sarah') returning id into m_sarah;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_dan, 'family', 'Dan') returning id into m_dan;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_lena, 'family', 'Lena') returning id into m_lena;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_ruth, 'family', 'Ruth') returning id into m_ruth;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_kim, 'family', 'Kim') returning id into m_kim;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_omar, 'family', 'Omar') returning id into m_omar;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_marisol, 'care_circle', 'Marisol') returning id into m_marisol;

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_sarah, s1, d::hc.domain, 'manage', u_sarah),
           (c1, m_sarah, s2, d::hc.domain, 'manage', u_sarah);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_dan,     s1, 'schedule', 'manage',  u_sarah),
         (c1, m_dan,     s1, 'health',   'manage',  u_sarah),
         (c1, m_lena,    s1, 'schedule', 'view',    u_sarah),
         (c1, m_lena,    s1, 'health',   'view',    u_sarah),
         (c1, m_ruth,    s1, 'schedule', 'summary', u_sarah),
         (c1, m_ruth,    s1, 'health',   'summary', u_sarah),
         (c1, m_kim,     s1, 'schedule', 'view',    u_sarah),
         (c1, m_omar,    s2, 'schedule', 'view',    u_sarah),
         (c1, m_marisol, s1, 'schedule', 'summary', u_sarah);

  insert into public.tasks (id, circle_id, subject_id, title, status,
    approved_by, approved_at, approver_display_name, taint)
  values
    (t_plain,   c1, s1, 'Call the pharmacy',            'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_plain2,  c1, s1, 'Collect the prescription',     'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_sched2,  c1, s1, 'Renew the parking permit',     'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_sched3,  c1, s1, 'Water the plants',             'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_sched4,  c1, s1, 'Drive Nell to the clinic',     'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_sched5,  c1, s1, 'Return the library books',     'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_sched6,  c1, s1, 'Pick up the walker',           'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_tainted, c1, s1, 'Follow the discharge instructions', 'open', u_sarah, now(), 'Sarah', '{schedule,health}'),
    (t_shared,  c1, s1, 'Sort the Tuesday pills',       'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_owned,   c1, s1, 'Book the follow-up',           'open', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_done,    c1, s1, 'Cancel the old subscription',  'done', u_sarah, now(), 'Sarah', '{schedule}'),
    (t_s2,      c1, s2, 'Marcus: renew the bus pass',   'open', u_sarah, now(), 'Sarah', '{schedule}');
  update public.tasks set owner_member_id = m_ruth, assigned_by = u_sarah, assigned_at = now()
   where id = t_owned;
  update public.tasks set completed_by = u_sarah, completed_at = now()
   where id = t_done;
  -- the instruction row: written for Ruth from her task, nobody's holder now
  -- (the shape unassign leaves behind), taint {schedule} only
  insert into public.tasks (id, circle_id, subject_id, title,
    written_for_member_id, written_from_task_id,
    approved_by, approved_at, approver_display_name, taint, taint_resolved)
  values (t_instr, c1, s1, 'Ring the surgery about the follow-up',
          m_ruth, t_owned, u_sarah, now(), 'Sarah', '{schedule}', true);

  -- THE NAMED SHARE: a coordinator's own earlier share, no assignment behind it
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'task', t_shared, m_marisol, u_sarah);

  perform set_config('t.u_sarah', u_sarah::text, true);
  perform set_config('t.u_dan', u_dan::text, true);
  perform set_config('t.u_lena', u_lena::text, true);
  perform set_config('t.u_ruth', u_ruth::text, true);
  perform set_config('t.u_kim', u_kim::text, true);
  perform set_config('t.u_omar', u_omar::text, true);
  perform set_config('t.u_marisol', u_marisol::text, true);
  perform set_config('t.u_stranger', u_stranger::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.s2', s2::text, true);
  perform set_config('t.m_dan', m_dan::text, true);
  perform set_config('t.m_lena', m_lena::text, true);
  perform set_config('t.m_ruth', m_ruth::text, true);
  perform set_config('t.m_kim', m_kim::text, true);
  perform set_config('t.m_omar', m_omar::text, true);
  perform set_config('t.m_marisol', m_marisol::text, true);
  perform set_config('t.t_plain', t_plain::text, true);
  perform set_config('t.t_plain2', t_plain2::text, true);
  perform set_config('t.t_sched2', t_sched2::text, true);
  perform set_config('t.t_sched3', t_sched3::text, true);
  perform set_config('t.t_sched4', t_sched4::text, true);
  perform set_config('t.t_sched5', t_sched5::text, true);
  perform set_config('t.t_sched6', t_sched6::text, true);
  perform set_config('t.t_tainted', t_tainted::text, true);
  perform set_config('t.t_shared', t_shared::text, true);
  perform set_config('t.t_owned', t_owned::text, true);
  perform set_config('t.t_done', t_done::text, true);
  perform set_config('t.t_instr', t_instr::text, true);
  perform set_config('t.t_s2', t_s2::text, true);
  perform set_config('t.t_none', gen_random_uuid()::text, true);
end $fx$;
set session_replication_role = default;

-- From here every insert a FUNCTION performs meets the claim trigger at the
-- statement, exactly as it would at commit.
set constraints all immediate;

-- The SET-EQUALITY baselines: every share and every instruction row as they
-- stand before any claim. Re-asserted after each path, and at the end.
create temp table shares_snap as
  select id, member_id, object_type::text as object_type, object_id, revoked_at,
         created_by_assignment_of
    from public.object_shares;
create temp table instr_snap as
  select id, status, owner_member_id, written_for_member_id, written_from_task_id
    from public.tasks where written_from_task_id is not null;

-- ----------------------------------------------------------------------------
-- 1–5 · Shape, privilege closure (catalog-based), the AI role, the event
--       type, the fixture's exact count.
-- ----------------------------------------------------------------------------
select has_function('hc', 'claim_task', array['uuid'],
  'hc.claim_task(task) exists — ONE argument: the caller claims for herself and can name no one else');

select ok(
  (select count(*) = 1 and bool_and(
        pg_get_userbyid(p.proowner) = 'hc_internal'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('hc_admin', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname = 'claim_task'),
  'claim_task is a definer owned by hc_internal, executable by authenticated and by no other request-path role — asserted from the catalog, never by calling as a denied role');

select ok(
  (select count(*) = 1 and bool_and(not has_function_privilege('hc_pipeline', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname = 'claim_task'),
  'THE AI HAS NO PATH INTO A CLAIM (PRD §6.5, AC-TASK-2): hc_pipeline holds no EXECUTE');

select is((select count(*)::int from hc.log_event_types where code = 'task_claimed'), 1,
  'task_claimed joins the event vocabulary — distinct from task_assigned, so the log can tell "handed to you" from "you took it"');

select is((select count(*)::int from public.tasks where circle_id = current_setting('t.c1')::uuid), 13,
  'the fixture: thirteen task rows, the exact count every path below must leave');

-- ----------------------------------------------------------------------------
-- 6–12 · THE HEADLINE: Lena, at view on {schedule}, takes an unassigned
--        open task for herself.
-- ----------------------------------------------------------------------------
select is(pg_temp.claim_as('u_lena', 't_plain'), current_setting('t.m_lena'),
  'a view-level member claims an unassigned open task and the answer names HER member row');

select is((
  select array[t.owner_member_id::text, t.assigned_by::text, t.status,
               (t.assigned_at > now() - interval '1 minute')::text]
    from public.tasks t where t.id = current_setting('t.t_plain')::uuid),
  array[current_setting('t.m_lena'), current_setting('t.u_lena'), 'open', 'true'],
  'the row: owner_member_id = her member row, assigned_by = her own account, assigned_at now — the three columns assign_task writes, nothing else');

select is((
  select array[l.actor_account_id::text, l.actor_display_name, l.target_member_id::text,
               l.object_type::text, l.object_id::text, l.subject_id::text]
    from public.access_log l
   where l.circle_id = current_setting('t.c1')::uuid and l.event_type = 'task_claimed'),
  array[current_setting('t.u_lena'), 'Lena', current_setting('t.m_lena'),
        'task', current_setting('t.t_plain'), current_setting('t.s1')],
  'exactly one task_claimed entry, the claimant as ACTOR (account and name) and as target, on the task, under the subject (AC-TASK-2: a human actor)');

select is((select count(*)::int from public.access_log l
            where l.circle_id = current_setting('t.c1')::uuid
              and l.event_type in ('task_assigned', 'task_reassigned', 'object_shared')), 0,
  'no task_assigned, no task_reassigned, no object_shared — a claim is its own entry and nothing else''s');

select set_eq(
  $$ select id, member_id, object_type::text, object_id, revoked_at, created_by_assignment_of
       from public.object_shares $$,
  $$ select id, member_id, object_type, object_id, revoked_at, created_by_assignment_of
       from shares_snap $$,
  'NO SHARE: the set of share rows after the claim IS the set before it — asserted as set equality, not as the absence of an insert');

select set_eq(
  $$ select id, status, owner_member_id, written_for_member_id, written_from_task_id
       from public.tasks where written_from_task_id is not null $$,
  $$ select id, status, owner_member_id, written_for_member_id, written_from_task_id
       from instr_snap $$,
  'NO INSTRUCTION: the set of instruction rows after the claim IS the set before it');

select is(pg_temp.level_of('u_lena', 't_plain'), 'view',
  'she reads the task she now holds at view, from her OWN vectors — the claim widened nothing');

-- ----------------------------------------------------------------------------
-- 13–16 · An OWNED task refuses whoever asks — the serial half of the race —
--         and summary does not claim.
-- ----------------------------------------------------------------------------
select is(pg_temp.claim_as('u_lena', 't_plain'), 'ERROR:P0001:claim_refused',
  'hers already is NOT a quiet no-op: an owned task refuses, even to its holder — moving held work is unassign + assign');

select is(pg_temp.claim_as('u_dan', 't_plain'), 'ERROR:P0001:claim_refused',
  'manage does not take held work by claiming either — reassignment stays assign_task''s (PRD §7.3)');

select is((
  select array[(select t.owner_member_id::text from public.tasks t where t.id = current_setting('t.t_plain')::uuid),
               (select count(*)::text from public.access_log l
                 where l.circle_id = current_setting('t.c1')::uuid and l.event_type = 'task_claimed')]),
  array[current_setting('t.m_lena'), '1'],
  'one owner, one task_claimed — the serial half; concurrency case 55 is the two claimants at once');

select is(pg_temp.claim_as('u_ruth', 't_sched6'), 'ERROR:P0001:claim_refused',
  'summary does not claim (plan Q2): summary is a title, view is the task');

-- ----------------------------------------------------------------------------
-- 17–20 · THE CLAIMANT'S OWN VECTORS: the same person, two tasks, and the
--         level decides — Kim's ladder, then Omar's context.
-- ----------------------------------------------------------------------------
select is(pg_temp.claim_as('u_kim', 't_tainted'), 'ERROR:P0001:claim_refused',
  'Kim (view on schedule only) cannot claim the {schedule,health} task — her OWN ladder says hidden, and a non-reader is refused in the one shape');

select is(pg_temp.claim_as('u_kim', 't_sched2'), current_setting('t.m_kim'),
  '… and the same Kim claims the {schedule} task beside it: the pair — the level decides, not the person');

select is(pg_temp.claim_as('u_omar', 't_sched3'), 'ERROR:P0001:claim_refused',
  'Omar holds context on Marcus alone: no context on Nell ⇒ hidden ⇒ refused, indistinguishable from every other refusal');

select is(pg_temp.claim_as('u_omar', 't_s2'), current_setting('t.m_omar'),
  '… and the same Omar claims Marcus''s task: the pair, per subject');

-- ----------------------------------------------------------------------------
-- 21–25 · THE CARE CEILING, and the one widening she already holds.
-- ----------------------------------------------------------------------------
select is(pg_temp.claim_as('u_marisol', 't_sched4'), 'ERROR:P0001:claim_refused',
  'a caregiver cannot claim an unshared task: rung 4 hides it AS IT STANDS (owner null is not her), exactly as tasks_select does today');

select is(pg_temp.claim_as('u_marisol', 't_shared'), current_setting('t.m_marisol'),
  '… but she claims the task shared to her BY NAME — the one widening she already holds gives view, and view claims');

select set_eq(
  $$ select id, member_id, object_type::text, object_id, revoked_at, created_by_assignment_of
       from public.object_shares $$,
  $$ select id, member_id, object_type, object_id, revoked_at, created_by_assignment_of
       from shares_snap $$,
  'NO SHARE on the shared path either: the existing share is the ONLY share, before and after — none created, none marked as the claim''s (created_by_assignment_of stays null)');

select set_eq(
  $$ select id, status, owner_member_id, written_for_member_id, written_from_task_id
       from public.tasks where written_from_task_id is not null $$,
  $$ select id, status, owner_member_id, written_for_member_id, written_from_task_id
       from instr_snap $$,
  'NO INSTRUCTION on the shared path');

select is(pg_temp.level_of('u_marisol', 't_shared'), 'view',
  'she reads what she claimed at view — rung 4''s own-task exception and the share agree, and neither was created by the claim');

-- ----------------------------------------------------------------------------
-- 26–31 · Every other refusal, and THE ONE SHAPE joined outside the statement.
-- ----------------------------------------------------------------------------
select is(pg_temp.claim_as('u_lena', 't_owned'), 'ERROR:P0001:claim_refused',
  'a task someone else holds refuses');

select is(pg_temp.claim_as('u_lena', 't_done'), 'ERROR:P0001:claim_refused',
  'a done task refuses — done is terminal (§4.5.3)');

select is(pg_temp.claim_as('u_lena', 't_instr'), 'ERROR:P0001:claim_refused',
  'an INSTRUCTION row refuses: it is what its holder reads of the original, never work of its own (ADR-0033 cluster C)');

select is(pg_temp.claim_as('u_lena', 't_none'), 'ERROR:P0001:claim_refused',
  'a nonexistent id refuses in the same shape');

select is(pg_temp.claim_as('u_stranger', 't_plain2'), 'ERROR:P0001:claim_refused',
  'a stranger with a uuid learns nothing');

select is((
  select string_agg(distinct r, ' | ')
    from unnest(array[
      pg_temp.claim_as('u_lena', 't_plain'),      -- hers already
      pg_temp.claim_as('u_dan', 't_plain'),       -- owned, asked by manage
      pg_temp.claim_as('u_ruth', 't_sched6'),     -- summary
      pg_temp.claim_as('u_kim', 't_tainted'),     -- non-reader by ladder
      pg_temp.claim_as('u_omar', 't_sched3'),     -- no context on the subject
      pg_temp.claim_as('u_marisol', 't_sched4'),  -- the care ceiling
      pg_temp.claim_as('u_lena', 't_owned'),      -- someone else's
      pg_temp.claim_as('u_lena', 't_done'),       -- done
      pg_temp.claim_as('u_lena', 't_instr'),      -- an instruction row
      pg_temp.claim_as('u_lena', 't_none'),       -- nonexistent
      pg_temp.claim_as('u_stranger', 't_plain2')  -- a stranger
    ]) r),
  'ERROR:P0001:claim_refused',
  'THE ONE SHAPE: eleven refusals — hers, owned-by-another asked by manage, summary, non-reader, no-context, the ceiling, someone else''s, done, an instruction, nonexistent, a stranger — collapse to ONE distinct string, joined outside the statement');

-- ----------------------------------------------------------------------------
-- 32–35 · FREEZE: the same one function, the same one shape — nothing names
--         it. Then lifted, to show it was the freeze.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;

select is(pg_temp.claim_as('u_lena', 't_sched5'), 'ERROR:P0001:claim_refused',
  'under a freeze the claim refuses in the ONE shape — NOT freeze_active: the freeze reaches claim_task through hc.visible_at rung 2 alone (plan Q2 row M1, "through the same one function")');

select is(pg_temp.claim_as('u_dan', 't_sched5'), 'ERROR:P0001:claim_refused',
  'manage under the freeze: the same string');

select is((
  select count(distinct r)::int
    from unnest(array[
      pg_temp.claim_as('u_lena', 't_sched5'),
      pg_temp.claim_as('u_dan', 't_sched5'),
      pg_temp.claim_as('u_stranger', 't_sched5')
    ]) r), 1,
  'under the freeze a member at view, a member at manage and a stranger meet ONE string — the refusal is not an oracle for the circle''s state');

do $$
begin
  delete from public.freezes where circle_id = current_setting('t.c1')::uuid;
end $$;

select is(pg_temp.claim_as('u_lena', 't_sched5'), current_setting('t.m_lena'),
  'the freeze lifted, the very same call lands — it WAS the freeze, and nothing else stood in the way');

-- ----------------------------------------------------------------------------
-- 36–38 · Across every path: no share, no instruction, no row.
-- ----------------------------------------------------------------------------
select set_eq(
  $$ select id, member_id, object_type::text, object_id, revoked_at, created_by_assignment_of
       from public.object_shares $$,
  $$ select id, member_id, object_type, object_id, revoked_at, created_by_assignment_of
       from shares_snap $$,
  'ACROSS EVERY PATH — five claims, every refusal above, a freeze opened and lifted: the share set is exactly what it was');

select set_eq(
  $$ select id, status, owner_member_id, written_for_member_id, written_from_task_id
       from public.tasks where written_from_task_id is not null $$,
  $$ select id, status, owner_member_id, written_for_member_id, written_from_task_id
       from instr_snap $$,
  'ACROSS EVERY PATH: the instruction set is exactly what it was');

select is((select count(*)::int from public.tasks where circle_id = current_setting('t.c1')::uuid), 13,
  'ACROSS EVERY PATH: thirteen task rows still — no path through claim_task creates a row');

-- ----------------------------------------------------------------------------
-- 39–40 · A claimed task is a HANDED task to every other writer.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select (hc.assign_task(%L, %L)) ->> 'former_member_id' $$,
  current_setting('t.t_plain'), current_setting('t.m_ruth'))),
  current_setting('t.m_lena'),
  'manage reassigns the claimed task through assign_task and the claimant is named as the FORMER holder — the claim wrote the columns assign_task reads');

select is(pg_temp.call_as(current_setting('t.u_kim')::uuid, format(
  $$ select (hc.complete_task(%L)) ->> 'status' $$, current_setting('t.t_sched2'))),
  'done',
  'the claimant completes what she claimed — complete_task sees her as the holder exactly as it sees a handed one');

select * from finish();
rollback;
