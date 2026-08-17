-- ============================================================================
-- 1D · M2 — the dsc view-level read policy (TSD §2.5, §7.2; DSC-01).
--
-- document_search_content has no taint columns of its own: the level
-- decision belongs to the DOCUMENT the row describes, so the policy is an
-- EXISTS against documents — evaluated as the caller, under documents'
-- own §3.4 policy — requiring `view` on that document. A summary caller's
-- LEFT JOIN (§7.2) finds nothing and null-extends; coalesce falls through
-- to tsv_summary, and both the match and the snippet come from exactly
-- the text they may already read. A share on the named document widens
-- this row with it (hc.visible_at consults shares for the DOCUMENT id);
-- the care ceiling, freeze flag and taint arithmetic all arrive through
-- the same one function. deleted_at lives on documents, and the EXISTS
-- carries documents' own deleted_at test with it.
--
-- The InitPlan behaviour of the ctx() references inside this policy —
-- including the EXISTS's inner documents scan — is pinned by 029's
-- measured-execution PRF-04 regression (six executions over a 300-row
-- scan, never per row); ADR-0002 c1 proved the hoisting inside a LEFT
-- JOIN under RLS on this pinned image.
-- ============================================================================

grant select on public.document_search_content to authenticated;

create policy dsc_select on public.document_search_content
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and exists (
        select 1 from public.documents d
        where d.id = document_search_content.document_id
          and d.deleted_at is null
          and hc.visible_at((select hc.ctx()), d.subject_id, d.taint, d.taint_resolved,
                            'document', d.id, null) >= 'view'
      )
);
