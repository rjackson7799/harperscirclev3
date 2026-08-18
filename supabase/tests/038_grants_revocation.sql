-- ============================================================================
-- 2A · M4 — the grant and revocation writers: hc.set_grant ·
-- hc.remove_member (TSD §5.8; PRD §4.6.3, §7.4 ceilings, §8.8; AC-PERM-5).
--
-- The contract these tests pin:
--   · hc.set_grant(member, subject, domain, level[, step_up_token]) —
--     coordinator-only, per-subject per-domain (PRD §4.6.3). RAISING
--     requires a live §5.7 token bound to 'raise_grant' +
--     'member:subject:domain'; LOWERING never does (revocation is never
--     gated on re-auth friction). Level 'hidden' DELETES the row —
--     hidden is the absence of a grant, exactly as tier defaults write
--     it. The care-circle ceiling binds structurally: a care member's
--     level can never exceed the §7.4 care default for that domain
--     ("this is a ceiling, not a starting point — it doesn't rise").
--     A freeze refuses RAISES with the named freeze_active (PRD §7.5
--     "no new grants") and permits lowers (an upheld finding is
--     executed BY lowering). Every change logs grant_changed with
--     actor, target, subject, domain, level before AND after
--     (AC-PERM-5); a same-level call is a no-op that logs nothing.
--     Subject-member rows are untouchable — the subject's own manage×5
--     standing is not a grant a coordinator edits.
--   · hc.remove_member(member[, keep_share_ids]) — coordinator-only,
--     under the R-rule lock, ONE transaction: membership removed_at;
--     every grant row DELETED; live object shares revoked UNLESS
--     explicitly kept (§5.8); OPEN tasks unassigned with the former
--     holder recorded in the log (PRD §8.8 — removal and unassignment
--     are separate entries at the same timestamp); done tasks keep
--     their attribution untouched. The last live coordinator cannot be
--     removed (§12.7: transfer first); subject-member rows refuse.
--     Returns account_id so the app layer revokes sessions (§5.8's
--     sessions row is the Supabase admin API, 2B).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(33);

-- ----------------------------------------------------------------------------
-- Helpers
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

