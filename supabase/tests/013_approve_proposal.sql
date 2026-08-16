-- ============================================================================
-- 1B · U6 — hc.approve_proposal() (TSD §3.7, §2.4): the ONLY writer of the
-- record. One proposal, one transaction; idempotent under its key;
-- write-time re-check on the D7 taint union; version check; FRZ-14 freeze
-- refusal (open AND unresolved); high-risk confirmation; the claim in
-- proposal_commits before the object; provenance edges + access log or
-- nothing. Belt-and-braces: the insert POLICY demands a claim at the row,
-- the deferred constraint TRIGGER demands it at statement end — they fail
-- in different places, and both are probed here.
--
-- "A second insert under one claim" needs no separate case: a claim names
-- ONE object_id, so any second row is an unclaimed row (P0001 here) or a
-- duplicate id (23505, pinned in 009/M1's unique). The absent batch
-- overload is pinned by 002's exact inventory.
--
-- RED (U6): the function does not exist — every call reports 42883; the
-- claim policies and triggers are absent, so both unclaimed-write probes
-- land wrong.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(34);

create function pg_temp.errcode_as(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := returned_sqlstate;
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

-- Run one statement as an authenticated user; return its scalar result, or
-- ERROR:<sqlstate>:<message> — the message is part of the pinned refusal
-- signature. Role switch inside (PLT-04 discipline).
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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- manage×5 approver
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- summary-level member
  u3 uuid := pg_temp.mk_user(gen_random_uuid());   -- care_circle member
  c1 uuid; c2 uuid; c3 uuid; s1 uuid; s2 uuid; s3 uuid;
  m1 uuid; m2 uuid; m3 uuid; mf2 uuid; mf3 uuid;
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid();
  doc_p uuid := gen_random_uuid();
  pf_old uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u3, 'member', 'Marisol');
  insert into public.circles (name, created_by) values ('Approve circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Frozen circle', u1)
    returning id into c2;
  insert into public.circles (name, created_by) values ('Unresolved circle', u1)
    returning id into c3;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'apv-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '98101', 'America/Los_Angeles', 'clay',
          'apv2-' || substr(c2::text, 1, 8)) returning id into s2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c3, 'Ruth', 'memory care', '60614', 'America/Chicago', 'moss',
          'apv3-' || substr(c3::text, 1, 8)) returning id into s3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'care_circle', 'Marisol') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u1, 'coordinator', 'Sarah') returning id into mf2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c3, u1, 'coordinator', 'Sarah') returning id into mf3;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1),
           (c1, m2, s1, d::hc.domain, 'summary', u1),
           (c1, m3, s1, d::hc.domain, 'manage', u1),
           (c2, mf2, s2, d::hc.domain, 'manage', u1),
           (c3, mf3, s3, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel) values
    (a1, c1, s1, 'upload'), (a2, c2, s2, 'upload'), (a3, c3, s3, 'upload');

  -- the freeze states: c2 open; c3 unresolved (unnarrowed)
  insert into public.freezes (circle_id) values (c2);
  insert into public.freezes (circle_id, state, adjudicated_at, adjudicated_by)
  values (c3, 'unresolved', now(), 'adjudicator');

  -- a finance-domain parent document for the D7 union case
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc_p, c1, s1, 'Invoice', 'financial', a1, now(), u1, now(), 'Sarah', '{finances}');

  -- an existing CURRENT profile fact, to be superseded by approval
  insert into public.profile_facts (id, circle_id, subject_id, field, value,
    risk_class, domain, approved_by, approved_at, approver_display_name, taint)
  values (pf_old, c1, s1, 'medications', '"metoprolol 50mg"', 'high', 'health',
          u1, now(), 'Sarah', '{health}');

  -- proposals
  perform set_config('t.prop_task', gen_random_uuid()::text, true);
  perform set_config('t.prop_doc',  gen_random_uuid()::text, true);
  perform set_config('t.prop_pf',   gen_random_uuid()::text, true);
  perform set_config('t.prop_tl',   gen_random_uuid()::text, true);
  perform set_config('t.prop_frz',  gen_random_uuid()::text, true);
  perform set_config('t.prop_unr',  gen_random_uuid()::text, true);
  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint) values
    (current_setting('t.prop_task')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Pay the invoice', 'due_on', '2026-09-01',
                        'due_zone', 'America/New_York',
                        'parents', jsonb_build_array(
                          jsonb_build_object('type', 'document', 'id', doc_p))),
     '{schedule}'),
    (current_setting('t.prop_doc')::uuid, a1, c1, s1, 'document',
     jsonb_build_object('title', 'Discharge summary', 'category', 'medical',
                        'summary_text', 'Home with follow-up.'),
     '{health}'),
    (current_setting('t.prop_pf')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'medications', 'value', 'metoprolol 25mg',
                        'risk_class', 'high', 'domain', 'health'),
     '{health}'),
    (current_setting('t.prop_tl')::uuid, a1, c1, s1, 'timeline_event',
     jsonb_build_object('kind', 'care', 'summary', 'Hand-typed entry',
                        'occurred_on', '2026-08-14', 'occurred_zone', 'America/New_York',
                        'manual', true),
     '{health}'),
    (current_setting('t.prop_frz')::uuid, a2, c2, s2, 'task',
     jsonb_build_object('title', 'Frozen-circle task'), '{schedule}'),
    (current_setting('t.prop_unr')::uuid, a3, c3, s3, 'task',
     jsonb_build_object('title', 'Unresolved-circle task'), '{schedule}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.m3', m3::text, true);
  perform set_config('t.doc_p', doc_p::text, true);
  perform set_config('t.pf_old', pf_old::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · The one writer exists, callable by authenticated members.
-- ----------------------------------------------------------------------------
select ok(to_regprocedure('hc.approve_proposal(uuid, int, text, jsonb, text)') is not null,
  'hc.approve_proposal has the §3.7 signature, verbatim');
select ok(coalesce(
  has_function_privilege('authenticated',
    to_regprocedure('hc.approve_proposal(uuid, int, text, jsonb, text)'), 'execute'),
  false),
  'EXECUTE granted to authenticated — approval is a member act');

-- ----------------------------------------------------------------------------
-- 3–10 · The full approval: object + claim + edges + log, or nothing.
-- ----------------------------------------------------------------------------
select is(substr(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-task-1')) ->> 'status' $$,
  current_setting('t.prop_task'))), 1, 8), 'approved',
  'a manage-holding member approves: the call commits and reports approved');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.proposal_commits where proposal_id = %L $$,
  current_setting('t.prop_task'))), '1',
  'the claim exists — one proposal, one object, as a table');

