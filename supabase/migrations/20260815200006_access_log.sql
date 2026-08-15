-- ============================================================================
-- 1A · M6 — the access log: append-only, tamper-evident, per-circle chained.
--
-- TSD §2.8. Lands in 1A (ahead of the kickoff's table list) because
-- hc.create_circle() must write the custodianship declaration at seq = 1
-- in the circle's hash chain (§2.3, AC-AUTH-6) and freeze events are
-- access-log entries (PRD §7.5 "Recorded"). Staged to 1D: the permission-
-- filtered family read policy, denial collapse, and the daily head-signing
-- job — until then the table is write-only via hc.log() and unreadable by
-- every request-path role (fail closed).
--
-- pg_uuidv7 is not available on this image (checked: only uuid-ossp), so
-- ids use gen_random_uuid() — §2.1 wants v7 for append locality only,
-- "where enabled"; nothing correctness-bearing changes.
-- ============================================================================

-- The fixed enumeration of event types (normalised codes; raw strings are
-- never stored — §2.4/§3.9 posture). Reference data in hc: no request-path
-- role holds any privilege; FK validation needs none.
create table hc.log_event_types (
  code        text primary key,
  description text not null
);

insert into hc.log_event_types (code, description) values
  ('custodianship_declared', 'Custodianship of a subject''s record declared at circle creation (PRD §7.5)'),
  ('member_joined',          'A membership row became active'),
  ('grant_changed',          'An access grant was created, raised, lowered or removed'),
  ('access_denied',          'A read or action was refused — names the actor and domain, never the object'),
  ('freeze_requested',       'A freeze claim opened a whole-circle freeze'),
  ('freeze_claim_recorded',  'A claim was recorded against an already-open freeze'),
  ('freeze_adjudicated',     'A freeze reached a finding: dismissed, upheld, or unresolved');

revoke all on hc.log_event_types from anon, authenticated, hc_pipeline, hc_admin;
grant select on hc.log_event_types to hc_internal;

create table public.access_log (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid,
  seq           bigint not null,                  -- per-circle, gapless
  event_type    text not null references hc.log_event_types(code),
  actor_account_id uuid references public.accounts(id),
  actor_display_name text not null,               -- captured then, never re-resolved
  actor_session_id text,
  request_id    text,
  target_member_id uuid,
  domain        hc.domain,
  level_before  hc.access_level,
  level_after   hc.access_level,
  object_type   hc.object_type,
  object_id     uuid,
  detail        jsonb not null default '{}',
  collapsed_count int not null default 1,         -- repeated denials (AC-PPL-7)
  collapsed_until timestamptz,
  occurred_at   timestamptz not null default now(),   -- SERVER time, never a client's
  prev_hash     bytea,
  entry_hash    bytea not null,
  corrects_id   uuid,
  unique (circle_id, seq),
  unique (circle_id, id),
  foreign key (circle_id, subject_id)       references public.subjects (circle_id, id),
  foreign key (circle_id, target_member_id) references public.circle_members (circle_id, id),
  foreign key (circle_id, corrects_id)      references public.access_log (circle_id, id)
);

-- A denial entry names the actor and the domain, NEVER the object — naming it
-- would tell the reader what exists (PRD §4.6.5, AC-PPL-7).
alter table public.access_log add constraint denial_names_no_object check (
  event_type <> 'access_denied' or (object_id is null and object_type is null
                                    and detail = '{}'::jsonb));

create index access_log_by_subject   on public.access_log (subject_id);
create index access_log_by_actor     on public.access_log (actor_account_id);
create index access_log_by_target    on public.access_log (target_member_id);
create index access_log_by_corrects  on public.access_log (corrects_id);

alter table public.access_log enable row level security;
alter table public.access_log force  row level security;

-- Append-only, two ways (§2.8): the privilege is absent for every request
-- path, AND a before-trigger raises unconditionally — so even a future
-- migration that re-grants the privilege still cannot rewrite history.
revoke all on public.access_log from anon, authenticated, hc_pipeline, hc_admin;

create function hc.access_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'access_log is append-only; a correction is a new row with corrects_id (PRD §4.6.5)'
    using errcode = '42501';
end $$;
alter function hc.access_log_immutable() owner to hc_internal;

create trigger access_log_immutable
  before update or delete on public.access_log
  for each row execute function hc.access_log_immutable();

-- The only writer: hc.log(). SECURITY INVOKER on purpose — it is reachable
-- solely from inside hc_internal-owned definer functions already running as
-- hc_internal ("SECURITY DEFINER only where required", ADR-0003 finding 8);
-- no request-path role holds EXECUTE, and hc_internal's own insert privilege
-- + policy below are what make it work.
grant select, insert on public.access_log to hc_internal;
create policy access_log_internal on public.access_log
  for select to hc_internal using (true);
create policy access_log_internal_append on public.access_log
  for insert to hc_internal with check (true);

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
  p_request_id         text default null
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

  -- The canonical entry: jsonb key order is deterministic, so the hash is
  -- reproducible from the stored row alone.
  v_entry := jsonb_build_object(
    'circle_id', p_circle_id, 'seq', v_seq, 'event_type', p_event_type,
    'actor_account_id', p_actor_account_id,
    'actor_display_name', p_actor_display_name,
    'subject_id', p_subject_id, 'target_member_id', p_target_member_id,
    'domain', p_domain, 'level_before', p_level_before,
    'level_after', p_level_after, 'object_type', p_object_type,
    'object_id', p_object_id, 'detail', p_detail,
    'occurred_at', extract(epoch from v_now));

  v_hash := extensions.digest(
    coalesce(v_prev, ''::bytea) || convert_to(v_entry::text, 'UTF8'), 'sha256');

  insert into public.access_log
    (circle_id, subject_id, seq, event_type, actor_account_id,
     actor_display_name, actor_session_id, request_id, target_member_id,
     domain, level_before, level_after, object_type, object_id, detail,
     occurred_at, prev_hash, entry_hash)
  values
    (p_circle_id, p_subject_id, v_seq, p_event_type, p_actor_account_id,
     p_actor_display_name, p_actor_session_id, p_request_id, p_target_member_id,
     p_domain, p_level_before, p_level_after, p_object_type, p_object_id, p_detail,
     v_now, v_prev, v_hash);

  return v_seq;
end $$;

alter function hc.log(uuid, text, text, uuid, uuid, uuid, hc.domain,
                      hc.access_level, hc.access_level, hc.object_type,
                      uuid, jsonb, text, text)
  owner to hc_internal;
revoke execute on function hc.log(uuid, text, text, uuid, uuid, uuid, hc.domain,
                                  hc.access_level, hc.access_level, hc.object_type,
                                  uuid, jsonb, text, text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
