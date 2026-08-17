-- ============================================================================
-- 1D · U2 — search reads (TSD §7.2–§7.6; DSC-01, RLS-11, PRF-04; A.4/A.5).
--
-- The LEFT JOIN is the level decision and RLS makes it (§7.2): dsc's
-- view-level policy resolves the join for a view caller and null-extends
-- it for a summary caller, whose match and snippet then come from exactly
-- the text they may already read. The §7.2 canonical query is exercised
-- per rung (view / summary / log / hidden / non-member / care ceiling /
-- share / freeze), the A.5 search oracles are pinned (body-only term:
-- zero rows AND a result count identical to a term present nowhere;
-- snippet cut from the matched text), RLS-11's search channel joins the
-- A.3 ordered-pair matrix (generated, three relations), and PRF-04 lands
-- against the REAL search schema: the measured ctx() execution count over
-- a volume scan is per textual reference, never per row, and the
-- summary-caller's row arrives null-extended, not filtered.
--
-- RED (U2): dsc has no authenticated grant and no read policy — every
-- §7.2 query as a member reports 42501, the grant/policy pins report the
-- empty state, and the PRF block errors.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(23);

create function pg_temp.mk_user(p_id uuid) returns uuid language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated',
          'authenticated', p_id || '@fixture.local', 'x', now(), now(), now(),
          '{}', '{}');
  return p_id;
end $$;

create function pg_temp.call_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    get stacked diagnostics m := message_text;
    v := 'ERROR:' || sqlstate || ':' || m;
  end;
  execute 'reset role';
  return v;
end $$;

-- The §7.2 canonical query, verbatim shape: explicit circle bound, LEFT
-- JOIN decided by RLS, match and snippet from the same coalesced branch.
create function pg_temp.q72_count(p_user uuid, p_circle uuid, p_term text) returns text
language plpgsql as $$
begin
  return pg_temp.call_as(p_user, format($q$
    with q as (select websearch_to_tsquery('english', %L) as tsq)
    select count(*)::text
    from public.documents d
    left join public.document_search_content sc on sc.document_id = d.id
    where d.circle_id = %L
      and coalesce(sc.tsv_full, d.tsv_summary) @@ (select tsq from q) $q$,
    p_term, p_circle));
end $$;

create function pg_temp.q72_snip(p_user uuid, p_circle uuid, p_term text) returns text
language plpgsql as $$
begin
  return pg_temp.call_as(p_user, format($q$
    with q as (select websearch_to_tsquery('english', %L) as tsq)
    select ts_headline('english',
             coalesce(sc.search_text_full,
                      d.title || ' ' || coalesce(d.summary_text, '')),
             (select tsq from q))
    from public.documents d
    left join public.document_search_content sc on sc.document_id = d.id
    where d.circle_id = %L
      and coalesce(sc.tsv_full, d.tsv_summary) @@ (select tsq from q)
    order by ts_rank(coalesce(sc.tsv_full, d.tsv_summary), (select tsq from q)) desc
    limit 1 $q$,
    p_term, p_circle));
end $$;

create function pg_temp.q72_scnull(p_user uuid, p_circle uuid, p_term text) returns text
language plpgsql as $$
begin
  return pg_temp.call_as(p_user, format($q$
    with q as (select websearch_to_tsquery('english', %L) as tsq)
    select (sc.document_id is null)::text
    from public.documents d
    left join public.document_search_content sc on sc.document_id = d.id
    where d.circle_id = %L
      and coalesce(sc.tsv_full, d.tsv_summary) @@ (select tsq from q)
    limit 1 $q$,
    p_term, p_circle));
end $$;

-- All three search relations (§7.1) — the RLS-11 channel probe.
create function pg_temp.search_all(p_user uuid, p_circle uuid, p_term text) returns text
language plpgsql as $$
begin
  return pg_temp.call_as(p_user, format($q$
    with q as (select websearch_to_tsquery('english', %L) as tsq)
    select ((select count(*) from public.documents d
             left join public.document_search_content sc on sc.document_id = d.id
             where d.circle_id = %L
               and coalesce(sc.tsv_full, d.tsv_summary) @@ (select tsq from q))
          + (select count(*) from public.tasks t
             where t.circle_id = %L and t.tsv @@ (select tsq from q))
          + (select count(*) from public.timeline_events tl
             where tl.circle_id = %L and tl.tsv @@ (select tsq from q)))::text $q$,
    p_term, p_circle, p_circle, p_circle));
end $$;

