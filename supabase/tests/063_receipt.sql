-- ============================================================================
-- 6A · M5 — the receipt. §4.2.4's "what went where", as a DEFINER READ.
-- docs/review/slice-6-plan.md M5; TSD §4.9, §2.4, §3.5; PRD §4.2.4,
-- AC-INBOX-9. Pinned here BEFORE the migration exists.
--
-- ---------------------------------------------------------------------------
-- WHY A DEFINER AND NOT A GRANT. `proposal_commits` holds NO member
-- privilege at all: its grants are `select, insert … to hc_internal` and its
-- two policies are `…_internal` / `…_internal_claim` (20260815230001:150).
-- `authenticated` holds NOTHING on the table §4.2.4's receipt is a read of,
-- so the receipt cannot be built at the app layer today at any level of
-- cleverness. It should not get a blanket grant either — the table is the
-- one-proposal-one-object claim, and a member has no business reading other
-- circles' claims even filtered. So it gets ONE definer with ONE gate.
--
-- ---------------------------------------------------------------------------
-- COUNTED, NEVER NAMED — the §3.5 log-level discipline, carried to the
-- receipt. A destination the caller cannot see is still REPORTED (so the
-- receipt can say "and one more thing you can't see") but is never NAMED and
-- never LINKED: object_type survives, object_id and label do not. Never a
-- silent omission, and never a handle to something you cannot open.
--
-- AND THE HONEST BOUND ON THAT FILTER, stated so a reviewer can check it
-- rather than assume it does more than it does: the ARRIVAL gate is
-- view-over-all-five, which is STRICTLY STRONGER than the `summary`
-- threshold documents / tasks / timeline_events / episodes read at and
-- exactly the `view` threshold profile_facts reads at (§3.4's level→table
-- map). So a caller who clears the gate at all clears every ORDINARY
-- destination. The filter is reachable through the rungs that do not depend
-- on the domain ladder:
--
--   · UNRESOLVED LINEAGE — hc.visible_at rung 3: an object whose taint is
--     not resolved needs manage on all five, or nothing. A view×5 reader is
--     hidden from it (cases 5-6);
--   · a DELETED destination — every record policy carries `deleted_at is
--     null`, and the receipt reproduces each policy exactly (case 7);
--   · the care_circle ceiling (rung 4) and the FRZ-13 read-only cap, both
--     of which also refuse the arrival gate, so they never reach this code.
--
-- That is a NARROW set, and saying so is the point: the filter is real, it
-- is exercised here, and it is not doing more work than it looks like.
--
-- ---------------------------------------------------------------------------
-- ONE GATE ACROSS THE WHOLE SURFACE is the property this migration exists to
-- establish, and M2 began it: hc.approve_proposal, hc.reject_proposal,
-- hc.extractions_for, public.arrival_renditions and now hc.receipt_for ALL
-- ask the same question of the same arrival — view over all five domains,
-- the predicate hc.log_artifact_read and the artifact route already
-- enforced. The screen, the fact read, the manifest, the decision and the
-- receipt cannot disagree about who may see this arrival.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(14);

-- ----------------------------------------------------------------------------
-- Helpers.
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

-- ----------------------------------------------------------------------------
-- Fixtures. One arrival whose review is FINISHED: two approvals (a task the
-- readers can see, and a document whose lineage is UNRESOLVED) and one
-- rejection. A second arrival is all-rejected. A third destination is
-- deleted after approval.
--
--   u_coord  manage×5 — sees everything, including unresolved lineage
--   u_view   view×5   — clears the arrival gate, and rung 3 hides the
--                       unresolved destination from them
--   u_partial manage on `health` only — below the arrival gate entirely
-- ----------------------------------------------------------------------------
do $wrap$
declare
  u_coord   uuid := pg_temp.mk_user(gen_random_uuid());
  u_view    uuid := pg_temp.mk_user(gen_random_uuid());
  u_partial uuid := pg_temp.mk_user(gen_random_uuid());
  c1 uuid; s1 uuid; m_coord uuid; m_view uuid; m_partial uuid;
  a_full uuid := gen_random_uuid();
  a_none uuid := gen_random_uuid();
  p_task uuid := gen_random_uuid();
  p_doc  uuid := gen_random_uuid();
  p_rej  uuid := gen_random_uuid();
  p_del  uuid := gen_random_uuid();
  p_pend uuid := gen_random_uuid();
  p_n1 uuid := gen_random_uuid();
  p_n2 uuid := gen_random_uuid();
  o_task uuid := gen_random_uuid();
  o_doc  uuid := gen_random_uuid();
  o_del  uuid := gen_random_uuid();
  d text;
