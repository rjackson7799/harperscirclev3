-- ============================================================================
-- 6A · M6 — the ROUND-17 DISPOSITIONS (docs/review/round-17-findings.md;
-- ADR-0025). Pinned here BEFORE the migration exists — the red leg, the
-- standing 5A M6 / 6A M1 precedent.
--
-- Three dispositions need DDL and this file drives all three, both ways.
--
-- ---------------------------------------------------------------------------
-- 1 · F-1 (MAJOR) + Q-D — THE APPROVE-TIME PAYLOAD CONTRACT.
--
-- `hc.approve_proposal` merges caller-supplied jsonb into the payload with no
-- validation at all, before every guard in the function:
--
--     v_payload := v_prop.payload || coalesce(p_edits -> 'fields', '{}'::jsonb);
--                                                   -- 20260824120003:478
--
-- M1 closed the 23502 class on the ORDINARY arm. The review found three more
-- classes the same click still reaches; re-deriving the enumeration for this
-- disposition found three beyond those. All six are driven below:
--
--   23514 tasks_check         — guarded on the CONFLICT arm (:502) and NOT on
--                               the ordinary one (:717). One constraint, one
--                               function, two answers.
--   23514 temporal_shape      — Q-D's named-and-not-taken class.
--   22P02 / 22007 casts       — `draft_proposal` validates `risk_class`'s
--                               vocabulary (20260824120001:160-163);
--                               `approve_proposal` checks only `is null` and
--                               then casts. An EDIT re-opens a class drafting
--                               had closed.
--   23502 profile_facts.risk_class ON THE CONFLICT ARM — found by this
--                               disposition, not by the review. M1's guard
--                               block lives inside the `else` branch
--                               (:541-550); the conflict arm's own guard
--                               (:492-497) checks `field`, `value` and
--                               `domain` and NOT `risk_class`, and use_new
--                               writes it into a NOT NULL column at :673.
--                               The class M1 says it closed is open one arm
--                               over, in the same function.
--   23503 timeline_events episode FK — a payload-supplied `episode_id` that
--                               names no episode of this circle.
--   the PROVENANCE channel    — `manual` is machinery-declared
--                               (20260816010006:107, "the machinery declares
--                               the flag; a caller cannot unset it") and an
--                               EDIT can set it, which nulls `source_arrival_id`
--                               at :650 and detaches the written object from
--                               the arrival it came from. Not a crash; a
--                               record-integrity consequence of the same line.
--
-- THE RULING (ADR-0025 D1/D2): the payload is validated where its DESTINATION
-- is known, and an EDIT is bounded to content keys. Cases 1-8 refuse; cases
-- 9-10 are the controls that make this a narrowing of CRASHES and not of
-- approvals — every payload refused above would have raised a raw Postgres
-- error a few statements later, and a well-formed edit still approves.
--
-- ---------------------------------------------------------------------------
-- 2 · F-3 (OBSERVATION, taken) — THE LIVENESS ASYMMETRY IN D10.
--
-- ADR-0024 D10 claims five surfaces "all ask the same question of the same
-- arrival". Two of the five ask it of the arrival ROW —
-- `hc.extractions_for` (20260824120002:628-631) and `hc.receipt_for`
-- (20260824120005:103-106), both carrying `a.deleted_at is null` from the
-- pattern's source `hc.log_artifact_read` (20260821120001:79-82). THREE do
-- not: `hc.approve_proposal` (:611), `hc.reject_proposal` (:298) and the
-- `arrival_renditions_select` policy (20260824120004:118-122), which never
-- read the row at all.
--
-- Unreachable today — nothing in the tree writes `arrivals.deleted_at`. Taken
-- anyway on the ROUND-15 FINDING 2 precedent, pinned two files over at
-- 056: `hc.list_known_senders` omitted the same guard, was equally
-- unreachable, and was fixed "on the live-actor principle, not on a live
-- exploit". Cases 11-13.
--
-- ---------------------------------------------------------------------------
-- 3 · Q-B — THE MANUAL-ENTRY SEAM, closed.
--
-- 060 case 16 pinned it open on purpose and carried it here:
-- `hc.create_manual_proposal` authorizes on manage-over-drafted-taint alone
-- (20260816010006:113), so after M2 a member below view×5 can CREATE an entry
-- they can no longer APPROVE. THE LADDER FORM is the predicate to add, not
-- the arrival form: the arrival is created in the SAME transaction, so it can
-- carry no `object_shares` row and `hc.visible_at`'s share rung (5) is dead
-- there. The arrival form would also refuse — and would read as though a
-- share could rescue it, when nothing ever can. Cases 14-16.
--
-- ---------------------------------------------------------------------------
-- 4 · F-2 (MINOR, latent) — Q7'S SECOND REFUSAL CHANNEL, made checkable.
--
-- ADR-0024 D1 records ONE consequence of the narrowing and there are TWO. The
-- added predicate hardcodes `hc.all_domains(), true`, which makes
-- `visible_at` rung 3 — "unresolved or empty lineage: manage on all five, or
-- nothing" — unreachable for that call, while the manage check above it still
-- passes `v_prop.taint_resolved` and can take rung 3. So a care_circle-tier
-- actor holding manage×5 on an UNRESOLVED-lineage proposal took rung 3 and
-- got `manage`; the new call skips to rung 4, the care_circle ceiling, and
-- gets `hidden`. THE REFUSAL REASON IS THE CEILING, NOT THE view×5 LADDER —
-- which is the opposite of what 060 case 6's message asserts in general.
--
-- The outcome is right and Q7 is RATIFIED UNCHANGED (ADR-0025 D5): a
-- care_circle actor with no share on the arrival genuinely cannot see the
-- source. What is amended is the RECORD. Cases 17-19 pin the divergence as
-- pure `hc.visible_at` calls on hand-built contexts — no fixtures, no rows,
-- nothing written — because the function is IMMUTABLE and takes its context
-- as a parameter.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(20);

-- ----------------------------------------------------------------------------
-- Helpers (the 013/059 pattern: role switch inside, message part of the pin).
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

-- The MESSAGE is the point of this file: the whole disposition is that the
-- message today is Postgres's, not ours.
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

-- A hand-built context for the rung probes: no fixtures, no rows, no writes.
-- hc.visible_at is IMMUTABLE and takes p_ctx as a PARAMETER, so the rung
-- order can be driven directly.
create function pg_temp.ctx_of(p_subject uuid, p_tier text, p_member uuid,
                               p_shares jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'account', '00000000-0000-0000-0000-0000000000aa'::uuid,
    'circles', '[]'::jsonb,
    'subjects', jsonb_build_object(p_subject::text, jsonb_build_object(
      'c', '00000000-0000-0000-0000-0000000000cc'::uuid,
      'member', p_member, 'tier', p_tier, 'frozen', false, 'cap', null,
      'manage',  '["memories","health","schedule","documents","finances"]'::jsonb,
      'view',    '["memories","health","schedule","documents","finances"]'::jsonb,
      'summary', '["memories","health","schedule","documents","finances"]'::jsonb,
      'log',     '["memories","health","schedule","documents","finances"]'::jsonb)),
    'shares', p_shares);
$$;

-- ----------------------------------------------------------------------------
-- Fixtures. Rosa founds c1/Nell and holds manage on all five domains, so
-- NOTHING in cases 1-13 is refused for authorization — every refusal those
-- cases see is the payload contract or the liveness guard and nothing else.
-- Pilar holds manage on `health` ALONE: she clears manage-over-taint on a
-- health item and is below view×5, which is exactly the seam Q-B closes.
--
-- The malformed proposals are inserted DIRECTLY rather than drafted, for
-- 059's reason: half of the guard is at draft time, so a fixture that drafted
-- them could not exist after the migration — and a direct insert models the
-- honest worry, rows already resting at `pending` when the guard ships.
-- ----------------------------------------------------------------------------
do $fx$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- manage×5 approver
  up uuid := pg_temp.mk_user(gen_random_uuid());   -- manage on health alone
  c1 uuid; s1 uuid; m1 uuid; mp uuid;
  a1  uuid := gen_random_uuid();
  ad  uuid := gen_random_uuid();                   -- the SOFT-DELETED arrival
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Rosa'), (up, 'member', 'Pilar');
  insert into public.circles (name, created_by) values ('Nell''s circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'd17-' || substr(c1::text, 1, 8)) returning id into s1;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Rosa') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, up, 'family', 'Pilar') returning id into mp;

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, mp, s1, 'health', 'manage', u1);

  insert into public.arrivals (id, circle_id, subject_id, channel, state)
  values (a1, c1, s1, 'upload', 'proposals_ready');
  -- F-3's arrival: live in every other respect, and soft-deleted.
  insert into public.arrivals (id, circle_id, subject_id, channel, state, deleted_at)
  values (ad, c1, s1, 'upload', 'proposals_ready', now());

  -- F-3 case 13: a manifest on the soft-deleted arrival.
  insert into public.arrival_renditions (arrival_id, circle_id, subject_id,
                                         page_count, page_exts)
  values (ad, c1, s1, 2, array['png','png']);

  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.u1', u1::text, true);
  perform set_config('t.up', up::text, true);
  perform set_config('t.mp', mp::text, true);
  perform set_config('t.a1', a1::text, true);
  perform set_config('t.ad', ad::text, true);

  perform set_config('t.p_task_pair', gen_random_uuid()::text, true);
  perform set_config('t.p_tl_shape',  gen_random_uuid()::text, true);
  perform set_config('t.p_pf_enum',   gen_random_uuid()::text, true);
  perform set_config('t.p_tl_date',   gen_random_uuid()::text, true);
  perform set_config('t.p_cf_norisk', gen_random_uuid()::text, true);
  perform set_config('t.p_tl_ep',     gen_random_uuid()::text, true);
  perform set_config('t.p_ed_parent', gen_random_uuid()::text, true);
  perform set_config('t.p_ed_manual', gen_random_uuid()::text, true);
  perform set_config('t.p_task_ok',   gen_random_uuid()::text, true);
  perform set_config('t.p_pf_ok',     gen_random_uuid()::text, true);
  perform set_config('t.p_del_appr',  gen_random_uuid()::text, true);
  perform set_config('t.p_del_rej',   gen_random_uuid()::text, true);

  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint) values
    -- 1 · a task with a title and no due pair; the EDIT supplies due_on alone
    (current_setting('t.p_task_pair')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Refill the lisinopril'), '{schedule}'),
    -- 2 · a timeline_event with a valid `kind` and NO temporal shape at all
    (current_setting('t.p_tl_shape')::uuid, a1, c1, s1, 'timeline_event',
     jsonb_build_object('summary', 'Cardiology follow-up', 'kind', 'medical'),
     '{health}'),
    -- 3 · a complete profile_fact; the EDIT supplies a bogus enum value
    (current_setting('t.p_pf_enum')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'blood_type', 'value', 'O+',
                        'risk_class', 'standard', 'domain', 'health'), '{health}'),
    -- 4 · a well-shaped timeline_event; the EDIT supplies a bogus date
    (current_setting('t.p_tl_date')::uuid, a1, c1, s1, 'timeline_event',
     jsonb_build_object('summary', 'Discharge', 'kind', 'medical',
                        'occurred_on', '2026-08-01'), '{health}'),
    -- 5 · THE 23502 M1 MISSED: a conflict whose use_new arm has no risk_class
    (current_setting('t.p_cf_norisk')::uuid, a1, c1, s1, 'conflict',
     jsonb_build_object('field', 'medication_lisinopril_dose', 'value', '40mg daily',
                        'domain', 'health'), '{health}'),
    -- 6 · a well-shaped timeline_event; the EDIT names an episode that is not
    (current_setting('t.p_tl_ep')::uuid, a1, c1, s1, 'timeline_event',
     jsonb_build_object('summary', 'Physio', 'kind', 'care',
                        'occurred_on', '2026-08-02'), '{health}'),
    -- 7 · the edit contract: `parents` is not a content key
    (current_setting('t.p_ed_parent')::uuid, a1, c1, s1, 'episode',
     jsonb_build_object('title', 'The August admission'), '{memories}'),
    -- 8 · the edit contract: `manual` is machinery-declared
    (current_setting('t.p_ed_manual')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'pharmacy', 'value', 'Porter Square',
                        'risk_class', 'standard', 'domain', 'health'), '{health}'),
    -- 9 · the CONTROL: the same task shape, edited WELL
    (current_setting('t.p_task_ok')::uuid, a1, c1, s1, 'task',
     jsonb_build_object('title', 'Book the podiatrist'), '{schedule}'),
    -- 10 · the CONTROL: an ordinary content edit still edits
    (current_setting('t.p_pf_ok')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'preferred_name', 'value', 'Nell',
                        'risk_class', 'standard', 'domain', 'memories'), '{memories}'),
    -- 11/12 · two proposals on the SOFT-DELETED arrival
    (current_setting('t.p_del_appr')::uuid, ad, c1, s1, 'episode',
     jsonb_build_object('title', 'A decision on a deleted source'), '{memories}'),
    (current_setting('t.p_del_rej')::uuid, ad, c1, s1, 'episode',
     jsonb_build_object('title', 'A rejection on a deleted source'), '{memories}');