select is(pg_temp.scalar(format(
  $$ select t.taint::text from public.tasks t
     join public.proposal_commits pc on pc.object_id = t.id
     where pc.proposal_id = %L $$,
  current_setting('t.prop_task'))), '{schedule,finances}',
  'the object''s taint is the D7 union: own domain ∪ drafted ∪ parents — the invoice''s finances arrived');

select is(pg_temp.scalar(format(
  $$ select (t.approved_by = %L and t.approver_display_name = 'Sarah'
             and t.approved_at is not null and t.source_arrival_id = %L)::text
     from public.tasks t
     join public.proposal_commits pc on pc.object_id = t.id
     where pc.proposal_id = %L $$,
  current_setting('t.u1'), current_setting('t.a1'), current_setting('t.prop_task'))), 'true',
  'provenance is written with the object: approver, moment, display name, source (N1/N2)');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.provenance_edges e
     join public.proposal_commits pc on pc.object_id = e.child_id
     where pc.proposal_id = %L and e.parent_type = 'document' and e.parent_id = %L $$,
  current_setting('t.prop_task'), current_setting('t.doc_p'))), '1',
  'the provenance edge to the payload parent is written in the same transaction');

select is(pg_temp.scalar(format(
  $$ select (status = 'approved' and decided_by = %L and decided_at is not null)::text
     from public.proposals where id = %L $$,
  current_setting('t.u1'), current_setting('t.prop_task'))), 'true',
  'the proposal is decided by the human who decided it');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type = 'object_approved' $$,
  current_setting('t.c1'))), '1',
  'the approval is an access-log event');

select is(pg_temp.scalar(format(
  $$ select (result is not null and committed_at is not null)::text
     from public.approval_attempts where idempotency_key = 'k-task-1'
       and proposal_id = %L $$,
  current_setting('t.prop_task'))), 'true',
  'the result is recorded against the idempotency key');

