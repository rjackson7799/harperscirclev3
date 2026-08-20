-- ============================================================================
-- 4A · M3 — §5.4 as data + arithmetic, and the §5.3 lookalike check
-- (slice-4 plan M3; pgTAP 045 pinned every shape red-first).
--
-- hc.quota_limits follows the stage_budgets pattern (hc schema, seeded,
-- append/revise-by-migration, unexposed per PIN-01). The PRD-stated rows
-- are the letter of §13.3 (per file 50 MB / 200 pages · 20 attachments ·
-- circle soft 5,000 arrivals / 50 GB · notify 80% · hard 120%); the four
-- RATE rows and the monthly ceiling are PROVISIONAL OPERATIONAL
-- HYPOTHESES (the BGT-01 precedent): §4.2.8 names the dimensions without
-- numbers, so these seeds are starting points revised by migration when
-- observed distributions say so — never silently.
--
-- hc.check_quota computes over arrivals via the existing indexes
-- (arrivals_inbox leads circle_id, received_at) — the circles counter
-- columns stay unmaintained and unread, exactly as the plan specified
-- ("computing over arrivals"). Messages are EMAIL PARENTS: a
-- multi-attachment mail is one message. Deleted arrivals never count.
-- Sender keys canonicalise through hc.contact_key (case/whitespace
-- variants share one budget). Precedence: over_capacity (the §13.3 hard
-- limit — the bounce that must name the limit while everything else
-- keeps working) > over_sender > over_circle. The monthly processing
-- ceiling NOTIFIES and never turns the outcome (PRD §4.2.8
-- "notifies the coordinator rather than failing quietly").
-- ============================================================================

create table hc.quota_limits (
  key         text primary key,
  value       bigint not null check (value > 0),
  description text not null
);

insert into hc.quota_limits (key, value, description) values
  -- PRD §13.3, the letter:
  ('file_bytes_max',             52428800,    'Per file: 50 MB (PRD §13.3; the P5 cap re-stated as data)'),
  ('file_pages_max',             200,         'Per file: 200 pages (PRD §13.3)'),
  ('attachments_per_email',      20,          'Per email: 20 attachments (PRD §13.3)'),
  ('circle_arrivals_soft',       5000,        'Per circle, soft: 5,000 arrivals (PRD §13.3)'),
  ('circle_bytes_soft',          53687091200, 'Per circle, soft: 50 GB (PRD §13.3)'),
  ('notify_pct',                 80,          'Coordinator notified at 80% of soft (PRD §13.3)'),
  ('hard_pct',                   120,         'Hard limit at 120% of soft (PRD §13.3)'),
  -- Provisional operational hypotheses (the BGT-01 precedent; §4.2.8
  -- names the dimensions, not the numbers — revise by migration):
  ('sender_messages_per_hour',   20,          'PROVISIONAL: one sender''s messages/hour'),
  ('sender_messages_per_day',    100,         'PROVISIONAL: one sender''s messages/day'),
  ('circle_messages_per_hour',   60,          'PROVISIONAL: a circle''s inbound messages/hour'),
  ('circle_messages_per_day',    300,         'PROVISIONAL: a circle''s inbound messages/day'),
  ('monthly_processing_ceiling', 2000,        'PROVISIONAL: arrivals/month before the coordinator is notified (never a refusal)');

revoke all on hc.quota_limits from anon, authenticated, hc_pipeline, hc_admin;
grant select on hc.quota_limits to hc_internal;

-- ----------------------------------------------------------------------------
-- hc.check_quota — the §5.4 answer, enumerated, with the per-message
-- bounds riding along so the webhook never re-derives policy.
-- ----------------------------------------------------------------------------
create function hc.check_quota(p_circle uuid, p_sender text default null)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_key  text := nullif(hc.contact_key(coalesce(p_sender, '')), '');
  v_hard numeric;
  v_arr_hard bigint; v_bytes_hard bigint;
  v_arr bigint; v_bytes bigint;
  v_sender_hour int; v_sender_day int;
  v_circle_hour int; v_circle_day int;
  v_month bigint;
  v_outcome text := 'ok';
  q jsonb;
