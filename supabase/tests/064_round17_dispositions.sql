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

select plan(32);

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

-- ============================================================================
-- 21-32 · THE PAYLOAD CONTRACT'S RESIDUE (ADR-0025 D16 S16.8; the
-- pre-authorised 6B slot). The sign-off found the round's enumeration short
-- by two and drove both; the 6B build's THIRD re-derivation — from EVERY
-- payload-derived cast expression in the function, not from the insert arms
-- (the frame that produced the miss twice) — confirmed both, REFUTED one
-- candidate (a scalar p_edits refuses honestly as high_risk_unconfirmed
-- today — checked, not assumed), found approve's top-level p_edits keys
-- uncontracted (an unknown key is silently ignored), and the condition-6
-- audit of hc.revise_object found the SAME classes at ITS click: 23502 on a
-- {key: null} patch, 22007 through the due_on cast, 23514 through the due
-- pair. The step-up path is CLEAN (the token is digested, never cast) and
-- hc.reject_proposal is CLEAN (it authorizes on the row's own taint and
-- consumes no payload).
--
-- The keep_both arm gets its cases at last (S16.8 condition 3): the one arm
-- whose cast coverage was incomplete was the one arm this file did not
-- exercise.
-- ============================================================================
do $fx2$
declare
  c1 uuid := current_setting('t.c1')::uuid;
  s1 uuid := current_setting('t.s1')::uuid;
  a1 uuid := current_setting('t.a1')::uuid;
  u1 uuid := current_setting('t.u1')::uuid;
begin
  perform set_config('t.p_cf_dom', gen_random_uuid()::text, true);
  perform set_config('t.p_cf_ok',  gen_random_uuid()::text, true);
  perform set_config('t.p_hi',     gen_random_uuid()::text, true);
  perform set_config('t.rv_task',  gen_random_uuid()::text, true);
  perform set_config('t.rv_doc',   gen_random_uuid()::text, true);

  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload, taint) values
    -- the S16.2 shape: a DRAFTED conflict with a malformed domain —
    -- draft_proposal's conflict branch returns before the own_domain cast
    -- and never validates it, so this rests at pending with no edit involved
    (current_setting('t.p_cf_dom')::uuid, a1, c1, s1, 'conflict',
     jsonb_build_object('field', 'medication_dose', 'value', '500 mg',
                        'risk_class', 'high', 'domain', 'bogus',
                        'task', jsonb_build_object('title', 'Reconcile the dose')),
     '{health}'),
    -- a WELL-FORMED conflict for the keep_both control
    (current_setting('t.p_cf_ok')::uuid, a1, c1, s1, 'conflict',
     jsonb_build_object('field', 'medication_dose', 'value', '500 mg',
                        'risk_class', 'high', 'domain', 'health',
                        'task', jsonb_build_object('title', 'Reconcile the dose')),
     '{health}'),
    -- a high-risk profile_fact for the p_edits top-level contract cases
    (current_setting('t.p_hi')::uuid, a1, c1, s1, 'profile_fact',
     jsonb_build_object('field', 'allergy_substance', 'value', 'penicillin',
                        'risk_class', 'high', 'domain', 'health'), '{health}');

end $fx2$;

-- Record rows for the revise_object cases. Direct inserts step around the
-- §4.9 claim trigger under replica role — the e2e fixtureInsert technique; a
-- FIXTURE concession inside a transaction that only ever rolls back. The SET
-- must be TOP-LEVEL: supautils admits the privileged role through the utility
-- hook, and set_config() inside plpgsql bypasses that hook into the vanilla
-- superuser check, which the supabase image's postgres role fails.
set local session_replication_role = replica;
insert into public.tasks (id, circle_id, subject_id, title,
                          approved_by, approved_at, approver_display_name, taint)
values (current_setting('t.rv_task')::uuid, current_setting('t.c1')::uuid,
        current_setting('t.s1')::uuid, 'Call the pharmacy',
        current_setting('t.u1')::uuid, now(), 'Rosa', '{schedule}');
insert into public.documents (id, circle_id, subject_id, title, category, summary_text,
                              artifact_arrival_id, filed_at,
                              approved_by, approved_at, approver_display_name, taint)
values (current_setting('t.rv_doc')::uuid, current_setting('t.c1')::uuid,
        current_setting('t.s1')::uuid, 'Discharge summary', 'medical', 'A summary.',
        current_setting('t.a1')::uuid, now(),
        current_setting('t.u1')::uuid, now(), 'Rosa', '{health}');
set local session_replication_role = default;

-- ----------------------------------------------------------------------------
-- 21 · S16.2 at `keep`: the taint math casts the payload's domain for EVERY
--      outcome (:421) while the cast half covered use_new alone. NO EDIT.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-s168-21',
       '{"conflict_outcome":"keep"}'::jsonb)::text $$,
  current_setting('t.p_cf_dom'))),
  'ERROR:P0001:approval_refused',
  'S16.8: a drafted conflict with a malformed domain refuses under KEEP instead of raising 22P02 in the taint math — reachable with no edit at all, because draft_proposal''s conflict branch never validates a conflict payload''s domain');

-- ----------------------------------------------------------------------------
-- 22 · S16.2 at `keep_both` — condition 3's arm, exercised at last.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-s168-22',
       '{"conflict_outcome":"keep_both"}'::jsonb)::text $$,
  current_setting('t.p_cf_dom'))),
  'ERROR:P0001:approval_refused',
  'S16.8 condition 3: keep_both refuses the same malformed domain the same way — the arm whose cast coverage was incomplete was the arm this file did not exercise, and now it does');

