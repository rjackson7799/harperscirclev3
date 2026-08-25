-- ============================================================================
-- 6A · M3 — THE LOOP CLOSES, AND IT CLOSES IN THE GRAPH.
-- docs/review/slice-6-plan.md M3; TSD §4.9, §4.2; PRD §4.2.2, §4.2.3,
-- AC-INBOX-4. Pinned here BEFORE the migration exists.
--
-- ---------------------------------------------------------------------------
-- WHAT WAS MISSING, enumerated live against the shipped schema rather than
-- assumed:
--
--   · NO PROPOSAL COULD EVER BE REJECTED. `proposals` has carried
--     `reject_reason` with its bounded vocabulary and the two CHECKs that
--     anticipate a rejection since 1B (20260815230001:83/:85) — and NOTHING
--     HAS EVER SATISFIED THEM. hc.approve_proposal writes 'rejected' for
--     exactly one case (5A M4's conflict `keep`) and there is no other
--     path. A person could approve or walk away.
--
--   · THE ARRIVAL HAD NO EXIT. `proposals_ready` appears in
--     hc.arrival_transitions EXACTLY ONCE, as a to_state
--     (20260816010009:66 — interpret: interpreting -> proposals_ready), and
--     never as a from_state. `filed` appears in NO transition row at all.
--     So every arrival that reached "Needs you" stayed there for ever,
--     whatever a person did — and hc.manual_entry has been creating
--     arrivals DIRECTLY at proposals_ready since 1C
--     (20260816010006:100), which have had no exit either. This arm is
--     theirs too (case 18).
--
-- ---------------------------------------------------------------------------
-- THE STAGE COLUMN, AND A CONSTRAINT THIS FILE CHANGES DELIBERATELY.
-- `hc.arrival_transitions.stage` was `references hc.stage_budgets(stage)`,
-- and hc.stage_budgets is the WORKER budget table: entry_state (UNIQUE),
-- max_attempts, lease_seconds, exhaust_state, exhaust_reason — every column
-- NOT NULL and every one meaningless for a human decision. Seeding a
-- 'review' row there would have been actively wrong:
--
--   · hc.claim_stage(arrival, 'review') would become a LEGAL CALL for any
--     hc_pipeline worker (20260816010004:50 looks the budget up by name and
--     proceeds), so a worker could take a LEASE over an arrival that is
--     waiting for a person, and drive it to an invented `exhaust_state`;
--   · `entry_state` is UNIQUE, so `proposals_ready` would become a claimable
--     stage entry and hc.outbox_drain would start resolving a stage for it;
--   · pgTAP 019:98-110 pins hc.stage_budgets as EXACTLY the five §4.3
--     stages, and 'review' is not one — it is a stage of the LOOP.
--
-- So M3 replaces the foreign key with a CLOSED CHECK over the known stages.
-- The graph stays closed, seeded and typo-proof (case 2), hc.stage_budgets
-- stays exactly the five worker stages with 019 untouched, and no worker can
-- ever lease a review. The FK's invariant is not weakened by accident; it is
-- retired because it stopped being true.
--
-- ---------------------------------------------------------------------------
-- THE TERMINALIZATION RULE IS SETTLED IN THE DATABASE, NOT IN THE APP:
-- an arrival terminalizes when EVERY LIVE PROPOSAL IS DECIDED — `filed` if
-- at least one closed approved/edited_approved, `nothing_filed` otherwise —
-- evaluated INSIDE THE DECIDING TRANSACTION, so the last decision and the
-- terminal transition commit together or not at all. AC-INBOX-4's letter.
-- 'superseded' and 'void' are pipeline outcomes and hold nothing open
-- (case 15). The ORIGINAL ARTIFACT IS UNTOUCHED EITHER WAY (case 19).
--
-- The two reason codes this arm writes were seeded long ago and have never
-- been used by anything: `proposal_approved_filed` and
-- `all_proposals_rejected`. The database has been waiting for this arm.
--
-- ING-10's exact set (027) is re-pinned in the same commit as the append,
-- and 046's rank/label guard needs no re-pin — `filed` and `nothing_filed`
-- have carried their rank and their PRD §4.2.2 label since 1D, and this
-- migration adds NO enum value. Case 3 asserts exactly that, so "no product
-- vocabulary moved" is a check rather than a claim.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(19);

-- ----------------------------------------------------------------------------
-- Helpers.
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

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

create function pg_temp.tq(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  begin execute p_sql into v; exception when others then v := 'ERROR:' || sqlstate; end;
  return v;
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
-- Fixtures. Six arrivals, each parked at proposals_ready, each carrying the
-- proposal shape one case needs. u_coord holds manage×5 (and therefore
-- view×5, so M2's predicate is satisfied everywhere except case 10, which
-- exists to prove reject inherits it).
-- ----------------------------------------------------------------------------
do $$
declare
  u_coord   uuid := pg_temp.mk_user(gen_random_uuid());
  u_partial uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m_coord uuid; m_partial uuid;
  d text; k text;
  arr uuid;
begin
  insert into public.accounts (id, kind, display_name) values
    (u_coord, 'member', 'Rosa'), (u_partial, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Nell''s circle', u_coord)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'dp6-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_coord, 'coordinator', 'Rosa') returning id into m_coord;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_partial, 'family', 'Priya') returning id into m_partial;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_coord, s1, d::hc.domain, 'manage', u_coord);
  end loop;
  -- the Q7 composition again: manage on the taint, hidden across five
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_partial, s1, 'health'::hc.domain, 'manage', u_coord);

  foreach k in array array['reject','mixed','super','open','graph','partial','idem','art'] loop
    insert into public.arrivals (circle_id, subject_id, channel, state, storage_key,
                                 content_sha256, mime_detected, byte_size, page_count)
    values (c1, s1, 'upload', 'proposals_ready'::hc.arrival_state,
            'orig/circle/' || c1 || '/arrival/' || k, sha256(k::bytea),
            'application/pdf', 4096, 3)
    returning id into arr;
    perform set_config('t.a_' || k, arr::text, true);
  end loop;

  -- a_reject: two pending — both rejected ⇒ nothing_filed
  -- a_mixed:  two pending — one approved, one rejected ⇒ filed
  -- a_super:  one pending + one SUPERSEDED — the superseded must not hold it open
  -- a_open:   two pending — only one decided ⇒ stays proposals_ready
  -- a_partial/a_idem/a_art/a_graph: one pending each
  perform set_config('t.p_rej_a', gen_random_uuid()::text, true);
  perform set_config('t.p_rej_b', gen_random_uuid()::text, true);
  perform set_config('t.p_mix_a', gen_random_uuid()::text, true);
  perform set_config('t.p_mix_b', gen_random_uuid()::text, true);
  perform set_config('t.p_sup_live', gen_random_uuid()::text, true);
  perform set_config('t.p_sup_dead', gen_random_uuid()::text, true);
  perform set_config('t.p_open_a', gen_random_uuid()::text, true);
  perform set_config('t.p_open_b', gen_random_uuid()::text, true);
  perform set_config('t.p_partial', gen_random_uuid()::text, true);
  perform set_config('t.p_idem', gen_random_uuid()::text, true);
  perform set_config('t.p_art', gen_random_uuid()::text, true);

  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint) values
    (current_setting('t.p_rej_a')::uuid, current_setting('t.a_reject')::uuid, c1, s1,
     'task', jsonb_build_object('title', 'Pay the invoice'), '{schedule}'),
    (current_setting('t.p_rej_b')::uuid, current_setting('t.a_reject')::uuid, c1, s1,
     'timeline_event', jsonb_build_object('kind', 'care', 'summary', 'Visit logged',
       'occurred_on', '2026-08-14', 'occurred_zone', 'America/New_York'), '{health}'),
    (current_setting('t.p_mix_a')::uuid, current_setting('t.a_mixed')::uuid, c1, s1,
     'task', jsonb_build_object('title', 'Book the follow-up'), '{schedule}'),
    (current_setting('t.p_mix_b')::uuid, current_setting('t.a_mixed')::uuid, c1, s1,
     'timeline_event', jsonb_build_object('kind', 'care', 'summary', 'Second reading',
       'occurred_on', '2026-08-15', 'occurred_zone', 'America/New_York'), '{health}'),
    (current_setting('t.p_sup_live')::uuid, current_setting('t.a_super')::uuid, c1, s1,
     'task', jsonb_build_object('title', 'The live one'), '{schedule}'),
    (current_setting('t.p_open_a')::uuid, current_setting('t.a_open')::uuid, c1, s1,
     'task', jsonb_build_object('title', 'Decided'), '{schedule}'),
    (current_setting('t.p_open_b')::uuid, current_setting('t.a_open')::uuid, c1, s1,
     'timeline_event', jsonb_build_object('kind', 'care', 'summary', 'Still waiting',
       'occurred_on', '2026-08-16', 'occurred_zone', 'America/New_York'), '{health}'),
    (current_setting('t.p_partial')::uuid, current_setting('t.a_partial')::uuid, c1, s1,
     'profile_fact', jsonb_build_object('field', 'diet_note', 'value', 'low sodium',
       'risk_class', 'standard', 'domain', 'health'), '{health}'),
    (current_setting('t.p_idem')::uuid, current_setting('t.a_idem')::uuid, c1, s1,
     'task', jsonb_build_object('title', 'Replayed'), '{schedule}'),
    (current_setting('t.p_art')::uuid, current_setting('t.a_art')::uuid, c1, s1,
     'task', jsonb_build_object('title', 'The artifact must survive this'), '{schedule}');

  -- the superseded sibling: a pipeline outcome, so no decider (the 1B CHECK)
  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload,
                                taint, status)
  values (current_setting('t.p_sup_dead')::uuid, current_setting('t.a_super')::uuid, c1, s1,
          'task', jsonb_build_object('title', 'The superseded one'), '{schedule}', 'superseded');

  perform set_config('t.u_coord', u_coord::text, true);
  perform set_config('t.u_partial', u_partial::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1-3 · THE GRAPH. The two edges, the closed stage list that replaced the
--       worker-table FK, and the product vocabulary left exactly as it was.
-- ----------------------------------------------------------------------------
select is(
  (select string_agg(t.stage || ':' || t.from_state || '>' || t.to_state, ','
                     order by t.to_state::text)
     from hc.arrival_transitions t where t.from_state = 'proposals_ready'),
  'review:proposals_ready>filed,review:proposals_ready>nothing_filed',
  'proposals_ready finally has an EXIT: it appeared in the graph exactly once, as a to_state, and never as a from_state — every arrival that reached "Needs you" stayed there for ever, whatever a person did');

select is(
  pg_temp.tq($$ insert into hc.arrival_transitions (stage, from_state, to_state)
                values ('reviewww', 'proposals_ready', 'filed') $$),
  'ERROR:23514',
  'the stage column is still CLOSED — a typo is refused by a CHECK over the known stages, which is what replaced the hc.stage_budgets foreign key (seeding a review row THERE would have made hc.claim_stage(arrival, ''review'') a legal call for any worker)');

select is(
  pg_temp.call_as(current_setting('t.u_coord')::uuid,
    $$ select hc.state_rank('filed'::hc.arrival_state)::text || '/' ||
              hc.state_label('filed'::hc.arrival_state) || '/' ||
              hc.state_label('nothing_filed'::hc.arrival_state) $$),
  '21/Filed/Nothing filed',
  '046 needs no re-pin and here is the check rather than the claim: filed and nothing_filed have carried their rank and their PRD §4.2.2 label since 1D, and this migration adds NO enum value');

-- ----------------------------------------------------------------------------
-- 4 · hc.reject_proposal exists, closed from the catalog (the segfault trap:
--     a function-ACL denial segfaults this image, so closure is READ).
-- ----------------------------------------------------------------------------
select ok(
  (select pg_get_userbyid(p.proowner) = 'hc_internal'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('hc_pipeline', p.oid, 'execute')
      and not has_function_privilege('hc_admin', p.oid, 'execute')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname = 'reject_proposal'),
  'hc.reject_proposal is a definer owned by hc_internal, executable by authenticated and nobody else — the mirror of approve, with the same reach');

-- ----------------------------------------------------------------------------
-- 5-8 · THE REJECTION ITSELF. The columns 1B anticipated and nothing has
--       ever satisfied; nothing written to the record; the bounded
--       vocabulary; and the reason genuinely OPTIONAL (§4.2.3's one tap).
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.reject_proposal(%L::uuid, 1, 'k-rej-a', 'wrong')) ->> 'status' $$,
  current_setting('t.p_rej_a'))),
  'rejected',
  'a proposal can be REJECTED — the reject_reason CHECK at 20260815230001:83 has waited since 1B and nothing had ever satisfied it');

