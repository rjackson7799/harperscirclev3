-- ============================================================================
-- 4A · M8 — the round-12 fixes (the reserved dispositions slot, spent on
-- the external-pass blockers; findings addendum X1/X2 landed verbatim at
-- f5189b4; dispositions: the ADR-0018 addendum; pgTAP 050 pinned both
-- red-first, 8/13 failing at dc1e0ba).
--
-- X1 · SAFETY-MONOTONIC scan evidence (PRD §11.5). finalize_scan's
--     scan_results upsert was unconditional: a later clean verdict for a
--     sha replaced a RETAINED infected row and handed it a 7-day expiry —
--     after which the sweep would delete the evidence entirely, and the
--     4B cache-hit path could treat known-infected bytes as clean. The
--     fix guards the conflict arm: an existing INFECTED row is immutable
--     against clean. Upgrades stay open (clean → infected always lands;
--     infected → infected refreshes the evidence detail; clean → clean
--     refreshes freshness). Everything else in the body is M6's, byte
--     for byte.
--
-- X2 · CANONICAL-ORIGINAL duplicates (TSD §4.7 point 1, PRD §8.9).
--     detect_duplicate matched ANY other live same-sha copy, so two
--     identical copies both stored before either scans (identical
--     attachments created together — sequential, no race) each saw the
--     other and BOTH landed duplicate_suspected: no original retained,
--     circular matched-arrival explanations. The fix: match only
--     STRICTLY EARLIER live copies in (received_at, id) row order — a
--     deterministic total order (received_at ties inside one
--     transaction, e.g. one email's children, break on id) — so of N
--     identical live copies exactly ONE (the earliest) is never a
--     suspect, every suspect's match points at an earlier arrival, and
--     the outcome is scan-order-independent. The non-deleted scope and
--     everything downstream are unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- X2 · hc.detect_duplicate — strictly-earlier canonical match.
-- ----------------------------------------------------------------------------
create or replace function hc.detect_duplicate(p_arrival uuid, p_circle uuid, p_sha bytea)
returns uuid
language sql stable
set search_path = ''
as $$
  select a.id
  from public.arrivals a
  join public.arrivals me on me.id = p_arrival
  where a.circle_id = p_circle
    and a.content_sha256 = p_sha
    and a.id <> p_arrival
    and a.deleted_at is null
    and (a.received_at, a.id) < (me.received_at, me.id)
  order by a.received_at, a.id
  limit 1;
$$;

-- ownership and grants restated for the replaced object (the M6 way).
alter function hc.detect_duplicate(uuid, uuid, bytea) owner to hc_internal;
revoke execute on function hc.detect_duplicate(uuid, uuid, bytea)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- X1 · hc.finalize_scan — body as M6 with ONE change: the scan_results
-- conflict arm refuses the infected → clean downgrade.
-- ----------------------------------------------------------------------------
create or replace function hc.finalize_scan(
  p_arrival uuid, p_lease uuid, p_verdict text, p_detail jsonb default '{}'::jsonb)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare
  v hc.advance_result;
  v_to hc.arrival_state;
  v_reason text;
  v_circle uuid;
  v_sha bytea;
  v_detail jsonb := coalesce(p_detail, '{}'::jsonb);
begin
  if p_verdict is null
     or p_verdict not in ('clean', 'infected', 'unavailable', 'inconclusive')
     or length(v_detail::text) > 16384 then
    raise exception 'scan_invalid' using errcode = 'P0001';
  end if;

  select case p_verdict when 'clean'        then 'scanned'::hc.arrival_state
                        when 'infected'     then 'quarantined'::hc.arrival_state
                        when 'unavailable'  then 'scan_unavailable'::hc.arrival_state
                        else 'scan_inconclusive'::hc.arrival_state end,
         case p_verdict when 'infected'     then 'scan_infected'
                        when 'unavailable'  then 'scan_provider_unavailable'
                        when 'inconclusive' then 'scan_inconclusive'
                        else null end
    into v_to, v_reason;

  -- §4.7 point 1, in this transaction: a CLEAN second copy is a
  -- question for a person, not a fact for the pipeline.
  select a.circle_id, a.content_sha256 into v_circle, v_sha
  from public.arrivals a where a.id = p_arrival;
  if p_verdict = 'clean' and v_sha is not null
     and hc.detect_duplicate(p_arrival, v_circle, v_sha) is not null then
    v_to := 'duplicate_suspected'::hc.arrival_state;
    v_reason := 'duplicate_sha256';
  end if;

  v := hc.advance_arrival(p_arrival, 'stored', v_to, p_lease, v_reason);
  if v <> 'advanced' then
    return v;
  end if;

  update public.arrivals
     set scan_verdict = p_verdict, scan_at = now()
   where id = p_arrival
  returning content_sha256 into v_sha;

  if p_verdict in ('clean', 'infected') and v_sha is not null then
    insert into public.scan_results (content_sha256, verdict, detail, scanned_at, expires_at)
    values (v_sha, p_verdict, v_detail, now(),
            case when p_verdict = 'clean' then now() + interval '7 days' end)
    on conflict (content_sha256) do update
      set verdict = excluded.verdict, detail = excluded.detail,
          scanned_at = excluded.scanned_at, expires_at = excluded.expires_at
      -- X1: safety-monotonic — an existing infected row is immutable
      -- against clean; only an infected verdict may touch it.
      where public.scan_results.verdict <> 'infected'
         or excluded.verdict = 'infected';
  end if;

  return 'advanced'::hc.advance_result;
end $$;

-- ownership and grants restated for the replaced object.
alter function hc.finalize_scan(uuid, uuid, text, jsonb) owner to hc_internal;
revoke execute on function hc.finalize_scan(uuid, uuid, text, jsonb)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_scan(uuid, uuid, text, jsonb) to hc_pipeline;
