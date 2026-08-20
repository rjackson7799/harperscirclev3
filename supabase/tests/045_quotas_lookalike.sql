-- ============================================================================
-- 4A · M3 — §5.4 as data + arithmetic, and the §5.3 lookalike check
-- (docs/review/slice-4-plan.md M3).
--
-- The contract these tests pin:
--   · hc.quota_limits — the §5.4/§13.3 bounds as SEEDED DATA, exact-set
--     pinned. PRD-stated values are the letter (per file 50 MB / 200
--     pages · 20 attachments per email · circle soft 5,000 arrivals /
--     50 GB · notify 80% · hard 120%); the rate rows and the monthly
--     ceiling are PROVISIONAL operational hypotheses (the BGT-01
--     precedent — revised by migration when observation says so).
--   · hc.check_quota(p_circle, p_sender) — computes over arrivals via
--     the existing indexes and answers the ENUMERATED outcome
--     (ok · over_sender · over_circle · over_capacity) so the webhook
--     applies the §5.4 bounce/drop table without re-deriving policy.
--     Precedence: capacity (the hard limit) > sender > circle. Messages
--     are EMAIL PARENTS — children of a multi-attachment mail are one
--     message, not twenty-one. Deleted arrivals never count (nothing is
--     deleted to make room, so nothing deleted eats the room). Quota
--     keys canonicalise case/whitespace-blind (the contact-key pattern:
--     variants share ONE budget). The monthly processing ceiling is a
--     NOTIFY-NOT-FAIL signal riding the same answer — it never turns
--     the outcome.
--   · hc.sender_lookalike(p_circle, p_domain) — pg_trgm similarity
--     against the circle's LIVE known_senders domains (domain rows AND
--     the domains of address rows): an exact match is recognition, not
--     a lookalike; a NEAR-miss is MORE suspicious than an unrelated
--     domain (→ auth_result 'lookalike', §5.3); revoked rows are out;
--     a null/blank domain is a defect and refuses loudly.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(29);

-- ----------------------------------------------------------------------------
-- Helpers (the 043/044 pattern).
-- ----------------------------------------------------------------------------
create function pg_temp.pipe(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute 'set local role hc_pipeline';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then p_out
              else p_out::jsonb ->> p_field end;
$$;

-- quota_limits keys; null (never an abort) while the table is absent.
create function pg_temp.ql_keys() returns text[]
language plpgsql as $$
declare v text[];
begin
  select array_agg(key order by key) into v from hc.quota_limits;
  return v;
exception when undefined_table then return null;
end $$;

create function pg_temp.mkc(p_tag text) returns void
language plpgsql as $$
declare v_c uuid; v_s uuid;
begin
  insert into public.circles (name, created_by)
  values ('q-' || p_tag, current_setting('t.u1')::uuid)
  returning id into v_c;
  insert into public.subjects
    (circle_id, first_name, situation, postal_code, timezone, accent_color,
     forwarding_local_part)
  values (v_c, 'S', 's', 'p', 'UTC', 'sage', 'cc45-' || p_tag)
  returning id into v_s;
  perform set_config('t.c_' || p_tag, v_c::text, true);
  perform set_config('t.s_' || p_tag, v_s::text, true);
end $$;

-- Seed n EMAIL PARENT arrivals for a circle: received_at = now() - offs
-- - i * step, sender as given.
create function pg_temp.seed_mail(
  p_tag text, p_n int, p_sender text, p_offs interval, p_step interval,
  p_bytes bigint default 1000) returns void
language plpgsql as $$
begin
  insert into public.arrivals
    (circle_id, subject_id, channel, sender_address, byte_size, received_at)
  select current_setting('t.c_' || p_tag)::uuid,
         current_setting('t.s_' || p_tag)::uuid,
         'email', p_sender, p_bytes, now() - p_offs - (i * p_step)
  from generate_series(1, p_n) i;
end $$;

do $$
declare u1 uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', u1, 'authenticated',
          'authenticated', u1 || '@fixture.local', 'x', now(), now(), now(),
          '{}', '{}');
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Rosa');
  perform set_config('t.u1', u1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–6 · The surface.
-- ----------------------------------------------------------------------------
select has_table('hc', 'quota_limits',
  'hc.quota_limits exists — §5.4/§13.3 as seeded data');

select is(pg_temp.ql_keys(), array[
    'attachments_per_email', 'circle_arrivals_soft', 'circle_bytes_soft',
    'circle_messages_per_day', 'circle_messages_per_hour',
    'file_bytes_max', 'file_pages_max', 'hard_pct',
    'monthly_processing_ceiling', 'notify_pct',
    'sender_messages_per_day', 'sender_messages_per_hour'],
  'the limit set is exactly the twelve enumerated bounds — nothing quietly appears or vanishes');

select has_function('hc', 'check_quota', array['uuid', 'text']::name[],
  'hc.check_quota(p_circle, p_sender) exists');
select has_function('hc', 'sender_lookalike', array['uuid', 'text']::name[],
  'hc.sender_lookalike(p_circle, p_domain) exists');

create temp view fn_exec45 as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(
  (select count(*)::int from fn_exec45
   where proname in ('check_quota', 'sender_lookalike')
     and rolname = 'hc_pipeline') = 2
  and not exists (select 1 from fn_exec45
   where proname in ('check_quota', 'sender_lookalike')
     and rolname in ('anon', 'authenticated', 'hc_admin')),
  'both are hc_pipeline-only (catalog-asserted) — the webhook''s questions, nobody else''s');

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and c.relname = 'quota_limits'
    and r.rolname in ('anon', 'authenticated', 'hc_pipeline', 'hc_admin')), 0,
  'quota_limits: zero request-path/worker/admin privileges — read only through the definers');

