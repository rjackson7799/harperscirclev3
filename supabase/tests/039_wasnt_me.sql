-- ============================================================================
-- 2A · M5 — the "this wasn't me" link (TSD §5.11; PRD §4.1.7) + the §5.9
-- security-class outbound split, built exactly as far as this slice's
-- notices require.
--
-- The contract these tests pin:
--   · accounts.email — mirrored from auth.users by the M3 postgres
--     triggers (extended here): hc_internal must map an attempted
--     identifier to an account without touching the ungrantable auth
--     schema, and the answer must never leak to the caller.
--   · public.outbound_mail — the §5.9 class split as a COLUMN
--     ('security' | 'record'), zero request-path privileges (the queue
--     carries reset-class links; nothing request-facing may read it).
--     Delivery is slice 11; this slice only enqueues.
--   · hc.note_suspicious_attempts(identifier) — callable from the
--     sign-in path (anon), NON-ENUMERATING: byte-identical {noted:true}
--     whether or not an account exists, whatever it did. Internally it
--     re-derives the failure count (never trusts the caller), and at
--     ≥ 5 recent failures against a REAL account writes ONE
--     security_events row + ONE security-class mail row in the same
--     transaction. The token goes into the MAIL PAYLOAD only — the
--     request-path caller is exactly who must never see it (§5.11:
--     whoever holds the mailbox holds the kill switch; the sign-in
--     caller is the attacker). Cadence: one live notice per account —
--     no re-mint while an unconsumed, unexpired token exists.
--   · security_events — the token IS a column of its event (token_hash
--     sha256-only, unique): "bound to the specific security event" is
--     structural, not referential. 15-minute expiry from mint (§5.11
--     verbatim — flagged as a round-9 pointed question, since a link
--     read an hour later is dead; the spec text is unambiguous).
--   · hc.execute_wasnt_me(token) — the explicit-POST destruction path
--     (GET renders, POST executes — app layer). Single-use via the
--     atomic conditional UPDATE; expired/replayed/garbage: ONE
--     non-enumerating shape (wasnt_me_refused). Returns the account id
--     so the app layer kills every session and forces the reset.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(21);

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid, p_email text) returns uuid
language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
          'authenticated', p_email, 'x', now(), now(), now(), '{}', '{}');
  return p_id;
end $$;

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

-- Run one statement as anon, capturing scalar or error signature.
create function pg_temp.as_anon(p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  execute 'set local role anon';
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.fail_n(p_ident text, p_n int) returns void
language plpgsql as $$
begin
  execute 'set local role anon';
  for i in 1..p_n loop
    perform hc.record_auth_attempt(p_ident, 'failure');
  end loop;
  execute 'reset role';
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid(), 'holder@fixture.local');
begin
  insert into public.accounts (id, kind, display_name) values (u1, 'member', 'Holder');
  perform set_config('t.u1', u1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · The accounts.email mirror (hc_internal's only path to the mapping)
-- ----------------------------------------------------------------------------
select has_column('public', 'accounts', 'email',
  'accounts.email exists — the identifier→account mapping without touching auth');
select is(
  (select lower(a.email::text) from public.accounts a
   where a.id = current_setting('t.u1')::uuid),
  'holder@fixture.local',
  'the mirror lands at account insert, from auth.users');

-- ----------------------------------------------------------------------------
-- 3–6 · The two tables: shape and closed boundary
-- ----------------------------------------------------------------------------
select is(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'outbound_mail'),
  true, 'outbound_mail: RLS enabled AND forced');
select is(pg_temp.errcode_as('authenticated', 'select * from public.outbound_mail'),
  '42501', 'authenticated cannot read outbound_mail — the queue carries live links');
select is(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'security_events'),
  true, 'security_events: RLS enabled AND forced');
select is(pg_temp.errcode_as('anon', 'select * from public.security_events'),
  '42501', 'anon cannot read security_events — token hashes and account ids are not a public surface');

-- ----------------------------------------------------------------------------
-- 7–9 · Below threshold, or no account: byte-identical nothing
-- ----------------------------------------------------------------------------
select pg_temp.fail_n('holder@fixture.local', 3);
select is(pg_temp.as_anon(
  $$ select hc.note_suspicious_attempts('holder@fixture.local')::text $$),
  '{"noted": true}',
  'below the threshold: {noted:true} and nothing else');
select pg_temp.fail_n('ghost-nobody@fixture.local', 6);
select is(pg_temp.as_anon(
  $$ select hc.note_suspicious_attempts('ghost-nobody@fixture.local')::text $$),
  '{"noted": true}',
  'no account behind the identifier: BYTE-IDENTICAL {noted:true} — the notice path never enumerates (§5.5)');
