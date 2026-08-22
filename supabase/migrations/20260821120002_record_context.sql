-- ============================================================================
-- 5A · M2 — hc.record_context_for(p_arrival): the §3.10 pipeline read,
-- to the letter, with the inclusion priority SETTLED at the plan gate
-- (docs/review/slice-5-plan.md M2; TSD §3.10/§6.6; PRD §6.4).
--
-- WHAT IT IS: the one narrow definer through which interpretation reads
-- the record. hc_pipeline holds no SELECT on any record table; this
-- function returns ONLY the arrival's own subject's record in the
-- arrival's own circle, shaped for interpretation. Cross-subject and
-- cross-circle reads are NOT EXPRESSIBLE — the single parameter is the
-- arrival, and circle + subject derive from its row. DEF-10: a
-- nonexistent and a deleted arrival land in one refusal shape.
--
-- THE SHAPE (§6.6): { current profile_facts · recent timeline_events ·
-- open tasks · documents in the same categories } — "same categories"
-- settled here as the categories named by the arrival's OWN pending
-- 'document' proposals (the extraction pass's filing intent, the only
-- deterministic in-DB reading; no proposal → empty section, never an
-- error).
--
-- PER-SECTION CAPS — the P5 discipline, stated here and nowhere else:
--   · profile_facts: every current HIGH-RISK row (PRD §6.4's classes —
--     allergies, medications, directives and their kin) is included
--     UNCONDITIONALLY: high-risk facts are never truncated and never
--     lose their place to merely-recent standard rows. Boundedness for
--     the class comes from the record's own physics — one current row
--     per (subject, field) by the profile_facts_current index, values
--     bounded at publication (P5's ≤8 KB) — not from a cap here.
--     STANDARD rows cap at 200, by recency (approved_at desc).
--   · timeline_events: 100, by recency of the event itself.
--   · open tasks: 100, by due date (dateless last).
--   · documents: 50, by filed_at desc.
-- A truncated section SAYS SO in the payload — {truncated, omitted} on
-- every section (§6.8's honest limits: interpretation is never handed a
-- partial record presented as complete).
--
-- BYTE-STABILITY (the §6.6 cache-prefix property): ordering is
-- deterministic everywhere (stated per section below, ids as final
-- tiebreak) and timestamps render deterministically — filed_at as UTC
-- ISO-8601 via to_char (to_jsonb(timestamptz) would render in the
-- session's TimeZone, an environment dependence); date and naive-
-- timestamp columns render as their own text. Timeline recency uses the
-- NAIVE key coalesce(local_at, occurred_on::timestamp) — all three
-- §2.7 temporal shapes covered with no timezone conversion anywhere
-- (a floating event has no instant; converting would import the session
-- zone). `instant` is deliberately not emitted: local_at + iana_zone
-- are the human-frame values interpretation needs, and a timestamptz
-- would re-import the rendering dependence. The subject-record sections
-- are therefore byte-identical across arrivals of the same subject;
-- only `documents` varies, and only with the arrival's own categories.
-- ============================================================================

create function hc.record_context_for(p_arrival uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  -- The caps (the P5 discipline: stated in the migration, tested in 052).
  c_facts_standard_cap constant int := 200;
  c_timeline_cap       constant int := 100;
  c_tasks_cap          constant int := 100;
  c_documents_cap      constant int := 50;

  v_circle  uuid;
  v_subject uuid;

  v_facts     jsonb;
  v_timeline  jsonb;
  v_tasks     jsonb;
  v_documents jsonb;
begin
  select a.circle_id, a.subject_id into v_circle, v_subject
  from public.arrivals a
  join public.subjects s on s.id = a.subject_id and s.deleted_at is null
  where a.id = p_arrival
    and a.deleted_at is null;
  if v_circle is null then
    raise exception 'context_refused' using errcode = 'P0001';
  end if;

  -- profile_facts: high-risk ALWAYS; standard by recency up to the cap;
  -- rows ordered by field asc (deterministic — one current row per field).
  select jsonb_build_object(
           'rows', coalesce(jsonb_agg(
             jsonb_build_object('id', f.id, 'field', f.field,
                                'value', f.value, 'risk_class', f.risk_class)
             order by f.field asc, f.id asc), '[]'::jsonb),
           'standard_cap', c_facts_standard_cap,
           'truncated', (select count(*) from public.profile_facts pf
                         where pf.circle_id = v_circle and pf.subject_id = v_subject
                           and pf.superseded_at is null and pf.deleted_at is null
                           and pf.risk_class = 'standard'::hc.risk_class)
                        > c_facts_standard_cap,
           'omitted', greatest(0,
                        (select count(*) from public.profile_facts pf
                         where pf.circle_id = v_circle and pf.subject_id = v_subject
                           and pf.superseded_at is null and pf.deleted_at is null
                           and pf.risk_class = 'standard'::hc.risk_class)
                        - c_facts_standard_cap))
  into v_facts
  from (
    select pf.id, pf.field, pf.value, pf.risk_class
    from public.profile_facts pf
    where pf.circle_id = v_circle and pf.subject_id = v_subject
      and pf.superseded_at is null and pf.deleted_at is null
      and pf.risk_class = 'high'::hc.risk_class
    union all
    select x.id, x.field, x.value, x.risk_class
    from (
      select pf.id, pf.field, pf.value, pf.risk_class
      from public.profile_facts pf
      where pf.circle_id = v_circle and pf.subject_id = v_subject
        and pf.superseded_at is null and pf.deleted_at is null
        and pf.risk_class = 'standard'::hc.risk_class
      order by pf.approved_at desc, pf.id desc
      limit c_facts_standard_cap
    ) x
  ) f;

  -- timeline_events: recent first on the naive key, capped.
  select jsonb_build_object(
           'rows', coalesce(jsonb_agg(
             jsonb_build_object(
               'id', e.id, 'kind', e.kind, 'summary', e.summary,
               'occurred_on', e.occurred_on::text,
               'local_at', to_char(e.local_at, 'YYYY-MM-DD"T"HH24:MI:SS'),
               'iana_zone', e.iana_zone, 'is_floating', e.is_floating)
             order by e.recency desc, e.id desc), '[]'::jsonb),
           'cap', c_timeline_cap,
           'truncated', (select count(*) from public.timeline_events te
                         where te.circle_id = v_circle and te.subject_id = v_subject
                           and te.deleted_at is null) > c_timeline_cap,
           'omitted', greatest(0,
                        (select count(*) from public.timeline_events te
                         where te.circle_id = v_circle and te.subject_id = v_subject
                           and te.deleted_at is null) - c_timeline_cap))
  into v_timeline
  from (
    select te.id, te.kind, te.summary, te.occurred_on, te.local_at,
           te.iana_zone, te.is_floating,
           coalesce(te.local_at, te.occurred_on::timestamp) as recency
    from public.timeline_events te
    where te.circle_id = v_circle and te.subject_id = v_subject
      and te.deleted_at is null
    order by coalesce(te.local_at, te.occurred_on::timestamp) desc, te.id desc
    limit c_timeline_cap
  ) e;

  -- open tasks: due-date order, dateless last, capped.
  select jsonb_build_object(
           'rows', coalesce(jsonb_agg(
             jsonb_build_object('id', t.id, 'title', t.title, 'detail', t.detail,
                                'due_on', t.due_on::text, 'due_zone', t.due_zone)
             order by t.due_on asc nulls last, t.id asc), '[]'::jsonb),
           'cap', c_tasks_cap,
           'truncated', (select count(*) from public.tasks tk
                         where tk.circle_id = v_circle and tk.subject_id = v_subject
                           and tk.status = 'open' and tk.deleted_at is null)
                        > c_tasks_cap,
           'omitted', greatest(0,
                        (select count(*) from public.tasks tk
                         where tk.circle_id = v_circle and tk.subject_id = v_subject
                           and tk.status = 'open' and tk.deleted_at is null)
                        - c_tasks_cap))
  into v_tasks
  from (
    select tk.id, tk.title, tk.detail, tk.due_on, tk.due_zone
    from public.tasks tk
    where tk.circle_id = v_circle and tk.subject_id = v_subject
      and tk.status = 'open' and tk.deleted_at is null
    order by tk.due_on asc nulls last, tk.id asc
    limit c_tasks_cap
  ) t;

  -- documents in the same categories as the arrival's own pending
  -- 'document' proposals; current rows, filed_at desc, capped.
  select jsonb_build_object(
           'categories', coalesce((
             select jsonb_agg(c.cat order by c.cat)
             from (select distinct (p.payload ->> 'category') as cat
                   from public.proposals p
                   where p.arrival_id = p_arrival
                     and p.kind = 'document'::hc.proposal_kind
                     and p.status = 'pending'
                     and p.payload ? 'category') c), '[]'::jsonb),
           'rows', coalesce(jsonb_agg(
             jsonb_build_object(
               'id', d.id, 'title', d.title, 'category', d.category,
               'summary_text', d.summary_text,
               'filed_at', to_char(d.filed_at at time zone 'UTC',
                                   'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
             order by d.filed_at desc, d.id desc), '[]'::jsonb),
           'cap', c_documents_cap,
           'truncated', (select count(*) from public.documents dc
                         where dc.circle_id = v_circle and dc.subject_id = v_subject
                           and dc.deleted_at is null
                           and dc.category::text in (
                             select distinct p.payload ->> 'category'
                             from public.proposals p
                             where p.arrival_id = p_arrival
                               and p.kind = 'document'::hc.proposal_kind
                               and p.status = 'pending'
                               and p.payload ? 'category'))
                        > c_documents_cap,
           'omitted', greatest(0,
                        (select count(*) from public.documents dc
                         where dc.circle_id = v_circle and dc.subject_id = v_subject
                           and dc.deleted_at is null
                           and dc.category::text in (
                             select distinct p.payload ->> 'category'
                             from public.proposals p
                             where p.arrival_id = p_arrival
                               and p.kind = 'document'::hc.proposal_kind
                               and p.status = 'pending'
                               and p.payload ? 'category'))
                        - c_documents_cap))
  into v_documents
  from (
    select dc.id, dc.title, dc.category, dc.summary_text, dc.filed_at
    from public.documents dc
    where dc.circle_id = v_circle and dc.subject_id = v_subject
      and dc.deleted_at is null
      and dc.category::text in (
        select distinct p.payload ->> 'category'
        from public.proposals p
        where p.arrival_id = p_arrival
          and p.kind = 'document'::hc.proposal_kind
          and p.status = 'pending'
          and p.payload ? 'category')
    order by dc.filed_at desc, dc.id desc
    limit c_documents_cap
  ) d;

  return jsonb_build_object(
    'circle_id', v_circle,
    'subject_id', v_subject,
    'profile_facts', v_facts,
    'timeline_events', v_timeline,
    'open_tasks', v_tasks,
    'documents', v_documents);
end $$;

alter function hc.record_context_for(uuid) owner to hc_internal;
revoke execute on function hc.record_context_for(uuid)
  from public, anon, authenticated, hc_admin;
grant execute on function hc.record_context_for(uuid) to hc_pipeline;
