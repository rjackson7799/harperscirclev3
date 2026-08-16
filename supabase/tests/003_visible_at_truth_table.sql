-- ============================================================================
-- hc.visible_at() — the one function (TSD §3.3), tested as a pure truth
-- table with no fixtures: IMMUTABLE, touches no table, everything arrives
-- in p_ctx. The §3.3 clause ORDER is the security property; each ordering
-- is asserted independently (§3.13, Appendix A.4).
--
-- This file is the mutation-test target for the slice gate.
-- ============================================================================
begin;

create extension if not exists pgtap;

select plan(36);

-- ----------------------------------------------------------------------------
-- Helpers (pg_temp; vanish with the transaction). Arrays are passed CUMULATIVE
-- (manage ⊆ view ⊆ summary ⊆ log) exactly as hc.grant_vectors() guarantees,
-- except where a test deliberately malforms the entry.
-- ----------------------------------------------------------------------------
create function pg_temp.subj(
  p_tier text, p_frozen boolean,
  p_manage text[], p_view text[], p_summary text[], p_log text[],
  p_member uuid default '00000000-0000-0000-0000-0000000000f1'
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'c', '00000000-0000-0000-0000-0000000000c1'::uuid,
    'member', p_member, 'tier', p_tier, 'frozen', p_frozen,
    'manage', to_jsonb(p_manage), 'view', to_jsonb(p_view),
    'summary', to_jsonb(p_summary), 'log', to_jsonb(p_log));
$$;

create function pg_temp.ctx(
  p_subject uuid, p_subj jsonb, p_shares jsonb default '{}'::jsonb
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'account', '00000000-0000-0000-0000-0000000000a1'::uuid,
    'subjects', case when p_subj is null then '{}'::jsonb
                     else jsonb_build_object(p_subject::text, p_subj) end,
    'shares', p_shares);
$$;

-- Fixed identities used throughout.
-- S: the subject asked about · S2: a different subject · M: the caller's
-- member id · OTHER: someone else's member id · OBJ: the object asked about.
create function pg_temp.u(c text) returns uuid language sql immutable as
  $$ select ('00000000-0000-0000-0000-0000000000' || c)::uuid $$;

-- Convenience: all five domains as text[], and a one-object task share.
create function pg_temp.five() returns text[] language sql immutable as
  $$ select array['memories','health','schedule','documents','finances'] $$;
create function pg_temp.share_obj() returns jsonb language sql immutable as
  $$ select jsonb_build_object('task', jsonb_build_array(pg_temp.u('b1'))) $$;

-- ----------------------------------------------------------------------------
-- hc.dom() — jsonb → typed array, fail-closed on unknown names (§2.2)
-- ----------------------------------------------------------------------------
select is(hc.dom('["health","finances"]'::jsonb),
          array['health','finances']::hc.domain[],
          'dom(): parses a jsonb array of domain names');
select is(hc.dom(null), '{}'::hc.domain[], 'dom(): null → empty array');
select is(hc.dom('[]'::jsonb), '{}'::hc.domain[], 'dom(): [] → empty array');
select throws_ok($$ select hc.dom('["banking"]'::jsonb) $$, '22P02', null,
  'dom(): an unknown domain name raises rather than being silently dropped');

-- ----------------------------------------------------------------------------
-- hc.ladder() — the ladder alone, over cumulative arrays (§3.3)
-- ----------------------------------------------------------------------------
select is(hc.ladder(pg_temp.subj('family', false, '{}','{}','{}', pg_temp.five()),
                    hc.all_domains()),
          'log'::hc.access_level, 'ladder: log-on-all-five over full taint → log');
select is(hc.ladder(pg_temp.subj('family', false, '{}','{}','{}','{}'),
                    array['health']::hc.domain[]),
          'hidden'::hc.access_level, 'ladder: no grants → hidden');
select is(hc.ladder(pg_temp.subj('family', false,
            '{}', array['schedule'], array['schedule','finances'], array['schedule','finances']),
          array['schedule','finances']::hc.domain[]),
          'summary'::hc.access_level, 'ladder: min over taint — summary on both, view on one → summary');
