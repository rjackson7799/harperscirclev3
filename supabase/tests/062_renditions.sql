-- ============================================================================
-- 6A · M4 — the rendition manifest. Q5 SETTLED 2026-08-24.
-- docs/review/slice-6-plan.md §4.2 + M4; TSD §6.3, §6.4, §4.5;
-- ADR-0023 R3/F-8, R4/F-6. Pinned here BEFORE the migration exists.
--
-- ---------------------------------------------------------------------------
-- TWO OWED FINDINGS, AND THE HOLE UNDER BOTH OF THEM.
--
-- R3/F-8: `promotedPageKey`'s `ext` parameter defaults to 'png'
-- (lib/pipeline/page-keys.ts:62) and the contract test calls exactly that
-- default — while `extFor(mime)` returns 'jpg' for image/jpeg, which is
-- every photo, every scan and every pill bottle. The exported builder
-- encodes the wrong answer for the MAJORITY of arrivals, and slice 6 is the
-- first caller that has to turn a citation into a URL.
--
-- But the finding is smaller than the hole under it: THE REVIEW SCREEN HAS
-- NO WAY TO LEARN A PAGE'S EXTENSION AT ALL. `promoteRenderedPages` copies
-- whatever names the staging prefix held, so the ext is correct IN STORAGE
-- and recorded NOWHERE. The screen can only guess, or list a storage prefix
-- per render — and neither is a contract.
--
-- R4/F-6: worse, LISTING CANNOT DISTINGUISH "this document has three pages"
-- FROM "page three was never promoted". `promoteRenderedPages` runs after
-- `finalizeExtraction` returned `advanced` and is non-atomic with no repair
-- path, so a partial promotion leaves an `extracted` arrival whose citations
-- reference pages that have no artifact, PERMANENTLY.
--
-- ---------------------------------------------------------------------------
-- ONE MIGRATION CLOSES BOTH, because both are the same missing fact: the
-- rendition is written IN THE SAME TRANSACTION as hc.finalize_extraction —
-- arrival, page count AS RENDERED, extension per page — so it exists exactly
-- when the facts that cite it exist. A cancelled or superseded attempt
-- writes NOTHING (§4.5, unchanged), which is what makes the manifest a
-- record of the winner rather than of whoever ran last.
--
-- The extension becomes a FACT rather than a default (case 4), and partial
-- promotion becomes DETECTABLE and therefore REPAIRABLE (case 14): the
-- screen compares the manifest to the objects present and can SAY "page 3 of
-- this document is missing" instead of rendering a citation to a 404.
--
-- It is readable by `authenticated` at the SAME view-on-all-five gate as the
-- pages themselves (cases 11-12), so the screen and the artifact route
-- cannot disagree about who may see this arrival — M2's one-gate property,
-- carried to the manifest.
--
-- THE 6A/6B SEAM IS EXPLICIT (case 10): the DB is ready and the worker fills
-- it in. 6A authors no app-layer unit, so no caller passes a manifest yet;
-- an absent manifest writes no row rather than failing, and 6B B2 supplies
-- it alongside the required `ext` on promotedPageKey and the artifact
-- route's page parameter.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(15);

-- ----------------------------------------------------------------------------
-- Helpers.
-- ----------------------------------------------------------------------------
create function pg_temp.mk_user(p_id uuid) returns uuid language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
          'authenticated', p_id || '@fixture.local', 'x', now(), now(), now(),
          '{}', '{}');
  return p_id;
end $$;

