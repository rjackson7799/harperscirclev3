-- ============================================================================
-- 1B · M5 — provenance & taint machinery (TSD §2.6; ADR-0005 D3/D6/D7).
--
--   hc.taint_union()            pure array set-union (enum order)
--   hc.own_domain()             the D3 mapping, in one place
--   hc.link_provenance()        the ONLY edge writer: validate, cycle-check,
--                               insert, grow the child subtree by the delta
--   hc.propagate_taint_growth() delta-only growth; UNION walk, depth 32;
--                               marked-not-guessed at the cap;
--                               marked-and-committed on failure
--   hc.reclassify_taint()       the ONLY shrinking path: manage on every
--                               domain of the CURRENT taint, per-circle
--                               advisory lock, path-complete fixed point,
--                               row-scoped marker, audience_changed log
--   hc.sweep_provenance()       detector 3: dangling / cross-circle /
--                               cross-subject / cycles → marked
--
-- Lock discipline (D6, PLT-02): every growth and shrink path takes
-- pg_advisory_xact_lock(hashtext('taint:' || circle)) BEFORE any row lock,
-- so growth-vs-shrink serialize per circle; multi-table updates always
-- visit documents first, then the remaining record tables in a fixed
-- order, so two walkers cannot deadlock on opposite orders.
--
-- hc_internal gains UPDATE (+ the §3.7 *_internal_revise policies) on the
-- five record tables here — the walk is the first writer that needs it.
-- INSERT stays absent until M6 (hc.approve_proposal), so the record
-- remains unwritable-from-nothing at this boundary.
--
-- 1B endpoint scope: the five record types. 'arrival' / 'extraction' /
-- 'proposal' endpoints are 1C machinery and are refused, never
-- half-linked (provenance_endpoint_unsupported).
-- ============================================================================

insert into hc.log_event_types (code, description) values
  ('audience_changed', 'An object''s taint was reclassified; both audiences named');

alter table public.profile_facts add column domain hc.domain;
comment on column public.profile_facts.domain is
  'The payload-declared own domain (ADR-0005 D3, materialised so recomputation can read own_domain from the row). hc.approve_proposal() requires it at insert; hc.own_domain() refuses null.';

-- ----------------------------------------------------------------------------
-- Pure pieces.
-- ----------------------------------------------------------------------------
create function hc.taint_union(a hc.domain[], b hc.domain[])
returns hc.domain[] language sql immutable parallel safe
set search_path = ''
as $$
  select coalesce(
    (select array_agg(d order by d)
     from (select distinct d
           from unnest(coalesce(a, '{}'::hc.domain[]) || coalesce(b, '{}'::hc.domain[])) d) u),
    '{}'::hc.domain[]);
$$;

-- The D3 mapping, in one place. Interpretive rows (episode, timeline
-- 'admin', profile_fact payload-declared) are pointed round-6 questions;
-- an unresolvable own domain is refused, never guessed.
create function hc.own_domain(
  p_type hc.object_type, p_category hc.doc_category,
  p_kind hc.timeline_kind, p_declared hc.domain)
returns hc.domain language plpgsql immutable parallel safe
set search_path = ''
as $$
declare v hc.domain;
begin
  v := case p_type
    when 'document' then
      case p_category
        when 'medical' then 'health'::hc.domain when 'medications' then 'health'
        when 'labs' then 'health'
        when 'insurance' then 'finances' when 'financial' then 'finances'
        when 'legal' then 'documents' when 'other' then 'documents'
        else null
      end
    when 'task' then 'schedule'::hc.domain
    when 'timeline_event' then
      case p_kind
        when 'medical' then 'health'::hc.domain when 'care' then 'health'
        when 'admin' then 'schedule' when 'memory' then 'memories'
        else null
      end
    when 'episode' then 'memories'::hc.domain
    when 'profile_fact' then p_declared
    else null
  end;
  if v is null then
    raise exception 'own_domain_undeclared' using errcode = 'P0001';
  end if;
  return v;
end $$;

-- ----------------------------------------------------------------------------
-- Row resolution over the five record types (internal helper): circle,
-- subject, taint, resolved, own domain — null circle ⇒ not found.
-- ----------------------------------------------------------------------------
create function hc.resolve_object(p_type hc.object_type, p_id uuid)
returns table (circle_id uuid, subject_id uuid, taint hc.domain[],
               taint_resolved boolean, own hc.domain)
