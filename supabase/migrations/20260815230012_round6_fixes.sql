-- ============================================================================
-- 1B · M12 — round-6 dispositioned findings (ADR-0006), fixed at the
-- mechanism. 1A precedent: review findings land as their own migration
-- (210001_round5_fixes; M10 for U10's).
--
-- THE SERIALIZATION RULE (ADR-0006 R-rule, amending TSD §2.6/§3.7):
-- every record writer (approve, revise), the taint machinery (link,
-- propagate, reclassify — already there) and every freeze writer
-- (request_freeze, adjudicate_freeze) take
-- pg_advisory_xact_lock(hashtext('taint:' || circle)) — and every
-- authorization or freeze predicate evaluates UNDER that lock, against
-- the row versions the write will touch. Consequences:
--   · a security-state transition (freeze, grant change, membership
--     removal) that commits before a writer's predicate evaluation
--     ALWAYS defeats the writer — including one that commits while the
--     writer waits on the lock;
--   · a transition that commits after the writer's predicates binds at
--     the next evaluation (RLS-08's next-query contract, generalised);
--     the in-flight, snapshot-authorized write completes — the outcome
--     is the serial history write-then-transition;
--   · no writer may observe two versions of its object in one
--     transaction (the revise defect, concurrency case 8).
-- hc.share_object() stays a single-snapshot writer by design: a share
-- grants at most view, is inert under any freeze (the visible_at cap and
-- frozen flag bind at the grantee's next evaluation), and its granter
-- authorization binds at its own statement — recorded exception, ADR-0006.
-- Advisory lock order stays acyclic: freeze: → taint: → hc.log's
-- unprefixed per-circle key; nothing acquires them in another order.
--
-- hc.approve_proposal() additionally:
--   F6  refuses a non-null p_step_up_token — nothing here can validate
--       one yet (§5.7 is the auth slice's); accepted-and-ignored would
--       teach clients that token submission is validated authentication.
--       Signature stays §3.7-verbatim; db:verify's dispositioned
--       unused-parameter warning retires.
--   AB1 binds idempotency replay to the claiming actor.
--   AB2 bounds the idempotency key (length 1..200) before any write.
--   AB3 collapses duplicate payload parents (no raw 23505 escapes).
--   Q4  (D7 amended) refuses when the parents' CURRENT union exceeds
--       own ∪ drafted: proposal_taint_changed, re-render. Nobody
--       approves an audience they did not read. The union computation
--       stays as the fail-closed backstop underneath.
--   FRZ-14's named signature now survives the freeze race: the freeze
--       check runs UNDER the lock (the write never escaped — ctx already
--       evaluated post-lock — but the race swallowed freeze_active into
--       approval_refused; concurrency case 5 red).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The one writer, hardened. Body from M11; deltas marked ROUND-6.
-- ----------------------------------------------------------------------------
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

  -- ROUND-6 F6: a step-up token nothing can validate yet is refused,
  -- never accepted-and-ignored. §5.7's real binding replaces this guard.
  if p_step_up_token is not null then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- ROUND-6 AB2: key bounds before any row is written.
  if p_idempotency_key is null
     or length(p_idempotency_key) not between 1 and 200 then
    raise exception 'approval_refused' using errcode = 'P0001';
  end if;

  -- 1 · Idempotency: claim the key. A replay returns the stored result —
  -- including the AC-INBOX-12 hard case, because an attempt that failed
  -- before commit left no row behind. ROUND-6 AB1: the replay is bound to
  -- the actor who claimed the key.
  begin
    insert into public.approval_attempts (idempotency_key, proposal_id, expected_version, actor_id)
    values (p_idempotency_key, p_proposal_id, p_expected_version, v_actor);
  exception
    when unique_violation then
      select * into v_existing from public.approval_attempts
        where idempotency_key = p_idempotency_key;
      if v_existing.proposal_id = p_proposal_id
         and v_existing.actor_id = v_actor
         and v_existing.result is not null then
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

  -- Serialize with taint growth/shrink and freeze transitions in this
  -- circle (D6, R-rule) BEFORE any predicate binds. The proposal row lock
  -- above is not part of the taint discipline: advisory holders never
  -- wait on proposal rows, so the order cannot cycle.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_prop.circle_id::text));

  -- 4 · (ordered first — see M6 header) Refuse under ANY freeze covering
  -- the circle or subject: open is whole-circle by constraint; unresolved
  -- covers its named subject or the whole circle (FRZ-14). ROUND-6: this
  -- check now runs UNDER the lock, so a freeze that commits while the
  -- approval waits keeps its NAMED signature instead of falling through
  -- to the generic post-lock authorization refusal (concurrency case 5).
  if exists (select 1 from public.freezes f
             where f.circle_id = v_prop.circle_id
               and (f.state = 'open'
                    or (f.state = 'unresolved'
                        and (f.subject_id is null or f.subject_id = v_prop.subject_id)))) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

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
  -- review screen sat open cannot be approved against. ROUND-6 AB3:
  -- duplicate payload parents collapse here (and at the edge loop below).
  v_parents := coalesce(v_payload -> 'parents', '[]'::jsonb);
  for v_parent in select distinct value from jsonb_array_elements(v_parents) loop
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

  -- ROUND-6 Q4 (D7 amended): parents whose CURRENT union exceeds
  -- own ∪ drafted mean the approver did not read this audience — refuse,
  -- re-render. Distinct shape only PAST the authorization boundary, like
  -- proposal_version_changed; the union above stays as the fail-closed
  -- backstop.
  if exists (select 1 from unnest(v_ptaint) d
             where not (array[d] <@ hc.taint_union(array[v_own]::hc.domain[],
                                                   v_prop.taint))) then
    raise exception 'proposal_taint_changed' using errcode = 'P0001';
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
  -- ROUND-6 AB3: distinct — a duplicate parent is one edge, not a 23505.
  for v_parent in select distinct value from jsonb_array_elements(v_parents) loop
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

-- ----------------------------------------------------------------------------
-- The one edit path, under the lock. Body from M7; the R-rule reorder:
-- discover → lock → RE-READ → authorize → write. Authorization binds to
-- the row version the write touches (concurrency case 8); a freeze or
-- grant change committed while the revision waits defeats it (case 10).
-- ----------------------------------------------------------------------------
create or replace function hc.revise_object(
  p_object_type hc.object_type, p_object_id uuid, p_patch jsonb)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_obj record;
  v_ctx jsonb;
  v_allowed text[];
  v_key text;
  v_before jsonb;
  v_after jsonb;
  v_rev int;
  v_owner uuid;
begin
  if v_actor is null then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  -- Discovery only — the lock is keyed on the circle.
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  v_allowed := case p_object_type
    when 'document' then array['title','summary_text']
    when 'task' then array['title','detail','due_on','due_zone']
    when 'timeline_event' then array['summary']
    when 'episode' then array['title']
    else '{}'::text[]        -- profile_fact: supersede-only
  end;
  if cardinality(v_allowed) = 0 then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  -- R-rule: serialize with growth/shrink and freeze transitions, then
  -- RE-READ — everything the authorization depends on is read under the
  -- lock, against the version this write will touch.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_obj.circle_id::text));
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  -- The care-circle ceiling needs the owner column where it exists.
  if p_object_type = 'task' then
    select t.owner_member_id into v_owner from public.tasks t where t.id = p_object_id;
  end if;

  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_obj.subject_id, v_obj.taint, v_obj.taint_resolved,
                   p_object_type, p_object_id, v_owner) < 'manage' then
    raise exception 'revise_refused' using errcode = 'P0001';
  end if;

  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'revise_invalid_field' using errcode = 'P0001';
  end if;
  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'revise_invalid_field' using errcode = 'P0001';
    end if;
  end loop;

  -- One row, one type; the row lock also serialises revision numbering.
  if p_object_type = 'document' then
    select to_jsonb(d) into v_before from public.documents d
      where d.id = p_object_id for update;
    update public.documents set
      title        = case when p_patch ? 'title' then p_patch ->> 'title' else title end,
      summary_text = case when p_patch ? 'summary_text' then p_patch ->> 'summary_text' else summary_text end
      where id = p_object_id;
    select to_jsonb(d) into v_after from public.documents d where d.id = p_object_id;
  elsif p_object_type = 'task' then
    select to_jsonb(t) into v_before from public.tasks t
      where t.id = p_object_id for update;
    update public.tasks set
      title    = case when p_patch ? 'title' then p_patch ->> 'title' else title end,
      detail   = case when p_patch ? 'detail' then p_patch ->> 'detail' else detail end,
      due_on   = case when p_patch ? 'due_on' then (p_patch ->> 'due_on')::date else due_on end,
      due_zone = case when p_patch ? 'due_zone' then p_patch ->> 'due_zone' else due_zone end
      where id = p_object_id;
    select to_jsonb(t) into v_after from public.tasks t where t.id = p_object_id;
  elsif p_object_type = 'timeline_event' then
    select to_jsonb(e) into v_before from public.timeline_events e
      where e.id = p_object_id for update;
    update public.timeline_events set
      summary = case when p_patch ? 'summary' then p_patch ->> 'summary' else summary end
      where id = p_object_id;
    select to_jsonb(e) into v_after from public.timeline_events e where e.id = p_object_id;
  elsif p_object_type = 'episode' then
    select to_jsonb(ep) into v_before from public.episodes ep
      where ep.id = p_object_id for update;
    update public.episodes set
      title = case when p_patch ? 'title' then p_patch ->> 'title' else title end
      where id = p_object_id;
    select to_jsonb(ep) into v_after from public.episodes ep where ep.id = p_object_id;
  end if;

  select coalesce(max(r.revision_no), 0) + 1 into v_rev
    from public.record_revisions r
    where r.object_type = p_object_type and r.object_id = p_object_id;

  insert into public.record_revisions
    (circle_id, object_type, object_id, revision_no, changed_by,
     changer_display_name, before, after)
  values
    (v_obj.circle_id, p_object_type, p_object_id, v_rev, v_actor,
     v_actor_name, v_before, v_after);

  return jsonb_build_object('object_type', p_object_type,
                            'object_id', p_object_id, 'revision_no', v_rev);
