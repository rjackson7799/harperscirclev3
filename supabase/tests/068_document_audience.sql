-- ============================================================================
-- 7A · M3 — document audience: hc.document_audience ·
-- hc.recategorize_document · hc.revoke_share (PRD §4.3.2, §4.3.4, §4.3.5,
-- §4.3.6; AC-DOC-5/6; AC-PERM-10's revoke half; TSD §2.6, §7.1).
-- Pinned here BEFORE the migration exists.
--
-- THE CONTRACT THESE CASES PIN.
--   · Re-categorising is an AUTHORIZATION CHANGE, not a filing preference
--     (§4.3.2). document_audience names, by name and level before/after,
--     exactly the live members whose visibility of THIS document changes
--     under the proposed category — and nobody else: a member with a named
--     share sits at view on both sides and is absent; a coordinator at
--     manage on both sides is absent.
--   · Both the preview and the move need manage on BOTH the source and the
--     destination domain (§4.3.2's fourth rule: "cannot be used to widen
--     your own access"), one gate for both so the sentence the interface
--     renders and the write the database performs cannot disagree.
--   · The move rewrites category and taint, carries every DERIVED object
--     with it (the task drafted from the document changes domain too — the
--     ONE shrinking path, hc.reclassify_taint), and rebuilds tsv_summary
--     and the document_search_content row IN THE SAME TRANSACTION (§4.3.6:
--     index membership is synchronous with access) — driven both ways: the
--     member who loses the domain loses the index row on her next query,
--     the member who gains it gains it.
--   · The person's audience_changed entry carries BOTH audiences by name,
--     plus who gained and who lost. The taint machinery writes its own entry
--     beside it (actor "Reclassification", the taint sets) exactly as a 1D
--     reclassify always has; the count is two and the test says so.
--   · A same-domain re-categorisation still moves category, moves no taint,
--     and logs an empty diff. The same category is a quiet no-op.
--   · revoke_share: the granter or a live coordinator, one action, logged;
--     anyone else, an already-revoked share and a nonexistent one are ONE
--     shape. Revocation reduces reach and is permitted under a freeze; the
--     move is not.
--   · The AI role holds no EXECUTE — catalog-based. hc.revise_object cannot
--     change category (the allowlist stays title, summary_text).
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(30);

-- ----------------------------------------------------------------------------
-- Helpers (the 038/063 pattern).
-- ----------------------------------------------------------------------------
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

create function pg_temp.scalar(p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  execute p_sql into v;
  return v;
exception when others then
  get stacked diagnostics m := message_text;
  return 'ERROR:' || sqlstate || ':' || m;
end $$;

create function pg_temp.call_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v text; m text;
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user, 'role', 'authenticated')::text, true);
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

-- ----------------------------------------------------------------------------
-- Fixtures: circle c1 · subject s1 (Nell).
--   Sarah    coordinator, manage×5 (the granter of Omar's share)
--   Kim      coordinator, manage×5 (a second coordinator: revokes what she
--            did not grant)
--   Dan      family — manage on health, finances, schedule; NO documents
--   Priya    family — health summary (loses when medical → legal)
--   Ruth     family — documents VIEW (gains, and gains the index row)
--   Lena     family — documents summary (gains at summary)
--   Marisol  care_circle — schedule summary (hidden on both sides)
--   Omar     family — memories summary, plus a NAMED SHARE on d_med (view on
--            both sides: absent from the audience, unmoved by the move)
-- Documents: d_med (medical, {health}) with its dsc row · d_fin (financial,
-- {finances}). A task t_der drafted FROM d_med ({schedule,health}).
-- Shares: sh_omar (Sarah → Omar, d_med) · sh_mar (Dan → Marisol, d_fin) ·
-- sh_lena (Sarah → Lena, d_fin).
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
do $fx$
declare
  u_sarah uuid := pg_temp.mk_user(gen_random_uuid());
  u_kim   uuid := pg_temp.mk_user(gen_random_uuid());
  u_dan   uuid := pg_temp.mk_user(gen_random_uuid());
  u_priya uuid := pg_temp.mk_user(gen_random_uuid());
  u_ruth  uuid := pg_temp.mk_user(gen_random_uuid());
  u_lena  uuid := pg_temp.mk_user(gen_random_uuid());
  u_mar   uuid := pg_temp.mk_user(gen_random_uuid());
  u_omar  uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid;
  m_sarah uuid; m_kim uuid; m_dan uuid; m_priya uuid; m_ruth uuid; m_lena uuid;
  m_mar uuid; m_omar uuid;
  a1 uuid := gen_random_uuid();
  d_med uuid := gen_random_uuid(); d_fin uuid := gen_random_uuid();
  t_der uuid := gen_random_uuid();
  sh_omar uuid; sh_mar uuid; sh_lena uuid;
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u_sarah, 'member', 'Sarah'), (u_kim, 'member', 'Kim'), (u_dan, 'member', 'Dan'),
    (u_priya, 'member', 'Priya'), (u_ruth, 'member', 'Ruth'), (u_lena, 'member', 'Lena'),
    (u_mar, 'member', 'Marisol'), (u_omar, 'member', 'Omar');
  insert into public.circles (name, created_by) values ('Nell''s circle', u_sarah)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'da1-' || substr(c1::text, 1, 8)) returning id into s1;

  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_sarah, 'coordinator', 'Sarah') returning id into m_sarah;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_kim, 'coordinator', 'Kim') returning id into m_kim;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_dan, 'family', 'Dan') returning id into m_dan;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_priya, 'family', 'Priya') returning id into m_priya;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_ruth, 'family', 'Ruth') returning id into m_ruth;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_lena, 'family', 'Lena') returning id into m_lena;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_mar, 'care_circle', 'Marisol') returning id into m_mar;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_omar, 'family', 'Omar') returning id into m_omar;

  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_sarah, s1, d::hc.domain, 'manage', u_sarah),
           (c1, m_kim,   s1, d::hc.domain, 'manage', u_sarah);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_dan,   s1, 'health',    'manage',  u_sarah),
         (c1, m_dan,   s1, 'finances',  'manage',  u_sarah),
         (c1, m_dan,   s1, 'schedule',  'manage',  u_sarah),
         (c1, m_priya, s1, 'health',    'summary', u_sarah),
         (c1, m_ruth,  s1, 'documents', 'view',    u_sarah),
         (c1, m_lena,  s1, 'documents', 'summary', u_sarah),
         (c1, m_mar,   s1, 'schedule',  'summary', u_sarah),
         (c1, m_omar,  s1, 'memories',  'summary', u_sarah);

  insert into public.arrivals (id, circle_id, subject_id, channel)
  values (a1, c1, s1, 'upload');

  insert into public.documents (id, circle_id, subject_id, title, category, summary_text,
    artifact_arrival_id, filed_at, approved_by, approved_at, approver_display_name, taint)
  values (d_med, c1, s1, 'Discharge summary · Jul 12', 'medical',
          'Nell went home on Jul 12. Wound care twice daily. Follow-up in two weeks.',
          a1, now(), u_sarah, now(), 'Sarah', '{health}'),
         (d_fin, c1, s1, 'Bank statement · Jul 2026', 'financial', null,
          a1, now(), u_sarah, now(), 'Sarah', '{finances}');
  -- the index row, as the writer would have left it (replica mode skips the
  -- builder here; the move rebuilds it, which is what case 16 reads)
  insert into public.document_search_content (document_id, circle_id, subject_id)
  values (d_med, c1, s1);

  -- the task drafted FROM the discharge summary: taint {schedule,health}
  insert into public.tasks (id, circle_id, subject_id, title, status,
    approved_by, approved_at, approver_display_name, taint)
  values (t_der, c1, s1, 'Book the two-week follow-up', 'open',
          u_sarah, now(), 'Sarah', '{schedule,health}');
  insert into public.provenance_edges (circle_id, child_type, child_id, parent_type, parent_id)
  values (c1, 'task', t_der, 'document', d_med);

  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', d_med, m_omar, u_sarah) returning id into sh_omar;
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', d_fin, m_mar, u_dan) returning id into sh_mar;
  insert into public.object_shares (circle_id, subject_id, object_type, object_id, member_id, granted_by)
  values (c1, s1, 'document', d_fin, m_lena, u_sarah) returning id into sh_lena;

  perform set_config('t.u_sarah', u_sarah::text, true);
  perform set_config('t.u_kim', u_kim::text, true);
  perform set_config('t.u_dan', u_dan::text, true);
  perform set_config('t.u_priya', u_priya::text, true);
  perform set_config('t.u_ruth', u_ruth::text, true);
  perform set_config('t.u_lena', u_lena::text, true);
  perform set_config('t.u_omar', u_omar::text, true);
  perform set_config('t.c1', c1::text, true);
  perform set_config('t.s1', s1::text, true);
  perform set_config('t.m_omar', m_omar::text, true);
  perform set_config('t.d_med', d_med::text, true);
  perform set_config('t.d_fin', d_fin::text, true);
  perform set_config('t.t_der', t_der::text, true);
  perform set_config('t.sh_omar', sh_omar::text, true);
  perform set_config('t.sh_mar', sh_mar::text, true);
  perform set_config('t.sh_lena', sh_lena::text, true);
