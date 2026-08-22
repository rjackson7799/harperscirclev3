-- ============================================================================
-- 5A · M3 — extraction_runs: the §4.3/§6.4 run-versioning contract made
-- structural (docs/review/slice-5-plan.md M3; review finding 2's settled
-- durable-recording point; TSD §4.3, §6.4, §6.8; PRD §10.4).
--
-- THE CONTRACT:
--   · The run row is INSERTED IN THE CLAIM TRANSACTION — claim-before-
--     work extended to accounting. hc.claim_stage gains the model/prompt
--     pair (required for 'extract' claims, refused for every other
--     stage) and inserts the run with the lease, atomically: a timeout,
--     kill, render failure or provider error can never consume a lease
--     without its run row existing.
--   · The outcome CLOSES WITH THE LEASE — structurally, via a trigger on
--     pipeline_leases, so EVERY closer present and future participates:
--     finalize's CAS ('advanced' → 'published' on extracted, otherwise
--     'terminalized' with the transition's §6.8 reason), cancel
--     ('cancelled'), claim-path expiry and sweeper expiry ('expired' →
--     'abandoned'). No open run outlives its lease.
--   · A run row exists even when zero facts land — refusals and
--     failures are countable per class (PRD §10.4) from
--     (outcome, reason_code).
--   · SUPERSEDE-NOT-APPEND at hc.write_extractions: publication marks
--     the arrival's prior live facts superseded in the same transaction
--     — a retry cannot double a fact. Rows carry run_id (provenance
--     survives supersession) and a fact whose model_id/prompt_version
--     differs from its run's stamps is refused — the recorded
--     configuration is the identity.
--
-- PROMPT_VERSION SEMANTICS — pinned here as the plan settles them:
-- prompt_version names the FULL inference-and-rendering configuration —
-- the output schema, effort/token parameters, and the §6.3 render rules.
-- A change to ANY covered input bumps it. The B9 eval manifest stores
-- the complete configuration hash; the public identity is the
-- (model_id, prompt_version) pair — §6.10's normative key, kept. A
-- production fact therefore traces through its run to the eval run that
-- calibrated its field.
--
-- Interpret deliberately records NO run here: §4.3 gives interpret its
-- own idempotency (proposals carry version + supersedes_id; a
-- re-interpret supersedes pending ones) — one mechanism per stage, not
-- two half-mechanisms.
--
-- Reason codes: 'provider_refusal' joins §6.8's honest exits
-- ('provider_error', 'provider_timeout', 'encrypted_pdf',
-- 'unsupported_mime' and 'extract_budget_exhausted' already shipped).
-- No transition-graph or enum change: the extract edges shipped at 1C —
-- ING-10's 18-row pin stands untouched.
-- ============================================================================

insert into hc.reason_codes (code, description) values
  ('provider_refusal', 'The provider declined the request (stop_reason refusal — §6.8); an honest terminal, never "unsafe" copy');

-- ----------------------------------------------------------------------------
-- The table. §4.3's idempotency identity is the first unique constraint;
-- lease-binding the second; unique (circle_id, id) is §2.1's circle-
-- consistent FK target (extractions.run_id points here). The lease FK is
-- the circle-consistent composite, so pipeline_leases gains the §2.1
-- target it never needed before (a column-set append; the shipped
-- migration is not edited). outcome/closed_at travel together.
-- ----------------------------------------------------------------------------
alter table public.pipeline_leases add unique (circle_id, id);

create table public.extraction_runs (
  id             uuid primary key default gen_random_uuid(),
  arrival_id     uuid not null,
  circle_id      uuid not null references public.circles(id),
  lease_id       uuid not null unique,
  attempt_no     int  not null,
  model_id       text not null,
  prompt_version text not null,
  started_at     timestamptz not null default now(),
  outcome        text check (outcome in ('published','terminalized','abandoned',
                                         'cancelled','failed','frozen')),
  reason_code    text references hc.reason_codes(code),
  closed_at      timestamptz,
  check ((outcome is null) = (closed_at is null)),
  unique (arrival_id, model_id, prompt_version, attempt_no),
  unique (circle_id, id),
  foreign key (circle_id, arrival_id) references public.arrivals (circle_id, id) on delete cascade,
  foreign key (circle_id, lease_id) references public.pipeline_leases (circle_id, id) on delete cascade
);
create index extraction_runs_by_circle on public.extraction_runs (circle_id);
create index extraction_runs_open on public.extraction_runs (started_at)
  where closed_at is null;

