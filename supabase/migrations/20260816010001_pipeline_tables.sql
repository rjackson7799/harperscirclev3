-- ============================================================================
-- 1C · M1 — the remaining §2.4 pipeline tables (arrival_events,
-- pipeline_leases, known_senders, extractions), the two fixed enumerations
-- the state machine consumes (hc.reason_codes, hc.stage_budgets), the
-- durable re-enqueue outbox (§4.2), and arrivals.current_lease_id (§4.3).
--
-- FAIL-CLOSED STAGING: RLS enabled AND forced on every public table here;
-- zero request-path privileges and zero request-path policies. The §3.4
-- read policies for arrivals/extractions/proposals land in U7 (ING-02/03).
-- hc_internal receives exactly what the 1C machinery migrations (M2–M8)
-- execute as: read/advance arrivals, append events, manage leases, publish
-- extractions, read senders, write/drain the outbox. arrival_events is
-- append-only by privilege absence (operational trail; access_log remains
-- the evidentiary one with its trigger pair).
--
-- hc.reason_codes is §2.4's "fixed enumeration — never a provider's raw
-- error string" (AC-ADMIN-6): a table, seeded here, append-by-migration
-- only. hc.stage_budgets is §4.3's stage table as data: entry state,
-- optional in-flight state (claim-time transition, ADR-0007), attempt
-- budget, lease wall clock, and the terminal state + reason exhaustion
-- lands in. Both follow the hc.log_event_types pattern (hc schema,
-- unexposed per PIN-01, revoke + narrow grant, no RLS).
-- ============================================================================

create table hc.reason_codes (
  code        text primary key,
  description text not null
);

insert into hc.reason_codes (code, description) values
  ('store_budget_exhausted',     'Store attempts spent (§4.3: 1 retry); nothing was kept'),
  ('scan_budget_exhausted',      'Scan attempts spent (§4.3: 3 retries / 30 min)'),
  ('gate_budget_exhausted',      'Sender-gate attempts spent — a defect signal, the gate is a guard'),
  ('extract_budget_exhausted',   'Extract attempts spent (§4.3: 2 retries)'),
  ('interpret_budget_exhausted', 'Interpret attempts spent (§4.3: 2 retries)'),
  ('storage_write_failed',       'The artifact could not be written to Storage'),
  ('scan_infected',              'The scanner CONFIRMED malware (never collapsed with unavailable)'),
  ('scan_provider_unavailable',  'The scanner could not be reached'),
  ('scan_inconclusive',          'The scanner returned no verdict'),
  ('sender_unknown',             'No live known_senders row matched (AC-INBOX-7)'),
  ('sender_recognised',          'A live known_senders row matched'),
  ('encrypted_pdf',              'Encrypted PDF — needs a password (§4.3 normalize)'),
  ('unsupported_mime',           'Content-sniffed type is not processable (PRD §4.2.8)'),
  ('archive_bounds_exceeded',    'Archive depth/entries/expansion over PRD §13.3 bounds'),
  ('provider_error',             'The provider call failed (detail in the operational tier only)'),
  ('provider_timeout',           'The provider call exceeded the stage wall clock'),
  ('duplicate_sha256',           'Exact content match against a non-deleted circle arrival (PRD §8.9)'),
  ('duplicate_key_fields',       'Key-field match against a filed document (PRD §8.9)'),
  ('cancelled_by_member',        'A member who can approve cancelled the arrival (§4.5)'),
  ('manual_entry',               'Synthetic arrival created with its proposal (MNL-01, ADR-0006 Q12)'),
  ('freeze_dismissed_requeue',   'Freeze dismissed — parked arrival re-enqueued via the outbox'),
  ('sweeper_requeue',            'The sweeper re-queued an arrival past its stage deadline (§4.11)'),
  ('all_proposals_rejected',     'Every proposal rejected — nothing filed, original retained (AC-INBOX-4)'),
  ('proposal_approved_filed',    'A proposal from this arrival was approved and filed');

revoke all on hc.reason_codes from anon, authenticated, hc_pipeline, hc_admin;
grant select on hc.reason_codes to hc_internal;

create table hc.stage_budgets (
  stage          text primary key,
  entry_state    hc.arrival_state not null unique,
  inflight_state hc.arrival_state,          -- claim-time transition (interpret only)
  max_attempts   int not null check (max_attempts > 0),
  lease_seconds  int not null check (lease_seconds > 0),
  exhaust_state  hc.arrival_state not null, -- §4.11: exhaustion is a terminal state
  exhaust_reason text not null references hc.reason_codes(code)
);