language plpgsql stable
set search_path = ''
as $$
begin
  if p_type = 'document' then
    return query select d.circle_id, d.subject_id, d.taint, d.taint_resolved,
      hc.own_domain('document', d.category, null, null)
      from public.documents d where d.id = p_id and d.deleted_at is null;
  elsif p_type = 'task' then
    return query select t.circle_id, t.subject_id, t.taint, t.taint_resolved,
      'schedule'::hc.domain
      from public.tasks t where t.id = p_id and t.deleted_at is null;
  elsif p_type = 'timeline_event' then
    return query select e.circle_id, e.subject_id, e.taint, e.taint_resolved,
      hc.own_domain('timeline_event', null, e.kind, null)
      from public.timeline_events e where e.id = p_id and e.deleted_at is null;
  elsif p_type = 'episode' then
    return query select ep.circle_id, ep.subject_id, ep.taint, ep.taint_resolved,
      'memories'::hc.domain
      from public.episodes ep where ep.id = p_id and ep.deleted_at is null;
  elsif p_type = 'profile_fact' then
    return query select pf.circle_id, pf.subject_id, pf.taint, pf.taint_resolved,
      hc.own_domain('profile_fact', null, null, pf.domain)
      from public.profile_facts pf where pf.id = p_id and pf.deleted_at is null;
  end if;
  -- unsupported types return no row; callers decide refusal shape
end $$;

-- ----------------------------------------------------------------------------
-- GROWTH. Propagate a known delta, never a recomputation from parent
-- values (§2.6 — the stale-grandchild trap). The walk INCLUDES the start
-- node (depth 0). Tables are updated documents-first in a fixed order.
-- ----------------------------------------------------------------------------
create function hc.propagate_taint_growth(
  p_type hc.object_type, p_id uuid, p_delta hc.domain[])
returns void language plpgsql security definer
set search_path = ''
as $$
declare
  c_depth constant int := 32;
  v_circle uuid;
begin
  if p_delta is null or cardinality(p_delta) = 0 then
    return;
  end if;

  select r.circle_id into v_circle from hc.resolve_object(p_type, p_id) r;
  if v_circle is null then
    raise exception 'provenance_endpoint_invalid' using errcode = 'P0001';
  end if;

  -- Serialize against reclassification (shrink) in this circle (D6).
  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  begin
    create temp table pg_temp.tw_down on commit drop as
    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union            -- UNION, not UNION ALL: a diamond must not re-walk
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    select object_type, object_id, min(depth) as depth from down
    group by object_type, object_id;

    -- documents FIRST, then the fixed order (PLT-02 lock discipline).
    update public.documents t set taint = hc.taint_union(t.taint, p_delta)
      from pg_temp.tw_down w
      where w.object_type = 'document' and w.object_id = t.id and w.depth < c_depth;
    update public.episodes t set taint = hc.taint_union(t.taint, p_delta)
      from pg_temp.tw_down w
      where w.object_type = 'episode' and w.object_id = t.id and w.depth < c_depth;
    update public.profile_facts t set taint = hc.taint_union(t.taint, p_delta)
      from pg_temp.tw_down w
      where w.object_type = 'profile_fact' and w.object_id = t.id and w.depth < c_depth;
    update public.tasks t set taint = hc.taint_union(t.taint, p_delta)
      from pg_temp.tw_down w
      where w.object_type = 'task' and w.object_id = t.id and w.depth < c_depth;
    update public.timeline_events t set taint = hc.taint_union(t.taint, p_delta)
      from pg_temp.tw_down w
      where w.object_type = 'timeline_event' and w.object_id = t.id and w.depth < c_depth;

    -- Anything still reachable AT the depth limit is a cycle or an
    -- over-deep graph: mark taint_resolved = false rather than guess.
    -- Fails closed by §3.3 clause 3 (AC-PERM-9).
    update public.documents t set taint_resolved = false
      from pg_temp.tw_down w
      where w.object_type = 'document' and w.object_id = t.id and w.depth = c_depth;
    update public.episodes t set taint_resolved = false
      from pg_temp.tw_down w
      where w.object_type = 'episode' and w.object_id = t.id and w.depth = c_depth;
    update public.profile_facts t set taint_resolved = false
      from pg_temp.tw_down w
      where w.object_type = 'profile_fact' and w.object_id = t.id and w.depth = c_depth;
    update public.tasks t set taint_resolved = false
      from pg_temp.tw_down w
      where w.object_type = 'task' and w.object_id = t.id and w.depth = c_depth;
    update public.timeline_events t set taint_resolved = false
      from pg_temp.tw_down w
      where w.object_type = 'timeline_event' and w.object_id = t.id and w.depth = c_depth;

    drop table pg_temp.tw_down;
  exception when others then
    -- §2.6 mechanism 1: any error in the walk marks the affected rows and
    -- RETURNS — aborting would leave the OLD, permissive taint in place.
    -- The implicit savepoint has already rolled back partial updates.
    begin
      -- best effort: mark the whole intended subtree, tolerating per-row
      -- failures (a row that cannot even be marked is the sweep's case)
      perform hc.mark_unresolved_subtree(p_type, p_id);
    exception when others then
      null;
    end;
    perform hc.mark_unresolved_one(p_type, p_id);
  end;
end $$;

-- Handler helpers, separated so their own failures stay contained.
create function hc.mark_unresolved_one(p_type hc.object_type, p_id uuid)
returns void language plpgsql 
set search_path = ''
as $$
begin
  if p_type = 'document' then
    update public.documents set taint_resolved = false where id = p_id;
  elsif p_type = 'task' then
    update public.tasks set taint_resolved = false where id = p_id;
  elsif p_type = 'timeline_event' then
    update public.timeline_events set taint_resolved = false where id = p_id;
  elsif p_type = 'episode' then
    update public.episodes set taint_resolved = false where id = p_id;
  elsif p_type = 'profile_fact' then
    update public.profile_facts set taint_resolved = false where id = p_id;
  end if;
exception when others then
  null;   -- marking is best-effort inside a handler; the sweep is the net
end $$;

create function hc.mark_unresolved_subtree(p_type hc.object_type, p_id uuid)
returns void language plpgsql 
set search_path = ''
as $$
declare r record;
begin
  for r in
    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < 32
    )
    select distinct object_type, object_id from down
  loop
    perform hc.mark_unresolved_one(r.object_type, r.object_id);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- The ONLY edge writer. Validation is §2.6's event row, verbatim; the
