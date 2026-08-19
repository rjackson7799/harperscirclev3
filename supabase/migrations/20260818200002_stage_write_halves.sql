-- ============================================================================
-- 4A · M2 — the store/scan outcome writers (slice-4 plan M2; TSD §4.3/§4.5
-- as amended by A5/A6; the D9 shape: transition-gated, one transaction,
-- owner-only write halves; pgTAP 044 pinned every piece red-first).
--
-- The 1C substrate deliberately shipped no way to write
-- storage_key/content_sha256/mime_detected or scan_verdict/scan_at (stage
-- workers hold no UPDATE on arrivals by design — ADR-0008 M1's narrowed
-- claim). These finalizers are that way in, the same move
-- finalize_extraction made one stage later: the CAS transition runs FIRST
-- and the facts commit WITH the won transition or not at all. store_failed
-- needs no finalizer — nothing was kept means nothing to write, and the
-- graph already carries received → store_failed for the naked CAS.
--
-- public.scan_results is the content-sha verdict cache AND PRD §11.5's
-- malware hash+verdict retention: clean rows carry 7-day freshness and are
-- swept; infected rows are RETAINED (expires_at null) as evidence.
-- hc.scan_cache_lookup is the 4B worker's cache-hit read;
-- hc.expire_scan_results is the retention sweep leg (the expire_held_mail
-- scheduler-identity pattern).
--
-- pgmq queue 'pipeline_work' (§1.4): the work-item transport the 4B
-- relay/workers ride. hc_pipeline receives the DATA plane only — the
-- enumerated queue operations and the two queue tables; queue
-- creation/destruction stays with the migration runner.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- scan_results — sha256 → verdict, definitive verdicts only.
-- ----------------------------------------------------------------------------
create table public.scan_results (
  content_sha256 bytea primary key check (octet_length(content_sha256) = 32),
  verdict     text not null check (verdict in ('clean', 'infected')),
  detail      jsonb not null default '{}'::jsonb,
  scanned_at  timestamptz not null default now(),
  expires_at  timestamptz          -- null ⇒ retained (infected, §11.5); clean = scanned_at + 7 days
);
create index scan_results_expiry on public.scan_results (expires_at)
  where expires_at is not null;

alter table public.scan_results enable row level security;
alter table public.scan_results force  row level security;
revoke all on public.scan_results from anon, authenticated, hc_pipeline, hc_admin;
grant select, insert, update, delete on public.scan_results to hc_internal;
create policy scan_results_internal on public.scan_results
  for select to hc_internal using (true);
create policy scan_results_internal_cache on public.scan_results
  for insert to hc_internal with check (true);
create policy scan_results_internal_refresh on public.scan_results
  for update to hc_internal using (true) with check (true);
create policy scan_results_internal_expire on public.scan_results
  for delete to hc_internal using (true);

-- ----------------------------------------------------------------------------
-- hc.finalize_store — gates received → stored; the artifact facts commit
-- with the won transition. Input refusals fire BEFORE the CAS touches
-- anything (the P5 posture: input-syntax refusals, not DEF-10 oracles).
-- ----------------------------------------------------------------------------
create function hc.finalize_store(
  p_arrival uuid, p_lease uuid, p_storage_key text, p_sha256 bytea,
  p_mime_detected text, p_byte_size bigint)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare
  v hc.advance_result;
  v_circle uuid;
  v_mime text := nullif(btrim(coalesce(p_mime_detected, '')), '');
begin
  -- The P5 caps re-checked against MEASURED bytes: the provider's declared
  -- size never grandfathers the real one. The sha must be a real sha256;
  -- the mime is the SNIFFED type (never the extension), bounded like the
  -- declared one.
  if p_sha256 is null or octet_length(p_sha256) <> 32
     or p_byte_size is null or p_byte_size not between 1 and 52428800
     or v_mime is null or char_length(v_mime) > 255
     or p_storage_key is null then
    raise exception 'store_invalid' using errcode = 'P0001';
  end if;

  -- The content-addressed key shape (§2.12), verified EXACTLY against
  -- THIS arrival's identity — a worker cannot park bytes under another
  -- circle's or arrival's address.
  select a.circle_id into v_circle from public.arrivals a where a.id = p_arrival;
  if v_circle is null
     or p_storage_key <> ('circle/' || v_circle || '/arrival/' || p_arrival
                          || '/' || encode(p_sha256, 'hex')) then
    raise exception 'store_invalid' using errcode = 'P0001';
  end if;

  -- The conditional transition runs FIRST, in this transaction (§4.5).
  v := hc.advance_arrival(p_arrival, 'received', 'stored', p_lease);
  if v <> 'advanced' then
    return v;                    -- cancelled / frozen / stale / already: nothing below runs
  end if;

  -- Reached only on a won transition; commits with it or not at all.
  -- Write-once is structural: only 'received' can win this edge, and
  -- nothing re-enters 'received'.
  update public.arrivals
     set storage_key    = p_storage_key,
         content_sha256 = p_sha256,
         mime_detected  = v_mime,
         byte_size      = p_byte_size
   where id = p_arrival;

  return 'advanced'::hc.advance_result;