end $fx$;
set session_replication_role = default;

-- ----------------------------------------------------------------------------
-- 1–5 · Shape, privilege closure (catalog-based), the AI role.
-- ----------------------------------------------------------------------------
select has_function('hc', 'document_audience', array['uuid', 'hc.doc_category'],
  'hc.document_audience(document, category) exists');
select has_function('hc', 'recategorize_document', array['uuid', 'hc.doc_category'],
  'hc.recategorize_document(document, category) exists');
select has_function('hc', 'revoke_share', array['uuid'],
  'hc.revoke_share(share) exists');

select ok(
  (select count(*) = 3 and bool_and(
        pg_get_userbyid(p.proowner) = 'hc_internal'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'execute')
    and not has_function_privilege('anon', p.oid, 'execute')
    and not has_function_privilege('hc_admin', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc'
      and p.proname in ('document_audience', 'recategorize_document', 'revoke_share')),
  'all three are definers owned by hc_internal, executable by authenticated and by no other request-path role — from the catalog');

select ok(
  (select count(*) = 3 and bool_and(not has_function_privilege('hc_pipeline', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc'
      and p.proname in ('document_audience', 'recategorize_document', 'revoke_share')),
  'the AI role holds no EXECUTE on any of the three — an audience change is a person''s act');

-- ----------------------------------------------------------------------------
-- 6–9 · THE PREVIEW: exactly the members whose visibility changes, by name,
--       before and after — and the gate is the move's gate.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select string_agg(a.display_name || ':' || a.before::text || '>' || a.after::text, ',' order by a.display_name)
       from hc.document_audience(%L, 'legal') a $$,
  current_setting('t.d_med'))),
  'Dan:manage>hidden,Lena:hidden>summary,Priya:summary>hidden,Ruth:hidden>view',
  '"This moves it out of health. Lena and Ruth will be able to see it; Dan and Priya will not." — exactly the four whose level changes, by name, before and after. Kim (manage both sides), Omar (a named share: view both sides) and Marisol (hidden both sides) are ABSENT');

