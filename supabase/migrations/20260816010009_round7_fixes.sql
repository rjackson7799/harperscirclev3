-- ============================================================================
-- 1C · M9 — round-7 disposition fixes (ADR-0008; the round-6 M12 precedent:
-- one forward migration, disposition-driven, advisory-exempt under the Q8
-- plan-time bound per ADR-0006 Q8/P3).
--
-- B1 · hc.arrival_transitions: the §4.3 stage-exit graph as DATA — a
--      closed, seeded, append-by-migration allowlist. hc.advance_arrival
--      now requires the requested (from, to) edge to exist AND to belong
--      to the fenced lease's stage: a valid store lease can no longer
--      perform received → proposals_ready. Violations return
--      invalid_state — §4.2's defect signal (ack, raise, never retry).
--      §4.7's duplicate-detection edges and the duplicate-resolution /
--      held-mail-release re-entries append WITH their machinery (2+);
--      seeding them now would be rows nothing can exercise.
--
-- B2 · hc.sweeper_pass step 2: the candidate list is a stale HINT by
--      design; under the per-circle lock the sweeper now takes the row
--      lock and re-derives EVERYTHING from the row the write will touch —
--      state (so a cancellation, finalization or claim-exhaust committed
--      mid-wait defeats terminalization), stage (from the LIVE state),
--      live lease, freeze, deleted_at, spent budget — then updates
--      conditionally on the re-read state. Steps 3–5 stay read-only
--      advisory listings: hc.claim_stage is the authoritative gate that
--      revalidates every re-queue hint at claim time.
--
-- B3 · The outbox handoff contract is CLAIM/ACK AT-LEAST-ONCE — the
--      "exactly-once" description is withdrawn (TSD annex A6). drained_at
--      is the CLAIM timestamp; an unacked claim re-delivers after a 300 s
--      window (a relay crash between drain-commit and enqueue can delay a
--      row, never lose it); hc.outbox_ack closes delivery; duplicate
--      deliveries are absorbed downstream (claim_stage's already_advanced
--      / stale_lease). The ordinary sweeper remains the backstop.
--
-- F5 · hc.create_arrival replays a key ONLY for the same request:
--      subject, channel, parent, message id and sender (case-blind citext
--      semantics via lower()) must agree with the stored row — in the
--      fast path AND the concurrent unique_violation path. Disagreement
--      raises the normalized 'idempotency_conflict', writing nothing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B1 · The transition graph as data (the hc.stage_budgets pattern:
-- hc schema, seeded, append-by-migration, unexposed per PIN-01).
-- ----------------------------------------------------------------------------
create table hc.arrival_transitions (
  stage      text not null references hc.stage_budgets(stage),
  from_state hc.arrival_state not null,
  to_state   hc.arrival_state not null,
  primary key (stage, from_state, to_state)
);

insert into hc.arrival_transitions (stage, from_state, to_state) values
  ('store',     'received',     'stored'),
  ('store',     'received',     'store_failed'),
  ('scan',      'stored',       'scanned'),
  ('scan',      'stored',       'quarantined'),
  ('scan',      'stored',       'scan_unavailable'),
  ('scan',      'stored',       'scan_inconclusive'),
  ('gate',      'scanned',      'extracting'),
  ('gate',      'scanned',      'held_unknown_sender'),
  ('extract',   'extracting',   'extracted'),
  ('extract',   'extracting',   'extract_failed'),
  ('extract',   'extracting',   'extract_timeout'),
  ('extract',   'extracting',   'needs_password'),
  ('extract',   'extracting',   'unsupported_type'),
  ('interpret', 'interpreting', 'proposals_ready');

revoke all on hc.arrival_transitions from anon, authenticated, hc_pipeline, hc_admin;
grant select on hc.arrival_transitions to hc_internal;

-- ----------------------------------------------------------------------------
-- B1 · hc.advance_arrival: body as M2 with ONE addition — the fence also
-- binds the lease's stage, and the requested edge must be that stage's row
-- in the allowlist. Check order preserved: cancelled → fence → frozen →
-- already_advanced → state → GRAPH → swap.
-- ----------------------------------------------------------------------------
create or replace function hc.advance_arrival(
  p_arrival uuid, p_from hc.arrival_state, p_to hc.arrival_state,
  p_lease uuid, p_reason text default null)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare v_state hc.arrival_state; v_frozen boolean;
        v_circle uuid; v_current uuid; v_attempt int; v_stage text;
