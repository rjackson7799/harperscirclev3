-- ============================================================================
-- 2A · M6 — the known-senders member surfaces (SND-02: TSD §5.3–§5.4;
-- PRD §4.2.8): hc.accept_sender · hc.revoke_sender · hc.expire_held_mail.
--
-- The contract these tests pin:
--   · hc.accept_sender(circle, address|domain) — coordinator-only,
--     exactly one of address/domain, refused under any freeze
--     (interactive access is closed, §7.5). Acceptance writes the live
--     known_senders row, logs sender_accepted, and RELEASES the
--     sender's held mail in the SAME transaction: for each matching
--     held_unknown_sender arrival it mints a real gate lease and
--     advances held → extracting through the CAS (the appended
--     transition edge), then enqueues a pipeline_outbox row so the
--     relay hands the arrival to the extract queue (RLY-01 pending;
--     the sweeper's stuck listing is the backstop, the FRZ-15
--     posture). An ADDRESS acceptance releases that exact address; a
--     DOMAIN acceptance releases the domain's mail. Nothing is ever
--     retroactively unfiled (§5.3).
--   · hc.revoke_sender(id) — coordinator-only, live-row-only,
--     effective immediately (the live-unique index + SND-01's
--     live-rows-only predicate), logged. A freeze does not block it:
--     revocation reduces reach.
--   · hc.expire_held_mail() — the §5.4 30-day expiry of unaccepted
--     stranger mail, sweeper-pattern (scheduler = the RLY-01 worker,
--     like run_taint_sweep): terminalizes held arrivals whose
--     held-event is older than 30 days to nothing_filed with reason
--     held_expired — SKIPPING frozen circles (§7.5: nothing is lost
--     under containment), arrivals whose sender is NOW accepted
--     (accepted-but-unreleased must never expire), and arrivals with
--     no held event (never destroy without evidence of age).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(24);

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