select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select count(*)::text from hc.document_audience(%L, 'legal') $$,
  current_setting('t.d_med'))),
  'ERROR:P0001:audience_refused',
  'Dan manages health and not documents: the PREVIEW refuses on the same gate as the move — the sentence and the write cannot disagree');

select is(pg_temp.call_as(current_setting('t.u_priya')::uuid, format(
  $$ select count(*)::text from hc.document_audience(%L, 'legal') $$,
  current_setting('t.d_med'))),
  'ERROR:P0001:audience_refused',
  'a summary reader cannot preview an audience she could not change');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select count(*)::text from hc.document_audience(%L, 'medical') $$,
  current_setting('t.d_med'))),
  '0',
  'the same category changes nobody''s visibility: zero rows, not a refusal');

-- ----------------------------------------------------------------------------
-- 10–11 · The move refuses without manage on BOTH domains (§4.3.2's fourth
--         rule), and nothing moves.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_dan')::uuid, format(
  $$ select hc.recategorize_document(%L, 'legal')::text $$, current_setting('t.d_med'))),
  'ERROR:P0001:recategorize_refused',
  '"Re-categorisation cannot be used to widen your own access": Dan holds manage on the source and nothing on the destination — refused');

select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select hc.recategorize_document(%L, 'legal')::text || (select d.category::text from public.documents d where d.id = %L) $$,
  current_setting('t.d_med'), current_setting('t.d_med'))),
  'ERROR:P0001:recategorize_refused',
  'Ruth holds view on the destination and nothing on the source — refused in the same one shape');

