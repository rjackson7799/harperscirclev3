-- ============================================================================
-- 2A · M2 — step_up_tokens + operation/target-bound verification (TSD §5.7;
-- annex A3's interim guard retired; PRD §4.1.1 "recent re-authentication").
--
-- The contract these tests pin:
--   · public.step_up_tokens — §5.7-VERBATIM columns (token_hash pk bytea,
--     account_id, operation, target_ref, aal, expires_at, consumed_at).
--     Zero request-path privileges; RLS forced.
--   · hc.mint_step_up(operation, target_ref) → {token, expires_at} —
--     authenticated only. Minting demands a FRESH re-authentication: the
--     JWT's newest amr timestamp must be within 300 s (the app re-auths
--     with the strongest enrolled factor, then mints on the fresh session;
--     the aal claim is recorded verbatim as "the factor actually used").
--     Missing sub / aal / amr, stale amr, unknown operation: ONE refusal
--     shape (step_up_refused). 32 random bytes, returned once as hex,
--     stored ONLY as sha256. Expiry now() + 5 minutes.
--   · hc.consume_step_up(token, operation, target, account) — hc_internal
--     only, never request-callable. True exactly when the hash resolves,
--     the account matches, operation matches, target matches (null-strict:
--     IS NOT DISTINCT FROM), unexpired, unconsumed — and consumption is
--     the atomic conditional UPDATE, so one of two racers wins.
--   · hc.approve_proposal: the round-6 F6 interim refusal is REPLACED by
--     real validation (annex A3: "§5.7 replaces this guard"). A valid
--     token bound to 'approve_proposal' + this proposal + this actor
--     passes and is consumed; a token bound elsewhere, or replayed,
--     refuses with approval_refused and writes nothing; a null token
--     still approves — approval does not REQUIRE step-up, it validates
--     what is presented.
--   · hc.share_object: sharing an object IS on §5.7's required list. The
--     3-arg overload is GONE; the 4-arg form REQUIRES a valid token bound
--     to 'share_object' + 'type:id'. Null token, wrong target, replay:
--     share_refused.
--
-- Privilege-closure asserts stay catalog-based (PLT-04: ACL-denied CALLS
-- segfault this image). Mutations in DO blocks; probes in separate
-- statements.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(34);

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

-- Run one statement as an authenticated user with FULL claims: sub, role,
-- aal, and an amr whose newest timestamp is p_auth_age seconds old.
create function pg_temp.call_with_claims(
  p_user uuid, p_sql text, p_aal text default 'aal1', p_auth_age int default 0,
  p_omit text default null)  -- 'amr' | 'aal' | 'sub' to drop that claim
returns text language plpgsql as $$
declare v text; m text; claims jsonb;
begin
  claims := jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', p_aal,
    'amr', jsonb_build_array(jsonb_build_object(
      'method', 'password',
      'timestamp', extract(epoch from now())::bigint - p_auth_age)));
  if p_omit is not null then
    claims := claims - p_omit;
  end if;
  perform set_config('request.jwt.claims', claims::text, true);
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