select is(pg_temp.scalar(format(
  $$ select p.status || ':' || (p.decided_by is not null)::text || ':' ||
            (p.decided_at is not null)::text || ':' || coalesce(p.reject_reason, 'NULL')
       from public.proposals p where p.id = %L::uuid $$,
  current_setting('t.p_rej_a'))),
  'rejected:true:true:wrong',
  'the decider is recorded with the decision — status, decided_by, decided_at and the reason, which is what makes a rejection auditable rather than a disappearance');

select is(pg_temp.scalar(format(
  $$ select (select count(*)::text from public.proposal_commits c where c.proposal_id = %L::uuid)
         || ':' ||
            (select count(*)::text from public.tasks t where t.source_proposal_id = %L::uuid) $$,
  current_setting('t.p_rej_a'), current_setting('t.p_rej_a'))),
  '0:0',
  'and NOTHING reaches the record: no proposal_commits row, no object — a rejection is a decision, not a write');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select hc.reject_proposal(%L::uuid, 1, 'k-bogus', 'because_i_said_so')::text $$,
  current_setting('t.p_rej_b'))),
  'ERROR:P0001:approval_refused',
  'the reason vocabulary is BOUNDED IN THE MIGRATION (§4.2.3: wrong · already handled · not important · other) — a word outside it is refused before anything is written, never stored and shrugged at');

