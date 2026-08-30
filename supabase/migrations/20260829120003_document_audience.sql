-- ============================================================================
-- 7A · M3 — document audience: hc.document_audience ·
-- hc.recategorize_document · hc.revoke_share
-- (PRD §4.3.2, §4.3.4, §4.3.5, §4.3.6; AC-DOC-5/6; AC-PERM-10's revoke
-- half; TSD §2.6, §7.1). docs/review/slice-7-plan.md, "Migration bound
-- (Q2)", row M3 — BINDING. Pinned by pgTAP 068, which went red before this
-- existed. NO SHIPPED MIGRATION IS EDITED — this migration only adds.
--
-- ---------------------------------------------------------------------------
-- WHAT STOOD IN THE WAY. `documents.category` maps to a permission domain
-- (hc.own_domain since 1B) and `hc.reclassify_taint` has been the ONE
-- shrinking path since 1B M5 — but nothing computed WHO gains and WHO loses
-- when a category moves, nothing moved category and taint together, and
-- `hc.revise_object`'s document allowlist is `title, summary_text`. Shares
-- could be revoked only inside hc.remove_member and the security-notice
-- path: "revocable in one action" (§4.3.5) had no action.
--
-- ---------------------------------------------------------------------------
-- RE-CATEGORISING IS AN AUTHORIZATION CHANGE, NOT A FILING PREFERENCE
-- (§4.3.2), and it is treated as one, in this order:
--
--   1 · THE AUDIENCE, BY NAME. hc.document_audience(document, category)
--       returns exactly the live account-holding members whose visibility
--       of THIS document changes under the proposed category — name, tier,
--       level before, level after — each computed from that member's OWN
--       vectors (hc.ctx_for) through hc.visible_at with the document's
--       current taint and its predicted taint (own domain of the new
--       category ∪ the union of its parents' taint — reclassify's own
--       formula). A member with a named share sits at view on both sides
--       and is absent; a coordinator at manage on both sides is absent.
--       "This moves it out of health. Lena and Ruth will be able to see
--       it." is rendered from this and from nothing else.
--   2 · ONE GATE FOR THE SENTENCE AND THE WRITE. Both functions require
--       manage over the document AS IT STANDS (which includes the source
--       domain) AND manage on the destination domain — §4.3.2's fourth
--       rule, "re-categorisation cannot be used to widen your own access".
--       The preview refuses on exactly the move's gate, so the interface's
--       sentence and the database's answer cannot disagree.
--   3 · THE MOVE, IN ONE TRANSACTION. hc.recategorize_document rewrites
--       `category`; the UPDATE lists `title` and `summary_text` in its SET
--       so the 1D builders fire — tsv_summary rebuilt, the
--       document_search_content row rebuilt by hc.sync_search_content — in
--       this transaction (§4.3.6: "index membership is synchronous with
--       access"); then, when the domain changed, it calls
--       hc.reclassify_taint('document', id): the ONE shrinking path
--       recomputes this document's taint and every descendant's to a fixed
--       point under the row-scoped guard marker. If that recompute reports
--       `completed: false` the move refuses and the category rolls back
--       with it — together, or not at all. Index membership is a policy
--       read over the document's taint, so it follows the taint in the
--       same commit by construction; the rebuild is what keeps the row's
--       derived columns honest.
--   4 · THE LOG, WITH BOTH AUDIENCES. The person's `audience_changed` entry
--       names the actor, the categories and domains before and after, the
--       taint before and after, and BOTH audiences by name — everyone who
--       could see the document before, everyone who can after — plus who
--       gained and who lost. hc.reclassify_taint writes its OWN
--       `audience_changed` entry beside it (actor "Reclassification", the
--       taint sets), exactly as a 1D reclassify always has: one act, one
--       recompute, both on the record, and 068:19 says two.
--
-- A same-domain re-categorisation (legal → other) moves the category and
-- no taint; the recompute is skipped and the entry carries an empty diff.
-- The same category is a quiet no-op. There are no outstanding signed URLs
-- to revoke — the byte path never issues one (§1.3). The move refuses under
-- a freeze with the NAMED freeze_active: moving a document can widen who
-- reads it. Refusals are one shape per function (DEF-10).
--
-- UNSHARE IN ONE ACTION (§4.3.5, AC-DOC-5). hc.revoke_share(share): the
-- granter, or a live coordinator of the circle; sets revoked_at, logs
-- object_share_revoked. An assignment-created share may be revoked here
-- too — "revocable in one action" — and the assignment stands. Revocation
-- reduces reach and is permitted under a freeze (the remove_member
-- precedent). Anyone else, an already-revoked share and a nonexistent one
-- are ONE shape.
--
-- The AI role holds no EXECUTE on any of the three. `hc.revise_object`'s
-- document allowlist is NOT widened: category has exactly one door.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The predicted taint under a proposed category: reclassify's per-node
-- formula, own domain ∪ the union of the parents' stored taint.
-- Owner-only, running AS the calling definer.
-- ----------------------------------------------------------------------------
create function hc.document_taint_under(p_document uuid, p_category hc.doc_category)
returns hc.domain[] language sql stable
set search_path = ''
as $$
  select hc.taint_union(
    array[hc.own_domain('document', p_category, null, null)]::hc.domain[],
    coalesce((select hc.taint_union_agg(p2.taint)
                from public.provenance_edges e
                join lateral hc.resolve_object(e.parent_type, e.parent_id) p2 on true
               where e.child_type = 'document' and e.child_id = p_document),
             '{}'::hc.domain[]));
$$;
alter function hc.document_taint_under(uuid, hc.doc_category) owner to hc_internal;
revoke execute on function hc.document_taint_under(uuid, hc.doc_category)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- Every live account-holding member's level on the document under two
-- taints, from each member's OWN vectors. Owner-only, running AS the
-- calling definer; the two callers filter it.
-- ----------------------------------------------------------------------------
create function hc.document_audience_rows(
  p_document uuid,
  p_taint_before hc.domain[], p_resolved_before boolean,
  p_taint_after  hc.domain[], p_resolved_after  boolean)
returns table (member_id uuid, display_name text, tier hc.tier,
               before hc.access_level, after hc.access_level)
language sql stable
set search_path = ''
as $$
  select m.id, m.display_name_at_join, m.tier,
         hc.visible_at(hc.ctx_for(m.account_id), d.subject_id,
                       p_taint_before, p_resolved_before, 'document', d.id, null),
         hc.visible_at(hc.ctx_for(m.account_id), d.subject_id,
                       p_taint_after, p_resolved_after, 'document', d.id, null)
    from public.documents d
    join public.circle_members m
      on m.circle_id = d.circle_id and m.removed_at is null and m.account_id is not null
   where d.id = p_document
   order by m.display_name_at_join, m.id;
$$;
alter function hc.document_audience_rows(uuid, hc.domain[], boolean, hc.domain[], boolean)
  owner to hc_internal;
revoke execute on function hc.document_audience_rows(uuid, hc.domain[], boolean, hc.domain[], boolean)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- hc.document_audience — the preview.
-- ----------------------------------------------------------------------------
create function hc.document_audience(p_document uuid, p_category hc.doc_category)
returns table (member_id uuid, display_name text, tier hc.tier,
               before hc.access_level, after hc.access_level)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_doc record;
  v_ctx jsonb := hc.ctx();
  v_new hc.domain[];
begin
  select d.* into v_doc from public.documents d
   where d.id = p_document and d.deleted_at is null;
  if v_doc.id is null then
    raise exception 'audience_refused' using errcode = 'P0001';
  end if;

  -- THE MOVE'S GATE: manage over the document as it stands, AND manage on
  -- the destination domain (§4.3.2's fourth rule).
  if hc.visible_at(v_ctx, v_doc.subject_id, v_doc.taint, v_doc.taint_resolved,
                   'document', p_document, null) < 'manage'
     or not ((v_ctx -> 'subjects' -> v_doc.subject_id::text -> 'manage')
             @> to_jsonb(array[hc.own_domain('document', p_category, null, null)])) then
    raise exception 'audience_refused' using errcode = 'P0001';
  end if;

  -- The recompute restores `resolved` when it completes, so the AFTER side
  -- is read as resolved: an unresolved document opening up IS an audience
  -- change (rung 3 hid it from everyone below manage×5).
  v_new := hc.document_taint_under(p_document, p_category);
  return query
    select r.member_id, r.display_name, r.tier, r.before, r.after
      from hc.document_audience_rows(p_document, v_doc.taint, v_doc.taint_resolved,
                                     v_new, true) r
     where r.before <> r.after
     order by r.display_name, r.member_id;
end $$;

alter function hc.document_audience(uuid, hc.doc_category) owner to hc_internal;
revoke execute on function hc.document_audience(uuid, hc.doc_category)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.document_audience(uuid, hc.doc_category) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.recategorize_document — the move.
-- ----------------------------------------------------------------------------
create function hc.recategorize_document(p_document uuid, p_category hc.doc_category)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_doc record;
  v_ctx jsonb;
  v_own_old hc.domain;
  v_own_new hc.domain;
  v_taint_before hc.domain[];
  v_taint_after  hc.domain[];
  v_before jsonb;
  v_after  jsonb;
  v_gained jsonb;
  v_lost   jsonb;
  v_res    jsonb;
begin
  if v_actor is null then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;

  select d.* into v_doc from public.documents d
   where d.id = p_document and d.deleted_at is null;
  if v_doc.id is null then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;

  -- R-rule: the taint lock (growth and shrink serialise here), then the
  -- re-read FOR UPDATE, then every authorization under the lock.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_doc.circle_id::text));
  select d.* into v_doc from public.documents d
   where d.id = p_document and d.deleted_at is null
   for update;
  if v_doc.id is null then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.freezes f
             where f.circle_id = v_doc.circle_id
               and f.state in ('open', 'unresolved')) then
    raise exception 'freeze_active' using errcode = 'P0001';
  end if;

  v_own_old := hc.own_domain('document', v_doc.category, null, null);
  v_own_new := hc.own_domain('document', p_category, null, null);

  v_ctx := hc.ctx();
  if hc.visible_at(v_ctx, v_doc.subject_id, v_doc.taint, v_doc.taint_resolved,
                   'document', p_document, null) < 'manage'
     or not ((v_ctx -> 'subjects' -> v_doc.subject_id::text -> 'manage')
             @> to_jsonb(array[v_own_new])) then
    raise exception 'recategorize_refused' using errcode = 'P0001';
  end if;

  if p_category = v_doc.category then
    return jsonb_build_object('document_id', p_document, 'category', p_category,
                              'domain', v_own_new, 'changed', false);
  end if;

  -- The audience BEFORE, from every member's own vectors, read before any
  -- row moves.
  v_taint_before := v_doc.taint;
  select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'name', r.display_name,
                                               'tier', r.tier, 'level', r.before)
                            order by r.display_name, r.member_id)
                  filter (where r.before > 'hidden'), '[]'::jsonb)
    into v_before
    from hc.document_audience_rows(p_document, v_taint_before, v_doc.taint_resolved,
                                   v_taint_before, v_doc.taint_resolved) r;

  -- The category, with title and summary_text in the SET list so the 1D
  -- builders fire: tsv_summary and the document_search_content row are
  -- rebuilt in THIS transaction (§4.3.6).
  update public.documents
     set category = p_category, title = title, summary_text = summary_text
   where id = p_document;

  -- The domain moved: the ONE shrinking path recomputes this document and
  -- every descendant to a fixed point. Together, or not at all.
  if v_own_old <> v_own_new then
    v_res := hc.reclassify_taint('document', p_document);
    if not coalesce((v_res ->> 'completed')::boolean, false) then
      raise exception 'recategorize_refused' using errcode = 'P0001';
    end if;
  end if;
  select d.taint, d.taint_resolved into v_taint_after, v_doc.taint_resolved
    from public.documents d where d.id = p_document;

  -- The audience AFTER, from the taint as it now stands.
  select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'name', r.display_name,
                                               'tier', r.tier, 'level', r.after)
                            order by r.display_name, r.member_id)
                  filter (where r.after > 'hidden'), '[]'::jsonb),
         coalesce(jsonb_agg(r.display_name order by r.display_name, r.member_id)
                  filter (where r.before = 'hidden' and r.after > 'hidden'), '[]'::jsonb),
         coalesce(jsonb_agg(r.display_name order by r.display_name, r.member_id)
                  filter (where r.before > 'hidden' and r.after = 'hidden'), '[]'::jsonb)
    into v_after, v_gained, v_lost
    from hc.document_audience_rows(p_document, v_taint_before, v_doc.taint_resolved,
                                   v_taint_after, v_doc.taint_resolved) r;

  -- The person's entry: both audiences, by name (§4.3.2).
  perform hc.log(v_doc.circle_id, 'audience_changed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_doc.subject_id,
                 p_object_type => 'document', p_object_id => p_document,
                 p_detail => jsonb_build_object(
                   'category_before', v_doc.category, 'category_after', p_category,
                   'domain_before', v_own_old, 'domain_after', v_own_new,
                   'taint_before', to_jsonb(v_taint_before),
                   'taint_after',  to_jsonb(v_taint_after),
                   'audience_before', v_before, 'audience_after', v_after,
                   'gained', v_gained, 'lost', v_lost));

  return jsonb_build_object(
    'document_id', p_document, 'category', p_category, 'domain', v_own_new,
    'changed', true,
    'taint_before', to_jsonb(v_taint_before), 'taint_after', to_jsonb(v_taint_after),
    'gained', jsonb_array_length(v_gained), 'lost', jsonb_array_length(v_lost),
    'gained_names', v_gained, 'lost_names', v_lost);