begin
  insert into public.accounts (id, kind, display_name) values
    (u_coord, 'member', 'Rosa'), (u_view, 'member', 'Dan'),
    (u_partial, 'member', 'Priya');
  insert into public.circles (name, created_by) values ('Nell''s circle', u_coord)
    returning id into c1;
  insert into public.subjects (circle_id, first_name, situation, postal_code,
                               timezone, accent_color, forwarding_local_part)
  values (c1, 'Nell', 'recovering at home', '02138', 'America/New_York', 'sage',
          'rc6-' || substr(c1::text, 1, 8)) returning id into s1;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_coord, 'coordinator', 'Rosa') returning id into m_coord;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_view, 'family', 'Dan') returning id into m_view;
  insert into public.circle_members (circle_id, account_id, tier, display_name_at_join)
  values (c1, u_partial, 'family', 'Priya') returning id into m_partial;
  foreach d in array array['memories','health','schedule','documents','finances'] loop
    insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
    values (c1, m_coord, s1, d::hc.domain, 'manage', u_coord),
           (c1, m_view,  s1, d::hc.domain, 'view',   u_coord);
  end loop;
  insert into public.access_grants (circle_id, member_id, subject_id, domain, level, granted_by)
  values (c1, m_partial, s1, 'health'::hc.domain, 'manage', u_coord);

  insert into public.arrivals (id, circle_id, subject_id, channel, state)
  values (a_full, c1, s1, 'upload', 'filed'::hc.arrival_state),
         (a_none, c1, s1, 'upload', 'nothing_filed'::hc.arrival_state);

  -- the decided proposals, and the objects their commits claim
  insert into public.proposals (id, arrival_id, circle_id, subject_id, kind, payload,
                                taint, status, decided_by, decided_at, reject_reason) values
    (p_task, a_full, c1, s1, 'task',
     jsonb_build_object('title', 'Book the follow-up'), '{schedule}',
     'approved', u_coord, now(), null),
    (p_doc, a_full, c1, s1, 'document',
     jsonb_build_object('title', 'Discharge summary', 'category', 'medical'), '{health}',
     'edited_approved', u_coord, now(), null),
    (p_rej, a_full, c1, s1, 'timeline_event',
     jsonb_build_object('kind', 'care', 'summary', 'A visit nobody wanted filed'), '{health}',
     'rejected', u_coord, now(), 'not_important'),
    (p_del, a_full, c1, s1, 'task',
     jsonb_build_object('title', 'A task since deleted'), '{schedule}',
     'approved', u_coord, now(), null),
    (p_pend, a_full, c1, s1, 'task',
     jsonb_build_object('title', 'Still undecided'), '{schedule}',
     'pending', null, null, null),
    (p_n1, a_none, c1, s1, 'task',
     jsonb_build_object('title', 'Declined one'), '{schedule}',
     'rejected', u_coord, now(), 'wrong'),
    (p_n2, a_none, c1, s1, 'task',
     jsonb_build_object('title', 'Declined two'), '{schedule}',
     'rejected', u_coord, now(), 'already_handled');

  insert into public.tasks (id, circle_id, subject_id, title, source_arrival_id,
                            source_proposal_id, approved_by, approved_at,
                            approver_display_name, taint, taint_resolved)
  values (o_task, c1, s1, 'Book the follow-up', a_full, p_task, u_coord, now(),
          'Rosa', '{schedule}', true),
         (o_del, c1, s1, 'A task since deleted', a_full, p_del, u_coord, now(),
          'Rosa', '{schedule}', true);

  -- THE UNRESOLVED DESTINATION: hc.visible_at rung 3 — "manage on all five,
  -- or nothing". A view×5 reader is hidden from it while the coordinator is
  -- not, which is exactly the counted-never-named case (§3.5).
  insert into public.documents (id, circle_id, subject_id, title, category,
                                artifact_arrival_id, filed_at, source_arrival_id,
                                source_proposal_id, approved_by, approved_at,
                                approver_display_name, taint, taint_resolved)
  values (o_doc, c1, s1, 'Discharge summary', 'medical', a_full, now(), a_full,
          p_doc, u_coord, now(), 'Rosa', '{health}', false);

  -- deleted after approval: every record policy carries `deleted_at is null`
  update public.tasks set deleted_at = now() where id = o_del;

  insert into public.proposal_commits (proposal_id, circle_id, object_type, object_id) values
    (p_task, c1, 'task', o_task),
    (p_doc,  c1, 'document', o_doc),
    (p_del,  c1, 'task', o_del);

  perform set_config('t.u_coord', u_coord::text, true);
  perform set_config('t.u_view', u_view::text, true);
  perform set_config('t.u_partial', u_partial::text, true);
  perform set_config('t.a_full', a_full::text, true);
  perform set_config('t.a_none', a_none::text, true);
  perform set_config('t.o_task', o_task::text, true);
  perform set_config('t.p_pend', p_pend::text, true);
