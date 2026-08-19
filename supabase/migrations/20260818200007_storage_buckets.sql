-- ============================================================================
-- 4A · M7 — the artifacts and quarantine buckets (slice-4 plan M7;
-- TSD §2.12, §3.11; pgTAP 049 pinned the posture red-first).
--
-- Both PRIVATE, both capped at the platform level with the P5 per-file
-- bound (52,428,800 bytes — "size caps at the bucket level where the
-- platform supports them"). Keys are content-addressed
-- (circle/<circle>/arrival/<arrival>/<sha256> — hc.finalize_store
-- verifies the shape exactly; write-once by construction).
--
-- DELIBERATELY CREATED HERE AND NOTHING ELSE: no storage.objects
-- policies, for anyone. The platform grants anon/authenticated broad
-- table privileges by default (its API model: grants present, policies
-- decide), so with RLS enabled the policy ABSENCE is the §3.11
-- mechanism — no authenticated read path on artifacts (only the 4B
-- artifact route's service-role client reads, which is what makes
-- revocation close access on the next request, AC-PPL-4), and no read
-- for ANY role on quarantine (confirmed malware is not releasable by a
-- user action, PRD §4.2.2). 049 reds if any policy ever appears.
--
-- The exports bucket waits for its slice (§2.12 names it; nothing
-- pre-creates it).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('artifacts',  'artifacts',  false, 52428800),
  ('quarantine', 'quarantine', false, 52428800);
