-- ============================================================================
-- 1B · M2 — the record (TSD §2.5, §2.7): episodes, documents,
-- document_search_content, tasks, timeline_events, profile_facts, with the
-- shared tenancy/provenance/taint/search block repeated per table (never
-- inherited — inheritance and RLS interact badly, §2.5).
--
-- §2.1 conventions applied throughout, as 1A did where §2.5's illustrative
-- DDL shows the bare form: every FK between circle-scoped tables is a
-- circle-consistent composite; every such table carries unique (circle_id,
-- id); every FK is indexed (§3.12 — lock escalation, not only queries).
--
-- Read policies land HERE (§3.4 two-clause shape): everything they call —
-- hc.ctx(), hc.visible_at() — exists since 1A. Write privilege exists for
-- NOBODY yet: hc_internal's INSERT/UPDATE and the §3.7 write policies land
-- with hc.approve_proposal() (M6), so between M2 and M6 the record is
-- readable and unwritable — the fail-closed boundary state.
--
-- document_search_content is the exception in BOTH directions: zero grants
-- for every role including hc_internal until 1D lands the search writer and
-- its view-level read policy. View-only text on a summary-readable row is
-- the exact §3.4 boundary; until the reader exists the table is dark.
-- ============================================================================

-- Order: episodes first (timeline_events FKs it), documents before dsc.

create table public.episodes (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid not null,
  title         text not null,
  -- shared provenance / taint / search / delete block (§2.5)
  source_arrival_id  uuid,
  source_proposal_id uuid,
  approved_by   uuid not null references public.accounts(id),
  approved_at   timestamptz not null,
  approver_display_name text not null,
  taint         hc.domain[] not null,
  taint_resolved boolean not null default true,
  tsv           tsvector,
  deleted_at    timestamptz,
  purge_at      timestamptz,
  unique (circle_id, id),
  foreign key (circle_id, subject_id)         references public.subjects  (circle_id, id),
  foreign key (circle_id, source_arrival_id)  references public.arrivals  (circle_id, id),
  foreign key (circle_id, source_proposal_id) references public.proposals (circle_id, id)
);
create index episodes_scope on public.episodes (circle_id, subject_id) where deleted_at is null;
create index episodes_by_source_arrival  on public.episodes (source_arrival_id);
create index episodes_by_source_proposal on public.episodes (source_proposal_id);
create index episodes_by_approved_by     on public.episodes (approved_by);

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid not null,
  title         text not null,                    -- CONTENT, not metadata (PRD §7.6)
  category      hc.doc_category not null,
  summary_text  text,                             -- ≤3 sentences, plain language
  artifact_arrival_id uuid not null,
  filed_at      timestamptz not null,
  source_arrival_id uuid,
  source_proposal_id uuid,
  approved_by   uuid not null references public.accounts(id),
  approved_at   timestamptz not null,
  approver_display_name text not null,
  taint         hc.domain[] not null,
  taint_resolved boolean not null default true,
  tsv_summary   tsvector,          -- title + summary_text ONLY (§2.5)
  deleted_at    timestamptz,
  purge_at      timestamptz,
  unique (circle_id, id),                -- §2.1: circle-consistent FK target
  unique (circle_id, subject_id, id),    -- subject-consistent target (dsc)
  foreign key (circle_id, subject_id)          references public.subjects  (circle_id, id),
  foreign key (circle_id, artifact_arrival_id) references public.arrivals  (circle_id, id),
  foreign key (circle_id, source_arrival_id)   references public.arrivals  (circle_id, id),
  foreign key (circle_id, source_proposal_id)  references public.proposals (circle_id, id)
);
create index documents_scope on public.documents (circle_id, subject_id) where deleted_at is null;
create index documents_tsv_summary on public.documents using gin (tsv_summary);
create index documents_by_artifact_arrival on public.documents (artifact_arrival_id);
create index documents_by_source_arrival   on public.documents (source_arrival_id);
create index documents_by_source_proposal  on public.documents (source_proposal_id);
create index documents_by_approved_by      on public.documents (approved_by);