begin
  -- R-rule: discovery for the lock key (an arrival never changes circles),
  -- then the per-circle lock BEFORE the row lock (ADR-0007).
  select a.circle_id into v_circle from public.arrivals a where a.id = p_arrival;
  if v_circle is not null then
    perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));
  end if;

  -- Row lock, so the diagnosis, the fence and the swap see the same row —
  -- and the freeze predicate evaluates under the serialization point.
  select a.state, a.circle_id, a.current_lease_id,
         hc.circle_frozen(a.circle_id, a.subject_id)
    into v_state, v_circle, v_current, v_frozen
    from public.arrivals a where a.id = p_arrival for update;

  -- Cancellation outranks the fence (recorded reorder, ADR-0007): the §4.5
  -- cancel path closes the worker's lease, so fence-first would report the
  -- weaker stale_lease and the worker would miss the GC-your-staged-
  -- artifacts signal. Both mean discard-and-ack; 'cancelled' says why.
  if v_state = 'cancelled'                     then return 'cancelled'::hc.advance_result;        end if;

  -- FENCE. A worker past its deadline must lose even if it arrives
  -- here before the worker that superseded it. Validated, not merely
  -- joined — and the lease's STAGE is bound here for the graph check.
  select l.attempt_no, l.stage into v_attempt, v_stage
    from public.pipeline_leases l
   where l.id = p_lease
     and l.id = v_current              -- is the current attempt for this arrival
     and l.arrival_id = p_arrival      -- belongs to THIS arrival
     and l.closed_at is null           -- still open
     and l.deadline > now();           -- not expired
  if v_attempt is null then return 'stale_lease'::hc.advance_result; end if;

  -- A frozen record accepts and stores mail but does not process it
  -- (PRD §7.5). One choke point, so no stage can forget — and the arrival
  -- is PARKED, not failed: the terminal transition is refused too.
  if v_frozen and p_to not in ('stored','store_failed') then return 'frozen'::hc.advance_result; end if;
  if v_state = p_to                            then return 'already_advanced'::hc.advance_result; end if;
  if v_state <> p_from                         then return 'invalid_state'::hc.advance_result;    end if;

  -- Round-7 B1: the graph is CLOSED and the fenced lease's stage must
  -- authorize the requested edge — a fenced state setter becomes an
  -- enforced state machine. A violation is §4.2's defect signal.
  if not exists (select 1 from hc.arrival_transitions t
                 where t.stage = v_stage
                   and t.from_state = p_from
                   and t.to_state = p_to) then
    return 'invalid_state'::hc.advance_result;
  end if;

  update public.arrivals set state = p_to where id = p_arrival;

  -- Unconditional: v_circle and v_attempt are already bound, so this cannot
  -- silently write zero rows while the state change stands.
  insert into public.arrival_events(arrival_id, circle_id, from_state, to_state,
                                    reason_code, attempt)
  values (p_arrival, v_circle, p_from, p_to, p_reason, v_attempt);

  update public.pipeline_leases set closed_at = now(), outcome = 'advanced'
   where id = p_lease;

  return 'advanced'::hc.advance_result;
end $$;

-- ----------------------------------------------------------------------------
-- B2 · hc.sweeper_pass: step 2 re-validates under the lock; steps 1, 3–5
-- as M8.
-- ----------------------------------------------------------------------------
create or replace function hc.sweeper_pass()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_expired    int;
  v_term       jsonb := '[]'::jsonb;
  v_requeue    jsonb;
  v_stuck      jsonb;
  v_alert      boolean;
  v_spent      int;
  v_state      hc.arrival_state;
  v_subject    uuid;
  v_deleted    timestamptz;
  v_stage      text;
  v_max        int;
  v_exh_state  hc.arrival_state;
  v_exh_reason text;
  r record;
