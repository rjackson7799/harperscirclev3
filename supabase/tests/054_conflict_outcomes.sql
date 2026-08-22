-- ============================================================================
-- 5A · M4 — conflict outcomes: CNF-01's lifted refusal (docs/review/
-- slice-5-plan.md M4; TSD §4.8/§4.9; Q9 SETTLED). The contract these
-- tests pin:
--
--   · USE THE NEW ONE: proposal closes approved; a new profile_facts row
--     + superseded_at/superseded_by_id on the old IN ONE transaction,
--     both provenances intact; proposal_commits claims the NEW fact row;
--     the profile_facts_current partial unique stays the only path — no
--     quiet overwrite exists.
--   · KEEP WHAT'S THERE: proposal closes rejected with the decider
--     recorded; NOTHING written to the record; no commit row; the
--     conflict logged.
--   · KEEP BOTH AND ASK (Q9): proposal closes approved and the TASK
--     COMMITS as the approval's one object (proposal_commits: conflict →
--     task; UNASSIGNED — assignment stays human and separate, §3.6; no
--     second approval — the person's choice IS the decision).
--   · THE IDEMPOTENCY IDENTITY INCLUDES THE OUTCOME: a replayed key with
--     the SAME outcome replays the stored result; the same key with a
--     DIFFERENT outcome conflicts, writing nothing (the ING-11 pattern).
--   · One proposal, one object, one transaction throughout; §4.9
--     versioning rides as-is (version race + double-approve pinned);
--     high-risk confirmation gates the outcome that writes a VALUE
--     (use_new) — rejecting or task-drafting is not a value approval.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(23);

-- ----------------------------------------------------------------------------
-- Helpers (the 043/051 pattern, plus a message-capturing probe for the
-- named refusal signatures past the authorization boundary).
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