-- Mint a raise_grant token on a fresh session, bound to member:subject:domain.
create function pg_temp.mint_raise(p_user uuid, p_target text, p_slot text)
returns void language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password',
      'timestamp', extract(epoch from now())::bigint)))::text, true);
  execute 'set local role authenticated';
  v := hc.mint_step_up('raise_grant', p_target) ->> 'token';
  execute 'reset role';
  perform set_config('t.' || p_slot, v, true);
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures: circle c1 · subject s1 · coordinators u1 (m1) and u2 (m2) ·
-- family member u3 (m3: health view, schedule summary) · care member u4
-- (m4: schedule summary) · removal target u5 (m5: grants, two shares,
-- one open + one done task) · the subject-member row (mS).
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  u3 uuid := pg_temp.mk_user(gen_random_uuid());
  u4 uuid := pg_temp.mk_user(gen_random_uuid());
  u5 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; ms uuid;
  a1 uuid := gen_random_uuid();
  doc1 uuid := gen_random_uuid(); doc2 uuid := gen_random_uuid();
  t_open uuid := gen_random_uuid(); t_done uuid := gen_random_uuid();
  sh_kept uuid; sh_gone uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u3, 'member', 'Dan'),
    (u4, 'member', 'Aide'), (u5, 'member', 'Trouble');
  insert into public.circles (name, created_by) values ('Revocation circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'rev-' || substr(c1::text, 1, 8)) returning id into s1;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'coordinator', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Dan') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u4, 'care_circle', 'Aide') returning id into m4;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u5, 'family', 'Trouble') returning id into m5;
  insert into public.circle_members (circle_id, subject_id, custodian_member_id,
                                     tier, display_name_at_join)
  values (c1, s1, m1, 'coordinator', 'Nell') returning id into ms;

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1),
           (c1, m2, s1, d::hc.domain, 'manage', u1),
           (c1, ms, s1, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m3, s1, 'health',   'view',    u1),
         (c1, m3, s1, 'schedule', 'summary', u1),
         (c1, m4, s1, 'schedule', 'summary', u1),
         (c1, m5, s1, 'health',   'view',    u1),
         (c1, m5, s1, 'schedule', 'view',    u1);

  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (a1, c1, s1, 'upload');
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc1, c1, s1, 'Care plan', 'medical', a1, now(), u1, now(), 'Sarah', '{health}'),
         (doc2, c1, s1, 'Insurance card', 'insurance', a1, now(), u1, now(), 'Sarah', '{documents}');
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', doc1, m5, u1) returning id into sh_kept;
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', doc2, m5, u1) returning id into sh_gone;

  insert into public.tasks (id, circle_id, subject_id, title, owner_member_id,
    assigned_by, assigned_at, status,
    approved_by, approved_at, approver_display_name, taint)
  values (t_open, c1, s1, 'Call the pharmacy', m5, u1, now(), 'open',
          u1, now(), 'Sarah', '{schedule}');
  insert into public.tasks (id, circle_id, subject_id, title, owner_member_id,
    assigned_by, assigned_at, status, completed_by, completed_at,
    approved_by, approved_at, approver_display_name, taint)
  values (t_done, c1, s1, 'Book the follow-up', m5, u1, now(), 'done', u5, now(),
          u1, now(), 'Sarah', '{schedule}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.u5', u5::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.m1', m1::text, true);
  perform set_config('t.m2', m2::text, true);
  perform set_config('t.m3', m3::text, true);
  perform set_config('t.m4', m4::text, true);
  perform set_config('t.m5', m5::text, true);
  perform set_config('t.ms', ms::text, true);
  perform set_config('t.t_open', t_open::text, true);
  perform set_config('t.t_done', t_done::text, true);
  perform set_config('t.sh_kept', sh_kept::text, true);
  perform set_config('t.sh_gone', sh_gone::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · Shape
-- ----------------------------------------------------------------------------
select has_function('hc', 'set_grant',
  array['uuid', 'uuid', 'hc.domain', 'hc.access_level', 'text'],
  'hc.set_grant(member, subject, domain, level, step_up_token) exists');
select has_function('hc', 'remove_member', array['uuid', 'uuid[]'],
  'hc.remove_member(member, keep_share_ids) exists');

-- ----------------------------------------------------------------------------
-- 3–6 · Lowering: no token needed; hidden deletes the row; both logged
-- with before AND after (AC-PERM-5)
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.set_grant(%L, %L, 'health', 'summary', null)) ->> 'after' $$,
  current_setting('t.m3'), current_setting('t.s1'))), 'summary',
  'a coordinator lowers view → summary with no step-up — revocation is never gated on re-auth friction');

select is(pg_temp.scalar(format(
  $$ select l.level_before::text || '>' || l.level_after::text
     from public.access_log l
     where l.circle_id = %L and l.event_type = 'grant_changed'
       and l.target_member_id = %L and l.domain = 'health' $$,
  current_setting('t.c1'), current_setting('t.m3'))), 'view>summary',
  'AC-PERM-5: the change logs actor, target, subject, domain and BOTH levels');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.set_grant(%L, %L, 'schedule', 'hidden', null)) ->> 'after' $$,
  current_setting('t.m3'), current_setting('t.s1'))), 'hidden',
  'lowering to hidden succeeds');
select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_grants
     where member_id = %L and domain = 'schedule' $$,
  current_setting('t.m3'))), '0',
  'hidden IS the absence of a row — exactly how tier defaults write it');

-- ----------------------------------------------------------------------------
-- 7–10 · Raising: token-gated, target-bound
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.set_grant(%L, %L, 'health', 'manage', null)::text $$,
  current_setting('t.m3'), current_setting('t.s1'))),
  'ERROR:P0001:grant_refused',
  'raising without a step-up token refuses — a 30-day session is not authority to widen access (§5.7)');

select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.m3') || ':' || current_setting('t.s1') || ':health', 'tok_r1');
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.set_grant(%L, %L, 'health', 'manage', %L)) ->> 'after' $$,
  current_setting('t.m3'), current_setting('t.s1'), current_setting('t.tok_r1'))),
  'manage',
  'raising with a live token bound to member:subject:domain succeeds');
select is(pg_temp.scalar(format(
  $$ select level::text from public.access_grants
     where member_id = %L and domain = 'health' $$,
  current_setting('t.m3'))), 'manage',
  'the row carries the raised level');