end $fx$;

-- ----------------------------------------------------------------------------
-- 1 · 23514 tasks_check — the asymmetry INSIDE one function. The conflict arm
--     guards the due pair at :502; the ordinary arm writes it through at :717.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-1',
       '{"fields":{"due_on":"2026-09-01"}}'::jsonb)::text $$,
  current_setting('t.p_task_pair'))),
  'ERROR:P0001:approval_refused',
  'F-1: an edit that supplies due_on without due_zone refuses in the DEF-10 shape — the same constraint the CONFLICT arm has guarded since 5A M4, now guarded on the ordinary arm too');

-- ----------------------------------------------------------------------------
-- 2 · 23514 temporal_shape — Q-D's named-and-not-taken class.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-2')::text $$,
  current_setting('t.p_tl_shape'))),
  'ERROR:P0001:approval_refused',
  'Q-D: a timeline_event with neither occurred_on nor local_at refuses honestly instead of raising 23514 temporal_shape at a person''s click — and it takes NO edit to reach, so the class was open on drafted rows alone');

-- ----------------------------------------------------------------------------
-- 3 · 22P02 — the class draft_proposal closes and approve_proposal re-opened.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-3',
       '{"fields":{"risk_class":"urgent"}}'::jsonb)::text $$,
  current_setting('t.p_pf_enum'))),
  'ERROR:P0001:approval_refused',
  'F-1: an EDIT cannot re-open a vocabulary drafting already closed (20260824120001:160-163) — the cast is performed by the guard and its failure IS the refusal');

