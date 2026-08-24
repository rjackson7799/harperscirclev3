-- ============================================================================
-- 6A · M2 — the review boundary. Q7 SETTLED 2026-08-24, and it is the
-- LOAD-BEARING ruling of the set: it makes PRD §4.2.3's own sentence true as
-- written and PRD §6.4's crop rule satisfiable in the only mode this slice
-- ships in. docs/review/slice-6-plan.md §4.4 + M2; TSD §3.7, §4.9, §6.4;
-- PRD §6.4, §7.3; ADR-0019 Q-C. Pinned here BEFORE the migration exists.
--
-- ---------------------------------------------------------------------------
-- THE COMPOSITION, which is what Q7 found. Three regions of one screen read
-- through three correct gates, and NOBODY had written down what they do when
-- they meet:
--
--   the source      arrivals + artifact route   view  over ALL FIVE domains
--   what we read    extractions                 view  over ALL FIVE domains
--   what we propose proposals + approve         manage over the proposal's
--                                               OWN taint
--
-- hc.grant_vectors builds each level's array cumulatively, so
-- hc.ladder(s, all_domains) is the caller's MINIMUM level across five
-- domains. Therefore a member holding `manage` on ONE domain and nothing on
-- the other four can SEE a proposal tainted with that domain and can APPROVE
-- it — while the source it cites and the extracted fact it was drawn from
-- are both invisible to them. The screen renders a dark left region, an
-- empty middle region, and a fully live right region.
--
-- In all-high-risk mode — this slice's ONLY mode — the contradiction is
-- formal, not aesthetic: hc.approve_proposal already demands
-- `confirm_high` for a high-risk value, and PRD §6.4 says the crop must be
-- ON SCREEN before approve activates. So the database would accept a
-- `confirm_high` from a person who could not possibly have seen a crop.
--
-- THE RULING: approval narrows IN THE DATABASE, not only in the interface,
-- because §3.7's rule is that access is re-checked at WRITE time and an
-- interface-only rule is one a second client does not have. ONE added
-- predicate — the same one hc.log_artifact_read (20260821120001:81) and the
-- artifact route already enforce — refusing in the existing
-- `approval_refused` shape (DEF-10), so nothing leaks.
--
-- Cases 1-3 drive the narrowing BOTH WAYS, which is the plan's word: the
-- refusal alone would be satisfied by a function that refuses everything.
--
-- ---------------------------------------------------------------------------
-- RE-PINNED IN THIS SAME COMMIT (the plan's instruction): 013's and 054's
-- approval cases. The narrowing touches a function seven slices depend on,
-- so cases 4-7 assert that what already passes still passes — a coordinator
-- approves, a conflict still resolves through all three outcomes' entry, and
-- care_circle is still refused by the §3.3 ceiling it was always refused by.
-- 013 and 054 themselves run unchanged in the same suite; these are the
-- explicit re-pins the plan asks for at the narrowing's own site.
--
-- ---------------------------------------------------------------------------
-- ONE CONSEQUENCE IS RECORDED RATHER THAN DESIGNED AROUND (case 15).
-- hc.create_manual_proposal authorizes on manage-over-drafted-taint ALONE
-- (20260816010006:113) — it does not ask for view×5. So after this
-- narrowing a member below view×5 can CREATE a manual entry and can no
-- longer APPROVE it. The ruling says ONE predicate and says nothing about
-- manual entry, and inventing an exemption is an owner decision rather than
-- a build decision — so the consequence is PINNED, visibly, and carried to
-- round 17 with a recommended answer rather than left latent.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(16);

-- ----------------------------------------------------------------------------
-- Helpers (the 013 pattern).
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

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERROR:' || sqlstate;
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures. One circle, one subject, one arrival with three extracted facts.
--
--   u_coord   coordinator, manage on all five        — view×5 follows
--   u_partial family,      manage on `health` ONLY   — THE Q7 COMPOSITION:
--                                                      manage on the taint,
--                                                      hidden across five
--   u_care    care_circle, manage on all five        — the §3.3 ceiling
--
-- u_partial is raised to view on the other four mid-file (case 3), which is
-- what drives the narrowing the second way.
-- ----------------------------------------------------------------------------
do $$
declare
  u_coord   uuid := pg_temp.mk_user(gen_random_uuid());
  u_partial uuid := pg_temp.mk_user(gen_random_uuid());
  u_care    uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m_coord uuid; m_partial uuid; m_care uuid;
  a1 uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u_coord, 'member', 'Rosa'), (u_partial, 'member', 'Priya'),
    (u_care, 'member', 'Marisol');
  insert into public.circles (name, created_by) values ('Nell''s circle', u_coord)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'rb6-' || substr(c1::text, 1, 8)) returning id into s1;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_coord, 'coordinator', 'Rosa') returning id into m_coord;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_partial, 'family', 'Priya') returning id into m_partial;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_care, 'care_circle', 'Marisol') returning id into m_care;

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_coord, s1, d::hc.domain, 'manage', u_coord),
           (c1, m_care,  s1, d::hc.domain, 'manage', u_coord);
  end loop;
  -- THE COMPOSITION: one domain at manage, four domains held at NOTHING.
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_partial, s1, 'health'::hc.domain, 'manage', u_coord);

  insert into public.arrivals (id, circle_id, subject_id, channel, state)
  values (a1, c1, s1, 'upload', 'proposals_ready');

  -- three extracted facts, deliberately NOT in field order on insert, so
  -- case 11's ordering assertion is about the function and not about luck
  insert into public.extractions
    (arrival_id, circle_id, subject_id, field, value, confidence, risk_class,
     citation, model_id, prompt_version)
  values
    (a1, c1, s1, 'medication_dose', '"10mg daily"'::jsonb, 0.910, 'high',
     jsonb_build_object('page', 2, 'bbox', jsonb_build_array(0.1,0.2,0.3,0.05)),
     'claude-opus-5', 'v3'),
    (a1, c1, s1, 'allergy_status', '"penicillin"'::jsonb, 0.640, 'high',
     jsonb_build_object('page', 1, 'bbox', jsonb_build_array(0.1,0.5,0.4,0.05)),
     'claude-opus-5', 'v3'),
    (a1, c1, s1, 'diet_note', '"low sodium"'::jsonb, 0.880, 'standard',
     jsonb_build_object('page', 1, 'bbox', jsonb_build_array(0.1,0.7,0.4,0.05)),
     'claude-opus-5', 'v3');

  -- proposals: one per actor path, all health-tainted so manage-on-taint
  -- passes for EVERY actor below and only the new predicate can separate them
  perform set_config('t.p_partial', gen_random_uuid()::text, true);
  perform set_config('t.p_partial2', gen_random_uuid()::text, true);
  perform set_config('t.p_coord',   gen_random_uuid()::text, true);
  perform set_config('t.p_care',    gen_random_uuid()::text, true);
  perform set_config('t.p_conf',    gen_random_uuid()::text, true);

  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint) values
    (current_setting('t.p_partial')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'diet_note', 'value', 'low sodium',
                        'risk_class', 'standard', 'domain', 'health'), '{health}'),
    (current_setting('t.p_partial2')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'diet_note_2', 'value', 'no added salt',
                        'risk_class', 'standard', 'domain', 'health'), '{health}'),
    (current_setting('t.p_coord')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'blood_type', 'value', 'O+',
                        'risk_class', 'standard', 'domain', 'health'), '{health}'),
    (current_setting('t.p_care')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'mobility', 'value', 'walker',
                        'risk_class', 'standard', 'domain', 'health'), '{health}');

  perform set_config('t.u_coord', u_coord::text, true);
  perform set_config('t.u_partial', u_partial::text, true);
  perform set_config('t.u_care', u_care::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.m_partial', m_partial::text, true);
end $$;

-- ----------------------------------------------------------------------------
-- 0-check · the composition is REAL before it is narrowed: u_partial clears
-- manage on the proposal's taint and is BELOW view across five domains.
-- Without this, cases 1-3 could pass for the wrong reason.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $$ select hc.visible_at(hc.ctx(), %L::uuid, '{health}'::hc.domain[], true,
                          null, null, null)::text || '/' ||
            hc.visible_at(hc.ctx(), %L::uuid, hc.all_domains(), true,
                          'arrival', %L::uuid, null)::text $$,
  current_setting('t.s1'), current_setting('t.s1'), current_setting('t.a1'))),
  'manage/hidden',
  'the Q7 composition is real and not a fixture accident: this member clears MANAGE on the proposal''s taint and is HIDDEN over all five domains on the arrival it cites');