create function pg_temp.call_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.probe_role(p_role text, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  return v;
end $$;

create function pg_temp.tq(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  begin execute p_sql into v; exception when others then v := 'ERROR:' || sqlstate; end;
  return v;
end $$;

-- Park an arrival at `extracting` and claim the extract stage for real, so
-- every finalize below runs through the shipped fence rather than around it.
-- The run identity is REQUIRED at the mint point (5A M3, 20260821120003:280):
-- no stage borrows an identity it does not record, so a lease cannot exist
-- without its extraction_runs row.
create function pg_temp.lease_for(p_arrival uuid) returns uuid
language plpgsql as $$
declare v text;
begin
  v := pg_temp.probe_role('hc_pipeline', format(
    $q$ select lease_id::text
          from hc.claim_stage(%L::uuid, 'extract', 'claude-opus-5', 'v3') $q$,
    p_arrival));
  return v::uuid;
end $$;

-- ----------------------------------------------------------------------------
-- Fixtures. Five arrivals at `extracting`, one per finalize path, plus the
-- two readers that prove the gate.
-- ----------------------------------------------------------------------------
do $wrap$
declare
  u_coord   uuid := pg_temp.mk_user(gen_random_uuid());
  u_partial uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m_coord uuid; m_partial uuid;
  d text; k text; arr uuid;
begin
  insert into public.accounts (id, kind, display_name) values
    (u_coord, 'member', 'Rosa'), (u_partial, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Nell''s circle', u_coord)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'rn6-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_coord, 'coordinator', 'Rosa') returning id into m_coord;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_partial, 'family', 'Priya') returning id into m_partial;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_coord, s1, d::hc.domain, 'manage', u_coord);
  end loop;
  -- below view×5: manage on one domain only, exactly as 060 built it
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_partial, s1, 'health'::hc.domain, 'manage', u_coord);

  foreach k in array array['jpg','png','bad','cancel','stale','none','once'] loop
    insert into public.arrivals (circle_id, subject_id, channel, state,
                                 storage_key, content_sha256, mime_detected,
                                 byte_size, page_count)
    values (c1, s1, 'upload', 'extracting'::hc.arrival_state,
            'orig/circle/' || c1 || '/arrival/' || k, sha256(k::bytea),
            case when k = 'jpg' then 'image/jpeg' else 'application/pdf' end,
            4096, 3)
    returning id into arr;
    perform set_config('t.a_' || k, arr::text, true);
  end loop;

  perform set_config('t.u_coord', u_coord::text, true);
  perform set_config('t.u_partial', u_partial::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
end $wrap$;

-- ----------------------------------------------------------------------------
-- 1-2 · The table, in the §2.1 shape: RLS enabled AND forced in the creating
--       migration, circle-consistent composite FK, one manifest per arrival.
-- ----------------------------------------------------------------------------
select ok(
  (select c.relrowsecurity and c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'arrival_renditions'),
  'public.arrival_renditions exists with RLS ENABLED AND FORCED in its creating migration — §2.1, no exceptions');

select is(
  (select string_agg(conname, ',' order by conname)
     from pg_constraint
    where conrelid = to_regclass('public.arrival_renditions')
      and contype in ('p', 'f')),
  'arrival_renditions_circle_id_arrival_id_fkey,arrival_renditions_circle_id_fkey,arrival_renditions_circle_id_subject_id_fkey,arrival_renditions_pkey',
  'the §2.1 conventions hold: primary key on the arrival (one manifest per arrival, write-once like promotion) and circle-consistent COMPOSITE foreign keys to arrivals and subjects');

-- ----------------------------------------------------------------------------
-- 3-4 · WRITTEN IN finalize_extraction's TRANSACTION, and the extension is a
--       FACT rather than a default (R3/F-8).
-- ----------------------------------------------------------------------------
select is(pg_temp.probe_role('hc_pipeline', format(
  $q$ select hc.finalize_extraction(%L::uuid, %L::uuid, '[]'::jsonb, '[]'::jsonb,
        jsonb_build_object('page_count', 3,
                           'page_exts', jsonb_build_array('jpg','jpg','jpg')))::text $q$,
  current_setting('t.a_jpg'), pg_temp.lease_for(current_setting('t.a_jpg')::uuid))),
  'advanced',
  'the manifest rides finalize_extraction — the ONE transaction that already decides whether the attempt won, so the rendition exists exactly when the facts that cite it exist');

select is(pg_temp.tq(format(
  $q$ select r.page_count::text || ':' || array_to_string(r.page_exts, ',')
        from public.arrival_renditions r where r.arrival_id = %L::uuid $q$,
  current_setting('t.a_jpg'))),
  '3:jpg,jpg,jpg',
  'R3/F-8 closed: the extension is a FACT, recorded per page. promotedPageKey defaulted to png while extFor(image/jpeg) returns jpg — the wrong answer for every photo, every scan and every pill bottle — and the screen had no way to learn the right one at all');

-- ----------------------------------------------------------------------------
-- 5-7 · The manifest is VALIDATED, not merely stored. A manifest that cannot
--       describe a rendering is worse than none: it would make partial
--       promotion undetectable again, from the other direction.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe_role('hc_pipeline', format(
  $q$ select hc.finalize_extraction(%L::uuid, %L::uuid, '[]'::jsonb, '[]'::jsonb,
        jsonb_build_object('page_count', 3,
                           'page_exts', jsonb_build_array('png','png')))::text $q$,
  current_setting('t.a_bad'), pg_temp.lease_for(current_setting('t.a_bad')::uuid))),
  'ERROR:P0001:rendition_invalid',
  'a page count that disagrees with the per-page extensions is refused — "three pages, two extensions" describes no rendering that was ever produced');

