-- ============================================================================
-- 1B · M10 — two defects found by the test:concurrency layer (U10 red),
-- fixed at the mechanism, not the symptom. 1A precedent: review findings
-- land as their own migration (210001_round5_fixes).
--
-- 1 · hc.assert_claimed() becomes SECURITY DEFINER. A deferred constraint
--     trigger runs at COMMIT with the committing session's role; an
--     authenticated approval therefore died reading proposal_commits
--     (42501). pgTAP never fired it — every test file rolls back — which
--     is exactly why the two-session layer exists. The claim check now
--     reads as hc_internal regardless of who commits.
--
-- 2 · hc.link_provenance() takes the per-circle advisory lock BEFORE
--     reading endpoint taints. The old order captured the parent's taint,
--     then blocked on the lock behind a reclassify, then applied the
--     STALE pre-shrink delta — the precise growth-vs-shrink interleaving
--     the §2.6 lock exists to prevent. Circle discovery still precedes
--     the lock (the lock is keyed on it); everything the delta depends on
--     is re-read under the lock.
-- ============================================================================

alter function hc.assert_claimed() security definer;

create or replace function hc.link_provenance(
  p_child_type hc.object_type, p_child_id uuid,
  p_parent_type hc.object_type, p_parent_id uuid)
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  c_record_types constant hc.object_type[] :=
    array['document','task','timeline_event','profile_fact','episode']::hc.object_type[];
  v_child  record;
  v_parent record;
  v_delta  hc.domain[];
begin
  if not (p_child_type = any (c_record_types))
  or not (p_parent_type = any (c_record_types)) then
    raise exception 'provenance_endpoint_unsupported' using errcode = 'P0001';
  end if;

  -- Circle discovery only — the lock is keyed on it.
  select * into v_child from hc.resolve_object(p_child_type, p_child_id);
  if v_child.circle_id is null then
    raise exception 'provenance_endpoint_invalid' using errcode = 'P0001';
  end if;

  -- Serialize with growth/shrink in this circle BEFORE reading anything
  -- the delta depends on (D6; the U10 case3 interleaving).
  perform pg_advisory_xact_lock(hashtext('taint:' || v_child.circle_id::text));

  -- Re-read BOTH endpoints under the lock.
  select * into v_child  from hc.resolve_object(p_child_type, p_child_id);
  select * into v_parent from hc.resolve_object(p_parent_type, p_parent_id);

  -- Missing, cross-circle and cross-subject share ONE refusal shape.
  if v_child.circle_id is null or v_parent.circle_id is null
     or v_child.circle_id  <> v_parent.circle_id
     or v_child.subject_id <> v_parent.subject_id then
    raise exception 'provenance_endpoint_invalid' using errcode = 'P0001';
  end if;

  -- Cycle check: the proposed parent must not be a descendant of the child.
  if exists (
    with recursive down(object_type, object_id, depth) as (
        select p_child_type, p_child_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < 32
    )
    select 1 from down
    where down.object_type = p_parent_type and down.object_id = p_parent_id
  ) then
    raise exception 'provenance_cycle' using errcode = 'P0001';
  end if;

  insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
  values (v_child.circle_id, p_child_type, p_child_id, p_parent_type, p_parent_id);

  v_delta := (select coalesce(array_agg(d), '{}'::hc.domain[])
              from unnest(v_parent.taint) d
              where not (array[d] <@ v_child.taint));
  if cardinality(v_delta) > 0 then
    perform hc.propagate_taint_growth(p_child_type, p_child_id, v_delta);
  end if;
end $$;
