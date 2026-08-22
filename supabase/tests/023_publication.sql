-- ============================================================================
-- 1C · U5 — publication is ONE transaction and the transition gates it
-- (TSD §4.5): hc.finalize_extraction / hc.finalize_interpretation call the
-- CAS first; hc.write_extractions / hc.write_proposals run only on a won
-- transition and commit with it or not at all. hc_pipeline holds NO direct
-- DML on extractions or proposals (019:37 pins the privilege half).
--
-- The 1C drafting contract (APR-03/APR-09): a drafted proposal's taint is
-- own_domain ∪ parents' CURRENT taints AT DRAFT — so an unchanged parent
-- approves cleanly and a post-draft growth refuses with
-- proposal_taint_changed. Payload/fact caps land here (ADR-0006 P5).
--
-- hc.cancel_arrival (§4.5): a member who can approve; freeze-first order
-- as ruled at Q5; refusal shapes: cancel_refused (nonexistent AND
-- unauthorized, DEF-10), freeze_active, cancel_invalid_state (post-
-- authorization, like proposal_version_changed).
--
-- RED (U5): every probe reports 42883 (undefined_function).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(25);

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

create function pg_temp.errmsg(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql;
  return 'no_error';
exception when others then
  get stacked diagnostics v := message_text;
  return v;
end $$;

-- run one statement under a member's claims as authenticated, return
-- message_text on error / 'no_error'
create function pg_temp.msg_as_member(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := message_text;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
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

-- an arrival parked at 'extracting' with a live extract lease
create function pg_temp.mk_extracting(p_key text) returns table (arrival uuid, lease uuid)
language plpgsql as $$
declare a uuid; r record;
begin
  a := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
                         'upload', p_ingest_idempotency_key => p_key);
  update public.arrivals set state = 'extracting' where id = a;
  -- Re-pinned at 5A M3: an extract claim carries the run identity, and
  -- the published facts' stamps must match it (m1/p1 throughout this file).
  select * into r from hc.claim_stage(a, 'extract', 'm1', 'p1');
  return query select a, r.lease_id;
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m1 uuid; m2 uuid; doc uuid := gen_random_uuid();
  arr0 uuid;
  d hc.domain;
begin
  insert into public.accounts (id, kind, display_name)
  values (u1, 'member', 'Sarah'), (u2, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Pub one', u1) returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'pb1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  foreach d in array enum_range(null::hc.domain) loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d, 'manage', u1);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m2, s1, 'schedule', 'manage', u1);
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  -- a finances-tainted parent document for the drafting contract
  arr0 := hc.create_arrival(c1, s1, 'upload', p_ingest_idempotency_key => 'pub-doc');
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc, c1, s1, 'Invoice', 'financial', arr0, now(), u1, now(), 'Sarah', '{finances}');
  perform set_config('t.doc', doc::text, true);
exception when others then
  perform set_config('t.u1', gen_random_uuid()::text, true);
  perform set_config('t.u2', gen_random_uuid()::text, true);
  perform set_config('t.c1', gen_random_uuid()::text, true);
  perform set_config('t.s1', gen_random_uuid()::text, true);
  perform set_config('t.doc', gen_random_uuid()::text, true);
end $$;

do $$
declare r record;
begin
  select * into r from pg_temp.mk_extracting('pub-1');
  perform set_config('t.a1', r.arrival::text, true);
  perform set_config('t.l1', r.lease::text, true);
exception when others then
  perform set_config('t.a1', gen_random_uuid()::text, true);
  perform set_config('t.l1', gen_random_uuid()::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–6 · The happy path: facts + drafted proposals land atomically with the
-- won transition; the drafting contract pins the taint.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select hc.finalize_extraction(%L, %L,
       jsonb_build_array(
         jsonb_build_object('field', 'invoice_total', 'value', '"812.00"'::jsonb,
                            'confidence', 0.91, 'risk_class', 'standard',
                            'citation', jsonb_build_object('page', 1),
                            'model_id', 'm1', 'prompt_version', 'p1')),
       jsonb_build_array(
         jsonb_build_object('kind', 'task',
           'payload', jsonb_build_object(
             'title', 'Pay the invoice',
             'parents', jsonb_build_array(jsonb_build_object('type', 'document', 'id', %L)))))
       )::text $$,
  current_setting('t.a1'), current_setting('t.l1'), current_setting('t.doc'))),
  'advanced',
  'finalize_extraction wins the transition and publishes facts + proposals in ONE transaction');

