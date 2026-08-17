-- ============================================================================
-- 1D · M3 — the access log's read side (TSD §2.8, §10.5; AC-PPL-7),
-- staged here from 1A's M6 header: the permission-filtered family read
-- policy, denial collapse, and the signing interface.
--
-- READ (§2.8 "filtered by the reader's own access", concretized —
-- ADR-0009): a circle-level entry (subject_id null) is visible to every
-- live member of the circle; an entry about a subject renders only for a
-- reader whose level on the ENTRY'S domain is ≥ log, through the same
-- hc.visible_at that governs every other read — so freeze, the care
-- ceiling, taint containment and the carve-out cap all arrive for free.
-- A subject entry with NO domain fails closed to all-domains (the 1C
-- arrivals precedent). Rendering (which fields to show at which level)
-- is an application concern; ROW visibility is decided here.
--
-- DENIAL COLLAPSE (AC-PPL-7): hc.log_denied(circle, domain, subject) is
-- the one denial writer. The actor is hc.uid() — the function has no
-- account parameter to substitute (A.5). Live membership in the circle is
-- required (a denied member is still a member; a stranger cannot write
-- into a family's log), refused in ONE shape. A repeat within the 1-hour
-- window collapses onto the head denial row for the same (actor, domain,
-- subject): collapsed_count += 1, collapsed_until := now() — through a
-- STRICT trigger carve-out. §2.8's "raises unconditionally" becomes
-- "raises unless the change is exactly the denial-collapse increment":
-- denial rows only, ONLY the two presentation columns (excluded from the
-- INV-11 hash by 1A design), +1 exactly, window monotone; DELETE stays
-- unconditional. Recorded as a §2.8 delta in ADR-0009/annex A7. Belt and
-- braces: hc_internal's UPDATE privilege is COLUMN-scoped to exactly
-- those two columns, so even the writer role cannot reach an evidentiary
-- column — the privilege and the trigger fail in different places.
--
-- SIGNING (§2.8): hc.log_chain_heads() lists each circle's (head_seq,
-- head_hash) for the daily signer. The signer is a worker with KMS access
-- (staged, SIG-01, with the ledger-side signature store in M5); until it
-- exists the function is owner-only — absent machinery is non-callable.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The read.
-- ----------------------------------------------------------------------------
grant select on public.access_log to authenticated;

create policy access_log_select on public.access_log
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and (subject_id is null
       or hc.visible_at((select hc.ctx()), subject_id,
            case when domain is null then hc.all_domains()
                 else array[domain]::hc.domain[] end,
            true, null, null, null) >= 'log')
);

-- ----------------------------------------------------------------------------
-- The strict collapse carve-out.
-- ----------------------------------------------------------------------------
create or replace function hc.access_log_immutable() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- The ONE admissible mutation: the denial-collapse increment (AC-PPL-7).
  -- Everything evidentiary — every hashed column — must be byte-identical;
  -- the count moves by exactly one; the window never moves backwards.
  if tg_op = 'UPDATE'
     and old.event_type = 'access_denied'
     and (to_jsonb(new) - 'collapsed_count' - 'collapsed_until')
       = (to_jsonb(old) - 'collapsed_count' - 'collapsed_until')
     and new.collapsed_count = old.collapsed_count + 1
     and new.collapsed_until is not null
     and new.collapsed_until >= coalesce(old.collapsed_until, old.occurred_at)
  then
    return new;
  end if;
  raise exception 'access_log is append-only; a correction is a new row with corrects_id (PRD §4.6.5)'
    using errcode = '42501';
end $$;

grant update (collapsed_count, collapsed_until) on public.access_log to hc_internal;
create policy access_log_internal_collapse on public.access_log
  for update to hc_internal using (true) with check (true);

-- ----------------------------------------------------------------------------
-- The one denial writer.
-- ----------------------------------------------------------------------------
create function hc.log_denied(p_circle_id uuid, p_domain hc.domain,
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

alter function hc.log_denied(uuid, hc.domain, uuid) owner to hc_internal;
revoke execute on function hc.log_denied(uuid, hc.domain, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;
grant execute on function hc.log_denied(uuid, hc.domain, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- The signing interface.
-- ----------------------------------------------------------------------------
create function hc.log_chain_heads()
returns table (circle_id uuid, head_seq bigint, head_hash bytea)
language sql stable security definer
set search_path = ''
as $$
  select distinct on (l.circle_id) l.circle_id, l.seq, l.entry_hash
  from public.access_log l
  order by l.circle_id, l.seq desc
$$;

alter function hc.log_chain_heads() owner to hc_internal;
revoke execute on function hc.log_chain_heads()
  from public, anon, authenticated, hc_pipeline, hc_admin;