-- ----------------------------------------------------------------------------
-- 4 · 22007 — the date half of the same class.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-4',
       '{"fields":{"occurred_on":"not-a-date"}}'::jsonb)::text $$,
  current_setting('t.p_tl_date'))),
  'ERROR:P0001:approval_refused',
  'F-1: 22007 invalid_datetime_format is closed the same way and in the same place — one guard, every cast the insert arms perform');

-- ----------------------------------------------------------------------------
-- 5 · THE 23502 M1 MISSED. Found re-deriving F-1's enumeration for this
--     disposition, not by the review: the class M1 states it closed is open
--     one arm over, in the same function, with no edit required.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-5',
       '{"conflict_outcome":"use_new"}'::jsonb)::text $$,
  current_setting('t.p_cf_norisk'))),
  'ERROR:P0001:approval_refused',
  'ADR-0025 D1: a conflict resolved use_new with no risk_class refuses — M1''s guard block sits in the `else` branch and the conflict arm''s own guard (:492-497) checks field, value and domain and NOT risk_class, which profile_facts requires NOT NULL');

-- ----------------------------------------------------------------------------
-- 6 · 23503 — the one payload-derived FOREIGN KEY on any insert arm.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-6',
       jsonb_build_object('fields', jsonb_build_object('episode_id', gen_random_uuid()))::jsonb)::text $$,
  current_setting('t.p_tl_ep'))),
  'ERROR:P0001:approval_refused',
  'ADR-0025 D1: an episode_id that names no episode of this circle refuses instead of raising 23503 — the enumeration is complete, so the property can be stated without a hedge');