-- ----------------------------------------------------------------------------
-- 12–16 · THE MOVE: before, the act, the row, the derived object, after —
--         and the index row moves WITH access, in one transaction.
-- ----------------------------------------------------------------------------
select is(
  pg_temp.call_as(current_setting('t.u_priya')::uuid, format(
    $$ select count(*)::text from public.documents where id = %L $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
    $$ select count(*)::text from public.documents where id = %L $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
    $$ select count(*)::text from public.document_search_content where document_id = %L $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_omar')::uuid, format(
    $$ select count(*)::text from public.documents where id = %L $$, current_setting('t.d_med'))),
  '1/0/0/1',
  'BEFORE: Priya (health summary) reads the discharge summary, Ruth (documents view) does not and holds no index row, Omar reads it through his named share');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (r ->> 'category') || '/' || (r ->> 'domain') || '/' || (r ->> 'gained') || '/' || (r ->> 'lost')
       from hc.recategorize_document(%L, 'legal') r $$,
  current_setting('t.d_med'))),
  'legal/documents/2/2',
  'a coordinator holding manage on both domains moves the document medical → legal: two people gain it, two lose it');

select is(pg_temp.scalar(format(
  $$ select d.category::text || '/' || d.taint::text || '/' || d.taint_resolved::text
       from public.documents d where d.id = %L $$, current_setting('t.d_med'))),
  'legal/{documents}/true',
  'the row: category legal, taint {documents}, still resolved — the ONE shrinking path did the recompute');

select is(pg_temp.scalar(format(
  $$ select t.taint::text from public.tasks t where t.id = %L $$, current_setting('t.t_der'))),
  '{schedule,documents}',
  'THE DERIVED OBJECT FOLLOWED: the task drafted from the document now carries {schedule,documents} — an audience change reaches everything the provenance graph reaches, in the same transaction (§7.6)');

select is(
  pg_temp.call_as(current_setting('t.u_priya')::uuid, format(
    $$ select count(*)::text from public.documents where id = %L $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
    $$ select count(*)::text from public.documents where id = %L $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
    $$ select count(*)::text from public.document_search_content where document_id = %L $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_priya')::uuid, format(
    $$ select count(*)::text from public.document_search_content where document_id = %L $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_omar')::uuid, format(
    $$ select count(*)::text from public.documents where id = %L $$, current_setting('t.d_med'))),
  '0/1/1/0/1',
  'AFTER, on each person''s NEXT query: Priya has lost it, Ruth has gained it AND its index row, Priya holds no index row, Omar still reads it through his share — a share names one object for one person and a domain move does not touch it (§4.3.5)');

