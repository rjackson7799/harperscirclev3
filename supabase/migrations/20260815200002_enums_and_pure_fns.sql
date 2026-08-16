-- ============================================================================
-- 1A · M2 — enumerated types and the pure visibility functions.
--
-- TSD §2.2 (enums, hc.dom), §3.3 (hc.all_domains, hc.ladder, hc.visible_at).
-- Everything here is IMMUTABLE and touches no table: the whole visibility
-- model is testable as a truth table with no fixtures (§3.13).
-- ============================================================================

-- Ascending. min() and the comparison operators depend on this order.
create type hc.access_level as enum ('hidden','log','summary','view','manage');

create type hc.domain as enum ('memories','health','schedule','documents','finances');

create type hc.tier         as enum ('coordinator','family','care_circle');
create type hc.account_kind as enum ('member','admin');
create type hc.object_type  as enum ('document','task','timeline_event','profile_fact',
                                     'episode','arrival','extraction','proposal');

create type hc.doc_category as enum ('medical','medications','insurance',
                                     'legal','financial','labs','other');

-- A proposal's kind is NOT hc.object_type: conflicts and episode groupings are
-- proposals in their own right (PRD §4.2.5, §4.4.2) and have no record table.
create type hc.proposal_kind as enum ('document','task','timeline_event',
                                      'profile_fact','conflict','episode');

-- PRD §4.2.2. The family sees hc.product_state; these are implemented distinctly
-- because collapsing them makes failures unattributable and retries unsafe.
create type hc.arrival_state as enum (
  'received','store_failed','stored',
  'scanning','quarantined','scan_unavailable','scan_inconclusive','scanned',
  'extracting','extract_timeout','extract_failed','cancelled','extracted',
  'interpreting','proposals_ready',
  'held_unknown_sender','needs_password','duplicate_suspected',
  'filed','nothing_filed','unsupported_type');

create type hc.timeline_kind as enum ('medical','care','admin','memory');
create type hc.risk_class    as enum ('standard','high');

-- ----------------------------------------------------------------------------
-- One helper, used by every policy: jsonb array of domain names → typed array.
-- ----------------------------------------------------------------------------
create or replace function hc.dom(p jsonb) returns hc.domain[]
language sql immutable parallel safe as $$
  select coalesce((select array_agg(v::hc.domain)
                   from jsonb_array_elements_text(coalesce(p,'[]'::jsonb)) v),
                  '{}'::hc.domain[]);
$$;

-- The five-domain literal: an IMMUTABLE function cannot call enum_range
-- (STABLE). A pgTAP test asserts equality so a sixth domain fails the suite.
create or replace function hc.all_domains() returns hc.domain[]
language sql immutable parallel safe as $$
  select array['memories','health','schedule','documents','finances']::hc.domain[];
$$;

-- The ladder alone. Separated so it can be unit-tested against a truth table
-- and so no call site reaches it without first passing visible_at()'s guards.
create or replace function hc.ladder(p_s jsonb, p_taint hc.domain[])
returns hc.access_level language sql immutable parallel safe as $$
  select case
    when p_taint <@ hc.dom(p_s -> 'manage')  then 'manage'::hc.access_level
    when p_taint <@ hc.dom(p_s -> 'view')    then 'view'::hc.access_level
    when p_taint <@ hc.dom(p_s -> 'summary') then 'summary'::hc.access_level
    when p_taint <@ hc.dom(p_s -> 'log')     then 'log'::hc.access_level
    else 'hidden'::hc.access_level
  end;
$$;

