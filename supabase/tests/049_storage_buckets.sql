-- ============================================================================
-- 4A · M7 — the storage buckets and the §3.11 posture, asserted in
-- catalog terms (slice-4 plan M7; TSD §2.12, §3.11; the recorded
-- segfault trap keeps every privilege question catalog-based).
--
-- The contract these tests pin:
--   · artifacts + quarantine exist, PRIVATE, with the platform-level
--     52,428,800-byte cap (the P5 per-file bound at the bucket layer —
--     "size caps at the bucket level where the platform supports them").
--   · exports does NOT exist — it waits for its slice, named, never
--     quietly pre-created.
--   · ZERO policies on storage.objects — for anyone. The platform
--     grants anon/authenticated broad table privileges by default (its
--     API model: grants present, policies decide), so the §3.11
--     mechanism is exactly RLS-enabled + policy ABSENCE: no
--     authenticated read path on artifacts (only the artifact route's
--     service-role client reads — revocation closes access on the next
--     request), and no read for ANY role on quarantine (confirmed
--     malware is not releasable by a user action). The absence IS the
--     mechanism; adding any policy here must red this suite.
--   · Our own roles (hc_*) hold ZERO storage.objects privileges — the
--     pipeline writes through the service key at the route layer (4B),
--     never through a role grant.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(6);

select ok(coalesce((
  select b.public = false and b.file_size_limit = 52428800
  from storage.buckets b where b.id = 'artifacts'), false),
  'the artifacts bucket exists — private, capped at the P5 per-file bound (§2.12)');

select ok(coalesce((
  select b.public = false and b.file_size_limit = 52428800
  from storage.buckets b where b.id = 'quarantine'), false),
  'the quarantine bucket exists — private, same cap (confirmed malware, 7 days, hash+verdict after)');

select ok(not exists (select 1 from storage.buckets b where b.id = 'exports'),
  'exports does NOT exist yet — it waits for its slice, never quietly pre-created');

select is((
  select count(*)::int
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage' and c.relname = 'objects'), 0,
  'ZERO policies on storage.objects — the §3.11 absence IS the mechanism, for artifacts (no authenticated path) and quarantine (no path for anyone) alike');

select ok(coalesce((
  select c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'storage' and c.relname = 'objects'), false),
  'RLS is enabled on storage.objects — what makes the zero-policy posture bite under the platform''s broad default grants');

select is((
  select count(*)::int
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  join pg_roles r on r.oid = a.grantee
  where n.nspname = 'storage' and c.relname = 'objects'
    and r.rolname in ('hc_pipeline', 'hc_admin', 'hc_internal', 'hc_runtime')), 0,
  'our roles hold ZERO storage.objects privileges — the pipeline reaches Storage only through the service key at the route layer (A.2''s allowlist)');

select * from finish();
rollback;