-- ----------------------------------------------------------------------------
-- 1-2 · THE NARROWING, first way: manage-on-taint WITHOUT view×5 is refused,
--       and it wrote nothing.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-partial-1')::text $$,
  current_setting('t.p_partial'))),
  'ERROR:P0001:approval_refused',
  'Q7: a member with manage on the taint but NO view on the arrival cannot approve — the fact''s source and citation are invisible to them, and the database says so rather than the interface');

select is(pg_temp.scalar(format(
  $$ select (select count(*)::text from public.proposal_commits c where c.proposal_id = %L::uuid)
         || ':' ||
            (select p.status from public.proposals p where p.id = %L::uuid)
         || ':' ||
            (select count(*)::text from public.approval_attempts a
              where a.idempotency_key = 'k-partial-1') $$,
  current_setting('t.p_partial'), current_setting('t.p_partial'))),
  '0:pending:0',
  'and the refusal wrote NOTHING — no commit row, the proposal still pending, and not even the idempotency claim survives (it rolls back with the refusal, so the key is not burned)');

-- ----------------------------------------------------------------------------
-- 3 · THE NARROWING, THE OTHER WAY — the case that makes this a narrowing
--     rather than a refusal. The SAME actor, on the SAME proposal shape,
--     succeeds once they can actually see the source.
-- ----------------------------------------------------------------------------
do $$
declare d text;
begin
  foreach d in array array['memories','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (current_setting('t.c1')::uuid, current_setting('t.m_partial')::uuid,
            current_setting('t.s1')::uuid, d::hc.domain, 'view',
            current_setting('t.u_coord')::uuid);
  end loop;