alter table public.extraction_runs enable row level security;
alter table public.extraction_runs force  row level security;

revoke all on public.extraction_runs from anon, authenticated, hc_pipeline, hc_admin;
grant select, insert, update on public.extraction_runs to hc_internal;
create policy extraction_runs_internal on public.extraction_runs
  for select to hc_internal using (true);
create policy extraction_runs_internal_open on public.extraction_runs
  for insert to hc_internal with check (true);
create policy extraction_runs_internal_close on public.extraction_runs
  for update to hc_internal using (true) with check (true);

-- ----------------------------------------------------------------------------
-- Facts trace to their run and supersede-not-append has a column to mean
-- it. Appends to a shipped table — the shipped migration is not edited.
-- ----------------------------------------------------------------------------
alter table public.extractions
  add column run_id uuid,
  add column superseded_at timestamptz,
  add foreign key (circle_id, run_id) references public.extraction_runs (circle_id, id);
create index extractions_by_run on public.extractions (run_id);

-- The supersession write is hc_internal's third extraction privilege
-- (publish-only widens to publish-and-supersede; DELETE still for nobody).
grant update on public.extractions to hc_internal;
create policy extractions_internal_supersede on public.extractions
  for update to hc_internal using (true) with check (true);

-- ----------------------------------------------------------------------------
-- The run closes with the lease — a trigger, so every closer present and
-- future participates. SECURITY DEFINER: whichever role closes a lease,
-- the run bookkeeping runs as hc_internal.
-- ----------------------------------------------------------------------------
create function hc.close_extraction_run() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_state hc.arrival_state;
begin
  if new.closed_at is null or old.closed_at is not null then
    return new;
  end if;
  if not exists (select 1 from public.extraction_runs r
                 where r.lease_id = new.id and r.closed_at is null) then
    return new;   -- not an extract lease, or already closed
  end if;

  -- On 'advanced' the arrivals row was updated (and its event inserted)
  -- earlier in THIS transaction, under the same row lock — the state read
  -- here is the transition's to_state.
  select a.state into v_state from public.arrivals a where a.id = new.arrival_id;

  update public.extraction_runs r
     set closed_at = new.closed_at,
         outcome = case
           when new.outcome = 'advanced'
                and v_state = 'extracted'::hc.arrival_state then 'published'
           when new.outcome = 'advanced' then 'terminalized'
           when new.outcome = 'expired'  then 'abandoned'
           when new.outcome = 'cancelled' then 'cancelled'
           when new.outcome = 'failed'   then 'failed'
           when new.outcome = 'frozen'   then 'frozen'
           else 'terminalized' end,
         reason_code = case
           when new.outcome = 'advanced'
                and v_state <> 'extracted'::hc.arrival_state then
             (select e.reason_code from public.arrival_events e
              where e.arrival_id = new.arrival_id
                and e.attempt = new.attempt_no
                and e.from_state = 'extracting'::hc.arrival_state
                and e.to_state = v_state
              order by e.occurred_at desc
              limit 1)
           else null end
   where r.lease_id = new.id and r.closed_at is null;

  return new;
end $$;
alter function hc.close_extraction_run() owner to hc_internal;

create trigger extraction_run_closes_with_lease
  after update on public.pipeline_leases
  for each row execute function hc.close_extraction_run();

-- ----------------------------------------------------------------------------
-- hc.claim_stage gains the pair. Signature change: the old form is
-- DROPPED (never create-or-replace across a signature change — the exact
-- overload inventory is an invariant; 002 re-pinned this commit). The
-- two-argument call shape survives via defaults for every existing
-- caller; 'extract' now REQUIRES the pair and every other stage refuses
-- it — no stage borrows an identity it does not record.
-- ----------------------------------------------------------------------------
drop function hc.claim_stage(uuid, text);

create function hc.claim_stage(
  p_arrival uuid, p_stage text,
  p_model_id text default null, p_prompt_version text default null,
  out result hc.advance_result, out lease_id uuid,
  out attempt_no int, out deadline timestamptz)
returns record language plpgsql security definer
set search_path = ''
as $$
declare
  v_budget hc.stage_budgets%rowtype;
  v_state  hc.arrival_state;
  v_circle uuid;
  v_frozen boolean;
  v_current uuid;
  v_spent  int;