create function pg_temp.probe(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function pg_temp.probe_msg(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then p_out
              else p_out::jsonb ->> p_field end;
$$;

create function pg_temp.tq(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures: Rosa founds c1/Nell; one arrival; three CURRENT facts on the
-- record; conflicts drafted through the REAL drafting path
-- (hc.draft_proposal — parents carried, union taint at draft).
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Rosa');
  perform set_config('t.u1', u1::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', 'cc54-nell-' || substr(gen_random_uuid()::text, 1, 8))),
    '{}'::text[])::text
$sql$), true);

do $$
declare
  v_u1 uuid := current_setting('t.u1')::uuid;
  v_c1 uuid := (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid;
  v_nell uuid; a1 uuid;
  f_dose uuid; f_allergy uuid; f_diet uuid;
  cf1 uuid; cf2 uuid; cf3 uuid; cf4 uuid; cf5 uuid; tp1 uuid;
begin
  if v_c1 is null then return; end if;   -- red leg: fail cleanly
  select s.id into v_nell from public.subjects s where s.circle_id = v_c1;

  insert into public.arrivals (circle_id, subject_id, channel, state)
  values (v_c1, v_nell, 'upload', 'interpreting'::hc.arrival_state)
  returning id into a1;

  insert into public.profile_facts
    (circle_id, subject_id, field, value, risk_class, domain, approved_by,
     approved_at, approver_display_name, taint)
  values
    (v_c1, v_nell, 'medication_lisinopril_dose', '"10mg daily"'::jsonb,
     'high'::hc.risk_class, 'health'::hc.domain, v_u1, now() - interval '30 days',
     'Rosa', array['health']::hc.domain[])
  returning id into f_dose;
  insert into public.profile_facts
    (circle_id, subject_id, field, value, risk_class, domain, approved_by,
     approved_at, approver_display_name, taint)
  values
    (v_c1, v_nell, 'allergy_status', '"penicillin"'::jsonb,
     'high'::hc.risk_class, 'health'::hc.domain, v_u1, now() - interval '60 days',
     'Rosa', array['health']::hc.domain[])
  returning id into f_allergy;
  insert into public.profile_facts
    (circle_id, subject_id, field, value, risk_class, domain, approved_by,
     approved_at, approver_display_name, taint)
  values
    (v_c1, v_nell, 'diet_note', '"low sodium"'::jsonb,
     'standard'::hc.risk_class, 'health'::hc.domain, v_u1, now() - interval '10 days',
     'Rosa', array['health']::hc.domain[])
  returning id into f_diet;

  begin
    cf1 := hc.draft_proposal(a1, v_c1, v_nell, 'conflict'::hc.proposal_kind,
      jsonb_build_object(
        'field', 'medication_lisinopril_dose', 'value', '20mg daily',
        'risk_class', 'high', 'domain', 'health',
        'parents', jsonb_build_array(jsonb_build_object('type', 'profile_fact', 'id', f_dose)),
        'task', jsonb_build_object('title', 'Confirm the new dose with Dr. Osei')));
    cf2 := hc.draft_proposal(a1, v_c1, v_nell, 'conflict'::hc.proposal_kind,
      jsonb_build_object(
        'field', 'allergy_status', 'value', 'no known allergies',
        'risk_class', 'high', 'domain', 'health',
        'parents', jsonb_build_array(jsonb_build_object('type', 'profile_fact', 'id', f_allergy))));
    cf3 := hc.draft_proposal(a1, v_c1, v_nell, 'conflict'::hc.proposal_kind,
      jsonb_build_object(
        'field', 'diet_note', 'value', 'high protein',
        'risk_class', 'standard', 'domain', 'health',
        'parents', jsonb_build_array(jsonb_build_object('type', 'profile_fact', 'id', f_diet)),
        'task', jsonb_build_object('title', 'Ask which diet note stands',
                                   'detail', 'Two sources disagree')));
    cf4 := hc.draft_proposal(a1, v_c1, v_nell, 'conflict'::hc.proposal_kind,
      jsonb_build_object(
        'field', 'diet_note', 'value', 'gluten free',
        'risk_class', 'standard', 'domain', 'health',
        'parents', jsonb_build_array(jsonb_build_object('type', 'profile_fact', 'id', f_diet))));
    cf5 := hc.draft_proposal(a1, v_c1, v_nell, 'conflict'::hc.proposal_kind,
      jsonb_build_object(
        'field', 'allergy_status', 'value', 'shellfish',
        'risk_class', 'high', 'domain', 'health',
        'parents', jsonb_build_array(jsonb_build_object('type', 'profile_fact', 'id', f_allergy)),
        'task', jsonb_build_object('title', 'Check the allergy record')));
    tp1 := hc.draft_proposal(a1, v_c1, v_nell, 'task'::hc.proposal_kind,
      jsonb_build_object('title', 'A plain task proposal'));
  exception when others then null;   -- red leg: drafts absent, tests fail cleanly
  end;

  perform set_config('t.c1', v_c1::text, true);
  perform set_config('t.nell', v_nell::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.f_dose', f_dose::text, true);
  perform set_config('t.f_allergy', f_allergy::text, true);
  perform set_config('t.f_diet', f_diet::text, true);
  perform set_config('t.cf1', coalesce(cf1::text, ''), true);
  perform set_config('t.cf2', coalesce(cf2::text, ''), true);
  perform set_config('t.cf3', coalesce(cf3::text, ''), true);
  perform set_config('t.cf4', coalesce(cf4::text, ''), true);
  perform set_config('t.cf5', coalesce(cf5::text, ''), true);
  perform set_config('t.tp1', coalesce(tp1::text, ''), true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · The surface.
-- ----------------------------------------------------------------------------
select has_column('public', 'approval_attempts', 'conflict_outcome',
  'approval_attempts.conflict_outcome exists — the idempotency identity includes the chosen outcome (Q9)');

select ok(exists (select 1 from hc.log_event_types where code = 'conflict_resolved'),
  'log_event_types gains conflict_resolved — every §4.8 outcome is an access-log event');

-- ----------------------------------------------------------------------------
-- 3–7 · USE THE NEW ONE.
-- ----------------------------------------------------------------------------
select set_config('t.r1', pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf1',
          '{"conflict_outcome":"use_new","confirm_high":true}'::jsonb)::text $sql$,
  current_setting('t.cf1'))), true);

select ok(
  pg_temp.jf(current_setting('t.r1'), 'status') = 'approved'
  and pg_temp.jf(current_setting('t.r1'), 'outcome') = 'use_new'
  and pg_temp.jf(current_setting('t.r1'), 'object_type') = 'profile_fact',
  'USE THE NEW ONE: the proposal closes approved with a profile_fact as its one object');

select is(pg_temp.tq(format($sql$
  select ((new_row.value = '"20mg daily"'::jsonb)
      and new_row.superseded_at is null
      and new_row.supersedes_id = %L::uuid
      and new_row.source_proposal_id = %L::uuid
      and new_row.source_arrival_id = %L::uuid
      and old_row.superseded_at is not null
      and old_row.superseded_by_id = new_row.id
      and old_row.source_arrival_id is null)::text
  from public.profile_facts new_row, public.profile_facts old_row
  where new_row.id = %L::uuid and old_row.id = %L::uuid $sql$,
  current_setting('t.f_dose'), current_setting('t.cf1'), current_setting('t.a1'),
  pg_temp.jf(current_setting('t.r1'), 'object_id'), current_setting('t.f_dose'))),
  'true',
  'the new row is current and names the old; the old is superseded and names the new — both provenances intact, one transaction');

select is(pg_temp.tq(format($sql$
  select count(*)::text from public.proposal_commits pc
  where pc.proposal_id = %L::uuid
    and pc.object_type = 'profile_fact'::hc.object_type
    and pc.object_id = %L::uuid $sql$,
  current_setting('t.cf1'), pg_temp.jf(current_setting('t.r1'), 'object_id'))), '1',
  'proposal_commits claims the NEW fact row — one proposal, one object');

select is(pg_temp.tq(format($sql$
  select count(*)::text from public.profile_facts pf
  where pf.subject_id = %L::uuid and pf.field = 'medication_lisinopril_dose'
    and pf.superseded_at is null $sql$,
  current_setting('t.nell'))), '1',
  'exactly ONE current row per (subject, field) — the partial unique stays the only path, no quiet overwrite exists');

select is(pg_temp.tq(format($sql$
  select count(*)::text from public.provenance_edges e
  where e.child_type = 'profile_fact'::hc.object_type
    and e.child_id = %L::uuid
    and e.parent_type = 'profile_fact'::hc.object_type
    and e.parent_id = %L::uuid $sql$,
  pg_temp.jf(current_setting('t.r1'), 'object_id'), current_setting('t.f_dose'))), '1',
  'the provenance edge links the new fact to the quoted old one');

-- ----------------------------------------------------------------------------
-- 8–9 · The outcome-bearing idempotency identity (Q9, the ING-11 pattern).
-- ----------------------------------------------------------------------------
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf1',
          '{"conflict_outcome":"use_new","confirm_high":true}'::jsonb)::text $sql$,
  current_setting('t.cf1'))),
  current_setting('t.r1'),
  'a replayed key with the SAME outcome replays the stored result byte-for-byte');

