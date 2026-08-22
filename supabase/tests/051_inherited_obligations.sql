-- ============================================================================
-- 5A · M1 — the inherited-obligations batch (the R8 precedent: owner-queue
-- DB items land FIRST, before slice-5-proper work). The contract these
-- tests pin, item by item (docs/review/slice-5-plan.md M1; ADR-0019
-- D7/D8/D15, Q-iii/Q-vi, S3):
--
--   1 · hc.log_artifact_read(p_arrival) — the §1.3 step-6 entry as an
--       authenticated SECURITY DEFINER with IN-FUNCTION authorization
--       (ADR-0019 Q-iii): actor = hc.uid(), nothing spoofable; the
--       arrival must be live and clear hc.visible_at at VIEW for the
--       caller (the exact predicate the artifact route's evidence read
--       uses — RLS-10's letter, repeated inside the definer so the
--       function is safe standing alone). Nonexistent, foreign,
--       deleted and not-visible all land in ONE refusal shape (DEF-10);
--       a missing live account refuses the same way — bytes never move
--       without a real actor on the trail. Each successful call appends
--       one 'artifact_read' entry through hc.log (the chain stays
--       intact); the display name is captured at write, never
--       re-resolved. The app half (retiring lib/db/evidentiary.ts) is
--       5B B8.
--   2 · hc.list_known_senders(p_circle) — D15's revoke-sender read:
--       LIVE rows only (revoked_at is null) with accepted-by/at, the
--       SND-02 authorization shape (live coordinator membership on the
--       circle; foreign, nonexistent and non-coordinator land in the
--       one 'sender_refused' shape — DEF-10), deterministic order
--       (accepted_at desc, id desc). Gives hc.revoke_sender its member
--       surface at 5B B8.
--   3 · D8's NOINHERIT (Q4 — SETTLED): hc_runtime's two memberships
--       re-granted WITH INHERIT FALSE. The SET ROLE channel is
--       membership + SET, not inheritance, so the request path is
--       untouched (set_option stays true, pinned here; the live-login
--       proof rides tests/db/runtime-credential.test.ts). The bare
--       login's blast radius drops to the enumerated SET ROLE surface:
--       zero direct privileges, zero inherited ones.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(29);

-- ----------------------------------------------------------------------------
-- Helpers (the 043 pattern: fixtures as postgres in DO blocks, probes
-- through role-switching helpers that capture error signatures instead of
-- aborting the file).
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