begin
  -- 1 · expiry transfers ownership; 'expired' is a dead worker, not a slow one
  with e as (
    update public.pipeline_leases
       set outcome = 'expired', closed_at = now()
     where closed_at is null and deadline <= now()
    returning 1)
  select count(*)::int into v_expired from e;

  -- 2 · budget-spent unfrozen arrivals reach their terminal state with the
  --     stated reason. Round-7 B2: the candidate list is a stale HINT by
  --     design — under the per-circle lock (acquired in circle order, so
  --     acquisition stays acyclic) the row is LOCKED and every predicate
  --     re-derived from it: state, stage-from-live-state, live lease,
  --     freeze, deletion, spent budget. A cancellation, finalization,
  --     claim-exhaust or freeze committed mid-wait therefore defeats the
  --     terminalization, and the event's from_state is always the LIVE
  --     prior state.
  for r in
    select a.id, a.circle_id
      from public.arrivals a
     where a.deleted_at is null
       and a.state = any (hc.pipeline_worker_states())
       and not exists (select 1 from public.pipeline_leases l
                       where l.arrival_id = a.id
                         and l.closed_at is null and l.deadline > now())
     order by a.circle_id, a.id
  loop
    perform pg_advisory_xact_lock(hashtext('taint:' || r.circle_id::text));
    select a.state, a.subject_id, a.deleted_at
      into v_state, v_subject, v_deleted
      from public.arrivals a where a.id = r.id for update;
    if v_state is null or v_deleted is not null
       or not (v_state = any (hc.pipeline_worker_states())) then
      continue;  -- cancelled, finalized, terminalized or purged mid-wait
    end if;
    select b.stage, b.max_attempts, b.exhaust_state, b.exhaust_reason
      into v_stage, v_max, v_exh_state, v_exh_reason
      from hc.stage_budgets b
     where v_state = b.entry_state or v_state = b.inflight_state;
    if v_stage is null then continue; end if;
    if hc.circle_frozen(r.circle_id, v_subject) then
      continue;  -- FRZ-15: parked work is skipped for age exhaustion
    end if;
    if exists (select 1 from public.pipeline_leases l
               where l.arrival_id = r.id
                 and l.closed_at is null and l.deadline > now()) then
      continue;  -- claimed mid-wait: a live attempt owns the arrival again
    end if;
    select coalesce(max(l.attempt_no), 0) into v_spent
      from public.pipeline_leases l
     where l.arrival_id = r.id and l.stage = v_stage;
    if v_spent >= v_max then
      update public.arrivals set state = v_exh_state
       where id = r.id and state = v_state;   -- conditional on the re-read
      insert into public.arrival_events (arrival_id, circle_id, from_state, to_state,
                                         reason_code, attempt)
      values (r.id, r.circle_id, v_state, v_exh_state, v_exh_reason, v_spent);
      v_term := v_term || jsonb_build_object('arrival_id', r.id,
                                             'state', v_exh_state::text);
    end if;
  end loop;

  -- 3 · re-queueable: worker state, no live lease, budget remaining,
  --     not frozen (FRZ-15: skipped for re-queueing too). Steps 3–5 are
  --     read-only ADVISORY listings (ADR-0008): every hint is revalidated
  --     by hc.claim_stage — the authoritative gate — at claim time.
  select coalesce(jsonb_agg(jsonb_build_object('arrival_id', x.id, 'stage', x.stage)
                            order by x.id), '[]'::jsonb)
    into v_requeue
    from (select a.id, a.circle_id, a.subject_id, b.stage
            from public.arrivals a
            join hc.stage_budgets b
              on (a.state = b.entry_state or a.state = b.inflight_state)
           where a.deleted_at is null
             and a.state = any (hc.pipeline_worker_states())
             and not exists (select 1 from public.pipeline_leases l
                             where l.arrival_id = a.id
                               and l.closed_at is null and l.deadline > now())
             and (select coalesce(max(l.attempt_no), 0)
                    from public.pipeline_leases l
                   where l.arrival_id = a.id and l.stage = b.stage) < b.max_attempts) x
   where not hc.circle_frozen(x.circle_id, x.subject_id);

  -- 4 · stuck > 24 h since the LAST transition: a defect signal, not
  --     routine cleanup. Human-wait states are not in worker_states;
  --     parked work is excluded explicitly.
  select coalesce(jsonb_agg(to_jsonb(y.id::text) order by y.id), '[]'::jsonb)
    into v_stuck
    from (select a.id, a.circle_id, a.subject_id
            from public.arrivals a
           where a.deleted_at is null
             and a.state = any (hc.pipeline_worker_states())
             and coalesce((select max(e.occurred_at) from public.arrival_events e
                           where e.arrival_id = a.id),
                          a.received_at) < now() - interval '24 hours') y
   where not hc.circle_frozen(y.circle_id, y.subject_id);

  -- 5 · queue age over 4 h, parked excluded (PRD §13.1's honesty bound)
  select exists (
    select 1 from public.arrivals a
     where a.deleted_at is null
       and a.state = any (hc.pipeline_worker_states())
       and a.received_at < now() - interval '4 hours'
       and not hc.circle_frozen(a.circle_id, a.subject_id))
    into v_alert;

  return jsonb_build_object(
    'expired_leases', v_expired,
    'terminalized',   v_term,
    'requeue',        v_requeue,
    'stuck',          v_stuck,
    'queue_age_alert', v_alert);
end $$;

-- ----------------------------------------------------------------------------
-- B3 · The outbox contract: claim/ack at-least-once. drained_at becomes
-- the CLAIM timestamp (name kept — 019/026 pins and the M8 rows stay
-- valid); acked_at closes delivery; a 300 s window makes a dead relay's
-- claims reclaimable.
-- ----------------------------------------------------------------------------
alter table public.pipeline_outbox add column acked_at timestamptz;

drop index public.outbox_undrained;
create index outbox_unacked on public.pipeline_outbox (created_at)
  where acked_at is null;

create or replace function hc.outbox_drain(p_limit int default 100)
returns table (outbox_id uuid, arrival_id uuid, stage text)
language plpgsql security definer
set search_path = ''
as $$
begin
  -- CLAIM, not consume (round-7 B3): unacked rows whose claim window
  -- lapsed re-deliver — a relay crash between this commit and the queue
  -- enqueue delays the row, never loses it. Stage is derived from the
  -- arrival's CURRENT state at claim time (the message may be old; the
  -- state is not).
  return query
  with picked as (
    select o.id
      from public.pipeline_outbox o
     where o.acked_at is null
       and (o.drained_at is null
            or o.drained_at < now() - interval '300 seconds')
     order by o.created_at
     limit greatest(coalesce(p_limit, 100), 1)
       for update skip locked
  ), marked as (
    update public.pipeline_outbox o
       set drained_at = now()
      from picked p
     where o.id = p.id
    returning o.id, o.arrival_id
  )
  select m.id, m.arrival_id,
         (select b.stage from hc.stage_budgets b, public.arrivals a
           where a.id = m.arrival_id
             and (a.state = b.entry_state or a.state = b.inflight_state))
    from marked m;
