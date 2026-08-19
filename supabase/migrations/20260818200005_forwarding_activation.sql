-- ============================================================================
-- 4A · M5 — forwarding activation (slice-4 plan M5; TSD §5.1; AC-AUTH-3/4)
-- + the §5.2 step-2 resolver (a build-time addition to M5's listed
-- contents, flagged for round 12: the webhook's "resolve the recipient
-- local part → subject" has no surface without it, and 4B may not add
-- DDL; §5.1 and §5.2 are one machine, so it lands with activation).
-- pgTAP 047 pinned every shape red-first.
--
-- hc.activate_forwarding flips subjects.forwarding_active_at — the flag
-- whose NULL is the AC-AUTH-3 absence mechanism (no route at the MTA, a
-- genuine 550). The flip is gated on the FOUNDER's verified email read
-- from the postgres-owned mirror (accounts.email_verified_at — the
-- AC-AUTH-4 ground truth), performed by a live coordinator, refused
-- NAMED under a live freeze (activation enables ingestion; a freeze
-- suspends exactly that — the R-rule applies), idempotent, and logged
-- per §5.1. The provider-side route creation is the deploy/app half
-- (4B + the deploy checklist); DEACTIVATION on subject/circle deletion
-- stays with the deletion surface (DEL-01, later slice — named here,
-- not dropped).
--
-- 'artifact_read' joins log_event_types now (the §1.3 step-6 entry) so
-- the 4B artifact route needs no DDL to log its reads.
-- ============================================================================

insert into hc.log_event_types (code, description) values
  ('forwarding_activated', 'A subject''s forwarding address was activated after the founder''s email verification (TSD §5.1)'),
  ('artifact_read',        'An original artifact was streamed to a member through the authorization-checking route (TSD §1.3 step 6)');

-- subjects.forwarding_active_at is the one column this writer flips.
grant update on public.subjects to hc_internal;
create policy subjects_internal_activate_forwarding on public.subjects
  for update to hc_internal using (true) with check (true);

create function hc.activate_forwarding(p_subject uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_circle uuid;
  v_founder uuid;
  v_active timestamptz;
  v_local text;
begin
  if v_actor is null then
    raise exception 'forwarding_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name
  from public.accounts a where a.id = v_actor and a.deleted_at is null;
  if v_actor_name is null then
    raise exception 'forwarding_refused' using errcode = 'P0001';
  end if;

  -- Discovery for the lock key only (a subject never changes circles —
  -- the advance_arrival precedent); every predicate re-reads under it.
  select s.circle_id into v_circle
  from public.subjects s where s.id = p_subject and s.deleted_at is null;
  if v_circle is null then
    raise exception 'forwarding_refused' using errcode = 'P0001';
  end if;

  -- R-rule: activation is a security-state write (it enables ingestion).
  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  -- The caller must be a live COORDINATOR of the subject's circle.
  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_circle and m.account_id = v_actor
                   and m.removed_at is null and m.tier = 'coordinator') then
    raise exception 'forwarding_refused' using errcode = 'P0001';
  end if;

  -- PRD §7.5: a freeze suspends ingestion — named, never swallowed.
  if exists (select 1 from public.freezes f
             where f.circle_id = v_circle
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- The §5.1 gate: the FOUNDER's email is verified, read from the
  -- postgres-owned mirror (the AC-AUTH-4 ground truth). Named and
  -- actionable — the authorized caller's next step is the verify mail.
  select c.created_by into v_founder from public.circles c where c.id = v_circle;
  if not exists (select 1 from public.accounts a
                 where a.id = v_founder and a.email_verified_at is not null) then
    raise exception 'email_unverified' using errcode = 'P0001';
  end if;

  -- Idempotent: an already-active address answers quietly, logs nothing.
  select s.forwarding_active_at, s.forwarding_local_part::text
    into v_active, v_local
  from public.subjects s where s.id = p_subject for update;
  if v_active is not null then
    return jsonb_build_object('activated', false, 'active_at', v_active);
  end if;

  update public.subjects
     set forwarding_active_at = now()
   where id = p_subject
  returning forwarding_active_at into v_active;

  perform hc.log(v_circle, 'forwarding_activated', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => p_subject,
                 p_detail => jsonb_build_object('forwarding_local_part', v_local));

  return jsonb_build_object('activated', true, 'active_at', v_active);
end $$;

alter function hc.activate_forwarding(uuid) owner to hc_internal;
revoke execute on function hc.activate_forwarding(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.activate_forwarding(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.resolve_forwarding — §5.2 step 2: local part → circle/subject, with
-- the active flag distinct (a message reaching an inactive address is
-- provisioning drift — visible, never absorbed). Unknown and deleted
-- answer null in ONE shape; the webhook's 550 branch is defence in
-- depth either way.
-- ----------------------------------------------------------------------------
create function hc.resolve_forwarding(p_local_part text)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'circle_id', s.circle_id,
           'subject_id', s.id,
           'forwarding_active', s.forwarding_active_at is not null)
  from public.subjects s
  where lower(s.forwarding_local_part::text) = lower(btrim(coalesce(p_local_part, '')))
    and s.deleted_at is null;
$$;

alter function hc.resolve_forwarding(text) owner to hc_internal;
revoke execute on function hc.resolve_forwarding(text)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.resolve_forwarding(text) to hc_pipeline;