-- ----------------------------------------------------------------------------
-- 7–21 · check_quota arithmetic.
-- ----------------------------------------------------------------------------
select pg_temp.mkc('fresh');
select set_config('t.q', pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'someone@example.org')::text $$,
  current_setting('t.c_fresh'))), true);

select is(pg_temp.jf(current_setting('t.q'), 'outcome'), 'ok',
  'a fresh circle and sender answer ok');
select is((
  select case when current_setting('t.q') like 'ERROR:%' then current_setting('t.q')
              else (current_setting('t.q')::jsonb #>> '{limits,attachments_per_email}')
                   || ':' || (current_setting('t.q')::jsonb #>> '{limits,file_bytes_max}')
                   || ':' || (current_setting('t.q')::jsonb #>> '{limits,file_pages_max}')
         end),
  '20:52428800:200',
  'the answer carries the per-message bounds — the webhook applies §5.4 without re-deriving policy');
select is(pg_temp.jf(current_setting('t.q'), 'monthly_ceiling_reached'), 'false',
  'the monthly signal rides the same answer, false when under');

select pg_temp.mkc('sh');
select pg_temp.seed_mail('sh', 20, 'Aunt@Example.COM', interval '1 minute', interval '1 minute');
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'aunt@example.com')::text $$,
  current_setting('t.c_sh'))), 'outcome'), 'over_sender',
  'twenty messages in the hour from one sender → over_sender');
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, '  AUNT@example.com  ')::text $$,
  current_setting('t.c_sh'))), 'outcome'), 'over_sender',
  'case/whitespace variants share ONE budget (the contact-key pattern)');
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'someone-else@example.org')::text $$,
  current_setting('t.c_sh'))), 'outcome'), 'ok',
  'the sender dimension is per-sender — another sender is unaffected');

select pg_temp.mkc('sd');
select pg_temp.seed_mail('sd', 100, 'daily@example.org', interval '90 minutes', interval '10 minutes');
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'daily@example.org')::text $$,
  current_setting('t.c_sd'))), 'outcome'), 'over_sender',
  'a hundred in the day (none in the hour) → over_sender on the day window');

select pg_temp.mkc('ch');
do $$
begin
  insert into public.arrivals
    (circle_id, subject_id, channel, sender_address, byte_size, received_at)
  select current_setting('t.c_ch')::uuid, current_setting('t.s_ch')::uuid,
         'email', 'sender-' || i || '@example.org', 1000,
         now() - interval '1 minute' - (i * interval '30 seconds')
  from generate_series(1, 60) i;
end $$;
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'fresh-sender@example.org')::text $$,
  current_setting('t.c_ch'))), 'outcome'), 'over_circle',
  'sixty distinct senders in the hour → over_circle for the next one');

select pg_temp.mkc('cap');
select pg_temp.seed_mail('cap', 1, 'big@example.org', interval '2 days', interval '1 minute',
                         65000000000);
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'anyone@example.org')::text $$,
  current_setting('t.c_cap'))), 'outcome'), 'over_capacity',
  'bytes past the 120-percent hard limit → over_capacity');

select pg_temp.seed_mail('cap', 20, 'flood@example.org', interval '1 minute', interval '1 minute');
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'flood@example.org')::text $$,
  current_setting('t.c_cap'))), 'outcome'), 'over_capacity',
  'precedence: the hard capacity limit outranks the sender rate');

select pg_temp.mkc('cnt');
do $$
begin
  insert into public.arrivals
    (circle_id, subject_id, channel, sender_address, byte_size, received_at)
  select current_setting('t.c_cnt')::uuid, current_setting('t.s_cnt')::uuid,
         'email', 'bulk@example.org', 10,
         now() - interval '2 days' - (i * interval '1 hour')
  from generate_series(1, 6000) i;
end $$;
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'anyone@example.org')::text $$,
  current_setting('t.c_cnt'))), 'outcome'), 'over_capacity',
  'arrival count at the 120-percent hard limit (6,000) → over_capacity');

do $$
begin
  update public.arrivals set deleted_at = now()
   where circle_id = current_setting('t.c_cnt')::uuid;
