-- ============================================================================
-- 8A · M2 — step-up level binding: hc.set_grant composes target_ref as
-- member:subject:domain:LEVEL (TSD §5.7; PRD §4.6.3; ADR-0038 D6 item 2;
-- round-27 R3 dissent 1; slice-8 plan Q3(a) — SETTLED 2026-09-02: "item 2
-- (a level-bound step-up target_ref) TAKEN as 8A M2"). Pinned here BEFORE
-- the migration exists. STP-03 flips at THIS layer.
--
-- THE CONTRACT THESE CASES PIN.
--   · A token minted for raise_grant + member:subject:domain:summary does
--     NOT consume against a post of manage for the same triple — the
--     refusal is grant_refused, the token is left UNCONSUMED (the definer's
--     exact match never touched the row), the grant is unchanged and the
--     log has no entry. The same token then raises to summary.
--   · The binding is REPLACED, not widened: the pre-8A three-part shape
--     member:subject:domain no longer raises anything (R3's dissent 1: "a
--     crafted link that raises the level a coordinator THINKS she confirmed
--     is the shape this binding does not cover" — now it is covered).
--   · A token for a LOWER level cannot post a HIGHER one (view → manage).
--   · Everything else holds: a LOWER demands no token; the log carries
--     both levels; the stored token row carries the four-part target_ref
--     verbatim (STP-01's row pin extended); the replaced body is still a
--     SECURITY DEFINER owned by hc_internal with EXECUTE for authenticated
--     alone — catalog-based (a replaced body must restate every later ALTER).
-- 038's raise cases carry the level in the same commit as the migration.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(15);

-- ----------------------------------------------------------------------------
-- Helpers (the 038 pattern).
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
declare v text; m text;
begin
  execute p_sql into v;
  return v;
exception when others then
  get stacked diagnostics m := message_text;
  return 'ERROR:' || sqlstate || ':' || m;
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

-- Mint a raise_grant token on a fresh session, bound to whatever target is
-- given — the four-part shape, or the old three-part one for the negative.
create function pg_temp.mint_raise(p_user uuid, p_target text, p_slot text)
returns void language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated', 'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password',
      'timestamp', extract(epoch from now())::bigint)))::text, true);
  execute 'set local role authenticated';
  v := hc.mint_step_up('raise_grant', p_target) ->> 'token';
  execute 'reset role';
  perform set_config('t.' || p_slot, v, true);
end $$;

-- The raise, as u1, on m3/s1: the level posted and the token slot.
create function pg_temp.raise_as(p_domain text, p_level text, p_slot text)
returns text language plpgsql as $$
begin
  return pg_temp.call_as(current_setting('t.u1')::uuid, format(
    $q$ select (hc.set_grant(%L, %L, %L, %L, %L)) ->> 'after' $q$,
    current_setting('t.m3'), current_setting('t.s1'), p_domain, p_level,
    case when p_slot is null then null else current_setting('t.' || p_slot) end));
end $$;

create function pg_temp.consumed(p_slot text) returns text
language sql as $$
  select (s.consumed_at is not null)::text from public.step_up_tokens s
   where s.token_hash = extensions.digest(current_setting('t.' || p_slot), 'sha256');
$$;