-- ----------------------------------------------------------------------------
-- 9-10 · Reject is approve's MIRROR: it inherits the version refusal and
--        M2's view×5 predicate. A decision is a write, and §3.7 re-checks
--        access at write time whichever way the decision goes.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select hc.reject_proposal(%L::uuid, 7, 'k-stale', 'wrong')::text $$,
  current_setting('t.p_rej_b'))),
  'ERROR:P0001:proposal_version_changed',
  'nobody rejects something other than what they read: the same p_expected_version refusal approve has, with the same distinct shape past the authorization boundary');

select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $$ select hc.reject_proposal(%L::uuid, 1, 'k-partial-rej', 'wrong')::text $$,
  current_setting('t.p_partial'))),
  'ERROR:P0001:approval_refused',
  'M2''s narrowing binds REJECT too: a member who cannot see the source cannot decide about it either way — rejecting a fact you cannot read is as blind as approving one');

-- ----------------------------------------------------------------------------
-- 11-12 · Idempotency, and the identity that includes the DECISION
--         (the ING-11 / 5A-M4 pattern extended to reject).
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.reject_proposal(%L::uuid, 1, 'k-idem', 'not_important')) ->> 'status' $$,
  current_setting('t.p_idem')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.reject_proposal(%L::uuid, 1, 'k-idem', 'not_important')) ->> 'status' $$,
  current_setting('t.p_idem'))),
  'rejected/rejected',
  'a double-tap replays the stored result rather than deciding twice — the same idempotency identity through approval_attempts that approve has carried since 1B');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-idem')::text $$,
  current_setting('t.p_idem'))),
  'ERROR:P0001:approval_refused',
  'THE IDENTITY INCLUDES THE DECISION: the same key presented for the OPPOSITE decision conflicts and writes nothing — otherwise a retried reject could return an approval''s result, or worse');

