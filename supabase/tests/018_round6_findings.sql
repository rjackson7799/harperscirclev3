-- ============================================================================
-- 1B · U12 — round-6 accepted findings (ADR-0006): the approve_proposal
-- hardening set and the sequential transition-binding pins.
--
--   F6  step-up token: a token the database cannot validate is REFUSED,
--       never accepted-and-ignored (§5.7 stays the auth slice's; until it
--       lands, non-null p_step_up_token is fail-closed).
--   AB1 idempotency replay is ACTOR-BOUND: another actor presenting a
--       stored key+proposal gets approval_refused, not the stored result.
--   AB2 idempotency key bounds: length 1..200, else approval_refused
--       before any row is written.
--   AB3 a payload listing the same parent twice approves cleanly with
--       exactly ONE edge (no raw 23505 escapes the definer).
--   Q4  drift refusal (D7 amended): parents' CURRENT taints beyond
--       own ∪ drafted refuse with proposal_taint_changed — the approver
--       re-renders; nobody approves a wider audience than they read.
--       Ordered AFTER authorization (no oracle) and AFTER version drift.
--   R1  sequential transition binding: a freeze committed before the
--       call's authorization statement refuses share_object (014 pins
--       revise; RLS-08 pins reads).
--
-- RED (U12): six cases fail against cad6151 —
--   1  'a step-up token nothing can validate yet is refused (fail-closed)'
--      → the token is ignored and the call reports approved
--   2  'the same approval without a token commits'
--      → the proposal was consumed by case 1, approval_refused
--   4  'another actor replaying a stored key is refused'
--      → the stored result is returned across actors
--   5  'an oversize idempotency key is refused before it is stored'
--      → no bound exists, the call reports approved
--   6  'an empty idempotency key is refused'  → same
--   7  'a duplicate parent in the payload approves cleanly'
--      → ERROR:23505 (unique_violation escapes raw)
--   8  'the duplicate parent wrote exactly one edge' → 0 (the call died)
--   9  'a parent grown past the drafted taint refuses: re-render'
--      → the union is approved silently (D7 pre-amendment)
--   10 'the drift refusal wrote nothing' → status approved
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(14);

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

-- Run one statement as an authenticated user; role switch INSIDE the
-- helper, invoked as postgres (PLT-04 discipline).
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
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- second manage×5 member
  u3 uuid := pg_temp.mk_user(gen_random_uuid());   -- summary-level member
  c1 uuid; c2 uuid; s1 uuid; s2 uuid;
  m1 uuid; m2 uuid; m3 uuid; mf uuid;
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid();
  doc_p uuid := gen_random_uuid();
  doc_f uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u3, 'member', 'Marisol');
  insert into public.circles (name, created_by) values ('Round-6 circle', u1)
    returning id into c1;
  insert into public.circles (name, created_by) values ('Round-6 frozen', u1)
    returning id into c2;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'r6-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c2, 'Marcus', 'aging in place', '98101', 'America/Los_Angeles', 'clay',
          'r6f-' || substr(c2::text, 1, 8)) returning id into s2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'coordinator', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Marisol') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c2, u1, 'coordinator', 'Sarah') returning id into mf;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1),
           (c1, m2, s1, d::hc.domain, 'manage', u1),
           (c1, m3, s1, d::hc.domain, 'summary', u1),
           (c2, mf, s2, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel) values
    (a1, c1, s1, 'upload'), (a2, c2, s2, 'upload');

  -- a finance-domain parent for the drift and duplicate-parent cases
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc_p, c1, s1, 'Invoice', 'financial', a1, now(), u1, now(), 'Sarah', '{finances}');

  -- a record object in the frozen circle, for the share pin
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc_f, c2, s2, 'Frozen doc', 'legal', a2, now(), u1, now(), 'Sarah', '{documents}');
  insert into public.freezes (circle_id) values (c2);

  perform set_config('t.prop_tok',   gen_random_uuid()::text, true);
  perform set_config('t.prop_rep',   gen_random_uuid()::text, true);
  perform set_config('t.prop_key1',  gen_random_uuid()::text, true);
  perform set_config('t.prop_key2',  gen_random_uuid()::text, true);
  perform set_config('t.prop_dup',   gen_random_uuid()::text, true);
  perform set_config('t.prop_drift', gen_random_uuid()::text, true);
  perform set_config('t.prop_drift2',gen_random_uuid()::text, true);
  perform set_config('t.prop_cover', gen_random_uuid()::text, true);
  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint) values
    (current_setting('t.prop_tok')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Token case'), '{schedule}'),
    (current_setting('t.prop_rep')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Replay case'), '{schedule}'),
    (current_setting('t.prop_key1')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Key bound case'), '{schedule}'),
    (current_setting('t.prop_key2')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Empty key case'), '{schedule}'),
    (current_setting('t.prop_dup')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Duplicate parent', 'parents',
       jsonb_build_array(jsonb_build_object('type', 'document', 'id', doc_p),
                         jsonb_build_object('type', 'document', 'id', doc_p))),
     '{schedule,finances}'),
    (current_setting('t.prop_drift')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Drifted parent', 'parents',
       jsonb_build_array(jsonb_build_object('type', 'document', 'id', doc_p))),
     '{schedule}'),
    (current_setting('t.prop_drift2')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Drifted parent, weak actor', 'parents',
       jsonb_build_array(jsonb_build_object('type', 'document', 'id', doc_p))),
     '{schedule}'),
    (current_setting('t.prop_cover')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Covered parent', 'parents',
       jsonb_build_array(jsonb_build_object('type', 'document', 'id', doc_p))),
     '{schedule,finances}');

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.mf', mf::text, true);
  perform set_config('t.doc_p', doc_p::text, true);
  perform set_config('t.doc_f', doc_f::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 1–2 · F6: a non-null step-up token is refused until §5.7 can validate
-- it. Clients must never learn to treat token submission as validated
-- authentication against a database that ignores it.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-tok-1', null, 'a-token')::text $$,
  current_setting('t.prop_tok'))), 'ERROR:P0001:approval_refused',
  'a step-up token nothing can validate yet is refused (fail-closed), not ignored');

