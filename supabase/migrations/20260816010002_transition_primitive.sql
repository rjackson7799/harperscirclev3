-- ============================================================================
-- 1C · M2 — the transition primitive (TSD §4.2) and intake (§4.1).
--
-- hc.advance_result is created with §4.2's six labels VERBATIM. The claim
-- vocabulary ('claimed', 'exhausted') arrives in M3 as the first
-- ALTER TYPE … ADD VALUE migration, and is first USED in M4 — the 55P04
-- migration-authoring rule (ADR-0002 note 5, ADR-0003 f7) made concrete.
--
-- hc.advance_arrival is the §4.2 body with one addition, recorded in
-- ADR-0007: the R-rule (ADR-0006 annex A4) extends to pipeline writers —
-- the per-circle taint lock is taken before the row lock, so the freeze
-- predicate evaluates under the serialization point against re-read rows.
-- A freeze committing while a worker waits on the lock defeats the worker.
--
-- hc.create_arrival owns the P5 intake caps (ADR-0006 P5: "1C's intake
-- owns payload size/shape caps"): PRD §13.3 bounds checked before any
-- write, normalized refusal 'arrival_invalid'. Intake is idempotent on
-- (circle, ingest_idempotency_key) — a re-delivered webhook returns the
-- existing arrival. Intake is NOT freeze-gated: mail is accepted and
-- stored under a freeze (PRD §7.5); parking happens at claim/advance.
--
-- 'manual' is refused here: a synthetic arrival exists ONLY inside
-- hc.create_manual_proposal's transaction (MNL-01, ADR-0006 Q12; M6).
-- ============================================================================

create type hc.advance_result as enum
  ('advanced','already_advanced','cancelled','frozen','invalid_state','stale_lease');

-- §3.10: the pipeline boundary opens exactly here — workers may RESOLVE
-- names in hc (they hold EXECUTE only on the individually granted entry
-- points; the 1A deny-by-default function ACLs cover everything else).
-- hc_admin keeps no usage on hc (002:9).
grant usage on schema hc to hc_pipeline;

-- ----------------------------------------------------------------------------
-- The freeze predicate, §3.8 / FRZ-14 shape: open covers the whole circle;
-- unresolved covers its named subject, or the whole circle if unnarrowed.
-- Plain function — runs as hc_internal inside the definers (freezes_internal
-- policy), never callable from a request path.
-- ----------------------------------------------------------------------------
create function hc.circle_frozen(p_circle uuid, p_subject uuid)
returns boolean language sql stable
set search_path = ''
as $$
  select exists (select 1 from public.freezes f
                 where f.circle_id = p_circle
                   and (f.state = 'open'
                        or (f.state = 'unresolved'
                            and (f.subject_id is null or f.subject_id = p_subject))));
$$;
alter function hc.circle_frozen(uuid, uuid) owner to hc_internal;
revoke execute on function hc.circle_frozen(uuid, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- The states a WORKER owes progress in. Human-wait states (proposals_ready,
-- held_unknown_sender, needs_password, duplicate_suspected) and terminals
-- are not here — the sweeper's stuck-report and the freeze outbox both key
-- on this list (§4.11, §4.2).
create function hc.pipeline_worker_states()
returns hc.arrival_state[] language sql immutable parallel safe
as $$
  select array['received','stored','scanning','scanned',
               'extracting','extracted','interpreting']::hc.arrival_state[];
$$;
alter function hc.pipeline_worker_states() owner to hc_internal;
revoke execute on function hc.pipeline_worker_states()
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- §4.2, verbatim mechanics: row lock → fence FIRST → enumerated diagnosis →
-- swap + unconditional event insert from already-bound values.
-- ----------------------------------------------------------------------------
create function hc.advance_arrival(
  p_arrival uuid, p_from hc.arrival_state, p_to hc.arrival_state,
  p_lease uuid, p_reason text default null)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare v_state hc.arrival_state; v_frozen boolean;
        v_circle uuid; v_current uuid; v_attempt int;
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
  -- here before the worker that superseded it. Validated, not merely joined.
  select l.attempt_no into v_attempt
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

alter function hc.advance_arrival(uuid, hc.arrival_state, hc.arrival_state, uuid, text)
  owner to hc_internal;
revoke execute on function hc.advance_arrival(uuid, hc.arrival_state, hc.arrival_state, uuid, text)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.advance_arrival(uuid, hc.arrival_state, hc.arrival_state, uuid, text)
  to hc_pipeline;

-- ----------------------------------------------------------------------------
-- §4.1 intake: an adapter turns a channel-specific payload into an arrivals
-- row; every stage after that is channel-blind.
-- ----------------------------------------------------------------------------
create function hc.create_arrival(
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
declare v_id uuid; v_pcircle uuid; v_psubject uuid;
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

  -- Idempotent intake: a re-delivered webhook returns the existing arrival.
  if p_ingest_idempotency_key is not null then
    select a.id into v_id from public.arrivals a
     where a.circle_id = p_circle_id
       and a.ingest_idempotency_key = p_ingest_idempotency_key;
    if v_id is not null then return v_id; end if;
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
    -- two concurrent intakes of one key: the loser returns the winner's row
    select a.id into v_id from public.arrivals a
     where a.circle_id = p_circle_id
       and a.ingest_idempotency_key = p_ingest_idempotency_key;
    return v_id;
  end;

  insert into public.arrival_events (arrival_id, circle_id, to_state, attempt)
  values (v_id, p_circle_id, 'received', 1);

  return v_id;
end $$;

alter function hc.create_arrival(uuid, uuid, text, uuid, text, text, text, text,
                                 jsonb, text, bigint, int, text)
  owner to hc_internal;
revoke execute on function hc.create_arrival(uuid, uuid, text, uuid, text, text, text, text,
                                             jsonb, text, bigint, int, text)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.create_arrival(uuid, uuid, text, uuid, text, text, text, text,
                                            jsonb, text, bigint, int, text)
  to hc_pipeline;

-- ----------------------------------------------------------------------------
-- The sender gate's question (§4.3, AC-INBOX-7). Address or domain, case-
-- blind via citext, live rows only. sender_display_name is stored and NEVER
-- matched on (PRD §4.2.8).
-- ----------------------------------------------------------------------------
create function hc.sender_recognised(p_arrival uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  -- lower(text) rather than citext '=': with search_path = '' the citext
  -- operator (schema extensions) does not resolve, and PG's text fallback
  -- would compare case-SENSITIVELY — a silent gate-narrowing defect.
  select exists (
    select 1
    from public.arrivals a
    join public.known_senders k
      on k.circle_id = a.circle_id and k.revoked_at is null
    where a.id = p_arrival
      and a.sender_address is not null
      and (lower(k.address::text) = lower(a.sender_address::text)
           or (k.domain is not null
               and lower(k.domain::text) = lower(split_part(a.sender_address::text, '@', 2)))));
$$;

alter function hc.sender_recognised(uuid) owner to hc_internal;
revoke execute on function hc.sender_recognised(uuid)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.sender_recognised(uuid) to hc_pipeline;
