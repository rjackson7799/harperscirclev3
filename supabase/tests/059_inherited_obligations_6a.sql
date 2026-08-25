-- ============================================================================
-- 6A · M1 — the inherited-obligations batch, landing FIRST (the R8 / 5A M1
-- precedent: owner-queue DB items land before slice-proper work).
-- docs/review/slice-6-plan.md M1; ADR-0023 R4/F-12, R4/F-10.
-- Pinned here BEFORE the migration exists (the M6/M8 precedent, the red leg).
--
-- R4/F-12 — THE DEFECT. `hc.draft_proposal` guards a `profile_fact`'s
-- `domain` (20260816010005:94, "or (p_kind = 'profile_fact' and p_payload
-- ->> 'domain' is null)") and guards NOTHING ELSE about the payload's
-- ability to satisfy its destination. So a `profile_fact` payload carrying
-- a domain but no `field` DRAFTS CLEANLY, sits in the Care Inbox looking
-- exactly like every other item, and raises
--
--     23502  null value in column "field" of relation "profile_facts"
--
-- at `hc.approve_proposal` — a RAW POSTGRES ERROR at the moment a person
-- clicks approve. Slice 6 is the slice that builds that click, which is why
-- the finding is squarely this slice's.
--
-- THE PROPERTY THIS FILE PINS, and it is deliberately WIDER than the
-- finding's letter. The plan states the property as a class — "so 23502 can
-- never surface as a raw Postgres error at the moment a person clicks
-- approve" — and the class is not one column of one kind. Enumerated live
-- against information_schema, SEVEN payload-derived columns are NOT NULL with
-- no default and no guard between the payload and the insert:
--
--     profile_facts.field · profile_facts.value · profile_facts.risk_class
--     documents.title · tasks.title · timeline_events.summary
--     episodes.title
--
-- (`documents.category` and `timeline_events.kind` are already guarded —
-- `hc.own_domain` is fail-closed on both and raises `own_domain_undeclared`
-- before any write.) Guarding one and shipping SIX is the half-fix this
-- project's rounds exist to catch, so M1 guards the class.
--
-- AMENDED AT ROUND 17 (ADR-0025 D1), twice, and both amendments belong here
-- because this file is where the property is stated:
--   · The count above read SIX while the list under it named SEVEN and the
--     sentence after it said "shipping five". ADR-0024 and the packet both
--     say seven, which is right; only this header was wrong.
--   · The seven columns are the ORDINARY arm's. M1's guard block sits inside
--     hc.approve_proposal's `else` branch, and the CONFLICT arm's own guard
--     (20260824120003:492-497) checks `field`, `value` and `domain` and NOT
--     `risk_class` — which use_new writes into the same NOT NULL column at
--     :673. So the 23502 class this file pins as closed was open ONE ARM
--     OVER, in the same function, with no edit required. Closed at M6 and
--     driven at 064 case 5. The cases below are unchanged and still pass:
--     what was wrong was the SCOPE of the claim, not any assertion in it.
--
-- THE GUARD IS NON-BREAKING BY CONSTRUCTION, which is the argument for
-- taking the wider scope inside a MINOR finding's slot: every payload it
-- refuses is a payload that would have raised 23502 a few statements later.
-- Nothing that succeeds today changes. Cases 3 and 11 pin exactly that.
--
-- R4/F-10 — RECORDED, NOT TAKEN AT THIS LAYER, and case 13 is where the
-- decision lives. The finding reads: "A stage-2 duplicate always yields a
-- silent `invalid_state` at interpret, which §4.2 says means 'raise a defect
-- signal'. `processGate` warns; `processInterpret` returns it silently. Make
-- it a warn, or absorb it explicitly." The plan assigns it M1 + B3.
--
-- There is no DB half that does not CONTRADICT A DELIBERATE SHIPPED PIN.
-- pgTAP 055:453-456 already asserts that exact call and argues the verdict:
--
--     'a stage-2 suspect cannot be CLAIMED toward interpret — the wait is
--      the machinery's answer, not a queue accident'
--
-- Absorbing it in `hc.claim_stage` would turn that pin red and would say the
-- opposite of what 5A settled. So M1 takes the finding's OTHER remedy —
-- "make it a warn" — which is `processGate`'s shape applied to
-- `processInterpret`, and that is app-layer: it lands wholly at 6B B3.
-- Case 13 pins the DB behaviour as UNCHANGED so the decision is visible in
-- the suite rather than only in a document. Round 17 gets the question.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(13);

-- ----------------------------------------------------------------------------
-- Helpers (the 013 pattern: role switch inside, message part of the pin).
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

-- Run one statement as an authenticated user; return its scalar result, or
-- ERROR:<sqlstate>:<message>. The MESSAGE is the point of this file: the
-- whole finding is that the message today is Postgres's, not ours.
create function pg_temp.call_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
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