select is(pg_temp.scalar(format(
  $$ select state::text from public.arrivals where id = %L $$,
  current_setting('t.a1'))),
  'extracted', 'the arrival advanced with the publication');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.extractions
     where arrival_id = %L and field = 'invoice_total' $$,
  current_setting('t.a1'))),
  '1', 'the cited fact landed with the arrival''s own circle and subject');

select is(pg_temp.scalar(format(
  $$ select taint::text from public.proposals where arrival_id = %L and kind = 'task' $$,
  current_setting('t.a1'))),
  '{schedule,finances}',
  'the 1C drafting contract: drafted taint = own_domain ∪ parents'' CURRENT taints at draft (APR-03)');

select is(pg_temp.scalar(format(
  $$ select status || ':' || version::text
     from public.proposals where arrival_id = %L and kind = 'task' $$,
  current_setting('t.a1'))),
  'pending:1', 'the draft is a pending version-1 proposal');

do $$
begin
  perform set_config('t.p1', coalesce(
    (select p.id::text from public.proposals p
     where p.arrival_id = current_setting('t.a1')::uuid and p.kind = 'task'),
    gen_random_uuid()::text), true);
end $$;

select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'pub-idem-1') $$,
  current_setting('t.p1'))),
  'no_error',
  'a machinery-drafted proposal approves cleanly — drafted covers parents, no drift refusal (APR-09 contract)');

-- ----------------------------------------------------------------------------
-- 7–9 · Cancellation between the provider returning and finalization: the
-- A.5 orphan case. Nothing persisted, nothing shown.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  select * into r from pg_temp.mk_extracting('pub-2');
  perform set_config('t.a2', r.arrival::text, true);
  perform set_config('t.l2', r.lease::text, true);
exception when others then
  perform set_config('t.a2', gen_random_uuid()::text, true);
  perform set_config('t.l2', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.cancel_arrival(%L) $$, current_setting('t.a2'))),
  'no_error',
  'a member who can approve cancels the in-flight arrival (§4.5)');

select is(pg_temp.scalar(format(
  $$ select hc.finalize_extraction(%L, %L,
       jsonb_build_array(
         jsonb_build_object('field', 'late_fact', 'value', '"x"'::jsonb,
                            'confidence', 0.9, 'risk_class', 'standard',
                            'citation', jsonb_build_object('page', 1),
                            'model_id', 'm1', 'prompt_version', 'p1')),
       '[]'::jsonb)::text $$,
  current_setting('t.a2'), current_setting('t.l2'))),
  'cancelled',
  'the provider''s late result is DISCARDED — cancellation won the swap');

select is(pg_temp.scalar(format(
  $$ select (select count(*) from public.extractions where arrival_id = %L)::text || ':' ||
            (select count(*) from public.proposals   where arrival_id = %L)::text $$,
  current_setting('t.a2'), current_setting('t.a2'))),
  '0:0',
  'a cancelled arrival has NO committed extractions and NO proposals (A.5 orphan regression)');

-- ----------------------------------------------------------------------------
-- 10–12 · cancel_arrival mechanics and refusal shapes.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select a.state::text || ':' || (a.cancelled_by is not null)::text || ':' ||
            (select count(*) from public.arrival_events e
             where e.arrival_id = a.id and e.to_state = 'cancelled'
               and e.reason_code = 'cancelled_by_member')::text || ':' ||
            (select l.outcome from public.pipeline_leases l where l.id = %L)
     from public.arrivals a where a.id = %L $$,
  current_setting('t.l2'), current_setting('t.a2'))),
  'cancelled:true:1:cancelled',
  'cancellation records its actor, its event, and closes the open lease as cancelled');

select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.cancel_arrival(%L) $$, gen_random_uuid()::text)) || ':' ||
  pg_temp.msg_as_member(current_setting('t.u2')::uuid, format(
  $$ select hc.cancel_arrival(%L) $$, current_setting('t.a1'))),
  'cancel_refused:cancel_refused',
  'nonexistent and unauthorized cancels share ONE shape (DEF-10; u2 manages schedule only)');

do $$
begin
  perform set_config('t.arr0', coalesce(
    (select a.id::text from public.arrivals a
     where a.circle_id = current_setting('t.c1')::uuid
       and a.ingest_idempotency_key = 'pub-doc'),
    gen_random_uuid()::text), true);
end $$;

select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.cancel_arrival(%L) $$, current_setting('t.arr0'))),
  'cancel_invalid_state',
  'an arrival still at received is not cancellable (§4.5: extracting/extracted/interpreting only) — post-authorization shape');