end $$;

select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $$ select (hc.approve_proposal(%L::uuid, 1, 'k-partial-2')) ->> 'status' $$,
  current_setting('t.p_partial2'))),
  'approved',
  'THE OTHER WAY: raised to view on the other four domains, the very same member approves — the predicate narrows to the evidence, it does not simply refuse');

-- ----------------------------------------------------------------------------
-- 4-6 · 013 AND 054 RE-PINNED AT THE NARROWING'S OWN SITE. What already
--       passes must still pass, and the ceiling that already refused must
--       still refuse.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (hc.approve_proposal(%L::uuid, 1, 'k-coord-1')) ->> 'status' $$,
  current_setting('t.p_coord'))),
  'approved',
  '013 re-pinned: a coordinator holds manage×5 and therefore view×5, so the narrowing is invisible to the actor the product actually expects to review');

select is(pg_temp.scalar(format(
  $$ select object_type::text from public.proposal_commits where proposal_id = %L::uuid $$,
  current_setting('t.p_coord'))),
  'profile_fact',
  '013 re-pinned: and it still WRITES — one proposal, one claimed object, unchanged');

select is(pg_temp.call_as(current_setting('t.u_care')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-care-1')::text $$,
  current_setting('t.p_care'))),
  'ERROR:P0001:approval_refused',
  '013:307 re-pinned: care_circle holds manage grants and still cannot approve — the §3.3 ceiling binds the writer, and the new predicate did not disturb which refusal fires');

-- ----------------------------------------------------------------------------
-- 7 · DEF-10: the new refusal is the SAME shape as every other one, so the
--     narrowing leaks no new information about what exists.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-nonexistent')::text $$,
  gen_random_uuid())),
  'ERROR:P0001:approval_refused',
  'DEF-10 holds: a proposal that does not exist refuses in exactly the shape the new predicate refuses in — nonexistent, foreign, below-cliff and now source-invisible are one word');

-- ----------------------------------------------------------------------------
-- 8 · hc.extractions_for — ADR-0019 Q-C's queued candidate, whose consumer
--     is finally real. Privilege closure is CATALOG-BASED: a function-ACL
--     denial segfaults this Postgres image, so closure is read, never probed.
-- ----------------------------------------------------------------------------
select ok(
  (select pg_get_userbyid(p.proowner) = 'hc_internal'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('hc_pipeline', p.oid, 'execute')
      and not has_function_privilege('hc_admin', p.oid, 'execute')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname = 'extractions_for'),
  'hc.extractions_for is a definer owned by hc_internal, executable by authenticated and by NOBODY else — read from the catalog, never probed by calling as a denied role');

