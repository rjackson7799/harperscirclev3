-- ============================================================================
-- 1A · M5 — freezes + freeze_claims, exactly as TSD §2.3 now reads
-- (ADR-0001 as amended by ADR-0003 findings 1–3).
--
-- Two tables, deliberately: a claim is not a freeze. freeze_claims is the
-- immutable intake ledger — every report that reaches the service gets a
-- row and a disposition, including rate-limited ones — and freezes is the
-- single active enforcement state per circle.
--
-- RED STATE (deliberate, TSD §3.13 discipline): the three declarative
-- constraints from ADR-0003 findings 2 and 3 are OMITTED in this commit —
-- freezes_open_is_whole_circle, freezes_outcome_is_adjudicated,
-- freezes_narrowing_is_assessed. The 007 suite must show the pre-review
-- hazard live (a narrowed open freeze accepted; a finding without
-- adjudication metadata accepted; narrowing without a recorded assessment
-- accepted) before the constraints land.
--
-- No request-path role holds ANY privilege on either table (§2.3): claims
-- carry claimant PII, and mutation of freezes is exclusive to
-- hc.request_freeze() / hc.adjudicate_freeze() (M8).
-- ============================================================================

create table public.freezes (
  id             uuid primary key default gen_random_uuid(),
  circle_id      uuid not null references public.circles(id),
  subject_id     uuid,
  requested_at   timestamptz not null default now(),
  state          text not null default 'open'
                 check (state in ('open','dismissed','upheld','unresolved')),
  contact_attempted_at timestamptz,
  adjudicated_at timestamptz,
  adjudicated_by text,
  outcome_note   text,
  narrowing_rationale text,   -- the recorded cross-subject exposure assessment
  foreign key (circle_id, subject_id) references public.subjects (circle_id, id),
  unique (circle_id, id)
);
-- One ACTIVE freeze per circle.  Claims are not bounded by this — they
-- attach.  This index is the "a record cannot be re-frozen while one
-- adjudication is open" half of PRD §7.5.
create unique index freezes_one_open_per_circle
  on public.freezes (circle_id)
  where state = 'open';
create index freezes_by_subject on public.freezes (subject_id);

-- The immutable intake ledger.  hc.request_freeze() writes exactly one row
-- per report and disposes it; rows are never updated or deleted.  Claimant
-- identity for rate limiting keys on claimant_contact.
create table public.freeze_claims (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  freeze_id     uuid,
  claimant_contact text not null,
  claimant_relationship text,
  reason        text not null,
  received_at   timestamptz not null default now(),
  disposition   text not null check (disposition in
                  ('opened_freeze','attached_to_existing','rate_limited')),
  -- A rate-limited claim attaches to nothing; every accepted claim attaches
  -- to the freeze it opened or joined.
  check ((disposition = 'rate_limited') = (freeze_id is null)),
  foreign key (circle_id, freeze_id) references public.freezes (circle_id, id)
);
create index freeze_claims_by_circle   on public.freeze_claims (circle_id, received_at);
create index freeze_claims_by_claimant on public.freeze_claims (claimant_contact, received_at);
create index freeze_claims_by_freeze   on public.freeze_claims (freeze_id);

alter table public.freezes       enable row level security;
alter table public.freezes       force  row level security;
alter table public.freeze_claims enable row level security;
alter table public.freeze_claims force  row level security;

-- No request-path role holds any privilege on either table. Every entry
-- point is a definer function; the family learns of a freeze through the
-- ctx 'frozen' flag and the access log, never by reading these rows.
revoke all on public.freezes, public.freeze_claims
  from anon, authenticated, hc_pipeline, hc_admin;

-- hc_internal: grant_vectors reads freezes; request/adjudicate write them.
-- The claims ledger is APPEND-ONLY even for hc_internal: select + insert,
-- never update, never delete. freezes: never delete.
grant select, insert, update on public.freezes       to hc_internal;
grant select, insert         on public.freeze_claims to hc_internal;

create policy freezes_internal on public.freezes
  for select to hc_internal using (true);
create policy freezes_internal_write on public.freezes
  for insert to hc_internal with check (true);
create policy freezes_internal_adjudicate on public.freezes
  for update to hc_internal using (true) with check (true);
create policy freeze_claims_internal on public.freeze_claims
  for select to hc_internal using (true);
create policy freeze_claims_internal_write on public.freeze_claims
  for insert to hc_internal with check (true);