-- ----------------------------------------------------------------------------
-- 7 · THE EDIT CONTRACT. `parents` drives the taint arithmetic and the
--     provenance edges and drafting validated it once (20260824120001:105-123).
--     An edit that re-authors it is refused, not re-validated.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-7',
       '{"fields":{"parents":[]}}'::jsonb)::text $$,
  current_setting('t.p_ed_parent'))),
  'ERROR:P0001:approval_refused',
  'ADR-0025 D2: an EDIT corrects a value; it does not re-author the proposal. `parents` is not a content key, so the drafting contract''s validation of it still holds at approve');

-- ----------------------------------------------------------------------------
-- 8 · THE PROVENANCE CHANNEL. `manual` nulls source_arrival_id at :650.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-8',
       '{"fields":{"manual":true}}'::jsonb)::text $$,
  current_setting('t.p_ed_manual'))),
  'ERROR:P0001:approval_refused',
  'ADR-0025 D2: "the machinery declares the flag; a caller cannot unset it" (20260816010006:107) is true of the drafting path and was FALSE at approve — an edit could detach a record object from the arrival it came from');

-- ----------------------------------------------------------------------------
-- 9 · CONTROL, and the half that makes this a narrowing of CRASHES. A task
--     edited to a COMPLETE due pair approves, and the row lands with both.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L::uuid, 1, 'k-d17-9',
       '{"fields":{"due_on":"2026-09-01","due_zone":"America/New_York"}}'::jsonb)) ->> 'status' $$,
  current_setting('t.p_task_ok'))),
  'edited_approved',
  'NON-BREAKING BY CONSTRUCTION: the edit that SATISFIES the constraint still approves — every payload cases 1-6 refuse would have raised a raw Postgres error a few statements later, so nothing that succeeds today changes');