end $wrap$;

-- ----------------------------------------------------------------------------
-- 1-2 · The definer and its shape. Privilege closure is CATALOG-BASED (the
--       segfault trap: a function-ACL denial segfaults this image).
-- ----------------------------------------------------------------------------
select ok(
  (select pg_get_userbyid(p.proowner) = 'hc_internal'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not has_function_privilege('anon', p.oid, 'execute')
      and not has_function_privilege('hc_pipeline', p.oid, 'execute')
      and not has_function_privilege('hc_admin', p.oid, 'execute')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'hc' and p.proname = 'receipt_for'),
  'hc.receipt_for is a definer owned by hc_internal, executable by authenticated and nobody else — proposal_commits has NO member grant and does not get a blanket one, so §4.2.4 gets ONE definer with ONE gate');

select is(
  (select string_agg(x.name, ',' order by x.ord)
     from (select unnest(p.proargnames) as name,
                  generate_subscripts(p.proargnames, 1) as ord,
                  unnest(p.proargmodes) as mode
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'hc' and p.proname = 'receipt_for') x
    where x.mode = 't'),
  'proposal_id,status,reject_reason,object_type,object_id,label,visible',
  'the receipt''s columns: what was decided, what it became, and whether the caller may be told its name — `visible` is EXPLICIT rather than inferred from a null, so the app cannot mistake "you cannot see this" for "there is nothing here"');

-- ----------------------------------------------------------------------------
-- 3-4 · WHAT WENT WHERE, for a caller who can see it.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select r.object_type::text || '/' || r.label || '/' || r.visible::text
        from hc.receipt_for(%L::uuid) r where r.status = 'approved' and r.object_type = 'task' and r.visible $q$,
  current_setting('t.a_full'))),
  'task/Book the follow-up/true',
  'the receipt NAMES a destination the caller can see, with the destination''s own display field — §4.2.4''s "what went where", and the link the app resolves is the object_id beside it');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select (r.object_id = %L::uuid)::text from hc.receipt_for(%L::uuid) r
       where r.object_type = 'task' and r.status = 'approved' and r.visible $q$,
  current_setting('t.o_task'), current_setting('t.a_full'))),
  'true',
  'and the object_id is the REAL destination — tasks and timeline are live RLS reads today, so a receipt link lands on the thing itself rather than on a page that says it exists');

-- ----------------------------------------------------------------------------
-- 5-7 · COUNTED, NEVER NAMED. The §3.5 discipline, driven both ways so the
--       filter is proven to filter rather than merely to be present.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_view')::uuid, format(
  $q$ select r.object_type::text || '/' || coalesce(r.label, 'NULL') || '/' ||
             coalesce(r.object_id::text, 'NULL') || '/' || r.visible::text
        from hc.receipt_for(%L::uuid) r where r.status = 'edited_approved' $q$,
  current_setting('t.a_full'))),
  'document/NULL/NULL/false',
  'COUNTED, NEVER NAMED: a destination whose lineage is UNRESOLVED needs manage on all five (hc.visible_at rung 3), so a view×5 reader is told a DOCUMENT was filed and is told neither its title nor a handle to open it');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select r.label from hc.receipt_for(%L::uuid) r where r.status = 'edited_approved' $q$,
  current_setting('t.a_full'))),
  'Discharge summary',
  'DRIVEN THE OTHER WAY: the coordinator holds manage×5, clears rung 3, and is told the very same destination''s name — the filter narrows to the reader, it does not simply blank a column');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select r.object_type::text || '/' || coalesce(r.label, 'NULL') || '/' || r.visible::text
        from hc.receipt_for(%L::uuid) r
       where r.object_type = 'task' and r.object_id is distinct from %L::uuid
         and r.status = 'approved' $q$,
  current_setting('t.a_full'), current_setting('t.o_task'))),
  'task/NULL/false',
  'a DELETED destination is counted and never named either — the receipt reproduces each record policy exactly, `deleted_at is null` included, so it can never name a row the table itself would refuse');

