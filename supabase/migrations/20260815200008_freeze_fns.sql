-- ============================================================================
-- 1A · M8 — hc.request_freeze() and hc.adjudicate_freeze(): the ONLY paths
-- that mutate the freeze tables (TSD §2.3, §3.8; ADR-0001 as amended).
--
-- EXECUTE is granted to no request-path role: intake reaches us through
-- the §9 service surfaces, and the admin_ops wrappers arrive in 1D. Tests
-- call as postgres (member of hc_internal).
-- ============================================================================

-- hc.log()'s sha256 lives in schema extensions; this is the first migration
-- where hc.log() runs AS hc_internal (from inside these definers), which is
-- when the owner-schema-USAGE gap bites. extensions is owned by postgres,
-- so unlike auth (see M7) this grant is migration-safe.
grant usage on schema extensions to hc_internal;

-- Intake is deliberately low-friction (PRD §7.5): every report that reaches
-- the service gets a ledger row and a disposition — opened_freeze,
-- attached_to_existing, or rate_limited — and the enforcement state is a
-- separate, single row per circle. Rate-limit constants (recorded as a
-- pointed round-5 review question; PRD pins semantics, not numbers):
--   · a claimant whose prior claim on this circle was adjudicated
--     'dismissed' is refused permanently (the PRD's repeat-request rule);
--   · at most 3 claims per claimant per circle per 30 days;
--   · at most 10 claims per circle per 30 days (the per-subject dimension
--     at circle granularity — strictly stronger, ADR-0001 amendment 1).
-- Claimant PII stays in the ledger; access_log entries carry the event and
-- disposition only (the log becomes family-readable in 1D).
create function hc.request_freeze(
  p_circle_id           uuid,
  p_claimant_contact    text,
  p_reason              text,
  p_claimant_relationship text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_claimant_max  constant int := 3;
  c_circle_max    constant int := 10;
  c_window        constant interval := interval '30 days';
  v_freeze        uuid;
  v_disposition   text;
  v_claim         uuid;
begin
  -- One claim decision at a time per circle: the disposition depends on
  -- what is already recorded, so serialise with the same per-circle lock
  -- discipline as hc.log() (released at commit).
  perform pg_advisory_xact_lock(hashtext('freeze:' || p_circle_id::text));

  if exists (select 1
             from public.freeze_claims fc
             join public.freezes f on f.id = fc.freeze_id
             where fc.circle_id = p_circle_id
               and fc.claimant_contact = p_claimant_contact
               and f.state = 'dismissed') then
    v_disposition := 'rate_limited';   -- adjudicated-unfounded prior claim
  elsif (select count(*) from public.freeze_claims fc
         where fc.circle_id = p_circle_id
           and fc.claimant_contact = p_claimant_contact
           and fc.received_at >= now() - c_window) >= c_claimant_max then
    v_disposition := 'rate_limited';
  elsif (select count(*) from public.freeze_claims fc
         where fc.circle_id = p_circle_id
           and fc.received_at >= now() - c_window) >= c_circle_max then
    v_disposition := 'rate_limited';
  else
    select f.id into v_freeze
    from public.freezes f
    where f.circle_id = p_circle_id and f.state = 'open';

    if v_freeze is null then
      insert into public.freezes (circle_id) values (p_circle_id)
        returning id into v_freeze;
      v_disposition := 'opened_freeze';
    else
      v_disposition := 'attached_to_existing';
    end if;
  end if;

  insert into public.freeze_claims
    (circle_id, freeze_id, claimant_contact, claimant_relationship,
     reason, disposition)
  values
    (p_circle_id,
     case when v_disposition = 'rate_limited' then null else v_freeze end,
     p_claimant_contact, p_claimant_relationship, p_reason, v_disposition)
  returning id into v_claim;

  perform hc.log(p_circle_id,
                 case when v_disposition = 'opened_freeze'
                      then 'freeze_requested' else 'freeze_claim_recorded' end,
                 'Freeze service',
                 p_detail => jsonb_build_object('disposition', v_disposition));

  return jsonb_build_object(
    'claim_id', v_claim,
    'freeze_id', case when v_disposition = 'rate_limited' then null else v_freeze end,
    'disposition', v_disposition);
end $$;

-- Adjudication: the sole path from 'open' to a finding. Constraint
-- violations (narrowing without a rationale, an outcome without metadata)
-- surface as 23514 — at this layer the constraints ARE the interface; §3.9
-- error normalisation belongs to the 1D admin_ops wrappers.
create function hc.adjudicate_freeze(
  p_freeze_id           uuid,
  p_outcome             text,
  p_adjudicated_by      text,
  p_outcome_note        text default null,
  p_subject_id          uuid default null,
  p_narrowing_rationale text default null,
  p_contact_attempted_at timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_circle uuid;
begin
  if p_outcome not in ('dismissed', 'upheld', 'unresolved') then
    raise exception 'freeze_not_adjudicable' using errcode = 'P0001';
  end if;

  update public.freezes f
     set state = p_outcome,
         subject_id = p_subject_id,
         narrowing_rationale = p_narrowing_rationale,
         adjudicated_at = now(),
         adjudicated_by = p_adjudicated_by,
         outcome_note = p_outcome_note,
         contact_attempted_at = coalesce(p_contact_attempted_at, f.contact_attempted_at)
   where f.id = p_freeze_id and f.state = 'open'
   returning f.circle_id into v_circle;

  -- Uniform result shape: a nonexistent freeze and an already-adjudicated
  -- one are indistinguishable to the caller (ADR-0003 finding 8 posture).
  if v_circle is null then
    raise exception 'freeze_not_adjudicable' using errcode = 'P0001';
  end if;

  perform hc.log(v_circle, 'freeze_adjudicated', 'Freeze adjudication',
                 p_subject_id => p_subject_id,
                 p_detail => jsonb_build_object('outcome', p_outcome));

  return jsonb_build_object('freeze_id', p_freeze_id, 'outcome', p_outcome);
end $$;

alter function hc.request_freeze(uuid, text, text, text) owner to hc_internal;
alter function hc.adjudicate_freeze(uuid, text, text, text, uuid, text, timestamptz)
  owner to hc_internal;

revoke execute on function hc.request_freeze(uuid, text, text, text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
revoke execute on function hc.adjudicate_freeze(uuid, text, text, text, uuid, text, timestamptz)
  from public, anon, authenticated, hc_pipeline, hc_admin;
