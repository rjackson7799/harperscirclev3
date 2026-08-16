-- ============================================================================
-- 1B · M11 — db:verify (plpgsql_check) cannot validate runtime-created
-- temp tables (42P01 on pg_temp.tw_down / tw_aff), and 1A's precedent is
-- to FIX lint findings, not disposition them (d091080). The walk state
-- moves into per-statement recursive CTEs: no temp tables, no TEMP
-- privilege dependency, identical semantics. Behaviour is pinned by 012
-- (grandchild, diamond, depth cap, marked-and-committed, path-complete,
-- second-path retention), 017 (the twenty-pair matrix) and concurrency
-- case 3 — all green before and after this rewrite.
--
-- Eleventh migration: one over the plan's 10-migration guideline, both
-- extras being verification-driven fixes (M10 concurrency, M11 lint).
-- Recorded as a pointed round-6 question rather than silently absorbed.
-- ============================================================================

create or replace function hc.propagate_taint_growth(
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
    -- documents FIRST, then the fixed order (PLT-02 lock discipline).
    -- Each statement re-walks the (edge-stable, lock-held) graph; UNION,
    -- not UNION ALL, so a diamond does not re-walk.
    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.documents t set taint = hc.taint_union(t.taint, p_delta)
      from (select object_id from down where object_type = 'document'
            group by object_id having min(depth) < c_depth) w
      where w.object_id = t.id;

    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.episodes t set taint = hc.taint_union(t.taint, p_delta)
      from (select object_id from down where object_type = 'episode'
            group by object_id having min(depth) < c_depth) w
      where w.object_id = t.id;

    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.profile_facts t set taint = hc.taint_union(t.taint, p_delta)
      from (select object_id from down where object_type = 'profile_fact'
            group by object_id having min(depth) < c_depth) w
      where w.object_id = t.id;

    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.tasks t set taint = hc.taint_union(t.taint, p_delta)
      from (select object_id from down where object_type = 'task'
            group by object_id having min(depth) < c_depth) w
      where w.object_id = t.id;

    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.timeline_events t set taint = hc.taint_union(t.taint, p_delta)
      from (select object_id from down where object_type = 'timeline_event'
            group by object_id having min(depth) < c_depth) w
      where w.object_id = t.id;

    -- Anything still reachable AT the depth limit: marked, never guessed
    -- (AC-PERM-9 via §3.3 clause 3). One statement per type, same walk.
    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.documents t set taint_resolved = false
      from (select object_id from down where object_type = 'document'
            group by object_id having min(depth) = c_depth) w
      where w.object_id = t.id;

    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.episodes t set taint_resolved = false
      from (select object_id from down where object_type = 'episode'
            group by object_id having min(depth) = c_depth) w
      where w.object_id = t.id;

    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.profile_facts t set taint_resolved = false
      from (select object_id from down where object_type = 'profile_fact'
            group by object_id having min(depth) = c_depth) w
      where w.object_id = t.id;

    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.tasks t set taint_resolved = false
      from (select object_id from down where object_type = 'task'
            group by object_id having min(depth) = c_depth) w
      where w.object_id = t.id;

    with recursive down(object_type, object_id, depth) as (
        select p_type, p_id, 0
      union
        select e.child_type, e.child_id, d.depth + 1
        from public.provenance_edges e
        join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
        where d.depth < c_depth
    )
    update public.timeline_events t set taint_resolved = false
      from (select object_id from down where object_type = 'timeline_event'
            group by object_id having min(depth) = c_depth) w
      where w.object_id = t.id;
  exception when others then
    -- §2.6 mechanism 1: mark and RETURN — aborting would leave the OLD,
    -- permissive taint. The savepoint already unwound partial updates.
    begin
      perform hc.mark_unresolved_subtree(p_type, p_id);
    exception when others then
      null;
    end;
    perform hc.mark_unresolved_one(p_type, p_id);
  end;
end $$;

create or replace function hc.reclassify_taint(p_object_type hc.object_type, p_object_id uuid)
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
    -- Fixed point over the affected set. The edge graph is stable under
    -- the advisory lock, so re-walking it each pass is the same set.
    loop
      v_pass := v_pass + 1;
      v_changed := 0;
      for r in
        with recursive down(object_type, object_id, depth) as (
            select p_object_type, p_object_id, 0
          union
            select e.child_type, e.child_id, d.depth + 1
            from public.provenance_edges e
            join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
            where d.depth < c_depth
        )
        select object_type, object_id from down
        group by object_type, object_id
        having min(depth) < c_depth
        order by case object_type when 'document' then 0 when 'episode' then 1
                      when 'profile_fact' then 2 when 'task' then 3 else 4 end,
                 object_id
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
    for r in
      with recursive down(object_type, object_id, depth) as (
          select p_object_type, p_object_id, 0
        union
          select e.child_type, e.child_id, d.depth + 1
          from public.provenance_edges e
          join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
          where d.depth < c_depth
      )
      select object_type, object_id from down
      group by object_type, object_id
      having min(depth) = c_depth
    loop
      perform hc.mark_unresolved_one(r.object_type, r.object_id);
    end loop;
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

-- plpgsql_check: typed initializer for the parents' taint accumulator
-- (text '{}' → hc.domain[] cast warning in hc.approve_proposal). The
-- unused p_step_up_token is DELIBERATE — §3.7's signature verbatim;
-- step-up binding is §5.7's obligation in the auth slice (dispositioned
-- in the round-6 packet).
create or replace function hc.approve_proposal(
  p_proposal_id uuid, p_expected_version int, p_idempotency_key text,
  p_edits jsonb default null, p_step_up_token text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor    uuid := hc.uid();
  v_actor_name text;
  v_prop     record;
  v_existing record;
  v_ctx      jsonb;
  v_payload  jsonb;
  v_parents  jsonb;
  v_parent   jsonb;
  v_ptaint   hc.domain[] := '{}'::hc.domain[];
  v_pr       record;
  v_own      hc.domain;
  v_taint    hc.domain[];
  v_obj_type hc.object_type;
  v_obj_id   uuid := gen_random_uuid();
  v_source   uuid;
  v_old_pf   uuid;
  v_status   text;
  v_result   jsonb;
begin
  if v_actor is null then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 1 · Idempotency: claim the key. A replay returns the stored result —
  -- including the AC-INBOX-12 hard case, because an attempt that failed
  -- before commit left no row behind.
  begin
    insert into public.approval_attempts (idempotency_key, proposal_id, expected_version, actor_id)
    values (p_idempotency_key, p_proposal_id, p_expected_version, v_actor);
  exception
    when unique_violation then
      select * into v_existing from public.approval_attempts
        where idempotency_key = p_idempotency_key;
      if v_existing.proposal_id = p_proposal_id and v_existing.result is not null then
        return v_existing.result;
      end if;
      raise exception 'approval_refused' using errcode = 'P0001';
    when foreign_key_violation then
      -- a nonexistent proposal fails the attempt row's FK: same shape as
      -- unauthorized, no existence oracle
      raise exception 'approval_refused' using errcode = 'P0001';
  end;

  -- Lock the proposal row; the proposal_commits PK is the cross-session
  -- serialiser, this is the in-flight one.
  select * into v_prop from public.proposals p
    where p.id = p_proposal_id
    for update;
  if v_prop.id is null or v_prop.status <> 'pending' then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 4 · (ordered first — see header) Refuse under ANY freeze covering the
  -- circle or subject: open is whole-circle by constraint; unresolved
  -- covers its named subject or the whole circle (FRZ-14).
  if exists (select 1 from public.freezes f
             where f.circle_id = v_prop.circle_id
               and (f.state = 'open'
                    or (f.state = 'unresolved'
                        and (f.subject_id is null or f.subject_id = v_prop.subject_id)))) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- Serialize with taint growth/shrink in this circle (D6) before any
  -- record-row locks.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_prop.circle_id::text));

  -- Apply edits (edited_approved) before anything reads the payload.
  v_payload := v_prop.payload || coalesce(p_edits -> 'fields', '{}'::jsonb);
  v_status  := case when p_edits ? 'fields' then 'edited_approved' else 'approved' end;

  v_obj_type := case v_prop.kind::text
    when 'document' then 'document'::hc.object_type
    when 'task' then 'task'
    when 'timeline_event' then 'timeline_event'
    when 'profile_fact' then 'profile_fact'
    when 'episode' then 'episode'
    else null
  end;
  if v_obj_type is null then
    -- conflict / episode-grouping proposal kinds are 1C machinery
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 2 · Re-check authorization AT WRITE TIME on the D7 union: own domain ∪
  -- drafted taint ∪ parents' CURRENT taints. A grant lowered while the
  -- review screen sat open cannot be approved against — and neither can a
  -- parent whose taint grew after drafting.
  v_parents := coalesce(v_payload -> 'parents', '[]'::jsonb);
  for v_parent in select * from jsonb_array_elements(v_parents) loop
    select * into v_pr from hc.resolve_object(
      (v_parent ->> 'type')::hc.object_type, (v_parent ->> 'id')::uuid);
    if v_pr.circle_id is null or v_pr.circle_id <> v_prop.circle_id
       or v_pr.subject_id <> v_prop.subject_id then
      raise exception 'approval_refused' using errcode = 'P0001';
    end if;
    v_ptaint := hc.taint_union(v_ptaint, v_pr.taint);
  end loop;

  v_own := hc.own_domain(v_obj_type,
                         (v_payload ->> 'category')::hc.doc_category,
                         (v_payload ->> 'kind')::hc.timeline_kind,
                         (v_payload ->> 'domain')::hc.domain);
  v_taint := hc.taint_union(array[v_own]::hc.domain[],
                            hc.taint_union(v_prop.taint, v_ptaint));

  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_prop.subject_id, v_taint, v_prop.taint_resolved,
                   null, null, null) < 'manage' then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 3 · Nobody approves something other than what they read.
  if v_prop.version <> p_expected_version then
    raise exception 'proposal_version_changed' using errcode = 'P0001';
  end if;

  -- 5 · A high-risk value requires explicit confirmation (PRD §6.4).
  if v_payload ->> 'risk_class' = 'high'
     and coalesce((p_edits -> 'confirm_high')::boolean, false) is not true then
    raise exception 'high_risk_unconfirmed' using errcode = 'P0001';
  end if;

  -- 6 · Claim FIRST (the PK serialises concurrent approvals; the unique
  -- (object_type, object_id) forbids two proposals backing one row), then
  -- write the object WITH its provenance block — or write nothing.
  insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id)
  values (p_proposal_id, v_prop.circle_id, v_obj_type, v_obj_id);

  v_source := case when coalesce((v_payload ->> 'manual')::boolean, false)
                   then null else v_prop.arrival_id end;

  if v_obj_type = 'document' then
    insert into public.documents
      (id, circle_id, subject_id, title, category, summary_text,
       artifact_arrival_id, filed_at, source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id,
       v_payload ->> 'title', (v_payload ->> 'category')::hc.doc_category,
       v_payload ->> 'summary_text',
       v_prop.arrival_id,
       coalesce((v_payload ->> 'filed_at')::timestamptz, now()),
       v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
  elsif v_obj_type = 'task' then
    insert into public.tasks
      (id, circle_id, subject_id, title, detail, due_on, due_zone,
       source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id,
       v_payload ->> 'title', v_payload ->> 'detail',
       (v_payload ->> 'due_on')::date, v_payload ->> 'due_zone',
       v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
  elsif v_obj_type = 'timeline_event' then
    insert into public.timeline_events
      (id, circle_id, subject_id, kind, summary, episode_id,
       occurred_on, occurred_zone, local_at, iana_zone, instant, is_floating,
       source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id,
       (v_payload ->> 'kind')::hc.timeline_kind, v_payload ->> 'summary',
       (v_payload ->> 'episode_id')::uuid,
       (v_payload ->> 'occurred_on')::date, v_payload ->> 'occurred_zone',
       (v_payload ->> 'local_at')::timestamp, v_payload ->> 'iana_zone',
       (v_payload ->> 'instant')::timestamptz,
       coalesce((v_payload ->> 'is_floating')::boolean, false),
       v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
  elsif v_obj_type = 'episode' then
    insert into public.episodes
      (id, circle_id, subject_id, title, source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id, v_payload ->> 'title',
       v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
  elsif v_obj_type = 'profile_fact' then
    -- Supersession IS the write path (§2.5): the old current row is marked
    -- in the same transaction, retained, and named by the new row.
    select pf.id into v_old_pf from public.profile_facts pf
      where pf.subject_id = v_prop.subject_id
        and pf.field = v_payload ->> 'field'
        and pf.superseded_at is null
      for update;
    -- The old row leaves the partial unique BEFORE the new row enters it;
    -- superseded_by_id is backfilled once the new id exists (its composite
    -- FK cannot point at a row that is not yet written).
    if v_old_pf is not null then
      update public.profile_facts set superseded_at = now() where id = v_old_pf;
    end if;
    insert into public.profile_facts
      (id, circle_id, subject_id, field, value, risk_class, domain,
       supersedes_id, source_arrival_id, source_proposal_id,
       approved_by, approved_at, approver_display_name, taint, taint_resolved)
    values
      (v_obj_id, v_prop.circle_id, v_prop.subject_id,
       v_payload ->> 'field', v_payload -> 'value',
       (v_payload ->> 'risk_class')::hc.risk_class,
       (v_payload ->> 'domain')::hc.domain,
       v_old_pf, v_source, p_proposal_id,
       v_actor, now(), v_actor_name, v_taint, v_prop.taint_resolved);
    if v_old_pf is not null then
      update public.profile_facts
        set superseded_by_id = v_obj_id
        where id = v_old_pf;
    end if;
  end if;

  -- provenance edges to the payload parents; the child already carries
  -- their union, so the growth delta inside link_provenance is empty.
  for v_parent in select * from jsonb_array_elements(v_parents) loop
    perform hc.link_provenance(v_obj_type, v_obj_id,
      (v_parent ->> 'type')::hc.object_type, (v_parent ->> 'id')::uuid);
  end loop;

  update public.proposals
    set status = v_status, decided_by = v_actor, decided_at = now()
    where id = p_proposal_id;

  perform hc.log(v_prop.circle_id, 'object_approved', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_prop.subject_id,
                 p_object_type => v_obj_type, p_object_id => v_obj_id,
                 p_detail => jsonb_build_object('proposal_id', p_proposal_id,
                                                'status', v_status));

  -- 7 · Record the result against the idempotency key.
  v_result := jsonb_build_object(
    'proposal_id', p_proposal_id, 'object_type', v_obj_type,
    'object_id', v_obj_id, 'status', v_status);
  update public.approval_attempts
    set result = v_result, committed_at = now()
    where idempotency_key = p_idempotency_key;

  return v_result;
end $$;

