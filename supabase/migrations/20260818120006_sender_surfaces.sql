-- ============================================================================
-- 2A · M6 — the known-senders member surfaces (SND-02: TSD §5.3–§5.4;
-- PRD §4.2.8): hc.accept_sender · hc.revoke_sender · hc.expire_held_mail.
--
-- Recognition is not identity (§5.3): acceptance is per circle, revocable,
-- effective immediately, and never retroactively unfiles. The three legs:
--
--   · RELEASE, in the acceptance transaction: each matching held arrival
--     gets a REAL gate lease (the §4.3 attempt counter keeps counting)
--     and advances held_unknown_sender → extracting through the CAS —
--     the one new edge is appended to the closed allowlist below, and
--     ING-10's exact-set pin is re-pinned in this commit. The arrival is
--     then queued via pipeline_outbox for the extract worker exactly as
--     the freeze-dismissal re-queue is (RLY-01 pending; a lost message
--     leaves the arrival in a worker-owed state the sweeper lists — a
--     delay, never a loss).
--   · REVOCATION: sets revoked_at; SND-01's live-rows-only predicate
--     makes it effective on the sender's next message with no further
--     machinery. A freeze does not block it — revocation reduces reach.
--   · EXPIRY (§5.4): unaccepted stranger mail expires at 30 days, to
--     nothing_filed with reason held_expired — the sweeper WRITE pattern
--     (conditional update on the row-locked live row under the R-rule
--     lock), scheduled by the RLY-01 worker alongside sweeper_pass
--     (OPS-01 identity). Skips: frozen circles (§7.5 — nothing is lost
--     under containment), senders accepted meanwhile (accepted-but-
--     unreleased is not stranger mail), and arrivals with no held event
--     (never destroy without evidence of age). The in-inbox warning is
--     the inbox surface's (staged with UXA-01).
--
-- Acceptance authority: coordinator-only, and refused under any freeze —
-- §7.5 closes interactive access outright, so a surface that changes
-- what gets auto-processed cannot stay open. (Round-9 question: should
-- manage-on-health members accept too? Built strict; widening is a
-- one-line change.)
-- ============================================================================

insert into hc.arrival_transitions (stage, from_state, to_state) values
  ('gate', 'held_unknown_sender', 'extracting');

insert into hc.reason_codes (code, description) values
  ('sender_accepted_requeue', 'Held mail released by a sender acceptance; re-queued for extraction'),
  ('held_expired',            'Unaccepted stranger mail expired at 30 days (§5.4)');

insert into hc.log_event_types (code, description) values
  ('sender_accepted', 'A sender was accepted for this circle (address or domain)'),
  ('sender_revoked',  'A sender acceptance was revoked');

grant insert on public.known_senders to hc_internal;
grant update on public.known_senders to hc_internal;
create policy known_senders_internal_accept on public.known_senders
  for insert to hc_internal with check (true);
create policy known_senders_internal_revoke on public.known_senders
  for update to hc_internal using (true) with check (true);

-- ----------------------------------------------------------------------------
-- hc.accept_sender
-- ----------------------------------------------------------------------------
create function hc.accept_sender(
  p_circle_id uuid, p_address text default null, p_domain text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_address text := nullif(btrim(coalesce(p_address, '')), '');
  v_domain  text := nullif(btrim(coalesce(p_domain, '')), '');
  v_sender uuid;
  v_released int := 0;
  v_lease uuid;
  v_attempt int;
  r record;
begin
  if v_actor is null then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.circle_members m
                 where m.circle_id = p_circle_id and m.account_id = v_actor
                   and m.removed_at is null and m.tier = 'coordinator') then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.freezes f
             where f.circle_id = p_circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  -- exactly one of address / domain, mirroring the table's check
  if (v_address is null) = (v_domain is null) then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  begin
    insert into public.known_senders (circle_id, address, domain, accepted_by)
    values (p_circle_id, v_address, v_domain, v_actor)
    returning id into v_sender;
  exception when unique_violation then
    -- already accepted live: one shape
    raise exception 'sender_refused' using errcode = 'P0001';
  end;

  perform hc.log(p_circle_id, 'sender_accepted', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_detail => jsonb_build_object(
                   'sender_id', v_sender,
                   'address', v_address, 'domain', v_domain));

  -- RELEASE, same transaction: the R-rule lock first (advance re-acquires
  -- it re-entrantly), then per held arrival a real gate lease + the CAS.
  perform pg_advisory_xact_lock(hashtext('taint:' || p_circle_id::text));

  for r in
    select a.id from public.arrivals a
    where a.circle_id = p_circle_id
      and a.state = 'held_unknown_sender'
      and a.deleted_at is null
      and a.sender_address is not null
      and (   (v_address is not null
               and lower(a.sender_address::text) = lower(v_address))
           or (v_domain is not null
               and lower(split_part(a.sender_address::text, '@', 2)) = lower(v_domain)))
    for update
  loop
    select coalesce(max(l.attempt_no), 0) + 1 into v_attempt
      from public.pipeline_leases l where l.arrival_id = r.id;
    insert into public.pipeline_leases
      (arrival_id, circle_id, stage, attempt_no, deadline)
    values (r.id, p_circle_id, 'gate', v_attempt, now() + interval '60 seconds')
    returning id into v_lease;
    update public.arrivals set current_lease_id = v_lease where id = r.id;

    if hc.advance_arrival(r.id, 'held_unknown_sender', 'extracting',
                          v_lease, 'sender_recognised') = 'advanced' then
      v_released := v_released + 1;
      insert into public.pipeline_outbox (circle_id, arrival_id, reason_code)
      values (p_circle_id, r.id, 'sender_accepted_requeue');
    end if;
  end loop;

  return jsonb_build_object('sender_id', v_sender,
                            'released_count', v_released);
