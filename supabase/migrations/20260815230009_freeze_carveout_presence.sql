-- ============================================================================
-- 1B · M9 — FRZ-13 (TSD §3.8; ADR-0005 D2/D5) and hc.presence() (§3.5).
--
-- The unresolved read-only carve-out: coordinators other than the
-- objected-to member get `frozen = false` plus a `cap = 'view'` in their
-- grant vector; hc.visible_at() applies the cap as its FINAL step —
-- least(result, cap) — so it binds grants AND shares and can only lower.
-- A null objected_to_member_id means NO carve-out (fail-closed; also the
-- PRD's only-coordinator-is-objected-to case, arithmetically).
--
-- hc.grant_vectors() gains the `cap` output column (return-type change ⇒
-- DROP + recreate; ctx bodies are re-issued with the cap key and the M8
-- verbatim shares). hc.adjudicate_freeze() gains p_objected_to_member_id
-- (old signature dropped — exact inventory moves with it).
-- ============================================================================

alter table public.freezes
  add column objected_to_member_id uuid,
  add constraint freezes_objection_names_unresolved
    check (objected_to_member_id is null or state = 'unresolved'),
  add foreign key (circle_id, objected_to_member_id)
    references public.circle_members (circle_id, id);
create index freezes_by_objected_to on public.freezes (objected_to_member_id);

-- ----------------------------------------------------------------------------
-- Adjudication, re-signed. Body identical to M8/1A except the unresolved
-- outcome records who was objected to.
-- ----------------------------------------------------------------------------
drop function hc.adjudicate_freeze(uuid, text, text, text, uuid, text, timestamptz);

create function hc.adjudicate_freeze(
  p_freeze_id           uuid,
  p_outcome             text,
  p_adjudicated_by      text,
  p_outcome_note        text default null,
  p_subject_id          uuid default null,
  p_narrowing_rationale text default null,
  p_contact_attempted_at timestamptz default null,
  p_objected_to_member_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_circle uuid;
begin
  if p_outcome not in ('dismissed', 'upheld', 'unresolved') then
    raise exception 'freeze_not_adjudicable' using errcode = 'P0001';
  end if;

  update public.freezes f
     set state = p_outcome,
         subject_id = p_subject_id,
         narrowing_rationale = p_narrowing_rationale,
         adjudicated_at = now(),
         adjudicated_by = p_adjudicated_by,
         outcome_note = p_outcome_note,
         contact_attempted_at = coalesce(p_contact_attempted_at, f.contact_attempted_at),
         objected_to_member_id = case when p_outcome = 'unresolved'
                                      then p_objected_to_member_id end
   where f.id = p_freeze_id and f.state = 'open'
   returning f.circle_id into v_circle;

  if v_circle is null then
    raise exception 'freeze_not_adjudicable' using errcode = 'P0001';
  end if;

  perform hc.log(v_circle, 'freeze_adjudicated', 'Freeze adjudication',
                 p_subject_id => p_subject_id,
                 p_detail => jsonb_build_object('outcome', p_outcome));

  return jsonb_build_object('freeze_id', p_freeze_id, 'outcome', p_outcome);
end $$;

alter function hc.adjudicate_freeze(uuid, text, text, text, uuid, text, timestamptz, uuid)
  owner to hc_internal;
revoke execute on function hc.adjudicate_freeze(uuid, text, text, text, uuid, text, timestamptz, uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- grant_vectors: the cap. An open freeze always closes; an unresolved
-- finding closes UNLESS the caller is a coordinator other than the named
-- objected-to member, who is capped at view instead.
-- ----------------------------------------------------------------------------
drop function hc.grant_vectors(uuid);

create function hc.grant_vectors(p_account uuid)
returns table (
  subject_id uuid, circle_id uuid, member_id uuid, tier hc.tier,
  frozen boolean, cap hc.access_level,
  manage jsonb, view jsonb, summary jsonb, log jsonb
)
language sql stable security definer set search_path = ''
as $$
  select
    s.id, s.circle_id, m.id, m.tier,
    (f.any_open or f.unres_closed) as frozen,
    case when not (f.any_open or f.unres_closed) and f.unres_carved
         then 'view'::hc.access_level end as cap,
    v.manage, v.view, v.summary, v.log
  from public.circle_members m
  join public.subjects s
    on s.circle_id = m.circle_id and s.deleted_at is null
  left join lateral (
    select
      coalesce(bool_or(f.state = 'open'), false) as any_open,
      coalesce(bool_or(f.state = 'unresolved'
                       and (f.subject_id is null or f.subject_id = s.id)
                       and not (m.tier = 'coordinator'
                                and f.objected_to_member_id is not null
                                and f.objected_to_member_id <> m.id)), false) as unres_closed,
      coalesce(bool_or(f.state = 'unresolved'
                       and (f.subject_id is null or f.subject_id = s.id)
                       and m.tier = 'coordinator'
                       and f.objected_to_member_id is not null
                       and f.objected_to_member_id <> m.id), false) as unres_carved
    from public.freezes f
    where f.circle_id = s.circle_id
  ) f on true
  left join lateral (
    select
      coalesce(jsonb_agg(g.domain) filter (where g.level >= 'manage'),  '[]'::jsonb) as manage,
      coalesce(jsonb_agg(g.domain) filter (where g.level >= 'view'),    '[]'::jsonb) as view,
      coalesce(jsonb_agg(g.domain) filter (where g.level >= 'summary'), '[]'::jsonb) as summary,
      coalesce(jsonb_agg(g.domain) filter (where g.level >= 'log'),     '[]'::jsonb) as log
    from public.access_grants g
    where g.member_id = m.id and g.subject_id = s.id
  ) v on true
  where m.account_id = p_account and m.removed_at is null
$$;

alter function hc.grant_vectors(uuid) owner to hc_internal;
revoke execute on function hc.grant_vectors(uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;

-- ----------------------------------------------------------------------------
-- ctx / ctx_for: the cap key joins the subject entry; shares stay the M8
-- verbatim body.
-- ----------------------------------------------------------------------------
create or replace function hc.ctx()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', hc.uid(),
    'circles', coalesce((select array_agg(distinct m.circle_id)
                         from public.circle_members m
                         where m.account_id = hc.uid() and m.removed_at is null),
                        '{}'::uuid[]),
    'subjects', coalesce((
      select jsonb_object_agg(s.subject_id::text, jsonb_build_object(
        'c',       s.circle_id,
        'member',  s.member_id,
        'tier',    s.tier,
        'frozen',  s.frozen,
        'cap',     s.cap,
        'manage',  s.manage, 'view', s.view, 'summary', s.summary, 'log', s.log))
      from hc.grant_vectors(hc.uid()) s), '{}'::jsonb),
    'shares', coalesce((
      select jsonb_object_agg(o.object_type::text, o.ids)
      from (select sh.object_type, jsonb_agg(sh.object_id) as ids
            from public.object_shares sh
            join public.circle_members m on m.id = sh.member_id
            where m.account_id = hc.uid() and sh.revoked_at is null
              and m.removed_at is null
            group by sh.object_type) o), '{}'::jsonb));
$$;

create or replace function hc.ctx_for(p_account uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', p_account,
    'circles', coalesce((select array_agg(distinct m.circle_id)
                         from public.circle_members m
                         where m.account_id = p_account and m.removed_at is null),
                        '{}'::uuid[]),
    'subjects', coalesce((
      select jsonb_object_agg(s.subject_id::text, jsonb_build_object(
        'c',       s.circle_id,
        'member',  s.member_id,
        'tier',    s.tier,
        'frozen',  s.frozen,
        'cap',     s.cap,
        'manage',  s.manage, 'view', s.view, 'summary', s.summary, 'log', s.log))
      from hc.grant_vectors(p_account) s), '{}'::jsonb),
    'shares', coalesce((
      select jsonb_object_agg(o.object_type::text, o.ids)
      from (select sh.object_type, jsonb_agg(sh.object_id) as ids
            from public.object_shares sh
            join public.circle_members m on m.id = sh.member_id
            where m.account_id = p_account and sh.revoked_at is null
              and m.removed_at is null
            group by sh.object_type) o), '{}'::jsonb));
$$;

-- ----------------------------------------------------------------------------
-- visible_at: identical clauses 1–6, then the cap as the FINAL word.
-- least() with 'manage' when absent, so 1A ctx shapes are untouched; it
-- can only lower, so a share under the carve-out still tops out at view.
-- ----------------------------------------------------------------------------
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
with e as (select p_ctx -> 'subjects' -> p_subject::text as s),
shared as (
  select coalesce(p_object_id is not null
     and (p_ctx -> 'shares' -> p_object_type::text) @> to_jsonb(p_object_id), false) as ok
),
t as (
  select
    case when p_resolved and p_taint is not null and cardinality(p_taint) > 0
         then p_taint else hc.all_domains() end as taint,
    (p_resolved and p_taint is not null and cardinality(p_taint) > 0) as lineage_ok
)
select least(
  case
    -- 1. No context for this subject ⇒ the object does not exist for this caller.
    when (select s from e) is null                                  then 'hidden'::hc.access_level

    -- 2. Freeze suspends ALL interactive access. coalesce(...,true) fails closed.
    when coalesce(((select s from e) ->> 'frozen')::boolean, true)   then 'hidden'::hc.access_level

    -- 3. Unresolved or empty lineage: manage on all five, or nothing.
    when not (select lineage_ok from t) then
         case when hc.all_domains() <@ hc.dom((select s from e) -> 'manage')
              then 'manage'::hc.access_level else 'hidden'::hc.access_level end

    -- 4. care_circle is a ceiling.
    when ((select s from e) ->> 'tier') = 'care_circle'
     and coalesce(p_owner_member::text, '') is distinct from ((select s from e) ->> 'member')
     and not (select ok from shared)                                then 'hidden'::hc.access_level

    -- 5. An object share widens ONE named object to 'view'.
    when (select ok from shared) then
         greatest(hc.ladder((select s from e), (select taint from t)), 'view'::hc.access_level)

    -- 6. The ordinary case: min over the taint, as set containment.
    else hc.ladder((select s from e), (select taint from t))
  end,
  -- FRZ-13: the read-only cap — applied AFTER share-widening, absent ⇒ manage.
  coalesce((((select s from e) ->> 'cap'))::hc.access_level, 'manage'::hc.access_level)
);
$$;

-- ----------------------------------------------------------------------------
-- hc.presence() (§3.5): existence without content. Ids, dates, types —
-- no title column EXISTS in the return type. The circle pre-filter guards
-- the one call site that reads past RLS with an arbitrary p_subject.
-- ----------------------------------------------------------------------------
create function hc.presence(p_subject uuid)
returns table (object_type hc.object_type, id uuid, changed_at timestamptz, dated_on date)
language sql stable security definer set search_path = ''
as $$
  select 'task'::hc.object_type, t.id, t.approved_at, t.due_on
  from public.tasks t
  where t.subject_id = p_subject and t.deleted_at is null
    and (select hc.ctx() -> 'circles') @> to_jsonb(t.circle_id)
    and hc.visible_at((select hc.ctx()), t.subject_id, t.taint, t.taint_resolved,
                      'task', t.id, t.owner_member_id) >= 'log'
  union all
  select 'document', d.id, d.approved_at, d.filed_at::date
  from public.documents d
  where d.subject_id = p_subject and d.deleted_at is null
    and (select hc.ctx() -> 'circles') @> to_jsonb(d.circle_id)
    and hc.visible_at((select hc.ctx()), d.subject_id, d.taint, d.taint_resolved,
                      'document', d.id, null) >= 'log'
  union all
  select 'timeline_event', e.id, e.approved_at,
         coalesce(e.occurred_on, e.local_at::date)
  from public.timeline_events e
  where e.subject_id = p_subject and e.deleted_at is null
    and (select hc.ctx() -> 'circles') @> to_jsonb(e.circle_id)
    and hc.visible_at((select hc.ctx()), e.subject_id, e.taint, e.taint_resolved,
                      'timeline_event', e.id, null) >= 'log'
  union all
  select 'episode', ep.id, ep.approved_at, null::date
  from public.episodes ep
  where ep.subject_id = p_subject and ep.deleted_at is null
    and (select hc.ctx() -> 'circles') @> to_jsonb(ep.circle_id)
    and hc.visible_at((select hc.ctx()), ep.subject_id, ep.taint, ep.taint_resolved,
                      'episode', ep.id, null) >= 'log'
  union all
  select 'profile_fact', pf.id, pf.approved_at, null::date
  from public.profile_facts pf
  where pf.subject_id = p_subject and pf.deleted_at is null and pf.superseded_at is null
    and (select hc.ctx() -> 'circles') @> to_jsonb(pf.circle_id)
    and hc.visible_at((select hc.ctx()), pf.subject_id, pf.taint, pf.taint_resolved,
                      'profile_fact', pf.id, null) >= 'log'
$$;

alter function hc.presence(uuid) owner to hc_internal;
revoke execute on function hc.presence(uuid)
  from public, anon, hc_pipeline, hc_admin;
grant execute on function hc.presence(uuid) to authenticated;
