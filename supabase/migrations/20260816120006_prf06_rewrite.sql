-- ============================================================================
-- 1D · M6 — PRF-06: the inline-friendly hc.visible_at rewrite and the
-- page indexes (ADR-0006 F7/Q6 — the round-6 breach clause; ADR-0009).
--
-- The benchmark (scripts/bench/prf06.mjs, 5,000-arrival realistic
-- fanout) breached both bounds: page-sized queries p95 535–1,680 ms
-- (bound 250), search_broad p95 3,490 ms (bound 2,500). Two causes:
--
--   1 · hc.ladder resolved every rung through hc.dom() — a
--       jsonb_array_elements_text + array_agg per rung, per row — and
--       hc.visible_at's CTE body kept the whole composition from
--       inlining. Rewritten: ladder tests each rung by direct jsonb
--       containment ((vector) @> to_jsonb(p_taint) — order-insensitive
--       superset, exactly dom()'s <@ semantics, the ADR-0002 c9-verified
--       operator family), and visible_at is ONE expression, so ladder
--       and all_domains inline INTO it. The TOP-LEVEL call stays a call:
--       its p_ctx argument is the hoisted (select hc.ctx()) sublink,
--       which the inliner will not duplicate across the body's
--       references — recorded honestly; the measured result (count_docs
--       ~700 ms → ~180 ms) clears every bound with ≥3× margin, and the
--       residual per-row cost is the bare SQL-function dispatch.
--   2 · No index served ORDER BY … LIMIT: a page query filtered and
--       sorted the caller's entire visible set. The three partial page
--       indexes below let the top-N scan stop at 20 visible rows.
--
-- The rule is still written once (§3.3): visible_at CALLS hc.ladder;
-- clause order 1–6 and the FRZ-13 last-position cap are byte-for-byte
-- the same decisions, and 003's truth table plus 033's equivalence grid
-- are the binding oracles over this rewrite. hc.dom() remains for its
-- other call sites (approve, reclassify, tests).
-- ============================================================================

create or replace function hc.ladder(p_s jsonb, p_taint hc.domain[])
returns hc.access_level language sql immutable parallel safe as $$
  select case
    when (p_s -> 'manage')  @> to_jsonb(p_taint) then 'manage'::hc.access_level
    when (p_s -> 'view')    @> to_jsonb(p_taint) then 'view'::hc.access_level
    when (p_s -> 'summary') @> to_jsonb(p_taint) then 'summary'::hc.access_level
    when (p_s -> 'log')     @> to_jsonb(p_taint) then 'log'::hc.access_level
    else 'hidden'::hc.access_level
  end;
$$;

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
select least(
  case
    -- 1. No context for this subject ⇒ the object does not exist for
    --    this caller. FIRST and unconditional: a share must not
    --    manufacture context for a subject the caller holds nothing on.
    when p_ctx -> 'subjects' -> p_subject::text is null
      then 'hidden'::hc.access_level

    -- 2. Freeze suspends ALL interactive access; coalesce fails closed.
    when coalesce((p_ctx -> 'subjects' -> p_subject::text ->> 'frozen')::boolean, true)
      then 'hidden'::hc.access_level

    -- 3. Unresolved or empty lineage: manage on all five, or nothing.
    when not (p_resolved and p_taint is not null and cardinality(p_taint) > 0) then
      case when (p_ctx -> 'subjects' -> p_subject::text -> 'manage')
                  @> to_jsonb(hc.all_domains())
           then 'manage'::hc.access_level else 'hidden'::hc.access_level end

    -- 4. care_circle is a ceiling (own task and named share excepted).
    when (p_ctx -> 'subjects' -> p_subject::text ->> 'tier') = 'care_circle'
     and coalesce(p_owner_member::text, '') is distinct from
         (p_ctx -> 'subjects' -> p_subject::text ->> 'member')
     and not coalesce(p_object_id is not null
           and (p_ctx -> 'shares' -> p_object_type::text) @> to_jsonb(p_object_id), false)
      then 'hidden'::hc.access_level

    -- 5. An object share widens ONE named object to 'view'.
    when coalesce(p_object_id is not null
           and (p_ctx -> 'shares' -> p_object_type::text) @> to_jsonb(p_object_id), false)
      then greatest(hc.ladder(p_ctx -> 'subjects' -> p_subject::text, p_taint),
                    'view'::hc.access_level)

    -- 6. The ordinary case: min over the taint, as set containment.
    --    (Rungs 5–6 see p_taint directly: rung 3 already returned for
    --    every not-lineage_ok shape, which is what the old CTE's
    --    normalized taint expressed.)
    else hc.ladder(p_ctx -> 'subjects' -> p_subject::text, p_taint)
  end,
  -- FRZ-13: the read-only cap — applied AFTER share-widening; absent ⇒ manage.
  coalesce(((p_ctx -> 'subjects' -> p_subject::text ->> 'cap'))::hc.access_level,
           'manage'::hc.access_level));
$$;

-- ----------------------------------------------------------------------------
-- The page indexes: ORDER BY … LIMIT stops at the first 20 VISIBLE rows
-- instead of filtering and sorting the whole circle.
-- ----------------------------------------------------------------------------
create index documents_page on public.documents (circle_id, filed_at desc)
  where deleted_at is null;
create index tasks_page on public.tasks (circle_id, approved_at desc)
  where deleted_at is null;
create index timeline_events_page on public.timeline_events (circle_id, approved_at desc)
  where deleted_at is null;
