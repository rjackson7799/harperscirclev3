-- ============================================================================
-- 6A · M4 — the rendition manifest. Q5 SETTLED 2026-08-24.
-- docs/review/slice-6-plan.md §4.2 + M4; TSD §6.3, §6.4, §4.5;
-- ADR-0023 R3/F-8, R4/F-6. Pinned by pgTAP 062, which went red before this
-- existed (14 of 15). NO SHIPPED MIGRATION IS EDITED.
--
-- ---------------------------------------------------------------------------
-- ONE MIGRATION CLOSES TWO OWED FINDINGS, because both are the same missing
-- fact: NOTHING ANYWHERE RECORDS WHAT WAS RENDERED.
--
-- R3/F-8 — `promotedPageKey`'s `ext` defaults to 'png'
-- (lib/pipeline/page-keys.ts:62) and its contract test calls exactly that
-- default, while `extFor(mime)` returns 'jpg' for image/jpeg: every photo,
-- every scan, every pill bottle. The exported builder encodes the wrong
-- answer for the MAJORITY of arrivals — and slice 6 is the first caller that
-- has to turn a citation into a URL.
--
-- The finding is smaller than the hole under it. Fixing the default alone
-- would leave the real problem intact: THE SCREEN HAS NO WAY TO LEARN A
-- PAGE'S EXTENSION AT ALL. `promoteRenderedPages` copies whatever names the
-- staging prefix held, so the extension is correct IN STORAGE and recorded
-- NOWHERE. The screen could only guess, or list a storage prefix per render,
-- and neither is a contract.
--
-- R4/F-6 — and LISTING CANNOT DISTINGUISH "this document has three pages"
-- from "page three was never promoted". `promoteRenderedPages` runs AFTER
-- `finalizeExtraction` returns `advanced`, is non-atomic, and has no repair
-- path, so a partial promotion leaves an `extracted` arrival whose citations
-- reference pages that have no artifact — permanently, and invisibly.
--
-- ---------------------------------------------------------------------------
-- THE MANIFEST, AND WHY IT RIDES finalize_extraction.
--
-- It is written in the SAME TRANSACTION as hc.finalize_extraction, which is
-- the one transaction that already decides whether this attempt won. So the
-- manifest exists exactly when the facts that cite it exist, and a CANCELLED
-- or SUPERSEDED attempt writes nothing — §4.5, unchanged. That is what makes
-- it the winner's record rather than whoever ran last: a slow worker cannot
-- overwrite what was actually rendered, because the fence refuses it before
-- the won transition (062 cases 8-9).
--
-- WHAT IT BUYS, stated as properties rather than as intentions:
--   · the extension becomes a FACT rather than a default (R3/F-8), so the
--     wrong answer stops being expressible;
--   · partial promotion becomes DETECTABLE — manifest versus objects present
--     — and detectable is what makes it REPAIRABLE (R4/F-6): the screen can
--     name a missing page instead of serving a citation to a 404, and a
--     re-render/re-promote path is expressible against a recorded shape for
--     the first time.
--
-- IT IS VALIDATED, NOT MERELY STORED. A manifest that cannot describe a
-- rendering would make partial promotion undetectable again from the other
-- direction, so the page count must agree with the per-page extensions, and
-- the extension vocabulary is closed to what the renderer actually produces
-- (`PageExt = 'png' | 'jpg'`, lib/pipeline/page-keys.ts:29). PRD §13.3's
-- 0..200 page cap is the same cap hc.create_arrival already enforces.
--
-- READ AT THE SAME GATE AS THE PAGES. `authenticated` reads it through the
-- §3.4 two-clause policy shape at view-over-all-five on the ARRIVAL — the
-- predicate the artifact route and hc.log_artifact_read enforce and that M2
-- gave to approval. So the screen and the route cannot disagree, and the
-- manifest cannot become a side channel telling someone how many pages a
-- document they cannot open has. ONE GATE ACROSS THE WHOLE SURFACE.
--
-- ---------------------------------------------------------------------------
-- THE SIGNATURE CHANGES, AND THE SHIPPED CALLER IS NOT STRANDED.
-- hc.finalize_extraction gains a fifth parameter. The 4-argument function is
-- DROPPED and replaced by a 5-argument one whose last parameter DEFAULTS TO
-- NULL — rather than created alongside it, because two functions differing
-- only by a defaulted trailing parameter make every 4-argument call
-- ambiguous ("function is not unique"). With only the new one present,
-- lib/hc/workers.ts:150's existing four-argument call resolves unchanged and
-- writes no manifest.
--
-- That is the 6A/6B seam, and 062 case 10 states it as a test rather than a
-- comment: 6A authors NO app-layer unit, so nothing passes a manifest yet.
-- 6B B2 supplies it, alongside the required `ext` on promotedPageKey and the
-- artifact route's page parameter.
--
-- 002's function-inventory exact set is re-pinned in this same commit for
-- the changed signature and the new write half.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1 · public.arrival_renditions — §2.1 throughout: circle-consistent
--     composite FKs, every FK indexed, RLS enabled AND forced in the creating
--     migration. The primary key is the arrival: one manifest per arrival,
--     write-once, exactly like the promotion it describes.
-- ----------------------------------------------------------------------------
create table public.arrival_renditions (
  arrival_id  uuid primary key,
  circle_id   uuid not null references public.circles(id),
  subject_id  uuid not null,
  page_count  int  not null check (page_count between 0 and 200),
  page_exts   text[] not null,
  rendered_at timestamptz not null default now(),
  -- a manifest that cannot describe a rendering is worse than none: it would
  -- make partial promotion undetectable from the other direction
  constraint rendition_exts_match_count check (cardinality(page_exts) = page_count),
  -- closed to what the renderer actually produces (PageExt, page-keys.ts:29)
  constraint rendition_exts_known check (page_exts <@ array['png', 'jpg']::text[]),
  foreign key (circle_id, arrival_id) references public.arrivals (circle_id, id) on delete cascade,
  foreign key (circle_id, subject_id) references public.subjects (circle_id, id)
);
create index arrival_renditions_by_circle  on public.arrival_renditions (circle_id);
create index arrival_renditions_by_subject on public.arrival_renditions (subject_id);

