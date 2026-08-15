-- ============================================================================
-- Definer-function invariants (ADR-0003 finding 8; the plan's twelve
-- properties as one reusable suite) and the privilege snapshot.
--
-- Properties asserted mechanically here: non-login owner · definer only
-- where required (exact set) · search_path pinned · PUBLIC EXECUTE absent ·
-- exact overload inventory · explicit named-caller grants · no role
-- membership into the definer owner · no dynamic SQL · owner schema USAGE ·
-- table-privilege snapshot with nothing unexpected.
-- Asserted elsewhere: uniform unauthorized-vs-nonexistent shapes (007, the
-- P0001 pair) · caller-selectable identity confined to ctx_for/
-- grant_vectors (their zero-grant closure: 004) · creation/ownership/
-- revoke/grants atomic per migration (review property, enforced by the
-- migration files themselves).
-- Platform roles (postgres, service_role, supabase_*) are outside snapshot
-- scope: postgres is the documented maintenance exemption, service_role is
-- the §1.2 last-resort credential whose containment is CI's grep, and the
-- supabase_* roles are image plumbing.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(13);

-- 1 · Every function in hc is owned by the non-login internal role.
select is((
  select count(*)::int from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hc' and p.proowner <> 'hc_internal'::regrole), 0,
  'every hc function is owned by hc_internal (non-login, unassumable)');

-- 2 · Exact overload inventory: no unexpected executable overloads.
select is((
  select array_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                   order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hc'),
  array[
    'access_log_immutable()',
    'adjudicate_freeze(p_freeze_id uuid, p_outcome text, p_adjudicated_by text, p_outcome_note text, p_subject_id uuid, p_narrowing_rationale text, p_contact_attempted_at timestamp with time zone)',
    'all_domains()',
    'create_circle(p_name text, p_subjects jsonb, p_opening_context text[])',
    'ctx()',
    'ctx_for(p_account uuid)',
    'dom(p jsonb)',
    'grant_vectors(p_account uuid)',
    'ladder(p_s jsonb, p_taint hc.domain[])',
    'log(p_circle_id uuid, p_event_type text, p_actor_display_name text, p_actor_account_id uuid, p_subject_id uuid, p_target_member_id uuid, p_domain hc.domain, p_level_before hc.access_level, p_level_after hc.access_level, p_object_type hc.object_type, p_object_id uuid, p_detail jsonb, p_actor_session_id text, p_request_id text)',
    'request_freeze(p_circle_id uuid, p_claimant_contact text, p_reason text, p_claimant_relationship text)',
    'uid()',
    'visible_at(p_ctx jsonb, p_subject uuid, p_taint hc.domain[], p_resolved boolean, p_object_type hc.object_type, p_object_id uuid, p_owner_member uuid)'
  ],
  'the hc function inventory is exactly the enumerated thirteen — no stray overloads');

-- 3 · SECURITY DEFINER only where required: exactly the six that must read
--     or write past FORCE RLS as hc_internal.
select is((
  select array_agg(p.proname order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hc' and p.prosecdef),
  array['adjudicate_freeze','create_circle','ctx','ctx_for','grant_vectors','request_freeze']::name[],
  'SECURITY DEFINER is exactly the six boundary functions, nothing else');

-- 4 · search_path pinned to '' on every definer, and on hc.log (invoker,
--     but it writes the chain — pinned as defence in depth).
select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hc'
    and (p.prosecdef or p.proname = 'log')
    and (p.proconfig is null
         or not exists (select 1 from unnest(p.proconfig) c
                        where c like 'search_path=%'))), 0,
  'every definer (and hc.log) pins search_path');

-- 5 · PUBLIC EXECUTE absent on every hc function.
select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  where n.nspname = 'hc' and a.grantee = 0), 0,
  'no hc function grants EXECUTE to PUBLIC');

-- 6 · Explicit grants to named callers, exactly: ctx and create_circle to
--     authenticated; everything else owner-only.
with actual as (
  select p.proname, r.rolname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'hc' and a.privilege_type = 'EXECUTE'
), expected as (
  select p.proname, 'hc_internal'::name as rolname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hc'
  union all select 'ctx', 'authenticated'
  union all select 'create_circle', 'authenticated'
  -- the pure visibility functions: policies evaluate these as the caller
  union all select 'dom', 'authenticated'
  union all select 'all_domains', 'authenticated'
  union all select 'ladder', 'authenticated'
  union all select 'visible_at', 'authenticated'
)
select is(
  (select count(*)::int from (select * from actual except select * from expected) x)
  + (select count(*)::int from (select * from expected except select * from actual) x),
  0, 'function EXECUTE grants are exactly the expected named-caller set');