-- Mint as a freshly re-authenticated user; stash the token in a GUC.
create function pg_temp.mint_as(p_user uuid, p_op text, p_target text, p_slot text)
returns void language plpgsql as $$
declare v text;
begin
  v := pg_temp.call_with_claims(p_user, format(
    $q$ select hc.mint_step_up(%L, %L) ->> 'token' $q$, p_op, p_target));
  perform set_config('t.' || p_slot, v, true);
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures: one circle, coordinator u1 (manage×5), member u2; a filed
-- document (share target); two pending proposals (approve cases).
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u2 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m1 uuid; m2 uuid;
  a1 uuid := gen_random_uuid();
  doc uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Step-up circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'su-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1),
           (c1, m2, s1, d::hc.domain, 'summary', u1);
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (a1, c1, s1, 'upload');
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc, c1, s1, 'Care plan', 'medical', a1, now(), u1, now(), 'Sarah', '{documents}');

  perform set_config('t.prop_a', gen_random_uuid()::text, true);
  perform set_config('t.prop_b', gen_random_uuid()::text, true);
  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint) values
    (current_setting('t.prop_a')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Step-up token case'), '{schedule}'),
    (current_setting('t.prop_b')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Null token case'), '{schedule}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.m2', m2::text, true);
  perform set_config('t.doc', doc::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–6 · Shape and boundary
-- ----------------------------------------------------------------------------
select has_table('public', 'step_up_tokens', 'step_up_tokens exists');
select col_type_is('public', 'step_up_tokens', 'token_hash', 'bytea',
  'token_hash is bytea — the token itself is never stored (§5.7)');
select col_is_pk('public', 'step_up_tokens', 'token_hash',
  'token_hash is the primary key, §5.7-verbatim');
select is(
  (select c.relrowsecurity and c.relforcerowsecurity
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'step_up_tokens'),
  true, 'step_up_tokens: RLS enabled AND forced');
select is(pg_temp.errcode_as('authenticated', 'select * from public.step_up_tokens'),
  '42501', 'authenticated cannot read step_up_tokens — token hashes are not a member surface');
select is(pg_temp.errcode_as('anon',
  $$ insert into public.step_up_tokens (token_hash, account_id, operation, aal, expires_at)
     values ('\x00', gen_random_uuid(), 'export', 'aal1', now()) $$),
  '42501', 'anon cannot write step_up_tokens');

-- ----------------------------------------------------------------------------
-- 7–9 · Function surface (catalog-based)
-- ----------------------------------------------------------------------------
select has_function('hc', 'mint_step_up', array['text', 'text'],
  'hc.mint_step_up(operation, target_ref) exists');
select is(
  array[has_function_privilege('authenticated', 'hc.mint_step_up(text, text)', 'execute'),
        has_function_privilege('anon',          'hc.mint_step_up(text, text)', 'execute')],
  array[true, false],
  'mint_step_up: EXECUTE to authenticated, never anon — you re-authenticate a session, not a stranger');
select is(
  (select bool_or(has_function_privilege(r, 'hc.consume_step_up(text, text, text, uuid)', 'execute'))
   from unnest(array['anon', 'authenticated', 'hc_pipeline', 'hc_admin']) r),
  false,
  'consume_step_up: request-callable by NOTHING — definer bodies are the only consumers');

-- ----------------------------------------------------------------------------
-- 10–12 · Minting on a fresh session
-- ----------------------------------------------------------------------------
select pg_temp.mint_as(current_setting('t.u1')::uuid,
  'share_object', 'document:' || current_setting('t.doc'), 'tok_share');
select matches(current_setting('t.tok_share'), '^[0-9a-f]{64}$',
  'mint returns 32 random bytes as 64 hex chars, exactly once');

select is((
  select array[s.account_id::text, s.operation, s.target_ref, s.aal,
               (s.consumed_at is null)::text,
               (s.expires_at - now() between interval '4 minutes 59 seconds'
                                         and interval '5 minutes 1 second')::text]
  from public.step_up_tokens s
  where s.token_hash = extensions.digest(current_setting('t.tok_share'), 'sha256')),
  array[current_setting('t.u1'), 'share_object',
        'document:' || current_setting('t.doc'), 'aal1', 'true', 'true'],
  'the stored row: sha256 only, account-bound, operation+target-bound, aal verbatim, 5-minute expiry, unconsumed');

select is((select count(*)::int from public.step_up_tokens
           where account_id = current_setting('t.u1')::uuid), 1,
  'exactly one row minted — and no column can hold the plaintext (token_hash is the only token-shaped column)');

-- ----------------------------------------------------------------------------
-- 13–16 · Minting refusals: ONE shape, fail closed on every missing leg
-- ----------------------------------------------------------------------------
select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid,
  $$ select hc.mint_step_up('export', null)::text $$, 'aal1', 400),
  'ERROR:P0001:step_up_refused',
  'a session whose newest auth event is 400 s old cannot mint — re-authentication must be FRESH');
select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid,
  $$ select hc.mint_step_up('export', null)::text $$, 'aal1', 0, 'amr'),
  'ERROR:P0001:step_up_refused',
  'no amr claim: refused — a JWT that cannot prove WHEN it authenticated proves nothing');
select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid,
  $$ select hc.mint_step_up('export', null)::text $$, 'aal1', 0, 'aal'),
  'ERROR:P0001:step_up_refused',
  'no aal claim: refused — the factor actually used is a required column, never guessed');
select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid,
  $$ select hc.mint_step_up('approve_everything', null)::text $$),
  'ERROR:P0001:step_up_refused',
  'an operation outside the fixed §5.7 enumeration is refused');

-- ----------------------------------------------------------------------------
-- 17–23 · Consumption: bound to operation AND target AND account; single-use;
-- expiring. (As postgres — the helper is owner-only by design.)
-- ----------------------------------------------------------------------------
select pg_temp.mint_as(current_setting('t.u1')::uuid, 'export', null, 'tok_exp');
select is(hc.consume_step_up(current_setting('t.tok_exp'), 'delete_circle', null,
                             current_setting('t.u1')::uuid),
  false, 'a token minted for export cannot approve a circle deletion (§5.7''s own example)');
select is(hc.consume_step_up(current_setting('t.tok_exp'), 'export', 'circle:x',
                             current_setting('t.u1')::uuid),
  false, 'a null-target token does not match a targeted consumption — null-strict binding');
select is(hc.consume_step_up(current_setting('t.tok_exp'), 'export', null,
                             current_setting('t.u2')::uuid),
  false, 'another account cannot consume it');
