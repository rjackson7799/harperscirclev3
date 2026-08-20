-- ============================================================================
-- Local seed (supabase db reset only — this file NEVER deploys).
--
-- The hc_runtime LOGIN credential (4A M1 item 4; ADR-0015 R8/R3).
-- Credentials never ride migrations, so the local login role that stands
-- in for the hosted deploy-provisioned credential is created here. The
-- password is the local stack's open convention (the same one the CLI
-- stack uses for postgres) — nothing secret exists in this file. Hosted
-- provisioning and its verification checklist:
-- docs/ops/runtime-db-credentials.md.
--
-- Roles are cluster-wide and survive resets, so creation is guarded and
-- the membership grant is idempotent. pgTAP 043 tolerates this member —
-- the upgrade leg runs without seed, so its presence is allowed, never
-- required.
-- ============================================================================
do $$
begin
  if not exists (select from pg_roles where rolname = 'hc_runtime_login') then
    create role hc_runtime_login login password 'postgres';
  end if;
end
$$;

grant hc_runtime to hc_runtime_login;
