-- ============================================================================
-- 5A · M6 — the round-15 dispositions (the reserved slot; Q2's bound closes
-- SPENT at 6 of ≤ 6). Findings verbatim in docs/review/round-15-findings.md;
-- the argument for each acceptance is ADR-0021. Three accepted findings,
-- no shipped migration edited — each function is REPLACED here, the 2A M8
-- way, with ownership and grants restated for the replaced object.
--
--   1 · FINDING 1 (HIGH, accepted) — stage-2 detection raced a document
--       committed concurrently. hc.finalize_extraction asked the duplicate
--       question with NO lock held and only then blocked on the per-circle
--       taint lock inside hc.advance_arrival. hc.approve_proposal files its
--       document under THAT SAME key, so a matching document committing in
--       the window was invisible to the detector: the arrival advanced to
--       'extracted' and the settled stage-2 question was skipped, with the
--       final state depending on transaction timing. The lock is hoisted
--       ABOVE detection. Lock ORDER is unchanged (per-circle before any row
--       lock — ADR-0007's R-rule), and advance_arrival's own acquisition is
--       a re-entrant no-op. In READ COMMITTED the detect call is a fresh
--       statement, so on the far side of the wait its snapshot SEES the
--       committed document. Pinned structurally in pgTAP 056 test 1 and
--       behaviourally in concurrency case 44.
--
--   2 · FINDING 2 (MEDIUM, accepted) — hc.list_known_senders resolved its
--       actor with `where a.id = v_actor` alone, omitting the
--       `deleted_at is null` guard hc.log_artifact_read carries, so a
--       soft-deleted account holding a live coordinator membership could
--       enumerate live accepted senders. Currently UNREACHABLE: nothing in
--       the shipped schema writes accounts.deleted_at. Fixed anyway on the
--       live-actor principle — the guard must be in place BEFORE the
--       account-deletion path exists, not after. hc.accept_sender and
--       hc.revoke_sender share the omission and are 4A-era shipped
--       surfaces; they are NOT touched here — the SND-02 family audit is
--       queued as an owner item (ADR-0021 D2), the ADR-0019 D15 way.
--
--   3 · FINDING 3 (MEDIUM, accepted) — hc.detect_stage2_duplicate narrowed
--       the ARRIVAL side to one document-proposal category and one value
--       per key field with `limit 1`, while the CANDIDATE side matched with
--       EXISTS over all of them. Both narrowings are reachable:
--       write_proposals admits 50 proposals with no document-kind limit and
--       write_extractions 200 facts with no per-field uniqueness. A second
--       proposal or a second value was silently ignored and the outcome
--       depended on payload ORDER. The arrival side now reads SETS, which
--       makes the two sides symmetric. THE SETTLED MATCHING CONTRACT IS
--       UNCHANGED — same circle and subject, filed current documents, type
--       + date + ≥ 1 corroborating pair, every contributing field PRESENT
--       on both sides, absence never wildcards, exact after normalisation
--       (lower/btrim), most-recently-filed canonical target with ties on
--       id, a re-run never matching itself. Only the arbitrary first-value
--       tie-break is removed; the fix ALIGNS the detector with Q-A's own
--       plural reading ("categories"), which hc.record_context_for already
--       honours.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · hc.list_known_senders — the live-actor guard (finding 2).
--     Body as M1 left it, with `and a.deleted_at is null` on the actor
--     lookup. The refusal SHAPE is unchanged: one 'sender_refused' for
--     no-identity, deleted, foreign, nonexistent and non-coordinator alike
--     (DEF-10), so the fix widens nothing a caller can distinguish.
-- ----------------------------------------------------------------------------
create or replace function hc.list_known_senders(p_circle uuid)
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
  -- ROUND-15 FINDING 2: a LIVE actor, matching hc.log_artifact_read.
  select a.display_name into v_name
    from public.accounts a
   where a.id = v_actor and a.deleted_at is null;
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
-- 2 · hc.detect_stage2_duplicate — set semantics on the arrival side
--     (finding 3). `cats` is EVERY drafted document category and `vals`
--     EVERY value of each canonical key field; a category or a value
--     corroborates when SOME pair is present on both sides and equal —
--     exactly what the candidate side has always done with EXISTS.
--     Absence still never wildcards: an empty `cats` or a `vals` with no
--     document_date row makes its EXISTS false, so no candidate matches.
-- ----------------------------------------------------------------------------
create or replace function hc.detect_stage2_duplicate(
  p_arrival uuid, p_circle uuid, p_subject uuid, p_facts jsonb, p_proposals jsonb)
returns uuid
language sql stable
set search_path = ''
as $$
  with cats as (
    select distinct p.value -> 'payload' ->> 'category' as cat
    from jsonb_array_elements(p_proposals) p
    where p.value ->> 'kind' = 'document'
      and p.value -> 'payload' ? 'category'
  ),
  vals as (
    select f.value ->> 'field' as field,
           lower(btrim(f.value -> 'value' #>> '{}')) as val
    from jsonb_array_elements(p_facts) f
    where f.value ->> 'field' in ('document_date', 'provider',
                                  'amount', 'policy_number')
      and lower(btrim(f.value -> 'value' #>> '{}')) is not null
  )
  select d.id
  from public.documents d
  where d.circle_id = p_circle and d.subject_id = p_subject
    and d.deleted_at is null
    and d.artifact_arrival_id <> p_arrival   -- a re-run never matches itself
    and exists (                             -- type PRESENT both sides, equal
      select 1 from cats c
      where c.cat is not null and d.category::text = c.cat)
    and exists (                             -- date PRESENT both sides, equal
      select 1 from vals v
      join public.extractions e
        on e.arrival_id = d.artifact_arrival_id
       and e.superseded_at is null
       and e.field = 'document_date'
      where v.field = 'document_date'
        and lower(btrim(e.value #>> '{}')) = v.val)
    and exists (                             -- ≥1 corroborating pair, equal
      select 1 from vals v
      join public.extractions e
        on e.arrival_id = d.artifact_arrival_id
       and e.superseded_at is null
       and e.field = v.field
      where v.field in ('provider', 'amount', 'policy_number')
        and lower(btrim(e.value #>> '{}')) = v.val)
  order by d.filed_at desc, d.id desc        -- most-recently-filed, ties on id
  limit 1;
$$;

alter function hc.detect_stage2_duplicate(uuid, uuid, uuid, jsonb, jsonb)
  owner to hc_internal;
revoke execute on function hc.detect_stage2_duplicate(uuid, uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- 3 · hc.finalize_extraction — the R-rule lock hoisted above detection
--     (finding 1). Body as M5 left it; the ONLY change is the advisory
--     lock moving ahead of the duplicate question, so the predicate is
--     evaluated under the same serialization point that guards
--     publication. Everything downstream is unchanged: the work answer
--     lands in full on a won transition, and a lost CAS still writes
--     nothing.
-- ----------------------------------------------------------------------------
create or replace function hc.finalize_extraction(
  p_arrival uuid, p_lease uuid, p_facts jsonb, p_proposals jsonb)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare
  v hc.advance_result;
  v_circle uuid; v_subject uuid;
  v_dup uuid;
  v_to hc.arrival_state := 'extracted'::hc.arrival_state;
  v_reason text;
begin
  -- Discovery for the lock key (an arrival never changes circles), then
  -- the per-circle lock BEFORE any row lock — ADR-0007's R-rule, the same
  -- order hc.advance_arrival uses, so acquisition stays acyclic.
  select a.circle_id, a.subject_id into v_circle, v_subject
    from public.arrivals a where a.id = p_arrival;

  -- ROUND-15 FINDING 1: taken HERE, not first inside advance_arrival. A
  -- matching document committing while this transaction waits is on the
  -- far side of the wait, and the detect call below is a fresh statement,
  -- so its snapshot sees it. advance_arrival's own acquisition of the same
  -- key is then a re-entrant no-op.
  if v_circle is not null then
    perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));
  end if;

  v_dup := hc.detect_stage2_duplicate(p_arrival, v_circle, v_subject,
                                      coalesce(p_facts, '[]'::jsonb),
                                      coalesce(p_proposals, '[]'::jsonb));
  if v_dup is not null then
    v_to := 'duplicate_suspected_stage2'::hc.arrival_state;
    v_reason := 'duplicate_key_fields';
  end if;

  v := hc.advance_arrival(p_arrival, 'extracting', v_to, p_lease, v_reason);
  if v <> 'advanced' then
    return v;                    -- cancelled / frozen / already: nothing below runs
  end if;
  -- Reached only on a won transition; commits with it or not at all.
  if v_dup is not null then
    update public.arrivals set duplicate_of_document_id = v_dup
     where id = p_arrival;
  end if;
  perform hc.write_extractions(p_arrival, p_lease, coalesce(p_facts, '[]'::jsonb));
  perform hc.write_proposals(p_arrival, p_lease, coalesce(p_proposals, '[]'::jsonb));
  return 'advanced'::hc.advance_result;
end $$;

alter function hc.finalize_extraction(uuid, uuid, jsonb, jsonb) owner to hc_internal;
revoke execute on function hc.finalize_extraction(uuid, uuid, jsonb, jsonb)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_extraction(uuid, uuid, jsonb, jsonb) to hc_pipeline;
