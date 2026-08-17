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

select plan(20);

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
    'adjudicate_freeze(p_freeze_id uuid, p_outcome text, p_adjudicated_by text, p_outcome_note text, p_subject_id uuid, p_narrowing_rationale text, p_contact_attempted_at timestamp with time zone, p_objected_to_member_id uuid)',
    'advance_arrival(p_arrival uuid, p_from hc.arrival_state, p_to hc.arrival_state, p_lease uuid, p_reason text)',
    'all_domains()',
    'apply_taint(p_type hc.object_type, p_id uuid, p_taint hc.domain[], p_resolved boolean)',
    'approve_proposal(p_proposal_id uuid, p_expected_version integer, p_idempotency_key text, p_edits jsonb, p_step_up_token text)',
    'assert_claimed()',
    'cancel_arrival(p_arrival uuid)',
    'circle_frozen(p_circle uuid, p_subject uuid)',
    'claim_stage(p_arrival uuid, p_stage text, OUT result hc.advance_result, OUT lease_id uuid, OUT attempt_no integer, OUT deadline timestamp with time zone)',
    'contact_key(p text)',
    'create_arrival(p_circle_id uuid, p_subject_id uuid, p_channel text, p_parent_arrival_id uuid, p_sender_address text, p_sender_display_name text, p_message_id text, p_auth_result text, p_auth_detail jsonb, p_mime_declared text, p_byte_size bigint, p_page_count integer, p_ingest_idempotency_key text)',
    'create_circle(p_name text, p_subjects jsonb, p_opening_context text[])',
    'ctx()',
    'ctx_for(p_account uuid)',
    'dom(p jsonb)',
    'draft_proposal(p_arrival uuid, p_circle uuid, p_subject uuid, p_kind hc.proposal_kind, p_payload jsonb)',
    'finalize_extraction(p_arrival uuid, p_lease uuid, p_facts jsonb, p_proposals jsonb)',
    'finalize_interpretation(p_arrival uuid, p_lease uuid, p_proposals jsonb)',
    'grant_vectors(p_account uuid)',
    'guard_row()',
    'ladder(p_s jsonb, p_taint hc.domain[])',
    'link_provenance(p_child_type hc.object_type, p_child_id uuid, p_parent_type hc.object_type, p_parent_id uuid)',
    'log(p_circle_id uuid, p_event_type text, p_actor_display_name text, p_actor_account_id uuid, p_subject_id uuid, p_target_member_id uuid, p_domain hc.domain, p_level_before hc.access_level, p_level_after hc.access_level, p_object_type hc.object_type, p_object_id uuid, p_detail jsonb, p_actor_session_id text, p_request_id text, p_corrects_id uuid)',
    'mark_unresolved_one(p_type hc.object_type, p_id uuid)',
    'mark_unresolved_subtree(p_type hc.object_type, p_id uuid)',
    'own_domain(p_type hc.object_type, p_category hc.doc_category, p_kind hc.timeline_kind, p_declared hc.domain)',
    'pipeline_worker_states()',
    'presence(p_subject uuid)',
    'propagate_taint_growth(p_type hc.object_type, p_id uuid, p_delta hc.domain[])',
    'reclassify_taint(p_object_type hc.object_type, p_object_id uuid)',
    'request_freeze(p_circle_id uuid, p_claimant_contact text, p_reason text, p_claimant_relationship text)',
    'resolve_object(p_type hc.object_type, p_id uuid)',
    'revise_object(p_object_type hc.object_type, p_object_id uuid, p_patch jsonb)',
    'sender_recognised(p_arrival uuid)',
    'share_object(p_object_type hc.object_type, p_object_id uuid, p_member_id uuid)',
    'sweep_provenance()',
    'taint_union(a hc.domain[], b hc.domain[])',
    'taint_union_2(a hc.domain[], b hc.domain[])',
    'taint_union_agg(hc.domain[])',
    'uid()',
    'visible_at(p_ctx jsonb, p_subject uuid, p_taint hc.domain[], p_resolved boolean, p_object_type hc.object_type, p_object_id uuid, p_owner_member uuid)',
    'write_extractions(p_arrival uuid, p_lease uuid, p_facts jsonb)',
    'write_proposals(p_arrival uuid, p_lease uuid, p_proposals jsonb)'
  ],
  'the hc function inventory is exactly the enumerated set — no stray overloads');

