-- ============================================================================
-- 1A · M10 — third-party review round 5, accepted findings applied
-- (ADR-0004; one migration per review round, atomic).
--
--   F1/R7 · The custodianship receipt becomes durably subject-bound:
--           subject UUIDs are preallocated, the access_log declaration FK
--           turns DEFERRABLE INITIALLY DEFERRED, and declarations are
--           written WITH the id of the subject they precede.
--   F2     · hc.log() computes a versioned canonical digest (v1) covering
--           every immutable evidentiary column — session, request and
--           correction linkage included. collapsed_count/collapsed_until
--           stay OUTSIDE the hash by design: they are mutable
--           presentation counters (1D denial collapse), and hashed
--           evidence must be immutable.
--   F3/R3 · Freeze rate limiting keys on a canonical contact
--           (hc.contact_key) stored beside the verbatim submitted form.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F1 · The declaration precedes the subject row it binds: defer the check
-- to commit, when the preallocated subject exists.
-- ----------------------------------------------------------------------------
alter table public.access_log
  alter constraint access_log_circle_id_subject_id_fkey
  deferrable initially deferred;

-- ----------------------------------------------------------------------------
-- F3 · Canonical contact key. Typed prefixes keep phone- and email-shaped
-- forms in disjoint keyspaces; the verbatim submitted form remains in
-- claimant_contact. No stronger intake identity verification is implied —
-- intake stays deliberately low-friction (PRD §7.5).
-- ----------------------------------------------------------------------------
create function hc.contact_key(p text) returns text
language sql immutable parallel safe as $$
  select case
    when btrim(coalesce(p, '')) = '' then ''
    when lower(btrim(p)) ~ '^[+0-9 ().-]+$'
      then 'tel:' || regexp_replace(btrim(p), '[^0-9]', '', 'g')
    else 'email:' || lower(btrim(p))
  end;