create function pg_temp.probe(p_uid uuid, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERROR:' || sqlstate;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function pg_temp.jf(p_out text, p_field text) returns text
language sql as $$
  select case when p_out is null or p_out like 'ERROR:%' then p_out
              else p_out::jsonb ->> p_field end;
$$;

-- ----------------------------------------------------------------------------
-- Fixtures: Rosa founds c1 (coordinator, full founder grants); Bea joins as
-- a family member with ZERO grants (present but all-hidden — the not-visible
-- probe); Zero stays foreign; Ghost is soft-deleted. One live arrival and
-- one deleted arrival land in c1 as pipeline fixtures.
-- ----------------------------------------------------------------------------
do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- Rosa: founder of c1
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- Zero: no memberships
  u3 uuid := pg_temp.mk_user(gen_random_uuid());   -- Bea: member, zero grants
  u4 uuid := pg_temp.mk_user(gen_random_uuid());   -- Ghost: soft-deleted
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Rosa'), (u2, 'member', 'Zero'), (u3, 'member', 'Bea');
  insert into public.accounts (id, kind, display_name, deleted_at)
  values (u4, 'member', 'Ghost', now());
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.u4', u4::text, true);
end $$;

select set_config('t.c1res', pg_temp.probe(current_setting('t.u1')::uuid, $sql$
  select hc.create_circle('Nell''s circle', jsonb_build_array(jsonb_build_object(
    'first_name', 'Nell', 'situation', 'recovering at home',
    'postal_code', '02138', 'timezone', 'America/New_York',
    'accent_color', 'sage',
    'forwarding_local_part', 'cc51-nell-' || substr(gen_random_uuid()::text, 1, 8))),
    array['post-hospital discharge'])::text
$sql$), true);

do $$
declare
  v_circle uuid := (pg_temp.jf(current_setting('t.c1res'), 'circle_id'))::uuid;
  v_nell uuid;
  v_arr uuid; v_gone uuid;
begin
  if v_circle is null then return; end if;   -- red leg: fixtures absent, tests fail cleanly
  select s.id into v_nell from public.subjects s where s.circle_id = v_circle;

  -- Bea: live family membership, no access_grants rows at all.
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (v_circle, current_setting('t.u3')::uuid, 'family', 'Bea');

  insert into public.arrivals (circle_id, subject_id, channel, state,
                               storage_key, scan_verdict)
  values (v_circle, v_nell, 'upload', 'extracting'::hc.arrival_state,
          'circles/' || v_circle || '/x', 'clean')
  returning id into v_arr;
  insert into public.arrivals (circle_id, subject_id, channel, state, deleted_at)
  values (v_circle, v_nell, 'upload', 'extracting'::hc.arrival_state, now())
  returning id into v_gone;

  perform set_config('t.c1', v_circle::text, true);
  perform set_config('t.nell', v_nell::text, true);
  perform set_config('t.arr', v_arr::text, true);
  perform set_config('t.gone', v_gone::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–5 · The surface: both definers exist; EXECUTE is authenticated-only.
-- CATALOG-BASED closure, deliberately: a live function-ACL denial
-- segfaults this image's backend (the recorded 1A trap) — the privilege's
-- ABSENCE is asserted from the catalog, never dialled.
-- ----------------------------------------------------------------------------
select has_function('hc', 'log_artifact_read', array['uuid']::name[],
  'hc.log_artifact_read(p_arrival) exists — the §1.3 step-6 definer (Q-iii)');
select has_function('hc', 'list_known_senders', array['uuid']::name[],
  'hc.list_known_senders(p_circle) exists — D15''s revoke-sender read');

create temp view fn_exec as
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE';

select ok(exists (select 1 from fn_exec where proname = 'log_artifact_read'
                                          and rolname = 'authenticated')
      and not exists (select 1 from fn_exec where proname = 'log_artifact_read'
                                              and rolname = 'anon'),
  'log_artifact_read: authenticated EXECUTE, anon none (an artifact read is a member act)');
select ok(exists (select 1 from fn_exec where proname = 'list_known_senders'
                                          and rolname = 'authenticated')
      and not exists (select 1 from fn_exec where proname = 'list_known_senders'
                                              and rolname = 'anon'),
  'list_known_senders: authenticated EXECUTE, anon none');
select ok(not exists (select 1 from fn_exec
                      where proname in ('log_artifact_read', 'list_known_senders')
                        and rolname in ('hc_pipeline', 'hc_admin')),
  'neither definer is reachable from hc_pipeline or hc_admin — member surfaces, not worker ones');

-- ----------------------------------------------------------------------------
-- 6–7 · Unauthenticated first (claims are transaction-scoped; nothing has
-- set them yet): both refuse in the normalised shape.
-- ----------------------------------------------------------------------------
select throws_ok($$ select hc.log_artifact_read(gen_random_uuid()) $$, 'P0001', null,
  'log_artifact_read: no authenticated identity, normalised refusal');
select throws_ok($$ select * from hc.list_known_senders(gen_random_uuid()) $$, 'P0001', null,
  'list_known_senders: no authenticated identity, normalised refusal');

-- ----------------------------------------------------------------------------
-- 8–12 · log_artifact_read: the happy path writes the exact §1.3 step-6
-- entry through the chain.
-- ----------------------------------------------------------------------------
select is(pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.log_artifact_read(%L)::text $$, current_setting('t.arr'))),
  'logged'), 'true',
  'a member with VIEW on the arrival logs the read and is told so');

