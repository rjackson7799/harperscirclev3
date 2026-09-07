-- Run only on the isolated CI clone; errors abort and all fixtures roll back.
begin;
set local statement_timeout = '15s';
do $$ begin
  if current_database() <> 'hc_admin_probe' then raise exception 'isolated_database_required'; end if;
  if has_table_privilege('hc_admin','admin_meta.platform_stats','select') then
    raise exception 'unaudited_metadata_select_still_granted';
  end if;
end $$;
rollback;