end $$;

-- ----------------------------------------------------------------------------
-- The shrink path authorizes UNDER the lock (concurrency case 9). Body
-- from M11; the manage-on-current-taint check moves below the lock with a
-- re-read, so "current" means the version the recompute operates on.
-- ----------------------------------------------------------------------------
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
  -- Discovery only — the lock is keyed on the circle.
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'reclassify_refused' using errcode = 'P0001';
  end if;

  -- R-rule: lock, RE-READ, then authorize against the CURRENT taint —
  -- the one the shrink will actually operate on.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_obj.circle_id::text));
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'reclassify_refused' using errcode = 'P0001';
  end if;

  v_ctx := hc.ctx();
  if not (v_obj.taint <@ hc.dom(v_ctx -> 'subjects' -> v_obj.subject_id::text -> 'manage')) then
    raise exception 'reclassify_refused' using errcode = 'P0001';
  end if;

  v_before := v_obj.taint;

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

-- ----------------------------------------------------------------------------
-- Freeze writers join the R-rule: enforcement-state transitions serialize
-- with record writers on the same per-circle lock (concurrency case 5).
-- request_freeze body from 210001 (F3 canonicalisation intact); the only
-- delta is the taint: acquisition after the existing freeze: lock —
-- acquired in that order EVERYWHERE, so the advisory graph stays acyclic.
-- ----------------------------------------------------------------------------
create or replace function hc.request_freeze(
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
  v_key           text := hc.contact_key(p_claimant_contact);
  v_freeze        uuid;
  v_disposition   text;
  v_claim         uuid;
begin
  perform pg_advisory_xact_lock(hashtext('freeze:' || p_circle_id::text));
  -- R-rule (round 6): a freeze that opens serializes with every record
  -- writer; whichever side takes this lock first wins outright.
  perform pg_advisory_xact_lock(hashtext('taint:' || p_circle_id::text));

  if exists (select 1
             from public.freeze_claims fc
             join public.freezes f on f.id = fc.freeze_id
             where fc.circle_id = p_circle_id
               and fc.claimant_contact_key = v_key
               and f.state = 'dismissed') then
    v_disposition := 'rate_limited';   -- adjudicated-unfounded prior claim
  elsif (select count(*) from public.freeze_claims fc
         where fc.circle_id = p_circle_id
           and fc.claimant_contact_key = v_key
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
    (circle_id, freeze_id, claimant_contact, claimant_contact_key,
     claimant_relationship, reason, disposition)
  values
    (p_circle_id,
     case when v_disposition = 'rate_limited' then null else v_freeze end,
     p_claimant_contact, v_key, p_claimant_relationship, p_reason, v_disposition)
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

-- ----------------------------------------------------------------------------
-- Adjudication under the same lock: lifting or narrowing a freeze is as
-- much an enforcement transition as opening one. Body from M9 (the D2
-- re-signed form); the delta is discovery + the taint: acquisition before
-- the guarded update. A nonexistent id skips the lock and falls through
-- to the same refusal shape — no oracle.
-- ----------------------------------------------------------------------------
create or replace function hc.adjudicate_freeze(
  p_freeze_id           uuid,
  p_outcome             text,
  p_adjudicated_by      text,
  p_outcome_note        text default null,
  p_subject_id          uuid default null,
  p_narrowing_rationale text default null,
  p_contact_attempted_at timestamptz default null,
  p_objected_to_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_circle uuid;
begin
  if p_outcome not in ('dismissed', 'upheld', 'unresolved') then
    raise exception 'freeze_not_adjudicable' using errcode = 'P0001';
  end if;

  -- R-rule (round 6): discovery first — the lock keys on the circle.
  select f.circle_id into v_circle from public.freezes f where f.id = p_freeze_id;
  if v_circle is not null then
    perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));
  end if;

  update public.freezes f
     set state = p_outcome,
         subject_id = p_subject_id,
         narrowing_rationale = p_narrowing_rationale,
         adjudicated_at = now(),
         adjudicated_by = p_adjudicated_by,
         outcome_note = p_outcome_note,
         contact_attempted_at = coalesce(p_contact_attempted_at, f.contact_attempted_at),
         objected_to_member_id = case when p_outcome = 'unresolved'
                                      then p_objected_to_member_id end
   where f.id = p_freeze_id and f.state = 'open'
   returning f.circle_id into v_circle;

  if v_circle is null then
    raise exception 'freeze_not_adjudicable' using errcode = 'P0001';
  end if;

  perform hc.log(v_circle, 'freeze_adjudicated', 'Freeze adjudication',
                 p_subject_id => p_subject_id,
                 p_detail => jsonb_build_object('outcome', p_outcome));

  return jsonb_build_object('freeze_id', p_freeze_id, 'outcome', p_outcome);
end $$;