select is((select count(*)::int from public.security_events), 0,
  'neither call wrote an event');

-- ----------------------------------------------------------------------------
-- 10–13 · At threshold against a real account: ONE event + ONE
-- security-class mail in one transaction; the token only in the payload
-- ----------------------------------------------------------------------------
select pg_temp.fail_n('holder@fixture.local', 2);
select is(pg_temp.as_anon(
  $$ select hc.note_suspicious_attempts('holder@fixture.local')::text $$),
  '{"noted": true}',
  'at the threshold the caller STILL sees only {noted:true} — the token must never return on the request path');

select is((
  select array[e.account_id::text, e.kind,
               (e.token_hash is not null)::text,
               (e.token_consumed_at is null)::text,
               (e.token_expires_at - now() between interval '14 minutes 59 seconds'
                                              and interval '15 minutes 1 second')::text]
  from public.security_events e),
  array[current_setting('t.u1'), 'suspicious_signin', 'true', 'true', 'true'],
  'ONE event: account-bound, sha256-only token column (event-bound structurally), 15-minute expiry (§5.11 verbatim)');

select is((
  select array[m.class, m.template, lower(m.recipient_email::text),
               m.recipient_account_id::text,
               (m.sent_at is null)::text]
  from public.outbound_mail m),
  array['security', 'suspicious_signin', 'holder@fixture.local',
        current_setting('t.u1'), 'true'],
  'ONE security-class mail row to the verified account address, queued unsent (delivery is slice 11)');

select is(
  (select (extensions.digest(m.payload ->> 'token', 'sha256') = e.token_hash)
   from public.outbound_mail m, public.security_events e),
  true,
  'the mail payload carries the plaintext token whose sha256 is the event''s — the ONLY place the plaintext exists');

-- ----------------------------------------------------------------------------
-- 14–15 · Cadence: one live notice per account
-- ----------------------------------------------------------------------------
select pg_temp.fail_n('holder@fixture.local', 2);
select is(pg_temp.as_anon(
  $$ select hc.note_suspicious_attempts('holder@fixture.local')::text $$),
  '{"noted": true}',
  'a repeat call answers identically');
select is((select count(*)::int from public.security_events), 1,
  'but mints NOTHING while an unconsumed, unexpired token exists — the mailbox is not floodable from the sign-in form');

-- ----------------------------------------------------------------------------
-- 16–19 · execute_wasnt_me: single-use destruction on explicit POST
-- ----------------------------------------------------------------------------
do $$
begin
  perform set_config('t.token',
    (select m.payload ->> 'token' from public.outbound_mail m), true);
end $$;

select is(pg_temp.as_anon(format(
  $$ select (hc.execute_wasnt_me(%L)) ->> 'account_id' $$,
  current_setting('t.token'))),
  current_setting('t.u1'),
  'the token from the mailbox executes — returning the account for the app layer''s session kill + forced reset');
select is((select (e.token_consumed_at is not null) from public.security_events e),
  true, 'consumption is recorded on the event');

select is(pg_temp.as_anon(format(
  $$ select hc.execute_wasnt_me(%L)::text $$, current_setting('t.token'))),
  'ERROR:P0001:wasnt_me_refused',
  'single-use: the same token again is dead');

select is(pg_temp.as_anon(
  $$ select hc.execute_wasnt_me(encode(extensions.gen_random_bytes(32), 'hex'))::text $$),
  'ERROR:P0001:wasnt_me_refused',
  'a token that was never minted refuses in the SAME shape — non-enumerating (§5.11)');

-- ----------------------------------------------------------------------------
-- 20–21 · Expiry, and a second notice after consumption
-- ----------------------------------------------------------------------------
select pg_temp.fail_n('holder@fixture.local', 6);
select is(pg_temp.as_anon(
  $$ select hc.note_suspicious_attempts('holder@fixture.local')::text $$),
  '{"noted": true}',
  'after consumption a fresh incident mints a fresh notice');
do $$
begin
  update public.security_events
     set token_expires_at = now() - interval '1 second'
   where token_consumed_at is null;
end $$;
select is(pg_temp.as_anon(
  $$ select hc.execute_wasnt_me((select m.payload ->> 'token'
                                 from public.outbound_mail m
                                 order by m.created_at desc limit 1))::text $$),
  'ERROR:P0001:wasnt_me_refused',
  'an expired token is dead — 15 minutes is the whole life');

select * from finish();
rollback;