-- Every visibility question in the product resolves through this function;
-- there is deliberately no second place the rule is written (§3.3). The
-- ORDER of clauses 1–5 is the security property, not a style choice — the
-- truth-table suite asserts each ordering independently (§3.13).
create or replace function hc.visible_at(
  p_ctx         jsonb,
  p_subject     uuid,
  p_taint       hc.domain[],
  p_resolved    boolean,
  p_object_type hc.object_type default null,
  p_object_id   uuid           default null,
  p_owner_member uuid          default null
) returns hc.access_level
language sql immutable parallel safe
as $$
with e as (select p_ctx -> 'subjects' -> p_subject::text as s),
shared as (
  select coalesce(p_object_id is not null
     and (p_ctx -> 'shares' -> p_object_type::text) @> to_jsonb(p_object_id), false) as ok
),
t as (
  select
    case when p_resolved and p_taint is not null and cardinality(p_taint) > 0
         then p_taint else hc.all_domains() end as taint,
    (p_resolved and p_taint is not null and cardinality(p_taint) > 0) as lineage_ok
)
select case
  -- 1. No context for this subject ⇒ the object does not exist for this caller.
  --    FIRST and unconditional: a share must not be able to manufacture context for
  --    a subject the caller holds nothing on.
  when (select s from e) is null                                  then 'hidden'::hc.access_level

  -- 2. Freeze suspends ALL interactive access, including the custodian's and every
  --    coordinator's.  coalesce(...,true) so a missing key fails closed. (AC-PERM-11)
  when coalesce(((select s from e) ->> 'frozen')::boolean, true)   then 'hidden'::hc.access_level

  -- 3. Unresolved or empty lineage: manage on all five, or nothing.  The ladder is
  --    NOT evaluated here — running it would hand 'log' to a member holding log on
  --    all five, which is exactly what AC-PERM-9 forbids.  A share cannot lift this
  --    either, because we do not know what the object carries.
  when not (select lineage_ok from t) then
       case when hc.all_domains() <@ hc.dom((select s from e) -> 'manage')
            then 'manage'::hc.access_level else 'hidden'::hc.access_level end

  -- 4. care_circle is a ceiling: only what is assigned to them or shared with them.
  --    p_owner_member null ⇒ distinct from any member id ⇒ hidden. (PRD §7.4, AC-TASK-5)
  when ((select s from e) ->> 'tier') = 'care_circle'
   and coalesce(p_owner_member::text, '') is distinct from ((select s from e) ->> 'member')
   and not (select ok from shared)                                then 'hidden'::hc.access_level

  -- 5. An object share widens ONE named object to 'view'.  Reachable only past 1–3,
  --    so it can neither invent subject context nor outlive a freeze nor bypass
  --    fail-closed lineage.  It never widens a domain and never propagates.
  when (select ok from shared) then
       greatest(hc.ladder((select s from e), (select taint from t)), 'view'::hc.access_level)

  -- 6. The ordinary case: min over the taint, as set containment.
  else hc.ladder((select s from e), (select taint from t))
end;
$$;

-- ----------------------------------------------------------------------------
-- Ownership and grants. Owner is hc_internal uniformly (non-login); PUBLIC
-- EXECUTE is already denied by M1's global default privileges — the explicit
-- revokes are the belt to that suspender, and the grants are the whole
-- callable surface: policies evaluate these as the querying user.
--
-- An ownership transfer requires the NEW owner to hold CREATE on the schema
-- (M1 granted only USAGE — found by this migration failing with
-- "permission denied for schema hc" at the first ALTER ... OWNER).
-- ----------------------------------------------------------------------------
grant create on schema hc to hc_internal;

alter function hc.dom(jsonb)                owner to hc_internal;
alter function hc.all_domains()             owner to hc_internal;
alter function hc.ladder(jsonb, hc.domain[]) owner to hc_internal;
alter function hc.visible_at(jsonb, uuid, hc.domain[], boolean, hc.object_type, uuid, uuid)
  owner to hc_internal;

revoke execute on function
  hc.dom(jsonb), hc.all_domains(), hc.ladder(jsonb, hc.domain[]),
  hc.visible_at(jsonb, uuid, hc.domain[], boolean, hc.object_type, uuid, uuid)
from public, anon;

grant execute on function
  hc.dom(jsonb), hc.all_domains(), hc.ladder(jsonb, hc.domain[]),
  hc.visible_at(jsonb, uuid, hc.domain[], boolean, hc.object_type, uuid, uuid)
to authenticated;