-- ----------------------------------------------------------------------------
-- 10 · CONTROL, the other way: an ordinary content edit still edits, so the
--      allowlist bounds the edit rather than removing it (§4.2.3).
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L::uuid, 1, 'k-d17-10',
       '{"fields":{"value":"Eleanor"}}'::jsonb)) ->> 'status' $$,
  current_setting('t.p_pf_ok'))),
  'edited_approved',
  'NON-BREAKING: §4.2.3''s edit-before-approval is untouched — a content key edits, and the shipped 054 edit shape ({"fields":{"value":...}}) is inside the contract');

-- ----------------------------------------------------------------------------
-- 11 · F-3: approve does not decide against a source it cannot read.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-11')::text $$,
  current_setting('t.p_del_appr'))),
  'ERROR:P0001:approval_refused',
  'F-3: a soft-deleted arrival refuses approval, so "you may decide it but not see what you decided" has no code path — hc.receipt_for already refuses that same arrival');

-- ----------------------------------------------------------------------------
-- 12 · F-3: reject inherits it, because rejecting a fact you cannot read is
--      as blind as approving one (the D6 argument, applied to liveness).
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.reject_proposal(%L::uuid, 1, 'k-d17-12', 'wrong')::text $$,
  current_setting('t.p_del_rej'))),
  'ERROR:P0001:approval_refused',
  'F-3: reject carries the same liveness as approve — one gate, and now one liveness, across the whole surface');

-- ----------------------------------------------------------------------------
-- 13 · F-3: the manifest is the third surface that never read the row. Zero
--      rows is the one shape for nonexistent, foreign, deleted and below-cliff.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select count(*)::text from public.arrival_renditions r where r.arrival_id = %L::uuid $$,
  current_setting('t.ad'))),
  '0',
  'F-3: arrival_renditions_select tested visibility without liveness, so a soft-deleted arrival''s page count stayed readable to a member its artifact, facts and receipt all refuse');

-- ----------------------------------------------------------------------------
-- 14 · Q-B: "you cannot create what you cannot approve." Pilar holds manage
--      on health and is below view×5 — the exact seam 060:16 pinned open.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.up')::uuid, format(
  $$ select hc.create_manual_proposal(%L::uuid, %L::uuid, 'profile_fact'::hc.proposal_kind,
       jsonb_build_object('field', 'preferred_name', 'value', 'Nell',
                          'risk_class', 'standard', 'domain', 'health'))::text $$,
  current_setting('t.c1'), current_setting('t.s1'))),
  'ERROR:P0001:draft_refused',
  'Q-B TAKEN: the manual seam is closed in the LADDER form — the arrival is created in THIS transaction, so it can carry no object_shares row and visible_at''s share rung is dead here; the arrival form would read as though a share could rescue it');