-- As the owner (hc.draft_proposal is revoked from every request role).
create function pg_temp.errmsg(p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  begin
    execute p_sql into v;
    return 'no_error';
  exception when others then
    get stacked diagnostics m := message_text;
    return m;
  end;
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

create function pg_temp.probe_role(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  execute p_sql into v;
  execute 'reset role';
  return v;
exception when others then
  execute 'reset role';
  return 'ERROR:' || sqlstate;
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures (the 013 shape): Rosa founds c1/Nell and holds manage on all five
-- domains, so NOTHING below is refused for authorization — every refusal
-- these cases see is the payload guard and only the payload guard.
--
-- The malformed proposals are inserted DIRECTLY rather than drafted, because
-- half of M1 is the draft-time guard: after the migration the drafting path
-- REFUSES them, so a fixture that drafted them could not exist. Direct
-- inserts also model the honest worry — rows already resting at `pending`
-- when the guard ships.
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- manage×5 approver
  c1 uuid; s1 uuid; m1 uuid;
  a1 uuid := gen_random_uuid();
  a_dup2 uuid := gen_random_uuid();                -- the R4/F-10 arrival
  d text;
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Rosa');
  insert into public.circles (name, created_by) values ('Nell''s circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'i6a-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Rosa') returning id into m1;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
  end loop;

  insert into public.arrivals (id, circle_id, subject_id, channel, state)
  values (a1, c1, s1, 'upload', 'proposals_ready');
  -- R4/F-10's arrival: a stage-2 suspect, parked exactly where 5A M5 parks it.
  insert into public.arrivals (id, circle_id, subject_id, channel, state)
  values (a_dup2, c1, s1, 'upload', 'duplicate_suspected_stage2'::hc.arrival_state);

  perform set_config('t.p_pf_nofield',   gen_random_uuid()::text, true);
  perform set_config('t.p_pf_novalue',   gen_random_uuid()::text, true);
  perform set_config('t.p_pf_norisk',    gen_random_uuid()::text, true);
  perform set_config('t.p_task_notitle', gen_random_uuid()::text, true);
  perform set_config('t.p_doc_notitle',  gen_random_uuid()::text, true);
  perform set_config('t.p_tl_nosummary', gen_random_uuid()::text, true);
  perform set_config('t.p_ep_notitle',   gen_random_uuid()::text, true);
  perform set_config('t.p_pf_good',      gen_random_uuid()::text, true);

  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint) values
    -- the finding's own shape: a domain, and no field
    (current_setting('t.p_pf_nofield')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('value', 'O+', 'risk_class', 'standard', 'domain', 'health'),
     '{health}'),
    (current_setting('t.p_pf_novalue')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'blood_type', 'risk_class', 'standard', 'domain', 'health'),
     '{health}'),
    (current_setting('t.p_pf_norisk')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'blood_type', 'value', 'O+', 'domain', 'health'),
     '{health}'),
    (current_setting('t.p_task_notitle')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('detail', 'A task with no title at all'), '{schedule}'),
    (current_setting('t.p_doc_notitle')::uuid, a1, c1, s1, 'document',
     jsonb_build_object('category', 'medical', 'summary_text', 'Home with follow-up.'),
     '{health}'),
    -- occurred_on/zone supplied so the ONLY unsatisfiable column is `summary`
    -- (timeline_events.temporal_shape is a CHECK — 23514 — a different class,
    -- named in this file's header and carried to round 17, not silently mixed in)
    (current_setting('t.p_tl_nosummary')::uuid, a1, c1, s1, 'timeline_event',
     jsonb_build_object('kind', 'care', 'occurred_on', '2026-08-14',
                        'occurred_zone', 'America/New_York'), '{health}'),
    (current_setting('t.p_ep_notitle')::uuid, a1, c1, s1, 'episode',
     jsonb_build_object('detail', 'An episode with no title'), '{memories}'),
    -- the control: well-formed, and it must still approve
    (current_setting('t.p_pf_good')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'blood_type', 'value', 'O+',
                        'risk_class', 'standard', 'domain', 'health'),
     '{health}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.a_dup2', a_dup2::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–3 · R4/F-12, the DRAFT-time half — "or is not drafted" (the plan's own
--       second branch). The guard goes exactly where `domain` is already
--       guarded, so the unapprovable item never reaches a person at all.
-- ----------------------------------------------------------------------------
select is(pg_temp.errmsg(format(
  $$ select hc.draft_proposal(%L::uuid, %L::uuid, %L::uuid, 'profile_fact'::hc.proposal_kind,
       jsonb_build_object('value', 'O+', 'risk_class', 'standard', 'domain', 'health')) $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1'))),
  'proposal_invalid',
  'R4/F-12 (draft): a profile_fact with a domain and NO FIELD is refused where domain is already guarded — it is never drafted, so nobody is ever shown an item that cannot be approved');

select is(pg_temp.errmsg(format(
  $$ select hc.draft_proposal(%L::uuid, %L::uuid, %L::uuid, 'profile_fact'::hc.proposal_kind,
       jsonb_build_object('field', 'blood_type', 'risk_class', 'standard', 'domain', 'health')) $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1'))),
  'proposal_invalid',
  'R4/F-12 (draft): and a profile_fact with no VALUE — profile_facts.value is NOT NULL too, and the same click would have raised the same raw error');

select isnt(pg_temp.scalar(format(
  $$ select hc.draft_proposal(%L::uuid, %L::uuid, %L::uuid, 'profile_fact'::hc.proposal_kind,
       jsonb_build_object('field', 'blood_type', 'value', 'O+',
                          'risk_class', 'standard', 'domain', 'health'))::text $$,
  current_setting('t.a1'), current_setting('t.c1'), current_setting('t.s1'))),
  null,
  'and a WELL-FORMED profile_fact still drafts — the guard narrows nothing that was already sound (023''s domain case stays exactly as it was)');

-- ----------------------------------------------------------------------------
-- 4–10 · R4/F-12, the APPROVE-time half — the whole 23502 class, in the
--        existing DEF-10 refusal shape. Every one of these returns
--        `ERROR:23502:null value in column …` on `main`.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-pf-nofield')::text $$,
  current_setting('t.p_pf_nofield'))),
  'ERROR:P0001:approval_refused',
  'R4/F-12 (approve): the drafted-before-the-guard profile_fact with no field refuses in the DEF-10 shape — never 23502, never Postgres''s words at a person''s click');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-pf-novalue')::text $$,
  current_setting('t.p_pf_novalue'))),
  'ERROR:P0001:approval_refused',
  'profile_facts.value is NOT NULL: an absent value refuses honestly');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-pf-norisk')::text $$,
  current_setting('t.p_pf_norisk'))),
  'ERROR:P0001:approval_refused',
  'profile_facts.risk_class is NOT NULL: an absent risk_class refuses honestly (and it is NOT the high-risk arm — that arm never fires when the key is absent, which is exactly why this one reached the insert)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-task-notitle')::text $$,
  current_setting('t.p_task_notitle'))),
  'ERROR:P0001:approval_refused',
  'tasks.title is NOT NULL — the same defect, one kind over; guarding the finding''s own column alone would have left SIX sibling columns unguarded');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-doc-notitle')::text $$,
  current_setting('t.p_doc_notitle'))),
  'ERROR:P0001:approval_refused',
  'documents.title is NOT NULL (category is already fail-closed through hc.own_domain; title never was)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-tl-nosummary')::text $$,
  current_setting('t.p_tl_nosummary'))),
  'ERROR:P0001:approval_refused',
  'timeline_events.summary is NOT NULL (kind is already fail-closed through hc.own_domain; summary never was)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-ep-notitle')::text $$,
  current_setting('t.p_ep_notitle'))),
  'ERROR:P0001:approval_refused',
  'episodes.title is NOT NULL — the class is closed, so "23502 can never surface at approve" is a property rather than a hope');

