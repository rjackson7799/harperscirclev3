-- ============================================================================
-- Schema invariants — TSD §3.13, Appendix A; grows with each 1A migration.
-- Assertions about privileges, constraints and triggers rather than rows:
-- these catch the regression a year from now (PRD §9.2).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(54);

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
select ok(has_schema_privilege('hc_pipeline', 'hc', 'usage'),
  'hc_pipeline holds USAGE on hc since 1C M2 — EXECUTE stays per-function (§3.10)');
select ok(has_schema_privilege('anon', 'hc', 'usage'),
  'anon holds USAGE on hc since 2A M1 — sign-in throttle is the first anon-callable surface; EXECUTE stays per-function');

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
        'filed','nothing_filed','unsupported_type',
        'duplicate_suspected_stage2'],
  'hc.arrival_state labels (5A M5: Q8''s distinct stage-2 suspect appended)');
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

-- ----------------------------------------------------------------------------
-- M3: every table in public has RLS enabled AND forced (TSD §2.1 — force
-- matters: without it the owner bypasses its own policies and the
-- hc_internal boundary is meaningless). One assertion, scales to every
-- future table: a new table cannot ship without both flags.
-- ----------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and not (c.relrowsecurity and c.relforcerowsecurity)),
  0, 'every table in public has RLS enabled AND forced');

-- ----------------------------------------------------------------------------
-- M3: AC-ADMIN-3 as declarative constraint — the composite FK to
-- accounts(id, kind), plus the two circle-consistent composites (§2.1).
-- ----------------------------------------------------------------------------
select fk_ok('public', 'circle_members', array['account_id','account_kind'],
             'public', 'accounts',       array['id','kind'],
  'circle_members pins accounts to kind = member via composite FK (AC-ADMIN-3)');
select fk_ok('public', 'circle_members', array['circle_id','subject_id'],
             'public', 'subjects',       array['circle_id','id'],
  'circle_members → subjects is circle-consistent');
select fk_ok('public', 'circle_members', array['circle_id','custodian_member_id'],
             'public', 'circle_members', array['circle_id','id'],
  'custodianship is circle-consistent');

select index_is_unique('public', 'circle_members', 'circle_members_one_row_per_subject',
  'one membership row per subject (partial unique)');

select col_not_null('public', 'admin_users', 'mfa_enrolled_at',
  'AC-ADMIN-5: no admin row without MFA enrolment');

-- ----------------------------------------------------------------------------
-- M3: the generalized §3.13 invariant — every FK between two circle-scoped
-- tables (both carrying circle_id) includes circle_id in its column list,
-- except FKs that ARE the circle anchor (target public.circles).
-- ----------------------------------------------------------------------------
select is((
  select count(*)::int
  from pg_constraint fk
  join pg_class src on src.oid = fk.conrelid
  join pg_class tgt on tgt.oid = fk.confrelid
  join pg_namespace ns on ns.oid = src.relnamespace
  join pg_namespace nt on nt.oid = tgt.relnamespace
  where fk.contype = 'f'
    and ns.nspname = 'public' and nt.nspname = 'public'
    and tgt.relname <> 'circles'
    and exists (select 1 from pg_attribute a
                where a.attrelid = src.oid and a.attname = 'circle_id' and not a.attisdropped)
    and exists (select 1 from pg_attribute a
                where a.attrelid = tgt.oid and a.attname = 'circle_id' and not a.attisdropped)
    and not exists (
      select 1 from unnest(fk.conkey) k
      join pg_attribute a on a.attrelid = src.oid and a.attnum = k
      where a.attname = 'circle_id')
), 0, 'every FK between two circle-scoped tables is circle-consistent (§2.1, §3.13)');

-- ----------------------------------------------------------------------------
-- M4: access_grants composite FKs; the one-grant-per-(member,subject,domain)
-- unique; invites token_hash uniqueness (single-use anchor, AC-PERM-4).
-- ----------------------------------------------------------------------------
select fk_ok('public', 'access_grants', array['circle_id','member_id'],
             'public', 'circle_members', array['circle_id','id'],
  'access_grants → circle_members is circle-consistent');
select fk_ok('public', 'access_grants', array['circle_id','subject_id'],
             'public', 'subjects',       array['circle_id','id'],
  'access_grants → subjects is circle-consistent');
select index_is_unique('public', 'access_grants',
  'access_grants_member_id_subject_id_domain_key',
  'one grant per (member, subject, domain)');
