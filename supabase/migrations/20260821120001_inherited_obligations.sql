-- ============================================================================
-- 5A · M1 — the inherited-obligations batch (the R8 precedent: owner-queue
-- DB items land FIRST, before slice-5-proper work). docs/review/
-- slice-5-plan.md M1; ADR-0019 D7/D8/D15, Q-iii/Q-vi, S3; Q4 SETTLED.
--
--   1 · hc.log_artifact_read(p_arrival) — the §1.3 step-6 entry as an
--       authenticated SECURITY DEFINER with IN-FUNCTION authorization
--       (ADR-0019 Q-iii). Retires the D7 hc_internal-assumption interim:
--       the write path stops being "the maintenance identity assumes
--       hc_internal for one statement" and becomes a definer whose own
--       body re-proves what the artifact route proves — the arrival is
--       live and hc.visible_at clears VIEW for the caller (RLS-10's
--       exact predicate, repeated here so the function is safe standing
--       alone; shares widen one named object, the care_circle ceiling
--       and the FRZ-13 cap apply inside visible_at). The actor is
--       hc.uid() — no parameter is spoofable; the display name comes
--       from the live accounts row in the same transaction (a missing
--       live account refuses — bytes never move without a real actor on
--       the trail). Nonexistent, foreign, deleted and not-visible all
--       land in ONE refusal shape (DEF-10). The 'artifact_read' event
--       type shipped with 20260818200005; the app half (the route call
--       + deleting lib/db/evidentiary.ts) is 5B B8.
--   2 · hc.list_known_senders(p_circle) — D15's revoke-sender read: the
--       member surface hc.revoke_sender has waited for. LIVE rows only
--       (revoked_at is null) with accepted_by/accepted_at and the
--       acceptor's display name resolved at read (a list surface, not
--       evidence — the captured-name discipline stays hc.log's).
--       Authorization is the SND-02 shape verbatim (live coordinator
--       membership; built strict like accept/revoke — the round-9
--       widening question stands recorded): foreign, nonexistent and
--       non-coordinator land in the one 'sender_refused' shape (DEF-10).
--       No freeze check, deliberately: the list feeds revocation, and
--       revocation reduces reach (hc.revoke_sender's own recorded
--       stance). Deterministic order (accepted_at desc, id desc) so the
--       5B surface is stable. citext columns are cast to text at the
--       boundary (the recorded search_path=''/citext trap).
--   3 · D8's NOINHERIT (Q4 — SETTLED): hc_runtime's two memberships
--       re-granted WITH INHERIT FALSE. The request path is untouched —
--       the SET ROLE channel is membership + SET, never inheritance —
--       but the BARE credential now holds nothing at all: zero direct
--       privileges (BAT-04) and, after this, zero inherited ones. The
--       bare-login probe flips from RLS-empty-zero-rows to an honest
--       42501; tests/db/runtime-credential.test.ts and pgTAP 043's
--       BAT-04 pin are re-pinned in this commit, and the
--       docs/ops/runtime-db-credentials.md row is updated with it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · hc.log_artifact_read
-- ----------------------------------------------------------------------------
create function hc.log_artifact_read(p_arrival uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor   uuid := hc.uid();
  v_name    text;
  v_circle  uuid;
  v_subject uuid;
  v_seq     bigint;
begin
  if v_actor is null then
    raise exception 'artifact_refused' using errcode = 'P0001';
  end if;

  select a.display_name into v_name
  from public.accounts a
  where a.id = v_actor and a.deleted_at is null;
  if v_name is null then
    raise exception 'artifact_refused' using errcode = 'P0001';
  end if;

  -- The route's evidence read, re-proven in-function (RLS-10's letter):
  -- the arrival is live and the caller clears VIEW on it. Zero rows is
  -- the one shape for nonexistent, foreign, deleted, revoked and
  -- below-cliff alike.
  select a.circle_id, a.subject_id into v_circle, v_subject
  from public.arrivals a
  where a.id = p_arrival
    and a.deleted_at is null
    and hc.visible_at(hc.ctx(), a.subject_id, hc.all_domains(), true,
                      'arrival', a.id, null) >= 'view';
  if v_circle is null then
    raise exception 'artifact_refused' using errcode = 'P0001';
  end if;

  v_seq := hc.log(v_circle, 'artifact_read', v_name,
                  p_actor_account_id => v_actor,
                  p_subject_id       => v_subject,
                  p_object_type      => 'arrival',
                  p_object_id        => p_arrival);

  return jsonb_build_object('logged', true, 'seq', v_seq);
end $$;

alter function hc.log_artifact_read(uuid) owner to hc_internal;
revoke execute on function hc.log_artifact_read(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.log_artifact_read(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2 · hc.list_known_senders
-- ----------------------------------------------------------------------------
create function hc.list_known_senders(p_circle uuid)
returns table (
  id               uuid,
  address          text,
  domain           text,
  accepted_by      uuid,
  accepted_by_name text,
  accepted_at      timestamptz
)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_name  text;
begin
  if v_actor is null then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_name from public.accounts a where a.id = v_actor;
  if v_name is null then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.circle_members m
                 where m.circle_id = p_circle and m.account_id = v_actor
                   and m.removed_at is null and m.tier = 'coordinator') then
    -- nonexistent, foreign, non-coordinator: one shape
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  return query
  select k.id, k.address::text, k.domain::text,
         k.accepted_by, a.display_name, k.accepted_at
  from public.known_senders k
  left join public.accounts a on a.id = k.accepted_by
  where k.circle_id = p_circle
    and k.revoked_at is null
  order by k.accepted_at desc, k.id desc;
end $$;

alter function hc.list_known_senders(uuid) owner to hc_internal;
revoke execute on function hc.list_known_senders(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.list_known_senders(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3 · D8's NOINHERIT (Q4). Same grantor as 20260818200001's original
-- grants (the migration runner), so each GRANT updates the existing
-- membership's options in place — no second membership row appears (and
-- pgTAP 051's exact-set pin would fail loudly if one ever did). SET is
-- untouched: the request-role channel (SET ROLE anon/authenticated over
-- the hc_runtime login) keeps working; only privilege INHERITANCE stops.
-- ----------------------------------------------------------------------------
grant anon          to hc_runtime with inherit false;
grant authenticated to hc_runtime with inherit false;
