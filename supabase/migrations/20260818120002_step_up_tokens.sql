-- ============================================================================
-- 2A · M2 — step_up_tokens + operation/target-bound verification (TSD §5.7;
-- annex A3's interim guard retired; ADR-0010 call-time-validation
-- discipline).
--
-- A 30-day session is right for daily use and wrong as a standing
-- authorization to move access or data out of the circle. The §5.7
-- operations demand a token minted on a FRESH re-authentication and bound
-- to this operation and this target: a token minted to share one document
-- cannot approve a circle deletion.
--
-- The table is §5.7-VERBATIM; the CHECK below implements its "fixed
-- enumeration" comment (every §5.7 operation, plus approve_proposal —
-- §3.7's signature has carried p_step_up_token since 1B, and A3 says
-- §5.7's real binding replaces the F6 interim refusal: what is presented
-- is validated, never ignored). Operations whose writers land in later
-- slices (export, deletions, transfer, email/password change) are mintable
-- now and consumable by nothing until their writers exist — fail closed.
--
-- Enforcement split, recorded: "re-authentication uses the strongest
-- factor the account has enrolled" (§5.7) is enforced at the app layer,
-- which re-authenticates before minting — enrollment lives in
-- auth.mfa_factors, which is not grantable from migrations on this image
-- (the recorded 1A trap). The database demands claims-level proof of a
-- fresh authentication event (newest amr timestamp ≤ 300 s) and records
-- the aal actually used, verbatim, as §5.7's audit column.
-- ============================================================================

create table public.step_up_tokens (
  token_hash bytea primary key,
  account_id uuid not null references public.accounts(id),
  operation  text not null
             check (operation in ('export', 'delete_circle', 'delete_account',
                                  'raise_grant', 'share_object',
                                  'transfer_coordinator', 'change_email',
                                  'change_password', 'approve_proposal')),
  target_ref text,                   -- bound to the specific object or member
  aal        text not null,          -- the factor actually used
  expires_at timestamptz not null,   -- now() + 5 minutes
  consumed_at timestamptz
);
create index step_up_tokens_by_account on public.step_up_tokens (account_id, expires_at);

alter table public.step_up_tokens enable row level security;
alter table public.step_up_tokens force  row level security;

revoke all on public.step_up_tokens from anon, authenticated, hc_pipeline, hc_admin;

grant select, insert, update on public.step_up_tokens to hc_internal;
create policy step_up_tokens_internal on public.step_up_tokens
  for select to hc_internal using (true);
create policy step_up_tokens_internal_mint on public.step_up_tokens
  for insert to hc_internal with check (true);
create policy step_up_tokens_internal_consume on public.step_up_tokens
  for update to hc_internal using (true) with check (true);