-- ----------------------------------------------------------------------------
-- 17–19 · The log: the person's entry carries BOTH audiences by name; the
--         taint machinery's own entry stands beside it, and the count is two.
-- ----------------------------------------------------------------------------
select is(pg_temp.scalar(format(
  $$ select l.actor_display_name || '/' || (l.detail ->> 'category_before') || '>' || (l.detail ->> 'category_after')
            || '/' || (select string_agg(x, ',' order by x) from jsonb_array_elements_text(l.detail -> 'gained') x)
            || '/' || (select string_agg(x, ',' order by x) from jsonb_array_elements_text(l.detail -> 'lost') x)
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'audience_changed' and l.object_id = %L
        and l.actor_account_id = %L $$,
  current_setting('t.c1'), current_setting('t.d_med'), current_setting('t.u_sarah'))),
  'Sarah/medical>legal/Lena,Ruth/Dan,Priya',
  'the person''s audience_changed entry: who did it, from what to what, who gained and who lost — by name');

select is(pg_temp.scalar(format(
  $$ select (select string_agg(e ->> 'name', ',' order by e ->> 'name') from jsonb_array_elements(l.detail -> 'audience_before') e)
            || ' | ' ||
            (select string_agg(e ->> 'name', ',' order by e ->> 'name') from jsonb_array_elements(l.detail -> 'audience_after') e)
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'audience_changed' and l.object_id = %L
        and l.actor_account_id = %L $$,
  current_setting('t.c1'), current_setting('t.d_med'), current_setting('t.u_sarah'))),
  'Dan,Kim,Omar,Priya,Sarah | Kim,Lena,Omar,Ruth,Sarah',
  'BOTH audiences, whole (§4.3.2: "logged as an audience change, with both audiences"): everyone who could see it before, everyone who can after, the share-holder in both');

select is(pg_temp.scalar(format(
  $$ select count(*)::text || '/' || string_agg(l.actor_display_name, ',' order by l.actor_display_name)
       from public.access_log l
      where l.circle_id = %L and l.event_type = 'audience_changed' and l.object_id = %L $$,
  current_setting('t.c1'), current_setting('t.d_med'))),
  '2/Reclassification,Sarah',
  'two entries, stated plainly: the person''s, and the taint machinery''s own (actor "Reclassification", the taint sets) exactly as a 1D reclassify has always written it — one act, one recompute, both on the record');

-- ----------------------------------------------------------------------------
-- 20 · The slice trap: hc.revise_object cannot change the category.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.revise_object('document', %L, '{"category":"medical"}'::jsonb)::text $$,
  current_setting('t.d_med'))),
  'ERROR:P0001:revise_invalid_field',
  'category is not a field a person edits — it is an audience change and has exactly one door');

-- ----------------------------------------------------------------------------
-- 21–22 · A same-domain move changes the category and no taint; the same
--         category is a quiet no-op.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_kim')::uuid, format(
  $$ select (r ->> 'changed') || '/' || (r ->> 'category') || '/' || (r ->> 'gained') || '/' || (r ->> 'lost')
            || '/' || (select d.taint::text from public.documents d where d.id = %L)
       from hc.recategorize_document(%L, 'other') r $$,
  current_setting('t.d_med'), current_setting('t.d_med'))),
  'true/other/0/0/{documents}',
  'legal → other stays inside the documents domain: the category moves, the taint does not, nobody gains or loses — still logged, as an empty audience change');

select is(pg_temp.call_as(current_setting('t.u_kim')::uuid, format(
  $$ select (r ->> 'changed') || '/' ||
            (select count(*)::text from public.access_log l
              where l.circle_id = %L and l.event_type = 'audience_changed' and l.object_id = %L
                and l.actor_account_id = %L)
       from hc.recategorize_document(%L, 'other') r $$,
  current_setting('t.c1'), current_setting('t.d_med'), current_setting('t.u_kim'),
  current_setting('t.d_med'))),
  'false/1',
  'the same category again is a quiet no-op: changed false, and Kim''s one entry stays one');

-- ----------------------------------------------------------------------------
-- 23–27 · UNSHARE in one action: the granter, a coordinator, and nobody else.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.revoke_share(%L)) ->> 'member_id' $$, current_setting('t.sh_omar'))),
  current_setting('t.m_omar'),
  'the granter revokes the share she made — one action (AC-DOC-5)');