select is(hc.ladder(pg_temp.subj('family', false,
            array['health'], array['health'], array['health'], array['health']),
          array['health']::hc.domain[]),
          'manage'::hc.access_level, 'ladder: cumulative manage → manage');

-- ----------------------------------------------------------------------------
-- Clause 1 — no subject context ⇒ hidden, FIRST and unconditional
-- ----------------------------------------------------------------------------
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('a2'),  -- context names a DIFFERENT subject
              pg_temp.subj('coordinator', false, pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five())),
            pg_temp.u('aa'), array['health']::hc.domain[], true),
          'hidden'::hc.access_level,
          'clause 1: subject absent from ctx → hidden');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('a2'),
              pg_temp.subj('coordinator', false, pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five()),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['health']::hc.domain[], true,
            'task', pg_temp.u('b1')),
          'hidden'::hc.access_level,
          'clause 1 before 5: a share cannot manufacture context for an ungranted subject');

-- ----------------------------------------------------------------------------
-- Clause 2 — freeze suspends ALL interactive access (AC-PERM-11)
-- ----------------------------------------------------------------------------
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('coordinator', true, pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five())),
            pg_temp.u('aa'), array['health']::hc.domain[], true),
          'hidden'::hc.access_level,
          'clause 2: frozen closes out even manage-on-all-five (the custodian)');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', true, pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five()),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['health']::hc.domain[], true,
            'task', pg_temp.u('b1')),
          'hidden'::hc.access_level,
          'clause 2 before 5: a share does not lift a freeze (AC-PERM-11)');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('coordinator', false, pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five())
                - 'frozen'),
            pg_temp.u('aa'), array['health']::hc.domain[], true),
          'hidden'::hc.access_level,
          'clause 2: a MISSING frozen key freezes (coalesce → true, fail closed)');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('coordinator', null, pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five())),
            pg_temp.u('aa'), array['health']::hc.domain[], true),
          'hidden'::hc.access_level,
          'clause 2: a NULL frozen key freezes (fail closed)');

-- ----------------------------------------------------------------------------
-- Clause 3 — unresolved or empty lineage: manage-on-all-five or nothing
-- (AC-PERM-9: the ladder is NOT evaluated)
-- ----------------------------------------------------------------------------
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('coordinator', false, pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five())),
            pg_temp.u('aa'), array['health']::hc.domain[], false),
          'manage'::hc.access_level,
          'clause 3: unresolved lineage + manage-on-all-five → manage');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false, '{}','{}','{}', pg_temp.five())),
            pg_temp.u('aa'), array['health']::hc.domain[], false),
          'hidden'::hc.access_level,
          'clause 3: log-on-all-five gets hidden, never log (AC-PERM-9)');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false, '{}', pg_temp.five(), pg_temp.five(), pg_temp.five())),
            pg_temp.u('aa'), array['health']::hc.domain[], false),
          'hidden'::hc.access_level,
          'clause 3: view-on-all-five gets hidden on unresolved lineage');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false, '{}','{}', pg_temp.five(), pg_temp.five())),
            pg_temp.u('aa'), array['health']::hc.domain[], false),
          'hidden'::hc.access_level,
          'clause 3: summary-on-all-five gets hidden on unresolved lineage');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false, '{}','{}','{}', pg_temp.five())),
            pg_temp.u('aa'), null, true),
          'hidden'::hc.access_level,
          'clause 3: NULL taint treated as unresolved even when p_resolved is true');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false, '{}','{}','{}', pg_temp.five())),
            pg_temp.u('aa'), '{}'::hc.domain[], true),
          'hidden'::hc.access_level,
          'clause 3: EMPTY taint treated as unresolved (cardinality, not array_length)');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false, '{}', pg_temp.five(), pg_temp.five(), pg_temp.five()),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['health']::hc.domain[], false,
            'task', pg_temp.u('b1')),
          'hidden'::hc.access_level,
          'clause 3 before 5: a share cannot widen an object with unresolvable lineage');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('coordinator', false, pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five()),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['health']::hc.domain[], false,
            'task', pg_temp.u('b1')),
          'manage'::hc.access_level,
          'clause 3: manage-on-all-five clears unresolved lineage regardless of the share');