-- ----------------------------------------------------------------------------
-- hc.mint_step_up(operation, target_ref) → {token, expires_at}.
-- authenticated only — you re-authenticate a session, not a stranger. The
-- token is 32 random bytes returned once as hex; only its sha256 is
-- stored. ONE refusal shape, fail closed on every missing leg.
-- ----------------------------------------------------------------------------
create function hc.mint_step_up(p_operation text, p_target_ref text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account   uuid := hc.uid();
  v_claims    jsonb;
  v_aal       text;
  v_last_auth bigint;
  v_token     text;
  v_expires   timestamptz := now() + interval '5 minutes';
begin
  v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  v_aal    := v_claims ->> 'aal';

  if v_account is null or v_aal is null
     or jsonb_typeof(coalesce(v_claims -> 'amr', 'null'::jsonb)) <> 'array' then
    raise exception 'step_up_refused' using errcode = 'P0001';
  end if;

  select max((e ->> 'timestamp')::bigint) into v_last_auth
  from jsonb_array_elements(v_claims -> 'amr') e
  where (e ->> 'timestamp') ~ '^[0-9]+$';

  -- The re-authentication must be FRESH: a session that last proved a
  -- factor more than 300 s ago mints nothing, whatever its age or aal.
  if v_last_auth is null
     or v_last_auth < extract(epoch from now())::bigint - 300 then
    raise exception 'step_up_refused' using errcode = 'P0001';
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  begin
    insert into public.step_up_tokens
      (token_hash, account_id, operation, target_ref, aal, expires_at)
    values
      (extensions.digest(v_token, 'sha256'), v_account, p_operation,
       p_target_ref, v_aal, v_expires);
  exception when check_violation or foreign_key_violation or not_null_violation then
    -- unknown operation, or an account row that does not exist: one shape
    raise exception 'step_up_refused' using errcode = 'P0001';
  end;

  return jsonb_build_object('token', v_token, 'expires_at', v_expires);
end $$;

alter function hc.mint_step_up(text, text) owner to hc_internal;
revoke execute on function hc.mint_step_up(text, text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.mint_step_up(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.consume_step_up(token, operation, target, account) → boolean.
-- Request-callable by NOTHING — definer bodies are the only consumers, and
-- each passes ITS operation name and ITS target, so a token cannot cross.
-- Consumption is the atomic conditional UPDATE: of two racers, exactly one
-- sees consumed_at IS NULL after the row lock. Boolean, not raising — each
-- caller keeps its own DEF-10 refusal shape.
-- ----------------------------------------------------------------------------
create function hc.consume_step_up(
  p_token text, p_operation text, p_target_ref text, p_account uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_hit bytea;
begin
  if p_token is null or p_account is null then
    return false;
  end if;

  update public.step_up_tokens s
     set consumed_at = now()
   where s.token_hash  = extensions.digest(p_token, 'sha256')
     and s.account_id  = p_account
     and s.operation   = p_operation
     and s.target_ref is not distinct from p_target_ref
     and s.expires_at  > now()
     and s.consumed_at is null
  returning s.token_hash into v_hit;

  return v_hit is not null;
end $$;

alter function hc.consume_step_up(text, text, text, uuid) owner to hc_internal;
revoke execute on function hc.consume_step_up(text, text, text, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- hc.approve_proposal: body from round-6 M12 verbatim; the ONE delta is the
-- F6 interim guard replaced by §5.7's real binding (annex A3: "§5.7
-- replaces this guard with real validation"). A presented token is
-- validated and consumed in-transaction — a later refusal rolls the burn
-- back; an invalid, foreign, cross-operation or replayed token refuses
-- with the same approval_refused before any row is written.
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

  -- 2A M2 (was ROUND-6 F6): §5.7's real binding. What is presented is
  -- validated — operation- and target-bound to THIS proposal, this actor,
  -- live, unconsumed — never ignored. Null stays valid: approval is not on
  -- §5.7's required list; it validates step-up when a client presents one.
  if p_step_up_token is not null
     and not hc.consume_step_up(p_step_up_token, 'approve_proposal',
                                p_proposal_id::text, v_actor) then
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
-- hc.share_object: sharing an object IS on §5.7's required list, so the
-- 3-arg form is DROPPED — no path shares without step-up — and the 4-arg
-- form validates the token FIRST (bound to 'share_object' + 'type:id',
-- this actor). Body otherwise from 1B M8 verbatim; still the recorded
-- single-snapshot exception to the R-rule (ADR-0006).
-- ----------------------------------------------------------------------------
drop function hc.share_object(hc.object_type, uuid, uuid);

create function hc.share_object(
  p_object_type hc.object_type, p_object_id uuid, p_member_id uuid,
  p_step_up_token text)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_obj record;
  v_grantee record;
  v_owner uuid;
begin
  if v_actor is null then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  -- 2A M2: §5.7 — no share without a live token bound to THIS object.
  -- Consumption is in-transaction: a refusal below rolls the burn back.
  if p_step_up_token is null
     or not hc.consume_step_up(p_step_up_token, 'share_object',
                               p_object_type::text || ':' || p_object_id::text,
                               v_actor) then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  select * into v_grantee from public.circle_members m
    where m.id = p_member_id
      and m.circle_id = v_obj.circle_id
      and m.removed_at is null;
  if v_grantee.id is null then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  if p_object_type = 'task' then
    select t.owner_member_id into v_owner from public.tasks t where t.id = p_object_id;
  end if;

  if hc.visible_at(hc.ctx(), v_obj.subject_id, v_obj.taint, v_obj.taint_resolved,
                   p_object_type, p_object_id, v_owner) < 'manage' then
    raise exception 'share_refused' using errcode = 'P0001';
  end if;

  begin
    insert into public.object_shares
      (circle_id, subject_id, object_type, object_id, member_id, granted_by)
    values
      (v_obj.circle_id, v_obj.subject_id, p_object_type, p_object_id,
       p_member_id, v_actor);
  exception when unique_violation then
    raise exception 'share_refused' using errcode = 'P0001';
  end;

  perform hc.log(v_obj.circle_id, 'object_shared', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_obj.subject_id,
                 p_target_member_id => p_member_id,
                 p_object_type => p_object_type, p_object_id => p_object_id);

  return jsonb_build_object('object_type', p_object_type,
                            'object_id', p_object_id, 'member_id', p_member_id);
end $$;

alter function hc.share_object(hc.object_type, uuid, uuid, text) owner to hc_internal;
revoke execute on function hc.share_object(hc.object_type, uuid, uuid, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.share_object(hc.object_type, uuid, uuid, text)
  to authenticated;
