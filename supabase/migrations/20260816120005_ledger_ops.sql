-- ============================================================================
-- 1D · M5 — operational surfaces: the reclassify request path (TNT-08),
-- OPS-01's sweep scheduling and alert surface, and the §2.9/§2.8 ledger
-- interfaces.
--
-- RECLASSIFY (TNT-08 hardening, ADR-0009): as an owner-only function the
-- authorization was the raw grant-vector containment check — freeze-blind
-- and ceiling-blind, which its trusted callers made harmless. As the
-- re-categorisation surface's request-path entry point it authorizes
-- through hc.visible_at — the ONE function — so freeze, the FRZ-13 cap,
-- the care ceiling and taint containment all bind, evaluated under the
-- per-circle lock against the re-read row (R-rule; concurrency cases 9,
-- 24, 25). An UNRESOLVED object now requires manage-on-five to touch —
-- the same fail-closed arithmetic as every other surface (VIS-02).
-- Everything below the authorization block is byte-identical to round 6.
--
-- SWEEP (OPS-01, ruled in ADR-0009): scheduler identity is the RLY-01
-- worker runtime connecting as hc_pipeline (Vercel Cron: sweeper_pass
-- per minute — granted in 1C; hc.run_taint_sweep nightly). Every taint
-- sweep records a row in hc.sweep_runs; admin_meta.sweep_health is the
-- operator's alert surface (page on findings > 0 — a defect signal; page
-- on last_run_at older than 24 h — the max tolerated taint-inconsistency
-- window). Retry policy: the pass is idempotent, the next tick is the
-- retry; a failed run's row rolls back with it, so a missing row IS the
-- alert. Runtime bounds: the worker sets statement_timeout = 60 s; batch
-- is bounded by Phase-1 scale (PRD §13.3). Failure posture stays
-- over-taint: findings are marked unresolved, never widened.
--
-- LEDGER (§2.9, §2.8): schema `ledger` is the LOCAL STAND-IN for the
-- ledger instance (separate Postgres, own PITR lineage, in production —
-- ADR-0009 records the stand-in and the migration path). tombstones:
-- never the content, never a title, never a filename; written
-- synchronously by hc.record_tombstone — owner-only until the deletion
-- surface (DEL-01) lands; append-only except the purge job's executed_at
-- mark (strict trigger carve-out). log_head_signatures: the §2.8 daily
-- signer's store — SIG-01 staged; append-only, unreadable, unwritable by
-- every request path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · Reclassify: authorize through the one function; open the door.
-- ----------------------------------------------------------------------------
create or replace function hc.reclassify_taint(p_object_type hc.object_type, p_object_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  c_depth constant int := 32;
  v_obj record;
  v_ctx jsonb;
  v_before hc.domain[];
  v_after  hc.domain[];
  v_changed int;
  v_pass int := 0;
  r record;
  v_want hc.domain[];
  v_current hc.domain[];
begin
  -- Discovery only — the lock is keyed on the circle.
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'reclassify_refused' using errcode = 'P0001';
  end if;

  -- R-rule: lock, RE-READ, then authorize against the CURRENT taint —
  -- the one the shrink will actually operate on.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_obj.circle_id::text));
  select * into v_obj from hc.resolve_object(p_object_type, p_object_id);
  if v_obj.circle_id is null then
    raise exception 'reclassify_refused' using errcode = 'P0001';
  end if;

  -- TNT-08 (1D): manage on the current taint THROUGH hc.visible_at, so
  -- freeze, cap, ceiling and containment all bind. owner_member is null
  -- deliberately: the shrink path never rides the own-task exception.
  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_obj.subject_id, v_obj.taint, v_obj.taint_resolved,
                   p_object_type, p_object_id, null) < 'manage' then
    raise exception 'reclassify_refused' using errcode = 'P0001';
  end if;

  v_before := v_obj.taint;

  begin
    -- Fixed point over the affected set. The edge graph is stable under
    -- the advisory lock, so re-walking it each pass is the same set.
    loop
      v_pass := v_pass + 1;
      v_changed := 0;
      for r in
        with recursive down(object_type, object_id, depth) as (
            select p_object_type, p_object_id, 0
          union
            select e.child_type, e.child_id, d.depth + 1
            from public.provenance_edges e
            join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
            where d.depth < c_depth
        )
        select object_type, object_id from down
        group by object_type, object_id
        having min(depth) < c_depth
        order by case object_type when 'document' then 0 when 'episode' then 1
                      when 'profile_fact' then 2 when 'task' then 3 else 4 end,
                 object_id
      loop
        select hc.taint_union(
                 array[o.own]::hc.domain[],
                 coalesce((select hc.taint_union_agg(p2.taint)
                           from public.provenance_edges e
                           join lateral hc.resolve_object(e.parent_type, e.parent_id) p2 on true
                           where e.child_type = r.object_type and e.child_id = r.object_id),
                          '{}'::hc.domain[])),
               o.taint
          into v_want, v_current
        from hc.resolve_object(r.object_type, r.object_id) o;

        if v_want is distinct from v_current then
          perform set_config('hc.reclassifying', r.object_id::text, true);
          perform hc.apply_taint(r.object_type, r.object_id, v_want, true);
          perform set_config('hc.reclassifying', '', true);
          v_changed := v_changed + 1;
        end if;
      end loop;
      exit when v_changed = 0 or v_pass >= c_depth;
    end loop;

    -- Frontier nodes (AT the cap): never guessed, marked.
    for r in
      with recursive down(object_type, object_id, depth) as (
          select p_object_type, p_object_id, 0
        union
          select e.child_type, e.child_id, d.depth + 1
          from public.provenance_edges e
          join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
          where d.depth < c_depth
      )
      select object_type, object_id from down
      group by object_type, object_id
      having min(depth) = c_depth
    loop
      perform hc.mark_unresolved_one(r.object_type, r.object_id);
    end loop;
  exception when others then
    perform set_config('hc.reclassifying', '', true);
    perform hc.mark_unresolved_one(p_object_type, p_object_id);
    return jsonb_build_object('object_id', p_object_id, 'completed', false);
  end;

  select r2.taint into v_after from hc.resolve_object(p_object_type, p_object_id) r2;
  perform hc.log(v_obj.circle_id, 'audience_changed', 'Reclassification',
                 p_subject_id => v_obj.subject_id,
                 p_object_type => p_object_type, p_object_id => p_object_id,
                 p_detail => jsonb_build_object(
                   'audience_before', to_jsonb(v_before),
                   'audience_after',  to_jsonb(v_after)));

  return jsonb_build_object('object_id', p_object_id, 'completed', true,
                            'taint_before', to_jsonb(v_before),
                            'taint_after',  to_jsonb(v_after));
