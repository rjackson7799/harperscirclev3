-- ============================================================================
-- 1B · M6 — hc.approve_proposal() (TSD §3.7, §2.4): the ONLY writer of the
-- record, plus the §3.7 write grants/policies and the §2.4 deferred claim
-- triggers.
--
-- §3.7's seven steps, with one recorded re-ordering: the FREEZE check runs
-- BEFORE the visibility re-check. visible_at() returns hidden under a
-- freeze (clause 2), so checking it first would swallow the named FRZ-14
-- signature into a generic refusal; freeze-first reveals nothing a member's
-- own ctx does not already carry ('frozen' is per-subject in §3.2).
-- Recorded for round-6 review.
--
-- Refusal shapes: nonexistent, unauthorized, undecidable and key-misuse
-- share ONE message (approval_refused, DEF-10). Version drift
-- (proposal_version_changed), freeze (freeze_active, FRZ-14) and
-- unconfirmed high-risk (high_risk_unconfirmed) are distinct only where
-- the caller has already passed the existence/authorization boundary or
-- the fact is already theirs to know.
-- ============================================================================

insert into hc.log_event_types (code, description) values
  ('object_approved', 'A proposal was approved and its object written');

create function hc.approve_proposal(
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
  v_ptaint   hc.domain[] := '{}';
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

alter function hc.approve_proposal(uuid, int, text, jsonb, text) owner to hc_internal;
revoke execute on function hc.approve_proposal(uuid, int, text, jsonb, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.approve_proposal(uuid, int, text, jsonb, text)
  to authenticated;

-- ----------------------------------------------------------------------------
-- §3.7: the write privilege and the claim-checked insert policies. No
-- request-path role holds write privilege on any record table, so adding a
-- policy for one later would still grant nothing.
-- ----------------------------------------------------------------------------
grant insert on public.documents, public.tasks, public.timeline_events,
                public.profile_facts, public.episodes
  to hc_internal;

create policy documents_internal_write on public.documents
  for insert to hc_internal
  with check (exists (select 1 from public.proposal_commits pc
                      where pc.object_type = 'document' and pc.object_id = documents.id));
create policy tasks_internal_write on public.tasks
  for insert to hc_internal
  with check (exists (select 1 from public.proposal_commits pc
                      where pc.object_type = 'task' and pc.object_id = tasks.id));
create policy timeline_events_internal_write on public.timeline_events
  for insert to hc_internal
  with check (exists (select 1 from public.proposal_commits pc
                      where pc.object_type = 'timeline_event' and pc.object_id = timeline_events.id));
create policy profile_facts_internal_write on public.profile_facts
  for insert to hc_internal
  with check (exists (select 1 from public.proposal_commits pc
                      where pc.object_type = 'profile_fact' and pc.object_id = profile_facts.id));
create policy episodes_internal_write on public.episodes
  for insert to hc_internal
  with check (exists (select 1 from public.proposal_commits pc
                      where pc.object_type = 'episode' and pc.object_id = episodes.id));

-- ----------------------------------------------------------------------------
-- The §2.4 deferred constraint trigger: a newly inserted record row must
-- have a matching claim at statement end. The policy catches hc_internal
-- at the row; this catches EVERYTHING at commit — including the
-- maintenance path the policies cannot see. They fail in different
-- places, which is useful when diagnosing.
-- ----------------------------------------------------------------------------
create function hc.assert_claimed() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.proposal_commits pc
                 where pc.object_type = tg_argv[0]::hc.object_type
                   and pc.object_id = (to_jsonb(new) ->> 'id')::uuid) then
    raise exception 'record_write_unclaimed' using errcode = 'P0001';
  end if;
  return new;
end $$;
alter function hc.assert_claimed() owner to hc_internal;
revoke execute on function hc.assert_claimed()
  from public, anon, authenticated, hc_pipeline, hc_admin;

create constraint trigger hc_claim_documents
  after insert on public.documents
  deferrable initially deferred
  for each row execute function hc.assert_claimed('document');
create constraint trigger hc_claim_tasks
  after insert on public.tasks
  deferrable initially deferred
  for each row execute function hc.assert_claimed('task');
create constraint trigger hc_claim_timeline_events
  after insert on public.timeline_events
  deferrable initially deferred
  for each row execute function hc.assert_claimed('timeline_event');
create constraint trigger hc_claim_profile_facts
  after insert on public.profile_facts
  deferrable initially deferred
  for each row execute function hc.assert_claimed('profile_fact');
create constraint trigger hc_claim_episodes
  after insert on public.episodes
  deferrable initially deferred
  for each row execute function hc.assert_claimed('episode');