-- ----------------------------------------------------------------------------
-- Clause 4 — care_circle ceiling (PRD §7.4, AC-TASK-5)
-- ----------------------------------------------------------------------------
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('care_circle', false,
                '{}', array['schedule'], array['schedule'], array['schedule'])),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'task', pg_temp.u('b1'), pg_temp.u('f2')),   -- owned by someone else
          'hidden'::hc.access_level,
          'clause 4: care_circle sees nothing not assigned or shared to them');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('care_circle', false,
                '{}', array['schedule'], array['schedule'], array['schedule'])),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'task', pg_temp.u('b1'), pg_temp.u('f1')),   -- their own member id
          'view'::hc.access_level,
          'clause 4: care_circle reads what is assigned to them, at their level');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('care_circle', false,
                '{}', array['schedule'], array['schedule'], array['schedule'])),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'task', pg_temp.u('b1'), null),
          'hidden'::hc.access_level,
          'clause 4: null owner is distinct from any member id → hidden');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('care_circle', false,
                '{}','{}','{}', array['schedule']),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'task', pg_temp.u('b1'), pg_temp.u('f2')),
          'view'::hc.access_level,
          'clause 4 → 5: a shared object passes the ceiling and widens to view');

-- ----------------------------------------------------------------------------
-- Clause 5 — an object share widens ONE named object to view, nothing else
-- ----------------------------------------------------------------------------
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false,
                '{}','{}', array['schedule'], array['schedule']),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'task', pg_temp.u('b1')),
          'view'::hc.access_level,
          'clause 5: share lifts a summary-level object to view');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('coordinator', false,
                array['schedule'], array['schedule'], array['schedule'], array['schedule']),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'task', pg_temp.u('b1')),
          'manage'::hc.access_level,
          'clause 5: greatest() — a share never lowers manage');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false,
                '{}','{}', array['schedule'], array['schedule']),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'task', pg_temp.u('b2')),
          'summary'::hc.access_level,
          'clause 5: a share on a DIFFERENT object widens nothing');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false,
                '{}','{}', array['schedule'], array['schedule']),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'document', pg_temp.u('b1')),
          'summary'::hc.access_level,
          'clause 5: shares are keyed by object type — same id, other type widens nothing');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false,
                '{}','{}', array['schedule'], array['schedule']),
              pg_temp.share_obj()),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true,
            'task', null),
          'summary'::hc.access_level,
          'clause 5: no object named (null id) → no widening');

-- ----------------------------------------------------------------------------
-- Clause 6 — the ordinary case: min over taint as set containment (§3.1)
-- ----------------------------------------------------------------------------
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false,
                '{}', array['schedule'], array['schedule'], array['schedule'])),
            pg_temp.u('aa'), array['schedule']::hc.domain[], true),
          'view'::hc.access_level,
          'clause 6: single-domain taint at view → view');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false,
                '{}', array['schedule'], array['schedule'], array['schedule'])),
            pg_temp.u('aa'), array['schedule','finances']::hc.domain[], true),
          'hidden'::hc.access_level,
          'clause 6: hidden in the taint ⇒ the object does not exist (AC-PERM-6)');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false,
                '{}', array['schedule'], array['schedule','finances'], array['schedule','finances'])),
            pg_temp.u('aa'), array['schedule','finances']::hc.domain[], true),
          'summary'::hc.access_level,
          'clause 6: min over taint — the PRD §7.6 rule as arithmetic');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('coordinator', false,
                pg_temp.five(), pg_temp.five(), pg_temp.five(), pg_temp.five())),
            pg_temp.u('aa'), enum_range(null::hc.domain), true),
          'manage'::hc.access_level,
          'clause 6: manage-on-all-five over the full taint → manage');
select is(hc.visible_at(
            pg_temp.ctx(pg_temp.u('aa'),
              pg_temp.subj('family', false, '{}','{}','{}', array['health'])),
            pg_temp.u('aa'), array['health']::hc.domain[], true),
          'log'::hc.access_level,
          'clause 6: log rung is reachable when lineage is resolved');

select * from finish();
rollback;