select is(substr(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-tok-2')) ->> 'status' $$,
  current_setting('t.prop_tok'))), 1, 8), 'approved',
  'the same approval without a token commits — the refusal burned neither key nor proposal');

-- ----------------------------------------------------------------------------
-- 3–4 · AB1: replay is actor-bound. The stored result replays only to the
-- actor who claimed the key.
-- ----------------------------------------------------------------------------
select is(substr(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-rep-1')) ->> 'status' $$,
  current_setting('t.prop_rep'))), 1, 8), 'approved',
  'fixture: the first actor approves under their key');

select is(pg_temp.call_as(current_setting('t.u2')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-rep-1')::text $$,
  current_setting('t.prop_rep'))), 'ERROR:P0001:approval_refused',
  'another actor replaying a stored key is refused — results replay only to their claimant');

-- ----------------------------------------------------------------------------
-- 5–6 · AB2: key bounds, refused before any row exists.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, %L)::text $$,
  current_setting('t.prop_key1'), repeat('k', 201))), 'ERROR:P0001:approval_refused',
  'an oversize idempotency key is refused before it is stored');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, '')::text $$,
  current_setting('t.prop_key2'))), 'ERROR:P0001:approval_refused',
  'an empty idempotency key is refused');

-- ----------------------------------------------------------------------------
-- 7–8 · AB3: duplicate parents in the payload collapse to one edge; no
-- raw unique_violation escapes the definer.
-- ----------------------------------------------------------------------------
select is(substr(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-dup-1')) ->> 'status' $$,
  current_setting('t.prop_dup'))), 1, 8), 'approved',
  'a duplicate parent in the payload approves cleanly');

select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.provenance_edges e
     join public.proposal_commits pc on pc.object_id = e.child_id
     where pc.proposal_id = %L $$,
  current_setting('t.prop_dup'))), '1',
  'the duplicate parent wrote exactly one edge');

-- ----------------------------------------------------------------------------
-- 9–12 · Q4 (D7 amended): a parent whose CURRENT taint exceeds
-- own ∪ drafted refuses with its own post-authorization shape — the
-- approver re-renders and reads the wider audience before approving it.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-drift-1')::text $$,
  current_setting('t.prop_drift'))), 'ERROR:P0001:proposal_taint_changed',
  'a parent grown past the drafted taint refuses: re-render, nobody approves an audience they did not read');

select is(pg_temp.scalar(format(
  $$ select status from public.proposals where id = %L $$,
  current_setting('t.prop_drift'))), 'pending',
  'the drift refusal wrote nothing — the proposal is still pending');

select is(pg_temp.call_as(current_setting('t.u3')::uuid, format(
  $$ select hc.approve_proposal(%L, 1, 'k-drift-2')::text $$,
  current_setting('t.prop_drift2'))), 'ERROR:P0001:approval_refused',
  'authorization outranks drift: a summary-level member learns approval_refused, never the taint state');

select is(substr(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-cover-1')) ->> 'status' $$,
  current_setting('t.prop_cover'))), 1, 8), 'approved',
  'a drafted taint covering the parents approves — 1C drafting folds parents-at-draft into the proposal');

select is(pg_temp.scalar(format(
  $$ select t.taint::text from public.tasks t
     join public.proposal_commits pc on pc.object_id = t.id
     where pc.proposal_id = %L $$,
  current_setting('t.prop_cover'))), '{schedule,finances}',
  'the covered approval carries the exact union');

-- ----------------------------------------------------------------------------
-- 13 · R1 sequential binding for the share path: a freeze committed
-- before the call refuses share_object on its next authorization
-- evaluation (014 pins revise; RLS-08 pins reads). 2A M2: the call
-- presents a VALID step-up token, so the refusal is the freeze's.
-- ----------------------------------------------------------------------------
do $$
declare v text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('t.u1')::uuid, 'role', 'authenticated',
    'aal', 'aal1',
    'amr', jsonb_build_array(jsonb_build_object('method', 'password',
      'timestamp', extract(epoch from now())::bigint)))::text, true);
  execute 'set local role authenticated';
  v := hc.mint_step_up('share_object',
                       'document:' || current_setting('t.doc_f')) ->> 'token';
  execute 'reset role';
  perform set_config('t.tok_frz', v, true);
end $$;
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.share_object('document', %L, %L, %L)::text $$,
  current_setting('t.doc_f'), current_setting('t.mf'),
  current_setting('t.tok_frz'))), 'ERROR:P0001:share_refused',
  'a committed freeze refuses sharing at the next authorization evaluation');

select * from finish();
rollback;