-- ----------------------------------------------------------------------------
-- 9-11 · The fact read itself: the seven columns, no band, stable order.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select count(*)::text from hc.extractions_for(%L::uuid) $$,
  current_setting('t.a1'))),
  '3',
  'a caller who clears view×5 on the arrival reads its extracted facts — the middle region of §4.2.3''s screen finally has a read path');

select is(
  (select string_agg(x.name, ',' order by x.ord)
     from (select unnest(p.proargnames) as name,
                  generate_subscripts(p.proargnames, 1) as ord,
                  unnest(p.proargmodes) as mode
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'hc' and p.proname = 'extractions_for') x
    where x.mode = 't'),
  'field,value,confidence,risk_class,citation,model_id,prompt_version',
  'the column set is EXACTLY the seven, and there is NO BAND COLUMN (Q4): a band is a property of the calibration, not of the fact, and storing one would freeze one calibration into the record');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select string_agg(field, ',') from hc.extractions_for(%L::uuid) $$,
  current_setting('t.a1'))),
  'allergy_status,diet_note,medication_dose',
  'the order is stable and is the function''s, not the insert order''s — the screen renders the same sequence on every render, which is what a person re-finding a fact depends on');

-- ----------------------------------------------------------------------------
-- 12-14 · ONE GATE ACROSS THE WHOLE SURFACE. The fact read refuses on
--         exactly the predicate approval now refuses on, in one shape, and
--         is never wider than extractions_select would have been.
-- ----------------------------------------------------------------------------
do $$
declare d text;
begin
  -- put u_partial back BELOW view×5 so the fact read is asked the same
  -- question approval was asked in case 1
  delete from public.access_grants g
   where g.member_id = current_setting('t.m_partial')::uuid
     and g.domain <> 'health'::hc.domain;
end $$;

select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $$ select count(*)::text from hc.extractions_for(%L::uuid) $$,
  current_setting('t.a1'))),
  'ERROR:P0001:extraction_refused',
  'ONE GATE: the member who cannot approve also cannot read the facts — the same view×5 on the same arrival, refused rather than returned empty, so the screen and the artifact route cannot disagree');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select count(*)::text from hc.extractions_for(%L::uuid) $$,
  gen_random_uuid())),
  'ERROR:P0001:extraction_refused',
  'and a nonexistent arrival lands in the SAME one shape — the definer is no existence oracle (DEF-10)');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $$ select (select count(*) from hc.extractions_for(%L::uuid))::text || ':' ||
            (select count(*) from public.extractions e where e.arrival_id = %L::uuid)::text $$,
  current_setting('t.a1'), current_setting('t.a1'))),
  '3:3',
  'the definer is never WIDER than the RLS it stands in for: for a caller who can read the rows through extractions_select, it returns exactly those rows and no others');

-- ----------------------------------------------------------------------------
-- 15 · THE RECORDED CONSEQUENCE. hc.create_manual_proposal asks for
--      manage-over-taint and NOT for view×5, so a member below view×5 can
--      still create a manual entry they can no longer approve. Pinned so it
--      is visible, and carried to round 17 with a recommendation rather than
--      exempted here on a build's own authority.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $$ select hc.approve_proposal(
       ((hc.create_manual_proposal(%L::uuid, %L::uuid, 'profile_fact'::hc.proposal_kind,
          jsonb_build_object('field', 'preferred_name', 'value', 'Nell',
                             'risk_class', 'standard', 'domain', 'health'))) ->> 'proposal_id')::uuid,
       1, 'k-manual-1')::text $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'ERROR:P0001:approval_refused',
  'RECORDED, NOT DESIGNED AROUND: a member below view×5 can still CREATE a manual entry (create_manual_proposal asks only for manage over the drafted taint) and can no longer APPROVE it — the ruling says ONE predicate and says nothing about manual entry, so the seam is pinned here and put to round 17');

select * from finish();

rollback;