alter table public.arrival_renditions enable row level security;
alter table public.arrival_renditions force  row level security;

-- The model wants the privilege ABSENT, not merely unmatched by a policy
-- (§3.7): nobody holds anything here except the reader and the writer.
revoke all on public.arrival_renditions from anon, authenticated, hc_pipeline, hc_admin;

grant select on public.arrival_renditions to authenticated;
grant select, insert on public.arrival_renditions to hc_internal;

-- The §3.4 two-clause shape: an indexed ctx pre-filter, then the visibility
-- test — the SAME view-on-all-five the pages themselves are served at.
create policy arrival_renditions_select on public.arrival_renditions
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and hc.visible_at((select hc.ctx()), subject_id, hc.all_domains(), true,
                    'arrival', arrival_id, null) >= 'view'
);

create policy arrival_renditions_internal on public.arrival_renditions
  for select to hc_internal using (true);
create policy arrival_renditions_internal_write on public.arrival_renditions
  for insert to hc_internal with check (true);

-- ----------------------------------------------------------------------------
-- 2 · hc.write_rendition — a §4.5 WRITE HALF: owner-only, reachable through
--     the finalizer alone, running AS the calling definer. p_lease is
--     validated as THIS arrival's exactly as hc.write_extractions validates
--     it (20260816010005:162) — never accepted-and-ignored, the F6 posture.
-- ----------------------------------------------------------------------------
create function hc.write_rendition(p_arrival uuid, p_lease uuid, p_rendition jsonb)
returns void language plpgsql
set search_path = ''
as $$
declare
  v_circle  uuid;
  v_subject uuid;
  v_count   int;
  v_exts    text[];
begin
  -- No manifest offered is not an error: the DB is ready and the worker
  -- fills it in at 6B B2. The shipped four-argument caller keeps working.
  if p_rendition is null then
    return;
  end if;
  if jsonb_typeof(p_rendition) <> 'object' then
    raise exception 'rendition_invalid' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.pipeline_leases l
                 where l.id = p_lease and l.arrival_id = p_arrival) then
    raise exception 'rendition_invalid' using errcode = 'P0001';
  end if;

  begin
    v_count := (p_rendition ->> 'page_count')::int;
  exception when others then
    raise exception 'rendition_invalid' using errcode = 'P0001';
  end;

  select coalesce(array_agg(x.v order by x.ord), '{}'::text[]) into v_exts
    from jsonb_array_elements_text(coalesce(p_rendition -> 'page_exts', '[]'::jsonb))
         with ordinality as x(v, ord);

  if v_count is null
     or v_count not between 0 and 200
     or cardinality(v_exts) <> v_count
     or not (v_exts <@ array['png', 'jpg']::text[]) then
    raise exception 'rendition_invalid' using errcode = 'P0001';
  end if;

  select a.circle_id, a.subject_id into v_circle, v_subject
    from public.arrivals a where a.id = p_arrival;

  -- Write-once, like the promotion it describes: the winner's record cannot
  -- be quietly replaced.
  insert into public.arrival_renditions
    (arrival_id, circle_id, subject_id, page_count, page_exts)
  values (p_arrival, v_circle, v_subject, v_count, v_exts)
  on conflict (arrival_id) do nothing;