-- ----------------------------------------------------------------------------
-- 11–12 · Idempotent replay: the same key returns the SAME result and
-- writes nothing new (AC-INBOX-12).
-- ----------------------------------------------------------------------------
select is(
  pg_temp.call_as(current_setting('t.u1')::uuid, format(
    $$ select (hc.approve_proposal(%L, 1, 'k-task-1')) ->> 'object_id' $$,
    current_setting('t.prop_task'))),
  pg_temp.scalar(format(
    $$ select object_id::text from public.proposal_commits where proposal_id = %L $$,
    current_setting('t.prop_task'))),
  'replaying the key returns the stored result — the same object, not a second one');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.tasks t
     join public.proposal_commits pc on pc.object_id = t.id
     where pc.proposal_id = %L $$,
  current_setting('t.prop_task'))), '1',
  'exactly one object row survives the replay');

-- ----------------------------------------------------------------------------
-- 13–16 · Refusals: version drift; stale grants; nonexistent — refused
-- with ONE shape for unauthorized-vs-nonexistent (DEF-10); care ceiling.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 7, 'k-doc-ver')::text $$,
  current_setting('t.prop_doc'))), 'ERROR:P0001:proposal_version_changed',
  'nobody approves something other than what they read — version drift refuses, re-render');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-doc-low')::text $$,
  current_setting('t.prop_doc'))), 'ERROR:P0001:approval_refused',
  'a summary-level member cannot approve — authorization is at WRITE time (PRD §4.2.9)');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-none')::text $$,
  gen_random_uuid())), 'ERROR:P0001:approval_refused',
  'a nonexistent proposal refuses with the SAME shape — no existence oracle');

select is(pg_temp.call_as(current_setting('t.u3')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-doc-cc')::text $$,
  current_setting('t.prop_doc'))), 'ERROR:P0001:approval_refused',
  'care_circle holds manage grants yet cannot approve — the §3.3 ceiling binds the writer too');

-- ----------------------------------------------------------------------------
-- 17–18 · FRZ-14: refusal under an OPEN freeze and under UNRESOLVED —
-- read-only means read-only.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-frz')::text $$,
  current_setting('t.prop_frz'))), 'ERROR:P0001:freeze_active',
  'FRZ-14: an open freeze refuses approval before anything else is learned');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-unr')::text $$,
  current_setting('t.prop_unr'))), 'ERROR:P0001:freeze_active',
  'FRZ-14: unresolved refuses too — the 1B carve-out restores reading, never writing');

-- ----------------------------------------------------------------------------
-- 19–24 · High-risk confirmation, then the supersession contract.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-pf-nc')::text $$,
  current_setting('t.prop_pf'))), 'ERROR:P0001:high_risk_unconfirmed',
  'a high-risk value is never approved un-confirmed (PRD §6.4)');

select is(substr(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-pf-ok',
             '{"confirm_high": true}'::jsonb)) ->> 'status' $$,
  current_setting('t.prop_pf'))), 1, 8), 'approved',
  'the confirmed high-risk value is approved');

select is(pg_temp.scalar(format(
  $$ select (superseded_at is not null)::text from public.profile_facts where id = %L $$,
  current_setting('t.pf_old'))), 'true',
  'the OLD current value is superseded in the same transaction — retained, marked');

select is(pg_temp.scalar(format(
  $$ select pf.value::text from public.profile_facts pf
     join public.proposal_commits pc on pc.object_id = pf.id
     where pc.proposal_id = %L $$,
  current_setting('t.prop_pf'))), '"metoprolol 25mg"',
  'the NEW value is the current row — supersede, never overwrite (AC-INBOX-6)');

select is(pg_temp.scalar(format(
  $$ select pf.domain::text from public.profile_facts pf
     join public.proposal_commits pc on pc.object_id = pf.id
     where pc.proposal_id = %L $$,
  current_setting('t.prop_pf'))), 'health',
  'the payload-declared domain is materialised on the fact (D3)');

select is(pg_temp.scalar(format(
  $$ select (supersedes_id = %L)::text from public.profile_facts pf
     join public.proposal_commits pc on pc.object_id = pf.id
     where pc.proposal_id = %L $$,
  current_setting('t.pf_old'), current_setting('t.prop_pf'))), 'true',
  'the new row names what it supersedes');