-- 7 · Nothing can become the definer owner: hc_internal has no member but
--     the documented postgres maintenance exemption.
select is((
  select coalesce(array_agg(x order by x), '{}'::name[])
  from (select distinct m.member::regrole::name as x
        from pg_auth_members m
        where m.roleid = 'hc_internal'::regrole) d),
  array['postgres']::name[],
  'no request-path or admin role is a member of (or can SET ROLE to) hc_internal');

-- 8 · No dynamic SQL anywhere in hc (the reviewed allowlist is empty in 1A).
select is((
  select count(*)::int
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hc' and p.prosrc ~* '\mexecute\M'), 0,
  'no hc function builds dynamic SQL');

-- 9 · Owner schema USAGE, explicit: exactly what the bodies resolve.
select ok(
      has_schema_privilege('hc_internal', 'public', 'usage')
  and has_schema_privilege('hc_internal', 'hc', 'usage')
  and has_schema_privilege('hc_internal', 'extensions', 'usage')
  and not has_schema_privilege('hc_admin', 'hc', 'usage'),
  'hc_internal resolves public/hc/extensions; hc_admin resolves none of hc');

-- ----------------------------------------------------------------------------
-- The privilege snapshot: every (role, table, privilege) our five roles
-- hold in public (+ hc.log_event_types), both directions.
-- ----------------------------------------------------------------------------
create temp table snapshot_expected (grantee name, tbl text, priv text);
insert into snapshot_expected values
  ('authenticated', 'accounts',        'SELECT'),
  ('authenticated', 'circles',         'SELECT'),
  ('authenticated', 'subjects',        'SELECT'),
  ('authenticated', 'circle_members',  'SELECT'),
  ('authenticated', 'access_grants',   'SELECT'),
  ('hc_internal',   'accounts',        'SELECT'),
  ('hc_internal',   'circles',         'SELECT'),
  ('hc_internal',   'circles',         'INSERT'),
  ('hc_internal',   'subjects',        'SELECT'),
  ('hc_internal',   'subjects',        'INSERT'),
  ('hc_internal',   'circle_members',  'SELECT'),
  ('hc_internal',   'circle_members',  'INSERT'),
  ('hc_internal',   'access_grants',   'SELECT'),
  ('hc_internal',   'access_grants',   'INSERT'),
  ('hc_internal',   'freezes',         'SELECT'),
  ('hc_internal',   'freezes',         'INSERT'),
  ('hc_internal',   'freezes',         'UPDATE'),
  ('hc_internal',   'freeze_claims',   'SELECT'),
  ('hc_internal',   'freeze_claims',   'INSERT'),
  ('hc_internal',   'access_log',      'SELECT'),
  ('hc_internal',   'access_log',      'INSERT'),
  ('hc_internal',   'log_event_types', 'SELECT');

create temp view snapshot_actual as
  select r.rolname as grantee, c.relname::text as tbl, a.privilege_type as priv
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname in ('public', 'hc') and c.relkind = 'r'
    and r.rolname in ('anon', 'authenticated', 'hc_pipeline', 'hc_admin', 'hc_internal');

select is((select count(*)::int from (
    select * from snapshot_actual except select * from snapshot_expected) x), 0,
  'snapshot: no privilege beyond the expected inventory (anon/hc_pipeline/hc_admin hold NOTHING)');

select is((select count(*)::int from (
    select * from snapshot_expected except select * from snapshot_actual) x), 0,
  'snapshot: nothing expected is missing — the kernel actually runs');

-- No PUBLIC grants on any table we own.
select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where n.nspname in ('public', 'hc') and c.relkind = 'r' and a.grantee = 0), 0,
  'no table grants anything to PUBLIC');

-- The hc_internal policy list is the greppable whole of its reach (§3.4):
-- exact named-policy inventory, so it cannot grow without this test moving.
select is((
  select array_agg(p.polname order by p.polname)
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  where 'hc_internal'::regrole::oid = any (p.polroles)),
  array['access_grants_internal','access_grants_internal_create',
        'access_log_internal','access_log_internal_append',
        'accounts_internal','circle_members_internal','circle_members_internal_create',
        'circles_internal','circles_internal_create',
        'freeze_claims_internal','freeze_claims_internal_write',
        'freezes_internal','freezes_internal_adjudicate','freezes_internal_write',
        'subjects_internal','subjects_internal_create']::name[],
  'the hc_internal policy list is exactly the enumerated sixteen');

select * from finish();
rollback;