select index_is_unique('public', 'invites', 'invites_token_hash_key',
  'invite tokens are unique by hash — the single-use anchor');

-- ----------------------------------------------------------------------------
-- M6: the access log — append-only two ways, denial shape, chain seq.
-- ----------------------------------------------------------------------------
do $$
declare u uuid := gen_random_uuid(); c uuid; n bigint;
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated',
          'authenticated', u || '@fixture.local', 'x', now(), now(), now(), '{}', '{}');
  insert into public.accounts (id, kind, display_name) values (u, 'member', 'Log fixture');
  insert into public.circles (name, created_by) values ('Log circle', u) returning id into c;
  n := hc.log(c, 'member_joined', 'Log fixture', u);
  perform set_config('t001.c', c::text, true);
end $$;

select has_trigger('public', 'access_log', 'access_log_immutable',
  'the unconditional append-only trigger is attached');

select throws_ok(format(
  $$ update public.access_log set detail = '{"edited":true}' where circle_id = %L $$,
  current_setting('t001.c')),
  '42501', null,
  'access_log rejects UPDATE even for a role the policies cannot stop (the trigger is the second way)');

select throws_ok(format(
  $$ delete from public.access_log where circle_id = %L $$,
  current_setting('t001.c')),
  '42501', null, 'access_log rejects DELETE unconditionally');

select throws_ok(format(
  $$ select hc.log(p_circle_id => %L::uuid, p_event_type => 'access_denied',
                   p_actor_display_name => 'probe', p_object_id => %L::uuid) $$,
  current_setting('t001.c'), gen_random_uuid()),
  '23514', null,
  'a denial entry carrying an object id is rejected by constraint (denial_names_no_object, AC-PPL-7)');

select is((select hc.log(current_setting('t001.c')::uuid, 'member_joined', 'Log fixture')),
  2::bigint, 'seq is per-circle and gapless — second entry is 2');

select ok(has_table_privilege('authenticated', 'public.access_log', 'select'),
  'the 1D filtered family read is live — SELECT granted, rows decided by the §2.8 policy (030)');
select ok(not has_table_privilege('authenticated', 'public.access_log', 'insert'),
  'authenticated cannot write the log — hc.log() is the only writer');
select ok(not has_table_privilege('hc_admin', 'public.access_log', 'select'),
  'hc_admin cannot read the log (AC-ADMIN-1 posture)');

select fk_ok('public', 'access_log', array['circle_id','subject_id'],
             'public', 'subjects',   array['circle_id','id'],
  'access_log → subjects is circle-consistent');
select fk_ok('public', 'access_log', array['circle_id','corrects_id'],
             'public', 'access_log', array['circle_id','id'],
  'a correction row points at its target circle-consistently');
select index_is_unique('public', 'access_log', 'access_log_circle_id_seq_key',
  'seq is unique per circle — the chain cannot fork');

select is((select array_agg(code order by code) from hc.log_event_types),
  array['access_denied','artifact_read','audience_changed','conflict_resolved',
        'custodianship_declared','forwarding_activated','freeze_adjudicated',
        'freeze_claim_recorded','freeze_requested','grant_changed','invite_accepted',
        'invite_issued','invite_revoked','member_joined','member_removed',
        'object_approved','object_share_revoked','object_shared','proposal_rejected',
        'sender_accepted','sender_revoked','signed_out','task_assigned',
        'task_claimed','task_completed','task_reassigned','task_snoozed','task_unassigned']::text[],
  'the event-type enumeration is seeded — pinned as the EXACT SET, the 002 pattern (R3/F-8: a count let a renamed code pass) — (1A''s seven + 1B–1D''s three + 2A''s eight + 4A''s three + 5A''s one: conflict_resolved + 6A M3''s one: proposal_rejected + 7A M1''s two: task_assigned, task_reassigned + 7A M2''s two: task_completed, task_snoozed + 8A M1''s one: task_claimed)');

-- Round-5 F1: the declaration precedes the subject row it binds, so the
-- (circle_id, subject_id) FK must be deferrable — checked at commit, when
-- the preallocated subject exists.
select ok((
    select c.condeferrable from pg_constraint c
    where c.conrelid = 'public.access_log'::regclass and c.contype = 'f'
      and (select array_agg(a.attname order by a.attname)
           from unnest(c.conkey) k
           join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k)
          = array['circle_id','subject_id']::name[]),
  'the declaration FK is DEFERRABLE — receipts may precede the rows they bind (round-5 F1)');

select * from finish();
rollback;