-- ----------------------------------------------------------------------------
-- 25–27 · Manual entry: the SAME function, source_arrival_id null,
-- provenance of exactly the same shape (N2, AC-TL-2).
-- ----------------------------------------------------------------------------
select is(substr(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-tl-man')) ->> 'status' $$,
  current_setting('t.prop_tl'))), 1, 8), 'approved',
  'a hand-typed timeline entry goes through the one writer');

select is(pg_temp.scalar(format(
  $$ select (source_arrival_id is null)::text from public.timeline_events tl
     join public.proposal_commits pc on pc.object_id = tl.id
     where pc.proposal_id = %L $$,
  current_setting('t.prop_tl'))), 'true',
  'manual entry: source_arrival_id is null — entered by hand, says so');

select is(pg_temp.scalar(format(
  $$ select (approved_by = %L and approver_display_name = 'Sarah')::text
     from public.timeline_events tl
     join public.proposal_commits pc on pc.object_id = tl.id
     where pc.proposal_id = %L $$,
  current_setting('t.u1'), current_setting('t.prop_tl'))), 'true',
  'manual entry carries provenance of exactly the same shape');

-- ----------------------------------------------------------------------------
-- 28–29 · An already-decided proposal cannot be approved again under a
-- NEW key; a used key bound to another proposal refuses.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-task-2')::text $$,
  current_setting('t.prop_task'))), 'ERROR:P0001:approval_refused',
  'a decided proposal refuses a fresh approval attempt — replay is only for the SAME key');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-task-1')::text $$,
  current_setting('t.prop_doc'))), 'ERROR:P0001:approval_refused',
  'a key bound to another proposal refuses — keys are not transferable');

-- ----------------------------------------------------------------------------
-- 30–31 · Unclaimed writes fail in BOTH places: the deferred constraint
-- trigger (statement end; binds even the maintenance path) and the insert
-- policy (at the row; binds hc_internal).
-- ----------------------------------------------------------------------------
select is(pg_temp.errcode_as('postgres', format(
  $$ do $x$ begin
       set constraints all immediate;
       insert into public.tasks (circle_id, subject_id, title,
         approved_by, approved_at, approver_display_name, taint)
       values (%L, %L, 'unclaimed', %L, now(), 'Sarah', '{schedule}');
     end $x$ $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1'))),
  'P0001',
  'an insert with no claim aborts at the deferred trigger — a record the model cannot explain never commits');

select is(pg_temp.errcode_as('hc_internal', format(
  $$ insert into public.tasks (circle_id, subject_id, title,
       approved_by, approved_at, approver_display_name, taint)
     values (%L, %L, 'unclaimed-internal', %L, now(), 'Sarah', '{schedule}') $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.u1'))),
  '42501',
  'the same write as hc_internal dies earlier, at the insert policy — belt AND braces, different places');

-- ----------------------------------------------------------------------------
-- 32–34 · No identity, no approval; write privilege inventory after M6.
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claims', '', true);
select is(pg_temp.errcode_as('postgres', format(
  $$ select hc.approve_proposal(%L, 1, 'k-anon')::text $$,
  current_setting('t.prop_doc'))), 'P0001',
  'no authenticated identity ⇒ refusal — the actor column cannot be null and is never defaulted');

select ok(coalesce(
      has_table_privilege('hc_internal', to_regclass('public.documents'), 'insert')
  and has_table_privilege('hc_internal', to_regclass('public.tasks'), 'insert')
  and has_table_privilege('hc_internal', to_regclass('public.timeline_events'), 'insert')
  and has_table_privilege('hc_internal', to_regclass('public.profile_facts'), 'insert')
  and has_table_privilege('hc_internal', to_regclass('public.episodes'), 'insert')
  and not has_table_privilege('hc_internal', to_regclass('public.documents'), 'delete'),
  false),
  'hc_internal now holds INSERT on the five — and still no DELETE anywhere');

select ok(coalesce(
      not has_table_privilege('authenticated', to_regclass('public.documents'), 'insert')
  and not has_table_privilege('hc_pipeline',   to_regclass('public.documents'), 'insert')
  and not has_table_privilege('hc_admin',      to_regclass('public.documents'), 'insert'),
  false),
  'no request-path role gained anything — a policy added later would still grant nothing (§3.7)');

select * from finish();
rollback;