-- ----------------------------------------------------------------------------
-- 13-14 · THE TERMINAL ARM, case by case. The rule is settled HERE, not in
--         the app, and it commits inside the deciding transaction.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.reject_proposal(%L::uuid, 1, 'k-rej-b2', 'already_handled')) ->> 'arrival_state' $$,
  current_setting('t.p_rej_b'))),
  'nothing_filed',
  'REJECT-ALL ⇒ Nothing filed: the last decision and the terminal transition commit together or not at all (AC-INBOX-4)');

select is(pg_temp.scalar(format(
  $$ select a.state::text || ':' ||
            (select e.reason_code from public.arrival_events e
              where e.arrival_id = a.id and e.to_state = 'nothing_filed' limit 1)
       from public.arrivals a where a.id = %L::uuid $$,
  current_setting('t.a_reject'))),
  'nothing_filed:all_proposals_rejected',
  'and the event carries the reason code that was seeded long ago and had never been written by anything — the database had been waiting for this arm');

-- ----------------------------------------------------------------------------
-- 15-17 · filed, the superseded sibling, and the arrival that must STAY open.
-- ----------------------------------------------------------------------------
do $wrap$
begin
  -- tagged quotes both ways: a bare inner dollar-quote would close this block
  perform set_config('t.mix1', pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
    $q$ select (hc.approve_proposal(%L::uuid, 1, 'k-mix-a')) ->> 'status' $q$,
    current_setting('t.p_mix_a'))), true);
