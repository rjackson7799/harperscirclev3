-- ============================================================================
-- 2A · M1 — auth_attempts + progressive per-account throttling (TSD §5.6;
-- PRD §4.1.1, §4.1.7; AC-AUTH-12).
--
-- Throttling, not lockout: a hard lockout hands an estranged sibling a way
-- to lock a coordinator out of their mother's record from a coffee shop, on
-- demand. So the per-account dimension lives here as an existence-blind
-- ledger with a bounded, decaying delay; the per-network dimension is the
-- Vercel WAF (deploy-time, 2B). The invariant, and it is a test: no state a
-- stranger can put an account into that a legitimate holder cannot leave
-- within the hour (AC-AUTH-12) — the delay is boxed at 15 minutes from the
-- LATEST failure, and a success-class event (sign-in, completed email
-- reset) clears the counter instantly. The email reset path consults
-- nothing here, by construction: there is no machinery that could gate it.
--
-- The schedule (pinned by 035): failures counted in the TRAILING 15
-- minutes, and only those after the most recent success-class event;
-- required wait from the latest failure: n≤4 → 0 · 5–7 → 30 s · 8–9 →
-- 120 s · ≥10 → 900 s. 900 s IS the cap. The failure COUNT keeps counting
-- past the cap — the §5.6 suspicious-attempt notice (M5) reads it.
--
-- Existence-blind (§5.5 never enumerate): keyed on hc.contact_key(), no FK
-- to accounts, and the answer for an account-backed identifier is
-- byte-identical to a ghost's under identical histories. EXECUTE goes to
-- anon (sign-in, reset request) AND authenticated (§5.7 step-up re-auth —
-- without this, step-up would be an unthrottled password oracle for a
-- stolen session).
--
-- Ordering within a transaction is by identity `seq`, not timestamps —
-- now() is constant inside a transaction, so "failures after the last
-- success" cannot be a timestamp comparison (equal timestamps would make
-- clearing order-ambiguous). Time is used only for the trailing window and
-- the decay, where it is the meaning.
-- ============================================================================

create table public.auth_attempts (
  id           uuid primary key default gen_random_uuid(),
  seq          bigint generated always as identity,
  attempt_key  text not null,                    -- hc.contact_key(identifier); never ''
  outcome      text not null
               check (outcome in ('failure', 'success', 'reset_completed')),
  attempted_at timestamptz not null default now()
);
create index auth_attempts_by_key
  on public.auth_attempts (attempt_key, attempted_at desc);

alter table public.auth_attempts enable row level security;
alter table public.auth_attempts force  row level security;

revoke all on public.auth_attempts from anon, authenticated, hc_pipeline, hc_admin;

-- hc_internal writes through the two definers below; FORCE RLS applies to it
-- too, so each grant is paired with its named policy. DELETE exists only for
-- the same-key 24 h prune — the ledger is a window, not an archive.
grant select, insert, delete on public.auth_attempts to hc_internal;
grant usage on sequence public.auth_attempts_seq_seq to hc_internal;
create policy auth_attempts_internal on public.auth_attempts
  for select to hc_internal using (true);
create policy auth_attempts_internal_append on public.auth_attempts
  for insert to hc_internal with check (true);
create policy auth_attempts_internal_prune on public.auth_attempts
  for delete to hc_internal using (true);

-- ----------------------------------------------------------------------------
-- hc.auth_throttle(identifier) → {failures, wait_seconds}. Advisory and
-- STABLE: never raises, never writes; the app layer enforces the wait and
-- shows §4.1.7's level copy. Deterministic on the ledger contents.
-- ----------------------------------------------------------------------------
create function hc.auth_throttle(p_identifier text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  with k as (
    select hc.contact_key(p_identifier) as key),
  cut as (
    select coalesce(max(a.seq), 0) as after_seq
    from public.auth_attempts a, k
    where a.attempt_key = k.key
      and a.outcome in ('success', 'reset_completed')),
  f as (
    select count(*)::int as n, max(a.attempted_at) as last_at
    from public.auth_attempts a, k, cut
    where a.attempt_key = k.key
      and a.outcome = 'failure'
      and a.seq > cut.after_seq
      and a.attempted_at > now() - interval '15 minutes')
  select jsonb_build_object(
    'failures', f.n,
    'wait_seconds', greatest(0,
      case when f.n <= 4 then 0
           when f.n <= 7 then 30
           when f.n <= 9 then 120
           else 900 end
      - coalesce(extract(epoch from (now() - f.last_at)), 0)::int))
  from f;
$$;

-- anon has never needed to resolve names in hc before this slice — sign-in
-- is the first anon-callable surface. USAGE is name resolution only:
-- function EXECUTE stays deny-by-default (INV-13) and PostgREST exposure
-- stays pinned to [public, graphql_public] (PIN-01).
grant usage on schema hc to anon;

alter function hc.auth_throttle(text) owner to hc_internal;
revoke execute on function hc.auth_throttle(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.auth_throttle(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- hc.record_auth_attempt(identifier, outcome) → {failures}. The ONLY write
-- path. One refusal shape; a refused call writes nothing. Prunes the key's
-- rows older than 24 h on each write, so the ledger stays bounded without a
-- scheduled job.
-- ----------------------------------------------------------------------------
create function hc.record_auth_attempt(p_identifier text, p_outcome text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := hc.contact_key(p_identifier);
begin
  if coalesce(v_key, '') = ''
     or p_outcome is null
     or p_outcome not in ('failure', 'success', 'reset_completed') then
    raise exception 'auth_attempt_refused' using errcode = 'P0001';
  end if;

  delete from public.auth_attempts
   where attempt_key = v_key
     and attempted_at < now() - interval '24 hours';

  insert into public.auth_attempts (attempt_key, outcome)
  values (v_key, p_outcome);

  return jsonb_build_object(
    'failures', (hc.auth_throttle(p_identifier)->>'failures')::int);
end $$;

alter function hc.record_auth_attempt(text, text) owner to hc_internal;
revoke execute on function hc.record_auth_attempt(text, text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.record_auth_attempt(text, text) to anon, authenticated;