end $$;

-- Acknowledgment closes delivery; it binds to a CLAIM (an unclaimed row
-- acks 0 — an ack without a drain is a relay bug, surfaced by the count).
create function hc.outbox_ack(p_outbox_ids uuid[])
returns int language plpgsql security definer
set search_path = ''
as $$
declare v int;
begin
  update public.pipeline_outbox
     set acked_at = now()
   where id = any (coalesce(p_outbox_ids, '{}'::uuid[]))
     and acked_at is null
     and drained_at is not null;
  get diagnostics v = row_count;
  return v;
end $$;

alter function hc.outbox_ack(uuid[]) owner to hc_internal;
revoke execute on function hc.outbox_ack(uuid[])
  from public, anon, authenticated, hc_admin;
grant execute on function hc.outbox_ack(uuid[]) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- F5 · hc.create_arrival: body as M2 with the identity check in BOTH
-- idempotency paths.
-- ----------------------------------------------------------------------------
create or replace function hc.create_arrival(
  p_circle_id uuid, p_subject_id uuid, p_channel text,
  p_parent_arrival_id uuid default null,
  p_sender_address text default null, p_sender_display_name text default null,
  p_message_id text default null, p_auth_result text default null,
  p_auth_detail jsonb default null, p_mime_declared text default null,
  p_byte_size bigint default null, p_page_count int default null,
  p_ingest_idempotency_key text default null)