select is(hc.consume_step_up(current_setting('t.tok_exp'), 'export', null,
                             current_setting('t.u1')::uuid),
  true, 'the matching consumption succeeds');
select is(hc.consume_step_up(current_setting('t.tok_exp'), 'export', null,
                             current_setting('t.u1')::uuid),
  false, 'single-use: the same token a second time is dead');
select is(hc.consume_step_up(encode(extensions.gen_random_bytes(32), 'hex'),
                             'export', null, current_setting('t.u1')::uuid),
  false, 'a token that was never minted resolves to nothing');

select pg_temp.mint_as(current_setting('t.u1')::uuid, 'export', null, 'tok_stale');
do $$
begin
  update public.step_up_tokens
     set expires_at = now() - interval '1 second'
   where token_hash = extensions.digest(current_setting('t.tok_stale'), 'sha256');
end $$;
select is(hc.consume_step_up(current_setting('t.tok_stale'), 'export', null,
                             current_setting('t.u1')::uuid),
  false, 'an expired token is dead — 5 minutes is the whole life');

-- ----------------------------------------------------------------------------
-- 24–28 · approve_proposal: the F6 interim guard is retired by REAL
-- validation. Non-null tokens are verified and consumed; null still works.
-- ----------------------------------------------------------------------------
select pg_temp.mint_as(current_setting('t.u1')::uuid, 'share_object',
  'document:' || current_setting('t.doc'), 'tok_wrongop');
select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-su-1', null, %L)::text $$,
  current_setting('t.prop_a'), current_setting('t.tok_wrongop'))),
  'ERROR:P0001:approval_refused',
  'a token minted to share a document cannot authorize an approval — operation-bound (A3 guard now validates for real)');

select pg_temp.mint_as(current_setting('t.u1')::uuid, 'approve_proposal',
  current_setting('t.prop_a'), 'tok_approve');
select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-su-2', null, %L)) ->> 'status' $$,
  current_setting('t.prop_a'), current_setting('t.tok_approve'))),
  'approved',
  'a token bound to approve_proposal + THIS proposal + this actor validates and the approval commits');
select is((select (s.consumed_at is not null) from public.step_up_tokens s
           where s.token_hash = extensions.digest(current_setting('t.tok_approve'), 'sha256')),
  true, 'the approval consumed its token in the same transaction');

select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-su-3', null, %L)::text $$,
  current_setting('t.prop_b'), current_setting('t.tok_approve'))),
  'ERROR:P0001:approval_refused',
  'a consumed token presented again refuses — single-use holds through the writer');

select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-su-4')) ->> 'status' $$,
  current_setting('t.prop_b'))),
  'approved',
  'a null token still approves — approval validates what is presented, it does not demand step-up (§5.7 list)');

-- ----------------------------------------------------------------------------
-- 29–34 · share_object: sharing IS on the §5.7 required list. The 3-arg
-- overload is gone; the 4-arg form demands a live bound token.
-- ----------------------------------------------------------------------------
select is(to_regprocedure('hc.share_object(hc.object_type, uuid, uuid)'), null,
  'the 3-arg share_object overload is GONE — no path shares without step-up');
select ok(to_regprocedure('hc.share_object(hc.object_type, uuid, uuid, text)') is not null,
  'hc.share_object(type, id, member, step_up_token) exists');

select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid, format(
  $$ select hc.share_object('document', %L, %L, null)::text $$,
  current_setting('t.doc'), current_setting('t.m2'))),
  'ERROR:P0001:share_refused',
  'a null token refuses the share — §5.7 requires re-authentication before sharing an object');

select pg_temp.mint_as(current_setting('t.u1')::uuid, 'share_object',
  'document:' || current_setting('t.doc'), 'tok_share2');
select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid, format(
  $$ select (hc.share_object('document', %L, %L, %L)) ->> 'object_id' $$,
  current_setting('t.doc'), current_setting('t.m2'), current_setting('t.tok_share2'))),
  current_setting('t.doc'),
  'a live token bound to share_object + THIS object shares it');
select is((select count(*)::int from public.object_shares
           where object_id = current_setting('t.doc')::uuid
             and member_id = current_setting('t.m2')::uuid
             and revoked_at is null), 1,
  'the share row exists');

select pg_temp.mint_as(current_setting('t.u1')::uuid, 'share_object',
  'document:' || gen_random_uuid(), 'tok_otherdoc');
select is(pg_temp.call_with_claims(current_setting('t.u1')::uuid, format(
  $$ select hc.share_object('document', %L, %L, %L)::text $$,
  current_setting('t.doc'), current_setting('t.m2'), current_setting('t.tok_otherdoc'))),
  'ERROR:P0001:share_refused',
  'a token bound to a DIFFERENT object cannot share this one — target-bound, not operation-wide');

select * from finish();
rollback;
