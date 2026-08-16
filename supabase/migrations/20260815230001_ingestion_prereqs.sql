-- ============================================================================
-- 1B · M1 — the four §2.4 tables the record kernel cannot exist without,
-- pulled forward by ADR-0005 D1: arrivals, proposals, approval_attempts,
-- proposal_commits. Full §2.4 DDL — no placeholder shapes — plus the §2.1
-- conventions 1A applied everywhere (circle-consistent composite FKs,
-- unique (circle_id, id), every FK indexed).
--
-- FAIL-CLOSED STAGING: RLS enabled AND forced here; zero request-path
-- privileges and zero request-path policies. Their §3.4 read policies and
-- the pipeline state machine land in 1C (pending coverage rows). In 1B the
-- only writers are pgTAP fixtures (postgres) and hc.approve_proposal()
-- (proposals' decision columns, approval_attempts, proposal_commits — M6).
-- arrivals carries NO grant to any of our five roles at all: 1B reads it
-- only through FK validation, which bypasses RLS by design (PG RI checks).
-- ============================================================================

create table public.arrivals (
  id             uuid primary key default gen_random_uuid(),
  circle_id      uuid not null references public.circles(id),
  subject_id     uuid not null,
  parent_arrival_id uuid,                    -- multi-attachment (PRD §4.2.6)
  channel        text not null check (channel in ('upload','email')),  -- 'sms' is an enum value away
  state          hc.arrival_state not null default 'received',
  received_at    timestamptz not null default now(),

  -- the original artifact.  Content-addressed, write-once.
  storage_key    text,                     -- null only while state = 'received'/'store_failed'
  content_sha256 bytea,
  mime_declared  text,
  mime_detected  text,                     -- from content, never from extension (PRD §4.2.8)
  byte_size      bigint,
  page_count     int,

  -- email provenance
  sender_address extensions.citext,
  sender_display_name text,                -- stored, never matched on (PRD §4.2.8)
  message_id     text,
  auth_result    text check (auth_result in ('authenticated','unauthenticated','lookalike')),
  auth_detail    jsonb,                    -- dmarc/spf/dkim/arc verdicts, verbatim

  scan_verdict   text check (scan_verdict in ('clean','infected','unavailable','inconclusive')),
  scan_at        timestamptz,
  cancelled_by   uuid references public.accounts(id),
  cancelled_at   timestamptz,
  ingest_idempotency_key text,
  deleted_at     timestamptz,
  purge_at       timestamptz,
  expires_at     timestamptz,              -- 30 d for unaccepted stranger mail (PRD §4.2.8)
  unique (circle_id, ingest_idempotency_key),
  unique (circle_id, id),                  -- §2.1: circle-consistent FK target
  foreign key (circle_id, subject_id)        references public.subjects (circle_id, id),
  foreign key (circle_id, parent_arrival_id) references public.arrivals (circle_id, id)
);
create index arrivals_inbox  on public.arrivals (circle_id, subject_id, received_at desc);
create index arrivals_parent on public.arrivals (parent_arrival_id);
create index arrivals_dupe   on public.arrivals (circle_id, content_sha256);  -- PRD §8.9
create index arrivals_by_cancelled_by on public.arrivals (cancelled_by);

-- The unit of approval AND the transaction boundary (PRD §4.2.9).
create table public.proposals (
  id            uuid primary key default gen_random_uuid(),
  arrival_id    uuid not null,
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid not null,
  kind          hc.proposal_kind not null,
  version       int not null default 1,
  supersedes_id uuid,
  payload       jsonb not null,                   -- the drafted object, pre-write
  source_extraction_ids uuid[] not null default '{}',
  taint         hc.domain[] not null,
  taint_resolved boolean not null default true,
  status        text not null default 'pending'
                check (status in ('pending','approved','edited_approved',
                                  'rejected','superseded','void')),
  decided_by    uuid references public.accounts(id),
  decided_at    timestamptz,
  reject_reason text check (reject_reason in ('wrong','already_handled','not_important','other')),
  anomaly_flags text[] not null default '{}',     -- prompt-injection shapes (PRD §4.2.8)
  created_at    timestamptz not null default now(),
  -- A human decision has a human actor.  'superseded' and 'void' are pipeline
  -- outcomes and correctly have no decider — which is why this is not
  -- "status <> 'pending' implies decided_at is not null".
  check ((status in ('approved','edited_approved','rejected')) = (decided_by is not null)),
  check ((decided_by is null) = (decided_at is null)),
  check ((reject_reason is null) or status = 'rejected'),
  unique (circle_id, id),                  -- §2.1: circle-consistent FK target
  foreign key (circle_id, arrival_id)    references public.arrivals  (circle_id, id) on delete cascade,
  foreign key (circle_id, subject_id)    references public.subjects  (circle_id, id),
  foreign key (circle_id, supersedes_id) references public.proposals (circle_id, id)
);
create unique index proposals_one_live
  on public.proposals (arrival_id, kind, coalesce(supersedes_id, id))
  where status = 'pending';
create index proposals_scope         on public.proposals (circle_id, subject_id);
create index proposals_by_arrival    on public.proposals (arrival_id);
create index proposals_by_supersedes on public.proposals (supersedes_id);
create index proposals_by_decided_by on public.proposals (decided_by);

-- Idempotency for approval.  A double-click, a retried request and a
-- re-delivered job all present the same key; exactly one row survives and the
-- winner's result is replayed to the losers (AC-INBOX-12, the hard half).
-- No circle_id by §2.4 design — keyed on the proposal, outside the INV-05
-- sweep by construction.
create table public.approval_attempts (
  idempotency_key text primary key,
  proposal_id     uuid not null references public.proposals(id),
  expected_version int not null,
  actor_id        uuid not null references public.accounts(id),
  result          jsonb,
  committed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index approval_attempts_by_proposal on public.approval_attempts (proposal_id);
create index approval_attempts_by_actor    on public.approval_attempts (actor_id);

-- ONE approved proposal writes AT MOST ONE record object, and one record
-- object is backed by AT MOST ONE approved proposal — as a table, not an API
-- shape (AC-INBOX-3, PRD §6.2, §4.2.9).
create table public.proposal_commits (
  proposal_id uuid primary key,
  circle_id   uuid not null references public.circles(id),
  object_type hc.object_type not null,
  object_id   uuid not null,
  committed_at timestamptz not null default now(),
  unique (object_type, object_id),
  foreign key (circle_id, proposal_id) references public.proposals (circle_id, id)
);
create index proposal_commits_by_circle on public.proposal_commits (circle_id);

-- ----------------------------------------------------------------------------
-- RLS: enabled AND forced in the creating migration, no exceptions (§2.1).
-- ----------------------------------------------------------------------------
alter table public.arrivals          enable row level security;
alter table public.arrivals          force  row level security;
alter table public.proposals         enable row level security;
alter table public.proposals         force  row level security;
alter table public.approval_attempts enable row level security;
alter table public.approval_attempts force  row level security;
alter table public.proposal_commits  enable row level security;
alter table public.proposal_commits  force  row level security;

-- ----------------------------------------------------------------------------
-- Privileges: the model wants the privilege ABSENT, not merely unmatched by
-- a policy (§3.7). Request-path roles hold nothing on any of the four until
-- 1C lands the §3.4 read policies. hc_internal holds exactly what M6's
-- hc.approve_proposal() needs — and nothing on arrivals at all.
-- ----------------------------------------------------------------------------
revoke all on public.arrivals, public.proposals,
              public.approval_attempts, public.proposal_commits
  from anon, authenticated, hc_pipeline, hc_admin;

grant select, update         on public.proposals         to hc_internal;
grant select, insert, update on public.approval_attempts to hc_internal;
grant select, insert         on public.proposal_commits  to hc_internal;

create policy proposals_internal on public.proposals
  for select to hc_internal using (true);
create policy proposals_internal_decide on public.proposals
  for update to hc_internal using (true) with check (true);
create policy approval_attempts_internal on public.approval_attempts
  for select to hc_internal using (true);
create policy approval_attempts_internal_write on public.approval_attempts
  for insert to hc_internal with check (true);
create policy approval_attempts_internal_update on public.approval_attempts
  for update to hc_internal using (true) with check (true);
create policy proposal_commits_internal on public.proposal_commits
  for select to hc_internal using (true);
create policy proposal_commits_internal_claim on public.proposal_commits
  for insert to hc_internal with check (true);
