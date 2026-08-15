-- ============================================================================
-- Schema invariants — TSD §3.13, Appendix A; grows with each 1A migration.
-- Assertions about privileges, constraints and triggers rather than rows:
-- these catch the regression a year from now (PRD §9.2).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(18);

-- ----------------------------------------------------------------------------
-- M1: roles (TSD §1.2 — the load-bearing table of the architecture)
-- ----------------------------------------------------------------------------
select has_role('hc_internal', 'role hc_internal exists');
select has_role('hc_pipeline', 'role hc_pipeline exists');
select has_role('hc_admin',    'role hc_admin exists');

select is((select rolcanlogin from pg_roles where rolname = 'hc_internal'), false,
  'hc_internal is NOLOGIN — reachable only as owner of enumerated definer functions');
select is((select rolcanlogin from pg_roles where rolname = 'hc_pipeline'), false,
  'hc_pipeline is NOLOGIN until deploy-time credentials (never in migrations)');
select is((select rolcanlogin from pg_roles where rolname = 'hc_admin'), false,
  'hc_admin is NOLOGIN until deploy-time credentials (never in migrations)');

-- ----------------------------------------------------------------------------
-- M1: schemas and extensions (TSD §2.1)
-- ----------------------------------------------------------------------------
select has_schema('hc',         'schema hc exists (types, helpers, definer writers)');
select has_schema('admin_meta', 'schema admin_meta exists (admin views only)');

select has_extension('citext',   'citext installed');
select has_extension('pg_trgm',  'pg_trgm installed (lookalike-domain scoring, §5)');
select has_extension('pgcrypto', 'pgcrypto installed (access_log hash chain, §2.8)');
select has_extension('pgmq',     'pgmq installed (§1.4)');

-- ----------------------------------------------------------------------------
-- M1: execute is deny-by-default for future functions (ADR-0003 finding 8).
-- GLOBAL default-ACL rows (defaclnamespace = 0): per-schema entries only add
-- to global defaults, so only the global form removes PUBLIC EXECUTE.
-- ----------------------------------------------------------------------------
select ok(exists (
  select 1 from pg_default_acl d
  join pg_roles r on r.oid = d.defaclrole
  where d.defaclnamespace = 0 and d.defaclobjtype = 'f' and r.rolname = 'postgres'
    and not exists (select 1 from aclexplode(d.defaclacl) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
), 'global default privileges for the migration runner revoke PUBLIC EXECUTE on functions');

select ok(exists (
  select 1 from pg_default_acl d
  join pg_roles r on r.oid = d.defaclrole
  where d.defaclnamespace = 0 and d.defaclobjtype = 'f' and r.rolname = 'hc_internal'
    and not exists (select 1 from aclexplode(d.defaclacl) a
                    where a.grantee = 0 and a.privilege_type = 'EXECUTE')
), 'global default privileges for hc_internal revoke PUBLIC EXECUTE on functions');

-- ----------------------------------------------------------------------------
-- M1: schema USAGE — the caller half of the definer invariant (ADR-0003 f.8)
-- ----------------------------------------------------------------------------
select ok(has_schema_privilege('authenticated', 'hc', 'usage'),
  'authenticated holds USAGE on hc (per-function grants stay explicit)');
select ok(not has_schema_privilege('hc_admin', 'hc', 'usage'),
  'hc_admin holds no USAGE on hc (§3.9)');
select ok(not has_schema_privilege('hc_pipeline', 'hc', 'usage'),
  'hc_pipeline holds no USAGE on hc until 1C grants its one function (§3.10)');
select ok(not has_schema_privilege('anon', 'hc', 'usage'),
  'anon holds no USAGE on hc');

select * from finish();
rollback;
