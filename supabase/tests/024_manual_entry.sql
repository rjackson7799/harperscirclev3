-- ============================================================================
-- 1C · U6 — MNL-01: manual entry end-to-end (ADR-0006 F9/Q12, the pinned
-- model). A manual entry is a SYNTHETIC arrival with an explicit 'manual'
-- channel, created WITH its proposal in ONE transaction by
-- hc.create_manual_proposal. proposals.arrival_id stays NOT NULL (§2.4 DDL
-- unchanged). The payload 'manual' flag must AGREE with the arrival's
-- channel — the contradiction constraint (hc.assert_manual_flag) lands
-- with this machinery because only it can create the state.
--
-- RED (U6): the channel CHECK still refuses 'manual' (23514); every
-- create_manual_proposal probe reports 42883; the contradiction probes
-- report no_error where manual_flag_mismatch is expected.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(17);

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

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m1 uuid; m2 uuid; a_email uuid;
  d hc.domain;
begin
  insert into public.accounts (id, kind, display_name)
  values (u1, 'member', 'Sarah'), (u2, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Manual one', u1) returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'mn1-' || substr(c1::text, 1, 8)) returning id into s1;
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
  a_email := hc.create_arrival(c1, s1, 'email', p_sender_address => 'x@y.example',
                               p_ingest_idempotency_key => 'mnl-email');
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.ae', a_email::text, true);
exception when others then
  perform set_config('t.u1', gen_random_uuid()::text, true);
  perform set_config('t.u2', gen_random_uuid()::text, true);
  perform set_config('t.c1', gen_random_uuid()::text, true);
  perform set_config('t.s1', gen_random_uuid()::text, true);
  perform set_config('t.ae', gen_random_uuid()::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · The channel constraint: 'manual' is legal DDL now; 'sms' still is not.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ with x as (insert into public.arrivals (circle_id, subject_id, channel, state)
                values (%L, %L, 'manual', 'proposals_ready') returning id)
     select count(*)::text from x $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  '1',
  'the widened CHECK accepts the manual channel (annex A5 delta, ADR-0007)');

select is(pg_temp.scalar(format(
  $$ with x as (insert into public.arrivals (circle_id, subject_id, channel)
                values (%L, %L, 'sms') returning id)
     select count(*)::text from x $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'ERROR:23514',
  'sms stays refused — Phase 2 is still an explicit migration away');

-- ----------------------------------------------------------------------------
-- 3–7 · The happy path: one call, one transaction, two rows.
-- ----------------------------------------------------------------------------
select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.create_manual_proposal(%L, %L, 'task',
       jsonb_build_object('title', 'Call the pharmacy')) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'no_error',
  'a coordinator drafts a manual task entry');

select is(pg_temp.scalar(format(
  $$ select a.channel || ':' || a.state::text || ':' ||
            (a.storage_key is null)::text || ':' ||
            (select count(*) from public.arrival_events e
             where e.arrival_id = a.id and e.from_state is null
               and e.to_state = 'proposals_ready'
               and e.reason_code = 'manual_entry')::text
     from public.arrivals a
     where a.circle_id = %L and a.channel = 'manual'
       and exists (select 1 from public.proposals p where p.arrival_id = a.id) $$,
  current_setting('t.c1'))),
  'manual:proposals_ready:true:1',
  'the synthetic arrival: manual channel, proposals_ready, no artifact, evented as manual_entry');

select is(pg_temp.scalar(format(
  $$ select p.status || ':' || (p.payload ->> 'manual') || ':' || p.taint::text
     from public.proposals p
     join public.arrivals a on a.id = p.arrival_id
     where a.circle_id = %L and a.channel = 'manual' $$,
  current_setting('t.c1'))),
  'pending:true:{schedule}',
  'the proposal is pending, flagged manual=true by the machinery, tainted by the drafting contract');

do $$
begin
  perform set_config('t.mp', coalesce(
    (select p.id::text from public.proposals p
     join public.arrivals a on a.id = p.arrival_id
     where a.circle_id = current_setting('t.c1')::uuid and a.channel = 'manual'),
    gen_random_uuid()::text), true);
end $$;

select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'mnl-idem-1') $$,
  current_setting('t.mp'))),
  'no_error',
  'the manual proposal approves through the SAME function as everything else (APR-04)');

select is(pg_temp.scalar(format(
  $$ select (t.source_arrival_id is null)::text || ':' || (t.source_proposal_id = %L)::text
     from public.tasks t
     where t.circle_id = %L and t.title = 'Call the pharmacy' $$,
  current_setting('t.mp'), current_setting('t.c1'))),
  'true:true',
  'the written object records manual provenance: null source_arrival_id, the proposal named (APR-04 as built)');

-- ----------------------------------------------------------------------------
-- 8–9 · The contradiction constraint, both directions (fixture-level:
-- only postgres can even attempt the lie).
-- ----------------------------------------------------------------------------
select is(pg_temp.errmsg(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint)
     values (%L, %L, %L, 'task', '{"title":"lie","manual":true}', '{schedule}') $$,
  current_setting('t.ae'), current_setting('t.c1'), current_setting('t.s1'))),
  'manual_flag_mismatch',
  'a manual-flagged proposal on an EMAIL arrival is unrepresentable');