$$;
alter function hc.contact_key(text) owner to hc_internal;
revoke execute on function hc.contact_key(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;

alter table public.freeze_claims
  add column claimant_contact_key text not null;
drop index public.freeze_claims_by_claimant;
create index freeze_claims_by_claimant_key
  on public.freeze_claims (claimant_contact_key, received_at);

-- ----------------------------------------------------------------------------
-- F2 · hc.log() with the v1 canonical digest. The 14-argument form is
-- dropped (never create-or-replace across a signature change — the exact
-- overload inventory is an invariant); the new form appends
-- p_corrects_id so correction linkage is writable through the one writer.
-- ----------------------------------------------------------------------------
drop function hc.log(uuid, text, text, uuid, uuid, uuid, hc.domain,
                     hc.access_level, hc.access_level, hc.object_type,
                     uuid, jsonb, text, text);

create function hc.log(
  p_circle_id          uuid,
  p_event_type         text,
  p_actor_display_name text,
  p_actor_account_id   uuid default null,
  p_subject_id         uuid default null,
  p_target_member_id   uuid default null,
  p_domain             hc.domain default null,
  p_level_before       hc.access_level default null,
  p_level_after        hc.access_level default null,
  p_object_type        hc.object_type default null,
  p_object_id          uuid default null,
  p_detail             jsonb default '{}'::jsonb,
  p_actor_session_id   text default null,
  p_request_id         text default null,
  p_corrects_id        uuid default null
) returns bigint
language plpgsql
set search_path = ''
as $$
declare
  v_seq  bigint;
  v_prev bytea;
  v_now  timestamptz := now();
  v_entry jsonb;
  v_hash bytea;
begin
  -- Serialise seq and the chain per circle without blocking other circles;
  -- held for microseconds, released at commit (§2.8; ADR-0002 claim 10).
  perform pg_advisory_xact_lock(hashtext(p_circle_id::text));

  select l.seq, l.entry_hash into v_seq, v_prev
  from public.access_log l
  where l.circle_id = p_circle_id
  order by l.seq desc
  limit 1;
  v_seq := coalesce(v_seq, 0) + 1;

  -- The v1 canonical entry (round-5 F2): every immutable evidentiary
  -- column, versioned so a future canonical change is explicit rather
  -- than silent. jsonb key order is deterministic, so the hash is
  -- reproducible from the stored row alone. collapsed_count and
  -- collapsed_until are deliberately absent: mutable presentation
  -- counters are never hashed evidence.
  v_entry := jsonb_build_object(
    'v', 1,
    'circle_id', p_circle_id, 'seq', v_seq, 'event_type', p_event_type,
    'actor_account_id', p_actor_account_id,
    'actor_display_name', p_actor_display_name,
    'actor_session_id', p_actor_session_id, 'request_id', p_request_id,
    'subject_id', p_subject_id, 'target_member_id', p_target_member_id,
    'domain', p_domain, 'level_before', p_level_before,
    'level_after', p_level_after, 'object_type', p_object_type,
    'object_id', p_object_id, 'detail', p_detail,
    'corrects_id', p_corrects_id,
    'occurred_at', extract(epoch from v_now));

  v_hash := extensions.digest(
    coalesce(v_prev, ''::bytea) || convert_to(v_entry::text, 'UTF8'), 'sha256');

  insert into public.access_log
    (circle_id, subject_id, seq, event_type, actor_account_id,
     actor_display_name, actor_session_id, request_id, target_member_id,
     domain, level_before, level_after, object_type, object_id, detail,
     occurred_at, prev_hash, entry_hash, corrects_id)
  values
    (p_circle_id, p_subject_id, v_seq, p_event_type, p_actor_account_id,
     p_actor_display_name, p_actor_session_id, p_request_id, p_target_member_id,
     p_domain, p_level_before, p_level_after, p_object_type, p_object_id, p_detail,
     v_now, v_prev, v_hash, p_corrects_id);

  return v_seq;
end $$;

alter function hc.log(uuid, text, text, uuid, uuid, uuid, hc.domain,
                      hc.access_level, hc.access_level, hc.object_type,
                      uuid, jsonb, text, text, uuid)
  owner to hc_internal;
revoke execute on function hc.log(uuid, text, text, uuid, uuid, uuid, hc.domain,
                                  hc.access_level, hc.access_level, hc.object_type,
                                  uuid, jsonb, text, text, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- F3 · hc.request_freeze(): every rate-limit dimension keys on the
-- canonical contact; the ledger stores canonical key + verbatim form.
-- ----------------------------------------------------------------------------
create or replace function hc.request_freeze(
  p_circle_id           uuid,
  p_claimant_contact    text,
  p_reason              text,
  p_claimant_relationship text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c_claimant_max  constant int := 3;
  c_circle_max    constant int := 10;
  c_window        constant interval := interval '30 days';
  v_key           text := hc.contact_key(p_claimant_contact);
  v_freeze        uuid;
  v_disposition   text;
  v_claim         uuid;
begin
  perform pg_advisory_xact_lock(hashtext('freeze:' || p_circle_id::text));

  if exists (select 1
             from public.freeze_claims fc
             join public.freezes f on f.id = fc.freeze_id
             where fc.circle_id = p_circle_id
               and fc.claimant_contact_key = v_key
               and f.state = 'dismissed') then
    v_disposition := 'rate_limited';   -- adjudicated-unfounded prior claim
  elsif (select count(*) from public.freeze_claims fc
         where fc.circle_id = p_circle_id
           and fc.claimant_contact_key = v_key
           and fc.received_at >= now() - c_window) >= c_claimant_max then
    v_disposition := 'rate_limited';
  elsif (select count(*) from public.freeze_claims fc
         where fc.circle_id = p_circle_id
           and fc.received_at >= now() - c_window) >= c_circle_max then
    v_disposition := 'rate_limited';
  else
    select f.id into v_freeze
    from public.freezes f
    where f.circle_id = p_circle_id and f.state = 'open';

    if v_freeze is null then
      insert into public.freezes (circle_id) values (p_circle_id)
        returning id into v_freeze;
      v_disposition := 'opened_freeze';
    else
      v_disposition := 'attached_to_existing';
    end if;
  end if;

  insert into public.freeze_claims
    (circle_id, freeze_id, claimant_contact, claimant_contact_key,
     claimant_relationship, reason, disposition)
  values
    (p_circle_id,
     case when v_disposition = 'rate_limited' then null else v_freeze end,
     p_claimant_contact, v_key, p_claimant_relationship, p_reason, v_disposition)
  returning id into v_claim;

  perform hc.log(p_circle_id,
                 case when v_disposition = 'opened_freeze'
                      then 'freeze_requested' else 'freeze_claim_recorded' end,
                 'Freeze service',
                 p_detail => jsonb_build_object('disposition', v_disposition));

  return jsonb_build_object(
    'claim_id', v_claim,
    'freeze_id', case when v_disposition = 'rate_limited' then null else v_freeze end,
    'disposition', v_disposition);
end $$;

alter function hc.request_freeze(uuid, text, text, text) owner to hc_internal;
revoke execute on function hc.request_freeze(uuid, text, text, text)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- F1 · hc.create_circle(): subject ids preallocated before the declaration
-- loop; each declaration carries the id of the subject it precedes (the
-- deferred FK holds until that subject is inserted later in the same
-- transaction). The name stays in detail for the human receipt.
-- ----------------------------------------------------------------------------
create or replace function hc.create_circle(
  p_name            text,
  p_subjects        jsonb,
  p_opening_context text[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_display text;
  v_circle  uuid;
  v_founder uuid;
  v_member  uuid;
  v_ids     uuid[] := '{}'::uuid[];
  v_n       int;
  s         jsonb;
  d         hc.domain;
begin
  v_account := hc.uid();
  if v_account is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  select a.display_name into v_display
  from public.accounts a where a.id = v_account;
  if v_display is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;

  -- The two-subject cap (PRD §2): not expressible as a table CHECK, so it
  -- is enforced here, in the one function that creates subjects in 1A,
  -- under the same per-circle advisory lock discipline later subject
  -- additions must take (§2.3 note).
  if p_subjects is null
     or jsonb_typeof(p_subjects) <> 'array'
     or jsonb_array_length(p_subjects) not between 1 and 2 then
    raise exception 'invalid_subjects' using errcode = 'P0001';
  end if;
  v_n := jsonb_array_length(p_subjects);

  insert into public.circles (name, opening_context, created_by)
  values (p_name, p_opening_context, v_account)
  returning id into v_circle;

  perform pg_advisory_xact_lock(hashtext('circle:' || v_circle::text));

  -- Preallocate the subject identities the declarations will bind to
  -- (round-5 F1: a durable id, not a free-text name).
  for i in 1..v_n loop
    v_ids := v_ids || gen_random_uuid();
  end loop;

  -- FIRST: the custodianship declarations, seq 1 (and 2), before subjects,
  -- before the founder's membership, before grants (AC-AUTH-6) — each
  -- bound to its preallocated subject id under the deferred FK.
  for i in 1..v_n loop
    s := p_subjects -> (i - 1);
    perform hc.log(v_circle, 'custodianship_declared', v_display, v_account,
                   p_subject_id => v_ids[i],
                   p_detail => jsonb_build_object(
                     'subject_name', s ->> 'first_name',
                     'custodian', v_display,
                     'declared_on', to_char(now(), 'YYYY-MM-DD')));
  end loop;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (v_circle, v_account, 'coordinator', v_display)
  returning id into v_founder;

  perform hc.log(v_circle, 'member_joined', v_display, v_account);

  for i in 1..v_n loop
    s := p_subjects -> (i - 1);
    insert into public.subjects
      (id, circle_id, first_name, situation, postal_code, timezone,
       accent_color, forwarding_local_part)
    values
      (v_ids[i], v_circle, s ->> 'first_name', s ->> 'situation',
       s ->> 'postal_code', s ->> 'timezone', s ->> 'accent_color',
       s ->> 'forwarding_local_part');

    insert into public.circle_members
      (circle_id, subject_id, custodian_member_id, tier, display_name_at_join)
    values
      (v_circle, v_ids[i], v_founder, 'coordinator', s ->> 'first_name')
    returning id into v_member;

    foreach d in array hc.all_domains() loop
      insert into public.access_grants
        (circle_id, member_id, subject_id, domain, level, granted_by)
      values
        (v_circle, v_founder, v_ids[i], d, 'manage', v_account),
        (v_circle, v_member,  v_ids[i], d, 'manage', v_account);
    end loop;
  end loop;

  return jsonb_build_object(
    'circle_id', v_circle,
    'founder_member_id', v_founder,
    'subject_ids', to_jsonb(v_ids));
end $$;

alter function hc.create_circle(text, jsonb, text[]) owner to hc_internal;
revoke execute on function hc.create_circle(text, jsonb, text[])
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.create_circle(text, jsonb, text[]) to authenticated;