-- ----------------------------------------------------------------------------
-- 13 · Freeze-first (Q5 order): freeze_active names itself to the authorized.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  select * into r from pg_temp.mk_extracting('pub-3');
  perform set_config('t.a3', r.arrival::text, true);
  perform set_config('t.l3', r.lease::text, true);
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
exception when others then
  perform set_config('t.a3', gen_random_uuid()::text, true);
  perform set_config('t.l3', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.cancel_arrival(%L) $$, current_setting('t.a3'))),
  'freeze_active',
  'cancel under a freeze refuses with the named FRZ-14-family signature');

do $$
begin
  perform hc.adjudicate_freeze(f.id, 'dismissed', 'Adjudicator R.',
                               p_outcome_note => 'no basis')
  from public.freezes f
  where f.circle_id = current_setting('t.c1')::uuid and f.state = 'open';
exception when others then null;
end $$;

-- ----------------------------------------------------------------------------
-- 14–20 · The P5 caps: every refusal writes NOTHING and the transition
-- rolls back with it (state stays extracting).
-- ----------------------------------------------------------------------------
select is(pg_temp.errmsg(format(
  $$ select hc.finalize_extraction(%L, %L,
       (select jsonb_agg(jsonb_build_object('field', 'f' || g, 'value', '"v"'::jsonb,
                'confidence', 0.5, 'risk_class', 'standard',
                'citation', jsonb_build_object('page', 1),
                'model_id', 'm1', 'prompt_version', 'p1'))
        from generate_series(1, 201) g),
       '[]'::jsonb) $$,
  current_setting('t.a3'), current_setting('t.l3'))),
  'extraction_invalid',
  'more than 200 facts in one publication is refused (P5 shape cap)');

select is(pg_temp.errmsg(format(
  $$ select hc.finalize_extraction(%L, %L,
       jsonb_build_array(jsonb_build_object('field', 'f', 'value', '"v"'::jsonb,
         'confidence', 0.5, 'risk_class', 'standard',
         'citation', jsonb_build_object('source', 'vibes'),
         'model_id', 'm1', 'prompt_version', 'p1')),
       '[]'::jsonb) $$,
  current_setting('t.a3'), current_setting('t.l3'))),
  'extraction_invalid',
  'an uncited fact is refused BY THE MACHINERY before the CHECK can even see it');

select is(pg_temp.errmsg(format(
  $$ select hc.finalize_extraction(%L, %L,
       jsonb_build_array(jsonb_build_object('field', 'f',
         'value', to_jsonb(repeat('x', 9000)),
         'confidence', 0.5, 'risk_class', 'standard',
         'citation', jsonb_build_object('page', 1),
         'model_id', 'm1', 'prompt_version', 'p1')),
       '[]'::jsonb) $$,
  current_setting('t.a3'), current_setting('t.l3'))),
  'extraction_invalid',
  'an oversized fact value is refused (P5 size cap)');

select is(pg_temp.errmsg(format(
  $$ select hc.finalize_extraction(%L, %L, '[]'::jsonb,
       jsonb_build_array(jsonb_build_object('kind', 'task',
         'payload', jsonb_build_object('title', repeat('x', 70000))))) $$,
  current_setting('t.a3'), current_setting('t.l3'))),
  'proposal_invalid',
  'an oversized proposal payload is refused (P5 size cap)');

select is(pg_temp.errmsg(format(
  $$ select hc.finalize_extraction(%L, %L, '[]'::jsonb,
       jsonb_build_array(jsonb_build_object('kind', 'task',
         'payload', jsonb_build_object('title', 't', 'parents',
           (select jsonb_agg(jsonb_build_object('type', 'document', 'id', %L))
            from generate_series(1, 21)))))) $$,
  current_setting('t.a3'), current_setting('t.l3'), current_setting('t.doc'))),
  'proposal_invalid',
  'more than 20 payload parents is refused (P5 shape cap)');

select is(pg_temp.errmsg(format(
  $$ select hc.finalize_extraction(%L, %L, '[]'::jsonb,
       jsonb_build_array(jsonb_build_object('kind', 'profile_fact',
         'payload', jsonb_build_object('field', 'blood_type', 'value', 'O+')))) $$,
  current_setting('t.a3'), current_setting('t.l3'))),
  'proposal_invalid',
  'a profile_fact draft with no declared domain is refused — own_domain is fail-closed (D3)');

select is(pg_temp.scalar(format(
  $$ select (select state::text from public.arrivals where id = %L) || ':' ||
            (select count(*) from public.extractions where arrival_id = %L)::text || ':' ||
            (select count(*) from public.proposals where arrival_id = %L)::text $$,
  current_setting('t.a3'), current_setting('t.a3'), current_setting('t.a3'))),
  'extracting:0:0',
  'every refused publication wrote NOTHING and the transition rolled back with it');

