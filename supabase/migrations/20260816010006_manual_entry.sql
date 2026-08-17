-- ============================================================================
-- 1C · M6 — MNL-01: manual entry (ADR-0006 F9/Q12, the pinned model).
--
-- A manual entry is a SYNTHETIC arrival with an explicit 'manual' channel,
-- created WITH its proposal in ONE transaction by hc.create_manual_proposal.
-- proposals.arrival_id stays NOT NULL — §2.4's DDL is unchanged except the
-- channel CHECK, widened here with the machinery that needs it (annex A5).
--
-- The contradiction constraint lands WITH this machinery because only it
-- can create the state: (channel = 'manual') must equal the payload's
-- 'manual' flag on every proposal, both directions, enforced by a BEFORE
-- trigger (hc.assert_manual_flag) — so approve_proposal's provenance
-- branch (v_source null on manual) can never be steered by a lying flag.
--
-- Refusal shapes: proposal_invalid (input family: document kind — a
-- document IS its artifact, the upload path owns it; P5 caps via
-- draft_proposal), draft_refused (identity/authorization, ONE shape for
-- nonexistent and unauthorized, DEF-10), freeze_active (Q5 order — no
-- ingestion processing under a freeze, §3.8).
--
-- Authorization: manage on the DRAFTED union (own ∪ parents-at-draft),
-- evaluated under the R-rule lock — the same predicate approval will
-- re-run at write time. The draft is inserted first (caps validated by
-- hc.draft_proposal), then authorized; a refusal aborts the whole
-- transaction, which is what makes MNL-01's unity structural.
-- ============================================================================

alter table public.arrivals drop constraint arrivals_channel_check;
alter table public.arrivals add constraint arrivals_channel_check
  check (channel in ('upload', 'email', 'manual'));

-- ----------------------------------------------------------------------------
-- The contradiction constraint. SECURITY DEFINER: BEFORE triggers fire as
-- the inserting role, and deferred/authenticated paths must still read
-- arrivals (the 1B lesson — deferred triggers fire as the committing role).
-- ----------------------------------------------------------------------------
create function hc.assert_manual_flag() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare v_channel text;
begin
  select a.channel into v_channel from public.arrivals a where a.id = new.arrival_id;
  if (v_channel = 'manual') <> coalesce((new.payload ->> 'manual')::boolean, false) then
    raise exception 'manual_flag_mismatch' using errcode = 'P0001';
  end if;
  return new;
end $$;
alter function hc.assert_manual_flag() owner to hc_internal;
revoke execute on function hc.assert_manual_flag()
  from public, anon, authenticated, hc_pipeline, hc_admin;

create trigger hc_manual_flag_proposals
  before insert or update of payload, arrival_id on public.proposals
  for each row execute function hc.assert_manual_flag();

-- ----------------------------------------------------------------------------
-- The one manual path.
-- ----------------------------------------------------------------------------
create function hc.create_manual_proposal(
  p_circle_id uuid, p_subject_id uuid, p_kind hc.proposal_kind, p_payload jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_arrival uuid;
  v_proposal uuid;
  v_taint hc.domain[];
begin
  if v_actor is null then
    raise exception 'draft_refused' using errcode = 'P0001';
  end if;

  -- a manual document has no artifact to cite; every other kind drafts
  if p_kind not in ('task', 'timeline_event', 'profile_fact', 'episode') then
    raise exception 'proposal_invalid' using errcode = 'P0001';
  end if;

  -- identity: the subject must exist in the circle — one shape with
  -- unauthorized (DEF-10)
  if not exists (select 1 from public.subjects s
                 where s.id = p_subject_id and s.circle_id = p_circle_id) then
    raise exception 'draft_refused' using errcode = 'P0001';
  end if;

  -- R-rule: the per-circle lock before any predicate; freeze and
  -- authorization evaluate under the serialization point.
  perform pg_advisory_xact_lock(hashtext('taint:' || p_circle_id::text));

  -- Freeze first (Q5 order): no ingestion processing under a freeze (§3.8).
  if hc.circle_frozen(p_circle_id, p_subject_id) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- The synthetic arrival and its proposal, one transaction (MNL-01).
  -- proposals_ready: the entry waits for approval like any other draft;
  -- no worker stage ever owns it.
  insert into public.arrivals (circle_id, subject_id, channel, state)
  values (p_circle_id, p_subject_id, 'manual', 'proposals_ready')
  returning id into v_arrival;

  insert into public.arrival_events (arrival_id, circle_id, to_state, reason_code, attempt)
  values (v_arrival, p_circle_id, 'proposals_ready', 'manual_entry', 1);

  -- the machinery declares the flag; a caller cannot unset it
  v_proposal := hc.draft_proposal(v_arrival, p_circle_id, p_subject_id, p_kind,
                                  coalesce(p_payload, '{}'::jsonb)
                                    || jsonb_build_object('manual', true));

  -- Authorize on the DRAFTED union — the same predicate approval re-runs.
  -- A refusal aborts the transaction: arrival, event and draft all vanish.
  select p.taint into v_taint from public.proposals p where p.id = v_proposal;
  if hc.visible_at(hc.ctx(), p_subject_id, v_taint, true, null, null, null) < 'manage' then
    raise exception 'draft_refused' using errcode = 'P0001';
  end if;

  return jsonb_build_object('arrival_id', v_arrival, 'proposal_id', v_proposal);
end $$;

alter function hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)
  owner to hc_internal;
revoke execute on function hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.create_manual_proposal(uuid, uuid, hc.proposal_kind, jsonb)
  to authenticated;
