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

-- RED-STATE STUB (deliberately incomplete, TSD §3.13 red-first discipline):
-- the ladder with no guards — no clause 1 (missing subject context), no
-- clause 2 (freeze), no clause 3 (fail-closed lineage), no clause 4
-- (care_circle ceiling), no clause 5 (shares). The truth-table suite must
-- fail on exactly those security properties before the real §3.3 body lands.
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
  select hc.ladder(p_ctx -> 'subjects' -> p_subject::text,
                   case when p_taint is not null and cardinality(p_taint) > 0
                        then p_taint else hc.all_domains() end);
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