-- ----------------------------------------------------------------------------
-- 15 · And NOTHING survives the refusal: the arrival, its event and the draft
--      are all in the aborted transaction (the function's own contract).
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select count(*)::text from public.arrivals a
     where a.subject_id = %L::uuid and a.channel = 'manual' $$,
  current_setting('t.s1'))),
  '0',
  'Q-B: the refusal aborts the transaction, so a member below view×5 leaves no synthetic arrival behind — the seam closes without a cleanup path');

-- ----------------------------------------------------------------------------
-- 16 · Q-B, the other way: the narrowing refuses nobody who could approve.
-- ----------------------------------------------------------------------------
select is(
  case when pg_temp.call_as(current_setting('t.u1')::uuid, format(
         $$ select hc.create_manual_proposal(%L::uuid, %L::uuid, 'profile_fact'::hc.proposal_kind,
              jsonb_build_object('field', 'allergy_penicillin', 'value', 'rash',
                                 'risk_class', 'standard', 'domain', 'health'))::text $$,
         current_setting('t.c1'), current_setting('t.s1'))) like 'ERROR:%'
       then 'refused' else 'created' end,
  'created',
  'Q-B DRIVEN BOTH WAYS: manage×5 implies view×5, so the coordinator the product expects to use manual entry is untouched — a predicate that refused everyone would satisfy case 14 alone');

-- ----------------------------------------------------------------------------
-- 17-19 · F-2: Q7's SECOND consequence, as pure hc.visible_at calls. No
--         fixtures, no rows, nothing written — the function is IMMUTABLE and
--         takes its context as a parameter.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select hc.visible_at(pg_temp.ctx_of(%L::uuid, 'care_circle', gen_random_uuid()),
                          %L::uuid, hc.all_domains(), false, null, null, null)::text $$,
  current_setting('t.s1'), current_setting('t.s1'))),
  'manage',
  'F-2: the manage check passes v_prop.taint_resolved, so an UNRESOLVED-lineage proposal takes visible_at rung 3 — "manage on all five, or nothing" — and a care_circle actor with manage×5 resolves to manage there');

select is(pg_temp.scalar(format(
  $$ select hc.visible_at(pg_temp.ctx_of(%L::uuid, 'care_circle', gen_random_uuid()),
                          %L::uuid, hc.all_domains(), true, 'arrival',
                          '11111111-1111-1111-1111-111111111111'::uuid, null)::text $$,
  current_setting('t.s1'), current_setting('t.s1'))),
  'hidden',
  'F-2: the added predicate hardcodes (all_domains, true), which makes rung 3 UNREACHABLE for it — so the same actor falls to rung 4, the care_circle ceiling. ADR-0024 D1 records ONE consequence and there are TWO; the second one''s refusal reason is the CEILING, not the view×5 ladder');

select is(pg_temp.scalar(format(
  $$ select hc.visible_at(pg_temp.ctx_of(%L::uuid, 'care_circle', gen_random_uuid(),
                            jsonb_build_object('arrival',
                              jsonb_build_array('11111111-1111-1111-1111-111111111111'))),
                          %L::uuid, hc.all_domains(), true, 'arrival',
                          '11111111-1111-1111-1111-111111111111'::uuid, null)::text $$,
  current_setting('t.s1'), current_setting('t.s1'))),
  'manage',
  'F-2: and rung 5 rescues it — a care_circle actor WITH a share on that arrival still approves, which is why Q7 is RATIFIED UNCHANGED: the predicate asks for exactly what Q7 says must be required, and only the RECORD needed amending');

-- ----------------------------------------------------------------------------
-- 20 · DEF-10 across every new refusal: nothing above leaks a new word.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-d17-20')::text $$,
  gen_random_uuid())),
  'ERROR:P0001:approval_refused',
  'DEF-10 holds across the whole disposition: a payload that cannot satisfy its destination, an edit outside the contract, a soft-deleted source and a proposal that does not exist are ONE word — the guards narrow what is refused, never what is disclosed');

select * from finish();

rollback;