end $$;
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'anyone@example.org')::text $$,
  current_setting('t.c_cnt'))), 'outcome'), 'ok',
  'deleted arrivals never count — nothing is deleted to make room, so nothing deleted eats the room');

select pg_temp.mkc('kid');
do $$
declare v_parent uuid;
begin
  insert into public.arrivals
    (circle_id, subject_id, channel, sender_address, byte_size, received_at)
  values (current_setting('t.c_kid')::uuid, current_setting('t.s_kid')::uuid,
          'email', 'family@example.org', 1000, now() - interval '1 minute')
  returning id into v_parent;
  insert into public.arrivals
    (circle_id, subject_id, parent_arrival_id, channel, sender_address,
     byte_size, received_at)
  select current_setting('t.c_kid')::uuid, current_setting('t.s_kid')::uuid,
         v_parent, 'email', 'family@example.org', 1000, now() - interval '1 minute'
  from generate_series(1, 25) i;
end $$;
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'family@example.org')::text $$,
  current_setting('t.c_kid'))), 'outcome'), 'ok',
  'a 25-attachment mail is ONE message — children never count toward rate');

select pg_temp.mkc('mon');
do $$
begin
  insert into public.arrivals
    (circle_id, subject_id, channel, sender_address, byte_size, received_at)
  select current_setting('t.c_mon')::uuid, current_setting('t.s_mon')::uuid,
         'email', 'month-' || (i % 40) || '@example.org', 10,
         date_trunc('month', now()) + (i * interval '18 seconds')
  from generate_series(1, 2000) i;
end $$;
select set_config('t.qm', pg_temp.pipe(format(
  $$ select hc.check_quota(%L, 'quiet@example.org')::text $$,
  current_setting('t.c_mon'))), true);
select ok(
  pg_temp.jf(current_setting('t.qm'), 'monthly_ceiling_reached') = 'true'
  and pg_temp.jf(current_setting('t.qm'), 'outcome') in ('ok', 'over_circle'),
  'the monthly processing ceiling NOTIFIES and never turns the outcome — fail-quietly is not in the §5.4 vocabulary');

select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.check_quota(%L, null)::text $$,
  current_setting('t.c_fresh'))), 'outcome'), 'ok',
  'a null sender skips the sender dimension (the upload path''s shape)');

-- ----------------------------------------------------------------------------
-- 22–29 · sender_lookalike.
-- ----------------------------------------------------------------------------
select pg_temp.mkc('lk');
do $$
begin
  insert into public.known_senders (circle_id, domain, accepted_by)
  values (current_setting('t.c_lk')::uuid, 'cardiology-partners.com',
          current_setting('t.u1')::uuid);
  insert into public.known_senders (circle_id, address, accepted_by)
  values (current_setting('t.c_lk')::uuid, 'nurse@clinic-boston.org',
          current_setting('t.u1')::uuid);
end $$;

select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.sender_lookalike(%L, 'cardiology-partners.com')::text $$,
  current_setting('t.c_lk'))), 'lookalike'), 'false',
  'an EXACT known domain is recognition, not a lookalike');

select set_config('t.lk1', pg_temp.pipe(format(
  $$ select hc.sender_lookalike(%L, 'cardiology-partner.com')::text $$,
  current_setting('t.c_lk'))), true);
select is(pg_temp.jf(current_setting('t.lk1'), 'lookalike'), 'true',
  'a near-miss on a known domain IS a lookalike — MORE suspicious than a stranger (§5.3)');
select is(pg_temp.jf(current_setting('t.lk1'), 'similar_to'), 'cardiology-partners.com',
  'and the answer names which known domain it resembles');

select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.sender_lookalike(%L, 'CARDIOLOGY-PARTNER.COM')::text $$,
  current_setting('t.c_lk'))), 'lookalike'), 'true',
  'the comparison is case-blind');

select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.sender_lookalike(%L, 'clinic-bost0n.org')::text $$,
  current_setting('t.c_lk'))), 'lookalike'), 'true',
  'the domains of accepted ADDRESSES count too — the circle knows nurse@clinic-boston.org');

select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.sender_lookalike(%L, 'totally-different.example')::text $$,
  current_setting('t.c_lk'))), 'lookalike'), 'false',
  'an unrelated domain is not a lookalike — it is merely unknown');

do $$
begin
  update public.known_senders set revoked_at = now()
   where circle_id = current_setting('t.c_lk')::uuid and domain is not null;
end $$;
select is(pg_temp.jf(pg_temp.pipe(format(
  $$ select hc.sender_lookalike(%L, 'cardiology-partner.com')::text $$,
  current_setting('t.c_lk'))), 'lookalike'), 'false',
  'revoked senders are OUT — only live acceptances anchor the check');

select is(pg_temp.pipe(format(
  $$ select hc.sender_lookalike(%L, '  ')::text $$,
  current_setting('t.c_lk'))), 'ERROR:P0001',
  'a blank domain is a defect and refuses loudly — no-domain mail never reaches this question');

select * from finish();
rollback;