end $$;

alter function hc.recategorize_document(uuid, hc.doc_category) owner to hc_internal;
revoke execute on function hc.recategorize_document(uuid, hc.doc_category)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.recategorize_document(uuid, hc.doc_category) to authenticated;

-- ----------------------------------------------------------------------------
-- hc.revoke_share — unshare in one action.
-- ----------------------------------------------------------------------------
create function hc.revoke_share(p_share_id uuid)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_share record;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  select sh.* into v_share from public.object_shares sh
   where sh.id = p_share_id and sh.revoked_at is null;
  if v_share.id is null then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  -- R-rule: a share is security state; revoke it under the circle lock and
  -- re-read.
  perform pg_advisory_xact_lock(hashtext('taint:' || v_share.circle_id::text));
  select sh.* into v_share from public.object_shares sh
   where sh.id = p_share_id and sh.revoked_at is null
   for update;
  if v_share.id is null then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  -- The granter, or a live coordinator of the circle. No freeze check:
  -- revocation reduces reach.
  if v_share.granted_by <> v_actor
     and not exists (select 1 from public.circle_members m
                     where m.circle_id = v_share.circle_id
                       and m.account_id = v_actor
                       and m.removed_at is null
                       and m.tier = 'coordinator') then
    raise exception 'revoke_refused' using errcode = 'P0001';
  end if;

  update public.object_shares set revoked_at = v_now where id = p_share_id;

  perform hc.log(v_share.circle_id, 'object_share_revoked', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => v_share.subject_id,
                 p_target_member_id => v_share.member_id,
                 p_object_type => v_share.object_type, p_object_id => v_share.object_id,
                 p_detail => jsonb_strip_nulls(jsonb_build_object(
                   'share_id', p_share_id,
                   'granted_by', v_share.granted_by,
                   'created_by_assignment_of', v_share.created_by_assignment_of)));

  return jsonb_build_object('share_id', p_share_id, 'member_id', v_share.member_id,
                            'object_type', v_share.object_type,
                            'object_id', v_share.object_id, 'revoked_at', v_now);
end $$;

alter function hc.revoke_share(uuid) owner to hc_internal;
revoke execute on function hc.revoke_share(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.revoke_share(uuid) to authenticated;