end $$;

alter function hc.finalize_store(uuid, uuid, text, bytea, text, bigint)
  owner to hc_internal;
revoke execute on function hc.finalize_store(uuid, uuid, text, bytea, text, bigint)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_store(uuid, uuid, text, bytea, text, bigint)
  to hc_pipeline;

-- ----------------------------------------------------------------------------
-- hc.finalize_scan — gates stored → the four §4.3 scan exits from the
-- adapter's four states (§1.6: clean | infected | unavailable |
-- inconclusive — NEVER collapsed, AC-INBOX-15). Definitive verdicts are
-- cached by the arrival's own content sha; retryable outcomes are not
-- facts about the bytes and are never cached.
-- ----------------------------------------------------------------------------
create function hc.finalize_scan(
  p_arrival uuid, p_lease uuid, p_verdict text, p_detail jsonb default '{}'::jsonb)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare
  v hc.advance_result;
  v_to hc.arrival_state;
  v_reason text;
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

  v := hc.advance_arrival(p_arrival, 'stored', v_to, p_lease, v_reason);
  if v <> 'advanced' then
    return v;
  end if;

  update public.arrivals
     set scan_verdict = p_verdict, scan_at = now()
   where id = p_arrival
  returning content_sha256 into v_sha;

  -- The cache half: definitive verdicts only. Clean carries the 7-day
  -- freshness window; infected is RETAINED (PRD §11.5's hash+verdict
  -- evidence). A re-scan refreshes the row.
  if p_verdict in ('clean', 'infected') and v_sha is not null then
    insert into public.scan_results (content_sha256, verdict, detail, scanned_at, expires_at)
    values (v_sha, p_verdict, v_detail, now(),
            case when p_verdict = 'clean' then now() + interval '7 days' end)
    on conflict (content_sha256) do update
      set verdict = excluded.verdict, detail = excluded.detail,
          scanned_at = excluded.scanned_at, expires_at = excluded.expires_at;
  end if;

  return 'advanced'::hc.advance_result;
end $$;

alter function hc.finalize_scan(uuid, uuid, text, jsonb) owner to hc_internal;
revoke execute on function hc.finalize_scan(uuid, uuid, text, jsonb)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_scan(uuid, uuid, text, jsonb) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- hc.scan_cache_lookup — the worker's cache-hit read (LIVE rows only: an
-- expired clean verdict is a miss, never a stale fact).
-- ----------------------------------------------------------------------------
create function hc.scan_cache_lookup(p_sha256 bytea)
returns jsonb language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'verdict', r.verdict, 'detail', r.detail, 'scanned_at', r.scanned_at)
  from public.scan_results r
  where r.content_sha256 = p_sha256
    and (r.expires_at is null or r.expires_at > now());
$$;

alter function hc.scan_cache_lookup(bytea) owner to hc_internal;
revoke execute on function hc.scan_cache_lookup(bytea)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.scan_cache_lookup(bytea) to hc_pipeline;

-- ----------------------------------------------------------------------------
-- hc.expire_scan_results — the §11.5 retention sweep leg: clean rows past
-- their freshness window are deleted; infected rows (expires_at null) are
-- never touched. Scheduler identity, the expire_held_mail pattern.
-- ----------------------------------------------------------------------------
create function hc.expire_scan_results()
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare v_n int;
begin
  with d as (
    delete from public.scan_results
     where expires_at is not null and expires_at <= now()
    returning 1)
  select count(*)::int into v_n from d;
  return jsonb_build_object('removed', v_n);
end $$;

alter function hc.expire_scan_results() owner to hc_internal;
revoke execute on function hc.expire_scan_results()
  from public, anon, authenticated, hc_admin;
grant execute on function hc.expire_scan_results() to hc_pipeline;

-- ----------------------------------------------------------------------------
-- The pgmq work-item queue (§1.4). Creation is the migration runner's;
-- hc_pipeline receives the DATA plane only — the enumerated queue
-- operations (send/read/ack family) over their existing overloads, plus
-- the two queue tables the SQL API touches. Control-plane functions
-- (create, drop_queue, purge_queue, …) are deliberately NOT granted.
-- ----------------------------------------------------------------------------
select pgmq.create('pipeline_work');

grant usage on schema pgmq to hc_pipeline;
grant select, insert, update, delete on pgmq.q_pipeline_work to hc_pipeline;
grant select, insert                 on pgmq.a_pipeline_work to hc_pipeline;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'pgmq'
      and p.proname in ('send', 'send_batch', 'read', 'read_with_poll',
                        'pop', 'delete', 'archive', 'set_vt')
  loop
    execute format('grant execute on function %s to hc_pipeline', f.sig);
  end loop;
end
$$;