-- ----------------------------------------------------------------------------
-- 8-9 · NEVER A SILENT OMISSION. The invisible destination is still a ROW,
--       which is the whole difference between a receipt and a filtered list.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_view')::uuid, format(
  $q$ select count(*)::text || '/' || count(*) filter (where not r.visible)::text
        from hc.receipt_for(%L::uuid) r $q$,
  current_setting('t.a_full'))),
  '4/3',
  'the view×5 reader gets FOUR rows — every decision on this arrival — of which three are counted and not named. A receipt that dropped them would let a person believe the record holds less than it does');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select count(*)::text from hc.receipt_for(%L::uuid) r
       where r.proposal_id = %L::uuid $q$,
  current_setting('t.a_full'), current_setting('t.p_pend'))),
  '0',
  'a PENDING proposal is not in the receipt: this surface reports DECISIONS, and an undecided item is still the review screen''s business rather than the receipt''s');

-- ----------------------------------------------------------------------------
-- 10-11 · "Nothing filed" is a STATEMENT the receipt can make rather than an
--         absence it implies (AC-INBOX-4, PRD §4.2.4).
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select r.status || '/' || r.reject_reason || '/' || coalesce(r.object_type::text, 'NULL')
        from hc.receipt_for(%L::uuid) r where r.status = 'rejected'
       order by r.reject_reason limit 1 $q$,
  current_setting('t.a_full'))),
  'rejected/not_important/NULL',
  'a REJECTED proposal is returned as decided-and-not-written, with the reason it was declined — the receipt says what a person chose, not merely what survived');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select count(*)::text || '/' || count(*) filter (where r.object_type is null)::text
        from hc.receipt_for(%L::uuid) r $q$,
  current_setting('t.a_none'))),
  '2/2',
  'the receipt of an all-rejected arrival SAYS SO: two decisions, nothing written. "Nothing filed" is a sentence the receipt can speak rather than a blank a person has to interpret');

-- ----------------------------------------------------------------------------
-- 12-13 · ONE GATE ACROSS THE WHOLE SURFACE — the property M2 began and this
--         migration completes.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_partial')::uuid, format(
  $q$ select count(*)::text from hc.receipt_for(%L::uuid) r $q$,
  current_setting('t.a_full'))),
  'ERROR:P0001:receipt_refused',
  'ONE GATE: the member who cannot approve and cannot read the facts cannot read the receipt either — the arrival''s view-over-all-five, the same question hc.approve_proposal, hc.reject_proposal, hc.extractions_for and arrival_renditions all ask');

select is(pg_temp.call_as(current_setting('t.u_coord')::uuid,
  $q$ select count(*)::text from hc.receipt_for(gen_random_uuid()) r $q$),
  'ERROR:P0001:receipt_refused',
  'and a nonexistent arrival lands in the SAME one shape — nonexistent, foreign, deleted and below-cliff are one word (DEF-10), so the receipt is no existence oracle');

-- ----------------------------------------------------------------------------
-- 14 · Stable order, so the receipt reads the same way twice.
-- ----------------------------------------------------------------------------
select is(pg_temp.call_as(current_setting('t.u_coord')::uuid, format(
  $q$ select string_agg(coalesce(r.object_type::text, '-'), ',') from hc.receipt_for(%L::uuid) r $q$,
  current_setting('t.a_full'))),
  'document,task,task,-',
  'the order is the function''s and it is stable — written destinations first in a deterministic order, then the decisions that wrote nothing, so a person re-reading their receipt finds it unchanged');

select * from finish();

rollback;