insert into hc.stage_budgets
  (stage, entry_state, inflight_state, max_attempts, lease_seconds, exhaust_state, exhaust_reason)
values
  ('store',     'received',   null,           2,  300, 'store_failed',     'store_budget_exhausted'),
  ('scan',      'stored',     null,           4,  600, 'scan_unavailable', 'scan_budget_exhausted'),
  ('gate',      'scanned',    null,          50,   60, 'extract_failed',   'gate_budget_exhausted'),
  ('extract',   'extracting', null,           3,  300, 'extract_failed',   'extract_budget_exhausted'),
  ('interpret', 'extracted',  'interpreting', 3,  300, 'extract_failed',   'interpret_budget_exhausted');

revoke all on hc.stage_budgets from anon, authenticated, hc_pipeline, hc_admin;
grant select on hc.stage_budgets to hc_internal;

-- ----------------------------------------------------------------------------
-- pipeline_leases (§4.3): the durable attempt counter. Created before
-- arrival_events so the fence column's FK target exists first.
-- ----------------------------------------------------------------------------
create table public.pipeline_leases (
  id          uuid primary key default gen_random_uuid(),
  arrival_id  uuid not null,
  circle_id   uuid not null references public.circles(id),
  stage       text not null references hc.stage_budgets(stage),
  attempt_no  int  not null,
  started_at  timestamptz not null default now(),
  deadline    timestamptz not null,          -- the stage's wall clock (§4.3)
  outcome     text check (outcome in ('advanced','failed','expired','cancelled','frozen')),
  closed_at   timestamptz,
  unique (arrival_id, stage, attempt_no),
  unique (circle_id, id),                    -- §2.1: circle-consistent FK target
  foreign key (circle_id, arrival_id) references public.arrivals (circle_id, id) on delete cascade
);
create index leases_open       on public.pipeline_leases (deadline) where closed_at is null;
create index leases_by_arrival on public.pipeline_leases (arrival_id);
create index leases_by_circle  on public.pipeline_leases (circle_id);

-- §4.3: "is this worker still the owner" is a single equality.
alter table public.arrivals add column current_lease_id uuid;
alter table public.arrivals
  add constraint arrivals_current_lease_fkey
  foreign key (circle_id, current_lease_id) references public.pipeline_leases (circle_id, id);
create index arrivals_by_current_lease on public.arrivals (current_lease_id);

-- ----------------------------------------------------------------------------
-- arrival_events (§2.4): append-only; every transition with a NORMALIZED
-- reason code.
-- ----------------------------------------------------------------------------
create table public.arrival_events (
  id           uuid primary key default gen_random_uuid(),
  arrival_id   uuid not null,
  circle_id    uuid not null references public.circles(id),
  from_state   hc.arrival_state,
  to_state     hc.arrival_state not null,
  reason_code  text references hc.reason_codes(code),
  attempt      int not null default 1,
  occurred_at  timestamptz not null default now(),
  foreign key (circle_id, arrival_id) references public.arrivals (circle_id, id) on delete cascade
);
create index arrival_events_by_arrival on public.arrival_events (arrival_id, occurred_at);
create index arrival_events_by_circle  on public.arrival_events (circle_id);

-- ----------------------------------------------------------------------------
-- known_senders (§2.4): the sender gate's allowlist. Accept/revoke surfaces
-- are a later slice; 1C reads it through hc.sender_recognised() only.
-- ----------------------------------------------------------------------------
create table public.known_senders (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id),
  address     extensions.citext,
  domain      extensions.citext,             -- exactly one of address / domain
  accepted_by uuid not null references public.accounts(id),
  accepted_at timestamptz not null default now(),
  revoked_at  timestamptz,
  check ((address is null) <> (domain is null))
);
create unique index known_senders_live
  on public.known_senders (circle_id, coalesce(address, domain))
  where revoked_at is null;
create index known_senders_by_circle      on public.known_senders (circle_id);
create index known_senders_by_accepted_by on public.known_senders (accepted_by);