end $$;

alter function hc.write_rendition(uuid, uuid, jsonb) owner to hc_internal;
revoke execute on function hc.write_rendition(uuid, uuid, jsonb)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- 3 · hc.finalize_extraction gains the manifest. The 4-argument function is
--     DROPPED and replaced rather than overloaded: two functions differing
--     only by a defaulted trailing parameter make every 4-argument call
--     ambiguous. With only this one present, lib/hc/workers.ts:150's shipped
--     four-argument call resolves unchanged and writes no manifest.
--     Body as 5A M5 left it (20260821120005), with the parameter and one
--     call added past the won transition.
-- ----------------------------------------------------------------------------
drop function hc.finalize_extraction(uuid, uuid, jsonb, jsonb);

create function hc.finalize_extraction(
  p_arrival uuid, p_lease uuid, p_facts jsonb, p_proposals jsonb,
  p_rendition jsonb default null)
returns hc.advance_result language plpgsql security definer
set search_path = ''
as $$
declare
  v hc.advance_result;
  v_circle uuid; v_subject uuid;
  v_dup uuid;
  v_to hc.arrival_state := 'extracted'::hc.arrival_state;
  v_reason text;
begin
  -- Discovery for the lock key (an arrival never changes circles), then
  -- the per-circle lock BEFORE any row lock — ADR-0007's R-rule, the same
  -- order hc.advance_arrival uses, so acquisition stays acyclic.
  select a.circle_id, a.subject_id into v_circle, v_subject
    from public.arrivals a where a.id = p_arrival;

  -- ROUND-15 FINDING 1: taken HERE, not first inside advance_arrival. A
  -- matching document committing while this transaction waits is on the
  -- far side of the wait, and the detect call below is a fresh statement,
  -- so its snapshot sees it. advance_arrival's own acquisition of the same
  -- key is then a re-entrant no-op.
  if v_circle is not null then
    perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));
  end if;

  v_dup := hc.detect_stage2_duplicate(p_arrival, v_circle, v_subject,
                                      coalesce(p_facts, '[]'::jsonb),
                                      coalesce(p_proposals, '[]'::jsonb));
  if v_dup is not null then
    v_to := 'duplicate_suspected_stage2'::hc.arrival_state;
    v_reason := 'duplicate_key_fields';
  end if;

  v := hc.advance_arrival(p_arrival, 'extracting', v_to, p_lease, v_reason);
  if v <> 'advanced' then
    return v;                    -- cancelled / frozen / already: nothing below runs
  end if;
  -- Reached only on a won transition; commits with it or not at all.
  if v_dup is not null then
    update public.arrivals set duplicate_of_document_id = v_dup
     where id = p_arrival;
  end if;
  -- 6A M4 (Q5): the manifest goes in FIRST — the rendering is what the
  -- facts below cite, and both commit with the won transition or not at
  -- all. A cancelled or superseded attempt never reaches this line.
  perform hc.write_rendition(p_arrival, p_lease, p_rendition);
  perform hc.write_extractions(p_arrival, p_lease, coalesce(p_facts, '[]'::jsonb));
  perform hc.write_proposals(p_arrival, p_lease, coalesce(p_proposals, '[]'::jsonb));
  return 'advanced'::hc.advance_result;
end $$;

-- ownership and grants restated for the new object (the 2A M8 way). The
-- reach is EXACTLY what the 4-argument function had: hc_pipeline executes
-- it, nobody else holds anything.
alter function hc.finalize_extraction(uuid, uuid, jsonb, jsonb, jsonb)
  owner to hc_internal;
revoke execute on function hc.finalize_extraction(uuid, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.finalize_extraction(uuid, uuid, jsonb, jsonb, jsonb)
  to hc_pipeline;