select ok(
  pg_temp.probe(current_setting('t.u1')::uuid, format(
    $sql$ select hc.approve_proposal(%L, 1, 'k-cf1',
            '{"conflict_outcome":"keep","confirm_high":true}'::jsonb)::text $sql$,
    current_setting('t.cf1'))) = 'ERROR:P0001'
  and pg_temp.tq(format($sql$
    select pf.value::text from public.profile_facts pf
    where pf.subject_id = %L::uuid and pf.field = 'medication_lisinopril_dose'
      and pf.superseded_at is null $sql$,
    current_setting('t.nell'))) = '"20mg daily"',
  'the SAME key with a DIFFERENT outcome conflicts and writes nothing — the identity includes the choice');

-- ----------------------------------------------------------------------------
-- 10–12 · KEEP WHAT''S THERE.
-- ----------------------------------------------------------------------------
select set_config('t.r2', pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf2',
          '{"conflict_outcome":"keep"}'::jsonb)::text $sql$,
  current_setting('t.cf2'))), true);

select ok(
  pg_temp.jf(current_setting('t.r2'), 'status') = 'rejected'
  and pg_temp.jf(current_setting('t.r2'), 'outcome') = 'keep'
  and pg_temp.tq(format($sql$
    select (p.status = 'rejected' and p.decided_by = %L::uuid
            and p.decided_at is not null)::text
    from public.proposals p where p.id = %L::uuid $sql$,
    current_setting('t.u1'), current_setting('t.cf2'))) = 'true',
  'KEEP WHAT''S THERE: the proposal closes rejected with the decider recorded');

select ok(
  pg_temp.tq(format($sql$
    select ((select count(*) from public.profile_facts pf
             where pf.subject_id = %L::uuid and pf.field = 'allergy_status') = 1
        and (select pf.value from public.profile_facts pf
             where pf.subject_id = %L::uuid and pf.field = 'allergy_status'
               and pf.superseded_at is null) = '"penicillin"'::jsonb
        and not exists (select 1 from public.proposal_commits pc
                        where pc.proposal_id = %L::uuid))::text $sql$,
    current_setting('t.nell'), current_setting('t.nell'),
    current_setting('t.cf2'))) = 'true',
  'NOTHING was written: the existing fact stands alone and unchanged, and no commit row exists');

select is(pg_temp.tq(format($sql$
  select count(*)::text from public.access_log l
  where l.circle_id = %L::uuid and l.event_type = 'conflict_resolved'
    and l.detail ->> 'outcome' = 'keep'
    and l.detail ->> 'proposal_id' = %L $sql$,
  current_setting('t.c1'), current_setting('t.cf2'))), '1',
  'the conflict is LOGGED — the keep decision is an access-log event with its outcome');

