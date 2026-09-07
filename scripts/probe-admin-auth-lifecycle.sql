-- Capability test ONLY, not a migration. Run against a disposable Supabase
-- database named hc_admin_probe with its real auth schema already installed.
-- Never rename a shared database to satisfy this guard. No data is copied in.
-- Every object and synthetic row below is rolled back. ON_ERROR_STOP is also
-- required by the invoking psql runner, so an assertion cannot be overlooked.
begin;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
do $$ begin
  if current_database() <> 'hc_admin_probe' then
    raise exception 'isolated_database_required';
  end if;
end $$;
set local role postgres;

create temporary table probe_factors (id uuid primary key, user_id uuid, status text);
create temporary table probe_sessions (id uuid primary key, user_id uuid, factor_id uuid, aal text, not_after timestamptz);
create function pg_temp.probe_factor_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from pg_temp.probe_factors where id = old.id;
  else
    insert into pg_temp.probe_factors values (new.id, new.user_id, new.status::text)
    on conflict (id) do update set user_id = excluded.user_id, status = excluded.status;
  end if;
  return null;
end $$;
create function pg_temp.probe_session_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from pg_temp.probe_sessions where id = old.id;
  else
    insert into pg_temp.probe_sessions values (new.id, new.user_id, new.factor_id, new.aal::text, new.not_after)
    on conflict (id) do update set user_id = excluded.user_id,
      factor_id = excluded.factor_id, aal = excluded.aal, not_after = excluded.not_after;
  end if;
  return null;
end $$;
create trigger hc_admin_probe_factor after insert or update or delete on auth.mfa_factors
for each row execute function pg_temp.probe_factor_sync();
create trigger hc_admin_probe_session after insert or update or delete on auth.sessions
for each row execute function pg_temp.probe_session_sync();

-- These functions mirror ONLY nonsecret state. This probe does not grant any
-- application role auth-schema access or install a persistent mirror.
insert into auth.users (id, aud, role, email)
values ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'admin-probe@example.invalid');
insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'totp', 'unverified', now(), now());
insert into auth.sessions (id, user_id, factor_id, aal)
values ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'aal1');
do $$ begin
  if (select count(*) from pg_temp.probe_factors where status = 'unverified') <> 1
    or (select count(*) from pg_temp.probe_sessions where aal = 'aal1') <> 1 then
    raise exception 'insert_mirror_failed';
  end if;
end $$;
update auth.mfa_factors set status = 'verified' where id = '20000000-0000-4000-8000-000000000001';
update auth.sessions set aal = 'aal2', not_after = now() + interval '1 hour'
where id = '30000000-0000-4000-8000-000000000001';
do $$ begin
  if (select count(*) from pg_temp.probe_factors where status = 'verified') <> 1
    or (select count(*) from pg_temp.probe_sessions where aal = 'aal2' and not_after > now()) <> 1 then
    raise exception 'update_mirror_failed';
  end if;
end $$;
savepoint before_removal;
delete from auth.mfa_factors where id = '20000000-0000-4000-8000-000000000001';
delete from auth.sessions where id = '30000000-0000-4000-8000-000000000001';
do $$ begin
  if exists (select from pg_temp.probe_factors) or exists (select from pg_temp.probe_sessions) then
    raise exception 'delete_mirror_failed';
  end if;
end $$;
rollback to savepoint before_removal;
do $$ begin
  if (select count(*) from pg_temp.probe_factors) <> 1 or (select count(*) from pg_temp.probe_sessions) <> 1 then
    raise exception 'rollback_mirror_failed';
  end if;
end $$;
delete from auth.users where id = '10000000-0000-4000-8000-000000000001';
do $$ begin
  if exists (select from pg_temp.probe_factors) or exists (select from pg_temp.probe_sessions) then
    raise exception 'cascade_mirror_failed';
  end if;
end $$;
select 'PASS: trigger creation, insert, update, delete, rollback, user cascade' as capability_result;
rollback;
-- Still owed: actual GoTrue enrollment/unenrollment and session lifecycle,
-- concurrent admission versus revocation in both orders, protected mirror
-- permissions, upgrade/backfill and factor reassignment. Not acceptance proof.