begin
  if p_circle is null then
    raise exception 'quota_refused' using errcode = 'P0001';
  end if;

  select jsonb_object_agg(l.key, l.value) into q from hc.quota_limits l;
  v_hard := (q ->> 'hard_pct')::numeric / 100;
  v_arr_hard   := floor((q ->> 'circle_arrivals_soft')::bigint * v_hard);
  v_bytes_hard := floor((q ->> 'circle_bytes_soft')::bigint * v_hard);

  -- Capacity: live over arrivals (the plan's ruling), deleted rows out —
  -- nothing is deleted to make room, so nothing deleted eats the room.
  select count(*), coalesce(sum(a.byte_size), 0)
    into v_arr, v_bytes
    from public.arrivals a
   where a.circle_id = p_circle and a.deleted_at is null;

  -- Rates: EMAIL PARENTS only (children of one mail are one message).
  select count(*) filter (where a.received_at > now() - interval '1 hour'),
         count(*) filter (where a.received_at > now() - interval '24 hours'),
         count(*) filter (where a.received_at > now() - interval '1 hour'
                            and v_key is not null
                            and hc.contact_key(a.sender_address::text) = v_key),
         count(*) filter (where a.received_at > now() - interval '24 hours'
                            and v_key is not null
                            and hc.contact_key(a.sender_address::text) = v_key),
         count(*) filter (where a.received_at >= date_trunc('month', now()))
    into v_circle_hour, v_circle_day, v_sender_hour, v_sender_day, v_month
    from public.arrivals a
   where a.circle_id = p_circle
     and a.deleted_at is null
     and a.parent_arrival_id is null
     and a.channel = 'email';

  if v_arr >= v_arr_hard or v_bytes >= v_bytes_hard then
    v_outcome := 'over_capacity';
  elsif v_key is not null
        and (v_sender_hour >= (q ->> 'sender_messages_per_hour')::int
             or v_sender_day >= (q ->> 'sender_messages_per_day')::int) then
    v_outcome := 'over_sender';
  elsif v_circle_hour >= (q ->> 'circle_messages_per_hour')::int
        or v_circle_day >= (q ->> 'circle_messages_per_day')::int then
    v_outcome := 'over_circle';
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'monthly_ceiling_reached',
      v_month >= (q ->> 'monthly_processing_ceiling')::bigint,
    'limits', jsonb_build_object(
      'attachments_per_email', (q ->> 'attachments_per_email')::int,
      'file_bytes_max',        (q ->> 'file_bytes_max')::bigint,
      'file_pages_max',        (q ->> 'file_pages_max')::int));
end $$;

alter function hc.check_quota(uuid, text) owner to hc_internal;
revoke execute on function hc.check_quota(uuid, text)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.check_quota(uuid, text) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- hc.sender_lookalike — pg_trgm similarity against the circle's LIVE
-- known senders (domain rows AND the domains of address rows). An exact
-- match is recognition; a near-miss is MORE suspicious than an unrelated
-- domain (§5.3 → auth_result 'lookalike'). The 0.5 threshold is a
-- provisional operational hypothesis (the BGT-01 label), revised by
-- migration if observation says so.
-- ----------------------------------------------------------------------------
create function hc.sender_lookalike(p_circle uuid, p_domain text)
returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_match text;
begin
  if p_circle is null or v_domain = '' then
    raise exception 'lookalike_refused' using errcode = 'P0001';
  end if;

  -- lower(text) throughout: citext operators do not resolve under
  -- search_path = '' and the text fallback compares case-sensitively —
  -- the recorded SND-01 trap.
  select k.known into v_match
  from (
    select lower(coalesce(s.domain::text,
                          split_part(s.address::text, '@', 2))) as known
    from public.known_senders s
    where s.circle_id = p_circle and s.revoked_at is null
  ) k
  where k.known <> v_domain
    and extensions.similarity(k.known, v_domain) >= 0.5
  order by extensions.similarity(k.known, v_domain) desc
  limit 1;

  return jsonb_build_object(
    'lookalike', v_match is not null,
    'similar_to', v_match);
end $$;

alter function hc.sender_lookalike(uuid, text) owner to hc_internal;
revoke execute on function hc.sender_lookalike(uuid, text)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.sender_lookalike(uuid, text) to hc_pipeline;