select is(pg_temp.errmsg(format(
  $$ insert into public.proposals (arrival_id, circle_id, subject_id, kind, payload, taint)
     select a.id, %L, %L, 'task', '{"title":"unflagged"}', '{schedule}'
     from public.arrivals a where a.circle_id = %L and a.channel = 'manual' $$,
  current_setting('t.c1'), current_setting('t.s1'), current_setting('t.c1'))),
  'manual_flag_mismatch',
  'an unflagged proposal on a MANUAL arrival is unrepresentable — the flag and channel must agree');

-- ----------------------------------------------------------------------------
-- 10–12 · Refusals: document kind (no artifact to cite), oversized payload
-- (P5), and the one-transaction guarantee — a refused draft leaves NO
-- synthetic arrival behind.
-- ----------------------------------------------------------------------------
select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.create_manual_proposal(%L, %L, 'document',
       jsonb_build_object('title', 'Fake doc', 'category', 'legal')) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'proposal_invalid',
  'a manual DOCUMENT is refused — a document IS its artifact; the upload path owns that (ADR-0007)');

select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.create_manual_proposal(%L, %L, 'task',
       jsonb_build_object('title', repeat('x', 70000))) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'proposal_invalid',
  'the P5 payload cap binds manual drafting too');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrivals
     where circle_id = %L and channel = 'manual' $$,
  current_setting('t.c1'))),
  '2',
  'refused drafts left NO synthetic arrival behind — one transaction, all or nothing (the fixture row + the approved one)');

-- ----------------------------------------------------------------------------
-- 13–14 · Authorization on the drafted union; DEF-10 one shape.
-- ----------------------------------------------------------------------------
select is(pg_temp.msg_as_member(current_setting('t.u2')::uuid, format(
  $$ select hc.create_manual_proposal(%L, %L, 'timeline_event',
       jsonb_build_object('summary', 'Saw the cardiologist', 'kind', 'medical',
                          'occurred_on', '2026-08-01')) $$,
  current_setting('t.c1'), current_setting('t.s1'))) || ':' ||
  pg_temp.msg_as_member(current_setting('t.u2')::uuid, format(
  $$ select hc.create_manual_proposal(%L, %L, 'task', jsonb_build_object('title', 'x')) $$,
  gen_random_uuid()::text, gen_random_uuid()::text)),
  'draft_refused:draft_refused',
  'a schedule-only member cannot draft into health; a nonexistent circle refuses with the SAME shape (DEF-10)');

select is(pg_temp.msg_as_member(current_setting('t.u2')::uuid, format(
  $$ select hc.create_manual_proposal(%L, %L, 'task',
       jsonb_build_object('title', 'Refill run')) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'draft_refused',
  -- AMENDED AT ROUND 17 (ADR-0025 D3, packet Q-B), and the argument belongs
  -- here rather than only in a commit message, because this assertion was
  -- GREEN and the round inverted it. Until 6A M2, manage-over-the-drafted-
  -- union authorized BOTH halves: Priya (family, manage on `schedule` alone)
  -- could draft this task AND approve it. M2 narrowed approve to view×5 and
  -- said nothing about creation, which left her able to create an item only
  -- somebody else could decide — 060 case 16 pinned exactly that, open, and
  -- carried it to the round. Q-B closes it at creation.
  --
  -- THE COST IS REAL AND IS NOT HIDDEN: manual entry now requires view×5, so
  -- a below-cliff member loses it entirely rather than losing only the half
  -- M2 took. The alternative the round considered and REJECTED was exempting
  -- manual entries from the approve gate, which would make manual entry the
  -- one path that writes to the record without the evidence gate §3.7 exists
  -- to enforce. 064 case 16 drives the other way: manage×5 implies view×5, so
  -- the coordinator the product expects to use manual entry is untouched.
  'the same member can NO LONGER draft where they hold manage on the drafted union alone — "you cannot create what you cannot approve" (round 17, Q-B)');

-- ----------------------------------------------------------------------------
-- 15–16 · Freeze refuses drafting (no ingestion processing, §3.8) and
-- nothing is written.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
exception when others then null;
end $$;

select is(pg_temp.msg_as_member(current_setting('t.u1')::uuid, format(
  $$ select hc.create_manual_proposal(%L, %L, 'task', jsonb_build_object('title', 'frozen')) $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'freeze_active',
  'manual drafting refuses under a freeze with the named signature');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrivals where circle_id = %L and channel = 'manual' $$,
  current_setting('t.c1'))),
  '2',
  -- RE-PINNED AT ROUND 17 in the same commit as the change that forced it:
  -- the `Refill run` draft above is now refused (Q-B), so the count that
  -- proves the FROZEN draft wrote nothing loses that row and nothing else.
  'the frozen draft wrote nothing (fixture + approved only — the refill draft is refused at round 17, case 14)');

-- ----------------------------------------------------------------------------
-- 17 · EXECUTE closure.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar($$
  select (has_function_privilege('authenticated',
            'hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)', 'execute')
      and not has_function_privilege('hc_pipeline',
            'hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)', 'execute')
      and not has_function_privilege('hc_admin',
            'hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)', 'execute'))::text $$),
  'true',
  'manual entry is a MEMBER act: authenticated only (catalog-asserted, PLT-04)');

select * from finish();
rollback;