do $$
declare
  u1 uuid := pg_temp.mk_user(gen_random_uuid());   -- coordinator, manage×5
  u2 uuid := pg_temp.mk_user(gen_random_uuid());   -- summary×5
  u3 uuid := pg_temp.mk_user(gen_random_uuid());   -- view×5
  u4 uuid := pg_temp.mk_user(gen_random_uuid());   -- log×5
  u5 uuid := pg_temp.mk_user(gen_random_uuid());   -- manage×4, health withheld
  u6 uuid := pg_temp.mk_user(gen_random_uuid());   -- care_circle, manage×5 grants
  u0 uuid := pg_temp.mk_user(gen_random_uuid());   -- member of nothing
  c1 uuid; s1 uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid;
  a1 uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid();
  doc2 uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u1, 'member', 'Sarah'), (u2, 'member', 'Priya'), (u3, 'member', 'Dan'),
    (u4, 'member', 'Lena'), (u5, 'member', 'Noor'), (u6, 'member', 'Marisol'),
    (u0, 'member', 'Stranger');
  insert into public.circles (name, created_by) values ('Search RLS circle', u1)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering', '02138', 'America/New_York', 'sage',
          'srl-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u1, 'coordinator', 'Sarah') returning id into m1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u2, 'family', 'Priya') returning id into m2;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u3, 'family', 'Dan') returning id into m3;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u4, 'family', 'Lena') returning id into m4;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u5, 'family', 'Noor') returning id into m5;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u6, 'care_circle', 'Marisol') returning id into m6;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m1, s1, d::hc.domain, 'manage', u1),
           (c1, m2, s1, d::hc.domain, 'summary', u1),
           (c1, m3, s1, d::hc.domain, 'view', u1),
           (c1, m4, s1, d::hc.domain, 'log', u1),
           (c1, m6, s1, d::hc.domain, 'manage', u1);
    if d <> 'health' then
      insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
      values (c1, m5, s1, d::hc.domain, 'manage', u1);
    end if;
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel) values (a1, c1, s1, 'upload');

  insert into public.extractions (id, arrival_id, circle_id, subject_id, field, value,
                                  confidence, risk_class, citation, model_id, prompt_version)
  values (e1, a1, c1, s1, 'medication', '"metoprolol 25mg daily"', 0.95, 'high',
          '{"page": 1, "bbox": [0.1, 0.1, 0.2, 0.05]}', 'fixture-model', 'v0');

  perform set_config('t.prop_doc', gen_random_uuid()::text, true);
  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload,
                                source_extraction_ids, taint) values
    (current_setting('t.prop_doc')::uuid, a1, c1, s1, 'document',
     jsonb_build_object('title', 'Discharge summary', 'category', 'medical',
                        'summary_text', 'Home with cardiology follow-up.'),
     array[e1], '{health}');

  -- a second document with view-only text and NO share — the share case's
  -- negative control (its body token appears nowhere else)
  insert into public.documents (id, circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (doc2, c1, s1, 'Care plan', 'medical', a1, now(), u1, now(), 'Sarah', '{health}');
  update public.document_search_content set ocr_text = 'zqunshared body token'
    where document_id = doc2;

  perform set_config('t.u1', u1::text, true);
  perform set_config('t.u2', u2::text, true);
  perform set_config('t.u3', u3::text, true);
  perform set_config('t.u4', u4::text, true);
  perform set_config('t.u5', u5::text, true);
  perform set_config('t.u6', u6::text, true);
  perform set_config('t.u0', u0::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.m2', m2::text, true);
  perform set_config('t.doc2', doc2::text, true);
end $$;

-- the health document, approved through the one writer
select is(pg_temp.call_as(current_setting('t.u1')::uuid, format(
  $$ select (hc.approve_proposal(%L, 1, 'k-srl-doc')) ->> 'status' $$,
  current_setting('t.prop_doc'))), 'approved',
  'the fixture document approves (control)');

-- ----------------------------------------------------------------------------
-- 2–3 · The grant and the policy, exact (DSC-01).
-- ----------------------------------------------------------------------------
select is((
  select coalesce(array_agg(g.privilege_type::text order by g.privilege_type::text), '{}'::text[])
  from information_schema.role_table_grants g
  where g.table_schema = 'public' and g.table_name = 'document_search_content'
    and g.grantee = 'authenticated'),
  array['SELECT'],
  'dsc: authenticated holds SELECT and nothing else (DSC-01)');

select is((
  select count(*)::int from pg_policy p
  where p.polrelid = 'public.document_search_content'::regclass
    and 'authenticated'::regrole::oid = any (p.polroles)), 1,
  'dsc: exactly one authenticated policy — the view-level read (§2.5)');

-- ----------------------------------------------------------------------------
-- 4–6 · The view branch: the join resolves; match and snippet come from
-- tsv_full / search_text_full — including a title match (A.5: the snippet
-- is cut from the text that was matched).
-- ----------------------------------------------------------------------------
select is(pg_temp.q72_count(current_setting('t.u3')::uuid,
                            current_setting('t.c1')::uuid, 'metoprolol'), '1',
  'view: a term appearing ONLY in extracted_text is a hit');

select ok(pg_temp.q72_snip(current_setting('t.u3')::uuid,
                           current_setting('t.c1')::uuid, 'metoprolol')
          like '%<b>metoprolol</b>%',
  'view: the snippet contains the matched body term — cut from search_text_full');

select ok(pg_temp.q72_snip(current_setting('t.u3')::uuid,
                           current_setting('t.c1')::uuid, 'discharge')
          like '%<b>Discharge</b>%',
  'view: a TITLE match snippets the title, not a fragment of extracted_text (A.5)');

-- ----------------------------------------------------------------------------
-- 7–11 · The summary branch: null-extended, never filtered; body-only
-- terms are invisible AND indistinguishable from absent terms (A.5).
-- ----------------------------------------------------------------------------
select is(pg_temp.q72_count(current_setting('t.u2')::uuid,
                            current_setting('t.c1')::uuid, 'metoprolol'), '0',
  'summary: a term appearing only in view-level text returns ZERO rows');

select is(pg_temp.q72_count(current_setting('t.u2')::uuid,
                            current_setting('t.c1')::uuid, 'metoprolol'),
          pg_temp.q72_count(current_setting('t.u2')::uuid,
                            current_setting('t.c1')::uuid, 'xylophonezzz'),
  'summary: the body-only-term count is IDENTICAL to a term present nowhere (A.5 — the hit itself would disclose)');

select is(pg_temp.q72_count(current_setting('t.u2')::uuid,
                            current_setting('t.c1')::uuid, 'discharge'), '2',
  'summary: title terms match through tsv_summary (both documents)');

select is(pg_temp.q72_scnull(current_setting('t.u2')::uuid,
                             current_setting('t.c1')::uuid, 'cardiology'), 'true',
  'summary: the row arrives NULL-EXTENDED — RLS hid the dsc row without filtering the join (PRF-04''s behavioural half)');

select ok(pg_temp.q72_snip(current_setting('t.u2')::uuid,
                           current_setting('t.c1')::uuid, 'cardiology')
          like '%<b>cardiology</b>%',
  'summary: the snippet is built from title + summary_text — exactly what summary may already read (§7.2)');

-- ----------------------------------------------------------------------------
-- 12–15 · log, non-member, withheld source domain, care ceiling.
-- ----------------------------------------------------------------------------
select is(pg_temp.q72_count(current_setting('t.u4')::uuid,
                            current_setting('t.c1')::uuid, 'discharge'), '0',
  'log: presence never appears in search — hc.presence() is the separate, bounded oracle (§7.6)');

select is(pg_temp.q72_count(current_setting('t.u0')::uuid,
                            current_setting('t.c1')::uuid, 'discharge'), '0',
  'non-member: zero rows, indistinguishable from an empty circle');

select is(pg_temp.q72_count(current_setting('t.u5')::uuid,
                            current_setting('t.c1')::uuid, 'discharge'), '0',
  'a health-tainted document is absent from search for the member whose health is hidden — taint arithmetic unchanged in this channel (AC-PERM-6)');

select is(pg_temp.q72_count(current_setting('t.u6')::uuid,
                            current_setting('t.c1')::uuid, 'metoprolol'), '0',
  'care_circle: manage-level grants still cap at summary (VIS-05) — the view branch stays closed in search');

-- ----------------------------------------------------------------------------
-- 16–17 · A share widens ONE named object to view — through search too
-- (§3.6); the unshared document stays summary-branch for the same member.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.object_shares (circle_id, subject_id, object_type, object_id,
                                    member_id, granted_by)
  select c.circle_id, c.subject_id, 'document', c.document_id,
         current_setting('t.m2')::uuid, current_setting('t.u1')::uuid
  from public.document_search_content c
  join public.documents dd on dd.id = c.document_id
  where dd.source_proposal_id = current_setting('t.prop_doc')::uuid;
end $$;

select is(pg_temp.q72_count(current_setting('t.u2')::uuid,
                            current_setting('t.c1')::uuid, 'metoprolol'), '1',
  'a share on the named document unlocks its view-level text in search (VIS-06 through this channel)');

select is(pg_temp.q72_count(current_setting('t.u2')::uuid,
                            current_setting('t.c1')::uuid, 'zqunshared'), '0',
  'the UNSHARED document''s view-level text stays invisible — a share never propagates (§3.6)');

-- ----------------------------------------------------------------------------
-- 18 · Freeze closes the channel (AC-PERM-11 in search).
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;

select is(pg_temp.q72_count(current_setting('t.u3')::uuid,
                            current_setting('t.c1')::uuid, 'discharge'), '0',
  'an open freeze closes search for the view member — no channel survives the flag');

-- ----------------------------------------------------------------------------
-- 19–21 · RLS-11: the A.3 ordered-pair matrix through the search channel,
-- generated from the one rule, across all three search relations.
-- ----------------------------------------------------------------------------
create function pg_temp.make_obj(p_domain hc.domain, p_token text, p_c uuid, p_s uuid,
                                 p_u uuid, p_a uuid)
returns table (otype hc.object_type, oid uuid) language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  if p_domain = 'schedule' then
    insert into public.tasks (id, circle_id, subject_id, title,
      approved_by, approved_at, approver_display_name, taint)
    values (v, p_c, p_s, 'pair task ' || p_token, p_u, now(), 'Pat', array[p_domain]);
    return query select 'task'::hc.object_type, v;
  elsif p_domain in ('memories', 'health') then
    insert into public.timeline_events (id, circle_id, subject_id, kind, summary,
      occurred_on, occurred_zone, approved_by, approved_at, approver_display_name, taint)
    values (v, p_c, p_s,
            case p_domain when 'memories' then 'memory'::hc.timeline_kind else 'medical' end,
            'pair event ' || p_token, '2026-08-01', 'America/New_York',
            p_u, now(), 'Pat', array[p_domain]);
    return query select 'timeline_event'::hc.object_type, v;
  else
    insert into public.documents (id, circle_id, subject_id, title, category,
      artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
    values (v, p_c, p_s, 'pair document ' || p_token,
            case p_domain when 'finances' then 'financial'::hc.doc_category else 'legal' end,
            p_a, now(), p_u, now(), 'Pat', array[p_domain]);
    return query select 'document'::hc.object_type, v;
  end if;
end $$;

do $$
declare
  up uuid := pg_temp.mk_user(gen_random_uuid());
  um uuid := pg_temp.mk_user(gen_random_uuid());
  cp uuid; sp uuid; mp uuid; mm uuid;
  ap uuid := gen_random_uuid();
  v_from hc.domain; v_to hc.domain; d hc.domain;
  parent record; child record;
  v_token text; v_hits text;
begin
  insert into public.accounts (id, kind, display_name) values
    (up, 'member', 'Pat'), (um, 'member', 'Mira');
  insert into public.circles (name, created_by) values ('Search pairs circle', up)
    returning id into cp;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (cp, 'Ada', 'recovering', '02138', 'America/New_York', 'sage',
          'srp-' || substr(cp::text, 1, 8)) returning id into sp;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (cp, up, 'coordinator', 'Pat') returning id into mp;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (cp, um, 'family', 'Mira') returning id into mm;
  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (ap, cp, sp, 'upload');

  create temp table search_pairs (
    from_d hc.domain, to_d hc.domain, token text, hits text) on commit drop;

  for v_from in select unnest(hc.all_domains()) loop
    for v_to in select unnest(hc.all_domains()) loop
      continue when v_from = v_to;
      v_token := 'zq' || v_from || v_to;

      select * into parent from pg_temp.make_obj(v_from, v_token || 'p', cp, sp, up, ap);
      select * into child  from pg_temp.make_obj(v_to,   v_token,        cp, sp, up, ap);
      perform hc.link_provenance(child.otype, child.oid, parent.otype, parent.oid);

      delete from public.access_grants where member_id = mm;
      for d in select unnest(hc.all_domains()) loop
        if d <> v_from then
          insert into public.access_grants
            (circle_id, member_id, subject_id, domain, level, granted_by)
          values (cp, mm, sp, d, 'manage', up);
        end if;
      end loop;

      v_hits := pg_temp.search_all(um, cp, v_token);
      insert into search_pairs values (v_from, v_to, v_token, v_hits);
    end loop;
  end loop;

  perform set_config('t.um', um::text, true);
  perform set_config('t.up', up::text, true);
  perform set_config('t.cp', cp::text, true);
  perform set_config('t.sp', sp::text, true);
  perform set_config('t.mm', mm::text, true);
end $$;

select is((select count(*)::int from search_pairs), 20,
  'RLS-11: twenty ordered pairs generated for the search channel (a sixth domain adds its ten automatically)');

select is((
  select coalesce(string_agg(from_d || '→' || to_d || '=' || hits, ', '
                             order by from_d, to_d), 'all hidden')
  from search_pairs where hits is distinct from '0'), 'all hidden',
  'RLS-11: manage on `to`, hidden on `from` ⇒ the derived object is absent from search across ALL THREE relations, all twenty pairs');

do $$
declare d hc.domain;
begin
  delete from public.access_grants where member_id = current_setting('t.mm')::uuid;
  for d in select unnest(hc.all_domains()) loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (current_setting('t.cp')::uuid, current_setting('t.mm')::uuid,
            current_setting('t.sp')::uuid, d, 'manage', current_setting('t.up')::uuid);
  end loop;
end $$;

select is(pg_temp.search_all(current_setting('t.um')::uuid,
                             current_setting('t.cp')::uuid,
                             (select token from search_pairs
                              order by from_d desc, to_d desc limit 1)), '1',
  'control: with manage on all five the same token IS found — the matrix zeros are the taint, not a broken fixture');

-- ----------------------------------------------------------------------------
-- 22–23 · PRF-04 against the real search schema: over a 300-document scan
-- the measured ctx() execution count equals the TEXTUAL references in the
-- two policies the §7.2 query engages — never the row count. (The plan
-- half — InitPlan hoisting inside a LEFT JOIN under RLS — was proven by
-- the ADR-0002 spike and pinned synthetically in 000; this is the live
-- regression.) The counting shim replaces hc.ctx() INSIDE this rolled-
-- back transaction; nothing after this block needs the real ctx().
-- ----------------------------------------------------------------------------
do $$
declare
  uv uuid := pg_temp.mk_user(gen_random_uuid());
  cv uuid; sv uuid; mv uuid;
  av uuid := gen_random_uuid();
  d hc.domain;
begin
  insert into public.accounts (id, kind, display_name) values (uv, 'member', 'Vol');
  insert into public.circles (name, created_by) values ('Search volume circle', uv)
    returning id into cv;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (cv, 'Vee', 'recovering', '02138', 'America/New_York', 'sage',
          'srv-' || substr(cv::text, 1, 8)) returning id into sv;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (cv, uv, 'family', 'Vol') returning id into mv;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (cv, mv, sv, d::hc.domain, 'view', uv);
  end loop;
  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (av, cv, sv, 'upload');

  insert into public.documents (circle_id, subject_id, title, category,
    artifact_arrival_id, filed_at, approved_by, approved_at,
    approver_display_name, taint)
  select cv, sv, 'volume document ' || i, 'medical', av, now(), uv, now(),
         'Vol', '{health}'
  from generate_series(1, 300) i;

  perform set_config('t.uv', uv::text, true);
  perform set_config('t.cv', cv::text, true);
end $$;

create temp sequence ctx_calls;
select nextval('ctx_calls');

create function pg_temp.bump_ctx() returns jsonb
language plpgsql stable
as $$
begin
  perform nextval('ctx_calls');
  return hc.ctx_for(hc.uid());
end $$;

grant execute on function pg_temp.bump_ctx() to hc_internal;
grant usage, select, update on sequence ctx_calls to hc_internal;
grant usage, select on sequence ctx_calls to authenticated;

create or replace function hc.ctx()
returns jsonb language sql stable security definer set search_path = ''
as $$
  select pg_temp.bump_ctx();
$$;

select set_config('t.c0', currval('ctx_calls')::text, true);

select is(pg_temp.q72_count(current_setting('t.uv')::uuid,
                            current_setting('t.cv')::uuid, 'volume'), '300',
  'the volume scan returns all 300 view-visible documents through the §7.2 query');

select set_config('t.c1n', currval('ctx_calls')::text, true);

select is(current_setting('t.c1n')::int - current_setting('t.c0')::int, 6,
  'PRF-04: ctx() executed exactly SIX times over the 300-row §7.2 scan — one per textual policy reference (documents 2 + dsc prefilter 1 + dsc visible_at 1 + the EXISTS''s inner documents policy 2), never per row');

select * from finish();
rollback;