end $$;

-- ownership/pins survive CREATE OR REPLACE; the grant is the delta
grant execute on function hc.reclassify_taint(hc.object_type, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2 · OPS-01: recorded sweeps and the alert surface.
-- ----------------------------------------------------------------------------
create table hc.sweep_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('provenance', 'pipeline')),
  -- clock_timestamp, not now(): two runs in one transaction (tests; a
  -- future batch runner) must still order, and sweep_health picks the
  -- LATEST run's findings by this column
  started_at  timestamptz not null default clock_timestamp(),
  finished_at timestamptz,
  findings    int,
  detail      jsonb not null default '{}'
);

revoke all on hc.sweep_runs from anon, authenticated, hc_pipeline, hc_admin;
grant select, insert, update on hc.sweep_runs to hc_internal;

create function hc.run_taint_sweep() returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_run uuid;
  v_found int;
begin
  insert into hc.sweep_runs (kind) values ('provenance') returning id into v_run;
  v_found := hc.sweep_provenance();
  update hc.sweep_runs
     set finished_at = clock_timestamp(),
         findings = v_found,
         detail = jsonb_build_object(
           'edges', (select count(*) from public.provenance_edges))
   where id = v_run;
  return v_found;
end $$;

alter function hc.run_taint_sweep() owner to hc_internal;
revoke execute on function hc.run_taint_sweep()
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.run_taint_sweep() to hc_pipeline;

create view admin_meta.sweep_health as
select r.kind,
       max(r.started_at) as last_run_at,
       (array_agg(r.findings order by r.started_at desc))[1] as last_findings,
       count(*) filter (where r.started_at >= now() - interval '24 hours')
         as runs_24h,
       coalesce(sum(r.findings) filter
                  (where r.started_at >= now() - interval '24 hours'), 0)
         as findings_24h
