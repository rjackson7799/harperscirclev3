-- ============================================================================
-- 6A · M5 — the receipt. §4.2.4's "what went where", as a DEFINER READ.
-- docs/review/slice-6-plan.md M5; TSD §4.9, §2.4, §3.5; PRD §4.2.4,
-- AC-INBOX-9. Pinned by pgTAP 063, which went red before this existed
-- (14 of 14). NO SHIPPED MIGRATION IS EDITED — this migration only adds.
--
-- ---------------------------------------------------------------------------
-- WHY A DEFINER AND NOT A GRANT. `public.proposal_commits` holds NO member
-- privilege at all: its grants are `select, insert … to hc_internal` and its
-- two policies are `…_internal` / `…_internal_claim` (20260815230001:150).
-- `authenticated` holds NOTHING on the table §4.2.4's receipt is a read of,
-- so the receipt cannot be built at the app layer today at any level of
-- cleverness — and it should not get a blanket grant either. The table IS
-- the one-proposal-one-object claim (AC-INBOX-3, PRD §6.2), and widening it
-- to every member to serve one screen would trade a structural guarantee for
-- a convenience. So §4.2.4 gets ONE definer with ONE gate.
--
-- ---------------------------------------------------------------------------
-- COUNTED, NEVER NAMED — the §3.5 log-level discipline, carried here.
-- A destination the caller cannot see is still REPORTED, so the receipt can
-- say "and one more thing you cannot see", but it is never NAMED and never
-- LINKED: `object_type` survives; `object_id` and `label` do not. Never a
-- silent omission, and never a handle to something you cannot open.
-- `visible` is returned EXPLICITLY rather than left to be inferred from a
-- null, so an app cannot mistake "you may not see this" for "there is
-- nothing here" — the two sentences a receipt must never confuse.
--
-- THE HONEST BOUND ON THAT FILTER, stated so a reviewer can check it rather
-- than assume it does more than it does. The ARRIVAL gate is view-over-all-
-- five, which is STRICTLY STRONGER than the `summary` threshold documents /
-- tasks / timeline_events / episodes read at, and exactly the `view`
-- threshold profile_facts reads at (§3.4's level→table map). So a caller who
-- clears the gate at all clears every ORDINARY destination, and the filter
-- bites only through the rungs that do not depend on the domain ladder:
--
--   · UNRESOLVED LINEAGE — hc.visible_at rung 3: an object whose taint is
--     not resolved needs manage on all five, or nothing, so a view×5 reader
--     is hidden from it while a coordinator is not;
--   · a DELETED destination — every record policy carries `deleted_at is
--     null`, and this function reproduces each policy exactly;
--   · the care_circle ceiling (rung 4) and the FRZ-13 read-only cap — both
--     of which also refuse the ARRIVAL gate, so they never reach this code.
--
-- That is a NARROW set and saying so is the point: the filter is real, 063
-- drives it BOTH WAYS, and it is not doing more work than it looks like.
--
-- ---------------------------------------------------------------------------
-- NEVER WIDER THAN THE RLS IT STANDS IN FOR. Each destination is looked up
-- through its OWN policy predicate, reproduced here character for character
-- from 20260815230002:290-333 — including `deleted_at is null`, including
-- `taint`/`taint_resolved` rather than the arrival's, including
-- `owner_member_id` for tasks (the care_circle own-task carve-out), and
-- including profile_facts' `view` where the other four read at `summary`.
-- A definer that reproduced a SIMPLER predicate would be a definer that
-- leaks, and this one is the receipt of the record's most sensitive act.
--
-- ---------------------------------------------------------------------------
-- ONE GATE ACROSS THE WHOLE SURFACE is the property this migration exists to
-- establish, and M2 began it. hc.approve_proposal, hc.reject_proposal,
-- hc.extractions_for, public.arrival_renditions and now hc.receipt_for ALL
-- ask the same question of the same arrival — view over all five domains,
-- the predicate hc.log_artifact_read (20260821120001:81) and the artifact
-- route already enforced. The screen, the fact read, the manifest, the
-- decision and the receipt cannot disagree about who may see this arrival.
--
-- WHAT THE RECEIPT REPORTS is DECISIONS: approved, edited_approved and
-- rejected — exactly the statuses that carry a `decided_by`, which is the
-- 1B CHECK's own definition of a human decision (20260815230001:79).
-- `superseded` and `void` are pipeline outcomes, not decisions, and a
-- `pending` proposal is still the review screen's business rather than the
-- receipt's.
--
-- AC-INBOX-9 IS ONLY PARTLY SATISFIABLE AND THE PLAN SAYS SO. Tasks and
-- Timeline resolve today — both surfaces are live RLS reads — while
-- Documents and profile facts have no surface at all; they are §11.1 row
-- 7's. So the receipt NAMES every destination and 6B links the two that
-- exist, saying plainly that the others open in the next slice. Never a dead
-- link, never a silent omission, and RCP-02 stays `pending` tagged 7 rather
-- than going green on a criterion half met (the SIG-01 precedent).
-- ============================================================================

create function hc.receipt_for(p_arrival uuid)
returns table (
  proposal_id   uuid,
  status        text,
  reject_reason text,
  object_type   hc.object_type,
  object_id     uuid,
  label         text,
  visible       boolean
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_ctx     jsonb := hc.ctx();
  v_subject uuid;
begin
  -- The arrival gate, identical to M2's: live, and the caller clears VIEW
  -- over all five domains on it. Nonexistent, foreign, deleted and
  -- below-cliff land in ONE shape (DEF-10) — no existence oracle.
  select a.subject_id into v_subject
    from public.arrivals a
   where a.id = p_arrival
     and a.deleted_at is null
     and hc.visible_at(v_ctx, a.subject_id, hc.all_domains(), true,
                       'arrival', a.id, null) >= 'view';
  if v_subject is null then
    raise exception 'receipt_refused' using errcode = 'P0001';
  end if;

  return query
  select d.pid, d.pstatus, d.preason, d.otype,
         -- counted, never named: no name and no handle for what you may not
         -- open, and both suppressed together so one cannot leak the other
         case when d.olabel is not null then d.oid  end,
         d.olabel,
         (d.olabel is not null)
    from (
      select p.id                as pid,
             p.status            as pstatus,
             p.reject_reason     as preason,
             c.object_type       as otype,
             c.object_id         as oid,
             x.label             as olabel
        from public.proposals p
        left join public.proposal_commits c
          on c.proposal_id = p.id
        left join lateral (
          -- Each destination through its OWN policy predicate, reproduced
          -- from 20260815230002:290-333. At most one branch can match: the
          -- object_type discriminates and proposal_commits is unique on
          -- (object_type, object_id).
          select dc.title as label
            from public.documents dc
           where c.object_type = 'document'::hc.object_type
             and dc.id = c.object_id
             and dc.deleted_at is null
             and hc.visible_at(v_ctx, dc.subject_id, dc.taint, dc.taint_resolved,
                               'document', dc.id, null) >= 'summary'
          union all
          select t.title
            from public.tasks t
           where c.object_type = 'task'::hc.object_type
             and t.id = c.object_id
             and t.deleted_at is null
             and hc.visible_at(v_ctx, t.subject_id, t.taint, t.taint_resolved,
                               'task', t.id, t.owner_member_id) >= 'summary'
          union all
          select te.summary
            from public.timeline_events te
           where c.object_type = 'timeline_event'::hc.object_type
             and te.id = c.object_id
             and te.deleted_at is null
             and hc.visible_at(v_ctx, te.subject_id, te.taint, te.taint_resolved,
                               'timeline_event', te.id, null) >= 'summary'
          union all
          select e.title
            from public.episodes e
           where c.object_type = 'episode'::hc.object_type
             and e.id = c.object_id
             and e.deleted_at is null
             and hc.visible_at(v_ctx, e.subject_id, e.taint, e.taint_resolved,
                               'episode', e.id, null) >= 'summary'
          union all
          -- profile_facts read at VIEW, not summary (§3.4's level→table map)
          select pf.field
            from public.profile_facts pf
           where c.object_type = 'profile_fact'::hc.object_type
             and pf.id = c.object_id
             and pf.deleted_at is null
             and hc.visible_at(v_ctx, pf.subject_id, pf.taint, pf.taint_resolved,
                               'profile_fact', pf.id, null) >= 'view'
        ) x on true
       where p.arrival_id = p_arrival
         -- the statuses that carry a decided_by: a human decision, by the
         -- 1B CHECK's own definition (20260815230001:79)
         and p.status in ('approved', 'edited_approved', 'rejected')
    ) d
   -- written destinations first, in a deterministic order, then the
   -- decisions that wrote nothing: a person re-reading their receipt finds
   -- it unchanged.
   order by d.otype nulls last, d.pid;
end $$;

alter function hc.receipt_for(uuid) owner to hc_internal;
revoke execute on function hc.receipt_for(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.receipt_for(uuid) to authenticated;