-- View-level searchable text lives in its own table, NOT in columns on
-- documents (§2.5): putting extracted or OCR text on a summary-readable row
-- would make view-only content selectable at `summary`.
create table public.document_search_content (
  document_id    uuid primary key,
  circle_id      uuid not null references public.circles(id),
  subject_id     uuid not null,
  extracted_text text,             -- concatenated approved extraction values
  ocr_text       text,             -- machine-read, never a fact (§6.9)
  tsv_full       tsvector,         -- tsv_summary ∪ the two columns above
  search_text_full text,           -- EXACTLY the text tsv_full was built from
  -- circle AND subject consistent: a two-column FK would let this row claim
  -- a different subject than the document it describes (§2.5). The §2.5
  -- illustration shows a second single-column FK carrying the cascade; the
  -- §2.1 sweep (001:37) forbids a circle-blind FK between circle-scoped
  -- tables, so the ONE composite carries the cascade — same net semantics,
  -- one constraint (1A precedent: convention over illustrative DDL).
  foreign key (circle_id, subject_id, document_id)
    references public.documents (circle_id, subject_id, id) on delete cascade
);
create index dsc_tsv_full on public.document_search_content using gin (tsv_full);
create index dsc_scope on public.document_search_content (circle_id, subject_id);
-- No index on taint anywhere in this migration: GIN serves `<@` poorly and
-- the taint test is in-memory arithmetic after the circle/subject btree has
-- narrowed the scan (§2.5).

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid not null,
  title         text not null,
  detail        text,
  due_on        date,                              -- DATE-ONLY (§2.7). Never a timestamp.
  due_zone      text,                              -- the subject's IANA zone at write time
  owner_member_id uuid,
  assigned_by   uuid references public.accounts(id),
  assigned_at   timestamptz,
  status        text not null default 'open' check (status in ('open','done','cancelled')),
  completed_by  uuid references public.accounts(id),
  completed_at  timestamptz,
  snooze_count  int not null default 0,
  written_for_member_id uuid,                     -- PRD §4.5.6 path 1
  source_arrival_id uuid,
  source_proposal_id uuid,
  approved_by   uuid not null references public.accounts(id),
  approved_at   timestamptz not null,
  approver_display_name text not null,
  taint         hc.domain[] not null,
  taint_resolved boolean not null default true,
  tsv           tsvector,
  deleted_at    timestamptz,
  purge_at      timestamptz,
  check ((due_on is null) = (due_zone is null)),
  unique (circle_id, id),
  -- A task's owner must be a member of the task's OWN circle (§2.5).
  foreign key (circle_id, subject_id)            references public.subjects (circle_id, id),
  foreign key (circle_id, owner_member_id)       references public.circle_members (circle_id, id),
  foreign key (circle_id, written_for_member_id) references public.circle_members (circle_id, id),
  foreign key (circle_id, source_arrival_id)     references public.arrivals  (circle_id, id),
  foreign key (circle_id, source_proposal_id)    references public.proposals (circle_id, id)
);
create index tasks_scope on public.tasks (circle_id, subject_id) where deleted_at is null;
create index tasks_owner on public.tasks (owner_member_id) where status = 'open';
create index tasks_by_written_for     on public.tasks (written_for_member_id);
create index tasks_by_assigned_by     on public.tasks (assigned_by);
create index tasks_by_completed_by    on public.tasks (completed_by);
create index tasks_by_source_arrival  on public.tasks (source_arrival_id);
create index tasks_by_source_proposal on public.tasks (source_proposal_id);
create index tasks_by_approved_by     on public.tasks (approved_by);

create table public.timeline_events (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid not null references public.circles(id),
  subject_id   uuid not null,
  kind         hc.timeline_kind not null,
  summary      text not null,
  episode_id   uuid,                               -- episodes is created first

  -- one of the three temporal shapes (§2.7)
  occurred_on  date,
  occurred_zone text,
  local_at     timestamp,
  iana_zone    text,
  instant      timestamptz,
  is_floating  boolean not null default false,

  source_arrival_id uuid,
  source_proposal_id uuid,
  approved_by  uuid not null references public.accounts(id),
  approved_at  timestamptz not null,
  approver_display_name text not null,
  taint        hc.domain[] not null,
  taint_resolved boolean not null default true,
  tsv          tsvector,
  deleted_at   timestamptz,
  purge_at     timestamptz,
  -- §2.7 verbatim: conflating the three kinds is how an appointment moves
  -- an hour in November.
  constraint temporal_shape check (
       (occurred_on is not null and local_at is null and not is_floating)
    or (local_at is not null and iana_zone is not null and instant is not null and not is_floating)
    or (local_at is not null and iana_zone is null and is_floating)),
  unique (circle_id, id),
  foreign key (circle_id, subject_id)         references public.subjects  (circle_id, id),
  foreign key (circle_id, episode_id)         references public.episodes  (circle_id, id),
  foreign key (circle_id, source_arrival_id)  references public.arrivals  (circle_id, id),
  foreign key (circle_id, source_proposal_id) references public.proposals (circle_id, id)
);
create index timeline_events_scope on public.timeline_events (circle_id, subject_id)
  where deleted_at is null;
create index timeline_events_by_episode         on public.timeline_events (episode_id);
create index timeline_events_by_source_arrival  on public.timeline_events (source_arrival_id);
create index timeline_events_by_source_proposal on public.timeline_events (source_proposal_id);
create index timeline_events_by_approved_by     on public.timeline_events (approved_by);

