-- ============================================================================
-- 1B · M4 — hc.guard_row() (TSD §3.7): provenance immutability, taint
-- monotonicity, and the row-scoped reclassify marker, as ONE generic
-- BEFORE UPDATE trigger on the five record tables and proposals.
--
-- Generic via to_jsonb(old/new) (ADR-0005 D4): §3.7 attaches the guard to
-- proposals, which has taint but not the provenance quartet — a
-- column-literal body would raise "record has no field" at runtime there.
-- The jsonb form guards exactly the columns present, so one function holds
-- §3.7's semantics verbatim on every table it binds.
--
-- The marker is NOT itself the control (§3.7): no request-path role holds
-- UPDATE on any guarded table; the guard binds the roles that do — up to
-- and including the maintenance superuser path tests use.
-- ============================================================================

create function hc.guard_row() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
  v_marker text := coalesce(current_setting('hc.reclassifying', true), '');
begin
  -- N2: the original approver is never overwritten by a subsequent editor.
  if o ? 'approved_by' then
    if n ->> 'approved_by'            is distinct from o ->> 'approved_by'
    or n ->> 'approved_at'            is distinct from o ->> 'approved_at'
    or n ->> 'approver_display_name'  is distinct from o ->> 'approver_display_name'
    or n ->> 'source_arrival_id'      is distinct from o ->> 'source_arrival_id' then
      raise exception 'provenance is immutable (PRD §1.2)' using errcode = '42501';
    end if;
  end if;

  -- PRD §7.6: taint never shrinks by itself. jsonb array containment is
  -- set containment, so growth and reordering pass; any loss is refused
  -- unless THIS row's id is the transaction-local reclassify marker.
  if (o ? 'taint')
     and not ((n -> 'taint') @> (o -> 'taint'))
     and v_marker <> (n ->> 'id') then
    raise exception 'taint may not shrink outside hc.reclassify_taint() (PRD §7.6)'
      using errcode = '42501';
  end if;

  -- Fail-closed may not be cleared except by a completed recomputation,
  -- which sets the same marker. false→true is the dangerous direction.
  if (o ? 'taint_resolved')
     and (o ->> 'taint_resolved')::boolean is false
     and (n ->> 'taint_resolved')::boolean is true
     and v_marker <> (n ->> 'id') then
    raise exception 'taint_resolved may only be restored by validated recomputation'
      using errcode = '42501';
  end if;

  return new;
end $$;

alter function hc.guard_row() owner to hc_internal;
revoke execute on function hc.guard_row()
  from public, anon, authenticated, hc_pipeline, hc_admin;

create trigger hc_guard_documents before update on public.documents
  for each row execute function hc.guard_row();
create trigger hc_guard_tasks before update on public.tasks
  for each row execute function hc.guard_row();
create trigger hc_guard_timeline_events before update on public.timeline_events
  for each row execute function hc.guard_row();
create trigger hc_guard_profile_facts before update on public.profile_facts
  for each row execute function hc.guard_row();
create trigger hc_guard_episodes before update on public.episodes
  for each row execute function hc.guard_row();
create trigger hc_guard_proposals before update on public.proposals
  for each row execute function hc.guard_row();