-- ----------------------------------------------------------------------------
-- Fixtures: circle c1 · subject s1 · coordinator u1 (m1, manage×5) · family
-- member u3 (m3: health LOG, schedule SUMMARY — every raise here is a raise).
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());
  u3 uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m1 uuid; m3 uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u3, 'member', 'Ruth');
  insert into public.circles (name, created_by) values ('Level circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'sl-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Ruth') returning id into m3;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m3, s1, 'health', 'log', u1),
         (c1, m3, s1, 'schedule', 'summary', u1);

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.m3', m3::text, true);
  perform set_config('t.triple', m3::text || ':' || s1::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–3 · The replaced body's surface, from the catalog: still ONE definer,
--       hc_internal's, search_path pinned, EXECUTE for authenticated alone.
-- ----------------------------------------------------------------------------
select is((
  select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hc' and p.proname = 'set_grant'), 1,
  'hc.set_grant is ONE function — the last create or replace wins, no second overload');

select ok((
  select bool_and(p.prosecdef
    and pg_get_userbyid(p.proowner) = 'hc_internal'
    and exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hc' and p.proname = 'set_grant'),
  'the replaced body is still SECURITY DEFINER, owned by hc_internal, search_path pinned to '''' — a replaced body restates every later ALTER');

select is(
  array[has_function_privilege('authenticated', 'hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)', 'execute'),
        has_function_privilege('anon',          'hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)', 'execute'),
        has_function_privilege('hc_pipeline',   'hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)', 'execute'),
        has_function_privilege('hc_admin',      'hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)', 'execute')],
  array[true, false, false, false],
  'EXECUTE: authenticated alone, never anon / hc_pipeline / hc_admin — asserted from the catalog, never by calling as a denied role');

-- ----------------------------------------------------------------------------
-- 4-8 · THE LEVEL IS IN THE BINDING — and 9A rebuilt case 4 so that it says
--       so. Round 31 F-2 (ADR-0044 D2, docs/owed.md OW-29): the case that
--       carried the STP-03: label here minted a FOUR-part token and posted
--       manage, which a three-part composition refuses just as flatly — it
--       passed identically with M2's `|| ':' || p_level::text` removed,
--       proven live in one begin/rollback. It tested nothing M2 did.
--
--       EVERY CASE CARRYING THE STP-03: LABEL BELOW DISCRIMINATES: strip
--       the suffix from hc.set_grant and 4, 7, 9 and 11 all go red, and
--       those four are exactly the ones labelled. A case that merely passes
--       under its own row's name is worse than no case, because the triage
--       reads "three unrelated raise cases failed" and looks elsewhere.
--
--       HOW TO PROBE THIS FILE, because the obvious way is wrong. Removing
--       the suffix and running the whole file end to end shows 4 and 9 RED
--       and 7 and 11 GREEN — and that is a CASCADE, not a verdict on 7 and
--       11. When 4 and 9 stop refusing they SUCCEED, which raises health to
--       manage and schedule to view; 7's and 11's posts are then LOWERS,
--       and a lower demands no token (case 13). Probe 7 and 11 from the
--       FIXTURE instead (health log, schedule summary), where both posts
--       are raises: both are then refused with the suffix gone and both
--       land with it intact. Round 31 F-2's own method — the control in
--       the same transaction — applied one level up.
-- ----------------------------------------------------------------------------
select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.triple') || ':health', 'tok_3p');
select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.triple') || ':health:summary', 'tok_s');

select is(pg_temp.raise_as('health', 'manage', 'tok_3p'), 'ERROR:P0001:grant_refused',
  'STP-03: the pre-8A THREE-part target member:subject:health does not raise health to MANAGE — the shape a crafted link could carry, refused because the definer composes FOUR parts. DISCRIMINATES: with the suffix removed this same call SUCCEEDS and health goes to manage, which is the escalation this row exists to forbid (OW-29)');

select is(pg_temp.consumed('tok_3p'), 'false',
  'the refusal consumed nothing — consume_step_up''s exact match never touched the row, so the confirmation she gave is still hers to spend on what she confirmed');

select is((
  select array[(select g.level::text from public.access_grants g
                 where g.member_id = current_setting('t.m3')::uuid and g.domain = 'health'),
               (select count(*)::text from public.access_log l
                 where l.circle_id = current_setting('t.c1')::uuid and l.event_type = 'grant_changed')]),
  array['log', '0'],
  'the grant stands at log and the log has no entry — the crafted-link shape R3 named writes nothing');

select is(pg_temp.raise_as('health', 'summary', 'tok_s'), 'summary',
  'STP-03: the FOUR-part token raises to exactly the level it was minted for. DISCRIMINATES: with the suffix removed the composition is three-part, this four-part token no longer matches it, and the raise it was minted for is REFUSED — which is what proves the binding was REPLACED and not merely widened');

select is(pg_temp.consumed('tok_s'), 'true',
  '… and is consumed by that raise, in the definer''s own transaction');

-- ----------------------------------------------------------------------------
-- 9–11 · The binding is REPLACED, not widened; and lower never buys higher.
-- ----------------------------------------------------------------------------
select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.triple') || ':schedule', 'tok_old');
select is(pg_temp.raise_as('schedule', 'view', 'tok_old'), 'ERROR:P0001:grant_refused',
  'STP-03: the pre-8A three-part target member:subject:domain no longer raises anything — the binding is replaced, and no in-flight token can exist (nothing is production-activated). DISCRIMINATES: with the suffix removed this call SUCCEEDS. ADR-0044 D2 re-leads STP-03''s evidence citation with THIS case');

select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.triple') || ':schedule:view', 'tok_v');
select is(pg_temp.raise_as('schedule', 'manage', 'tok_v'), 'ERROR:P0001:grant_refused',
  'a token for VIEW cannot post MANAGE: lower never buys higher. NOT labelled STP-03 and deliberately so — round 31 F-2 names this case the same shape as the old case 4: it passes with or without the level suffix, because a four-part token misses a three-part composition either way');

select is(pg_temp.raise_as('schedule', 'view', 'tok_v'), 'view',
  'STP-03: … and posts VIEW, what it was minted for. DISCRIMINATES: with the suffix removed the four-part token no longer matches a three-part composition and this raise is refused');

-- ----------------------------------------------------------------------------
-- 12–14 · What does not change: the stored shape, the token-free lower, the
--         log with both levels.
-- ----------------------------------------------------------------------------
select is((
  select s.target_ref from public.step_up_tokens s
   where s.token_hash = extensions.digest(current_setting('t.tok_v'), 'sha256')),
  current_setting('t.triple') || ':schedule:view',
  'the stored row carries the four-part target_ref verbatim — STP-01''s row pin, extended by one part');

select is(pg_temp.raise_as('health', 'log', null), 'log',
  'a LOWER still demands no token (GRT-01: revocation is never gated on re-auth friction)');

select is((
  select array[l.level_before::text, l.level_after::text]
    from public.access_log l
   where l.circle_id = current_setting('t.c1')::uuid and l.event_type = 'grant_changed'
     and l.domain = 'health'
   order by l.seq asc limit 1),
  array['log', 'summary'],
  'the raise that landed is in the log with BOTH levels (AC-PERM-5) — log → summary, the level she confirmed');

-- ----------------------------------------------------------------------------
-- 15 · 9A / OW-29: the DISPLACED assertion, kept and told the truth about.
--      This is what case 4 used to be — a token minted for summary posted
--      against manage. It is a true statement of the contract and it is
--      worth pinning, but it is NOT evidence for STP-03: a four-part token
--      misses a three-part composition just as flatly, so it passes with
--      the suffix removed. It carries no label, and it is APPENDED rather
--      than inserted so cases 9-14 keep the numbers ADR-0044 D2's marker
--      and docs/coverage.md STP-03 cite.
-- ----------------------------------------------------------------------------
select pg_temp.mint_raise(current_setting('t.u1')::uuid,
  current_setting('t.triple') || ':documents:summary', 'tok_s2');
select is(pg_temp.raise_as('documents', 'manage', 'tok_s2'), 'ERROR:P0001:grant_refused',
  'a token minted to raise documents to SUMMARY does not consume against a post of MANAGE for the same member:subject:domain (true with or without M2 — see the header)');

select * from finish();
rollback;
