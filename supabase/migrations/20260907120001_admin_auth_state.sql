-- Slice 10A M1 of 2, owner approved after c4a561c. Capability proof 4443b36.
-- Synchronous nonsecret operator auth mirrors. No request-role auth access.
begin;
lock table public.admin_users, auth.sessions, auth.mfa_factors in share row exclusive mode;
alter table public.admin_users add column revoked_at timestamptz;

create table hc.admin_auth_anchors(account_id uuid primary key);
create table hc.admin_auth_factors(id uuid primary key, account_id uuid not null, status text not null);
create table hc.admin_auth_sessions(id uuid primary key, account_id uuid not null, factor_id uuid, aal text, not_after timestamptz);
create index admin_auth_factors_account on hc.admin_auth_factors(account_id);
create index admin_auth_sessions_account on hc.admin_auth_sessions(account_id);
alter table hc.admin_auth_anchors enable row level security;
alter table hc.admin_auth_anchors force row level security;
alter table hc.admin_auth_factors enable row level security;
alter table hc.admin_auth_factors force row level security;
alter table hc.admin_auth_sessions enable row level security;
alter table hc.admin_auth_sessions force row level security;
revoke all on hc.admin_auth_anchors,hc.admin_auth_factors,hc.admin_auth_sessions from public,anon,authenticated,hc_admin,hc_pipeline,hc_internal;
grant select on hc.admin_auth_anchors,hc.admin_auth_factors,hc.admin_auth_sessions to hc_internal;
-- SELECT FOR SHARE needs UPDATE privilege AND its USING policy. WITH CHECK
-- false rejects every actual row update while allowing the locking read.
grant update(account_id) on hc.admin_auth_anchors to hc_internal;
create policy admin_anchor_read on hc.admin_auth_anchors for select to hc_internal using(true);
create policy admin_anchor_lock on hc.admin_auth_anchors for update to hc_internal using(true) with check(false);
create policy admin_factor_read on hc.admin_auth_factors for select to hc_internal using(true);
create policy admin_session_read on hc.admin_auth_sessions for select to hc_internal using(true);
grant select on public.admin_users to hc_internal;
create policy admin_registration_read on public.admin_users for select to hc_internal using(true);

-- postgres ownership follows the existing auth email-mirror precedent. Nothing
-- request-callable can refresh or write these mirrors. Retain anchor tombstones
-- on removal so in-flight readers and removals always serialize on the same row.
create function public.hc_refresh_admin_auth(p_account uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_account is null then return; end if;
  if not exists(select from public.admin_users where account_id=p_account)
    and not exists(select from hc.admin_auth_anchors where account_id=p_account) then return; end if;
  insert into hc.admin_auth_anchors values(p_account)
    on conflict(account_id) do update set account_id=excluded.account_id;
  delete from hc.admin_auth_factors where account_id=p_account;
  delete from hc.admin_auth_sessions where account_id=p_account;
  if exists(select from public.admin_users where account_id=p_account) then
    insert into hc.admin_auth_factors select id,user_id,status::text from auth.mfa_factors where user_id=p_account;
    insert into hc.admin_auth_sessions select id,user_id,factor_id,aal::text,not_after from auth.sessions where user_id=p_account;
  end if;
end $$;
revoke all on function public.hc_refresh_admin_auth(uuid) from public,anon,authenticated,hc_admin,hc_pipeline,hc_internal;

create function public.hc_sync_admin_auth() returns trigger
language plpgsql security definer set search_path='' as $$
declare old_account uuid; new_account uuid; actor uuid;
begin
  if tg_table_name='admin_users' then
    if tg_op<>'INSERT' then old_account:=old.account_id; end if;
    if tg_op<>'DELETE' then new_account:=new.account_id; end if;
  elsif tg_table_name='accounts' then
    if tg_op<>'INSERT' then old_account:=old.id; end if;
    if tg_op<>'DELETE' then new_account:=new.id; end if;
  else
    if tg_op<>'INSERT' then old_account:=old.user_id; end if;
    if tg_op<>'DELETE' then new_account:=new.user_id; end if;
  end if;
  -- Reassignments refresh both identities in deterministic order.
  for actor in select distinct x from unnest(array[old_account,new_account]) x where x is not null order by x loop
    perform public.hc_refresh_admin_auth(actor);
  end loop;
  return null;
end $$;
revoke all on function public.hc_sync_admin_auth() from public,anon,authenticated,hc_admin,hc_pipeline,hc_internal;
create trigger hc_admin_factor_sync after insert or update or delete on auth.mfa_factors for each row execute function public.hc_sync_admin_auth();
create trigger hc_admin_session_sync after insert or update or delete on auth.sessions for each row execute function public.hc_sync_admin_auth();
create trigger hc_admin_registration_sync after insert or update or delete on public.admin_users for each row execute function public.hc_sync_admin_auth();
create trigger hc_admin_account_sync after update of kind,deleted_at or delete on public.accounts for each row execute function public.hc_sync_admin_auth();
do $$ declare actor uuid; begin
  for actor in select account_id from public.admin_users order by account_id loop
    perform public.hc_refresh_admin_auth(actor);
  end loop;
end $$;
commit;
