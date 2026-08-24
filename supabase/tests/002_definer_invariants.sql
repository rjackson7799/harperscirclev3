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
    'accept_invite(p_token text)',
    'accept_sender(p_circle_id uuid, p_address text, p_domain text)',
    'access_log_immutable()',
    'activate_forwarding(p_subject uuid)',
    'adjudicate_freeze(p_freeze_id uuid, p_outcome text, p_adjudicated_by text, p_outcome_note text, p_subject_id uuid, p_narrowing_rationale text, p_contact_attempted_at timestamp with time zone, p_objected_to_member_id uuid)',
    'advance_arrival(p_arrival uuid, p_from hc.arrival_state, p_to hc.arrival_state, p_lease uuid, p_reason text)',
    'all_domains()',
    'apply_taint(p_type hc.object_type, p_id uuid, p_taint hc.domain[], p_resolved boolean)',
    'approve_proposal(p_proposal_id uuid, p_expected_version integer, p_idempotency_key text, p_edits jsonb, p_step_up_token text)',
    'arrival_auth_detail(p_arrival uuid)',
    'assert_claimed()',
    'assert_manual_flag()',
    'auth_throttle(p_identifier text)',
    'build_dsc()',
    'cancel_arrival(p_arrival uuid)',
    'check_quota(p_circle uuid, p_sender text)',
    'circle_frozen(p_circle uuid, p_subject uuid)',
    'claim_security_actions(p_limit integer)',
    'claim_stage(p_arrival uuid, p_stage text, p_model_id text, p_prompt_version text, OUT result hc.advance_result, OUT lease_id uuid, OUT attempt_no integer, OUT deadline timestamp with time zone)',
    'close_extraction_run()',
    'complete_security_action(p_action_id uuid)',
    'consume_step_up(p_token text, p_operation text, p_target_ref text, p_account uuid)',
    'contact_key(p text)',
    'create_account(p_display_name text)',
    'create_arrival(p_circle_id uuid, p_subject_id uuid, p_channel text, p_parent_arrival_id uuid, p_sender_address text, p_sender_display_name text, p_message_id text, p_auth_result text, p_auth_detail jsonb, p_mime_declared text, p_byte_size bigint, p_page_count integer, p_ingest_idempotency_key text)',
    'create_circle(p_name text, p_subjects jsonb, p_opening_context text[], p_relationship text)',
    'create_invite(p_circle_id uuid, p_invited_email text, p_tier hc.tier, p_subject_ids uuid[], p_note text)',
    'create_manual_proposal(p_circle_id uuid, p_subject_id uuid, p_kind hc.proposal_kind, p_payload jsonb)',
    'ctx()',
    'ctx_for(p_account uuid)',
    'describe_invite(p_token text)',
    'detect_duplicate(p_arrival uuid, p_circle uuid, p_sha bytea)',
    'detect_stage2_duplicate(p_arrival uuid, p_circle uuid, p_subject uuid, p_facts jsonb, p_proposals jsonb)',
    'dom(p jsonb)',
    'draft_proposal(p_arrival uuid, p_circle uuid, p_subject uuid, p_kind hc.proposal_kind, p_payload jsonb)',
    'execute_wasnt_me(p_token text)',
    'expire_held_mail()',
    'expire_scan_results()',
    -- 6A M2 (ADR-0019 Q-C): the review screen's fact read — §4.2.3's
    -- middle region, gated on the ARRIVAL at the same view×5 approval
    -- now uses, and never wider than extractions_select
    'extractions_for(p_arrival uuid)',
    'finalize_extraction(p_arrival uuid, p_lease uuid, p_facts jsonb, p_proposals jsonb)',
    'finalize_interpretation(p_arrival uuid, p_lease uuid, p_proposals jsonb)',
    'finalize_scan(p_arrival uuid, p_lease uuid, p_verdict text, p_detail jsonb)',
    'finalize_store(p_arrival uuid, p_lease uuid, p_storage_key text, p_sha256 bytea, p_mime_detected text, p_byte_size bigint)',
    'grant_vectors(p_account uuid)',
    'guard_row()',
    'head_signature_immutable()',
    'ladder(p_s jsonb, p_taint hc.domain[])',
    'link_provenance(p_child_type hc.object_type, p_child_id uuid, p_parent_type hc.object_type, p_parent_id uuid)',
    'list_known_senders(p_circle uuid)',
    'log(p_circle_id uuid, p_event_type text, p_actor_display_name text, p_actor_account_id uuid, p_subject_id uuid, p_target_member_id uuid, p_domain hc.domain, p_level_before hc.access_level, p_level_after hc.access_level, p_object_type hc.object_type, p_object_id uuid, p_detail jsonb, p_actor_session_id text, p_request_id text, p_corrects_id uuid)',
    'log_artifact_read(p_arrival uuid)',
    'log_chain_heads()',
    'log_denied(p_circle_id uuid, p_domain hc.domain, p_subject_id uuid)',
    'log_sign_out()',
    'mark_unresolved_one(p_type hc.object_type, p_id uuid)',
    'mark_unresolved_subtree(p_type hc.object_type, p_id uuid)',
    'mint_step_up(p_operation text, p_target_ref text)',
    'note_suspicious_attempts(p_identifier text)',
    'outbox_ack(p_outbox_ids uuid[])',
    'outbox_drain(p_limit integer)',
    'own_domain(p_type hc.object_type, p_category hc.doc_category, p_kind hc.timeline_kind, p_declared hc.domain)',
    'pending_security_actions()',
    'pipeline_worker_states()',
    'presence(p_subject uuid)',
    'product_state(p_arrival uuid)',
    'propagate_taint_growth(p_type hc.object_type, p_id uuid, p_delta hc.domain[])',
    'reclassify_taint(p_object_type hc.object_type, p_object_id uuid)',
    'record_auth_failure(p_identifier text)',
    'record_auth_success(p_kind text)',
    'record_context_for(p_arrival uuid)',
    'record_tombstone(p_circle_id uuid, p_object_type text, p_object_id uuid, p_storage_keys text[], p_scope text, p_requested_by uuid, p_reason text)',
    -- 6A M3: approve's mirror. The loop could not close without it —
    -- proposals.reject_reason has waited since 1B with nothing to write it
    'reject_proposal(p_proposal_id uuid, p_expected_version integer, p_idempotency_key text, p_reason text)',
    'remove_member(p_member_id uuid, p_keep_share_ids uuid[])',
    'request_freeze(p_circle_id uuid, p_claimant_contact text, p_reason text, p_claimant_relationship text)',
    'resolve_duplicate(p_arrival uuid, p_resolution text)',
    'resolve_forwarding(p_local_part text)',
    'resolve_object(p_type hc.object_type, p_id uuid)',
    'revise_object(p_object_type hc.object_type, p_object_id uuid, p_patch jsonb)',
    'revoke_invite(p_invite_id uuid)',
    'revoke_sender(p_sender_id uuid)',
    'run_taint_sweep()',
    'scan_cache_lookup(p_sha256 bytea)',
    'sender_lookalike(p_circle uuid, p_domain text)',
    'sender_recognised(p_arrival uuid)',
    'set_grant(p_member_id uuid, p_subject_id uuid, p_domain hc.domain, p_level hc.access_level, p_step_up_token text)',
    'set_opening_context(p_circle uuid, p_context text[])',
    'set_slice(p_slice text)',
    'share_object(p_object_type hc.object_type, p_object_id uuid, p_member_id uuid, p_step_up_token text)',
    'state_label(p hc.arrival_state)',
    'state_rank(p hc.arrival_state)',
    'sweep_provenance()',
    'sweeper_pass()',
    'sync_search_content()',
    'taint_union(a hc.domain[], b hc.domain[])',
    'taint_union_2(a hc.domain[], b hc.domain[])',
    'taint_union_agg(hc.domain[])',
    -- 6A M3: the §4.9 terminal arm as a WRITE HALF — owner-only, called
    -- from the two deciding definers, running AS the calling definer, so
    -- it joins this inventory and NOT the SECURITY DEFINER set below
    'terminalize_decided_arrival(p_arrival uuid)',
    'tier_defaults(p_tier hc.tier)',
    'tombstone_guard()',
    'tsv_documents()',
    'tsv_tasks()',
    'tsv_timeline_events()',
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
  array['accept_invite','accept_sender','activate_forwarding',
        'adjudicate_freeze','advance_arrival','approve_proposal',
        'arrival_auth_detail','assert_claimed',
        'assert_manual_flag','auth_throttle','cancel_arrival','check_quota',
        'claim_security_actions','claim_stage','close_extraction_run',
        'complete_security_action','consume_step_up','create_account',
        'create_arrival',
        'create_circle','create_invite','create_manual_proposal',
        'ctx','ctx_for','describe_invite','execute_wasnt_me','expire_held_mail',
        'expire_scan_results','extractions_for',
        'finalize_extraction','finalize_interpretation','finalize_scan',
        'finalize_store',
        'grant_vectors','link_provenance','list_known_senders',
        'log_artifact_read','log_chain_heads','log_denied',
        'log_sign_out',
        'mint_step_up','note_suspicious_attempts',
        'outbox_ack','outbox_drain','pending_security_actions','presence',
        'product_state',
        'propagate_taint_growth','reclassify_taint','record_auth_failure',
        'record_auth_success','record_context_for','record_tombstone',
        'reject_proposal','remove_member',
        'request_freeze','resolve_duplicate','resolve_forwarding',
        'revise_object','revoke_invite',
        'revoke_sender',
        'run_taint_sweep','scan_cache_lookup','sender_lookalike',
        'sender_recognised','set_grant','set_opening_context','set_slice',
        'share_object','sweep_provenance',
        'sweeper_pass']::name[],
  'SECURITY DEFINER is exactly the seventy-one boundary functions, nothing else (draft/write halves run AS the calling definer — not definers themselves)');

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
  union all select 'outbox_ack', 'hc_pipeline'
  union all select 'outbox_drain', 'hc_pipeline'
  union all select 'sender_recognised', 'hc_pipeline'
  union all select 'sweeper_pass', 'hc_pipeline'
  union all select 'cancel_arrival', 'authenticated'
  union all select 'create_manual_proposal', 'authenticated'
  union all select 'arrival_auth_detail', 'authenticated'
  -- 1D M3: the denial writer — actor forced to hc.uid(), membership-gated
  union all select 'log_denied', 'authenticated'
  -- 1D M5: the re-categorisation surface (TNT-08 — visible_at authorizes
  -- inside) and the OPS-01 scheduler identity
  union all select 'reclassify_taint', 'authenticated'
  union all select 'run_taint_sweep', 'hc_pipeline'
  -- the pure visibility functions: policies evaluate these as the caller
  union all select 'dom', 'authenticated'
  union all select 'all_domains', 'authenticated'
  union all select 'ladder', 'authenticated'
  union all select 'visible_at', 'authenticated'
  -- 2A M1 as amended by M8 (round-9 finding 1): the sign-in throttle (§5.6)
  -- — the first anon-callable surface; authenticated additionally throttles
  -- §5.7 step-up re-auth attempts. Failure is the only request-role-
  -- assertable outcome; success-class recording is identity-bound and
  -- authenticated-only.
  union all select 'auth_throttle', 'anon'
  union all select 'auth_throttle', 'authenticated'
  union all select 'record_auth_failure', 'anon'
  union all select 'record_auth_failure', 'authenticated'
  union all select 'record_auth_success', 'authenticated'
  -- 2A M2: minting a step-up token is a member act on a fresh session;
  -- consume_step_up is deliberately absent — definer bodies only
  union all select 'mint_step_up', 'authenticated'
  -- 2A M3: the invites lifecycle — member acts; tier_defaults readable so
  -- AC-AUTH-8's app snapshot can run as the app runs
  union all select 'create_invite', 'authenticated'
  union all select 'revoke_invite', 'authenticated'
  union all select 'accept_invite', 'authenticated'
  union all select 'tier_defaults', 'authenticated'
  -- 2A M4: the grant and revocation writers — coordinator acts, authorized
  -- in-function
  union all select 'set_grant', 'authenticated'
  union all select 'remove_member', 'authenticated'
  -- 2A M5: the notice path (sign-in runs as anon) and the kill-switch
  -- POST (the clicker may hold no session at all)
  union all select 'note_suspicious_attempts', 'anon'
  union all select 'note_suspicious_attempts', 'authenticated'
  union all select 'execute_wasnt_me', 'anon'
  union all select 'execute_wasnt_me', 'authenticated'
  -- 2A M6: the sender surfaces (member acts); expiry runs as the
  -- scheduler identity (OPS-01 pattern)
  union all select 'accept_sender', 'authenticated'
  union all select 'revoke_sender', 'authenticated'
  union all select 'expire_held_mail', 'hc_pipeline'
  -- 2A M8 (round-9 finding 3): the owed-kill queue's worker surface —
  -- drain posture, hc_pipeline only
  union all select 'pending_security_actions', 'hc_pipeline'
  union all select 'complete_security_action', 'hc_pipeline'
  -- 4A M1 (ADR-0015 R8): the batch — the sign-out log half, the four
  -- maintenance-definer conversions (describe_invite additionally anon:
  -- the accept screen precedes any session), the claim primitive
  union all select 'log_sign_out', 'authenticated'
  union all select 'create_account', 'authenticated'
  union all select 'describe_invite', 'anon'
  union all select 'describe_invite', 'authenticated'
  union all select 'set_slice', 'authenticated'
  union all select 'set_opening_context', 'authenticated'
  union all select 'claim_security_actions', 'hc_pipeline'
  -- 4A M2: the store/scan outcome writers, the cache read and the §11.5
  -- retention sweep — the worker surface, hc_pipeline only
  union all select 'finalize_store', 'hc_pipeline'
  union all select 'finalize_scan', 'hc_pipeline'
  union all select 'scan_cache_lookup', 'hc_pipeline'
  union all select 'expire_scan_results', 'hc_pipeline'
  -- 4A M3: the §5.4 quota answer and the §5.3 lookalike check — the
  -- webhook's questions, hc_pipeline only
  union all select 'check_quota', 'hc_pipeline'
  union all select 'sender_lookalike', 'hc_pipeline'
  -- 4A M4 (PST-01): the family-facing vocabulary — product_state
  -- authorizes in-function (DEF-10); rank/label are pure (the
  -- dom/all_domains precedent)
  union all select 'product_state', 'authenticated'
  union all select 'state_label', 'authenticated'
  union all select 'state_rank', 'authenticated'
  -- 4A M5: activation is the coordinator's act; resolution is the
  -- webhook's (§5.2 step 2)
  union all select 'activate_forwarding', 'authenticated'
  union all select 'resolve_forwarding', 'hc_pipeline'
  -- 4A M6: duplicate resolution is the member's act (manage-gated like
  -- cancel); detect_duplicate is owner-only and appears in no grant row
  union all select 'resolve_duplicate', 'authenticated'
  -- 5A M1 (ADR-0019 Q-iii / D15): the inherited-obligations member
  -- surfaces — the §1.3 step-6 log definer and the known-senders read
  union all select 'log_artifact_read', 'authenticated'
  union all select 'list_known_senders', 'authenticated'
  -- 5A M2 (§3.10's letter): the one pipeline read of the record
  union all select 'record_context_for', 'hc_pipeline'
  -- 6A M2 (Q7 + ADR-0019 Q-C): the fact read §4.2.3's middle region
  -- needs. authenticated only — the pipeline has hc_internal's own path
  -- and never reads a person's view of an arrival
  union all select 'extractions_for', 'authenticated'
  -- 6A M3: the decision a person makes when the answer is no. Same reach
  -- as approve; terminalize_decided_arrival is a write half and appears in
  -- no grant row by design
  union all select 'reject_proposal', 'authenticated'
  -- 5A M3: close_extraction_run is a trigger function — hc_internal-owned,
  -- granted to nobody; it appears in no grant row by design
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
  -- 4A M1 (ADR-0015 R8 items 2a/2c/2d): the converted maintenance writes
  ('hc_internal',   'accounts',        'INSERT'),
  ('hc_internal',   'accounts',        'UPDATE'),
  ('hc_internal',   'circles',         'UPDATE'),
  ('hc_internal',   'auth_attempts',   'SELECT'),
  ('hc_internal',   'auth_attempts',   'INSERT'),
  ('hc_internal',   'auth_attempts',   'DELETE'),
  ('hc_internal',   'known_senders',   'INSERT'),
  ('hc_internal',   'known_senders',   'UPDATE'),
  ('hc_internal',   'outbound_mail',   'SELECT'),
  ('hc_internal',   'outbound_mail',   'INSERT'),
  ('hc_internal',   'security_events', 'SELECT'),
  ('hc_internal',   'security_events', 'INSERT'),
  ('hc_internal',   'security_events', 'UPDATE'),
  -- 2A M8 (round-9 finding 3): the owed-kill queue — enqueued by
  -- execute_wasnt_me, drained through the two hc_pipeline definers
  ('hc_internal',   'security_actions', 'SELECT'),
  ('hc_internal',   'security_actions', 'INSERT'),
  ('hc_internal',   'security_actions', 'UPDATE'),
  ('hc_internal',   'step_up_tokens',  'SELECT'),
  ('hc_internal',   'step_up_tokens',  'INSERT'),
  ('hc_internal',   'step_up_tokens',  'UPDATE'),
  ('hc_internal',   'access_grants',   'UPDATE'),
  ('hc_internal',   'access_grants',   'DELETE'),
  ('hc_internal',   'invites',         'SELECT'),
  ('hc_internal',   'invites',         'INSERT'),
  ('hc_internal',   'invites',         'UPDATE'),
  ('hc_internal',   'circle_members',  'UPDATE'),
  ('hc_internal',   'circles',         'SELECT'),
  ('hc_internal',   'circles',         'INSERT'),
  ('hc_internal',   'subjects',        'SELECT'),
  ('hc_internal',   'subjects',        'INSERT'),
  -- 4A M5: the one flip activate_forwarding performs
  ('hc_internal',   'subjects',        'UPDATE'),
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
  -- 1D M3: the family read (policy-filtered); hc_internal's collapse
  -- UPDATE is COLUMN-scoped (attacl, not relacl) so it is deliberately
  -- absent here — the strict trigger carve-out is asserted in 030.
  ('authenticated', 'access_log',      'SELECT'),
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
  -- 5A M3: publish-only widens to publish-and-supersede (write_extractions
  -- marks prior facts superseded in the publication transaction)
  ('hc_internal',   'extractions',     'UPDATE'),
  -- 5A M3: the run accounting — opened at claim, closed with the lease
  ('hc_internal',   'extraction_runs', 'SELECT'),
  ('hc_internal',   'extraction_runs', 'INSERT'),
  ('hc_internal',   'extraction_runs', 'UPDATE'),
  ('hc_internal',   'known_senders',   'SELECT'),
  ('hc_internal',   'pipeline_outbox', 'SELECT'),
  ('hc_internal',   'pipeline_outbox', 'INSERT'),
  ('hc_internal',   'pipeline_outbox', 'UPDATE'),
  ('hc_internal',   'reason_codes',    'SELECT'),
  ('hc_internal',   'stage_budgets',   'SELECT'),
  -- 4A M3: §5.4 as data, the stage_budgets pattern
  ('hc_internal',   'quota_limits',    'SELECT'),
  -- 1C M9 (round-7 B1): the transition graph as data — read by the CAS only
  ('hc_internal',   'arrival_transitions', 'SELECT'),
  -- 1D M5 (OPS-01): recorded sweep runs, written by hc.run_taint_sweep
  ('hc_internal',   'sweep_runs',      'SELECT'),
  ('hc_internal',   'sweep_runs',      'INSERT'),
  ('hc_internal',   'sweep_runs',      'UPDATE'),
  -- 4A M2: the scan verdict cache / §11.5 retention — DELETE is the
  -- retention sweep's (the auth_attempts pruning precedent)
  ('hc_internal',   'scan_results',    'SELECT'),
  ('hc_internal',   'scan_results',    'INSERT'),
  ('hc_internal',   'scan_results',    'UPDATE'),
  ('hc_internal',   'scan_results',    'DELETE'),
  -- 1D M1: the search writer allowlist finalized (REC-05 → DSC-01) —
  -- hc_internal read/insert/update on dsc, DELETE for nobody (the
  -- document cascade is the only remover). 1D M2: the view-level read.
  ('hc_internal',   'document_search_content', 'SELECT'),
  ('hc_internal',   'document_search_content', 'INSERT'),
  ('hc_internal',   'document_search_content', 'UPDATE'),
  ('authenticated', 'document_search_content', 'SELECT'),
  -- 1C M7 (ING-02/03): table-level read grants; arrivals is COLUMN-granted
  -- (auth_detail and current_lease_id excluded), which lives in
  -- pg_attribute.attacl and is asserted in 025 — deliberately absent here.
  ('authenticated', 'extractions',     'SELECT'),
  ('authenticated', 'proposals',       'SELECT');

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
        'access_grants_internal_revoke','access_grants_internal_set',
        'access_log_internal','access_log_internal_append',
        'access_log_internal_collapse',
        'accounts_internal','accounts_internal_bootstrap',
        'accounts_internal_set_slice',
        'approval_attempts_internal','approval_attempts_internal_update',
        'approval_attempts_internal_write',
        'arrival_events_internal','arrival_events_internal_append',
        'arrivals_internal','arrivals_internal_advance','arrivals_internal_intake',
        'auth_attempts_internal','auth_attempts_internal_append',
        'auth_attempts_internal_prune',
        'circle_members_internal','circle_members_internal_create',
        'circle_members_internal_reactivate',
        'circles_internal','circles_internal_create',
        'circles_internal_set_opening_context',
        'documents_internal','documents_internal_revise',
        'documents_internal_write',
        'dsc_internal','dsc_internal_update','dsc_internal_write',
        'episodes_internal','episodes_internal_revise','episodes_internal_write',
        'extraction_runs_internal','extraction_runs_internal_close',
        'extraction_runs_internal_open',
        'extractions_internal','extractions_internal_supersede',
        'extractions_internal_write',
        'freeze_claims_internal','freeze_claims_internal_write',
        'freezes_internal','freezes_internal_adjudicate','freezes_internal_write',
        'invites_internal','invites_internal_decide','invites_internal_issue',
        'known_senders_internal','known_senders_internal_accept',
        'known_senders_internal_revoke',
        'object_shares_internal','object_shares_internal_create',
        'object_shares_internal_revoke',
        'outbound_mail_internal','outbound_mail_internal_enqueue',
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
        'scan_results_internal','scan_results_internal_cache',
        'scan_results_internal_expire','scan_results_internal_refresh',
        'security_actions_internal','security_actions_internal_complete',
        'security_actions_internal_enqueue',
        'security_events_internal','security_events_internal_consume',
        'security_events_internal_note',
        'step_up_tokens_internal','step_up_tokens_internal_consume',
        'step_up_tokens_internal_mint',
        'subjects_internal','subjects_internal_activate_forwarding',
        'subjects_internal_create',
        'tasks_internal','tasks_internal_revise','tasks_internal_write',
        'timeline_events_internal','timeline_events_internal_revise',
        'timeline_events_internal_write',
        'tombstones_internal','tombstones_internal_write']::name[],
  'the hc_internal policy list is exactly the enumerated one hundred one');

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
  array['authenticated:document_search_content:SELECT',
        'hc_internal:document_search_content:INSERT',
        'hc_internal:document_search_content:SELECT',
        'hc_internal:document_search_content:UPDATE',
        'authenticated:documents:SELECT',
        'hc_internal:documents:INSERT',
        'hc_internal:documents:SELECT',
        'hc_internal:documents:UPDATE'],
  'writer allowlist FINALIZED (1D): documents = authenticated read + hc_internal read/insert/update; dsc adds the M2 view-level read — writes stay hc_internal alone, DELETE for nobody');

select is((
  select coalesce(array_agg(c.relname || ':' || t.tgname order by c.relname, t.tgname),
                  '{}'::text[])
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
    and c.relname in ('documents', 'document_search_content')),
  array['document_search_content:hc_build_dsc',
        'documents:hc_claim_documents', 'documents:hc_guard_documents',
        'documents:hc_sync_search_documents', 'documents:hc_tsv_documents'],
  'writer allowlist: documents carries claim + guard + the 1D tsv builder and dsc sync; dsc carries exactly its builder (§7.1 one place)');

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
