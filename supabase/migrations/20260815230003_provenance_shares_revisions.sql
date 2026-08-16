-- ============================================================================
-- 1B · M3 — record_revisions (§2.5, N2's second half), object_shares (§2.5,
-- the one exception to domain-keyed access — and the one that never
-- propagates), provenance_edges (§2.6, the graph taint is materialised
-- over).
--
-- FAIL-CLOSED: zero request-path privileges on all three. Members reach
-- shares only through ctx (M8); revisions and edges have no family-facing
-- surface in 1B. hc_internal's bounds are exact and asymmetric — revisions
-- append-only, shares revoke-only (never deleted), edges link/unlink (an
-- edge is never UPDATEd; relink is delete-then-insert in one transaction,
-- §2.6).
-- ============================================================================

create table public.record_revisions (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id),
  object_type hc.object_type not null,
  object_id   uuid not null,
  revision_no int not null,
  changed_by  uuid not null references public.accounts(id),
  changer_display_name text not null,
  changed_at  timestamptz not null default now(),
  before      jsonb not null,
  after       jsonb not null,
  unique (object_type, object_id, revision_no)
);
create index record_revisions_by_circle     on public.record_revisions (circle_id);
create index record_revisions_by_changed_by on public.record_revisions (changed_by);

create table public.object_shares (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id),
  subject_id  uuid not null,                                 -- the shared object's subject
  object_type hc.object_type not null,
  object_id   uuid not null,                                 -- polymorphic: no FK possible
  member_id   uuid not null,
  granted_by  uuid not null references public.accounts(id),
  granted_at  timestamptz not null default now(),
  created_by_assignment_of uuid,                             -- PRD §4.5.6: unassign revokes
  revoked_at  timestamptz,
  foreign key (circle_id, subject_id) references public.subjects (circle_id, id),
  foreign key (circle_id, member_id) references public.circle_members (circle_id, id)
    on delete cascade,
  foreign key (circle_id, created_by_assignment_of) references public.tasks (circle_id, id)
);
create unique index object_shares_live
  on public.object_shares (object_type, object_id, member_id)
  where revoked_at is null;
create index object_shares_by_member on public.object_shares (member_id) where revoked_at is null;
create index object_shares_by_subject    on public.object_shares (circle_id, subject_id);
create index object_shares_by_assignment on public.object_shares (created_by_assignment_of);
create index object_shares_by_granted_by on public.object_shares (granted_by);

-- No cascade column and no propagation trigger, BY DESIGN (§2.5): a share
-- names one object and one person; derivations are provenance_edges rows
-- with their own taint and are not reached by this table (AC-PERM-10).

create table public.provenance_edges (
  circle_id   uuid not null references public.circles(id),
  child_type  hc.object_type not null,
  child_id    uuid not null,
  parent_type hc.object_type not null,
  parent_id   uuid not null,
  created_at  timestamptz not null default now(),
  primary key (child_type, child_id, parent_type, parent_id)
);
create index provenance_down on public.provenance_edges (parent_type, parent_id);
create index provenance_by_circle on public.provenance_edges (circle_id);

-- ----------------------------------------------------------------------------
-- RLS: enabled AND forced in the creating migration, no exceptions (§2.1).
-- ----------------------------------------------------------------------------
alter table public.record_revisions enable row level security;
alter table public.record_revisions force  row level security;
alter table public.object_shares    enable row level security;
alter table public.object_shares    force  row level security;
alter table public.provenance_edges enable row level security;
alter table public.provenance_edges force  row level security;

revoke all on public.record_revisions, public.object_shares, public.provenance_edges
  from anon, authenticated, hc_pipeline, hc_admin;

grant select, insert         on public.record_revisions to hc_internal;
grant select, insert, update on public.object_shares    to hc_internal;
grant select, insert, delete on public.provenance_edges to hc_internal;

create policy record_revisions_internal on public.record_revisions
  for select to hc_internal using (true);
create policy record_revisions_internal_append on public.record_revisions
  for insert to hc_internal with check (true);
create policy object_shares_internal on public.object_shares
  for select to hc_internal using (true);
create policy object_shares_internal_create on public.object_shares
  for insert to hc_internal with check (true);
create policy object_shares_internal_revoke on public.object_shares
  for update to hc_internal using (true) with check (true);
create policy provenance_edges_internal on public.provenance_edges
  for select to hc_internal using (true);
create policy provenance_edges_internal_link on public.provenance_edges
  for insert to hc_internal with check (true);
create policy provenance_edges_internal_unlink on public.provenance_edges
  for delete to hc_internal using (true);