-- cycle check runs BEFORE the write (mechanism 2 — a DAG by construction).
-- ----------------------------------------------------------------------------
create function hc.link_provenance(
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

  select * into v_child  from hc.resolve_object(p_child_type, p_child_id);
  select * into v_parent from hc.resolve_object(p_parent_type, p_parent_id);

  -- Missing, cross-circle and cross-subject share ONE refusal shape — a
  -- distinguishable error would be an existence oracle (§3.12 posture).
  if v_child.circle_id is null or v_parent.circle_id is null
     or v_child.circle_id  <> v_parent.circle_id
     or v_child.subject_id <> v_parent.subject_id then
    raise exception 'provenance_endpoint_invalid' using errcode = 'P0001';
  end if;

  -- Serialize with growth/shrink in this circle before any row work (D6).
  perform pg_advisory_xact_lock(hashtext('taint:' || v_child.circle_id::text));

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

  -- Grow the child subtree by the parent's surplus — parents' stored taint
  -- is already transitive, so this single delta is the whole correction.
  v_delta := (select coalesce(array_agg(d), '{}'::hc.domain[])
              from unnest(v_parent.taint) d
              where not (array[d] <@ v_child.taint));
  if cardinality(v_delta) > 0 then
    perform hc.propagate_taint_growth(p_child_type, p_child_id, v_delta);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- SHRINK — the one path permitted to reduce a value (§2.6). Path-complete
-- to a fixed point: a descendant keeps every domain some remaining path
-- still supplies. The recompute reads CURRENT rows under the same
-- advisory lock growth takes, so no concurrent growth interleaves.
-- ----------------------------------------------------------------------------
create function hc.reclassify_taint(p_object_type hc.object_type, p_object_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  c_depth constant int := 32;
  v_obj record;
  v_ctx jsonb;
  v_before hc.domain[];
  v_after  hc.domain[];
  v_changed int;
  v_pass int := 0;
  r record;
  v_want hc.domain[];
  v_current hc.domain[];
begin
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);

  -- Nonexistent and unauthorized share ONE shape (DEF-10).
  if v_obj.circle_id is null then
    raise exception 'reclassify_refused' using errcode = 'P0001';
  end if;

  v_ctx := hc.ctx();
  if not (v_obj.taint <@ hc.dom(v_ctx -> 'subjects' -> v_obj.subject_id::text -> 'manage')) then
    raise exception 'reclassify_refused' using errcode = 'P0001';
  end if;

  v_before := v_obj.taint;
  perform pg_advisory_xact_lock(hashtext('taint:' || v_obj.circle_id::text));

  begin
    create temp table pg_temp.tw_aff on commit drop as
    with recursive down(object_type, object_id, depth) as (
        select p_object_type, p_object_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    select object_type, object_id, min(depth) as depth from down
    group by object_type, object_id;

    -- Fixed point over the affected set. Each pass recomputes every
    -- affected node as own_domain ∪ (current taint of its parents) —
    -- parents outside the set contribute their stored (unchanged) taint.
    loop
      v_pass := v_pass + 1;
      v_changed := 0;
      for r in
        select w.object_type, w.object_id
        from pg_temp.tw_aff w
        where w.depth < c_depth
        order by case w.object_type when 'document' then 0 when 'episode' then 1
                      when 'profile_fact' then 2 when 'task' then 3 else 4 end,
                 w.object_id
      loop
        select hc.taint_union(
                 array[o.own]::hc.domain[],
                 coalesce((select hc.taint_union_agg(p2.taint)
                           from public.provenance_edges e
                           join lateral hc.resolve_object(e.parent_type, e.parent_id) p2 on true
                           where e.child_type = r.object_type and e.child_id = r.object_id),
                          '{}'::hc.domain[])),
               o.taint
          into v_want, v_current
        from hc.resolve_object(r.object_type, r.object_id) o;

        if v_want is distinct from v_current then
          perform set_config('hc.reclassifying', r.object_id::text, true);
          perform hc.apply_taint(r.object_type, r.object_id, v_want, true);
          perform set_config('hc.reclassifying', '', true);
          v_changed := v_changed + 1;
        end if;
      end loop;
      exit when v_changed = 0 or v_pass >= c_depth;
    end loop;

    -- Frontier nodes (AT the cap): never guessed, marked.
    for r in select w.object_type, w.object_id from pg_temp.tw_aff w where w.depth = c_depth loop
      perform hc.mark_unresolved_one(r.object_type, r.object_id);
    end loop;

    drop table pg_temp.tw_aff;
  exception when others then
    perform set_config('hc.reclassifying', '', true);
    perform hc.mark_unresolved_one(p_object_type, p_object_id);
    return jsonb_build_object('object_id', p_object_id, 'completed', false);
  end;

  select r2.taint into v_after from hc.resolve_object(p_object_type, p_object_id) r2;
  perform hc.log(v_obj.circle_id, 'audience_changed', 'Reclassification',
                 p_subject_id => v_obj.subject_id,
                 p_object_type => p_object_type, p_object_id => p_object_id,
                 p_detail => jsonb_build_object(
                   'audience_before', to_jsonb(v_before),
                   'audience_after',  to_jsonb(v_after)));

  return jsonb_build_object('object_id', p_object_id, 'completed', true,
                            'taint_before', to_jsonb(v_before),
                            'taint_after',  to_jsonb(v_after));
end $$;

-- Aggregate union over many taints (used by the recompute).
create function hc.taint_union_2(a hc.domain[], b hc.domain[])
returns hc.domain[] language sql immutable parallel safe
set search_path = ''
as $$ select hc.taint_union(a, b) $$;
create aggregate hc.taint_union_agg (hc.domain[]) (
  sfunc = hc.taint_union_2,
  stype = hc.domain[],
  initcond = '{}'
);

-- Apply a recomputed taint (and restore resolved when the recompute is
-- complete) — one row, one type. Runs under the caller's row-scoped marker.
create function hc.apply_taint(p_type hc.object_type, p_id uuid,
                               p_taint hc.domain[], p_resolved boolean)
returns void language plpgsql 
set search_path = ''
as $$
begin
  if p_type = 'document' then
    update public.documents set taint = p_taint, taint_resolved = p_resolved where id = p_id;
  elsif p_type = 'task' then
    update public.tasks set taint = p_taint, taint_resolved = p_resolved where id = p_id;
  elsif p_type = 'timeline_event' then
    update public.timeline_events set taint = p_taint, taint_resolved = p_resolved where id = p_id;
  elsif p_type = 'episode' then
    update public.episodes set taint = p_taint, taint_resolved = p_resolved where id = p_id;
  elsif p_type = 'profile_fact' then
    update public.profile_facts set taint = p_taint, taint_resolved = p_resolved where id = p_id;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- Detector 3: the nightly sweep (invoked manually in 1B; scheduling is an
-- ops concern). Marks every child touching a defective edge. Findings are
-- a defect signal, not routine.
-- ----------------------------------------------------------------------------
create function hc.sweep_provenance()
returns int language plpgsql security definer
set search_path = ''
as $$
declare
  v_found int := 0;
  r record;
  v_child record;
  v_parent record;
  v_bad boolean;
begin
  for r in select e.circle_id, e.child_type, e.child_id, e.parent_type, e.parent_id
           from public.provenance_edges e
  loop
    v_bad := false;
    select * into v_child  from hc.resolve_object(r.child_type,  r.child_id);
    select * into v_parent from hc.resolve_object(r.parent_type, r.parent_id);
    if v_child.circle_id is null or v_parent.circle_id is null then
      v_bad := true;                                   -- dangling endpoint
    elsif v_child.circle_id <> v_parent.circle_id
       or v_child.circle_id <> r.circle_id then
      v_bad := true;                                   -- cross-circle
    elsif v_child.subject_id <> v_parent.subject_id then
      v_bad := true;                                   -- cross-subject
    elsif exists (
      with recursive down(object_type, object_id, depth) as (
          select r.child_type, r.child_id, 0
        union
          select e2.child_type, e2.child_id, d.depth + 1
          from public.provenance_edges e2
          join down d on d.object_type = e2.parent_type and d.object_id = e2.parent_id
          where d.depth < 32
      )
      select 1 from down
      where down.object_type = r.child_type and down.object_id = r.child_id
        and down.depth > 0
    ) then
      v_bad := true;                                   -- cycle through this child
    end if;

    if v_bad then
      v_found := v_found + 1;
      perform hc.mark_unresolved_one(r.child_type, r.child_id);
    end if;
  end loop;
  return v_found;
end $$;

-- ----------------------------------------------------------------------------
-- Ownership, ACLs. Owner-only in 1B (D6): the record-path callers are
-- hc.approve_proposal (M6) and later-slice surfaces; tests call as
-- postgres (the documented maintenance exemption).
-- ----------------------------------------------------------------------------
alter function hc.taint_union(hc.domain[], hc.domain[]) owner to hc_internal;
alter function hc.taint_union_2(hc.domain[], hc.domain[]) owner to hc_internal;
alter aggregate hc.taint_union_agg(hc.domain[]) owner to hc_internal;
alter function hc.own_domain(hc.object_type, hc.doc_category, hc.timeline_kind, hc.domain)
  owner to hc_internal;
alter function hc.resolve_object(hc.object_type, uuid) owner to hc_internal;
alter function hc.link_provenance(hc.object_type, uuid, hc.object_type, uuid)
  owner to hc_internal;
alter function hc.propagate_taint_growth(hc.object_type, uuid, hc.domain[])
  owner to hc_internal;
alter function hc.reclassify_taint(hc.object_type, uuid) owner to hc_internal;
alter function hc.mark_unresolved_one(hc.object_type, uuid) owner to hc_internal;
alter function hc.mark_unresolved_subtree(hc.object_type, uuid) owner to hc_internal;
alter function hc.apply_taint(hc.object_type, uuid, hc.domain[], boolean) owner to hc_internal;
alter function hc.sweep_provenance() owner to hc_internal;

revoke execute on function hc.taint_union_agg(hc.domain[])
  from public, anon, authenticated, hc_pipeline, hc_admin;
revoke execute on function
  hc.taint_union(hc.domain[], hc.domain[]),
  hc.taint_union_2(hc.domain[], hc.domain[]),
  hc.own_domain(hc.object_type, hc.doc_category, hc.timeline_kind, hc.domain),
  hc.resolve_object(hc.object_type, uuid),
  hc.link_provenance(hc.object_type, uuid, hc.object_type, uuid),
  hc.propagate_taint_growth(hc.object_type, uuid, hc.domain[]),
  hc.reclassify_taint(hc.object_type, uuid),
  hc.mark_unresolved_one(hc.object_type, uuid),
  hc.mark_unresolved_subtree(hc.object_type, uuid),
  hc.apply_taint(hc.object_type, uuid, hc.domain[], boolean),
  hc.sweep_provenance()
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- The walk is the first hc_internal writer of record rows: UPDATE + the
-- §3.7 *_internal_revise policies land here. INSERT waits for M6.
-- ----------------------------------------------------------------------------
grant update on public.documents, public.tasks, public.timeline_events,
                public.profile_facts, public.episodes
  to hc_internal;

create policy documents_internal_revise on public.documents
  for update to hc_internal using (true) with check (true);
create policy tasks_internal_revise on public.tasks
  for update to hc_internal using (true) with check (true);
create policy timeline_events_internal_revise on public.timeline_events
  for update to hc_internal using (true) with check (true);
create policy profile_facts_internal_revise on public.profile_facts
  for update to hc_internal using (true) with check (true);
create policy episodes_internal_revise on public.episodes
  for update to hc_internal using (true) with check (true);