-- ----------------------------------------------------------------------------
-- 13–14 · KEEP BOTH AND ASK (Q9).
-- ----------------------------------------------------------------------------
select set_config('t.r3', pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf3',
          '{"conflict_outcome":"keep_both"}'::jsonb)::text $sql$,
  current_setting('t.cf3'))), true);

select ok(
  pg_temp.jf(current_setting('t.r3'), 'status') = 'approved'
  and pg_temp.jf(current_setting('t.r3'), 'outcome') = 'keep_both'
  and pg_temp.jf(current_setting('t.r3'), 'object_type') = 'task',
  'KEEP BOTH AND ASK: the proposal closes approved and the TASK is the approval''s one object — no second approval');

select is(pg_temp.tq(format($sql$
  select ((t.title = 'Ask which diet note stands')
      and (t.detail = 'Two sources disagree')
      and t.owner_member_id is null
      and t.status = 'open'
      and t.circle_id = %L::uuid and t.subject_id = %L::uuid
      and t.source_proposal_id = %L::uuid
      and exists (select 1 from public.proposal_commits pc
                  where pc.proposal_id = %L::uuid
                    and pc.object_type = 'task'::hc.object_type
                    and pc.object_id = t.id)
      and (select count(*) from public.profile_facts pf
           where pf.subject_id = %L::uuid and pf.field = 'diet_note') = 1)::text
  from public.tasks t where t.id = %L::uuid $sql$,
  current_setting('t.c1'), current_setting('t.nell'), current_setting('t.cf3'),
  current_setting('t.cf3'), current_setting('t.nell'),
  pg_temp.jf(current_setting('t.r3'), 'object_id'))), 'true',
  'the task is real, UNASSIGNED (§3.6), committed as the one object; the existing fact stands and no new fact was written');

-- ----------------------------------------------------------------------------
-- 15–19 · The refusal shapes.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf4a',
          '{"conflict_outcome":"keep_both"}'::jsonb)::text $sql$,
  current_setting('t.cf4'))), 'ERROR:P0001',
  'keep_both without a drafted task block refuses — the DB does not invent task copy (refuse-what-you-cannot-validate)');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf4b')::text $sql$,
  current_setting('t.cf4'))), 'ERROR:P0001',
  'a conflict approved WITHOUT an outcome refuses — the choice is the decision, and it is not optional');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-tp1',
          '{"conflict_outcome":"keep"}'::jsonb)::text $sql$,
  current_setting('t.tp1'))), 'ERROR:P0001',
  'a NON-conflict proposal carrying an outcome refuses — no kind borrows the identity it does not decide');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf5a',
          '{"conflict_outcome":"merge"}'::jsonb)::text $sql$,
  current_setting('t.cf5'))), 'ERROR:P0001',
  'an unknown outcome refuses — the three §4.8 outcomes are the whole vocabulary');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf1-again',
          '{"conflict_outcome":"use_new","confirm_high":true}'::jsonb)::text $sql$,
  current_setting('t.cf1'))), 'ERROR:P0001',
  'DOUBLE-APPROVE: a decided conflict refuses a fresh key — pending is the only approvable state');

-- ----------------------------------------------------------------------------
-- 20–22 · The named signatures past the authorization boundary.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe_msg(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 7, 'k-cf5b',
          '{"conflict_outcome":"use_new","confirm_high":true}'::jsonb)::text $sql$,
  current_setting('t.cf5'))), 'proposal_version_changed',
  'THE VERSION RACE: a stale expected_version refuses by name — nobody approves something other than what they read (§4.9)');

select is(pg_temp.probe_msg(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf5c',
          '{"conflict_outcome":"use_new"}'::jsonb)::text $sql$,
  current_setting('t.cf5'))), 'high_risk_unconfirmed',
  'use_new on a HIGH-RISK value requires explicit confirmation (PRD §6.4) — the one outcome that writes a value');

select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf5d',
          '{"conflict_outcome":"keep","fields":{"value":"edited"}}'::jsonb)::text $sql$,
  current_setting('t.cf5'))), 'ERROR:P0001',
  'keep with field edits refuses — editing a value you are declining is incoherent, never accepted-and-ignored');

-- ----------------------------------------------------------------------------
-- 23 · The keep replay: rejected outcomes replay too.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe(current_setting('t.u1')::uuid, format(
  $sql$ select hc.approve_proposal(%L, 1, 'k-cf2',
          '{"conflict_outcome":"keep"}'::jsonb)::text $sql$,
  current_setting('t.cf2'))),
  current_setting('t.r2'),
  'a replayed KEEP replays its stored result — rejection is as idempotent as approval');

select * from finish();
rollback;