-- ----------------------------------------------------------------------------
-- extractions (§2.4): a fact read out of an arrival. Never a record row.
-- citation_present is how PRD §6.4 becomes structural.
-- ----------------------------------------------------------------------------
create table public.extractions (
  id          uuid primary key default gen_random_uuid(),
  arrival_id  uuid not null,
  circle_id   uuid not null references public.circles(id),
  subject_id  uuid not null,
  field       text not null,
  value       jsonb not null,
  confidence  numeric(4,3) not null check (confidence between 0 and 1),
  risk_class  hc.risk_class not null,       -- PRD §6.4's list; set by field, not by confidence
  citation    jsonb not null,               -- {page, bbox:[x,y,w,h] normalised} | {offset,len} | {t}
  model_id    text not null,
  prompt_version text not null,
  created_at  timestamptz not null default now(),
  constraint citation_present check (citation ? 'page' or citation ? 'offset' or citation ? 't'),
  foreign key (circle_id, arrival_id) references public.arrivals (circle_id, id) on delete cascade,
  foreign key (circle_id, subject_id) references public.subjects (circle_id, id)
);
create index extractions_by_arrival on public.extractions (arrival_id);
create index extractions_scope      on public.extractions (circle_id, subject_id);

-- ----------------------------------------------------------------------------
-- pipeline_outbox (§4.2): "dismissed writes rows to an outbox table in the
-- same transaction that clears the freeze". A queue API call cannot join
-- the adjudication transaction; this can. Drained by hc.outbox_drain (M8).
-- ----------------------------------------------------------------------------
create table public.pipeline_outbox (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id),
  arrival_id  uuid not null,
  reason_code text not null references hc.reason_codes(code),
  created_at  timestamptz not null default now(),
  drained_at  timestamptz,
  foreign key (circle_id, arrival_id) references public.arrivals (circle_id, id) on delete cascade
);
create index outbox_undrained  on public.pipeline_outbox (created_at) where drained_at is null;
create index outbox_by_arrival on public.pipeline_outbox (arrival_id);
create index outbox_by_circle  on public.pipeline_outbox (circle_id);

-- ----------------------------------------------------------------------------
-- RLS: enabled AND forced in the creating migration, no exceptions (§2.1).
-- ----------------------------------------------------------------------------
alter table public.pipeline_leases enable row level security;
alter table public.pipeline_leases force  row level security;
alter table public.arrival_events  enable row level security;
alter table public.arrival_events  force  row level security;
alter table public.known_senders   enable row level security;
alter table public.known_senders   force  row level security;
alter table public.extractions     enable row level security;
alter table public.extractions     force  row level security;
alter table public.pipeline_outbox enable row level security;
alter table public.pipeline_outbox force  row level security;

-- ----------------------------------------------------------------------------
-- Privileges: the model wants the privilege ABSENT, not merely unmatched by
-- a policy (§3.7). Request-path roles hold nothing on any table here.
-- hc_internal holds exactly what the M2–M8 machinery executes: DELETE is
-- granted to nobody anywhere; arrival_events has no UPDATE path at all.
-- ----------------------------------------------------------------------------
revoke all on public.pipeline_leases, public.arrival_events, public.known_senders,
              public.extractions, public.pipeline_outbox
  from anon, authenticated, hc_pipeline, hc_admin;

grant select, insert, update on public.arrivals        to hc_internal;
grant select, insert         on public.arrival_events  to hc_internal;
grant select, insert, update on public.pipeline_leases to hc_internal;
grant select, insert         on public.extractions     to hc_internal;
grant select                 on public.known_senders   to hc_internal;
grant select, insert, update on public.pipeline_outbox to hc_internal;

create policy arrivals_internal on public.arrivals
  for select to hc_internal using (true);
create policy arrivals_internal_intake on public.arrivals
  for insert to hc_internal with check (true);
create policy arrivals_internal_advance on public.arrivals
  for update to hc_internal using (true) with check (true);
create policy arrival_events_internal on public.arrival_events
  for select to hc_internal using (true);
create policy arrival_events_internal_append on public.arrival_events
  for insert to hc_internal with check (true);
create policy pipeline_leases_internal on public.pipeline_leases
  for select to hc_internal using (true);
create policy pipeline_leases_internal_claim on public.pipeline_leases
  for insert to hc_internal with check (true);
create policy pipeline_leases_internal_close on public.pipeline_leases
  for update to hc_internal using (true) with check (true);
create policy extractions_internal on public.extractions
  for select to hc_internal using (true);
create policy extractions_internal_write on public.extractions
  for insert to hc_internal with check (true);
create policy known_senders_internal on public.known_senders
  for select to hc_internal using (true);
create policy pipeline_outbox_internal on public.pipeline_outbox
  for select to hc_internal using (true);
create policy pipeline_outbox_internal_enqueue on public.pipeline_outbox
  for insert to hc_internal with check (true);
create policy pipeline_outbox_internal_drain on public.pipeline_outbox
  for update to hc_internal using (true) with check (true);