-- ----------------------------------------------------------------------------
-- 11–12 · The guard is a NARROWING OF CRASHES ONLY. A sound payload still
--         approves and still writes, and the refusals above wrote nothing.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select (r ->> 'status') || ':' || (r ->> 'object_type')
       from (select %L::jsonb as r) x $$,
  pg_temp.call_as(current_setting('t.u1')::uuid, format(
    $$ select hc.approve_proposal(%L::uuid, 1, 'k-pf-good')::text $$,
    current_setting('t.p_pf_good'))))),
  'approved:profile_fact',
  'the control still approves and still writes its object — the guard intercepts ONLY payloads that would have raised 23502, so nothing that passes today changes');

select is(pg_temp.scalar(format(
  $$ select (select count(*)::text from public.proposals p
              where p.arrival_id = %L::uuid and p.status = 'pending')
         || ':' ||
            (select count(*)::text from public.proposal_commits c
              join public.proposals p on p.id = c.proposal_id
             where p.arrival_id = %L::uuid) $$,
  current_setting('t.a1'), current_setting('t.a1'))),
  '8:1',
  'every refused approval wrote NOTHING — the seven malformed proposals plus case 3''s sound draft are still pending, and the single commit row belongs to the one proposal that was approvable');

-- ----------------------------------------------------------------------------
-- 13 · R4/F-10, RECORDED AS UNCHANGED. The DB half is declined because
--      pgTAP 055:453 already pins this exact call as deliberate machinery.
--      The remedy M1 takes is the finding's other one — "make it a warn" —
--      and that is `processInterpret`, which is 6B B3. The pin lives here so
--      the decision is visible in the suite, not only in a document.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe_role('hc_pipeline', format(
  $$ select result::text from hc.claim_stage(%L::uuid, 'interpret') $$,
  current_setting('t.a_dup2'))),
  'invalid_state',
  'R4/F-10: the stage-2 suspect still refuses the interpret claim with invalid_state — 055 argues that verdict deliberately ("the wait is the machinery''s answer, not a queue accident"), so the fix is the WARN in processInterpret (6B B3), never an absorption here that would turn a settled pin red');

select * from finish();

rollback;