-- 3 · SECURITY DEFINER only where required: exactly the boundary functions
--     that must read or write past FORCE RLS as hc_internal.
select is((
  select array_agg(p.proname order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'hc' and p.prosecdef),
  array['adjudicate_freeze','advance_arrival','approve_proposal','assert_claimed',
        'cancel_arrival','claim_stage','create_arrival','create_circle',
        'ctx','ctx_for','finalize_extraction','finalize_interpretation',
        'grant_vectors','link_provenance','presence',
        'propagate_taint_growth','reclassify_taint','request_freeze',
        'revise_object','sender_recognised','share_object','sweep_provenance']::name[],
  'SECURITY DEFINER is exactly the twenty-two boundary functions, nothing else (draft/write halves run AS the calling definer — not definers themselves)');

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
  union all select 'approve_proposal', 'authenticated'
  union all select 'revise_object', 'authenticated'
  union all select 'share_object', 'authenticated'
  union all select 'presence', 'authenticated'
  -- 1C: the pipeline boundary (§3.10 posture) — workers hold EXECUTE on the
  -- transition primitive, intake and the gate question, nothing else.
  union all select 'advance_arrival', 'hc_pipeline'
  union all select 'claim_stage', 'hc_pipeline'
  union all select 'create_arrival', 'hc_pipeline'
  union all select 'finalize_extraction', 'hc_pipeline'
  union all select 'finalize_interpretation', 'hc_pipeline'
  union all select 'sender_recognised', 'hc_pipeline'
  union all select 'cancel_arrival', 'authenticated'
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
  ('hc_internal',   'log_event_types', 'SELECT'),
  -- 1B M1 (ADR-0005 D1): exactly what hc.approve_proposal() needs; arrivals
  -- deliberately absent — no role of ours reads or writes it until 1C.
  ('hc_internal',   'proposals',         'SELECT'),
  ('hc_internal',   'proposals',         'UPDATE'),
  -- 1C M5: drafting inserts pending proposals (write_proposals /
  -- create_manual_proposal, via hc.draft_proposal)
  ('hc_internal',   'proposals',         'INSERT'),
  ('hc_internal',   'approval_attempts', 'SELECT'),
  ('hc_internal',   'approval_attempts', 'INSERT'),
  ('hc_internal',   'approval_attempts', 'UPDATE'),
  ('hc_internal',   'proposal_commits',  'SELECT'),
  ('hc_internal',   'proposal_commits',  'INSERT'),
  -- 1B M2: the record is readable and unwritable until M6 grants the
  -- writer role its INSERT/UPDATE. document_search_content: NOTHING, for
  -- anyone, until 1D — its absence from this list is the assertion.
  ('authenticated', 'episodes',        'SELECT'),
  ('authenticated', 'documents',       'SELECT'),
  ('authenticated', 'tasks',           'SELECT'),
  ('authenticated', 'timeline_events', 'SELECT'),
  ('authenticated', 'profile_facts',   'SELECT'),
  ('hc_internal',   'episodes',        'SELECT'),
  ('hc_internal',   'documents',       'SELECT'),
  ('hc_internal',   'tasks',           'SELECT'),
  ('hc_internal',   'timeline_events', 'SELECT'),
  ('hc_internal',   'profile_facts',   'SELECT'),
  -- 1B M3: asymmetric by design — revisions append-only, shares
  -- revoke-only, edges link/unlink (relink = delete-then-insert, §2.6).
  -- 1B M5: the taint walk is the first hc_internal writer — UPDATE only;
  -- INSERT waits for M6's approve_proposal.
  ('hc_internal',   'documents',       'INSERT'),
  ('hc_internal',   'episodes',        'INSERT'),
  ('hc_internal',   'tasks',           'INSERT'),
  ('hc_internal',   'timeline_events', 'INSERT'),
  ('hc_internal',   'profile_facts',   'INSERT'),
  ('hc_internal',   'documents',       'UPDATE'),
  ('hc_internal',   'episodes',        'UPDATE'),
  ('hc_internal',   'tasks',           'UPDATE'),
  ('hc_internal',   'timeline_events', 'UPDATE'),
  ('hc_internal',   'profile_facts',   'UPDATE'),
  ('hc_internal',   'record_revisions', 'SELECT'),
  ('hc_internal',   'record_revisions', 'INSERT'),
  ('hc_internal',   'object_shares',    'SELECT'),
  ('hc_internal',   'object_shares',    'INSERT'),
  ('hc_internal',   'object_shares',    'UPDATE'),
  ('hc_internal',   'provenance_edges', 'SELECT'),
  ('hc_internal',   'provenance_edges', 'INSERT'),
  ('hc_internal',   'provenance_edges', 'DELETE'),
  -- 1C M1: the pipeline machinery's exact reach (ADR-0007). arrivals gains
  -- its writer role (create_arrival / advance_arrival / claim_stage);
  -- arrival_events is APPEND-only (no UPDATE row here is the assertion);
  -- extractions is publish-only; known_senders read-only (gate);
  -- the outbox is written by adjudication and drained by the relay.
  ('hc_internal',   'arrivals',        'SELECT'),
  ('hc_internal',   'arrivals',        'INSERT'),
  ('hc_internal',   'arrivals',        'UPDATE'),
  ('hc_internal',   'arrival_events',  'SELECT'),
  ('hc_internal',   'arrival_events',  'INSERT'),
  ('hc_internal',   'pipeline_leases', 'SELECT'),
  ('hc_internal',   'pipeline_leases', 'INSERT'),
  ('hc_internal',   'pipeline_leases', 'UPDATE'),
  ('hc_internal',   'extractions',     'SELECT'),
  ('hc_internal',   'extractions',     'INSERT'),
  ('hc_internal',   'known_senders',   'SELECT'),
  ('hc_internal',   'pipeline_outbox', 'SELECT'),
  ('hc_internal',   'pipeline_outbox', 'INSERT'),
  ('hc_internal',   'pipeline_outbox', 'UPDATE'),
  ('hc_internal',   'reason_codes',    'SELECT'),
  ('hc_internal',   'stage_budgets',   'SELECT');

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
        'accounts_internal',
        'approval_attempts_internal','approval_attempts_internal_update',
        'approval_attempts_internal_write',
        'arrival_events_internal','arrival_events_internal_append',
        'arrivals_internal','arrivals_internal_advance','arrivals_internal_intake',
        'circle_members_internal','circle_members_internal_create',
        'circles_internal','circles_internal_create',
        'documents_internal','documents_internal_revise',
        'documents_internal_write',
        'episodes_internal','episodes_internal_revise','episodes_internal_write',
        'extractions_internal','extractions_internal_write',
        'freeze_claims_internal','freeze_claims_internal_write',
        'freezes_internal','freezes_internal_adjudicate','freezes_internal_write',
        'known_senders_internal',
        'object_shares_internal','object_shares_internal_create',
        'object_shares_internal_revoke',
        'pipeline_leases_internal','pipeline_leases_internal_claim',
        'pipeline_leases_internal_close',
        'pipeline_outbox_internal','pipeline_outbox_internal_drain',
        'pipeline_outbox_internal_enqueue',
        'profile_facts_internal','profile_facts_internal_revise',
        'profile_facts_internal_write',
        'proposal_commits_internal','proposal_commits_internal_claim',
        'proposals_internal','proposals_internal_decide','proposals_internal_draft',
        'provenance_edges_internal','provenance_edges_internal_link',
        'provenance_edges_internal_unlink',
        'record_revisions_internal','record_revisions_internal_append',
        'subjects_internal','subjects_internal_create',
        'tasks_internal','tasks_internal_revise','tasks_internal_write',
        'timeline_events_internal','timeline_events_internal_revise',
        'timeline_events_internal_write']::name[],
  'the hc_internal policy list is exactly the enumerated sixty-one');