select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.m3') || ':' || current_setting('t.s1') || ':finances', 'tok_r2');
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.set_grant(%L, %L, 'documents', 'view', %L)::text $$,
  current_setting('t.m3'), current_setting('t.s1'), current_setting('t.tok_r2'))),
  'ERROR:P0001:grant_refused',
  'a token bound to ANOTHER domain cannot raise this one — target binding is member:subject:domain');

-- ----------------------------------------------------------------------------
-- 11–14 · Refusals: one shape; the subject-member row is untouchable
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u3')::uuid, format(
  $$ select hc.set_grant(%L, %L, 'health', 'log', null)::text $$,
  current_setting('t.m5'), current_setting('t.s1'))),
  'ERROR:P0001:grant_refused',
  'a family member cannot change grants — coordinator-only (PRD §4.6.3)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.set_grant(%L, %L, 'health', 'log', null)::text $$,
  gen_random_uuid(), current_setting('t.s1'))),
  'ERROR:P0001:grant_refused',
  'a nonexistent member refuses in the same shape — no oracle');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.set_grant(%L, %L, 'health', 'summary', null)::text $$,
  current_setting('t.ms'), current_setting('t.s1'))),
  'ERROR:P0001:grant_refused',
  'the SUBJECT''s own member row is untouchable — their manage×5 standing is not a grant a coordinator edits (PRD §7.5)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_grants
     where member_id = %L and level <> 'manage' $$,
  current_setting('t.ms'))), '0',
  'the subject-member grants are intact at manage×5');

-- ----------------------------------------------------------------------------
-- 15–17 · The care-circle ceiling binds structurally (§7.4: does not rise)
-- ----------------------------------------------------------------------------
select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.m4') || ':' || current_setting('t.s1') || ':schedule', 'tok_c1');
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.set_grant(%L, %L, 'schedule', 'view', %L)::text $$,
  current_setting('t.m4'), current_setting('t.s1'), current_setting('t.tok_c1'))),
  'ERROR:P0001:grant_refused',
  'care ceiling: schedule cannot rise past summary even WITH a valid token — the ceiling is not a starting point');

select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.m4') || ':' || current_setting('t.s1') || ':documents', 'tok_c2');
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.set_grant(%L, %L, 'documents', 'log', %L)::text $$,
  current_setting('t.m4'), current_setting('t.s1'), current_setting('t.tok_c2'))),
  'ERROR:P0001:grant_refused',
  'care ceiling: every non-schedule domain is capped at hidden — not documents, not finances, not family notes');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.set_grant(%L, %L, 'schedule', 'log', null)) ->> 'after' $$,
  current_setting('t.m4'), current_setting('t.s1'))), 'log',
  'care ceiling caps rises only — lowering below the default is a coordinator''s ordinary authority');

-- ----------------------------------------------------------------------------
-- 18–19 · No-op: a same-level call changes nothing and logs nothing
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.set_grant(%L, %L, 'health', 'manage', null)) ->> 'after' $$,
  current_setting('t.m3'), current_setting('t.s1'))), 'manage',
  'a same-level call is a quiet no-op (no token demanded: nothing rises)');
select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type = 'grant_changed'
       and target_member_id = %L and domain = 'health' $$,
  current_setting('t.c1'), current_setting('t.m3'))), '2',
  'the no-op logged nothing — exactly the lower and the raise are on record');

-- ----------------------------------------------------------------------------
-- 20–22 · Freeze: raises refuse with the NAMED signature; lowers execute
-- (PRD §7.5: an upheld finding is executed BY lowering)
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;
select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.m3') || ':' || current_setting('t.s1') || ':schedule', 'tok_f1');
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.set_grant(%L, %L, 'schedule', 'summary', %L)::text $$,
  current_setting('t.m3'), current_setting('t.s1'), current_setting('t.tok_f1'))),
  'ERROR:P0001:freeze_active',
  'a freeze refuses raises — "no new grants" (PRD §7.5) — with the named signature');
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.set_grant(%L, %L, 'health', 'summary', null)) ->> 'after' $$,
  current_setting('t.m3'), current_setting('t.s1'))), 'summary',
  'a freeze permits lowers — containment never blocks reduction');
