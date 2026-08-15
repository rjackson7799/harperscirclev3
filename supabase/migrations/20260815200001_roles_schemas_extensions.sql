-- ============================================================================
-- 1A · M1 — roles, schemas, extensions, deny-by-default EXECUTE.
--
-- TSD §1.2 (the four database roles), §2.1 (schemas, extensions),
-- §3.9 / ADR-0003 finding 8 (ALTER DEFAULT PRIVILEGES revokes PUBLIC
-- EXECUTE globally rather than relying on per-function revokes alone).
--
-- Roles are cluster-wide and survive `supabase db reset`, so creation is
-- guarded. Credentials never appear in migrations (plan boundary rule):
-- hc_pipeline and hc_admin stay NOLOGIN until deploy-time provisioning;
-- tests reach them with SET ROLE over a direct connection. hc_internal is
-- NOLOGIN by design, forever — reachable only as the owner of the
-- enumerated SECURITY DEFINER functions (§1.2).
-- ============================================================================

do $$
begin
  if not exists (select from pg_roles where rolname = 'hc_internal') then
    create role hc_internal nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'hc_pipeline') then
    create role hc_pipeline nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'hc_admin') then
    create role hc_admin nologin;
  end if;
end
$$;

-- The migration runner (postgres — not a true superuser on Supabase images)
-- must hold membership in hc_internal to transfer function ownership to it
-- and to set its default privileges; membership in the other two lets the
-- test suite SET ROLE into them over a direct connection. postgres is the
-- migration/maintenance role, not a request path — the definer invariant
-- (no request-path or admin role a member of a definer owner) is asserted
-- against authenticated/anon/hc_admin/hc_pipeline, and postgres is the
-- documented exemption. Grants are idempotent across resets.
grant hc_internal to postgres;
grant hc_pipeline to postgres;
grant hc_admin    to postgres;

create schema hc;          -- types, helper functions, security-definer writers
create schema admin_meta;  -- admin views only (populated in 1D)

-- Extensions live in the platform's `extensions` schema; code references
-- them fully qualified (extensions.citext, extensions.digest) because every
-- definer function runs with search_path = ''.
create extension if not exists citext   with schema extensions;
create extension if not exists pg_trgm  with schema extensions;  -- §5, installed with its peers
create extension if not exists pgcrypto with schema extensions;  -- sha256 for §2.8 hash chain
create extension if not exists pgmq;                             -- §1.4; owns schema pgmq

-- ----------------------------------------------------------------------------
-- Deny-by-default EXECUTE. Postgres grants EXECUTE on every new function to
-- PUBLIC; these make the function grant itself opt-in for everything created
-- by the migration runner and by hc_internal. The GLOBAL form is deliberate:
-- per-schema default ACLs only ADD to the global defaults — an IN SCHEMA
-- revoke on a fresh state is a silent no-op and would leave PUBLIC EXECUTE
-- in place (ADR-0003 finding 8 says "globally", and this is why).
-- Per-function revoke+grant statements still appear at each creation site —
-- belt and braces that fail in different places (§3.7's own rationale).
-- ----------------------------------------------------------------------------
alter default privileges
  revoke execute on functions from public;
alter default privileges for role hc_internal
  revoke execute on functions from public;
revoke execute on all functions in schema public from public;

-- ----------------------------------------------------------------------------
-- Schema USAGE, explicit (the caller/owner halves of the definer invariant).
-- authenticated resolves hc.* names because policies evaluate hc.ctx() and
-- hc.visible_at() as the querying user; every function grant stays explicit.
-- hc_admin and hc_pipeline get nothing here: §3.9 / §3.10 open their narrow
-- doors in later slices.
-- ----------------------------------------------------------------------------
grant usage on schema hc to authenticated;
grant usage on schema public, hc to hc_internal;
