-- ============================================================================
-- 8A · M2 — step-up level binding: hc.set_grant composes target_ref as
-- member:subject:domain:LEVEL (TSD §5.7; PRD §4.6.3; ADR-0038 D6 item 2;
-- round-27 R3 dissent 1; slice-8 plan Q3(a) — SETTLED 2026-09-02).
-- Pinned by pgTAP 071, which went red before this existed, and by 038's
-- raise cases, RE-PINNED IN THIS COMMIT. NO SHIPPED MIGRATION IS EDITED —
-- this migration replaces ONE function body and restates its ownership and
-- grants (the 2A M8 way).
--
-- ---------------------------------------------------------------------------
-- THE RESERVE, CONSUMED WITH ITS RULING QUOTED (the charter: "a reserve is
-- consumed only with its ruling quoted in the commit"). Owner decisions,
-- Q3 — SETTLED 2026-09-02: "(a) ADR-0038 D6 item 1 (hc.shares_for carrying
-- the assignment task's live status) KILLED, with its reason … item 2 (a
-- level-bound step-up target_ref) TAKEN as 8A M2; item 3
-- (share-includes-bytes) NOT PLANNED, contingent on an owner amendment
-- re-opening Q-A". The plan's row M2: "create or replace function
-- hc.set_grant(...) composing target_ref as member:subject:domain:level,
-- and the mint call site passing the level it is about to confirm. Q3(a)
-- SETTLED 2026-09-02: item 2 TAKEN — M2 is consumed; the ruling is quoted
-- in the commit. STP-01/02's and GRT-01's exact-set pins are re-pinned in
-- the same commit; no in-flight token can exist (nothing is
-- production-activated)."
--
-- ---------------------------------------------------------------------------
-- WHAT R3 FOUND (round 27, dissent 1 — recorded, not filed; ADR-0038 D6
-- named it and stopped, uncosted, for this plan gate): "the step-up token
-- binds member:subject:domain but NOT the level. A token minted to raise
-- Ruth's health to summary will consume against a post of manage for the
-- same triple, because the level travels in the URL (rl) rather than in
-- target_ref. The app cannot fix this alone — hc.set_grant computes
-- target_ref itself … F-3 shows rs is attacker-shapeable and rl is only
-- set-validated: a crafted link that raises the level a coordinator THINKS
-- she confirmed is the shape this binding does not cover."
--
-- THE FIX IS ONE COMPOSITION. The body below is 20260818120008's F2 body
-- byte-for-byte — discovery binds only the lock key; the target re-reads
-- and the actor re-authorizes UNDER the lock; the ceiling and the freeze
-- precede the token; the same-level no-op is silent; a LOWER demands
-- nothing — with the consume target gaining ':' || p_level. The mint site
-- composes the same four parts (people/[member]/page.tsx offers the
-- password FOR member:subject:domain:level, and grant/submit/route.ts
-- confirms the cookie against the same string before it hands the token
-- over), so what the coordinator confirmed and what the database will
-- honour are the same sentence, level included. The binding is REPLACED,
-- not widened: a three-part token no longer raises (071:9), a token for
-- view cannot post manage (071:10), and the refused token is left
-- UNCONSUMED — the exact match never touched the row (071:5).
--
-- hc.mint_step_up and hc.consume_step_up do not change: they store and
-- match target_ref verbatim already (036). A replaced body restates every
-- later ALTER (the kickoff's trap): owner hc_internal, EXECUTE revoked from
-- public/anon/hc_pipeline/hc_admin and granted to authenticated alone —
-- asserted from the catalog by 071:1-3 and 002.
-- ============================================================================

create or replace function hc.set_grant(
  p_member_id uuid, p_subject_id uuid, p_domain hc.domain,
  p_level hc.access_level, p_step_up_token text default null)
returns jsonb language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := hc.uid();
  v_actor_name text;
  v_circle uuid;
  v_target record;
  v_before hc.access_level;
  v_cap    hc.access_level;
begin
  if v_actor is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;
  select a.display_name into v_actor_name from public.accounts a where a.id = v_actor;
  if v_actor_name is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  -- Discovery for the lock key only (a member row never changes circles —
  -- the advance_arrival precedent). Liveness and authority bind below.
  select m.circle_id into v_circle from public.circle_members m
    where m.id = p_member_id;
  if v_circle is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext('taint:' || v_circle::text));

  -- Re-read under the lock: the target member, live, with an ACCOUNT (the
  -- subject's own member row is not a grant surface — PRD §7.5 represents
  -- the subject as holder of the highest access; a coordinator does not
  -- edit that standing).
  select m.* into v_target from public.circle_members m
    where m.id = p_member_id and m.removed_at is null and m.account_id is not null;
  if v_target.id is null then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  -- The actor must be a live coordinator of the TARGET's circle — under
  -- the lock, so a removal committing mid-wait defeats this call.
  if not exists (select 1 from public.circle_members m
                 where m.circle_id = v_target.circle_id
                   and m.account_id = v_actor
                   and m.removed_at is null
                   and m.tier = 'coordinator') then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  -- The subject must be live in the same circle.
  if not exists (select 1 from public.subjects s
                 where s.id = p_subject_id and s.circle_id = v_target.circle_id) then
    raise exception 'grant_refused' using errcode = 'P0001';
  end if;

  v_before := coalesce((select g.level from public.access_grants g
                        where g.member_id = p_member_id
                          and g.subject_id = p_subject_id
                          and g.domain = p_domain),
                       'hidden'::hc.access_level);

  if p_level = v_before then
    -- a quiet no-op: nothing changes, nothing logs, no token demanded
    return jsonb_build_object('member_id', p_member_id, 'subject_id', p_subject_id,
                              'domain', p_domain, 'before', v_before,
                              'after', p_level, 'changed', false);
  end if;

  if p_level > v_before then
    -- The care ceiling: never above the §7.4 default for the domain.
    if v_target.tier = 'care_circle' then
      v_cap := coalesce((select t.level from hc.tier_defaults('care_circle') t
                         where t.domain = p_domain),
                        'hidden'::hc.access_level);
      if p_level > v_cap then
        raise exception 'grant_refused' using errcode = 'P0001';
      end if;
    end if;
    -- PRD §7.5: no new grants under any freeze — raises refuse, named.
    if exists (select 1 from public.freezes f
               where f.circle_id = v_target.circle_id
                 and f.state in ('open', 'unresolved')) then
      raise exception 'freeze_active' using errcode = 'P0001';
    end if;
    -- §5.7: raising a grant demands a fresh, bound step-up token.
    if p_step_up_token is null
       or not hc.consume_step_up(p_step_up_token, 'raise_grant',
                -- 8A M2: the LEVEL is the fourth part. What was minted to
                -- raise to summary cannot be spent on manage (071:4; round-27
                -- R3 dissent 1). The mint site composes the same four parts.
                p_member_id::text || ':' || p_subject_id::text || ':' || p_domain::text
                  || ':' || p_level::text,
                v_actor) then
      raise exception 'grant_refused' using errcode = 'P0001';
    end if;
  end if;

  if p_level = 'hidden' then
    delete from public.access_grants
     where member_id = p_member_id and subject_id = p_subject_id
       and domain = p_domain;
  elsif v_before = 'hidden' then
    insert into public.access_grants
      (circle_id, member_id, subject_id, domain, level, granted_by)
    values (v_target.circle_id, p_member_id, p_subject_id, p_domain, p_level, v_actor);
  else
    update public.access_grants
       set level = p_level, granted_by = v_actor, granted_at = now()
     where member_id = p_member_id and subject_id = p_subject_id
       and domain = p_domain;
  end if;

  perform hc.log(v_target.circle_id, 'grant_changed', v_actor_name,
                 p_actor_account_id => v_actor,
                 p_subject_id => p_subject_id,
                 p_target_member_id => p_member_id,
                 p_domain => p_domain,
                 p_level_before => v_before,
                 p_level_after => p_level);

  -- 2A M7: §5.9's exception — a LOWER notifies the person whose access
  -- ended. Content-free by construction: the circle's name and the actor,
  -- nothing else.
  if p_level < v_before then
    insert into public.outbound_mail
      (class, template, recipient_account_id, recipient_email, payload)
    select 'security', 'access_changed', a.id, a.email,
           jsonb_build_object(
             'circle_name', (select c.name from public.circles c
                             where c.id = v_target.circle_id),
             'changed_by', v_actor_name)
    from public.accounts a
    where a.id = v_target.account_id and a.email is not null;
  end if;

  return jsonb_build_object('member_id', p_member_id, 'subject_id', p_subject_id,
                            'domain', p_domain, 'before', v_before,
                            'after', p_level, 'changed', true);
end $$;

-- ownership and grants restated for the replaced object (the 2A M8 way).
alter function hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)
  owner to hc_internal;
revoke execute on function hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.set_grant(uuid, uuid, hc.domain, hc.access_level, text)
  to authenticated;