-- ----------------------------------------------------------------------------
-- Fixtures: c1 (coordinator u1, family u3, subject s1) with four
-- arrivals — three held (two clinic.example, one elsewhere), one scanned.
-- c2 frozen with one held arrival. c3 for the expiry ledger.
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u3 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; c2 uuid; c3 uuid; s1 uuid; s2 uuid; s3 uuid;
  a1 uuid := gen_random_uuid();  -- held, bob@clinic.example
  a2 uuid := gen_random_uuid();  -- held, news@clinic.example
  a3 uuid := gen_random_uuid();  -- held, other@elsewhere.example
  a4 uuid := gen_random_uuid();  -- scanned (not held)
  af uuid := gen_random_uuid();  -- held in the FROZEN circle
  ax1 uuid := gen_random_uuid(); -- expiry: 31 days old
  ax2 uuid := gen_random_uuid(); -- expiry: 29 days old
  ax3 uuid := gen_random_uuid(); -- expiry: 31 days old, sender accepted meanwhile
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u3, 'member', 'Dan');
  insert into public.circles (name, created_by) values ('Sender circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Frozen circle', u1)
    returning id into c2;
  insert into public.circles (name, created_by) values ('Expiry circle', u1)
    returning id into c3;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'snd1-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'at home', '98101', 'America/Los_Angeles', 'clay',
          'snd2-' || substr(c2::text, 1, 8)) returning id into s2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c3, 'Rosa', 'at home', '60601', 'America/Chicago', 'sage',
          'snd3-' || substr(c3::text, 1, 8)) returning id into s3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah'), (c2, u1, 'coordinator', 'Sarah'),
         (c3, u1, 'coordinator', 'Sarah');
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Dan');

  insert into public.arrivals (id, circle_id, subject_id, channel, state, sender_address) values
    (a1, c1, s1, 'email', 'held_unknown_sender', 'bob@clinic.example'),
    (a2, c1, s1, 'email', 'held_unknown_sender', 'news@clinic.example'),
    (a3, c1, s1, 'email', 'held_unknown_sender', 'other@elsewhere.example'),
    (a4, c1, s1, 'email', 'scanned',             'bob@clinic.example'),
    (af, c2, s2, 'email', 'held_unknown_sender', 'bob@clinic.example'),
    (ax1, c3, s3, 'email', 'held_unknown_sender', 'old@stranger.example'),
    (ax2, c3, s3, 'email', 'held_unknown_sender', 'young@stranger.example'),
    (ax3, c3, s3, 'email', 'held_unknown_sender', 'kept@practice.example');

  insert into public.arrival_events (arrival_id, circle_id, from_state, to_state,
                                     reason_code, occurred_at) values
    (ax1, c3, 'scanned', 'held_unknown_sender', 'sender_unknown', now() - interval '31 days'),
    (ax2, c3, 'scanned', 'held_unknown_sender', 'sender_unknown', now() - interval '29 days'),
    (ax3, c3, 'scanned', 'held_unknown_sender', 'sender_unknown', now() - interval '31 days'),
    -- the FROZEN circle's held arrival is also past 30 days: the frozen
    -- skip is what keeps it alive (nothing is lost under containment)
    (af, c2, 'scanned', 'held_unknown_sender', 'sender_unknown', now() - interval '31 days');

  -- accepted meanwhile, release lost — must NOT expire
  insert into public.known_senders (circle_id, address, accepted_by)
  values (c3, 'kept@practice.example', u1);

  insert into public.freezes (circle_id) values (c2);

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.c2', c2::text, true);
  perform set_config('t.c3', c3::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.a2', a2::text, true);
  perform set_config('t.a3', a3::text, true);
  perform set_config('t.a4', a4::text, true);
  perform set_config('t.af', af::text, true);
  perform set_config('t.ax1', ax1::text, true);
  perform set_config('t.ax2', ax2::text, true);
  perform set_config('t.ax3', ax3::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–3 · Shape and callers
-- ----------------------------------------------------------------------------
select has_function('hc', 'accept_sender', array['uuid', 'text', 'text'],
  'hc.accept_sender(circle, address, domain) exists');
select has_function('hc', 'revoke_sender', array['uuid'],
  'hc.revoke_sender(id) exists');
select is(
  array[has_function_privilege('authenticated', 'hc.accept_sender(uuid, text, text)', 'execute'),
        has_function_privilege('authenticated', 'hc.revoke_sender(uuid)', 'execute'),
        has_function_privilege('hc_pipeline',   'hc.expire_held_mail()', 'execute'),
        has_function_privilege('authenticated', 'hc.expire_held_mail()', 'execute')],
  array[true, true, true, false],
  'accept/revoke are member acts; expiry belongs to the scheduler identity (OPS-01 pattern), never to members');

-- ----------------------------------------------------------------------------
-- 4–10 · Acceptance releases the held mail — exactly that sender's
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u3')::uuid, format(
  $$ select hc.accept_sender(%L, 'bob@clinic.example', null)::text $$,
  current_setting('t.c1'))),
  'ERROR:P0001:sender_refused',
  'a family member cannot accept a sender — coordinator-only');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.accept_sender(%L, 'Bob@Clinic.Example', null)) ->> 'released_count' $$,
  current_setting('t.c1'))), '1',
  'a coordinator accepts the address (case-blind) and its ONE held arrival releases');

select is(pg_temp.scalar(format(
  $$ select a.state::text from public.arrivals a where a.id = %L $$,
  current_setting('t.a1'))), 'extracting',
  'the released arrival advanced held → extracting through the CAS');

select is(pg_temp.scalar(format(
  $$ select (l.stage = 'gate' and l.outcome = 'advanced' and l.closed_at is not null)::text
     from public.pipeline_leases l where l.arrival_id = %L $$,
  current_setting('t.a1'))), 'true',
  'the release minted a REAL gate lease and the advance closed it — the lease discipline holds');

select is(pg_temp.scalar(format(
  $$ select o.reason_code from public.pipeline_outbox o
     where o.arrival_id = %L and o.drained_at is null $$,
  current_setting('t.a1'))), 'sender_accepted_requeue',
  'the released arrival is queued for the extract worker (relay pending; the sweeper is the backstop)');

select is(pg_temp.scalar(format(
  $$ select a.state::text from public.arrivals a where a.id = %L $$,
  current_setting('t.a2'))), 'held_unknown_sender',
  'an ADDRESS acceptance releases that exact address only — the domain neighbour stays held');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.accept_sender(%L, null, 'clinic.example')) ->> 'released_count' $$,
  current_setting('t.c1'))), '1',
  'a DOMAIN acceptance releases the domain''s held mail');