create table public.profile_facts (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid not null references public.circles(id),
  subject_id   uuid not null,
  field        text not null,
  value        jsonb not null,
  risk_class   hc.risk_class not null,
  supersedes_id uuid,
  superseded_at timestamptz,
  superseded_by_id uuid,
  source_arrival_id uuid,
  source_proposal_id uuid,
  approved_by  uuid not null references public.accounts(id),
  approved_at  timestamptz not null,
  approver_display_name text not null,
  taint        hc.domain[] not null,
  taint_resolved boolean not null default true,
  tsv          tsvector,
  deleted_at   timestamptz,
  purge_at     timestamptz,
  unique (circle_id, id),
  foreign key (circle_id, subject_id)         references public.subjects (circle_id, id),
  foreign key (circle_id, supersedes_id)      references public.profile_facts (circle_id, id),
  foreign key (circle_id, superseded_by_id)   references public.profile_facts (circle_id, id),
  foreign key (circle_id, source_arrival_id)  references public.arrivals  (circle_id, id),
  foreign key (circle_id, source_proposal_id) references public.proposals (circle_id, id)
);
-- Why silent overwrite has no code path (PRD §4.2.5, AC-INBOX-6): a new
-- current value requires superseding the old row in the same transaction.
create unique index profile_facts_current
  on public.profile_facts (subject_id, field) where superseded_at is null;
create index profile_facts_scope on public.profile_facts (circle_id, subject_id)
  where deleted_at is null;
create index profile_facts_by_supersedes      on public.profile_facts (supersedes_id);
create index profile_facts_by_superseded_by   on public.profile_facts (superseded_by_id);
create index profile_facts_by_source_arrival  on public.profile_facts (source_arrival_id);
create index profile_facts_by_source_proposal on public.profile_facts (source_proposal_id);
create index profile_facts_by_approved_by     on public.profile_facts (approved_by);

-- ----------------------------------------------------------------------------
-- RLS: enabled AND forced in the creating migration, no exceptions (§2.1).
-- ----------------------------------------------------------------------------
alter table public.episodes                enable row level security;
alter table public.episodes                force  row level security;
alter table public.documents               enable row level security;
alter table public.documents               force  row level security;
alter table public.document_search_content enable row level security;
alter table public.document_search_content force  row level security;
alter table public.tasks                   enable row level security;
alter table public.tasks                   force  row level security;
alter table public.timeline_events         enable row level security;
alter table public.timeline_events         force  row level security;
alter table public.profile_facts           enable row level security;
alter table public.profile_facts           force  row level security;

-- ----------------------------------------------------------------------------
-- Privileges. Request-path roles: SELECT only where a read policy exists
-- below; nothing on dsc for ANY role (1D stages both directions).
-- hc_internal: SELECT only — its write privilege arrives with the writer
-- (M6), so no privilege exists today that no function needs today.
-- ----------------------------------------------------------------------------
revoke all on public.episodes, public.documents, public.document_search_content,
              public.tasks, public.timeline_events, public.profile_facts
  from anon, authenticated, hc_pipeline, hc_admin;

grant select on public.episodes, public.documents, public.tasks,
                public.timeline_events, public.profile_facts
  to authenticated;

grant select on public.episodes, public.documents, public.tasks,
                public.timeline_events, public.profile_facts
  to hc_internal;

create policy episodes_internal on public.episodes
  for select to hc_internal using (true);
create policy documents_internal on public.documents
  for select to hc_internal using (true);
create policy tasks_internal on public.tasks
  for select to hc_internal using (true);
create policy timeline_events_internal on public.timeline_events
  for select to hc_internal using (true);
create policy profile_facts_internal on public.profile_facts
  for select to hc_internal using (true);

-- ----------------------------------------------------------------------------
-- §3.4 read policies: the two-clause shape — indexed pre-filter, then the
-- one visibility function. summary-level tables pass owner_member_id only
-- where the column exists (tasks — the care_circle ceiling's anchor).
-- profile_facts requires `view` (§3.4 level→table map).
-- ----------------------------------------------------------------------------
create policy episodes_select on public.episodes
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and deleted_at is null
  and hc.visible_at((select hc.ctx()), subject_id, taint, taint_resolved,
                    'episode', id, null) >= 'summary'
);

create policy documents_select on public.documents
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and deleted_at is null
  and hc.visible_at((select hc.ctx()), subject_id, taint, taint_resolved,
                    'document', id, null) >= 'summary'
);

create policy tasks_select on public.tasks
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and deleted_at is null
  and hc.visible_at((select hc.ctx()), subject_id, taint, taint_resolved,
                    'task', id, owner_member_id) >= 'summary'
);

create policy timeline_events_select on public.timeline_events
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and deleted_at is null
  and hc.visible_at((select hc.ctx()), subject_id, taint, taint_resolved,
                    'timeline_event', id, null) >= 'summary'
);

create policy profile_facts_select on public.profile_facts
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)
  and deleted_at is null
  and hc.visible_at((select hc.ctx()), subject_id, taint, taint_resolved,
                    'profile_fact', id, null) >= 'view'
);