select is((
  select count(*)::int from public.access_log l
  where l.circle_id = current_setting('t.c1')::uuid
    and l.event_type = 'artifact_read'
    and l.actor_account_id = current_setting('t.u1')::uuid
    and l.subject_id = current_setting('t.nell')::uuid
    and l.object_type = 'arrival'
    and l.object_id = current_setting('t.arr')::uuid), 1,
  'exactly one artifact_read entry: actor, subject, object_type arrival, object id — the §1.3 step-6 shape');

select is((
  select l.actor_display_name from public.access_log l
  where l.circle_id = current_setting('t.c1')::uuid
    and l.event_type = 'artifact_read'), 'Rosa',
  'the actor''s display name is captured at write time, from the accounts row in the same transaction');

select is(pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.log_artifact_read(%L)::text $$, current_setting('t.arr'))),
  'logged'), 'true',
  'a second read logs again — every read is an entry, never a dedup');

select ok((
  select count(*) = 2
     and count(distinct l.seq) = 2
     and bool_and(l.entry_hash is not null)
  from public.access_log l
  where l.circle_id = current_setting('t.c1')::uuid
    and l.event_type = 'artifact_read'),
  'both entries rode hc.log: distinct chain seqs, hashes present — the chain stays intact');

-- ----------------------------------------------------------------------------
-- 13–17 · log_artifact_read: DEF-10 — nonexistent, foreign, deleted,
-- not-visible and no-live-account all land in ONE refusal shape.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe(current_setting('t.u3')::uuid,
  format($$ select hc.log_artifact_read(%L)::text $$, current_setting('t.arr'))),
  'ERROR:P0001',
  'a member WITHOUT view on the subject is refused — in-function authorization, not caller trust');

select is(pg_temp.probe(current_setting('t.u2')::uuid,
  format($$ select hc.log_artifact_read(%L)::text $$, current_setting('t.arr'))),
  'ERROR:P0001',
  'a FOREIGN account is refused in the same shape');

select is(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.log_artifact_read(%L)::text $$, gen_random_uuid())),
  'ERROR:P0001',
  'a nonexistent arrival refuses in the same shape — no oracle');

select is(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.log_artifact_read(%L)::text $$, current_setting('t.gone'))),
  'ERROR:P0001',
  'a soft-deleted arrival refuses in the same shape');

select is(pg_temp.probe(current_setting('t.u4')::uuid,
  format($$ select hc.log_artifact_read(%L)::text $$, current_setting('t.arr'))),
  'ERROR:P0001',
  'a soft-deleted ACCOUNT refuses — no entry without a live actor on the trail');

-- ----------------------------------------------------------------------------
-- Sender fixtures, through the real surface: Rosa accepts an address and a
-- domain, then accepts and revokes a third — the revoked row must vanish
-- from the list while both live rows stay.
-- ----------------------------------------------------------------------------
select set_config('t.s1', pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.accept_sender(%L, p_address => 'billing@clinic.example')::text $$,
         current_setting('t.c1'))), 'sender_id'), true);
select set_config('t.s2', pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.accept_sender(%L, p_domain => 'insurer.example')::text $$,
         current_setting('t.c1'))), 'sender_id'), true);
select set_config('t.s3', pg_temp.jf(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.accept_sender(%L, p_address => 'noreply@pharmacy.example')::text $$,
         current_setting('t.c1'))), 'sender_id'), true);
select pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select hc.revoke_sender(%L)::text $$, current_setting('t.s3')));

-- ----------------------------------------------------------------------------
-- 18–26 · list_known_senders: live rows with accepted-by/at, deterministic
-- order, the SND-02 authorization shape.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select count(*)::text from hc.list_known_senders(%L) $$,
         current_setting('t.c1'))), '2',
  'the coordinator lists exactly the LIVE rows — the revoked acceptance is gone');

