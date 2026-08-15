-- ============================================================================
-- 1A · M8 — hc.request_freeze() and hc.adjudicate_freeze(): the ONLY paths
-- that mutate the freeze tables (TSD §2.3, §3.8; ADR-0001 as amended).
--
-- RED STATE (deliberate): hc.request_freeze() below inserts an enforcement
-- row directly with NO intake ledger and NO rate limits — the exact
-- pre-ADR-0003 shape. The 007 suite must show finding 1 live: a second
-- claimant's report bounces off freezes_one_open_per_circle as a 23505
-- with no auditable record, which is precisely the lost corroborating
-- allegation the ledger exists to keep.
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

create function hc.request_freeze(
  p_circle_id           uuid,
  p_claimant_contact    text,
  p_reason              text,
  p_claimant_relationship text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_freeze uuid;
begin
  insert into public.freezes (circle_id) values (p_circle_id)
    returning id into v_freeze;
  perform hc.log(p_circle_id, 'freeze_requested', 'Freeze service');
  return jsonb_build_object('freeze_id', v_freeze,
                            'disposition', 'opened_freeze');
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
