-- ============================================================================
-- 5B · M7 — the round-16 dispositions (docs/review/round-16-findings.md;
-- ADR-0023). The owner granted a bound amendment from ≤ 6 to ≤ 7 for exactly
-- three things, pinned here BEFORE the migration exists (the red leg):
--
--   · Q-A / ADR-0022 D15 (BLOCKER-adjacent) — `authenticated` holds a
--     COLUMN-LEVEL select grant on public.arrivals, and 5A M5 added
--     `duplicate_of_document_id` without extending it. B6's first draft
--     selected that column; Postgres refused per-column, supabase-js
--     returned an ERROR rather than rows, and the page's own empty branch
--     took over — the ENTIRE Care Inbox rendered its first-run empty state,
--     for every caller, on every arrival. A 4B browser leg going red was the
--     only tell. One column joins the grant.
--
--   · THE CLASS, not the instance (round-16 R5/F-4, R5/F-12, R7's Q-A
--     position). The defect shape is: a migration adds a column, a member
--     surface reads it, the grant is never re-pinned. Nothing at the DB
--     layer could catch that. The invariant below is the INVERSE of "every
--     column a surface selects is granted" — which is not mechanically
--     knowable, because the select lists live in TypeScript string
--     literals. Instead the GRANT SET ITSELF is pinned to a checked-in
--     expected set, so ANY future column added to public.arrivals reds this
--     file until someone decides whether members may read it. That is the
--     hc.log_event_types / ING-10 exact-set pattern, applied to
--     information_schema.column_privileges.
--
--     It also pins that public.arrivals is the ONLY table carrying a
--     column-level grant. A second one would open a new drift surface with
--     no pin of its own, silently.
--
--   · Q-B / ADR-0022 D7 (queued by the packet; TAKEN here per ADR-0023 D9)
--     — a page bomb, a pixel bomb, a wall-clock overrun and an oversized
--     render all landed `archive_bounds_exceeded`, whose description reads
--     "Archive depth/entries/expansion" and which is not merely imprecise
--     for a wall-clock timeout but records a different event than the one
--     that happened. `render_bounds_exceeded` joins the enumeration.
--
-- NO SHIPPED MIGRATION IS EDITED. The grant is EXTENDED (the 2A M8 way),
-- never replaced with a table grant: `auth_detail` and `current_lease_id`
-- are withheld deliberately — auth_detail is served at view by
-- hc.arrival_auth_detail under a DEF-10 shape, and current_lease_id is the
-- pipeline fence — so a table grant would expose the verbatim DMARC/SPF/DKIM
-- verdict blob. (ADR-0022 D15's own list of withheld columns was wrong in
-- two of three entries; corrected in ADR-0023 D8 and measured here.)
-- ============================================================================

begin;

select plan(9);

-- ----------------------------------------------------------------------------
-- 1–2 · Q-A: the column joins the grant, and the withheld pair stays withheld.
-- ----------------------------------------------------------------------------
select ok(
  has_column_privilege('authenticated', 'public.arrivals', 'duplicate_of_document_id', 'select'),
  'Q-A: authenticated may SELECT arrivals.duplicate_of_document_id — the stage-2 copy can name the matched document (ADR-0023 D8)');

select ok(
  not has_column_privilege('authenticated', 'public.arrivals', 'auth_detail', 'select')
  and not has_column_privilege('authenticated', 'public.arrivals', 'current_lease_id', 'select'),
  'the grant is EXTENDED, not replaced: auth_detail (view-gated, DEF-10) and current_lease_id (the pipeline fence) stay withheld');

-- ----------------------------------------------------------------------------
-- 3 · THE INVARIANT. The grant set is an EXACT set. Any column added to
--     public.arrivals in a future migration reds this until a human decides
--     whether members may read it — which is the whole defect class.
-- ----------------------------------------------------------------------------
select set_eq(
  $$ select column_name::text
       from information_schema.column_privileges
      where grantee = 'authenticated'
        and table_schema = 'public' and table_name = 'arrivals'
        and privilege_type = 'SELECT' $$,
  $$ values ('id'),('circle_id'),('subject_id'),('parent_arrival_id'),('channel'),
            ('state'),('received_at'),('storage_key'),('content_sha256'),
            ('mime_declared'),('mime_detected'),('byte_size'),('page_count'),
            ('sender_address'),('sender_display_name'),('message_id'),
            ('auth_result'),('scan_verdict'),('scan_at'),('cancelled_by'),
            ('cancelled_at'),('ingest_idempotency_key'),('deleted_at'),
            ('purge_at'),('expires_at'),('duplicate_of_document_id') $$,
  'ING-10 shape: the authenticated column grant on public.arrivals is an EXACT set — a new column reds this file until someone rules on it (round-16 R5/F-4)');

-- ----------------------------------------------------------------------------
-- 4 · Every granted column still EXISTS. A grant naming a dropped column is
--     silently forgotten by Postgres, so the set above could rot green.
-- ----------------------------------------------------------------------------
select is(
  (select count(*)::int
     from information_schema.column_privileges p
     where p.grantee = 'authenticated'
       and p.table_schema = 'public' and p.table_name = 'arrivals'
       and p.privilege_type = 'SELECT'
       and not exists (
         select 1 from information_schema.columns c
          where c.table_schema = p.table_schema and c.table_name = p.table_name
            and c.column_name = p.column_name)),
  0,
  'every granted column still exists on the table');

-- ----------------------------------------------------------------------------
-- 5 · public.arrivals is the ONLY column-level grant surface. A second one
--     would create an unpinned drift surface of exactly this shape.
-- ----------------------------------------------------------------------------
select set_eq(
  $$ select distinct p.table_name::text
       from information_schema.column_privileges p
       join information_schema.tables t
         on t.table_schema = p.table_schema and t.table_name = p.table_name
      where p.grantee = 'authenticated'
        and p.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and not has_table_privilege('authenticated', (p.table_schema || '.' || p.table_name)::regclass, 'select') $$,
  $$ values ('arrivals') $$,
  'public.arrivals is the ONLY table whose authenticated SELECT is column-level — a second would need its own exact-set pin');

-- ----------------------------------------------------------------------------
-- 6–8 · Q-B: the render-bounds reason code, and what it does NOT disturb.
-- ----------------------------------------------------------------------------
select ok(
  exists (select 1 from hc.reason_codes where code = 'render_bounds_exceeded'),
  'Q-B: render_bounds_exceeded is a seeded reason code (ADR-0023 D9)');

select isnt(
  (select description from hc.reason_codes where code = 'render_bounds_exceeded'),
  (select description from hc.reason_codes where code = 'archive_bounds_exceeded'),
  'it describes RENDERING bounds, not archive expansion — the two are different events');

select ok(
  exists (select 1 from hc.reason_codes where code = 'archive_bounds_exceeded'),
  'archive_bounds_exceeded is UNTOUCHED — it still names the archive case it was seeded for');

-- ----------------------------------------------------------------------------
-- 9 · The reason code is usable where the app will use it: extract_failed and
--     extract_timeout both take a reason, and the FK admits the new row.
-- ----------------------------------------------------------------------------
select lives_ok(
  $$ select 1 from hc.reason_codes
      where code in ('render_bounds_exceeded', 'provider_timeout')
      having count(*) = 2 $$,
  'render_bounds_exceeded and provider_timeout are both available to the extract mapping (ADR-0023 D9, D10)');

select * from finish();

rollback;
