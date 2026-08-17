-- ============================================================================
-- 1C · M7 — ING-02/ING-03: the §3.4 read policies for the pipeline surface.
--
-- Level→table map (§3.4): SUMMARY reaches the arrival row; VIEW reaches
-- extractions and arrival.auth_detail; proposals read at MANAGE over the
-- proposal's own taint (ADR-0007 — the map does not list proposals; the
-- approval audience is the fail-closed choice, and A.4's conflict oracle
-- bound follows from the drafted union).
--
-- Pipeline material is unclassified until approved into the record:
-- arrivals and extractions evaluate hc.visible_at over hc.all_domains()
-- (fail-closed; an arrival can be an invoice or a discharge summary and
-- the policy cannot know which yet). An object share on one arrival can
-- widen exactly that arrival to view, as everywhere else.
--
-- RLS cannot vary by column; auth_detail (and the internal fence column
-- current_lease_id) stay OUT of the authenticated column grant — so
-- `select *` refuses for every member, and clients name their columns.
-- auth_detail is served at view by hc.arrival_auth_detail (DEF-10 shape).
--
-- Policy shape is the §3.4 two-clause form: an indexed ctx pre-filter,
-- then the visibility test — two textual ctx references, two InitPlans,
-- zero SubPlans (PRF-01 discipline, asserted in 025).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- arrivals: SUMMARY, minus the view-gated column and the pipeline fence.
-- ----------------------------------------------------------------------------
grant select (id, circle_id, subject_id, parent_arrival_id, channel, state,
              received_at, storage_key, content_sha256, mime_declared,
              mime_detected, byte_size, page_count, sender_address,
              sender_display_name, message_id, auth_result, scan_verdict,
              scan_at, cancelled_by, cancelled_at, ingest_idempotency_key,
              deleted_at, purge_at, expires_at)
  on public.arrivals to authenticated;

create policy arrivals_select on public.arrivals
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)   -- indexed pre-filter
  and deleted_at is null
  and hc.visible_at((select hc.ctx()), subject_id, hc.all_domains(), true,
                    'arrival', id, null) >= 'summary'
);

-- ----------------------------------------------------------------------------
-- extractions: VIEW (the A.1 paired half — nothing at summary).
-- ----------------------------------------------------------------------------
grant select on public.extractions to authenticated;

create policy extractions_select on public.extractions
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and hc.visible_at((select hc.ctx()), subject_id, hc.all_domains(), true,
                    'extraction', id, null) >= 'view'
);

-- ----------------------------------------------------------------------------
-- proposals: MANAGE over the proposal's own drafted taint.
-- ----------------------------------------------------------------------------
grant select on public.proposals to authenticated;

create policy proposals_select on public.proposals
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and hc.visible_at((select hc.ctx()), subject_id, taint, taint_resolved,
                    'proposal', id, null) >= 'manage'
);

-- ----------------------------------------------------------------------------
-- auth_detail at view: one accessor, one shape (DEF-10).
-- ----------------------------------------------------------------------------
create function hc.arrival_auth_detail(p_arrival uuid)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare v_subject uuid; v_detail jsonb;
begin
  select a.subject_id, a.auth_detail into v_subject, v_detail
    from public.arrivals a where a.id = p_arrival and a.deleted_at is null;
  if v_subject is null
     or hc.visible_at(hc.ctx(), v_subject, hc.all_domains(), true,
                      'arrival', p_arrival, null) < 'view' then
    raise exception 'arrival_refused' using errcode = 'P0001';
  end if;
  return v_detail;
end $$;

alter function hc.arrival_auth_detail(uuid) owner to hc_internal;
revoke execute on function hc.arrival_auth_detail(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.arrival_auth_detail(uuid) to authenticated;