select ok(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select coalesce(string_agg(id::text, ','), '<none>')
            from hc.list_known_senders(%L) $$, current_setting('t.c1')))
  not like '%' || current_setting('t.s3') || '%',
  'the revoked sender id is absent by name — revocation is effective on the surface');

select is(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select address || '|' || accepted_by || '|' || accepted_by_name
            from hc.list_known_senders(%L) where id = %L $$,
         current_setting('t.c1'), current_setting('t.s1'))),
  'billing@clinic.example|' || current_setting('t.u1') || '|Rosa',
  'an address acceptance lists address + accepted_by + the acceptor''s name');

select is(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select domain || '|' || coalesce(address, '<null>')
            from hc.list_known_senders(%L) where id = %L $$,
         current_setting('t.c1'), current_setting('t.s2'))),
  'insurer.example|<null>',
  'a domain acceptance lists the domain, address null — exactly one of the pair');

select ok(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select bool_and(accepted_at is not null)::text
            from hc.list_known_senders(%L) $$, current_setting('t.c1'))) = 'true',
  'every listed row carries accepted_at');

select is(pg_temp.probe(current_setting('t.u1')::uuid,
  format($$ select string_agg(id::text, ',') from hc.list_known_senders(%L) $$,
         current_setting('t.c1'))),
  (select string_agg(k.id::text, ',' order by k.accepted_at desc, k.id desc)
   from public.known_senders k
   where k.circle_id = current_setting('t.c1')::uuid and k.revoked_at is null),
  'the order is deterministic: accepted_at desc, id desc — a stable surface for the app');

select is(pg_temp.probe(current_setting('t.u3')::uuid,
  format($$ select count(*)::text from hc.list_known_senders(%L) $$,
         current_setting('t.c1'))), 'ERROR:P0001',
  'a NON-COORDINATOR member is refused — the SND-02 authority shape (DEF-10)');

select is(pg_temp.probe(current_setting('t.u2')::uuid,
  format($$ select count(*)::text from hc.list_known_senders(%L) $$,
         current_setting('t.c1'))), 'ERROR:P0001',
  'a FOREIGN account is refused in the same shape');

select is(pg_temp.probe(current_setting('t.u2')::uuid,
  format($$ select count(*)::text from hc.list_known_senders(%L) $$,
         gen_random_uuid())), 'ERROR:P0001',
  'a NONEXISTENT circle refuses in the same shape — no oracle');

-- ----------------------------------------------------------------------------
-- 27–29 · D8's NOINHERIT (Q4): the two memberships flip to INHERIT FALSE;
-- the SET option stays; the bare role's direct reach stays zero.
-- ----------------------------------------------------------------------------
select is((
  select array_agg(rr.rolname || ':inherit=' || m.inherit_option::text
                   order by rr.rolname)
  from pg_auth_members m
  join pg_roles rm on rm.oid = m.member and rm.rolname = 'hc_runtime'
  join pg_roles rr on rr.oid = m.roleid),
  array['anon:inherit=false', 'authenticated:inherit=false']::text[],
  'hc_runtime''s two memberships — anon + authenticated and NOTHING else — are INHERIT FALSE (Q4)');

select ok((
  select bool_and(m.set_option)
  from pg_auth_members m
  join pg_roles rm on rm.oid = m.member and rm.rolname = 'hc_runtime'),
  'both memberships keep SET — the request-role channel is untouched (SET ROLE is membership, not inheritance)');

select ok(
  exists (select 1 from pg_roles where rolname = 'hc_runtime' and not rolcanlogin)
  and not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    join pg_roles r on r.oid = a.grantee
    where n.nspname in ('public', 'hc') and c.relkind = 'r'
      and r.rolname = 'hc_runtime'),
  'hc_runtime stays NOLOGIN with ZERO direct table privileges — after the flip the bare credential holds nothing at all');

select * from finish();
rollback;
