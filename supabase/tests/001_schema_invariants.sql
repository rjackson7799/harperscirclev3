-- ============================================================================
-- Schema invariants — TSD §3.13, Appendix A; grows with each 1A migration.
-- Assertions about privileges, constraints and triggers rather than rows:
-- these catch the regression a year from now (PRD §9.2).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(30);

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

-- ----------------------------------------------------------------------------
-- M2: enumerated types (TSD §2.2). enum_has_labels is ORDER-SENSITIVE, which
-- is the point: hc.access_level ordering is the arithmetic of the whole
-- permission model, and min()/>=/greatest() follow declaration order
-- (ADR-0002 claim 8 — the ordinal assertion joins 1A's suite here).
-- ----------------------------------------------------------------------------
select enum_has_labels('hc', 'access_level',
  array['hidden','log','summary','view','manage'],
  'hc.access_level ordinal sequence — ascending, load-bearing');
select enum_has_labels('hc', 'domain',
  array['memories','health','schedule','documents','finances'],
  'hc.domain has exactly the five domains');
select enum_has_labels('hc', 'tier',
  array['coordinator','family','care_circle'], 'hc.tier labels');
select enum_has_labels('hc', 'account_kind',
  array['member','admin'], 'hc.account_kind labels');
select enum_has_labels('hc', 'object_type',
  array['document','task','timeline_event','profile_fact',
        'episode','arrival','extraction','proposal'],
  'hc.object_type labels');
select enum_has_labels('hc', 'doc_category',
  array['medical','medications','insurance','legal','financial','labs','other'],
  'hc.doc_category labels');
select enum_has_labels('hc', 'proposal_kind',
  array['document','task','timeline_event','profile_fact','conflict','episode'],
  'hc.proposal_kind labels — conflict and episode are proposals in their own right');
select enum_has_labels('hc', 'arrival_state',
  array['received','store_failed','stored',
        'scanning','quarantined','scan_unavailable','scan_inconclusive','scanned',
        'extracting','extract_timeout','extract_failed','cancelled','extracted',
        'interpreting','proposals_ready',
        'held_unknown_sender','needs_password','duplicate_suspected',
        'filed','nothing_filed','unsupported_type'],
  'hc.arrival_state labels');
select enum_has_labels('hc', 'timeline_kind',
  array['medical','care','admin','memory'], 'hc.timeline_kind labels');
select enum_has_labels('hc', 'risk_class',
  array['standard','high'], 'hc.risk_class labels');

-- ----------------------------------------------------------------------------
-- M2: the five-domain literal cannot drift from the enum (TSD §2.2, §3.3 —
-- an IMMUTABLE function cannot call STABLE enum_range; a sixth domain must
-- fail the suite rather than silently open a hole in fail-closed behaviour)
-- ----------------------------------------------------------------------------
select is(hc.all_domains(), enum_range(null::hc.domain),
  'hc.all_domains() literal equals enum_range(null::hc.domain)');
select is(hc.dom(to_jsonb(enum_range(null::hc.domain))), enum_range(null::hc.domain),
  'hc.dom() round-trips the full enum_range');

select * from finish();
rollback;
