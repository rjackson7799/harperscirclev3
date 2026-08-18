-- ============================================================================
-- 2A · M5 — the "this wasn't me" link (TSD §5.11; PRD §4.1.7) + the §5.9
-- security-class outbound split, built exactly as far as this slice's
-- notices require (delivery, templates and the other messages are
-- slice 11).
--
-- The §5.11 control is a kill switch: it terminates every session and
-- forces a password reset, so whoever holds the mailbox holds it. The
-- design consequences, all structural here:
--   · The plaintext token exists in exactly ONE place — the queued mail
--     payload, which nothing request-path can read. It is NEVER returned
--     to the sign-in caller, because the sign-in caller is the attacker
--     whose failures produced the notice.
--   · The token is a COLUMN of its security event (sha256-only, unique):
--     "bound to the specific security event that produced it" is
--     structural, not referential.
--   · 15-minute expiry from mint, §5.11 verbatim. (Round-9 pointed
--     question: a link read an hour after the incident is dead; the spec
--     text is unambiguous, so it is built as written.)
--   · Destruction happens only on the app layer's explicit POST calling
--     hc.execute_wasnt_me — the GET renders a confirmation page and
--     touches nothing (corporate scanners pre-fetch links).
--   · Non-enumerating end to end: note_suspicious_attempts answers a
--     byte-identical {noted:true} whether the identifier maps to an
--     account or not; execute refuses garbage, replays and expiries in
--     one shape.
--
-- accounts.email joins the M3 mirror (auth is ungrantable from
-- migrations): the two postgres-owned trigger functions are re-created to
-- carry email alongside email_confirmed_at, and existing rows are
-- backfilled once, here, as postgres.
-- ============================================================================

alter table public.accounts add column email extensions.citext;

create or replace function public.hc_mirror_email_verified_on_account()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select u.email_confirmed_at, u.email::extensions.citext
    into new.email_verified_at, new.email
  from auth.users u where u.id = new.id;
  return new;
end $$;

create or replace function public.hc_mirror_email_verified_on_confirm()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.accounts
     set email_verified_at = new.email_confirmed_at,
         email = new.email::extensions.citext
   where id = new.id;
  return null;
end $$;

drop trigger users_mirror_email_confirmed on auth.users;
create trigger users_mirror_email_confirmed
  after update of email_confirmed_at, email on auth.users
  for each row execute function public.hc_mirror_email_verified_on_confirm();

update public.accounts a
   set email = u.email::extensions.citext
  from auth.users u
 where u.id = a.id and a.email is null;

-- ----------------------------------------------------------------------------
-- outbound_mail — the §5.9 split as a column. Zero request-path
-- privileges in either direction; hc_internal enqueues; the slice-11
-- sender will drain as hc_pipeline (grants land with that worker).
-- ----------------------------------------------------------------------------
create table public.outbound_mail (
  id                   uuid primary key default gen_random_uuid(),
  class                text not null check (class in ('security', 'record')),
  template             text not null,
  recipient_account_id uuid references public.accounts(id),
  recipient_email      extensions.citext not null,
  payload              jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);
create index outbound_mail_unsent on public.outbound_mail (created_at)
  where sent_at is null;

alter table public.outbound_mail enable row level security;
alter table public.outbound_mail force  row level security;
revoke all on public.outbound_mail from anon, authenticated, hc_pipeline, hc_admin;
grant select, insert on public.outbound_mail to hc_internal;
create policy outbound_mail_internal on public.outbound_mail
  for select to hc_internal using (true);
create policy outbound_mail_internal_enqueue on public.outbound_mail
  for insert to hc_internal with check (true);

-- ----------------------------------------------------------------------------
-- security_events — account-scoped (pre-circle; access_log is circle
-- evidence and this is not that). The token is sha256-only and lives ON
-- the event.
-- ----------------------------------------------------------------------------
create table public.security_events (
  id                uuid primary key default gen_random_uuid(),
  account_id        uuid not null references public.accounts(id),
  kind              text not null check (kind in ('suspicious_signin')),
  detail            jsonb not null default '{}'::jsonb,
  token_hash        bytea not null unique,
  token_expires_at  timestamptz not null,
  token_consumed_at timestamptz,
  created_at        timestamptz not null default now()
);
create index security_events_by_account on public.security_events (account_id, created_at);

alter table public.security_events enable row level security;
alter table public.security_events force  row level security;
revoke all on public.security_events from anon, authenticated, hc_pipeline, hc_admin;
grant select, insert, update on public.security_events to hc_internal;
create policy security_events_internal on public.security_events
  for select to hc_internal using (true);
create policy security_events_internal_note on public.security_events
  for insert to hc_internal with check (true);
create policy security_events_internal_consume on public.security_events
  for update to hc_internal using (true) with check (true);

-- ----------------------------------------------------------------------------
-- hc.note_suspicious_attempts(identifier) → {noted: true}, always.
-- ----------------------------------------------------------------------------
create function hc.note_suspicious_attempts(p_identifier text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
  v_email   text;
  v_failures int;
  v_token   text;
  v_event   uuid;
begin
  -- Re-derive the count; never trust the caller's report.
  v_failures := (hc.auth_throttle(p_identifier) ->> 'failures')::int;

  select a.id, a.email::text into v_account, v_email
  from public.accounts a
  where lower(a.email::text) = lower(btrim(coalesce(p_identifier, '')))
    and a.deleted_at is null;

  if v_account is not null
     and v_failures >= 5
     -- cadence: one live notice per account — the mailbox is not
     -- floodable from the sign-in form
     and not exists (select 1 from public.security_events e
                     where e.account_id = v_account
                       and e.token_consumed_at is null
                       and e.token_expires_at > now()) then
    v_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.security_events
      (account_id, kind, detail, token_hash, token_expires_at)
    values
      (v_account, 'suspicious_signin',
       jsonb_build_object('failures', v_failures),
       extensions.digest(v_token, 'sha256'), now() + interval '15 minutes')
    returning id into v_event;

    -- The ONLY place the plaintext exists. Security class: goes to the
    -- verified account address, carries no subject, domain or record
    -- information (§5.9).
    insert into public.outbound_mail
      (class, template, recipient_account_id, recipient_email, payload)
    values
      ('security', 'suspicious_signin', v_account, v_email,
       jsonb_build_object('token', v_token, 'event_id', v_event));
  end if;

  -- Byte-identical for account and ghost, threshold or not (§5.5).
  return jsonb_build_object('noted', true);
end $$;

alter function hc.note_suspicious_attempts(text) owner to hc_internal;
revoke execute on function hc.note_suspicious_attempts(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.note_suspicious_attempts(text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- hc.execute_wasnt_me(token) → {account_id}. The app layer then kills
-- every session and forces the reset (GoTrue admin API, 2B), from the
-- confirmation page's POST and nowhere else.
-- ----------------------------------------------------------------------------
create function hc.execute_wasnt_me(p_token text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_account uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'wasnt_me_refused' using errcode = 'P0001';
  end if;

  update public.security_events e
     set token_consumed_at = now()
   where e.token_hash = extensions.digest(p_token, 'sha256')
     and e.token_expires_at > now()
     and e.token_consumed_at is null
  returning e.account_id into v_account;

  if v_account is null then
    -- unknown, expired, replayed: one shape, no oracle
    raise exception 'wasnt_me_refused' using errcode = 'P0001';
  end if;

  return jsonb_build_object('account_id', v_account);
end $$;

alter function hc.execute_wasnt_me(text) owner to hc_internal;
revoke execute on function hc.execute_wasnt_me(text)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.execute_wasnt_me(text) to anon, authenticated;
