-- ============================================================================
-- 4A · M4 — PST-01: the product-facing state (slice-4 plan M4; TSD §4.4;
-- PRD §4.2.2; the A.4 parent-rollup existence oracle; pgTAP 046 pinned
-- every shape red-first).
--
-- hc.state_rank orders the 21 internal states by PROGRESS, ascending —
-- the rollup's "least-advanced" is min(rank). The rule inside the order:
-- at each pipeline phase, STUCK states (failed, held, waiting on a
-- person) rank below that phase's MOVING states — a family scanning the
-- inbox list should see the child that is furthest behind, and stuck-at-
-- a-point is behind moving-past-it. Ranks are distinct so the choice is
-- total; a 22nd enum value without a rank fails the 046 suite (the
-- all_domains precedent).
--
-- hc.state_label is PRD §4.2.2's vocabulary verbatim — fifteen product
-- strings over the 21 internal states (Checking ×3, Reading ×3,
-- Couldn't read it ×2, Held · we couldn't check it ×2). 'received' maps
-- to 'Checking' (accepted, not yet cleared, not yet renderable — the
-- honest pre-clearance label); recorded as-built in ADR-0017 against
-- §13.1's looser "shows as Arrived" prose.
--
-- hc.product_state: leaf = pure mapping; parent = least-advanced LIVE
-- child, where live = not deleted AND not cancelled (a member's
-- deliberate stop must not drag filed siblings to "Cancelled"); no live
-- children ⇒ the parent's own state. A.4: the rollup runs over the
-- CALLER's visible children only. DEF-10: nonexistent, unauthorized,
-- below-cliff and deleted all land in ONE refusal shape.
-- ============================================================================

create function hc.state_rank(p hc.arrival_state) returns int
language sql immutable parallel safe as $$
  select case p
    when 'store_failed'        then 1
    when 'received'            then 2
    when 'quarantined'         then 3
    when 'scan_unavailable'    then 4
    when 'scan_inconclusive'   then 5
    when 'stored'              then 6
    when 'scanning'            then 7
    when 'held_unknown_sender' then 8
    when 'scanned'             then 9
    when 'unsupported_type'    then 10
    when 'needs_password'      then 11
    when 'extract_timeout'     then 12
    when 'extract_failed'      then 13
    when 'duplicate_suspected' then 14
    when 'extracting'          then 15
    when 'extracted'           then 16
    when 'interpreting'        then 17
    when 'proposals_ready'     then 18
    when 'nothing_filed'       then 19
    when 'filed'               then 20
    when 'cancelled'           then 21
  end;
$$;

create function hc.state_label(p hc.arrival_state) returns text
language sql immutable parallel safe as $$
  select case p
    when 'received'            then 'Checking'
    when 'stored'              then 'Checking'
    when 'scanning'            then 'Checking'
    when 'store_failed'        then 'Couldn''t store it'
    when 'quarantined'         then 'Held · not safe to open'
    when 'scan_unavailable'    then 'Held · we couldn''t check it'
    when 'scan_inconclusive'   then 'Held · we couldn''t check it'
    when 'scanned'             then 'Arrived'
    when 'held_unknown_sender' then 'Held · unknown sender'
    when 'unsupported_type'    then 'Unsupported file'
    when 'needs_password'      then 'Needs a password'
    when 'extract_timeout'     then 'Couldn''t read it'
    when 'extract_failed'      then 'Couldn''t read it'
    when 'duplicate_suspected' then 'Looks like a duplicate'
    when 'extracting'          then 'Reading'
    when 'extracted'           then 'Reading'
    when 'interpreting'        then 'Reading'
    when 'proposals_ready'     then 'Needs you'
    when 'nothing_filed'       then 'Nothing filed'
    when 'filed'               then 'Filed'
    when 'cancelled'           then 'Cancelled'
  end;
$$;

create function hc.product_state(p_arrival uuid) returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ctx     jsonb;
  v_subject uuid;
  v_state   hc.arrival_state;
  v_label   text;
begin
  select a.subject_id, a.state into v_subject, v_state
  from public.arrivals a
  where a.id = p_arrival and a.deleted_at is null;

  -- DEF-10: nonexistent, deleted, unauthorized and below-cliff are ONE
  -- shape. The read authorizes exactly as ING-02 does — summary over the
  -- fail-closed all-domain taint.
  v_ctx := hc.ctx();
  if v_subject is null
     or hc.visible_at(v_ctx, v_subject, hc.all_domains(), true,
                      'arrival', p_arrival, null) < 'summary' then
    raise exception 'product_state_refused' using errcode = 'P0001';
  end if;

  -- The parent rollup: least-advanced LIVE child, over the CALLER's
  -- visible children only (A.4 — an invisible child must not steer what
  -- this caller reads).
  select hc.state_label(c.state) into v_label
  from public.arrivals c
  where c.parent_arrival_id = p_arrival
    and c.deleted_at is null
    and c.state <> 'cancelled'
    and hc.visible_at(v_ctx, c.subject_id, hc.all_domains(), true,
                      'arrival', c.id, null) >= 'summary'
  order by hc.state_rank(c.state)
  limit 1;

  return coalesce(v_label, hc.state_label(v_state));
end $$;

alter function hc.state_rank(hc.arrival_state)  owner to hc_internal;
alter function hc.state_label(hc.arrival_state) owner to hc_internal;
alter function hc.product_state(uuid)           owner to hc_internal;

revoke execute on function hc.state_rank(hc.arrival_state)
  from public, anon, hc_pipeline, hc_admin;
revoke execute on function hc.state_label(hc.arrival_state)
  from public, anon, hc_pipeline, hc_admin;
revoke execute on function hc.product_state(uuid)
  from public, anon, hc_pipeline, hc_admin;

-- The family's vocabulary: authenticated reads it (the dom/all_domains
-- pure-function precedent for rank/label; product_state authorizes
-- in-function).
grant execute on function hc.state_rank(hc.arrival_state)  to authenticated;
grant execute on function hc.state_label(hc.arrival_state) to authenticated;
grant execute on function hc.product_state(uuid)           to authenticated;
