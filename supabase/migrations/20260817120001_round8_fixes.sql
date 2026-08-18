-- ============================================================================
-- 1D · M7 — third-party review round 8, accepted findings applied
-- (ADR-0010; one migration per review round, atomic — the M9/M10
-- precedent). F1 is test+wording (031:24–25, no DDL); F2 is docs-only.
--
--   F3 · hc.log_denied validated its caller (live membership) but never
--        its p_subject_id: a stale or cross-circle subject rode the
--        DEFERRABLE INITIALLY DEFERRED declaration FK (round-5 F1) to
--        COMMIT, aborting the otherwise-valid request with a raw 23503
--        far from the call — not the DEF-10 uniform shape every other
--        request-path refusal keeps. No cross-tenant persistence was
--        ever possible (the FK holds); the defect was the SHAPE and the
--        WHERE. Now the function refuses a subject that is not the
--        circle's own at CALL time, in the SAME denied_log_refused
--        shape as the stranger — nonexistent and cross-circle
--        indistinguishable, writing nothing. The deferred FK stays as
--        the commit-time belt.
--
--   F4 · The read policy's subject_id-null branch was unconditionally
--        member-visible, so a denial logged with a domain but NO
--        subject (a normal log_denied shape) showed its domain tag to
--        members the per-domain filter would refuse — inconsistent with
--        D1's deliberate fail-closed-over-self-visibility (030:5). The
--        rule is completed with the mirror of the 1C precedent: a
--        subject entry with no DOMAIN fails closed to ALL DOMAINS
--        (unchanged); a domained entry with no SUBJECT fails closed to
--        ALL SUBJECTS — visible only to a reader whose level on that
--        domain is ≥ log for EVERY live subject of the circle, through
--        the same hc.visible_at, so freeze, the FRZ-13 cap and the care
--        ceiling arrive for free (an empty subject set stays dark).
--        Domain-less circle-level entries (membership/freeze trail) are
--        untouched. No internal writer produces the domained
--        null-subject shape — hc.log_denied is its only producer.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- F3 · The one denial writer, now validating the subject it names.
-- ----------------------------------------------------------------------------
create or replace function hc.log_denied(p_circle_id uuid, p_domain hc.domain,
                                         p_subject_id uuid default null)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  c_window constant interval := interval '1 hour';
  v_actor uuid := hc.uid();
  v_name  text;
  v_head  record;
begin
  -- Live membership, or ONE refusal shape for stranger and nonexistent
  -- circle alike (DEF-10). The denied member is still a member — denial
  -- is about a domain, not about the circle.
  select m.display_name_at_join into v_name
  from public.circle_members m
  where m.circle_id = p_circle_id and m.account_id = v_actor
    and m.removed_at is null
  limit 1;
  if v_name is null then
    raise exception 'denied_log_refused' using errcode = 'P0001';
  end if;

  -- The subject must be the circle's own (round-8 F3): a stale or
  -- cross-circle subject refuses HERE, at call time, in the same shape
  -- as the stranger — not as a raw deferred-FK error at commit, far
  -- from this call. The predicate mirrors the declaration FK exactly
  -- (row existence in the circle); that DEFERRABLE INITIALLY DEFERRED
  -- FK remains the commit-time belt.
  if p_subject_id is not null and not exists (
       select 1 from public.subjects s
       where s.circle_id = p_circle_id and s.id = p_subject_id) then
    raise exception 'denied_log_refused' using errcode = 'P0001';
  end if;

  -- Serialise with every other writer to this circle's chain (§2.8's own
  -- advisory key; hc.log() re-takes it reentrantly).
  perform pg_advisory_xact_lock(hashtext(p_circle_id::text));

  select l.id, l.seq, l.collapsed_count into v_head
  from public.access_log l
  where l.circle_id = p_circle_id
    and l.event_type = 'access_denied'
    and l.actor_account_id = v_actor
    and l.domain is not distinct from p_domain
    and l.subject_id is not distinct from p_subject_id
  order by l.seq desc
  limit 1;

  if v_head.id is not null and exists (
       select 1 from public.access_log l
       where l.id = v_head.id
         and coalesce(l.collapsed_until, l.occurred_at) >= now() - c_window) then
    update public.access_log
    set collapsed_count = v_head.collapsed_count + 1,
        collapsed_until = now()
    where id = v_head.id;
    return v_head.seq;
  end if;

  return hc.log(p_circle_id, 'access_denied', v_name, v_actor,
                p_subject_id, null, p_domain);
end $$;

-- CREATE OR REPLACE preserves the M3 owner (hc_internal) and ACL
-- (EXECUTE to authenticated alone) — 002 pins both on every migration.

-- ----------------------------------------------------------------------------
-- F4 · The read, with the completed row rule.
-- ----------------------------------------------------------------------------
drop policy access_log_select on public.access_log;

create policy access_log_select on public.access_log
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and (
       -- circle-level, domain-less: every live member (the freeze's own
       -- trail must stay readable — PRD §7.5)
       (subject_id is null and domain is null)
       -- domained but subject-less: ≥ log on that domain for EVERY live
       -- subject (the all-subjects mirror of the all-domains rule); the
       -- subjects subquery runs under the reader's own RLS, which shows
       -- a member every live subject of their circle — and an empty set
       -- stays dark (fail-closed, never vacuously open)
    or (subject_id is null and domain is not null
        and exists (select 1 from public.subjects s
                    where s.circle_id = access_log.circle_id)
        and not exists (
              select 1 from public.subjects s
              where s.circle_id = access_log.circle_id
                and hc.visible_at((select hc.ctx()), s.id,
                      array[access_log.domain]::hc.domain[],
                      true, null, null, null) < 'log'::hc.access_level))
       -- about a subject: the reader's level on the entry's domain —
       -- a no-domain entry fails closed to all-domains (1C precedent)
    or (subject_id is not null
        and hc.visible_at((select hc.ctx()), subject_id,
              case when domain is null then hc.all_domains()
                   else array[domain]::hc.domain[] end,
              true, null, null, null) >= 'log'::hc.access_level)
  )
);
