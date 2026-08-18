-- ============================================================================
-- 1D · M4 — the admin boundary (TSD §3.9, §9.2; AC-ADMIN-1/-2/-6).
--
-- hc_admin cannot read record contents because the privilege does not
-- exist. This migration gives it the ONLY two doors it will ever have:
--
--   admin_meta  read-only views — counts, timings, enumerated states and
--               opaque identifiers, never text drawn from family
--               material. Views are owned by hc_internal: a view reads
--               its base tables as the VIEW OWNER, which is the whole
--               reason they work and the reason the real boundary is the
--               set of view definitions — pinned, walked and probed by
--               031's four CI assertions on every migration.
--   admin_ops   one narrowly-granted SECURITY DEFINER wrapper per
--               permitted §9.3 operation. ZERO land in 1D: every
--               operation requires the §5.7-shaped, operation-bound MFA
--               step-up plus dual-control machinery of the auth slice,
--               and a wrapper accepting a token the database cannot
--               validate would repeat the APR-06 mistake. Staged as
--               ADM-01 (ADR-0009); the empty schema IS the fail-closed
--               boundary, and CI assertion 4 pins it.
--
-- §9.2 stats not derivable without content-table columns or absent
-- machinery (extraction success rates beyond reason codes, proposal
-- rejection rates, invite acceptance, arrival→filed timings) land with
-- their surfaces — the views here say only what today's safe columns can
-- say (ADR-0009 records the staging).
--
-- §3.9's revoke/default statements: the EXECUTE deny-by-default is
-- already GLOBAL since 1A M1 (stronger than the per-schema form); the
-- table revokes below are declarative no-ops on a database where
-- hc_admin was never granted anything — they exist so a future grant
-- has to fight this migration's text as well as 031's assertions.
-- ============================================================================

create schema admin_ops;

-- Existing objects (no-ops today, §3.9 verbatim).
revoke all on all tables in schema public, hc from hc_admin;
revoke usage on schema public, hc from hc_admin;

-- Future objects: a table added next year inherits nothing for hc_admin.
alter default privileges in schema public, hc revoke all on tables from hc_admin;

-- What hc_admin may reach.
grant usage on schema admin_meta, admin_ops to hc_admin;

-- The view owner: receiving ownership requires CREATE on the containing
-- schema; hc_internal holds it for admin_meta alone — it can own the
-- bridge, and nothing of the record moves schemas.
grant usage, create on schema admin_meta to hc_internal;

-- Future admin_meta relations: readable by default, from BOTH creating
-- roles (the migration runner and hc_internal after ownership transfer).
alter default privileges in schema admin_meta grant select on tables to hc_admin;
alter default privileges for role hc_internal in schema admin_meta
  grant select on tables to hc_admin;

-- ----------------------------------------------------------------------------
-- The views. Counts, enumerated states, dates, opaque ids — content
-- columns are unreachable BY CONSTRUCTION (031 CI-2 walks the catalog).
-- ----------------------------------------------------------------------------

create view admin_meta.platform_stats as
select
  (select count(*) from public.circles)                                    as circles_total,
  (select count(*) from public.circles c
    where c.created_at >= now() - interval '30 days')                      as circles_last_30d,
  (select count(*) from public.subjects)                                   as subjects_total,
  (select coalesce(jsonb_object_agg(t.tier, t.n), '{}'::jsonb)
   from (select m.tier::text as tier, count(*) as n
         from public.circle_members m
         where m.removed_at is null
         group by m.tier) t)                                               as members_by_tier,
  (select coalesce(jsonb_object_agg(a.channel, a.n), '{}'::jsonb)
   from (select ar.channel, count(*) as n
         from public.arrivals ar
         where ar.deleted_at is null
         group by ar.channel) a)                                           as arrivals_by_channel,
  (select coalesce(jsonb_object_agg(s.state, s.n), '{}'::jsonb)
   from (select ar.state::text as state, count(*) as n
         from public.arrivals ar
         where ar.deleted_at is null
         group by ar.state) s)                                             as arrivals_by_state,
  (select count(*) from public.access_log l
    where l.event_type = 'object_approved')                                as approvals_total,
  -- the COLLAPSED total: AC-PPL-7 folds repeats into one row with a count
  (select coalesce(sum(l.collapsed_count), 0) from public.access_log l
    where l.event_type = 'access_denied')                                  as denials_total,
  (select count(distinct l.actor_account_id) from public.access_log l
    where l.occurred_at >= now() - interval '30 days'
      and l.actor_account_id is not null)                                  as active_members_30d;

create view admin_meta.circle_shapes as
select c.id                                                                as circle_id,
       c.state,
       c.created_at,
       (select count(*) from public.subjects s where s.circle_id = c.id)   as subject_count,
       (select coalesce(jsonb_object_agg(t.tier, t.n), '{}'::jsonb)
        from (select m.tier::text as tier, count(*) as n
              from public.circle_members m
              where m.circle_id = c.id and m.removed_at is null
              group by m.tier) t)                                          as members_by_tier,
       (select count(*) from public.arrivals a
        where a.circle_id = c.id and a.deleted_at is null)                 as arrival_count,
       (select max(l.occurred_at) from public.access_log l
        where l.circle_id = c.id)                                          as last_activity_at
from public.circles c;

create view admin_meta.pipeline_health as
select a.state::text        as state,
       count(*)             as arrivals,
       min(a.received_at)   as oldest_received_at
from public.arrivals a
where a.deleted_at is null
group by a.state;

create view admin_meta.stage_outcomes as
select e.reason_code, count(*) as events
from public.arrival_events e
where e.reason_code is not null
group by e.reason_code;

-- The intentional privilege bridge: hc_internal owns the definitions and
-- reads the base tables through its enumerated select-true policies.
alter view admin_meta.platform_stats  owner to hc_internal;
alter view admin_meta.circle_shapes   owner to hc_internal;
alter view admin_meta.pipeline_health owner to hc_internal;
alter view admin_meta.stage_outcomes  owner to hc_internal;

grant select on admin_meta.platform_stats, admin_meta.circle_shapes,
                admin_meta.pipeline_health, admin_meta.stage_outcomes
  to hc_admin;