select is(
  pg_temp.scalar(format(
    $$ select (sh.revoked_at is not null)::text from public.object_shares sh where sh.id = %L $$,
    current_setting('t.sh_omar')))
  || '/' ||
  pg_temp.call_as(current_setting('t.u_omar')::uuid, format(
    $$ select count(*)::text from public.documents where id = %L $$, current_setting('t.d_med')))
  || '/' ||
  pg_temp.scalar(format(
    $$ select count(*)::text from public.access_log l
        where l.circle_id = %L and l.event_type = 'object_share_revoked' and l.target_member_id = %L $$,
    current_setting('t.c1'), current_setting('t.m_omar'))),
  'true/0/1',
  'revoked_at set, Omar loses the document on his NEXT query, and the revocation is its own log entry (§4.3.5: logged on creation and revocation)');

select is(pg_temp.call_as(current_setting('t.u_kim')::uuid, format(
  $$ select (hc.revoke_share(%L)) ->> 'share_id' $$, current_setting('t.sh_mar'))),
  current_setting('t.sh_mar'),
  'a coordinator revokes a share she did not grant — "a control to unshare" is the coordinator''s too');

select is(pg_temp.call_as(current_setting('t.u_ruth')::uuid, format(
  $$ select hc.revoke_share(%L)::text $$, current_setting('t.sh_lena'))),
  'ERROR:P0001:revoke_refused',
  'neither the granter nor a coordinator: refused');

select is(pg_temp.call_as(current_setting('t.u_kim')::uuid, format(
  $$ select hc.revoke_share(%L)::text || hc.revoke_share(gen_random_uuid())::text $$,
  current_setting('t.sh_mar'))),
  'ERROR:P0001:revoke_refused',
  'an already-revoked share and a nonexistent one land in the same one shape (DEF-10)');

-- ----------------------------------------------------------------------------
-- 28–29 · Freeze: the move refuses with the NAMED signature; unsharing is a
--         reduction and goes through.
-- ----------------------------------------------------------------------------
do $$
begin
  insert into public.freezes (circle_id) values (current_setting('t.c1')::uuid);
end $$;
select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select hc.recategorize_document(%L, 'financial')::text $$, current_setting('t.d_med'))),
  'ERROR:P0001:freeze_active',
  'a freeze refuses an audience change with the named freeze_active — moving a document can widen who reads it');

select is(pg_temp.call_as(current_setting('t.u_sarah')::uuid, format(
  $$ select (hc.revoke_share(%L)) ->> 'share_id' $$, current_setting('t.sh_lena'))),
  current_setting('t.sh_lena'),
  'and a freeze permits unsharing — containment never blocks reduction');

-- ----------------------------------------------------------------------------
-- 30 · ADR-0033 cluster E (R1/F-6, R2/F-3): the freeze is named to MEMBERS.
--      The freeze from 28–29 is still open; a STRANGER moving an existing
--      document and a nonexistent one meets one shape.
-- ----------------------------------------------------------------------------
set session_replication_role = replica;
do $$
declare u uuid := pg_temp.mk_user(gen_random_uuid());
begin
  insert into public.accounts (id, kind, display_name) values (u, 'member', 'Stranger');
  perform set_config('t.u_stranger', u::text, true);
end $$;
set session_replication_role = default;
select is(pg_temp.call_as(current_setting('t.u_stranger')::uuid, format(
  $$ select hc.recategorize_document(%L, 'financial')::text $$, current_setting('t.d_med')))
  || '/' || pg_temp.call_as(current_setting('t.u_stranger')::uuid,
  $$ select hc.recategorize_document(gen_random_uuid(), 'financial')::text $$),
  'ERROR:P0001:recategorize_refused/ERROR:P0001:recategorize_refused',
  'under the freeze a STRANGER moving an existing document and a nonexistent one meets ONE shape — before, the existing one answered freeze_active (R1/F-6, R2/F-3). Two calls, joined outside the statement');

select * from finish();
rollback;
