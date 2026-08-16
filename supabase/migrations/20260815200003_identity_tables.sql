-- ============================================================================
-- 1A · M3 — identity and tenancy: accounts, admin_users, circles, subjects,
-- circle_members.
--
-- TSD §2.1 (conventions), §2.3 (shapes). circle_members is the §2.3 base
-- table and its ALTER folded into one CREATE — identical net shape. Every
-- reference between circle-scoped tables is a circle-consistent composite
-- FK (§2.1), including where §2.3's illustrative DDL shows the bare form,
-- and every such table carries the redundant unique (circle_id, id).
--
-- Boundary note (plan, migration boundary rule): RLS is enabled AND forced
-- here, but the circle-scoped read policies land with hc.ctx() in M7 —
-- between the two, these tables are intentionally inaccessible to
-- authenticated (fail closed). accounts' self-row policy is ctx-free and
-- lands now. hc_internal's named read policies land here because hc.ctx()
-- will read circle_members and subjects as hc_internal (§3.4).
-- ============================================================================

-- One account, many circles. PRD §8.12/§12.5: identity is global, membership
-- per circle, shared credentials refused.
create table public.accounts (
  id                uuid primary key references auth.users(id) on delete cascade,
  kind              hc.account_kind not null,
  display_name      text not null,
  pseudonym         text,                    -- "Former member 2" (PRD §4.1.6)
  slice             text,                    -- declared slice (PRD §4.1.3)
  deletion_requested_at timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (id, kind)                          -- the anchor for AC-ADMIN-3
);

create table public.admin_users (
  account_id   uuid primary key,
  account_kind hc.account_kind not null default 'admin' check (account_kind = 'admin'),
  mfa_enrolled_at timestamptz not null,      -- AC-ADMIN-5: no row without it
  created_at   timestamptz not null default now(),
  foreign key (account_id, account_kind) references public.accounts (id, kind)
);

create table public.circles (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  opening_context text[] not null default '{}',   -- step 3 multi-select (PRD §4.1.3)
  state          text not null default 'setup'
                 check (state in ('setup','active','pending_deletion','deleted')),
  created_by     uuid not null references public.accounts(id),
  created_at     timestamptz not null default now(),
  deletion_requested_at timestamptz,
  deletion_execute_after timestamptz,             -- 7-day window (PRD §4.1.6)
  arrivals_count int not null default 0,          -- quota counters (PRD §13.3)
  bytes_used     bigint not null default 0
);
create index circles_by_created_by on public.circles (created_by);

create table public.subjects (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id) on delete restrict,
  first_name    text not null,
  situation     text not null,
  postal_code   text not null,
  timezone      text not null,                    -- IANA. "a day is the SUBJECT's day" (§13.6)
  accent_color  text not null,
  forwarding_local_part extensions.citext not null,  -- nell, marcus
  forwarding_active_at  timestamptz,              -- null ⇒ not provisioned at the MTA (§5)
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (forwarding_local_part),
  unique (circle_id, id)                          -- circle-consistent FK target (§2.1)
);
create index subjects_by_circle on public.subjects (circle_id) where deleted_at is null;

-- The §2.3 net shape. A membership row represents a person, a subject, or —
-- after a parent login is attached — BOTH. The composite FK is MATCH SIMPLE,
-- so a null account_id skips the accounts check entirely (ADR-0002 claim 7):
-- that is what lets the subject-member row exist without an account while the
-- same FK pins every real member to kind = 'member' (AC-ADMIN-3, declarative).
create table public.circle_members (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id) on delete restrict,
  account_id    uuid,
  account_kind  hc.account_kind not null default 'member' check (account_kind = 'member'),
  tier          hc.tier not null,
  display_name_at_join text not null,
  joined_at     timestamptz not null default now(),
  removed_at    timestamptz,
  removed_by    uuid references public.accounts(id),
  subject_id    uuid,
  custodian_member_id uuid,
  foreign key (account_id, account_kind) references public.accounts (id, kind),
  foreign key (circle_id, subject_id) references public.subjects (circle_id, id),
  foreign key (circle_id, custodian_member_id) references public.circle_members (circle_id, id),
  -- treats nulls as distinct: two subject-member rows coexist in one circle,
  -- while one-membership-per-account still holds for accounts (§2.3)
  unique (circle_id, account_id),
  -- redundant on its own; exists so other tables can carry a circle-consistent FK
  unique (circle_id, id),
  constraint member_is_account_or_subject
    check (account_id is not null or subject_id is not null),
  -- A subject's record is held on their behalf until they hold it themselves.
  constraint subject_has_custodian_until_account
    check (subject_id is null or account_id is not null or custodian_member_id is not null)
);
create unique index circle_members_one_row_per_subject
  on public.circle_members (subject_id) where subject_id is not null;
create index circle_members_by_account   on public.circle_members (account_id);
create index circle_members_by_custodian on public.circle_members (custodian_member_id);
create index circle_members_by_removed_by on public.circle_members (removed_by);
create index admin_users_by_account_kind  on public.admin_users (account_id, account_kind);

-- ----------------------------------------------------------------------------
-- RLS: enabled AND forced in the creating migration, no exceptions (§2.1).
-- ----------------------------------------------------------------------------
alter table public.accounts       enable row level security;
alter table public.accounts       force  row level security;
alter table public.admin_users    enable row level security;
alter table public.admin_users    force  row level security;
alter table public.circles        enable row level security;
alter table public.circles        force  row level security;
alter table public.subjects       enable row level security;
alter table public.subjects       force  row level security;
alter table public.circle_members enable row level security;
alter table public.circle_members force  row level security;

-- ----------------------------------------------------------------------------
-- Privileges. Supabase's platform defaults grant broad table privileges to
-- anon/authenticated on creation; the model wants the PRIVILEGE absent, not
-- merely unmatched by a policy (§3.7). authenticated keeps SELECT only where
-- a read policy will exist; anon, hc_pipeline and hc_admin hold nothing.
-- ----------------------------------------------------------------------------
revoke all on public.accounts, public.admin_users, public.circles,
              public.subjects, public.circle_members
  from anon, authenticated, hc_pipeline, hc_admin;

grant select on public.accounts, public.circles, public.subjects,
                public.circle_members
  to authenticated;
-- admin_users: no family-facing read at all.

-- hc.ctx()/hc.grant_vectors() read these as hc_internal (§3.4): one named
-- policy per table, and the pgTAP invariant asserts this list never grows
-- without a matching definer function.
grant select on public.circle_members, public.subjects to hc_internal;
create policy circle_members_internal on public.circle_members
  for select to hc_internal using (true);
create policy subjects_internal on public.subjects
  for select to hc_internal using (true);

-- The one ctx-free policy: an account reads exactly its own row.
create policy accounts_select_self on public.accounts
  for select to authenticated
  using (id = (select auth.uid()));