-- ----------------------------------------------------------------------------
-- 11–14 · Acceptance refusals and the appended transition edge
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select a.state::text from public.arrivals a where a.id = %L $$,
  current_setting('t.a3'))), 'held_unknown_sender',
  'the stranger''s arrival is untouched by either acceptance');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.accept_sender(%L, 'bob@clinic.example', null)::text $$,
  current_setting('t.c1'))),
  'ERROR:P0001:sender_refused',
  'a duplicate live acceptance refuses — the live-unique index is the anchor');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.accept_sender(%L, 'x@y.example', 'y.example')::text $$,
  current_setting('t.c1'))),
  'ERROR:P0001:sender_refused',
  'exactly one of address/domain — both refuses (and neither would too)');

select is(
  (select count(*)::int from hc.arrival_transitions t
   where t.stage = 'gate' and t.from_state = 'held_unknown_sender'
     and t.to_state = 'extracting'),
  1, 'the release edge is IN the closed transition allowlist (ING-10 re-pinned same-commit)');

-- ----------------------------------------------------------------------------
-- 15–16 · Freeze: acceptance refuses; the held arrival stays held
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.accept_sender(%L, 'bob@clinic.example', null)::text $$,
  current_setting('t.c2'))),
  'ERROR:P0001:freeze_active',
  'acceptance under a freeze refuses with the named signature — interactive access is closed (§7.5)');
select is(pg_temp.scalar(format(
  $$ select a.state::text from public.arrivals a where a.id = %L $$,
  current_setting('t.af'))), 'held_unknown_sender',
  'the frozen circle''s held arrival did not move');

-- ----------------------------------------------------------------------------
-- 17–19 · Revocation: immediate, logged, live-only
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.revoke_sender((select ks.id from public.known_senders ks
              where ks.circle_id = %L and ks.address = 'bob@clinic.example'
                and ks.revoked_at is null))) ->> 'revoked' $$,
  current_setting('t.c1'))), 'true',
  'a coordinator revokes an accepted sender');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.access_log
     where circle_id = %L and event_type in ('sender_accepted', 'sender_revoked') $$,
  current_setting('t.c1'))), '3',
  'two acceptances and one revocation are access-log events');

select is(pg_temp.call_as(current_setting('t.u3')::uuid, format(
  $$ select hc.revoke_sender((select ks.id from public.known_senders ks
              where ks.circle_id = %L and ks.domain = 'clinic.example'))::text $$,
  current_setting('t.c1'))),
  'ERROR:P0001:sender_refused',
  'a family member cannot revoke — and an already-revoked row refuses in the same shape');

-- ----------------------------------------------------------------------------
-- 20–24 · The 30-day expiry of unaccepted stranger mail
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(
  $$ select (hc.expire_held_mail()) ->> 'expired_count' $$), '1',
  'one held arrival is past 30 days, unaccepted, unfrozen — exactly one expires');

select is(pg_temp.scalar(format(
  $$ select a.state::text from public.arrivals a where a.id = %L $$,
  current_setting('t.ax1'))), 'nothing_filed',
  'the expired arrival terminalizes to nothing_filed — the promise covers the family''s material, not strangers'' (§5.4)');

select is(pg_temp.scalar(format(
  $$ select e.reason_code from public.arrival_events e
     where e.arrival_id = %L and e.to_state = 'nothing_filed' $$,
  current_setting('t.ax1'))), 'held_expired',
  'the expiry writes its event with the enumerated reason');

select is(pg_temp.scalar(format(
  $$ select a.state::text from public.arrivals a where a.id = %L $$,
  current_setting('t.ax2'))), 'held_unknown_sender',
  'a 29-day-old held arrival stays — warned in the inbox first is the surface''s job (staged)');

select is(pg_temp.scalar(format(
  $$ select a.state::text from public.arrivals a where a.id = %L $$,
  current_setting('t.ax3'))), 'held_unknown_sender',
  'an old held arrival whose sender was accepted meanwhile NEVER expires — accepted-but-unreleased is not stranger mail');

select * from finish();
rollback;