select is(pg_temp.tq(format(
  $q$ select (select count(*)::text from public.arrival_renditions r where r.arrival_id = %L::uuid)
           || ':' || (select a.state::text from public.arrivals a where a.id = %L::uuid) $q$,
  current_setting('t.a_bad'), current_setting('t.a_bad'))),
  '0:extracting',
  'and the refusal rolled the WHOLE publication back with it — no manifest, and the transition never happened (023''s "every refused publication wrote NOTHING" discipline, unchanged)');

select is(pg_temp.probe_role('hc_pipeline', format(
  $q$ select hc.finalize_extraction(%L::uuid, %L::uuid, '[]'::jsonb, '[]'::jsonb,
        jsonb_build_object('page_count', 1,
                           'page_exts', jsonb_build_array('tiff')))::text $q$,
  current_setting('t.a_png'), pg_temp.lease_for(current_setting('t.a_png')::uuid))),
  'ERROR:P0001:rendition_invalid',
  'the extension vocabulary is CLOSED to what the renderer actually produces (PageExt = png | jpg, lib/pipeline/page-keys.ts:29) — a manifest cannot claim a format no page-key builder can name');

-- ----------------------------------------------------------------------------
-- 8-9 · §4.5, UNCHANGED: a cancelled or superseded attempt writes NOTHING.
--       This is what makes the manifest the winner's record rather than
--       whoever ran last — the same discipline that governs promotion.
-- ----------------------------------------------------------------------------
do $wrap$
declare v_lease uuid;
begin
  -- claim for real, THEN cancel underneath the worker: §4.5's window
  v_lease := pg_temp.lease_for(current_setting('t.a_cancel')::uuid);
  update public.arrivals set state = 'cancelled'
   where id = current_setting('t.a_cancel')::uuid;
  perform set_config('t.res_cancel', pg_temp.probe_role('hc_pipeline', format(
    $q$ select hc.finalize_extraction(%L::uuid, %L::uuid, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object('page_count', 2,
                             'page_exts', jsonb_build_array('png','png')))::text $q$,
    current_setting('t.a_cancel'), v_lease)), true);

  -- claim for real, THEN close the lease: the worker has been superseded
  v_lease := pg_temp.lease_for(current_setting('t.a_stale')::uuid);
  update public.pipeline_leases set closed_at = now(), outcome = 'expired'
   where id = v_lease;
  perform set_config('t.res_stale', pg_temp.probe_role('hc_pipeline', format(
    $q$ select hc.finalize_extraction(%L::uuid, %L::uuid, '[]'::jsonb, '[]'::jsonb,
          jsonb_build_object('page_count', 2,
                             'page_exts', jsonb_build_array('png','png')))::text $q$,
    current_setting('t.a_stale'), v_lease)), true);
end $wrap$;

select is(
  current_setting('t.res_cancel') || '/' ||
  pg_temp.tq(format(
    $q$ select count(*)::text from public.arrival_renditions r where r.arrival_id = %L::uuid $q$,
    current_setting('t.a_cancel'))),
  'cancelled/0',
  'a CANCELLED attempt writes no rendition — finalize returns `cancelled` and nothing below the won transition runs, so §4.5''s cancel window keeps meaning what it meant');

select is(
  current_setting('t.res_stale') || '/' ||
  pg_temp.tq(format(
    $q$ select count(*)::text from public.arrival_renditions r where r.arrival_id = %L::uuid $q$,
    current_setting('t.a_stale'))),
  'stale_lease/0',
  'a SUPERSEDED attempt''s manifest is never published — the fence refuses before the won transition, so a slow worker cannot overwrite the winner''s record of what was rendered');