returns uuid language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid; v_pcircle uuid; v_psubject uuid; v_conflict boolean;
begin
  if p_channel not in ('upload','email')
     or (p_auth_result is not null
         and p_auth_result not in ('authenticated','unauthenticated','lookalike')) then
    raise exception 'arrival_invalid' using errcode = 'P0001';
  end if;

  -- P5 intake caps (PRD §13.3; ADR-0006 P5): bounds checked before any write.
  if coalesce(p_byte_size, 0) not between 0 and 52428800
     or coalesce(p_page_count, 0) not between 0 and 200
     or length(coalesce(p_ingest_idempotency_key, '')) > 200
     or length(coalesce(p_sender_address, '')) > 320
     or length(coalesce(p_sender_display_name, '')) > 500
     or length(coalesce(p_message_id, '')) > 998
     or length(coalesce(p_mime_declared, '')) > 255
     or pg_column_size(coalesce(p_auth_detail, '{}'::jsonb)) > 16384 then
    raise exception 'arrival_invalid' using errcode = 'P0001';
  end if;

  -- Idempotent intake WITH identity (round-7 F5): the prior id replays
  -- ONLY for the same request — subject, channel, parent, message id and
  -- sender (case-blind; lower() because the citext operator does not
  -- resolve under search_path = '') must agree. Disagreement is the
  -- normalized conflict, and nothing is written.
  if p_ingest_idempotency_key is not null then
    select a.id,
           (a.subject_id is distinct from p_subject_id
            or a.channel is distinct from p_channel
            or a.parent_arrival_id is distinct from p_parent_arrival_id
            or a.message_id is distinct from p_message_id
            or lower(coalesce(a.sender_address::text, ''))
               is distinct from lower(coalesce(p_sender_address, '')))
      into v_id, v_conflict
      from public.arrivals a
     where a.circle_id = p_circle_id
       and a.ingest_idempotency_key = p_ingest_idempotency_key;
    if v_id is not null then
      if v_conflict then
        raise exception 'idempotency_conflict' using errcode = 'P0001';
      end if;
      return v_id;
    end if;
  end if;

  -- §4.6: children inherit circle AND subject from their parent.
  if p_parent_arrival_id is not null then
    select a.circle_id, a.subject_id into v_pcircle, v_psubject
      from public.arrivals a where a.id = p_parent_arrival_id;
    if v_pcircle is distinct from p_circle_id
       or v_psubject is distinct from p_subject_id then
      raise exception 'arrival_invalid' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.arrivals
      (circle_id, subject_id, parent_arrival_id, channel, sender_address,
       sender_display_name, message_id, auth_result, auth_detail, mime_declared,
       byte_size, page_count, ingest_idempotency_key)
    values
      (p_circle_id, p_subject_id, p_parent_arrival_id, p_channel,
       p_sender_address::extensions.citext, p_sender_display_name, p_message_id,
       p_auth_result, p_auth_detail, p_mime_declared,
       p_byte_size, p_page_count, p_ingest_idempotency_key)
    returning id into v_id;
  exception when unique_violation then
    -- two concurrent intakes of one key: the loser replays the winner's
    -- row ONLY when the request identity matches (round-7 F5).
    select a.id,
           (a.subject_id is distinct from p_subject_id
            or a.channel is distinct from p_channel
            or a.parent_arrival_id is distinct from p_parent_arrival_id
            or a.message_id is distinct from p_message_id
            or lower(coalesce(a.sender_address::text, ''))
               is distinct from lower(coalesce(p_sender_address, '')))
      into v_id, v_conflict
      from public.arrivals a
     where a.circle_id = p_circle_id
       and a.ingest_idempotency_key = p_ingest_idempotency_key;
    if v_id is not null and v_conflict then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return v_id;
  end;

  insert into public.arrival_events (arrival_id, circle_id, to_state, attempt)
  values (v_id, p_circle_id, 'received', 1);

  return v_id;
end $$;