end $wrap$;

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.reject_proposal(%L::uuid, 1, 'k-mix-b', 'not_important')) ->> 'arrival_state' $$,
  current_setting('t.p_mix_b')))
  || '/' ||
  pg_temp.scalar(format(
  $$ select (select e.reason_code from public.arrival_events e
              where e.arrival_id = %L::uuid and e.to_state = 'filed' limit 1) $$,
  current_setting('t.a_mixed'))),
  'filed/proposal_approved_filed',
  'APPROVE-ONE ⇒ Filed: one closed approved/edited_approved is enough, and the rest being rejected does not undo it');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.reject_proposal(%L::uuid, 1, 'k-sup', 'wrong')) ->> 'arrival_state' $$,
  current_setting('t.p_sup_live'))),
  'nothing_filed',
  'a SUPERSEDED proposal does not hold the arrival open — superseded and void are pipeline outcomes, not undecided work, so the one live proposal was the only one that had to be decided');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.reject_proposal(%L::uuid, 1, 'k-open', 'wrong')) ->> 'arrival_state' $$,
  current_setting('t.p_open_a'))),
  'proposals_ready',
  'and an arrival with work still on it STAYS at "Needs you" — terminalization waits for EVERY live proposal, which is the half that makes item-level review real rather than decorative');

-- ----------------------------------------------------------------------------
-- 18 · THE GRAPH IS THE AUTHORITY, not the function. A worker holding a
--      VALID lease cannot drive the terminal transition: the edge belongs to
--      stage 'review' and to no worker stage.
-- ----------------------------------------------------------------------------
do $$
declare v_lease uuid;
begin
  insert into public.pipeline_leases (arrival_id, circle_id, stage, attempt_no, deadline)
  values (current_setting('t.a_graph')::uuid, current_setting('t.c1')::uuid,
          'interpret', 1, now() + interval '300 seconds')
  returning id into v_lease;
  update public.arrivals set current_lease_id = v_lease
   where id = current_setting('t.a_graph')::uuid;
  perform set_config('t.lease_graph', v_lease::text, true);
end $$;

select is(pg_temp.probe_role('hc_pipeline', format(
  $$ select hc.advance_arrival(%L::uuid, 'proposals_ready', 'filed', %L::uuid)::text $$,
  current_setting('t.a_graph'), current_setting('t.lease_graph'))),
  'invalid_state',
  'the graph refuses proposals_ready → filed from any stage other than review: a fenced worker lease authorizes its OWN stage''s edges and this edge is a person''s, so no pipeline path can file an arrival nobody decided');

-- ----------------------------------------------------------------------------
-- 19 · The manual arrivals get their exit too — they have been created
--      DIRECTLY at proposals_ready since 1C (20260816010006:100) with no way
--      out — AND the original artifact is untouched by either outcome.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.reject_proposal(
       ((hc.create_manual_proposal(%L::uuid, %L::uuid, 'task'::hc.proposal_kind,
          jsonb_build_object('title', 'A hand-typed task'))) ->> 'proposal_id')::uuid,
       1, 'k-manual-rej', 'other')) ->> 'arrival_state' $$,
  current_setting('t.c1'), current_setting('t.s1')))
  || '/' ||
  pg_temp.scalar(format(
  $$ select (a.storage_key is not null and a.content_sha256 is not null
             and a.deleted_at is null)::text
       from public.arrivals a where a.id = %L::uuid $$,
  current_setting('t.a_reject'))),
  'nothing_filed/true',
  'hc.manual_entry''s arrivals reach a terminal too (they have rested at proposals_ready with no exit since 1C) — and the ORIGINAL ARTIFACT is untouched by either outcome: nothing_filed files nothing and destroys nothing, so the source stays readable (AC-INBOX-4)');

select * from finish();

rollback;
