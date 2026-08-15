-- ============================================================================
-- 1A · M7 — the authorization context: hc.grant_vectors(), hc.ctx(),
-- hc.ctx_for(), and the identity-table read policies that need them.
--
-- TSD §3.2. hc.ctx() is evaluated once per query per textual reference
-- (InitPlan, ADR-0002 note 2); policies call it as (select hc.ctx()).
--
-- RED STATE (deliberate): hc.grant_vectors() below emits a row ONLY for
-- subjects the account holds grants on, and never a frozen flag — the
-- exact fail-open shape §3.2 forbids (absence is indistinguishable from
-- not-my-circle, so the freeze flag would be absent too). The 004 suite
-- must show it before the real body lands.
-- ============================================================================

-- DEVIATION FROM §3.2's LITERAL TEXT, forced by the platform and recorded
-- for round-5 review: hc.ctx() runs as its owner (SECURITY DEFINER →
-- hc_internal), and resolving auth.uid() requires USAGE on schema auth —
-- which is owned by supabase_admin, the cluster's only superuser. The
-- migration runner (postgres, not superuser) CANNOT grant that usage: the
-- GRANT silently no-ops, locally and in CI alike. hc.uid() mirrors
-- auth.uid()'s exact semantics (the same request.jwt GUC reads, which
-- require no privilege at all) and is what the definer bodies call.
-- Identical behaviour under PostgREST and in tests; auth.uid() remains in
-- use where the AUTHENTICATED role evaluates it (accounts_select_self, M3).
create function hc.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
alter function hc.uid() owner to hc_internal;
revoke execute on function hc.uid() from public, anon, authenticated, hc_pipeline, hc_admin;

-- The one helper specified by contract (§3.2): for every subject in every
-- circle the account is a live member of, the four CUMULATIVE domain arrays
-- (manage ⊆ view ⊆ summary ⊆ log) plus tier, member id and the frozen flag.
create or replace function hc.grant_vectors(p_account uuid)
returns table (
  subject_id uuid, circle_id uuid, member_id uuid, tier hc.tier,
  frozen boolean, manage jsonb, view jsonb, summary jsonb, log jsonb
)
language sql stable security definer set search_path = ''
as $$
  select
    s.id, s.circle_id, m.id, m.tier,
    false as frozen,
    coalesce(jsonb_agg(g.domain) filter (where g.level >= 'manage'),  '[]'::jsonb),
    coalesce(jsonb_agg(g.domain) filter (where g.level >= 'view'),    '[]'::jsonb),
    coalesce(jsonb_agg(g.domain) filter (where g.level >= 'summary'), '[]'::jsonb),
    coalesce(jsonb_agg(g.domain) filter (where g.level >= 'log'),     '[]'::jsonb)
  from public.circle_members m
  join public.access_grants g on g.member_id = m.id
  join public.subjects s on s.id = g.subject_id
  where m.account_id = p_account and m.removed_at is null
    and s.deleted_at is null
  group by s.id, s.circle_id, m.id, m.tier
$$;

create or replace function hc.ctx()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', hc.uid(),
    'circles', coalesce((select array_agg(distinct m.circle_id)
                         from public.circle_members m
                         where m.account_id = hc.uid() and m.removed_at is null),
                        '{}'::uuid[]),
    'subjects', coalesce((
      select jsonb_object_agg(s.subject_id::text, jsonb_build_object(
        'c',       s.circle_id,
        'member',  s.member_id,
        'tier',    s.tier,
        'frozen',  s.frozen,
        'manage',  s.manage, 'view', s.view, 'summary', s.summary, 'log', s.log))
      from hc.grant_vectors(hc.uid()) s), '{}'::jsonb),
    -- object_shares is a 1B table (plan slice boundary); a function body
    -- cannot reference a table that does not exist, so the shares key is
    -- present-and-empty until 1B replaces this body with the §3.2 verbatim
    -- one. Present-but-empty is the fail-closed shape; visible_at()'s
    -- clause-5 semantics are fully truth-table-tested in 003 regardless.
    'shares', '{}'::jsonb);
$$;

-- The background-work boundary (§3.2): identical body, keyed on p_account.
-- Callable by NOTHING — no request-path role holds EXECUTE; it exists only
-- to be called from inside enumerated definer functions, each of which
-- derives the account from stored state rather than accepting it as an
-- argument.
create or replace function hc.ctx_for(p_account uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', p_account,
    'circles', coalesce((select array_agg(distinct m.circle_id)
                         from public.circle_members m
                         where m.account_id = p_account and m.removed_at is null),
                        '{}'::uuid[]),
    'subjects', coalesce((
      select jsonb_object_agg(s.subject_id::text, jsonb_build_object(
        'c',       s.circle_id,
        'member',  s.member_id,
        'tier',    s.tier,
        'frozen',  s.frozen,
        'manage',  s.manage, 'view', s.view, 'summary', s.summary, 'log', s.log))
      from hc.grant_vectors(p_account) s), '{}'::jsonb),
    'shares', '{}'::jsonb);
$$;

alter function hc.grant_vectors(uuid) owner to hc_internal;
alter function hc.ctx()              owner to hc_internal;
alter function hc.ctx_for(uuid)      owner to hc_internal;

revoke execute on function hc.grant_vectors(uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;
revoke execute on function hc.ctx()
  from public, anon;
revoke execute on function hc.ctx_for(uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

grant execute on function hc.ctx() to authenticated;

-- ----------------------------------------------------------------------------
-- The identity-table read policies (the M3/M4 boundary closes here).
-- §3.4 two-clause shape degenerates on identity tables: the cheap indexed
-- circle pre-filter IS the decision — these tables carry no taint.
-- ----------------------------------------------------------------------------
create policy circles_select on public.circles
  for select to authenticated
  using ((select hc.ctx() -> 'circles') @> to_jsonb(id));

create policy subjects_select on public.subjects
  for select to authenticated
  using (
        (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
    and deleted_at is null
  );

create policy circle_members_select on public.circle_members
  for select to authenticated
  using ((select hc.ctx() -> 'circles') @> to_jsonb(circle_id));

-- Own rows only: the caller's member ids are exactly the 'member' values in
-- their ctx subjects map. Coordinator grant management arrives with its
-- surface (slice 2+); under-granting is the reversible direction.
create policy access_grants_select_own on public.access_grants
  for select to authenticated
  using (
        (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
    and exists (select 1
                from jsonb_each((select hc.ctx()) -> 'subjects') e
                where (e.value ->> 'member')::uuid = member_id)
  );