-- ----------------------------------------------------------------------------
-- 23 · S16.3: confirm_high is a top-level caller key the edit contract did
--      not fence, cast jsonb→boolean at :500.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-s168-23',
       '{"confirm_high":"yes"}'::jsonb)::text $$,
  current_setting('t.p_hi'))),
  'ERROR:P0001:approval_refused',
  'S16.8: confirm_high that is not a boolean refuses instead of raising 22023 (cannot cast jsonb string to type boolean) — the p_edits TOP-LEVEL contract, D2''s fail-closed posture extended one level up');

-- ----------------------------------------------------------------------------
-- 24 · The shape itself: a SCALAR p_edits. (Refuted as a crash by the third
--      re-derivation — today it lands high_risk_unconfirmed — and contracted
--      anyway: a malformed shape should be named as one, not answered as an
--      unconfirmed high-risk value.)
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-s168-24',
       '"just-a-string"'::jsonb)::text $$,
  current_setting('t.p_hi'))),
  'ERROR:P0001:approval_refused',
  'S16.8 condition 4: p_edits that is not an object refuses AS a contract violation — not as high_risk_unconfirmed, which answers a different question about a well-formed request');

-- ----------------------------------------------------------------------------
-- 25 · An UNKNOWN top-level key. Today it is silently ignored — the same
--      fail-open posture D2 closed for `fields`, one level up.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.approve_proposal(%L::uuid, 1, 'k-s168-25',
       '{"confirm_high":true,"fields_":{"value":"smuggled"}}'::jsonb)::text $$,
  current_setting('t.p_hi'))),
  'ERROR:P0001:approval_refused',
  'S16.8 condition 4: an unknown top-level p_edits key refuses fail-closed — a typo''d or future key must never be silently ignored on the one function that writes the record');

-- ----------------------------------------------------------------------------
-- 26 · CONTROL: the well-formed keep_both still commits its task — the
--      cast joins the guard without narrowing an approval.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L::uuid, 1, 'k-s168-26',
       '{"conflict_outcome":"keep_both"}'::jsonb)) ->> 'outcome' $$,
  current_setting('t.p_cf_ok'))),
  'keep_both',
  'S16.8 CONTROL: a well-formed conflict resolved keep_both still commits the reconciliation task as the approval''s one object — the residue''s fix narrows crashes, never approvals');

-- ----------------------------------------------------------------------------
-- 27 · CONTROL: a proper boolean confirm_high still approves the high-risk
--      item — the contract admits exactly the shape the screen sends.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L::uuid, 1, 'k-s168-27',
       '{"confirm_high":true}'::jsonb)) ->> 'status' $$,
  current_setting('t.p_hi'))),
  'approved',
  'S16.8 CONTROL: confirm_high true (a real boolean) approves the high-risk item — PRD §6.4''s confirmation channel is untouched by the fence around its shape');

-- ----------------------------------------------------------------------------
-- 28-30 · THE CONDITION-6 AUDIT'S FINDINGS: hc.revise_object carries its own
--         copies of the record-table writes, and the same classes were open
--         at ITS click. All three driven live at the 6B build (rollback-only)
--         before this file pinned them.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.revise_object('task'::hc.object_type, %L::uuid,
       '{"title": null}'::jsonb)::text $$,
  current_setting('t.rv_task'))),
  'ERROR:P0001:revise_invalid_field',
  'S16.8 condition 6: a {title: null} patch refuses instead of raising 23502 — the M1 class, at revise_object''s own click, for every NOT NULL column its allowlists name');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.revise_object('task'::hc.object_type, %L::uuid,
       '{"due_on": "not-a-date"}'::jsonb)::text $$,
  current_setting('t.rv_task'))),
  'ERROR:P0001:revise_invalid_field',
  'S16.8 condition 6: a due_on that is not a date refuses instead of raising 22007 — the D1 cast class, at the one payload-derived cast revise_object performs');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select hc.revise_object('task'::hc.object_type, %L::uuid,
       '{"due_on": "2026-09-01"}'::jsonb)::text $$,
  current_setting('t.rv_task'))),
  'ERROR:P0001:revise_invalid_field',
  'S16.8 condition 6: due_on patched without its zone onto a task holding neither refuses instead of raising 23514 tasks_check — the destination class, mirrored from the shipped constraint exactly as D1 did it');

-- ----------------------------------------------------------------------------
-- 31-32 · CONTROLS: revise still revises, and the complete pair still lands.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.revise_object('document'::hc.object_type, %L::uuid,
       '{"title": "Discharge summary (corrected)"}'::jsonb)) ->> 'revision_no' $$,
  current_setting('t.rv_doc'))),
  '1',
  'S16.8 CONTROL: a well-formed revision still revises and still numbers itself — the guards narrow crashes, never corrections');

select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.revise_object('task'::hc.object_type, %L::uuid,
       '{"due_on": "2026-09-01", "due_zone": "America/New_York"}'::jsonb)) ->> 'revision_no' $$,
  current_setting('t.rv_task'))),
  '1',
  'S16.8 CONTROL: the COMPLETE due pair patches cleanly — the constraint guard admits exactly what the constraint admits');

select * from finish();

rollback;