end $$;

alter function hc.accept_sender(uuid, text, text) owner to hc_internal;
revoke execute on function hc.accept_sender(uuid, text, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.accept_sender(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.revoke_sender
-- ----------------------------------------------------------------------------
create function hc.revoke_sender(p_sender_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_circle uuid;
begin
  if v_actor is null then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  update public.known_senders k
     set revoked_at = now()
   where k.id = p_sender_id
     and k.revoked_at is null
     and exists (select 1 from public.circle_members m
                 where m.circle_id = k.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null
                   and m.tier = 'coordinator')
  returning k.circle_id into v_circle;

  if v_circle is null then
    -- nonexistent, foreign, non-coordinator, already revoked: one shape
    raise exception 'sender_refused' using errcode = 'P0001';
  end if;

  perform hc.log(v_circle, 'sender_revoked', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_detail => jsonb_build_object('sender_id', p_sender_id));

  return jsonb_build_object('sender_id', p_sender_id, 'revoked', true);
end $$;

alter function hc.revoke_sender(uuid) owner to hc_internal;
revoke execute on function hc.revoke_sender(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.revoke_sender(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.expire_held_mail — sweeper-pattern write; RLY-01 schedules it.
-- ----------------------------------------------------------------------------
create function hc.expire_held_mail()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_expired int := 0;
  v_attempt int;
  r record;
begin
  for r in
    select a.id, a.circle_id, a.subject_id
    from public.arrivals a
    where a.state = 'held_unknown_sender'
      and a.deleted_at is null
      and (select max(e.occurred_at) from public.arrival_events e
           where e.arrival_id = a.id
             and e.to_state = 'held_unknown_sender')
          < now() - interval '30 days'
    order by a.circle_id
  loop
    -- per circle under the R-rule lock; re-validate EVERYTHING against
    -- the row-locked live row (the SWP-01/round-7 B2 discipline)
    perform pg_advisory_xact_lock(hashtext('taint:' || r.circle_id::text));

    if hc.circle_frozen(r.circle_id, r.subject_id) then
      continue;   -- §7.5: nothing is lost under containment
    end if;
    if hc.sender_recognised(r.id) then
      continue;   -- accepted meanwhile: not stranger mail, never expires
    end if;

    update public.arrivals a
       set state = 'nothing_filed'
     where a.id = r.id
       and a.state = 'held_unknown_sender'
       and a.deleted_at is null;
    if found then
      select coalesce(max(l.attempt_no), 1) into v_attempt
        from public.pipeline_leases l where l.arrival_id = r.id;
      insert into public.arrival_events
        (arrival_id, circle_id, from_state, to_state, reason_code, attempt)
      values (r.id, r.circle_id, 'held_unknown_sender', 'nothing_filed',
              'held_expired', v_attempt);
      v_expired := v_expired + 1;
    end if;
  end loop;

  return jsonb_build_object('expired_count', v_expired);
end $$;

alter function hc.expire_held_mail() owner to hc_internal;
revoke execute on function hc.expire_held_mail()
  from public, anon, authenticated, hc_admin;
grant execute on function hc.expire_held_mail() to hc_pipeline;
