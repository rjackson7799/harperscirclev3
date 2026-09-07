-- Slice 10A M2 of 2. Read-only platform counts via one audited operation.
-- This is the owner's explicit amendment to direct admin_meta SELECT.
revoke select on all tables in schema admin_meta from hc_admin;
alter default privileges in schema admin_meta revoke select on tables from hc_admin;
alter default privileges for role hc_internal in schema admin_meta revoke select on tables from hc_admin;

create table hc.admin_read_audit(
  request_id uuid primary key,
  actor_account_id uuid,
  actor_session_id uuid,
  operation text not null check(operation='read_platform_stats'),
  outcome text not null check(outcome in ('ok','denied','unavailable')),
  occurred_at timestamptz not null default clock_timestamp()
);
alter table hc.admin_read_audit enable row level security;
alter table hc.admin_read_audit force row level security;
revoke all on hc.admin_read_audit from public,anon,authenticated,hc_admin,hc_pipeline,hc_internal;
grant insert on hc.admin_read_audit to hc_internal;
create policy admin_audit_append on hc.admin_read_audit for insert to hc_internal with check(true);
grant usage,create on schema admin_ops to hc_internal;

create function admin_ops.read_platform_stats(p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare claims jsonb; actor uuid; session_id uuid; expiry numeric;
  valid boolean:=false; bound boolean:=false; stats jsonb;
  outcome text:='denied'; request_id uuid:=coalesce(p_request_id,gen_random_uuid());
begin
  begin
    claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
    actor:=(claims->>'sub')::uuid;
    session_id:=(claims->>'session_id')::uuid;
    expiry:=(claims->>'exp')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    actor:=null; session_id:=null; expiry:=null;
  end;
  if actor is not null and session_id is not null
    and current_setting('transaction_isolation')='read committed' then
    -- Auth/registration writers take this same row before refreshing mirrors.
    -- Do not lock auth or registration rows here (that reverses writer order).
    perform 1 from hc.admin_auth_anchors where account_id=actor for share;
    if found then
      select exists(select from hc.admin_auth_sessions s where s.id=session_id and s.account_id=actor) into bound;
      select exists(select from public.admin_users a join public.accounts u on u.id=a.account_id
        join hc.admin_auth_sessions s on s.account_id=a.account_id
        join hc.admin_auth_factors f on f.id=s.factor_id and f.account_id=a.account_id
        where a.account_id=actor and a.revoked_at is null and u.kind='admin' and u.deleted_at is null
        and s.id=session_id and s.aal='aal2' and f.status='verified'
        and (s.not_after is null or s.not_after>clock_timestamp())) into valid;
    end if;
  end if;
  valid:=coalesce(valid and p_request_id is not null and claims->>'aal'='aal2'
    and jsonb_typeof(claims->'exp')='number'
    and expiry>extract(epoch from clock_timestamp()),false);
  if valid then
    begin
      select to_jsonb(s) into stats from admin_meta.platform_stats s;
      if stats is null then outcome:='unavailable'; else outcome:='ok'; end if;
    exception when others then outcome:='unavailable'; stats:=null;
    end;
  end if;
  -- Failure to insert propagates: the application must never release counts
  -- on an audit failure or an unknown commit result. No raw error is returned.
  insert into hc.admin_read_audit(request_id,actor_account_id,actor_session_id,operation,outcome)
  values(request_id,case when bound then actor end,case when bound then session_id end,'read_platform_stats',outcome);
  if outcome='ok' then return jsonb_build_object('kind','ok','stats',stats); end if;
  return jsonb_build_object('kind',outcome);
end $$;
alter function admin_ops.read_platform_stats(uuid) owner to hc_internal;
revoke all on function admin_ops.read_platform_stats(uuid) from public,anon,authenticated,hc_admin,hc_pipeline;
grant execute on function admin_ops.read_platform_stats(uuid) to hc_admin;
