-- Run only on the isolated CI clone; errors abort and all fixtures roll back.
begin;
set local statement_timeout = '15s';
do $$ begin
  if current_database() <> 'hc_admin_probe' then raise exception 'isolated_database_required'; end if;
  if has_table_privilege('hc_admin','admin_meta.platform_stats','select') then
    raise exception 'unaudited_metadata_select_still_granted';
  end if;
end $$;
create function pg_temp.check_ok(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', label; end if; end $$;
create function pg_temp.admin_read(claims jsonb) returns jsonb language plpgsql as $$
declare result jsonb;
begin
  perform set_config('request.jwt.claims',claims::text,true);
  set local role hc_admin;
  select admin_ops.read_platform_stats(gen_random_uuid()) into result;
  reset role;
  return result;
end $$;

-- Register AFTER factors/sessions exist: registration must backfill live state.
insert into auth.users(id,aud,role,email) values
('10000000-0000-4000-8000-000000000011','authenticated','authenticated','admin-boundary@example.invalid');
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
('20000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011','totp','verified',now(),now());
insert into auth.sessions(id,user_id,factor_id,aal) values
('30000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011','20000000-0000-4000-8000-000000000011','aal2');
insert into public.accounts(id,kind,display_name) values
('10000000-0000-4000-8000-000000000011','admin','Synthetic operator');
insert into public.admin_users(account_id,mfa_enrolled_at) values
('10000000-0000-4000-8000-000000000011',now());
select set_config('test.admin_claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000011',
 'session_id','30000000-0000-4000-8000-000000000011','aal','aal2','exp',extract(epoch from now()+interval '1 hour')::bigint)::text,true);

select pg_temp.check_ok(pg_temp.admin_read('{}')->>'kind'='denied','missing identity denied');
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb)->>'kind'='ok','valid operator admitted');
select pg_temp.check_ok((select count(*) from hc.admin_read_audit where outcome='ok')=1,'successful read audited once');
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb)->>'kind'='ok','repeat read succeeds');
select pg_temp.check_ok((select count(*) from hc.admin_read_audit where outcome='ok')=2,'repeat read gets separate audit');
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb || '{"aal":"aal1"}')->>'kind'='denied','aal1 denied');
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb || '{"exp":1}')->>'kind'='denied','expired token denied');
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb || '{"session_id":"bad"}')->>'kind'='denied','malformed identity denied');
update public.admin_users set revoked_at=now();
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb)->>'kind'='denied','revoked operator denied');
update public.admin_users set revoked_at=null;
savepoint enrolled;
delete from auth.mfa_factors where id='20000000-0000-4000-8000-000000000011';
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb)->>'kind'='denied','removed factor denied');
rollback to enrolled;
delete from auth.sessions where id='30000000-0000-4000-8000-000000000011';
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb)->>'kind'='denied','removed session denied');
rollback to enrolled;
delete from public.admin_users;
select pg_temp.check_ok(pg_temp.admin_read(current_setting('test.admin_claims')::jsonb)->>'kind'='denied','removed registration denied');
rollback to enrolled;

select pg_temp.check_ok(not has_schema_privilege('hc_admin','hc','usage'),'admin cannot reach mirror schema');
select pg_temp.check_ok(not has_table_privilege('authenticated','hc.admin_auth_sessions','select,insert,update,delete'),'family cannot forge mirrors');
select pg_temp.check_ok(not has_function_privilege('authenticated','admin_ops.read_platform_stats(uuid)','execute'),'family cannot execute admin reader');
select pg_temp.check_ok(not has_table_privilege('hc_admin','public.documents','select'),'record content still inaccessible');
create view admin_meta.zz_future_probe as select 1 as n;
select pg_temp.check_ok(not has_table_privilege('hc_admin','admin_meta.zz_future_probe','select'),'future views deny direct reads');

select 'PASS: admission, audit, revocation, registration backfill and privilege checks' as boundary_result;
rollback;