select is(pg_temp.scalar(
  $$ select (hc.adjudicate_freeze(
       (select f.id from public.freezes f
        where f.circle_id = current_setting('t.c1')::uuid and f.state = 'open'),
       'dismissed', 'Test adjudicator')) ->> 'outcome' $$), 'dismissed',
  'fixture: the freeze is dismissed');

-- ----------------------------------------------------------------------------
-- 23–30 · remove_member: one transaction, every §5.8 leg
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.remove_member(%L, array[%L::uuid])) ->> 'account_id' $$,
  current_setting('t.m5'), current_setting('t.sh_kept'))),
  current_setting('t.u5'),
  'a coordinator removes a member, keeping ONE named share; the account id returns so the app layer kills sessions (§5.8)');

select is(pg_temp.scalar(format(
  $$ select (m.removed_at is not null and m.removed_by = %L)::text
     from public.circle_members m where m.id = %L $$,
  current_setting('t.u1'), current_setting('t.m5'))), 'true',
  'the membership is removed, naming who removed it');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_grants where member_id = %L $$,
  current_setting('t.m5'))), '0',
  'every grant row is DELETED — absence is hidden, and ctx contributes nothing on the next query');

select is(pg_temp.scalar(format(
  $$ select (min((sh.id = %L)::int))::text from public.object_shares sh
     where sh.member_id = %L and sh.revoked_at is null $$,
  current_setting('t.sh_kept'), current_setting('t.m5'))), '1',
  'exactly the KEPT share survives — §5.8: revoked with the domain grant unless a coordinator explicitly keeps one');

select is(pg_temp.scalar(format(
  $$ select (t.owner_member_id is null and t.assigned_by is null
             and t.assigned_at is null and t.status = 'open')::text
     from public.tasks t where t.id = %L $$,
  current_setting('t.t_open'))), 'true',
  'the OPEN task is unassigned and surfaces for the coordinator (PRD §8.8)');

select is(pg_temp.scalar(format(
  $$ select (t.owner_member_id = %L and t.completed_by = %L)::text
     from public.tasks t where t.id = %L $$,
  current_setting('t.m5'), current_setting('t.u5'), current_setting('t.t_done'))),
  'true',
  'the DONE task keeps its holder and completion attribution — completed work stays attributed (§5.8)');

select is(pg_temp.scalar(format(
  $$ select (count(distinct l.occurred_at) = 1 and count(*) = 2)::text
     from public.access_log l
     where l.circle_id = %L
       and l.event_type in ('member_removed', 'task_unassigned') $$,
  current_setting('t.c1'))), 'true',
  'removal and unassignment are SEPARATE log entries with the SAME timestamp (PRD §8.8)');

select is(pg_temp.scalar(format(
  $$ select l.detail ->> 'former_owner_name'
     from public.access_log l
     where l.circle_id = %L and l.event_type = 'task_unassigned' $$,
  current_setting('t.c1'))), 'Trouble',
  'the unassignment entry labels who held the task');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log l
     where l.circle_id = %L and l.event_type = 'object_share_revoked' $$,
  current_setting('t.c1'))), '1',
  'each revoked share is its own access-log event (PRD §4.6.5); the kept one logs nothing');

-- ----------------------------------------------------------------------------
-- 31–33 · remove_member refusals
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.remove_member(%L, array[gen_random_uuid()])::text $$,
  current_setting('t.m3'))),
  'ERROR:P0001:remove_refused',
  'a keep-list naming a share that is not this member''s live share refuses WHOLE — an explicit decision, not a guess');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.remove_member(%L, null)::text $$, current_setting('t.ms'))),
  'ERROR:P0001:remove_refused',
  'the subject-member row cannot be removed — the subject''s standing is not membership to revoke');

do $$
begin
  -- leave u1 as the LAST live coordinator
  update public.circle_members
     set removed_at = now(), removed_by = current_setting('t.u1')::uuid
   where id = current_setting('t.m2')::uuid;
end $$;
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.remove_member(%L, null)::text $$, current_setting('t.m1'))),
  'ERROR:P0001:remove_refused',
  'the LAST live coordinator cannot be removed — transfer first (PRD §12.7); a circle is never orphaned');

select * from finish();
rollback;