-- ----------------------------------------------------------------------------
-- 10 · THE 6A/6B SEAM, stated as a test rather than as a comment. 6A authors
--      no app-layer unit, so nothing passes a manifest yet.
-- ----------------------------------------------------------------------------
select is(pg_temp.probe_role('hc_pipeline', format(
  $q$ select hc.finalize_extraction(%L::uuid, %L::uuid, '[]'::jsonb, '[]'::jsonb)::text $q$,
  current_setting('t.a_none'), pg_temp.lease_for(current_setting('t.a_none')::uuid)))
  || '/' ||
  pg_temp.tq(format(
    $q$ select count(*)::text from public.arrival_renditions r where r.arrival_id = %L::uuid $q$,
    current_setting('t.a_none'))),
  'advanced/0',
  'the four-argument call still works and writes no manifest: the DB is ready and the WORKER fills it in at 6B B2, so this migration adds a capability without stranding the shipped caller');

-- ----------------------------------------------------------------------------
-- 11-13 · THE SAME GATE AS THE PAGES. The screen and the artifact route
--         cannot disagree about who may see this arrival (M2's property).
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select r.page_count::text from public.arrival_renditions r
       where r.arrival_id = %L::uuid $q$,
  current_setting('t.a_jpg'))),
  '3',
  'a member who clears view×5 on the arrival reads its manifest — the same predicate that lets them read the pages it describes');

select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $q$ select count(*)::text from public.arrival_renditions r
       where r.arrival_id = %L::uuid $q$,
  current_setting('t.a_jpg'))),
  '0',
  'and a member below view×5 sees ZERO ROWS — RLS, so the manifest cannot become a side channel telling someone how many pages a document they cannot open has');

select ok(
  (select has_table_privilege('authenticated', to_regclass('public.arrival_renditions'), 'select')
      and not has_table_privilege('authenticated', to_regclass('public.arrival_renditions'), 'insert')
      and not has_table_privilege('authenticated', to_regclass('public.arrival_renditions'), 'update')
      and not has_table_privilege('authenticated', to_regclass('public.arrival_renditions'), 'delete')
      and not has_table_privilege('anon', to_regclass('public.arrival_renditions'), 'select')
      and not has_table_privilege('hc_admin', to_regclass('public.arrival_renditions'), 'select')
      and has_table_privilege('hc_internal', to_regclass('public.arrival_renditions'), 'insert')),
  'privilege closure, read from the catalog: authenticated may SELECT and nothing else, anon and hc_admin hold nothing, and only hc_internal writes — the model wants the privilege ABSENT, not merely unmatched by a policy (§3.7)');

-- ----------------------------------------------------------------------------
-- 14 · R4/F-6 CLOSED: partial promotion becomes DETECTABLE, and detectable
--      is what makes it repairable. Before the manifest, listing a storage
--      prefix could not tell "this document has three pages" from "page
--      three was never promoted", so an `extracted` arrival could cite pages
--      that have no artifact FOR EVER, with no repair path expressible.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select r.page_count::text || ' pages expected, ext for page 3 is ' || r.page_exts[3]
        from public.arrival_renditions r where r.arrival_id = %L::uuid $q$,
  current_setting('t.a_jpg'))),
  '3 pages expected, ext for page 3 is jpg',
  'R4/F-6 closed: the screen can now ask the record what SHOULD be there and name a missing page instead of serving a citation to a 404 — and a re-render/re-promote path is expressible against a recorded shape for the first time');

-- ----------------------------------------------------------------------------
-- 15 · Write-once, like the promotion it describes.
-- ----------------------------------------------------------------------------
select is(pg_temp.tq(format(
  $q$ insert into public.arrival_renditions
        (arrival_id, circle_id, subject_id, page_count, page_exts)
      values (%L::uuid, %L::uuid, %L::uuid, 9, array['png','png','png','png','png','png','png','png','png'])
      returning page_count::text $q$,
  current_setting('t.a_jpg'), current_setting('t.c1'), current_setting('t.s1'))),
  'ERROR:23505',
  'one manifest per arrival: a second write is refused by the primary key, so the winner''s record of what was rendered cannot be quietly replaced');

select * from finish();

rollback;