-- ----------------------------------------------------------------------------
-- 21 · A foreign extraction id cannot be cited by this arrival's draft.
-- ----------------------------------------------------------------------------
select is(pg_temp.errmsg(format(
  $$ select hc.finalize_extraction(%L, %L, '[]'::jsonb,
       jsonb_build_array(jsonb_build_object('kind', 'task',
         'payload', jsonb_build_object('title', 't'),
         'source_extraction_ids', jsonb_build_array(
           (select e.id from public.extractions e where e.arrival_id = %L limit 1))))) $$,
  current_setting('t.a3'), current_setting('t.l3'), current_setting('t.a1'))),
  'proposal_invalid',
  'source_extraction_ids must belong to THIS arrival');

-- ----------------------------------------------------------------------------
-- 22–23 · finalize_interpretation: the same gate, one stage later; a
-- conflict draft carries the union of the facts it quotes (A.4).
-- ----------------------------------------------------------------------------
do $$
declare a uuid; r record;
begin
  a := hc.create_arrival(current_setting('t.c1')::uuid, current_setting('t.s1')::uuid,
                         'upload', p_ingest_idempotency_key => 'pub-4');
  update public.arrivals set state = 'extracted' where id = a;
  select * into r from hc.claim_stage(a, 'interpret');
  perform set_config('t.a4', a::text, true);
  perform set_config('t.l4', r.lease_id::text, true);
exception when others then
  perform set_config('t.a4', gen_random_uuid()::text, true);
  perform set_config('t.l4', gen_random_uuid()::text, true);
end $$;

select is(pg_temp.scalar(format(
  $$ select hc.finalize_interpretation(%L, %L,
       jsonb_build_array(jsonb_build_object('kind', 'conflict',
         'payload', jsonb_build_object(
           'existing', 'medication 50mg', 'proposed', 'medication 100mg',
           'parents', jsonb_build_array(
             jsonb_build_object('type', 'document', 'id', %L))))))::text $$,
  current_setting('t.a4'), current_setting('t.l4'), current_setting('t.doc'))),
  'advanced',
  'finalize_interpretation gates interpreting → proposals_ready the same way');

select is(pg_temp.scalar(format(
  $$ select (select state::text from public.arrivals where id = %L) || ':' ||
            (select taint::text from public.proposals
             where arrival_id = %L and kind = 'conflict') $$,
  current_setting('t.a4'), current_setting('t.a4'))),
  'proposals_ready:{finances}',
  'the conflict draft carries the UNION of the facts it quotes — invisible below both (A.4)');

-- ----------------------------------------------------------------------------
-- 24 · A conflict with no parents cannot exist — it quotes nothing.
-- ----------------------------------------------------------------------------
select is(pg_temp.errmsg(format(
  $$ select hc.write_proposals(%L, %L,
       jsonb_build_array(jsonb_build_object('kind', 'conflict',
         'payload', jsonb_build_object('existing', 'x', 'proposed', 'y')))) $$,
  current_setting('t.a4'), current_setting('t.l4'))),
  'proposal_invalid',
  'a parentless conflict draft is refused — a conflict quotes an existing fact');

-- ----------------------------------------------------------------------------
-- 25 · EXECUTE closure.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar($$
  select (has_function_privilege('hc_pipeline', 'hc.finalize_extraction(uuid, uuid, jsonb, jsonb)', 'execute')
      and has_function_privilege('hc_pipeline', 'hc.finalize_interpretation(uuid, uuid, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'hc.finalize_extraction(uuid, uuid, jsonb, jsonb)', 'execute')
      and not has_function_privilege('hc_pipeline', 'hc.write_extractions(uuid, uuid, jsonb)', 'execute')
      and not has_function_privilege('hc_pipeline', 'hc.write_proposals(uuid, uuid, jsonb)', 'execute')
      and not has_function_privilege('authenticated', 'hc.write_proposals(uuid, uuid, jsonb)', 'execute')
      and has_function_privilege('authenticated', 'hc.cancel_arrival(uuid)', 'execute')
      and not has_function_privilege('hc_pipeline', 'hc.cancel_arrival(uuid)', 'execute')
      and not has_function_privilege('hc_admin', 'hc.cancel_arrival(uuid)', 'execute'))::text $$),
  'true',
  'closure: finalize_* are hc_pipeline''s; write_* are owner-only (§4.5); cancel is a member act');

select * from finish();
rollback;