from hc.sweep_runs r
group by r.kind;

alter view admin_meta.sweep_health owner to hc_internal;
grant select on admin_meta.sweep_health to hc_admin;

-- ----------------------------------------------------------------------------
-- 3 · The deletion ledger and the signature store.
-- No FKs into public by design: on the ledger INSTANCE the primary's
-- tables do not exist, and the local stand-in must not promise a join the
-- production shape cannot keep.
-- ----------------------------------------------------------------------------
create schema ledger;

-- the writer definer (hc_internal) must resolve ledger.* names; nothing
-- request-facing ever gets USAGE here
grant usage on schema ledger to hc_internal;

create table ledger.tombstones (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null,
  object_type   text not null,
  object_id     uuid,
  storage_keys  text[] not null default '{}',
  scope         text not null check (scope in ('item', 'arrival', 'member', 'circle')),
  requested_by  uuid,
  requested_at  timestamptz not null,
  executed_at   timestamptz,
  reason        text
  -- never the content, never a title, never a filename (§2.9)
);
create index tombstones_by_circle on ledger.tombstones (circle_id, requested_at);

alter table ledger.tombstones enable row level security;
alter table ledger.tombstones force  row level security;
revoke all on ledger.tombstones from anon, authenticated, hc_pipeline, hc_admin;
grant select, insert on ledger.tombstones to hc_internal;
create policy tombstones_internal on ledger.tombstones
  for select to hc_internal using (true);
create policy tombstones_internal_write on ledger.tombstones
  for insert to hc_internal with check (true);

-- Append-only, with the §2.9 carve-out: the purge job marks executed_at
-- ONCE, nothing else ever changes, and rows are never deleted.
create function hc.tombstone_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.executed_at is null
     and new.executed_at is not null
     and (to_jsonb(new) - 'executed_at') = (to_jsonb(old) - 'executed_at')
  then
    return new;
  end if;
  raise exception 'tombstones are append-only; only the purge job''s executed_at mark is admissible (§2.9)'
    using errcode = '42501';
end $$;
alter function hc.tombstone_guard() owner to hc_internal;

create trigger hc_guard_tombstones
  before update or delete on ledger.tombstones
  for each row execute function hc.tombstone_guard();

-- The synchronous writer (§2.9): called IN the deletion request's
-- transaction when DEL-01 lands; owner-only until then.
create function hc.record_tombstone(
  p_circle_id uuid, p_object_type text, p_object_id uuid,
  p_storage_keys text[], p_scope text, p_requested_by uuid, p_reason text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into ledger.tombstones
    (circle_id, object_type, object_id, storage_keys, scope, requested_by,
     requested_at, reason)
  values
    (p_circle_id, p_object_type, p_object_id, coalesce(p_storage_keys, '{}'),
     p_scope, p_requested_by, now(), p_reason)
  returning id into v_id;
  return v_id;
end $$;

alter function hc.record_tombstone(uuid, text, uuid, text[], text, uuid, text)
  owner to hc_internal;
revoke execute on function hc.record_tombstone(uuid, text, uuid, text[], text, uuid, text)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- The daily signer's store (§2.8). The signer worker carries its own
-- credential when SIG-01 lands; nothing here is reachable until then.
create table ledger.log_head_signatures (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null,
  seq         bigint not null,
  entry_hash  bytea not null,
  signature   bytea not null,
  key_id      text not null,
  signed_at   timestamptz not null default now(),
  unique (circle_id, seq, key_id)
);

alter table ledger.log_head_signatures enable row level security;
alter table ledger.log_head_signatures force  row level security;
revoke all on ledger.log_head_signatures from anon, authenticated, hc_pipeline, hc_admin;

create function hc.head_signature_immutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'a recorded signature never changes; re-signing is a new row (§2.8)'
    using errcode = '42501';
end $$;
alter function hc.head_signature_immutable() owner to hc_internal;

create trigger hc_guard_head_signatures
  before update or delete on ledger.log_head_signatures
  for each row execute function hc.head_signature_immutable();
