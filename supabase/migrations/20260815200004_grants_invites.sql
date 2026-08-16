-- ============================================================================
-- 1A · M4 — access_grants and invites.
--
-- TSD §2.3. The grant is the unit of access (PRD §7.1): no circle-wide
-- level exists, by construction — there is no table in which one could be
-- written. Circle-consistent composite FKs per §2.1 (the §2.3 illustrative
-- DDL shows the bare form; the convention governs).
--
-- Boundary: RLS enabled AND forced here; access_grants' own-rows read
-- policy needs hc.ctx() and lands in M7 (intentionally inaccessible until
-- then). invites carries NO request-path policy or privilege at all in 1A —
-- tokens and invitee PII are reachable only through the acceptance path
-- that the auth slice builds (§2.3, §5.10).
-- ============================================================================

create table public.access_grants (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id),
  member_id   uuid not null,
  subject_id  uuid not null,
  domain      hc.domain not null,
  level       hc.access_level not null,
  granted_by  uuid not null references public.accounts(id),
  granted_at  timestamptz not null default now(),
  foreign key (circle_id, member_id)
    references public.circle_members (circle_id, id) on delete cascade,
  foreign key (circle_id, subject_id)
    references public.subjects (circle_id, id),
  unique (member_id, subject_id, domain),
  unique (circle_id, id)                       -- circle-consistent FK target (§2.1)
);
create index access_grants_lookup     on public.access_grants (member_id, subject_id);
create index access_grants_by_subject on public.access_grants (subject_id);
create index access_grants_by_granter on public.access_grants (granted_by);

create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid not null references public.circles(id),
  token_hash   bytea not null unique,            -- sha256(token). The token is never stored.
  invited_email extensions.citext not null,
  tier         hc.tier not null,
  subject_ids  uuid[] not null,
  note         text,
  invited_by   uuid not null references public.accounts(id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,             -- created_at + 7 days
  accepted_at  timestamptz,
  accepted_by  uuid references public.accounts(id),
  revoked_at   timestamptz,
  check (expires_at > created_at)
);
-- Single use: acceptance is an UPDATE ... WHERE accepted_at IS NULL inside the
-- same transaction that inserts the membership. A replayed token updates zero
-- rows and the transaction aborts, creating nothing. (AC-PERM-4, PRD §8.5 —
-- the acceptance path itself is the auth slice; coverage.md carries it pending.)
create index invites_by_circle   on public.invites (circle_id);
create index invites_by_inviter  on public.invites (invited_by);
create index invites_by_acceptor on public.invites (accepted_by);

alter table public.access_grants enable row level security;
alter table public.access_grants force  row level security;
alter table public.invites       enable row level security;
alter table public.invites       force  row level security;

revoke all on public.access_grants, public.invites
  from anon, authenticated, hc_pipeline, hc_admin;

-- authenticated will read its OWN grant rows once M7's policy lands.
grant select on public.access_grants to authenticated;

-- hc.grant_vectors() reads access_grants as hc_internal (§3.4).
grant select on public.access_grants to hc_internal;
create policy access_grants_internal on public.access_grants
  for select to hc_internal using (true);
