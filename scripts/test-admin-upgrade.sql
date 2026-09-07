-- Two phases on a disposable pre-M1 clone. Never point this at staging.
\set ON_ERROR_STOP on
begin;
set local statement_timeout = '15s';
do $$ begin
  if current_database()<>'hc_admin_upgrade' then raise exception 'isolated_upgrade_database_required'; end if;
end $$;
create function pg_temp.check_ok(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%',label; end if; end $$;
\if :seed
select pg_temp.check_ok(to_regclass('hc.admin_auth_anchors') is null,'must start before M1');
select pg_temp.check_ok(not exists(select from auth.users),'must start with empty auth');
insert into auth.users(id,aud,role,email) values
('10000000-0000-4000-8000-000000000021','authenticated','authenticated','upgrade-admin@example.invalid'),
('10000000-0000-4000-8000-000000000022','authenticated','authenticated','upgrade-family@example.invalid');
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at) values
('20000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000021','totp','verified',now(),now()),
('20000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022','totp','verified',now(),now());
insert into auth.sessions(id,user_id,factor_id,aal) values
('30000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000021','20000000-0000-4000-8000-000000000021','aal2'),
('30000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000022','20000000-0000-4000-8000-000000000022','aal2');
insert into public.accounts(id,kind,display_name) values
('10000000-0000-4000-8000-000000000021','admin','Synthetic upgrade operator'),
('10000000-0000-4000-8000-000000000022','member','Synthetic upgrade family');
insert into public.admin_users(account_id,mfa_enrolled_at) values ('10000000-0000-4000-8000-000000000021',now());
select 'PASS: pre-M1 operator and family state committed' as upgrade_result;
\else
select pg_temp.check_ok((select proowner='postgres'::regrole from pg_proc where oid='public.hc_refresh_admin_auth(uuid)'::regprocedure),'refresh helper must be postgres owned');
select pg_temp.check_ok((select proowner='postgres'::regrole from pg_proc where oid='public.hc_sync_admin_auth()'::regprocedure),'trigger helper must be postgres owned');
select pg_temp.check_ok((select bool_and(relowner='postgres'::regrole) from pg_class where oid in ('hc.admin_auth_anchors'::regclass,'hc.admin_auth_factors'::regclass,'hc.admin_auth_sessions'::regclass)),'mirror tables must share maintenance ownership');
select pg_temp.check_ok((select count(*) from hc.admin_auth_anchors)=1,'backfill only registered operator');
select pg_temp.check_ok((select count(*) from hc.admin_auth_factors)=1,'family factor excluded');
select pg_temp.check_ok((select count(*) from hc.admin_auth_sessions)=1,'family session excluded');
select pg_temp.check_ok(exists(select from hc.admin_auth_sessions where id='30000000-0000-4000-8000-000000000021' and factor_id='20000000-0000-4000-8000-000000000021' and aal='aal2'),'existing session binding preserved');
select pg_temp.check_ok((select count(*) from auth.sessions)=2,'source sessions preserved');
select pg_temp.check_ok((select count(*) from auth.mfa_factors)=2,'source factors preserved');
select pg_temp.check_ok(not has_table_privilege('hc_admin','admin_meta.platform_stats','select'),'upgrade removes direct metadata read');
create function pg_temp.read_operator() returns jsonb language plpgsql as $$
declare answer jsonb;
begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-000000000021','session_id','30000000-0000-4000-8000-000000000021','aal','aal2','exp',extract(epoch from now()+interval '1 hour')::bigint)::text,true);
  set local role hc_admin;
  select admin_ops.read_platform_stats(gen_random_uuid()) into answer;
  reset role;
  return answer;
end $$;
select pg_temp.check_ok(pg_temp.read_operator()->>'kind'='ok','existing operator admitted after upgrade');
select pg_temp.check_ok((select count(*) from hc.admin_read_audit where outcome='ok')=1,'upgraded read audited');
delete from auth.mfa_factors where id='20000000-0000-4000-8000-000000000021';
select pg_temp.check_ok(pg_temp.read_operator()->>'kind'='denied','post-upgrade removal denies existing session');
select pg_temp.check_ok((select count(*) from hc.admin_auth_factors)=0,'post-upgrade trigger removes factor');
select 'PASS: migration backfill, family exclusion, source preservation, admission, audit and revocation' as upgrade_result;
\endif
commit;