begin
  select * into v_budget from hc.stage_budgets b where b.stage = p_stage;
  if v_budget.stage is null then
    raise exception 'stage_unknown' using errcode = 'P0001';
  end if;

  -- The run identity is refused where no run is recorded (M3): no stage
  -- borrows an identity it does not record. The extract-side REQUIREMENT
  -- checks at the mint point below — a cancelled, frozen, stale or
  -- exhausted claim still answers its diagnosis (022's pinned contract),
  -- because those paths mint nothing.
  if p_stage <> 'extract'
     and (p_model_id is not null or p_prompt_version is not null) then
    raise exception 'claim_invalid' using errcode = 'P0001';
  end if;

  -- R-rule: discovery for the lock key, then the per-circle lock BEFORE the
  -- row lock. A purged arrival has nothing to own.
  select a.circle_id into v_circle from public.arrivals a where a.id = p_arrival;
  if v_circle is null then
    result := 'invalid_state'::hc.advance_result; return;
  end if;
  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  select a.state, a.current_lease_id, hc.circle_frozen(a.circle_id, a.subject_id)
    into v_state, v_current, v_frozen
    from public.arrivals a where a.id = p_arrival for update;

  if v_state = 'cancelled' then
    result := 'cancelled'::hc.advance_result; return;
  end if;

  -- FRZ-15: parked, and parking consumes NOTHING — refused before any
  -- attempt bookkeeping. Only store proceeds (PRD §7.5 accept-and-store).
  if v_frozen and p_stage <> 'store' then
    result := 'frozen'::hc.advance_result; return;
  end if;

  if v_state <> v_budget.entry_state
     and (v_budget.inflight_state is null or v_state <> v_budget.inflight_state) then
    if exists (select 1 from public.arrival_events e
               where e.arrival_id = p_arrival
                 and e.from_state = v_budget.entry_state) then
      result := 'already_advanced'::hc.advance_result;  -- redelivery, absorbed
    else
      result := 'invalid_state'::hc.advance_result;     -- defect signal
    end if;
    return;
  end if;

  -- Expiry transfers ownership; a live lease refuses the claim. Closing
  -- the dead lease here closes its run — the trigger — in this same
  -- transaction (the kill-during-provider case's recording point).
  if v_current is not null then
    update public.pipeline_leases l
       set outcome = 'expired', closed_at = now()
     where l.id = v_current and l.closed_at is null and l.deadline <= now();
    if exists (select 1 from public.pipeline_leases l
               where l.id = v_current and l.stage = p_stage
                 and l.closed_at is null and l.deadline > now()) then
      result := 'stale_lease'::hc.advance_result; return;
    end if;
  end if;

  select coalesce(max(l.attempt_no), 0) into v_spent
    from public.pipeline_leases l
   where l.arrival_id = p_arrival and l.stage = p_stage;

  if v_spent >= v_budget.max_attempts then
    -- Exhaustion is a terminal state with a stated reason (§4.11), reached
    -- WITHOUT a provider call — the counter that survives a crash is the
    -- lease table, and it is already at the cap.
    update public.arrivals set state = v_budget.exhaust_state where id = p_arrival;
    insert into public.arrival_events (arrival_id, circle_id, from_state, to_state,
                                       reason_code, attempt)
    values (p_arrival, v_circle, v_state, v_budget.exhaust_state,
            v_budget.exhaust_reason, v_spent);
    result := 'exhausted'::hc.advance_result;
    attempt_no := v_spent;
    return;
  end if;

  -- M3: the run identity is REQUIRED at the mint point — checked before
  -- the lease insert, so a lease can never exist without its run.
  if p_stage = 'extract'
     and (length(coalesce(p_model_id, '')) not between 1 and 200
          or length(coalesce(p_prompt_version, '')) not between 1 and 200) then
    raise exception 'claim_invalid' using errcode = 'P0001';
  end if;

  attempt_no := v_spent + 1;
  deadline   := now() + make_interval(secs => v_budget.lease_seconds);
  insert into public.pipeline_leases (arrival_id, circle_id, stage, attempt_no, deadline)
  values (p_arrival, v_circle, p_stage, attempt_no, deadline)
  returning id into lease_id;

  update public.arrivals set current_lease_id = lease_id where id = p_arrival;

  -- M3: the run is born HERE, with its lease, in the claim transaction —
  -- stamped with the pair at insert. A crash after this commit has burned
  -- the attempt AND recorded it.
  if p_stage = 'extract' then
    insert into public.extraction_runs
      (arrival_id, circle_id, lease_id, attempt_no, model_id, prompt_version)
    values (p_arrival, v_circle, lease_id, attempt_no, p_model_id, p_prompt_version);
  end if;

  -- The declared in-flight transition happens AT claim (interpret:
  -- extracted → interpreting) so one lease spans the stage and §4.3's
  -- entry/exit table holds; a reclaim after a mid-flight death finds the
  -- inflight state and does not re-event it (ADR-0007).
  if v_budget.inflight_state is not null and v_state = v_budget.entry_state then
    update public.arrivals set state = v_budget.inflight_state where id = p_arrival;
    insert into public.arrival_events (arrival_id, circle_id, from_state, to_state, attempt)
    values (p_arrival, v_circle, v_state, v_budget.inflight_state, attempt_no);
  end if;

  result := 'claimed'::hc.advance_result;
end $$;

alter function hc.claim_stage(uuid, text, text, text) owner to hc_internal;
revoke execute on function hc.claim_stage(uuid, text, text, text)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.claim_stage(uuid, text, text, text) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- hc.write_extractions: supersede-not-append, run provenance, and stamp
-- coherence. Same signature — replaced in place (the body is the change).
-- ----------------------------------------------------------------------------
create or replace function hc.write_extractions(p_arrival uuid, p_lease uuid, p_facts jsonb)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_circle uuid; v_subject uuid; v_fact jsonb; v_run public.extraction_runs%rowtype;
begin
  if p_facts is null or jsonb_typeof(p_facts) <> 'array'
     or jsonb_array_length(p_facts) > 200 then
    raise exception 'extraction_invalid' using errcode = 'P0001';
  end if;

  -- the lease must be THIS arrival's — never accepted-and-ignored (the F6
  -- posture). The fence itself already ran in this transaction's advance.
  if not exists (select 1 from public.pipeline_leases l
                 where l.id = p_lease and l.arrival_id = p_arrival) then
    raise exception 'extraction_invalid' using errcode = 'P0001';
  end if;

  -- M3: the publishing run (present on every claim-path lease; fixture
  -- leases without one publish unstamped — run_id stays null).
  select r.* into v_run from public.extraction_runs r where r.lease_id = p_lease;

  -- M3 supersede-not-append: the re-run's publication supersedes the
  -- arrival's prior facts IN THIS TRANSACTION — a retry cannot double a
  -- fact, and the superseded rows keep their run provenance.
  update public.extractions e
     set superseded_at = now()
   where e.arrival_id = p_arrival and e.superseded_at is null;

  select a.circle_id, a.subject_id into v_circle, v_subject
    from public.arrivals a where a.id = p_arrival;

  for v_fact in select * from jsonb_array_elements(p_facts) loop
    if jsonb_typeof(v_fact) <> 'object'
       or length(coalesce(v_fact ->> 'field', '')) not between 1 and 120
       or v_fact -> 'value' is null
       or pg_column_size(v_fact -> 'value') > 8192
       or not (coalesce(v_fact -> 'citation', '{}'::jsonb) ? 'page'
               or coalesce(v_fact -> 'citation', '{}'::jsonb) ? 'offset'
               or coalesce(v_fact -> 'citation', '{}'::jsonb) ? 't')
       or pg_column_size(coalesce(v_fact -> 'citation', '{}'::jsonb)) > 4096
       or length(coalesce(v_fact ->> 'model_id', '')) not between 1 and 200
       or length(coalesce(v_fact ->> 'prompt_version', '')) not between 1 and 200 then
      raise exception 'extraction_invalid' using errcode = 'P0001';
    end if;
    -- M3 stamp coherence: a fact whose configuration differs from its
    -- run's recorded identity is a defect, refused at the boundary.
    if v_run.id is not null
       and (v_fact ->> 'model_id' <> v_run.model_id
            or v_fact ->> 'prompt_version' <> v_run.prompt_version) then
      raise exception 'extraction_invalid' using errcode = 'P0001';
    end if;
    insert into public.extractions
      (arrival_id, circle_id, subject_id, field, value, confidence,
       risk_class, citation, model_id, prompt_version, run_id)
    values
      (p_arrival, v_circle, v_subject,
       v_fact ->> 'field', v_fact -> 'value',
       (v_fact ->> 'confidence')::numeric(4,3),
       (v_fact ->> 'risk_class')::hc.risk_class,
       v_fact -> 'citation',
       v_fact ->> 'model_id', v_fact ->> 'prompt_version', v_run.id);
  end loop;
end $$;