-- ----------------------------------------------------------------------------
-- 1B U11 · The writer allowlist BEGINS (kickoff mandate), catalog-based:
-- the exact principals and privileges on documents and
-- document_search_content from information_schema.role_table_grants, and
-- the exact trigger inventory from pg_trigger. Named catalogs, exact
-- inventory — extending the 002 pattern. dsc: empty on BOTH counts until
-- 1D lands the search writer.
-- ----------------------------------------------------------------------------
select is((
  select coalesce(array_agg(g.grantee || ':' || g.table_name || ':' || g.privilege_type
                            order by g.table_name, g.grantee, g.privilege_type),
                  '{}'::text[])
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.table_name in ('documents', 'document_search_content')
    and g.grantee in ('anon', 'authenticated', 'hc_pipeline', 'hc_admin', 'hc_internal')),
  array['authenticated:documents:SELECT',
        'hc_internal:documents:INSERT',
        'hc_internal:documents:SELECT',
        'hc_internal:documents:UPDATE'],
  'writer allowlist: documents = authenticated read + hc_internal read/insert/update; dsc = NOTHING for any of our five roles');

select is((
  select coalesce(array_agg(c.relname || ':' || t.tgname order by c.relname, t.tgname),
                  '{}'::text[])
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and c.relname in ('documents', 'document_search_content')),
  array['documents:hc_claim_documents', 'documents:hc_guard_documents'],
  'writer allowlist: documents carries exactly the claim + guard triggers; dsc carries none');

-- ----------------------------------------------------------------------------
-- Round-5 ruling R1: hc.uid() accepted permanently CONDITIONAL on this
-- equivalence regression against auth.uid() — absent claims, claim.sub,
-- legacy claims, conflicting (claim.sub wins), malformed (same error
-- class from both). Runs as postgres, which can execute both.
-- ----------------------------------------------------------------------------
create function pg_temp.errc(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  begin
    execute p_sql;
    v := 'no_error';
  exception when others then
    get stacked diagnostics v := returned_sqlstate;
  end;
  return v;
end $$;

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select ok(hc.uid() is null and auth.uid() is null,
  'uid equivalence: absent claims → both null');

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select ok(hc.uid() = auth.uid()
      and hc.uid() = '11111111-1111-1111-1111-111111111111'::uuid,
  'uid equivalence: request.jwt.claim.sub honoured identically');

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
select ok(hc.uid() = auth.uid()
      and hc.uid() = '22222222-2222-2222-2222-222222222222'::uuid,
  'uid equivalence: legacy request.jwt.claims honoured identically');

select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
select ok(hc.uid() = auth.uid()
      and hc.uid() = '33333333-3333-3333-3333-333333333333'::uuid,
  'uid equivalence: on conflict, claim.sub wins in both');

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{not json', true);
select is(pg_temp.errc('select hc.uid()'), pg_temp.errc('select auth.uid()'),
  'uid equivalence: malformed claims raise the same error class from both');
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
