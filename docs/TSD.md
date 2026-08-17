# Harper's Circle — Technical Specification

**Version** 0.1 · §1–§3 for review · §4–§11 follow
**Status** Draft. No code exists. Nothing here has been built or run.
**Governing document** `PRD.md` v1.3. Where this document and the PRD disagree, **the PRD is right** and this document has a bug.
**Sources** `PRD.md` (what must be true) · `design_spec.md` (§8 is transcribed from its §2–§6) · `new_user_auth.md` (§5) · `HarpersCircle_Scope_v3.txt` (background)

**What this document is for.** It is the build spec for the stack: Next.js App Router on Vercel, Supabase (Postgres / RLS / Auth / Storage). It does not restate the PRD. Where a mechanism here exists to satisfy a PRD acceptance criterion, the criterion's ID appears beside it, and each section ends with the gates (G1–G15) it makes satisfiable.

**How to read it.** §1–§3 are the foundation and everything else depends on them being right. §2 and §3 are written as DDL and policy code rather than prose, because that is the form the build needs and the form a reviewer can find a hole in. §4–§7 are the pipeline and the surfaces built on it. §8–§11 are the design system, admin, security posture, and build order.

**What this document is, for anyone reading it out of context.** It is the internal design specification for a consumer product that has not been built. There is no code, no deployment, no running system, no database instance, no credentials, and no user data — this repository contains four documents and nothing else. The product is the author's own. The access-control content below specifies how the product will protect families' medical and financial records from unauthorised access, including from its own operators; the negative test cases in Appendix A are the pgTAP suite that proves those protections hold, and they are a **required release gate** (G2 and G8) imposed by the governing PRD, not an optional exercise. They describe tests to be written against the product's own future schema. Nothing here describes, targets, or applies to any third party's system.

**On the SQL.** It is written to be correct, not to be pasted. Repeated column blocks are abbreviated with a comment where §2.5 has already given them in full, and two helper functions (`hc.grant_vectors`, `hc.parent_taint`) are specified by contract rather than body. Everything else — types, constraints, policies, the visibility function — is the real thing.

**Four rules held throughout.** They are the reason several things below are more awkward than they would otherwise be.

1. **Nothing enters the record without a human approval.** Enforced as an absent table privilege, not as a code convention (§3.7).
2. **Nothing in the record is without provenance, and provenance survives every later edit.** The original approver is never overwritten (§3.7).
3. **Permissions are written first and tested first** (§11).
4. **The admin metadata boundary is a privilege boundary**, not a routing one. An admin session cannot select record contents because the `SELECT` privilege does not exist for that role (§3.10).

---

## 1. Architecture

### 1.1 Shape

One Next.js application, one primary Supabase project, and two deliberately separate data environments that exist for reasons the PRD states rather than for convenience.

```
                     ┌──────────────────────────────────────────────┐
  browser ─────────► │  Next.js App Router  ·  Vercel               │
                     │                                              │
                     │  /(app)      family surfaces  → RLS as user  │
                     │  /admin      operator portal  → hc_admin     │
                     │  /api/artifact/[id]           → authz route  │
                     │  /api/inbound/postmark        → signed hook  │
                     │  /api/worker/*                → pipeline     │
                     └───┬─────────────┬─────────────┬──────────────┘
                         │             │             │
              ┌──────────▼───┐  ┌──────▼──────┐  ┌───▼─────────────┐
              │ Supabase     │  │ Anthropic   │  │ Postmark        │
              │ PRIMARY      │  │ Claude      │  │ inbound+outbound│
              │              │  └─────────────┘  └─────────────────┘
              │ Postgres+RLS │
              │ Auth         │  ┌─────────────────────────────────┐
              │ Storage      │  │ scanner (ClamAV, private)       │
              │ pgmq         │  └─────────────────────────────────┘
              └──┬───────────┘
                 │
      ┌──────────▼──────────┐        ┌────────────────────────────┐
      │ LEDGER instance     │        │ ANALYTICS instance         │
      │ deletion tombstones │        │ pseudonymised telemetry    │
      │ separate PITR       │        │ separate credentials       │
      │ (PRD §11.5, G6/G11) │        │ (PRD §10.1, G15)           │
      └─────────────────────┘        └────────────────────────────┘
```

The two satellite instances are **not** an operational preference. The deletion ledger must survive a restore of the primary and therefore cannot share its backup lineage (PRD §11.5). Analytics must be unreachable from the primary's credentials (PRD §10.1, G15). Each is a separate Postgres instance with its own credentials, its own backup schedule, and no network path from the other.

### 1.2 Trust boundaries — the four database roles

This is the load-bearing table of the architecture. Every request path resolves to exactly one of these roles, and the difference between them is *table and column privileges*, not application logic.

| Role | Who reaches it | Privileges | Cannot |
|---|---|---|---|
| `authenticated` | Every family request, carrying the caller's Supabase JWT through PostgREST | `SELECT` on record tables **subject to RLS**; `EXECUTE` on the enumerated write functions; **no `INSERT`/`UPDATE`/`DELETE` on any record table** | Write to `documents`, `tasks`, `timeline_events`, `profile_facts` by any route. Read another circle. See past its grants. |
| `hc_internal` | Nothing directly. `NOLOGIN`, no password, not grantable to `authenticated`. Reachable only by being the owner of the ~14 enumerated `SECURITY DEFINER` functions in §3 | `SELECT` on record tables via one named policy per table | Be assumed by a session. Be `EXECUTE`d except through those functions, each of which applies its own authorization check |
| `hc_pipeline` | The ingestion workers only, over a direct connection from `/api/worker/*` | `INSERT`/`UPDATE` on `arrivals`, `extractions`, `proposals`; `EXECUTE` on `hc.record_context_for(arrival)` | `SELECT` any record table directly. Write any record table. Read Storage outside the arrival it is processing. |
| `hc_admin` | `/admin` only, over a direct connection with its own credential | `SELECT` on the views in `admin_meta` and nothing else | **`SELECT` on `documents`, `extractions`, `proposals`, `timeline_events`, `tasks`, `profile_facts`, `arrivals`, `access_log`, or Storage — the privilege does not exist** (AC-ADMIN-1, AC-ADMIN-2) |

Supabase's `service_role` key **bypasses RLS** and is therefore treated as a production credential of last resort. It appears in exactly two places: the artifact-streaming route (§1.3), and the migration runner. It is never used by `/admin`, never by a family-facing route, and never by a worker.

> **Deviation from the `admin-portal-builder` skill, recorded deliberately.** That playbook's `createAdminClient()` factory uses the service-role key for admin reads. Adopting it here would defeat AC-ADMIN-1 and AC-ADMIN-2 outright: an admin session would be able to select everything and the boundary would rest on which pages we chose to build. The skill's route layout, dual-layer auth (middleware *and* per-route check), activity log from day one, and `successResponse`/`errorResponse` convention are all adopted as written. Its Supabase client factory for `/admin` is replaced by the `hc_admin` role above. Its Resend default is replaced by Postmark (§1.6).

### 1.3 Request paths

**Family read.** Server Component → `@supabase/ssr` server client carrying the user's JWT → PostgREST sets `role authenticated` and `request.jwt.claims` → RLS decides. There is no service-role read path for family data, so a forgotten `.eq('circle_id', …)` is a missing optimisation, never a leak. (PRD §7.7)

**Family write to the record.** Server Action → `hc.approve_proposal(...)` (§3.7). Nothing else can write. Table privileges make this true rather than the code being careful.

**Artifact read** — the mechanism the PRD's revocation promise depends on (PRD §4.6.3, §7.7, AC-PPL-4).

```
GET /api/artifact/[document_id|arrival_id]
  1. session → RLS-scoped SELECT on the row.  No row ⇒ 404.       (indistinguishable, AC-PERM-2)
  2. hc.visible_at(...) ≥ 'view' for the artifact itself.
  3. arrival.scan_verdict = 'clean'.                               (AC-INBOX-15)
  4. service-role signed URL, 30 s, created and consumed server-side;
     the bytes are streamed back through this route.
  5. Cache-Control: private, no-store.  Range requests supported.
  6. access_log append: artifact_read.
```

The browser never receives a storage URL. Step 4's signed URL exists only inside the function's own memory for the duration of one fetch, so there is **no residual exposure on the normal path** — the "≤60 s, single-use" allowance in PRD §4.6.3 is reserved for the one case where proxying is impractical (a download over 25 MB, where streaming through a function is not dependable), it is recorded in `artifact_grants`, and it is revoked in the same transaction as any grant change. Revocation therefore closes the reading path immediately, because the reading path re-checks on every request.

**Inbound mail** → §5. **Pipeline** → §4. **Admin** → §9.

### 1.4 Background execution

The ingestion pipeline is idempotent, resumable, cancellable, and its state is what the family sees on the Care Inbox (PRD §4.2.2). That last property decides the design.

**Postgres owns the state; pgmq distributes the work; Vercel Functions do it.**

- `arrivals.state` and the append-only `arrival_events` are the single source of truth. The Care Inbox reads pipeline state under RLS from the same rows as everything else.
- `pgmq` (Supabase Queues) carries work items. Visibility timeouts give at-least-once delivery; the idempotency keys in §2.4 make at-least-once safe.
- Workers are `/api/worker/[stage]` route handlers on Fluid compute, invoked two ways: **eagerly** (the enqueuing request fires the worker without awaiting it) so p95 arrival→proposals stays inside the 60 s budget of PRD §13.2, and **swept** by a one-minute Vercel Cron that drains anything the eager path missed. The sweeper is what makes a dropped invocation a delay rather than a loss.
- Retry budgets are columns on `arrival_events`, per stage, and exhaustion is a terminal state with a reason code (PRD §4.2.2). No stage retries forever.
- Queue age is monitored against the 4-hour ceiling in PRD §13.1; breaching it notifies the coordinator in-product rather than silently deepening.

**Why not a durable workflow engine** (Vercel Workflow / Inngest): it would put the arrival's state in a second system while the family reads that state out of the first, and "the Care Inbox is one query behind the truth" is a class of bug this product cannot afford. Reconsider if the pipeline grows fan-out that Postgres state machines model badly; the swap is contained to `/api/worker/*` and the enqueue calls.

### 1.5 Environments

| Environment | Contents | Notes |
|---|---|---|
| Production | Primary Supabase project | PITR enabled — required by RPO 1 h (PRD §13.1); daily snapshots on the 35-day window in addition, not instead |
| Preview | Per-branch Vercel deploy against a **seeded synthetic** Supabase branch | Never real family data, at any stage, for any reason (PRD Appendix B) |
| Ledger | Separate Postgres instance | Tombstones only. Own PITR lineage. Written to synchronously at deletion; read at restore (§2.9) |
| Analytics | Separate Supabase project, separate credentials | Pseudonymised telemetry only. The primary holds no credential for it; the telemetry shipper does, and it runs nowhere else (G15) |

### 1.6 Reversible choices, and what reversing them costs

Three vendor decisions are isolated behind adapters so the swap cost is knowable. Each is stated as an hours-and-files estimate rather than "easy."

| Choice | Phase 1 | Isolated behind | Swap cost | Reverse it if |
|---|---|---|---|---|
| **AI provider** | **Anthropic Claude**, vision on rendered page images (§6) | `lib/ai/provider.ts` — one interface: `extract(pages, schema) → facts+citations` and `interpret(facts, recordContext) → proposals`. Model IDs, prompt templates and the citation coordinate format live here | **2–4 days.** The interface is small; the cost is not the code. It is (a) re-running the G9 evaluation set from scratch, because per-field precision/recall does not transfer between models, and (b) re-negotiating G3's four terms. Citation geometry (page + normalised bbox) is our format, not the provider's, so stored citations survive the swap | G3's terms cannot be obtained — specifically **zero retention, abuse-monitoring retention, and provider-side log contents**, not merely the no-training clause (PRD §11.2 G3) |
| **Inbound + outbound email** | **Postmark** (inbound parse + transactional) | `lib/mail/inbound.ts` (raw MIME → `Arrival`) and `lib/mail/outbound.ts` (8 templates, 3 classes) | **3–5 days.** Inbound is the expensive half: webhook signature scheme, raw-MIME retrieval, attachment fetching, and the `Authentication-Results` parsing that DMARC/ARC evaluation depends on all differ per provider. Address provisioning (§5) is an API call per subject. Outbound is ~1 day | Deliverability degrades, or per-address provisioning becomes a constraint. **Alternatives with their real trade-off:** AWS SES — cheaper at volume, more assembly, still accept-then-bounce. Cloudflare Email Workers — the only option that gives *true SMTP-time rejection* under our own logic, but caps messages at ~25 MB and is less proven |
| **Malware scanning** | **Self-hosted ClamAV**, private container, streamed bytes, nothing persisted | `lib/scan/scanner.ts` — returns `clean \| infected \| unavailable` | **1–2 days.** The interface is three states | It cannot keep up. Note the constraint that rules out the obvious hosted options: PRD §11.4 forbids provider retention, and most scanning APIs retain samples. This is why the scanner is ours |

**Postmark over Resend** (the `admin-portal-builder` default): Phase 1 needs inbound parse with raw MIME and full `Authentication-Results` headers, which is the whole basis of §5's sender authentication. Outbound follows inbound to keep one vendor in the subprocessor list.

**A note on the accept-then-bounce limitation.** Postmark accepts at the SMTP boundary and hands us the message, so we cannot 550 based on our own logic. Two consequences, both handled in §5 rather than papered over: an **inactive** forwarding address is not provisioned at the provider at all, so the MTA returns a genuine `550 no such user` and AC-AUTH-3 is satisfied by absence rather than by policy; and over-quota or blocked mail is bounced **only when the message is DMARC-aligned**, because bouncing unauthenticated mail generates backscatter at a forged sender. Unauthenticated over-quota mail is dropped, not stored and not bounced, which is what PRD §4.2.8's "rejected at ingress rather than stored" asks for.

### 1.7 Repository shape

```
app/(marketing)          public
app/(auth)               sign in · create account · reset · accept invite
app/(app)/[circle]/…     the seven Phase 1 surfaces
app/admin/…              operator portal — hc_admin connection only
app/api/artifact/[id]    authorization-checking artifact route
app/api/inbound/postmark signed inbound webhook
app/api/worker/[stage]   pipeline workers
supabase/migrations/     numbered SQL — schema and policies in the same migration
supabase/tests/          pgTAP: policy tests, written before the policies (§11)
lib/{ai,mail,scan}/      the three reversible adapters
lib/db/                  client factories, one per role, each named for its role
```

`lib/db/` exports exactly four factories, named `asUser()`, `asAdmin()`, `asPipeline()`, `asServiceRole()`. `asServiceRole()` is exported from a single module that is import-restricted by an ESLint rule to the artifact route and the migration runner — so an accidental service-role read fails in CI rather than in production.

### 1.8 Non-functional budgets this architecture owns

| PRD requirement | Where it is met |
|---|---|
| RPO 1 h (§13.1) | Supabase PITR with continuous WAL archiving. Daily snapshots do not satisfy this and are not claimed to (G11 tests both paths separately) |
| RTO 8 h (§13.1) | Restore runbook including mandatory ledger replay before the environment is reachable (§2.9) |
| p95 page load 1.5 s (§13.2) | Server Components, no client-side data fetching on the record surfaces, `circle_id`-leading indexes (§2) |
| p95 arrival → proposals 60 s (§13.2) | Eager worker invocation, not cron latency (§1.4) |
| Inbound acceptance 99.9 % (§13.1) | The webhook writes the arrival and returns; nothing downstream can reject an accepted message. Backpressure sheds processing, never acceptance |
| Interrupted upload resumes (§13.4) | Supabase Storage resumable (TUS) uploads against a server-minted upload token |
| Availability measured as four objectives, not one (§13.1) | Four separate synthetic checks; no blended figure is computed anywhere |

### 1.9 Connection topology, and what the platform costs

**Four roles, three paths, and the separation depends on which path each takes.**

| Role | Reaches Postgres via | Pooling | Why this path |
|---|---|---|---|
| `authenticated` | **PostgREST** (`@supabase/ssr` → supabase-js) | Supabase-managed | PostgREST sets `role authenticated` and `request.jwt.claims` from the session JWT. This is how RLS gets a caller identity at all |
| `hc_admin` | **Supavisor, transaction mode**, its own connection string | Transaction | **Not PostgREST.** Routing admin through PostgREST would mean the admin boundary lives in a JWT `role` claim — a token — rather than in an absent privilege. `hc_admin` connects *as itself* with its own credential, which is what makes §3.9 a privilege boundary instead of a claims boundary |
| `hc_pipeline` | **Supavisor, transaction mode**, its own connection string | Transaction | Same reasoning. Workers are serverless and short-lived; direct `:5432` connections from Vercel Functions exhaust the connection limit under any real concurrency |
| `hc_internal` | **Never connects.** `NOLOGIN`, no password | — | Reachable only as the owner of the enumerated `SECURITY DEFINER` functions (§1.2) |
| `service_role` | PostgREST with the service key, from two modules only | — | Artifact streaming (§1.3) and the migration runner. Import-restricted by ESLint |

**Transaction-mode pooling is sufficient, and that is not an accident** — it was checked against what the design actually uses:

- `hc_admin` and `hc_pipeline` **connect as those roles rather than `SET ROLE`-ing into them**, which matters because `SET ROLE` does not survive transaction pooling. The own-credential design is what makes the pooling mode a non-issue.
- `pg_advisory_xact_lock` (§2.8's per-circle hash chain) is **transaction-scoped**, so it releases at commit and needs no session affinity. A session-scoped advisory lock would have required session pooling and a much smaller connection ceiling.
- `set_config('hc.reclassifying', …, true)` (§3.7's taint marker) passes `true` for `is_local`, making it transaction-local for the same reason.
- Row locks (`FOR UPDATE` in §4.2 and `hc.claim_stage`) are transaction-scoped.
- **Migrations are the exception** and run over a direct session connection, because DDL — `ALTER TYPE … ADD VALUE`, role creation, `ALTER DEFAULT PRIVILEGES` — needs session semantics.

**What the platform costs, and which gate forces it.** Several architecture decisions require paid tiers. Recorded here because PRD's decision table sets billing to **none** — invite-only, free to design partners — so the infrastructure is entirely the founder's, and these are budget decisions rather than engineering ones.

| Requirement | Forced by | Note |
|---|---|---|
| **Point-in-time recovery** | **RPO 1 hour** (PRD §13.1), tested at G11 | A paid Supabase add-on. Daily snapshots alone do not satisfy the RPO and the TSD does not pretend they do. **This one is not deferrable** — it is a stated non-functional requirement, not an optimisation |
| **A second Postgres instance** (ledger) | **G6, G11** — tombstones must survive a restore of the primary, so they cannot share its backup lineage | Holds tombstones only: no content, no artifacts, a few thousand rows. **It does not need to be a second Supabase project or even the same provider** — anything with independent durability works. Size it accordingly rather than mirroring production |
| **A third Postgres instance** (analytics) | **G15** — the primary must hold no credential for it | Pseudonymised events only, no free text, nothing below a five-circle floor (§2.10). Also small |
| **Vercel WAF custom rules** | §5.6's **network dimension** of throttling | The per-account dimension is a Postgres table and works on any tier. Losing the network dimension weakens AC-AUTH-12 but does not break it — a botnet spreading attempts across addresses is the case it covers |
| **Supabase branching** | §1.5 preview environments | **Genuinely optional.** A seeded synthetic instance in CI serves the same purpose; the requirement is that preview never touches real family data, not that it uses branching to avoid it |
| **Function duration and memory** | §1.3 artifact streaming, §4.3's 5-minute extraction ceiling | Fluid compute; check the duration ceiling against the extraction budget before slice 5 |

**The honest summary:** three Postgres instances is a real requirement and *not* three times the production cost — two of them are tiny by construction. PITR is the line item that cannot be argued down, because an hour of RPO is a PRD requirement with a gate attached.

**Gates this section makes satisfiable:** G11 (both restore paths exist and are distinct), G15 (environment separation is structural), G3 (the provider boundary is one adapter, so disqualifying a provider is a swap and not a rebuild).

---

## 2. Data model

### 2.1 Conventions

- `uuid` primary keys, `default gen_random_uuid()`. Row counts per circle are in the low thousands (PRD §13.3 caps at 5,000 arrivals), so v4 index fragmentation is not a concern worth an extension. `access_log` and `circle_events` use `pg_uuidv7` where enabled, for append locality only.
- **Every row in a circle's data carries `circle_id`**, including rows reachable by join. It is denormalised deliberately: it is the leading column of every index and the first clause of every policy, so the planner narrows before any authorization function runs.
- **Every reference to another row in the circle is a *circle-consistent composite* FK** — `(circle_id, x_id) references t (circle_id, id)` — never a bare `references t(id)`. A single-column FK permits a row in circle A to point at a member or object in circle B. RLS would not currently expose such a row (the `circle_id` pre-filter blocks the read), so this is data integrity rather than a live leak; but "a policy happens to save us" is not the standard, and every table here therefore carries a redundant `unique (circle_id, id)` so the composite FK is expressible.
- **Polymorphic references** — `provenance_edges`, `object_shares`, `record_revisions` — cannot carry an FK at all. They are therefore the only places where integrity depends on the writer, and every one of them is mutable *solely* through an enumerated `SECURITY DEFINER` function that validates endpoint existence, circle agreement and subject agreement. `authenticated` holds no direct DML on any of the three. This is called out because it is the weakest link in the model and should be treated as such in review.
- `timestamptz` for instants. Never `timestamp` for an instant. §2.7 covers the three temporal kinds that are *not* instants.
- Soft delete is `deleted_at` + `purge_at`; a nightly job purges. Nothing in the record is hard-deleted by a user action.
- Types and functions live in schema `hc` (not exposed to PostgREST). Tables the family reads live in `public`. Admin views live in `admin_meta` (not exposed to PostgREST; reachable only by `hc_admin` over a direct connection).
- Lowercase, unquoted identifiers throughout.

```sql
create schema hc;          -- types, helper functions, security-definer writers
create schema admin_meta;  -- admin views only
create extension if not exists citext;
create extension if not exists pgmq;
create extension if not exists pg_trgm;   -- lookalike-domain scoring (§5)
```

**Every table in `public` gets `enable row level security` *and* `force row level security`** in the same migration that creates it. `force` matters: without it the table owner bypasses its own policies, which would make the `hc_internal` boundary in §1.2 meaningless. A pgTAP invariant asserts both flags on every table in `public` on every run, so a new table cannot ship without them.

### 2.2 Enumerated types

```sql
-- Ascending. min() and the comparison operators depend on this order.
create type hc.access_level as enum ('hidden','log','summary','view','manage');

create type hc.domain as enum ('memories','health','schedule','documents','finances');

create type hc.tier         as enum ('coordinator','family','care_circle');
create type hc.account_kind as enum ('member','admin');
create type hc.object_type  as enum ('document','task','timeline_event','profile_fact',
                                     'episode','arrival','extraction','proposal');

create type hc.doc_category as enum ('medical','medications','insurance',
                                     'legal','financial','labs','other');

-- A proposal's kind is NOT hc.object_type: conflicts and episode groupings are
-- proposals in their own right (PRD §4.2.5, §4.4.2) and have no record table.
create type hc.proposal_kind as enum ('document','task','timeline_event',
                                      'profile_fact','conflict','episode');

-- PRD §4.2.2. The family sees hc.product_state; these are implemented distinctly
-- because collapsing them makes failures unattributable and retries unsafe.
create type hc.arrival_state as enum (
  'received','store_failed','stored',
  'scanning','quarantined','scan_unavailable','scan_inconclusive','scanned',
  'extracting','extract_timeout','extract_failed','cancelled','extracted',
  'interpreting','proposals_ready',
  'held_unknown_sender','needs_password','duplicate_suspected',
  'filed','nothing_filed','unsupported_type');

create type hc.timeline_kind as enum ('medical','care','admin','memory');
create type hc.risk_class    as enum ('standard','high');
```

`hc.access_level` ordering is the arithmetic of the whole permission model. A migration that adds a level must use `alter type … add value … before/after` and a pgTAP test asserts the ordinal sequence on every run.

`hc.domain` has exactly five members and §3.3 hard-codes the full set as an array literal (an `IMMUTABLE` function cannot call `enum_range`, which is `STABLE`). A pgTAP test asserts the literal equals `enum_range(null::hc.domain)`, so adding a sixth domain fails the suite rather than silently opening a hole in fail-closed behaviour.

One helper, used by every policy, converts a jsonb array of domain names back to a typed array:

```sql
create or replace function hc.dom(p jsonb) returns hc.domain[]
language sql immutable parallel safe as $$
  select coalesce((select array_agg(v::hc.domain)
                   from jsonb_array_elements_text(coalesce(p,'[]'::jsonb)) v),
                  '{}'::hc.domain[]);
$$;
```

### 2.3 Identity, tenancy, and access

```sql
-- One account, many circles.  PRD §8.12 and §12.5 settle this: identity is global,
-- membership is per circle, shared credentials are refused.  §12.8's remaining
-- question (does a paid aide use one account across families) is a product policy
-- question that this shape already answers either way; the schema is frozen here.
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
```

**AC-ADMIN-3 is a declarative constraint, not a trigger.** `circle_members` below carries a constant-checked `account_kind = 'member'` and a composite FK to `accounts(id, kind)`. An account that holds a membership cannot be flipped to `admin` (the FK breaks), and an admin cannot be inserted into `circle_members` (the FK finds no `(id,'member')` row). No trigger, nothing to forget, nothing that a `session_replication_role` change disables.

```sql
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

create table public.subjects (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id) on delete restrict,
  first_name    text not null,
  situation     text not null,
  postal_code   text not null,
  timezone      text not null,                    -- IANA. "a day is the SUBJECT's day" (§13.6)
  accent_color  text not null,
  forwarding_local_part citext not null,          -- nell, marcus
  forwarding_active_at  timestamptz,              -- null ⇒ not provisioned at the MTA (§5)
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (forwarding_local_part)
);
create index subjects_by_circle on public.subjects (circle_id) where deleted_at is null;
```

*Note on the two-subject cap (PRD §2):* a row-count ceiling is not expressible as a table `CHECK`, so **no constraint is written that pretends to be one.** It is enforced in `hc.create_subject()` under `pg_advisory_xact_lock(circle_id)`, and asserted nightly by the invariant suite (§11). A `CHECK` that reads like a guarantee and isn't is worse than a documented function-level rule — the reviewer would stop looking.

```sql
create table public.circle_members (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id) on delete restrict,
  account_id    uuid not null,
  account_kind  hc.account_kind not null default 'member' check (account_kind = 'member'),
  tier          hc.tier not null,
  display_name_at_join text not null,
  joined_at     timestamptz not null default now(),
  removed_at    timestamptz,
  removed_by    uuid references public.accounts(id),
  foreign key (account_id, account_kind) references public.accounts (id, kind),
  unique (circle_id, account_id),
  -- redundant on its own; exists so other tables can carry a circle-consistent FK
  unique (circle_id, id)
);

-- PRD §7.1: the unit of access.  No circle-wide level exists, by construction —
-- there is no table in which one could be written.
create table public.access_grants (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id),
  member_id   uuid not null references public.circle_members(id) on delete cascade,
  subject_id  uuid not null references public.subjects(id),
  domain      hc.domain not null,
  level       hc.access_level not null,
  granted_by  uuid not null references public.accounts(id),
  granted_at  timestamptz not null default now(),
  unique (member_id, subject_id, domain)
);
create index access_grants_lookup on public.access_grants (member_id, subject_id);
```

**The subject as an access holder without an account** (auth §6, PRD §7.5, AC-PPL-3). A subject appears in People & roles as a person holding `manage` on all five of their own domains. This is modelled as a `circle_members` row with a **null `account_id`** — except the FK forbids null in the composite. Resolved by a partial shape:

```sql
alter table public.circle_members
  add column subject_id uuid references public.subjects(id),
  add column custodian_member_id uuid references public.circle_members(id),
  alter column account_id drop not null,
  -- A membership row represents a person, a subject, or — after a parent login is
  -- attached — BOTH.  It must represent at least one of them.
  add constraint member_is_account_or_subject
    check (account_id is not null or subject_id is not null),
  -- A subject's record is held on their behalf until they hold it themselves.
  add constraint subject_has_custodian_until_account
    check (subject_id is null or account_id is not null or custodian_member_id is not null);
create unique index circle_members_one_row_per_subject
  on public.circle_members (subject_id) where subject_id is not null;
```

A subject-member row holds the subject's grants and names its custodian. It never authenticates while `account_id` is null, because `hc.ctx()` (§3.2) keys on `auth.uid()`.

**Attaching a parent login later is `update circle_members set account_id = …` and nothing else** — no schema migration and no new row, which is precisely what auth §6 requires. That is why the constraint permits a row carrying *both* `account_id` and `subject_id`: an earlier draft required the subject-member row to drop `subject_id` in order to gain an account, which would have detached the row from the very subject it represents and forced exactly the migration auth §6 exists to prevent. When the account is attached, `custodian_member_id` may be retained as history or nulled; PRD §7.5 makes custodianship a statement about a period, so it is retained and the access log records the transition.

Two subtleties worth stating, because both are load-bearing and neither is obvious:

- The composite FK is `MATCH SIMPLE` (the default), so a row with `account_id is null` is **not** checked against `accounts` at all. That is what lets the subject-member row exist without an account while the same FK still pins every real member to `kind = 'member'`.
- `unique (circle_id, account_id)` treats nulls as distinct, so two subject-member rows coexist in one circle. The one-membership-per-account rule still holds for accounts.

```sql
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid not null references public.circles(id),
  token_hash   bytea not null unique,            -- sha256(token). The token is never stored.
  invited_email citext not null,
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
-- Single use: acceptance is an UPDATE ... WHERE accepted_at IS NULL inside the same
-- transaction that inserts the membership.  A replayed token updates zero rows and
-- the transaction aborts, creating nothing.  (AC-PERM-4, PRD §8.5)
```

**Circle creation is ordered, and the order is an acceptance criterion.** `hc.create_circle()` writes the **custodianship declaration to `access_log` before any other row for that circle exists** — before subjects, before the founder's membership, before grants (AC-AUTH-6). It names subject, custodian and date, and it is `seq = 1` in that circle's hash chain. This is what gives PRD §7.5's *"this is Nell's record, held by you on her behalf"* a receipt from row one rather than a sentence on a screen. A pgTAP test asserts `seq = 1` is `custodianship_declared` for every circle, so the ordering cannot drift when the function is later edited.

**Freeze** (PRD §7.5). Intake is whole-circle: while a freeze is `open`, `subject_id` is null — enforced by a declarative constraint, not a convention. Only an adjudicated finding can narrow the freeze to a subject (ADR-0001, amended per ADR-0003).

**Two tables, deliberately: a claim is not a freeze.** `freeze_claims` is the immutable intake ledger — every report that reaches the service gets a row and a disposition, including rate-limited ones — and `freezes` is the single active enforcement state per circle. A second claimant during an open adjudication *attaches* to the open freeze; their report is never swallowed by a uniqueness violation, because corroborating or broader allegations arriving second are exactly the ones an adjudicator must see (ADR-0003, finding 1).

```sql
create table public.freezes (
  id             uuid primary key default gen_random_uuid(),
  circle_id      uuid not null references public.circles(id),
  subject_id     uuid references public.subjects(id),
  requested_at   timestamptz not null default now(),
  state          text not null default 'open'
                 check (state in ('open','dismissed','upheld','unresolved')),
  contact_attempted_at timestamptz,
  adjudicated_at timestamptz,
  adjudicated_by text,
  outcome_note   text,
  narrowing_rationale text,   -- the recorded cross-subject exposure assessment
  -- An open freeze cannot name a subject: intake is whole-circle, and only
  -- a finding can narrow (ADR-0001).
  constraint freezes_open_is_whole_circle
    check (state <> 'open' or subject_id is null),
  -- A finding is adjudication or it is nothing: no path to a non-open state
  -- without complete adjudication metadata (ADR-0003, finding 2).
  constraint freezes_outcome_is_adjudicated
    check (state = 'open'
           or (adjudicated_at is not null and adjudicated_by is not null)),
  -- Narrowing is an explicit act carrying its own recorded justification,
  -- never a side effect (ADR-0003, findings 2 and 3).
  constraint freezes_narrowing_is_assessed
    check (subject_id is null or narrowing_rationale is not null)
);
-- One ACTIVE freeze per circle.  Claims are not bounded by this — they
-- attach.  This index is the "a record cannot be re-frozen while one
-- adjudication is open" half of PRD §7.5.
create unique index freezes_one_open_per_circle
  on public.freezes (circle_id)
  where state = 'open';

-- The immutable intake ledger.  hc.request_freeze() writes exactly one row
-- per report and disposes it; rows are never updated or deleted.  Claimant
-- identity for rate limiting keys on claimant_contact.
create table public.freeze_claims (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  freeze_id     uuid references public.freezes(id),
  claimant_contact text not null,
  claimant_relationship text,
  reason        text not null,
  received_at   timestamptz not null default now(),
  disposition   text not null check (disposition in
                  ('opened_freeze','attached_to_existing','rate_limited')),
  -- A rate-limited claim attaches to nothing; every accepted claim attaches
  -- to the freeze it opened or joined.
  check ((disposition = 'rate_limited') = (freeze_id is null))
);
```

**The PRD §7.5 rate limit, interpreted for whole-circle intake** (recorded because the PRD says "per claimant *and per subject*" and an intake claim now names no subject): the per-claimant dimension keys on `claimant_contact`; the per-subject dimension is enforced at **circle** granularity, which is strictly stronger — a circle-level bound bounds every subject within it. Both live in `hc.request_freeze()`, which is also the only writer of `freeze_claims`. **No request-path role holds any privilege on `freeze_claims`** — claims carry claimant PII and are read only by the adjudication surfaces (§9). Mutation of `freezes` is exclusive to `hc.request_freeze()` (open) and `hc.adjudicate_freeze()` (findings); no request-path role holds DML on it, and slice 1A tests direct INSERT, direct UPDATE, and every non-adjudication definer entry point against both tables.

Three notes the PRD forces:

- **There is no expiry column and no scheduled job that lifts a freeze.** The 3-day contact and 10-day decision obligations are tracked as operational alerts against `requested_at`; neither writes to `state`. A freeze ends by a finding (`dismissed`/`upheld`/`unresolved`) and by nothing else (PRD §7.5).
- **`unresolved` is a state, not a fallback.** It is entered explicitly. §3.9 gives it read-only access for coordinators *other than* the objected-to member, and closed if that member is the only coordinator.
- **Resolved (ADR-0001, amended per ADR-0003): whole circle at intake, narrowed at adjudication — and narrowing is the exception, not the default.** The PRD says "the record is closed" without saying whether a two-subject circle closes both records when one subject is objected to. It does: an open freeze covers every subject, enforced by `freezes_open_is_whole_circle` above. PRD §7.5 is containment-first; a claimant should not have to scope an objection they may not know spans two subjects; and joint finances mean a per-subject freeze would leave the accused reading the couple's records through the other file. That same joint-finances argument binds at adjudication: an `unresolved` finding stays **whole-circle by default**, because the visibility arithmetic is per subject (§3.1) and cannot close a joint document filed under the other subject's record. Narrowing requires the adjudicator to record a cross-subject exposure assessment in `narrowing_rationale` — enforced by `freezes_narrowing_is_assessed` — and the standard for when narrowing is appropriate belongs to the counsel-owned adjudication protocol (G1, §12.10). Circle-level effects — exports, deletions, invites — are suspended while *any* freeze is open.

### 2.4 Ingestion

```sql
create table public.arrivals (
  id             uuid primary key default gen_random_uuid(),
  circle_id      uuid not null references public.circles(id),
  subject_id     uuid not null references public.subjects(id),
  parent_arrival_id uuid references public.arrivals(id),   -- multi-attachment (PRD §4.2.6)
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
  sender_address citext,
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
  unique (circle_id, ingest_idempotency_key)
);
create index arrivals_inbox on public.arrivals (circle_id, subject_id, received_at desc);
create index arrivals_parent on public.arrivals (parent_arrival_id);
create index arrivals_dupe   on public.arrivals (circle_id, content_sha256);  -- PRD §8.9

-- Append-only.  Every transition, with a NORMALIZED reason code from a fixed
-- enumeration — never a provider's raw error string, which is record content
-- wearing a metadata costume (PRD §9.2, AC-ADMIN-6).
create table public.arrival_events (
  id           uuid primary key default gen_random_uuid(),
  arrival_id   uuid not null references public.arrivals(id) on delete cascade,
  circle_id    uuid not null references public.circles(id),
  from_state   hc.arrival_state,
  to_state     hc.arrival_state not null,
  reason_code  text,                       -- FK to hc.reason_codes; enumerated, admin-safe
  attempt      int not null default 1,
  occurred_at  timestamptz not null default now()
);

create table public.known_senders (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id),
  address     citext,
  domain      citext,                       -- exactly one of address / domain
  accepted_by uuid not null references public.accounts(id),
  accepted_at timestamptz not null default now(),
  revoked_at  timestamptz,
  check ((address is null) <> (domain is null))
);
create unique index known_senders_live
  on public.known_senders (circle_id, coalesce(address, domain))
  where revoked_at is null;
```

```sql
-- A fact read out of an arrival.  Never a record row.  Requires 'view' to read (§3.4).
create table public.extractions (
  id          uuid primary key default gen_random_uuid(),
  arrival_id  uuid not null references public.arrivals(id) on delete cascade,
  circle_id   uuid not null references public.circles(id),
  subject_id  uuid not null references public.subjects(id),
  field       text not null,
  value       jsonb not null,
  confidence  numeric(4,3) not null check (confidence between 0 and 1),
  risk_class  hc.risk_class not null,       -- PRD §6.4's list; set by field, not by confidence
  citation    jsonb not null,               -- {page, bbox:[x,y,w,h] normalised} | {offset,len} | {t}
  model_id    text not null,
  prompt_version text not null,
  created_at  timestamptz not null default now(),
  constraint citation_present check (citation ? 'page' or citation ? 'offset' or citation ? 't')
);
```

`citation_present` is how PRD §6.4's "a fact with no resolvable citation is never rendered as a fact at any confidence" becomes structural: an uncited extraction cannot be stored, so it cannot be rendered. It becomes a question or it is dropped, at the pipeline stage, with nowhere to hide.

```sql
-- The unit of approval AND the transaction boundary (PRD §4.2.9).
create table public.proposals (
  id            uuid primary key default gen_random_uuid(),
  arrival_id    uuid not null references public.arrivals(id) on delete cascade,
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid not null references public.subjects(id),
  kind          hc.proposal_kind not null,
  version       int not null default 1,
  supersedes_id uuid references public.proposals(id),
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
  check ((reject_reason is null) or status = 'rejected')
);
create unique index proposals_one_live
  on public.proposals (arrival_id, kind, coalesce(supersedes_id, id))
  where status = 'pending';

-- Idempotency for approval.  A double-click, a retried request and a re-delivered
-- job all present the same key; exactly one row survives and the winner's result
-- is replayed to the losers.  Covers the hard half of AC-INBOX-12 — the case where
-- the first attempt failed BEFORE committing must still produce the intended write.
create table public.approval_attempts (
  idempotency_key text primary key,
  proposal_id     uuid not null references public.proposals(id),
  expected_version int not null,
  actor_id        uuid not null references public.accounts(id),
  result          jsonb,
  committed_at    timestamptz,
  created_at      timestamptz not null default now()
);

-- ONE approved proposal writes AT MOST ONE record object, and one record object is
-- backed by AT MOST ONE approved proposal.  A scalar p_proposal_id argument
-- constrains the function's INPUT, not how many rows its body inserts — so the rule
-- is a table, not an API shape.  Without this, a future writer could commit two
-- objects from one approval and re-introduce bulk approval through the back door
-- that PRD §4.2.9 closes.  (AC-INBOX-3, PRD §6.2)
create table public.proposal_commits (
  proposal_id uuid primary key references public.proposals(id),
  circle_id   uuid not null references public.circles(id),
  object_type hc.object_type not null,
  object_id   uuid not null,
  committed_at timestamptz not null default now(),
  unique (object_type, object_id)
);
```

`hc.approve_proposal()` **claims** the proposal in `proposal_commits` before inserting its object, so the primary key is what serialises concurrent approvals of the same proposal and the `unique (object_type, object_id)` is what forbids two proposals backing one row. A deferred constraint trigger on each record table asserts that a newly inserted row has a matching claim — so an insert with no claim, or a second insert under one claim, aborts the transaction rather than committing a record the model cannot explain.

### 2.5 The record

Every record table carries the same four blocks: tenancy, **provenance**, **taint**, and search. They are written once as a shared shape and repeated per table rather than inherited, because Postgres inheritance and RLS interact badly.

```sql
-- Shared shape, repeated on documents / tasks / timeline_events / profile_facts / episodes:
--
--   circle_id  uuid not null
--   subject_id uuid not null
--
--   source_arrival_id  uuid references public.arrivals(id)   -- null ⇒ entered by hand
--   source_proposal_id uuid references public.proposals(id)
--   approved_by        uuid not null references public.accounts(id)
--   approved_at        timestamptz not null
--   approver_display_name text not null    -- captured at the moment (PRD §4.1.6 attribution)
--
--   taint          hc.domain[] not null
--   taint_resolved boolean not null default true
--
--   tsv            tsvector
--   deleted_at, purge_at
--
-- approved_by / approved_at are NOT NULL with no default.  There is no code path that
-- can omit them, because there is no INSERT privilege outside hc.approve_proposal().
-- (N1 · PRD §6.2 · AC-DOC-2)

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid not null references public.subjects(id),
  title         text not null,                    -- CONTENT, not metadata (PRD §7.6)
  category      hc.doc_category not null,
  summary_text  text,                             -- ≤3 sentences, plain language
  artifact_arrival_id uuid not null references public.arrivals(id),
  filed_at      timestamptz not null,
  source_arrival_id uuid references public.arrivals(id),
  source_proposal_id uuid references public.proposals(id),
  approved_by   uuid not null references public.accounts(id),
  approved_at   timestamptz not null,
  approver_display_name text not null,
  taint         hc.domain[] not null,
  taint_resolved boolean not null default true,
  tsv_summary   tsvector,          -- title + summary_text ONLY (see below)
  deleted_at    timestamptz,
  purge_at      timestamptz,
  unique (circle_id, id),                -- §2.1: circle-consistent FK target
  unique (circle_id, subject_id, id)     -- subject-consistent target (document_search_content)
);
create index documents_scope on public.documents (circle_id, subject_id) where deleted_at is null;
create index documents_tsv_summary on public.documents using gin (tsv_summary);

-- View-level searchable text lives in its own table, NOT in columns on documents.
-- Putting extracted or OCR text on a summary-readable row would make view-only
-- content selectable at `summary` — the exact boundary §3.4 draws between the two
-- levels, undone by a column. One-to-one, its own policy, requiring `view`.
create table public.document_search_content (
  document_id    uuid primary key references public.documents(id) on delete cascade,
  circle_id      uuid not null references public.circles(id),
  subject_id     uuid not null references public.subjects(id),
  extracted_text text,             -- concatenated approved extraction values
  ocr_text       text,             -- machine-read, never a fact (§6.9)
  tsv_full       tsvector,         -- tsv_summary ∪ the two columns above
  search_text_full text,           -- EXACTLY the text tsv_full was built from
  -- circle AND subject consistent: a two-column FK would let this row claim a
  -- different subject than the document it describes, and subject_id is what
  -- hc.visible_at() keys on.
  foreign key (circle_id, subject_id, document_id)
    references public.documents (circle_id, subject_id, id)
);
create index dsc_tsv_full on public.document_search_content using gin (tsv_full);
-- No index on taint.  GIN serves `<@` (containment-by) poorly, and the taint test is
-- in-memory arithmetic after the circle/subject btree has already narrowed the scan.
-- An index here would look reassuring and do nothing.

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid not null references public.subjects(id),
  title         text not null,
  detail        text,
  due_on        date,                              -- DATE-ONLY (§2.7).  Never a timestamp.
  due_zone      text,                              -- the subject's IANA zone at write time
  owner_member_id uuid,
  assigned_by   uuid references public.accounts(id),
  assigned_at   timestamptz,
  status        text not null default 'open' check (status in ('open','done','cancelled')),
  completed_by  uuid references public.accounts(id),
  completed_at  timestamptz,
  snooze_count  int not null default 0,
  written_for_member_id uuid,                     -- PRD §4.5.6 path 1
  -- … shared provenance / taint / tsv / delete block …
  check ((due_on is null) = (due_zone is null)),
  -- Circle-consistent FKs.  A task's owner must be a member of the task's OWN circle.
  foreign key (circle_id, owner_member_id)       references public.circle_members (circle_id, id),
  foreign key (circle_id, written_for_member_id) references public.circle_members (circle_id, id)
);
create index tasks_scope on public.tasks (circle_id, subject_id) where deleted_at is null;
create index tasks_owner on public.tasks (owner_member_id) where status = 'open';

create table public.timeline_events (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid not null references public.circles(id),
  subject_id   uuid not null references public.subjects(id),
  kind         hc.timeline_kind not null,
  summary      text not null,
  episode_id   uuid references public.episodes(id),   -- episodes is created first

  -- one of the three temporal shapes (§2.7)
  occurred_on  date, occurred_zone text,
  local_at     timestamp, iana_zone text, instant timestamptz, is_floating boolean not null default false,
  -- … shared block …
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id),
  subject_id uuid not null references public.subjects(id),
  title text not null
  -- … shared block …  An episode is a wrapper; member events stay individually
  -- readable and individually sourced (AC-TL-3).  There is no cascade.
);

create table public.profile_facts (
  id           uuid primary key default gen_random_uuid(),
  circle_id    uuid not null references public.circles(id),
  subject_id   uuid not null references public.subjects(id),
  field        text not null,
  value        jsonb not null,
  risk_class   hc.risk_class not null,
  supersedes_id uuid references public.profile_facts(id),
  superseded_at timestamptz,
  superseded_by_id uuid references public.profile_facts(id)
  -- … shared block …
);
create unique index profile_facts_current
  on public.profile_facts (subject_id, field) where superseded_at is null;
```

`profile_facts_current` is why silent overwrite has no code path (PRD §4.2.5, AC-INBOX-6): writing a new current value for a field requires setting `superseded_at` on the old row in the same transaction, and the old row is retained. "Use the new one" supersedes; it does not update.

**Revisions — N2's second half.**

```sql
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
```

The trigger in §3.7 raises if `approved_by`, `approved_at`, `approver_display_name` or `source_arrival_id` change on any `UPDATE`. **Sarah's approval cannot be turned into Dan's by an edit**, at the database, not by convention (PRD §1.2).

**Object shares** (PRD §4.3.5) — the only exception to domain-keyed access, and the one that never propagates.

```sql
create table public.object_shares (
  id          uuid primary key default gen_random_uuid(),
  circle_id   uuid not null references public.circles(id),
  subject_id  uuid not null references public.subjects(id),   -- the shared object's subject
  object_type hc.object_type not null,
  object_id   uuid not null,                                  -- polymorphic: no FK possible
  member_id   uuid not null,
  granted_by  uuid not null references public.accounts(id),
  granted_at  timestamptz not null default now(),
  created_by_assignment_of uuid,                              -- PRD §4.5.6: unassign revokes
  revoked_at  timestamptz,
  foreign key (circle_id, member_id) references public.circle_members (circle_id, id)
    on delete cascade,
  foreign key (circle_id, created_by_assignment_of) references public.tasks (circle_id, id)
);
create unique index object_shares_live
  on public.object_shares (object_type, object_id, member_id)
  where revoked_at is null;
create index object_shares_by_member on public.object_shares (member_id) where revoked_at is null;
```

There is **no `cascade` column and no propagation trigger**, by design. A share names one object and one person. Anything derived from the shared object is a separate row in `provenance_edges` with its own taint and is not reached by this table (§3.6, AC-PERM-10).

`object_id` is polymorphic and can carry no FK, so `hc.share_object()` is the only writer and it validates, in one transaction: that the object exists; that its `circle_id` and `subject_id` equal the share's; that the grantee is a live member of that circle; and that the granter can currently see the object at `manage`. `subject_id` is stored on the share so a reviewer can check circle *and* subject agreement without resolving the polymorphic reference.

**A share is never the caller's only claim on a subject.** §3.3 clause 1 rejects the object before the share is consulted when the caller has no context for its subject at all, so a share that outlives every grant on that subject grants nothing. That ordering is what makes the missing FK survivable rather than merely regrettable.

### 2.6 Provenance graph and taint

This is the hardest requirement in the PRD to hold (§7.6) and it is held here rather than in application code.

```sql
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
```

**Taint is materialised, not computed at read time.** Two reasons, both from the PRD: recomputation must be *atomic* with re-categorisation, relinking and subject reassignment (§7.6), which means it has to happen in the writing transaction; and a read-time recursive walk would put a graph traversal inside an RLS policy, which is both slow and impossible to reason about when it errors.

**The invariant that makes materialisation cheap.** `taint(node) = own_domain(node) ∪ ⋃ taint(parent)`. Because a parent's stored taint is *already* transitive and parents always exist before children, insertion needs no recursion — one union over the immediate parents' stored arrays gives the correct transitive closure. Recursion is needed only for propagation and for the one shrinking path.

Every one of these events is reachable **only** through a named function; `authenticated` holds no DML on `provenance_edges` and no `UPDATE` on any record table (§3.7). The table is therefore exhaustive by construction rather than by hope.

| Event | What runs |
|---|---|
| Insert a derived object | `taint := own_domain ∪ ⋃ parents.taint`. No walk — parents' stored taint is already transitive |
| **Insert** a provenance edge | `hc.propagate_taint_growth(child, parent.taint \ child.taint)` on the child's subtree. Validates both endpoints exist, share a circle, and share a subject; a cross-circle edge is refused, not tolerated |
| **Delete or relink** a provenance edge | Removing a source can only *reduce* lineage, so it routes to the shrink path below and never to a silent recompute. Relinking is delete-then-insert in one transaction |
| A parent's taint **grows** (re-categorisation into a wider domain) | `hc.propagate_taint_growth()` with the known delta. Same transaction as the category change, the tsvector rebuild and `artifact_grants` revocation (PRD §7.6, §4.3.2) |
| **Subject reassignment** | Taint is unchanged, but every descendant's `subject_id` moves with it and the whole subtree's index rows and outstanding links are rewritten in the same transaction — a descendant left on the old subject would be readable under the old subject's grants |
| Explicit reclassification (**the only shrinking path**) | `hc.reclassify_taint()` — requires `manage` on every domain in the *current* taint, recomputes path-complete to a fixed point under a per-circle advisory lock, sets the row-scoped marker the §3.7 trigger checks, and writes an `audience_changed` log entry naming both audiences (AC-DOC-6) |
| A parent is **deleted** | The child is *not* untainted. `source_deleted` is recorded and the citation resolves to a tombstone; taint is unchanged, because deleting a source never widens who can see what came out of it (PRD §4.1.6) |
| Cycle, depth limit, missing endpoint, cross-circle endpoint | `taint_resolved := false` → §3.3 clause 3 → visible only at `manage` on all five (AC-PERM-9) |

**The detector, because fail-closed is only real if something fails.** `taint_resolved = false` is a *consequence*; these are the three mechanisms that set it, and without them the property is decorative:

1. **At write time** — every function above wraps its walk in an exception block. Any error, any endpoint that does not resolve, any node still reachable *at* the depth limit sets `taint_resolved = false` on the affected rows and commits that rather than aborting. Failing closed beats failing loudly here, because an aborted transaction leaves the *old* taint in place, which may be the permissive one.
2. **At edge insert** — a cycle check (`the proposed parent is not already a descendant of the child`) runs before the edge is written. Provenance is a DAG by construction and this is what keeps it one.
3. **A nightly sweep** over `provenance_edges` for dangling endpoints, cross-circle edges, cross-subject edges and cycles, marking anything it finds. It exists because mechanisms 1 and 2 cover the paths we thought of, and this one covers the paths we did not. Its findings are a defect signal, not routine.

```sql
-- GROWTH.  Propagate a known delta, never a recomputation from parent values.
create or replace function hc.propagate_taint_growth(
  p_type hc.object_type, p_id uuid, p_delta hc.domain[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_depth constant int := 32;
begin
  with recursive down(object_type, object_id, depth) as (
      select p_type, p_id, 0
    union            -- UNION, not UNION ALL: a diamond-shaped DAG must not re-walk
      select e.child_type, e.child_id, d.depth + 1
      from public.provenance_edges e
      join down d on d.object_type = e.parent_type and d.object_id = e.parent_id
      where d.depth < v_depth
  )
  -- … per-type UPDATE … SET taint = taint | p_delta … FROM down …
  select 1;
  -- Anything still reachable AT the depth limit is a cycle or an over-deep graph:
  -- mark taint_resolved = false rather than guess.  Fails closed by §3.3 clause 3.
end $$;
```

**Why a delta and not a recomputation.** An earlier draft ran `set taint = taint | hc.parent_taint(...)` over the recursive set. That is wrong: every row in one `UPDATE` sees one snapshot, and Postgres guarantees no parent-before-child ordering, so a grandchild reads its parent's *pre-update* taint and stays stale. The failure is silent and it under-restricts, which is the worst direction.

The fix removes the ordering dependency rather than trying to satisfy it. When a node's taint **grows**, the added domains are known before the walk begins and are **identical for every descendant** — the union is commutative and idempotent, so `taint | delta` gives the same answer regardless of visit order, depth, or how many paths reach a node. No node reads another node's value.

The **shrink** path (`hc.reclassify_taint()`) cannot use a delta, because a descendant may retain a domain via a second path that does not pass through the reclassified node. It therefore recomputes **path-complete**: for each affected descendant, the union of its own domain with the own-domains of *all* its ancestors, gathered in one recursive query per node, iterated to a fixed point, under a per-circle advisory lock so no concurrent growth interleaves. It is slower and far rarer, and it is the only path permitted to reduce a value.

**Taint never shrinks by itself** is expressed as `taint := taint | computed` in every path except `hc.reclassify_taint()`. A manual edit that strips every sensitive word changes `title` and `tsv` and leaves `taint` exactly as it was (PRD §7.6).

**Taint always contains the object's own domain**, by construction in `own_domain()`. This is what makes §3.3's single `min` correct at both ends of §7.6's table: a finance-derived task is `min(schedule, finances)` because both are in its taint, not because the function special-cases derivation.

### 2.7 The three temporal kinds

PRD §13.6. Conflating these is how an appointment moves an hour in November.

| Kind | Columns | Rule |
|---|---|---|
| **Date-only** — a due date, a deadline, an expiration | `due_on date`, `due_zone text` | Never a timestamp. A due date has no time, and midnight in some zone is an invented fact. "A day" is the **subject's** local day |
| **Appointment** | `local_at timestamp`, `iana_zone text`, `instant timestamptz` — **all three** | Storing only UTC loses the intent, which is what a DST shift then corrupts. The intended local time is authoritative; `instant` is derived and recomputed if tzdata changes |
| **Floating** — a source giving a time but no place | `local_at timestamp`, `iana_zone null`, `is_floating true` | Explicitly marked, never silently assigned a zone |

```sql
alter table public.timeline_events add constraint temporal_shape check (
     (occurred_on is not null and local_at is null and not is_floating)
  or (local_at is not null and iana_zone is not null and instant is not null and not is_floating)
  or (local_at is not null and iana_zone is null and is_floating));
```

DST gaps and overlaps are a **question to the person**, never a silent resolution — so `hc.resolve_local()` returns an `ambiguous`/`nonexistent` marker that the pipeline turns into a low-confidence extraction rather than a value. Ambiguous source dates (`03/04/2026`) are likewise a low-confidence extraction offering both readings, never a locale guess.

### 2.8 The access log

Append-only, tamper-evident, filtered by the reader's own access, printable.

```sql
create table public.access_log (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null references public.circles(id),
  subject_id    uuid references public.subjects(id),
  seq           bigint not null,                  -- per-circle, gapless
  event_type    text not null references hc.log_event_types(code),
  actor_account_id uuid references public.accounts(id),
  actor_display_name text not null,               -- captured then, never re-resolved
  actor_session_id text,
  request_id    text,
  target_member_id uuid references public.circle_members(id),
  domain        hc.domain,
  level_before  hc.access_level,
  level_after   hc.access_level,
  object_type   hc.object_type,
  object_id     uuid,
  detail        jsonb not null default '{}',
  collapsed_count int not null default 1,         -- repeated denials (AC-PPL-7)
  collapsed_until timestamptz,
  occurred_at   timestamptz not null default now(),   -- SERVER time, never a client's
  prev_hash     bytea,
  entry_hash    bytea not null,
  corrects_id   uuid references public.access_log(id),
  unique (circle_id, seq)
);

-- A denial entry names the actor and the domain, NEVER the object — naming it would
-- tell the reader what exists (PRD §4.6.5, AC-PPL-7).
alter table public.access_log add constraint denial_names_no_object check (
  event_type <> 'access_denied' or (object_id is null and object_type is null
                                    and detail = '{}'::jsonb));
```

**Append-only, two ways.** `revoke insert, update, delete on public.access_log from authenticated, anon, hc_pipeline, hc_admin;` — the only writer is `hc.log()`, owned by `hc_internal`. And a `before update or delete` trigger raises unconditionally, so even a future migration that re-grants the privilege still cannot rewrite history. A correction is a new row with `corrects_id` set.

**Tamper-evidence.** `entry_hash = sha256(prev_hash || canonical_json(entry))`, chained per circle. `hc.log()` takes `pg_advisory_xact_lock(hashtext(circle_id::text))` so `seq` and the chain are serialised per circle without blocking other circles — the short-transaction and advisory-lock rules apply, and the lock is held for microseconds. A daily job signs each circle's head `(seq, entry_hash)` with an asymmetric key whose private half lives in a KMS **no application role can read**, and stores the signature in the ledger instance. A coordinator who could edit the log could not re-sign the chain, which is the property the disputes this log exists for actually need.

**Reading the log is itself permission-filtered** (§3.4). Entries about a subject render at the reader's level on that subject's domains; the log is not a back door into the domains it describes.

### 2.9 The deletion ledger

PRD §11.5: a restore from a snapshot older than a deletion resurrects the deleted data, and a routine disaster-recovery exercise silently undoes what a family asked for once.

Held on the **ledger instance** (§1.5), which shares no backup lineage with the primary.

```sql
-- ledger instance, schema `ledger`
create table ledger.tombstones (
  id            uuid primary key default gen_random_uuid(),
  circle_id     uuid not null,
  object_type   text not null,
  object_id     uuid,
  storage_keys  text[] not null default '{}',
  scope         text not null check (scope in ('item','arrival','member','circle')),
  requested_by  uuid,
  requested_at  timestamptz not null,
  executed_at   timestamptz,
  reason        text
  -- never the content, never a title, never a filename
);
```

Written **synchronously**, in the same request as the deletion request, before the live purge runs. The purge job marks `executed_at`.

**Restore procedure, and the part that is not optional.** A restored environment is not reachable — not by a family, not by us — until `ledger.tombstones` has been replayed against it. The runbook is: restore → **network-isolated** → replay every tombstone with `requested_at` ≤ the restore point's wall clock → verify a sampled set of deleted objects is absent → open. G6 tests it (delete, restore an older snapshot, confirm the data does not come back) and G11 tests it again as one of its three restores. A restored environment that has not replayed tombstones is a re-disclosure, not a recovery.

### 2.10 Telemetry, in two tiers

PRD §10.1. The two tiers are not interchangeable and are not in the same database.

```sql
-- Tier 1 — operational.  Inside the circle's own data, under the same RLS, the same
-- retention and the same access rules as the record.  The family's own measures come
-- from here.  hc_admin has NO privilege on it (PRD §9.2).
create table public.circle_events (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references public.circles(id),
  subject_id uuid references public.subjects(id),
  actor_id   uuid references public.accounts(id),
  event      text not null,
  props      jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
```

Tier 2 lives on the analytics instance. The shipper is the only component holding its credential.

```sql
-- hc.telemetry_forbidden_fields is a TABLE, not a code constant, and the shipper
-- validates against it at the ingestion point.  A prop key matching it aborts the
-- batch loudly (PRD §10.1).
insert into hc.telemetry_forbidden_fields(key) values
  ('subject_name'),('subject_id'),('document_title'),('title'),('filename'),
  ('sender'),('sender_address'),('subject_line'),('task_text'),('summary'),
  ('extracted_value'),('value'),('note'),('detail'),('email'),('display_name');
```

Analytics rows carry a **rotating circle pseudonym** (rotated on a schedule, mapping held only in the primary), **no subject identity at all**, generalized category buckets, **no free text ever**, and nothing is reported below a floor of **five circles**. Environment separation is a build requirement (G15), not a deployment habit — the primary holds no analytics credential, so shipping to it from a family-facing route is not a mistake anyone can make.

### 2.11 Search

`tsvector` columns maintained by trigger in the same transaction as the content and as the taint (PRD §4.3.6: "index membership is synchronous with access").

```sql
create index documents_tsv_summary on public.documents using gin (tsv_summary);
create index dsc_tsv_full          on public.document_search_content using gin (tsv_full);
create index tasks_tsv             on public.tasks using gin (tsv);
create index timeline_tsv          on public.timeline_events using gin (tsv);
```

**The vector always lives at the level of the text in it.** `documents` carries only `tsv_summary`; everything requiring `view` sits in `document_search_content` behind its own policy. `tasks` and `timeline_events` carry a single vector because §3.4 makes their **whole rows** summary-readable — there is no view-only field to leak. **If `tasks.detail` or any timeline field ever becomes view-only, it needs the same split on the same day**, and the invariant suite asserts that no column readable only at `view` appears in a vector on a `summary`-readable table.

Because the index lives **on the same rows** as the content, RLS covers it with no second enforcement path — there is no separate index to fall out of sync, which is what makes "revocation, deletion, re-categorisation and subject reassignment update the index in the same transaction" true by construction rather than by a job. §7 covers ranking, snippets and the leakproofness argument.

### 2.12 Storage

| Bucket | Contents | Read access |
|---|---|---|
| `artifacts` (private) | `circle/<circle_id>/arrival/<arrival_id>/<sha256>` — write-once, never mutated | **No RLS policy for `authenticated` at all.** Only the artifact route's service-role client reads it |
| `quarantine` (private) | Confirmed malware, 7 days, hash + verdict retained after | No read grant for any role. Not releasable by a user action (PRD §4.2.2) |
| `exports` (private) | Generated archives, 7 days | Served through the same authorization-checking route pattern; links revoked on revocation |

Uploads are direct-to-storage **resumable (TUS)** against a server-minted, subject-scoped upload token, so an interrupted upload in a hospital corridor resumes (PRD §13.4). The token is minted only after the caller's right to ingest to that subject is checked.

### 2.13 Where the two non-negotiables live

| Rule | Mechanism | Where |
|---|---|---|
| **N1** — no write without a human approval | `authenticated` holds **no `INSERT`/`UPDATE`/`DELETE` privilege** on `documents`, `tasks`, `timeline_events`, `profile_facts`, `episodes`. `approved_by`/`approved_at` are `NOT NULL` with no default | §3.7 · AC-DOC-2, PRD §6.2 |
| **N1** — item-level | One proposal = one approval = one transaction. There is no multi-row approval function to call | §3.7 · AC-INBOX-3 |
| **N2** — provenance on every row | `NOT NULL` provenance block on every record table | §2.5 |
| **N2** — provenance survives edits | `before update` trigger raises on any change to `approved_by`/`approved_at`/`approver_display_name`/`source_arrival_id` | §3.7 · PRD §1.2 |
| **N2** — history is readable | `record_revisions` + `profile_facts` supersession chain + `access_log` | §2.5, §2.8 |
| **N2** — a deleted source is a provenance *fact* | Arrival deletion tombstones dependents rather than orphaning citations | §2.9 · PRD §4.1.6 |

**Gates this section makes satisfiable:** G6 and G11 (the ledger exists and is separately restorable), G13 (idempotency keys and proposal versions are columns, not conventions), G15 (telemetry separation is schema-level).

---

## 3. Permissions as RLS

Everything depends on this and it depends on nothing. It is built first and tested first (§11).

### 3.1 The model as arithmetic

PRD §7.6's rule — *a derived object renders at the minimum level the member holds across every domain in its taint* — is one line of set arithmetic, and restating it as arithmetic is what makes it expressible as a policy instead of as scattered application checks.

> `visible(member, object) = min{ level(member, subject, d) : d ∈ taint(object) }`

Ordered levels make the row test cheaper still. For a threshold `L`:

> `min over taint ≥ L` **⟺** `taint ⊆ { d : level(member, subject, d) ≥ L }`

So if the caller's *domains-held-at-or-above-L* set is computed **once per query**, every row test is an **array containment** against an in-memory array. No per-row database access, no recursion, no joins inside a policy.

Four properties fall out of this shape rather than being bolted on:

- **`hidden` in the taint ⇒ the object does not exist**, in any surface, count, notification or export — because containment fails at every level including `log`. (AC-PERM-6)
- **Counts are post-filter everywhere**, because the filter is the scan. (PRD §7.6, §4.3.6)
- **The object's own domain is in its taint** (§2.6), so `min` gives §7.6's table at both ends without special cases. (AC-PERM-7)
- **Unresolvable lineage substitutes all five domains**, so containment can only succeed for a member holding `manage` on all five. Failure is closed by arithmetic, not by a caught exception. (AC-PERM-9)

### 3.2 The authorization context — one evaluation per query

```sql
create or replace function hc.ctx()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'account', auth.uid(),
    'circles', coalesce((select array_agg(distinct m.circle_id)
                         from public.circle_members m
                         where m.account_id = auth.uid() and m.removed_at is null),
                        '{}'::uuid[]),
    'subjects', coalesce((
      select jsonb_object_agg(s.subject_id::text, jsonb_build_object(
        'c',       s.circle_id,
        'member',  s.member_id,
        'tier',    s.tier,
        'frozen',  s.frozen,
        'manage',  s.manage, 'view', s.view, 'summary', s.summary, 'log', s.log))
      from hc.grant_vectors(auth.uid()) s), '{}'::jsonb),
    'shares', coalesce((
      select jsonb_object_agg(o.object_type::text, o.ids)
      from (select sh.object_type, jsonb_agg(sh.object_id) as ids
            from public.object_shares sh
            join public.circle_members m on m.id = sh.member_id
            where m.account_id = auth.uid() and sh.revoked_at is null
              and m.removed_at is null
            group by sh.object_type) o), '{}'::jsonb));
$$;
alter function hc.ctx() owner to hc_internal;
revoke execute on function hc.ctx() from public, anon;
grant   execute on function hc.ctx() to authenticated;
```

`hc.grant_vectors(account)` is the one helper specified by contract. It returns, **for every subject in every circle the account is a live member of** — not only the subjects it holds grants on — `subject_id, circle_id, member_id, tier, frozen` plus **four cumulative jsonb arrays of domain names**: `manage ⊆ view ⊆ summary ⊆ log`, where `view` holds every domain held at `view` *or better*. Cumulative is what makes §3.1's containment test a single comparison instead of a scan down the ladder. `frozen` is true when an open `freezes` row covers the subject directly or covers its circle.

**Emitting a row for every reachable subject, including all-`hidden` ones, is deliberate.** A subject with no grants would otherwise be *absent* from the context, and absence is indistinguishable from "not my circle" — which means the freeze flag would be absent too, and clause 2 of §3.3 would have nothing to read. Present-but-empty is a fail-closed shape; absent is not. Clause 1 of §3.3 then means precisely "not in any of my circles."

Every policy calls it as `(select hc.ctx())`. That form is an uncorrelated scalar subquery, which Postgres ordinarily executes as an InitPlan — **once per query rather than once per row**, which is the difference between this design and one that falls over at a thousand rows. This is a well-established optimisation, but it is a **planner behaviour, not a semantic guarantee**: it is verified by an `EXPLAIN` assertion in the test suite, run against every supported Postgres major version, so a regression fails CI rather than quietly degrading production. Correctness does not depend on it; only performance does.

#### Answering "what can *that* account see" — the background-work boundary

Three paths need a visibility decision for **someone who is not the caller**: a notification authorised at send time per recipient (§5.9), an export generated in the background for the member who asked (§10.4), and an admin-assisted export scoped to the *requesting member's* grants and never the admin's (§9.3). All three said "scoped to their grants" without saying how that context is built, and `hc.ctx()` keys on `auth.uid()` — so as written, none of them could actually do it.

```sql
create or replace function hc.ctx_for(p_account uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ /* identical body to hc.ctx(), keyed on p_account instead of auth.uid() */ $$;
alter function hc.ctx_for(uuid) owner to hc_internal;
revoke execute on function hc.ctx_for(uuid)
  from public, anon, authenticated, hc_pipeline, hc_admin;
```

**`hc.ctx_for()` is internal and callable by nothing.** No request-path role holds `EXECUTE`. It exists only to be called from inside the enumerated definer functions below, each of which **derives the account from stored state rather than accepting it as an argument** — so there is no parameter for a caller to substitute:

| Boundary | Account comes from | Returns |
|---|---|---|
| `hc.notification_visible(notification_id)` | The queued notification's own `recipient_member_id` | A boolean, plus the minimal envelope. Never record content |
| `hc.generate_export(export_request_id)` | The export request's `requested_by`, recorded when the member asked | Rows already filtered by `hc.visible_at()` per row |
| `admin_ops.trigger_export(request_ref)` | The **user-originated request's** member, not the admin session | An export job. The admin holds no path to the archive (§9.3) |

The rule is uniform: **the caller names an object, never an identity.** A worker cannot ask "what can Dan see"; it can only ask "is this queued notification sendable" or "generate the export this member requested", and the function resolves the identity itself. Each calls the existing `hc.visible_at()` rather than reimplementing visibility, so there is still exactly one place the rule lives (§3.3).

**Indirection alone is not the guarantee.** It prevents direct substitution, but if the named row's identity fields can be mutated or the row manufactured, the account parameter has simply moved from the function signature into a writable row. Five invariants make the shape safe, and all three tables carry them:

1. **No request-path role holds DML on the identity fields.** `notifications.recipient_member_id`, `export_requests.requested_by` and `support_requests.member_id` are written only by the functions that create those rows.
2. **Creation binds the account to the authenticated requester or the originating event** — never to a caller-supplied value. An export request records `auth.uid()` at the moment the member asks.
3. **Identity, circle and destination are immutable after creation**, enforced by a `before update` trigger of the same shape as §3.7's provenance guard. A row that could be re-pointed after creation is a row that can be re-pointed after authorization.
4. **The wrapper atomically claims a pending row** and rejects anything cancelled, completed, expired or already claimed — so a completed export cannot be replayed and a single request cannot generate twice.
5. **Authorization is evaluated after the claim and immediately before the result is produced**, never at enqueue, and the **destination is derived from the account's current verified address** rather than from anything stored with the request.

`admin_ops.trigger_export()` needs all five most: the request must be created through the *family* path, so **an admin cannot manufacture the user-originated request they are then permitted to act on**, cannot change its member, and cannot replay a completed one. It is single-use, operation-bound, and step-up-bound (§9.3). Without that, "the admin cannot name the account" is a sentence about the function signature rather than about the system.

Forging the identity instead — setting `auth.uid()`, minting a JWT for the recipient, or reading with the service role and filtering in application code — is explicitly out. The first two put a second identity mechanism in the system; the third moves the decision out of the database, which is the thing §3 exists to prevent.

### 3.3 `hc.visible_at()` — the one function

Every visibility question in the product resolves through this function. There is deliberately no second place where the rule is written.

```sql
create or replace function hc.all_domains() returns hc.domain[]
language sql immutable parallel safe as $$
  select array['memories','health','schedule','documents','finances']::hc.domain[];
$$;

-- The ladder alone.  Separated so it can be unit-tested against a truth table and so
-- that no call site can reach it without first passing the guards in visible_at().
create or replace function hc.ladder(p_s jsonb, p_taint hc.domain[])
returns hc.access_level language sql immutable parallel safe as $$
  select case
    when p_taint <@ hc.dom(p_s -> 'manage')  then 'manage'::hc.access_level
    when p_taint <@ hc.dom(p_s -> 'view')    then 'view'::hc.access_level
    when p_taint <@ hc.dom(p_s -> 'summary') then 'summary'::hc.access_level
    when p_taint <@ hc.dom(p_s -> 'log')     then 'log'::hc.access_level
    else 'hidden'::hc.access_level
  end;
$$;

create or replace function hc.visible_at(
  p_ctx         jsonb,
  p_subject     uuid,
  p_taint       hc.domain[],
  p_resolved    boolean,
  p_object_type hc.object_type default null,
  p_object_id   uuid           default null,
  p_owner_member uuid          default null
) returns hc.access_level
language sql immutable parallel safe
as $$
with e as (select p_ctx -> 'subjects' -> p_subject::text as s),
shared as (
  select coalesce(p_object_id is not null
     and (p_ctx -> 'shares' -> p_object_type::text) @> to_jsonb(p_object_id), false) as ok
),
t as (
  select
    case when p_resolved and p_taint is not null and cardinality(p_taint) > 0
         then p_taint else hc.all_domains() end as taint,
    (p_resolved and p_taint is not null and cardinality(p_taint) > 0) as lineage_ok
)
select case
  -- 1. No context for this subject ⇒ the object does not exist for this caller.
  --    FIRST and unconditional: a share must not be able to manufacture context for
  --    a subject the caller holds nothing on.
  when (select s from e) is null                                  then 'hidden'::hc.access_level

  -- 2. Freeze suspends ALL interactive access, including the custodian's and every
  --    coordinator's.  coalesce(...,true) so a missing key fails closed. (AC-PERM-11)
  when coalesce(((select s from e) ->> 'frozen')::boolean, true)   then 'hidden'::hc.access_level

  -- 3. Unresolved or empty lineage: manage on all five, or nothing.  The ladder is
  --    NOT evaluated here — running it would hand 'log' to a member holding log on
  --    all five, which is exactly what AC-PERM-9 forbids.  A share cannot lift this
  --    either, because we do not know what the object carries.
  when not (select lineage_ok from t) then
       case when hc.all_domains() <@ hc.dom((select s from e) -> 'manage')
            then 'manage'::hc.access_level else 'hidden'::hc.access_level end

  -- 4. care_circle is a ceiling: only what is assigned to them or shared with them.
  --    p_owner_member null ⇒ distinct from any member id ⇒ hidden. (PRD §7.4, AC-TASK-5)
  when ((select s from e) ->> 'tier') = 'care_circle'
   and coalesce(p_owner_member::text, '') is distinct from ((select s from e) ->> 'member')
   and not (select ok from shared)                                then 'hidden'::hc.access_level

  -- 5. An object share widens ONE named object to 'view'.  Reachable only past 1–3,
  --    so it can neither invent subject context nor outlive a freeze nor bypass
  --    fail-closed lineage.  It never widens a domain and never propagates.
  when (select ok from shared) then
       greatest(hc.ladder((select s from e), (select taint from t)), 'view'::hc.access_level)

  -- 6. The ordinary case: min over the taint, as set containment.
  else hc.ladder((select s from e), (select taint from t))
end;
$$;
```

**The order of clauses 1–5 is the security property**, not a style choice. Each guard must precede everything that could otherwise route around it, and the pure-function test suite (§3.13) asserts each ordering independently:

| Clause | Guards against |
|---|---|
| 1 before 5 | A surviving `object_shares` row granting `view` on a subject the caller holds no grant on — reached when grants are revoked and a share is kept (PRD §4.6.3), or when `hc.presence()` is called with an arbitrary subject id |
| 2 before 4, 5 | A share or an assignment lifting a freeze (AC-PERM-11) |
| 3 before 5 | A share widening an object whose lineage we cannot resolve — we do not know what it carries, so no one may see it below `manage`-on-all-five |
| 3 not falling through to the ladder | `log`-on-all-five yielding `log` on an unresolved object (AC-PERM-9) |

Four further properties:

- **`IMMUTABLE` is truthful.** The function touches no table. Everything arrives in `p_ctx`. That is what lets it run per row at negligible cost, and what lets the whole visibility model be tested as a truth table with no fixtures.
- **`cardinality()`, not `array_length(…,1)`.** Both work — `array_length` returns `NULL` on an empty array and `NULL > 0` is not true, so the fail-closed branch fires either way — but relying on null semantics to get a security decision right is a bad way to write a security decision.
- **`coalesce(frozen, true)`** rather than a bare cast. A missing or malformed key now freezes rather than falls through.
- **The five-domain literal** cannot be `enum_range(null::hc.domain)`, which is `STABLE`. `hc.all_domains()` isolates it, and a pgTAP test asserts it equals `enum_range`.

### 3.4 Policy shape, and the level→table map

Every read policy has the same two-clause shape: a **cheap indexed pre-filter** that lets the planner narrow before any function runs, then the visibility test.

```sql
alter table public.tasks enable row level security;
alter table public.tasks force  row level security;

create policy tasks_select on public.tasks
for select to authenticated
using (
      (select hc.ctx() -> 'circles') @> to_jsonb(circle_id)   -- indexed pre-filter
  and deleted_at is null
  and hc.visible_at((select hc.ctx()), subject_id, taint, taint_resolved,
                    'task', id, owner_member_id) >= 'summary'
);

-- hc_internal reads past the policy, and ONLY through the enumerated definer
-- functions it owns.  It is NOLOGIN and cannot be assumed by a session (§1.2).
create policy tasks_internal on public.tasks for select to hc_internal using (true);
```

`hc.ctx()` itself needs to read `circle_members`, `access_grants`, `object_shares` and `freezes`, which are also `force`-RLS tables. It does so as `hc_internal`, via the same one-named-policy-per-table pattern. That is the whole of `hc_internal`'s reach and it is greppable: `select * from pg_policies where roles::text like '%hc_internal%'` returns the complete list, and a pgTAP invariant asserts that list has not grown without a corresponding definer function.

**RLS cannot vary by column, so the `summary`/`view` line is drawn between tables, not inside them.** This is the one place the level ladder shapes the schema.

| Level | Reaches | Not reachable |
|---|---|---|
| `manage` | Everything below, plus `EXECUTE` on the write functions for that domain | — |
| `view` | `extractions`, `profile_facts`, the **artifact** (§1.3), `arrival.auth_detail` | Approval |
| `summary` | `documents` (title, category, dates, `summary_text`), `tasks`, `timeline_events`, `episodes`, the arrival row | The artifact and the extracted contents — which is why they are separate tables |
| `log` | Nothing from the base tables. Served only by `hc.presence()` (§3.5) | Titles, categories, any content |
| `hidden` | Nothing, and no count, empty section or disabled control implies existence | — |

*Reading recorded:* PRD §7.3 grants `summary` "synthesised information only… not the artifact and not the extracted contents." `documents.summary_text` is a synthesis and is neither, so it is readable at `summary` — which is what "Family joins at summary only: Nell's timeline, and how she's doing" describes. Flagged because it is an interpretive call and it is one line to reverse.

### 3.5 `log` level — existence without content

`log` means presence and activity: that things exist and when they changed, no titles, no content (PRD §7.3). It cannot come from the base tables, so it comes from one definer function that applies its own threshold.

```sql
create or replace function hc.presence(p_subject uuid)
returns table (object_type hc.object_type, id uuid, changed_at timestamptz, dated_on date)
language sql stable security definer set search_path = '' as $$
  select 'task'::hc.object_type, t.id, t.approved_at, t.due_on
  from public.tasks t
  where t.subject_id = p_subject and t.deleted_at is null
    -- The same circle pre-filter the policies carry.  This function reads PAST RLS,
    -- so omitting it would make an arbitrary p_subject the one call site where a
    -- stale share could be evaluated without a circle bound.
    and (select hc.ctx() -> 'circles') @> to_jsonb(t.circle_id)
    and hc.visible_at((select hc.ctx()), t.subject_id, t.taint, t.taint_resolved,
                      'task', t.id, t.owner_member_id) >= 'log'
  union all … ;
$$;
alter function hc.presence(uuid) owner to hc_internal;
```

It returns **ids and dates and nothing else** — no title column exists in the return type, so a future careless addition to a query cannot leak one. This is the only route to PRD §7.6's *"Something in Nell's finances is due Friday · you don't have access to it"*, and it is reachable only by a member holding `log` **or above on every domain in the taint**. Access to the schedule never buys knowledge of the finances (AC-PERM-7).

### 3.6 Object shares, and why they stop

A share is `(object_type, object_id, member_id)` and `hc.visible_at()` consults it for **that object id only**. A task derived from a shared document is a different row with a different id, so the share does not reach it — not because a propagation rule was disabled, but because there is no propagation code to disable (AC-PERM-10, AC-DOC-5).

Assignment across a taint boundary (PRD §4.5.6) is therefore two explicit paths, both human, both in `hc.assign_task()`:

1. **A written instruction** — a new `task` row with `written_for_member_id` set, its own provenance (*written by Sarah, for Marisol, from a task she can't see*), and **taint = `{schedule}` only**, because a person wrote it knowing who would read it. The original task keeps its taint. `hc.assign_task()` has no path that calls the AI, so §6.5's prohibition on the AI making a permission decision is structural here too.
2. **An explicit named share** — `object_shares` rows for the task *and* the named document, created together, both named in one confirmation, both logged.

Unassigning closes the written instruction and revokes any share carrying `created_by_assignment_of = <task>`, unless a coordinator explicitly keeps it (AC-TASK-7). Reassigning re-runs the whole check.

### 3.7 Writes — N1 and N2 as privileges, not conventions

```sql
revoke insert, update, delete on
  public.documents, public.tasks, public.timeline_events,
  public.profile_facts, public.episodes
from authenticated, anon, hc_pipeline, hc_admin;

-- FORCE ROW LEVEL SECURITY applies to the table owner too, so hc_internal needs BOTH
-- the privilege AND a policy.  Without these, hc.approve_proposal() cannot insert and
-- nothing can ever be written to the record — the design does not run.
grant insert, update on
  public.documents, public.tasks, public.timeline_events,
  public.profile_facts, public.episodes
to hc_internal;

create policy tasks_internal_write on public.tasks
  for insert to hc_internal
  with check (exists (select 1 from public.proposal_commits pc
                      where pc.object_type = 'task' and pc.object_id = tasks.id));

create policy tasks_internal_revise on public.tasks
  for update to hc_internal using (true) with check (true);
-- provenance and taint are guarded by trigger, not by this policy (below).
```

**No request-path role holds write privilege on any record table**, so adding a policy for one later would still grant nothing. `hc_internal` holds the privilege and is `NOLOGIN`, unassumable by a session, and reachable only through the enumerated definer functions. `DELETE` is granted to nobody at all — deletion is `update … set deleted_at`, and purge runs as a separate maintenance role.

The insert policy requiring a matching `proposal_commits` row is deliberate belt-and-braces alongside the deferred trigger in §2.4: the trigger catches a missing claim at statement end, the policy catches it at the row. Either alone would do; both cost nothing and they fail in different places, which is useful when diagnosing.

The only writer is:

```sql
create or replace function hc.approve_proposal(
  p_proposal_id uuid, p_expected_version int, p_idempotency_key text,
  p_edits jsonb default null, p_step_up_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
-- 1. Idempotency: insert into approval_attempts; on conflict, replay the stored result.
--    Covers the hard case in AC-INBOX-12 — a first attempt that failed BEFORE
--    committing must still produce the intended write on retry.
-- 2. Re-check authorization AT WRITE TIME, never at render time (PRD §4.2.9):
--    hc.visible_at(hc.ctx(), subject, proposal.taint, resolved) = 'manage'.
--    A grant lowered while the review screen sat open cannot be approved against.
-- 3. Refuse if proposal.version <> p_expected_version — re-render with what changed.
--    Nobody approves something other than what they read.
-- 4. Refuse if the circle or subject has an open freeze.
-- 5. Refuse if risk_class = 'high' and the caller did not confirm the value (PRD §6.4).
-- 6. Write the object WITH approved_by / approved_at / approver_display_name,
--    its provenance_edges, its taint, its tsvector, and its access_log entry —
--    or write nothing.  ONE proposal, ONE transaction (PRD §4.2.9).
-- 7. Record the result against the idempotency key.
$$;
alter function hc.approve_proposal(uuid,int,text,jsonb,text) owner to hc_internal;
```

**One proposal per call.** There is no `approve_proposals(uuid[])` and no batch path, so AC-INBOX-3 holds at the database as well as in the interface — a future "accept all" button would have nothing to call. Filing a document, creating a task and writing a timeline event are separate proposals committing independently, which is what stops the transaction layer smuggling bulk approval back in (PRD §4.2.9).

**Manual entry uses the same function** with `source_arrival_id = null` and the approver as the actor, so a hand-typed timeline event carries provenance of exactly the same shape (N2, AC-TL-2).

**Provenance immutability:**

```sql
create or replace function hc.guard_row() returns trigger
language plpgsql as $$
begin
  -- N2: the original approver is never overwritten by a subsequent editor.
  if new.approved_by is distinct from old.approved_by
  or new.approved_at is distinct from old.approved_at
  or new.approver_display_name is distinct from old.approver_display_name
  or new.source_arrival_id is distinct from old.source_arrival_id then
    raise exception 'provenance is immutable (PRD §1.2)' using errcode = '42501';
  end if;

  -- PRD §7.6: taint never shrinks by itself.  "Writers use taint := taint | computed"
  -- is a convention; this is the invariant.  The only legitimate shrink is
  -- hc.reclassify_taint(), which sets a transaction-local marker.  Note that the
  -- marker is not itself the control — no request-path role holds UPDATE on this
  -- table at all (§3.7), so only hc_internal functions reach here, and exactly one
  -- of them sets it.
  if not (new.taint @> old.taint)
     and coalesce(current_setting('hc.reclassifying', true), '') <> new.id::text then
    raise exception 'taint may not shrink outside hc.reclassify_taint() (PRD §7.6)'
      using errcode = '42501';
  end if;

  -- Fail-closed may not be cleared except by a completed recomputation, which sets
  -- the same marker.  false -> true is the dangerous direction; true -> false is not.
  if old.taint_resolved is false and new.taint_resolved is true
     and coalesce(current_setting('hc.reclassifying', true), '') <> new.id::text then
    raise exception 'taint_resolved may only be restored by validated recomputation'
      using errcode = '42501';
  end if;

  return new;
end $$;
```

Attached `before update` to every record table, and to `proposals`. If Sarah approves a task and Dan later edits its date, the record shows Sarah approved it and Dan edited it — enforced, not documented. Edits go through `hc.revise_object()`, which writes a `record_revisions` row in the same transaction and never touches the provenance block.

The marker is scoped to a **specific row id**, not a boolean, so a reclassification of one object cannot open a window in which any other object's taint may shrink in the same transaction.

### 3.8 Freeze

`hc.grant_vectors()` sets `frozen = true` for a subject with a freeze covering it. While a freeze is `open` that is always every subject in the circle — intake is whole-circle, `subject_id is null` enforced by `freezes_open_is_whole_circle` (§2.3, ADR-0001); a continuing `unresolved` finding covers the subject it names, or the whole circle if the adjudicator did not narrow. `hc.visible_at()` returns `hidden` on that flag **before** evaluating tier, grants or shares — so the custodian and every coordinator are closed out along with everyone else, and no share and no grant lifts it (AC-PERM-11).

| Outcome | Effect |
|---|---|
| `dismissed` | The flag clears. Full access restored, every member notified, the finding logged |
| `upheld` | The flag clears and the finding is applied as an ordinary grant change — usually removing or lowering the objected-to member |
| `unresolved` | `frozen` stays true for everyone **except** coordinators other than the objected-to member, who are restored **read-only** (`hc.visible_at` capped at `view`, and `hc.approve_proposal` refuses). If the objected-to member is the only coordinator, the record stays closed. The continuing freeze stays **whole-circle by default**. Narrowing to the subject the finding names is an explicit adjudicator act requiring a recorded cross-subject exposure assessment (`narrowing_rationale`, §2.3) — because the visibility arithmetic is per subject, joint material filed under the other subject reopens with that record, and only the assessment can weigh that (ADR-0003, finding 3; standard owned by counsel, G1). No ingestion processing, no new grants, no exports, no deletions, no invites |

Inbound mail is still **accepted and stored** during a freeze — nothing is lost — but the pipeline does not advance past `stored`, and no notification is sent (PRD §7.5).

### 3.9 The admin boundary

`hc_admin` cannot read record contents because the privilege does not exist. Not a policy that could be replaced, not a route guard that could be removed.

```sql
-- Existing objects.
revoke all on all tables in schema public from hc_admin;
revoke usage on schema public, hc, storage from hc_admin;

-- Future objects.  The statements above affect only what exists TODAY; a table added
-- next year inherits whatever defaults its creating role happens to carry.
alter default privileges in schema public, hc revoke all on tables from hc_admin;

-- Postgres grants EXECUTE on every new function to PUBLIC by default, and hc_admin
-- is a member of PUBLIC.  Revoking schema USAGE blocks resolution today; this makes
-- the function grant itself deny-by-default, so a future schema grant is not
-- silently also a grant on every function in it.
alter default privileges in schema public, hc, admin_meta
  revoke execute on functions from public;
revoke execute on all functions in schema public, hc from public;

-- What hc_admin may reach: two schemas, read-only views and named operations.
grant usage  on schema admin_meta, admin_ops to hc_admin;
grant select on all tables    in schema admin_meta to hc_admin;
alter default privileges in schema admin_meta grant select on tables to hc_admin;
-- admin_ops holds ONE definer wrapper per permitted operation, granted individually.
-- There is no `grant execute on all functions in schema admin_ops`.
```

`admin_meta` views select **counts, timings, enumerated states and opaque identifiers**, and nothing that is text drawn from family material. The costume cases from PRD §9.2 are handled at the view boundary, not by asking operators to be careful:

| Admin sees | Admin never sees | How |
|---|---|---|
| An opaque arrival id | The filename | Filenames are never columns in `admin_meta`; the base column is unreachable |
| A normalized reason code | The provider's raw error string | `arrival_events.reason_code` FKs to a fixed enumeration; raw strings are never stored on the arrival at all (§2.4) |
| MIME, byte size, page count | Any page, thumbnail or extracted text | No storage grant |
| Timings, retries, transitions | Email subject, body, sender address | Not in any `admin_meta` view; `arrivals.sender_address` is unreachable |
| Circle shape: counts, tiers, dates | Any subject's name or document's name | `subjects.first_name` unreachable |
| Channel, and whether the sender was recognised | *Which* sender | The view exposes a boolean, not the address |

**A view is an intentional privilege bridge.** `admin_meta` views read their base tables as the *view owner*, which is the whole reason they work — so the real boundary is the set of view definitions plus everything reachable from them, not the absence of `hc_admin` privileges on `public`. Four CI assertions, run on every migration (AC-ADMIN-1, AC-ADMIN-6):

1. `has_table_privilege('hc_admin', t, 'select')` is **false** for every table in `public`, and `has_schema_privilege` is false for `public`, `hc` and `storage`.
2. **Transitively** through `pg_depend`, no `admin_meta` view reaches a content-bearing column: any column of `documents`, `tasks`, `timeline_events`, `profile_facts`, `extractions`, `proposals`, `episodes`, plus `subjects.first_name`, `arrivals.sender_address`, `arrivals.sender_display_name`, `circles.name`. The dependency walk must recurse through **nested views**, and the test rejects a dependency on the *column*, whatever the exposed result type — so `length(title)`, a hash, a classification or a substring is caught, because each still registers a dependency on `documents.title`.
3. **Every function reachable from an `admin_meta` view or an `admin_ops` entry point is allowlisted**, with a declared output contract. This closes what assertion 2 alone cannot: a view calling `hc.f()` depends on the *function*, not on the columns `hc.f()` reads, so function indirection would otherwise walk straight through the dependency check.
4. `hc_admin` holds `EXECUTE` on nothing outside `admin_ops`, and on `admin_ops` only on individually granted entry points.

**Admin operations are `admin_ops` wrappers**, not `hc` functions. An earlier draft revoked `usage on schema hc` from `hc_admin` while also saying admin actions run through `hc_internal` definer functions — which are *in* `hc`, so they would have been unreachable. `admin_ops` holds one narrowly-granted `SECURITY DEFINER` wrapper per permitted operation; each requires a recorded user-originated request reference, a fresh MFA challenge bound to that specific operation, and — for deletion and coordinator transfer — **two distinct admin identities in two distinct sessions** (`admin_action_approvals`, unique on `(action_id, admin_id)`, with a check that the two differ). Each writes to **that family's** access log in plain language (AC-ADMIN-4). Export is scoped to the *requesting member's* grants and delivered to that member's verified address; the admin holds no path to the archive.

**Every `admin_ops` wrapper normalises its errors.** It catches internal exceptions and returns a code from a fixed enumeration — never `SQLERRM`, never `DETAIL` or `HINT`, never dynamic SQL text, never a serialised failing row. A uniqueness violation whose message quotes a document title is record content arriving through the one channel nobody audits, and it is the same failure mode as the raw provider error string in §2.4. Constraint *names* in this schema are checked to carry no content-derived text.

### 3.10 The pipeline boundary

`hc_pipeline` has **no `SELECT` on any record table**. Interpretation genuinely needs to read the record (PRD §6.8), so it reads through one narrow definer function:

```sql
create or replace function hc.record_context_for(p_arrival_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  -- returns ONLY the record of the arrival's own subject, in the arrival's own circle,
  -- shaped for interpretation.  Cross-subject and cross-circle reads are not expressible.
$$;
alter function hc.record_context_for(uuid) owner to hc_internal;
revoke execute on function hc.record_context_for(uuid) from public, anon, authenticated, hc_admin;
grant   execute on function hc.record_context_for(uuid) to hc_pipeline;
```

And it cannot write the record: the `revoke` in §3.7 covers it. The worst outcome of a successful prompt injection is a proposal a person must read and approve, because there is no privilege by which the pipeline could do anything else (PRD §4.2.8, AC-INBOX-11).

### 3.11 Storage

No `authenticated` policy exists on the `artifacts` bucket. The browser has no direct read path, so revocation closes document access on the next request (§1.3, AC-PPL-4). Uploads use a server-minted, subject-scoped, expiring TUS token. `quarantine` has no read grant for any role, so confirmed malware is not releasable by a user action (PRD §4.2.2).

### 3.12 Performance

| Concern | Answer |
|---|---|
| Function called per row | `(select hc.ctx())` is an InitPlan: **one** call per query. `hc.visible_at()` is `IMMUTABLE` and touches no table |
| Index usage | `circle_id` leads every policy and every index. The planner narrows to one circle before the visibility test runs |
| Scale | PRD §13.3 caps a circle at 5,000 arrivals. Per-row in-memory array containment over a few thousand rows is not the bottleneck; the artifact route is |
| Leaky operators | RLS policy expressions act as a security barrier: a user-supplied predicate is not evaluated ahead of the policy unless its functions and operators are marked `LEAKPROOF`. That narrow guarantee is real and is a reason to enforce here rather than in a search service. **It is narrower than PRD §4.3.6's phrasing.** "Authorization is resolved before the query executes" is true of non-leakproof predicates; leakproof operations and the policy expressions themselves may still be reordered, and a callable `SECURITY DEFINER` function remains an independent path that no barrier constrains. What we can defend is the §4.3.6 sentence that follows it — result counts and error shapes are identical whether or not a hidden match exists — and that is what the tests assert |
| FK indexes | Every FK is indexed. Unindexed FKs are a lock-escalation and cascade-cost problem, not only a query one |

### 3.13 Tests, written before the policies

The policy suite is pgTAP, in `supabase/tests/`, and it is written **first** — before the policies exist, failing — because retrofitting permissions across nine surfaces is the most expensive mistake available on this project (PRD §3, Scope §4.8).

It has three parts. The concrete cases are in **Appendix A**, so this section stays readable as design.

| Part | Shape | Satisfies |
|---|---|---|
| **Per-domain negative tests** | Five cases, one per domain: a member without access issues the read a careless implementation would allow, and the test asserts zero rows. Repeated against an `hc_admin` session, where the expected failure is `permission denied for table` rather than an empty result — a different failure mode, and the test distinguishes them | AC-PERM-1, G2 |
| **Ordered-pair matrix** | Twenty cases (5 × 4), **generated from one rule** rather than hand-written, so a sixth domain adds ten cases automatically instead of being forgotten | AC-PERM-8, G8 |
| **Schema invariants** | Assertions about privileges, constraints and triggers rather than about rows. These catch the regression a year from now, which is the failure mode PRD §9.2 names | AC-ADMIN-1/2/3/6, N1, N2 |

**Invariants asserted on every run:** `access_level` ordinal order · the five-domain literal equals `enum_range` · every table in `public` has RLS enabled *and* forced · no record table grants write to a request-path role · `approved_by`/`approved_at` are `NOT NULL` on all five record tables · `hc.guard_row()` is attached to all five · `hc_admin` has zero `select` privilege in `public` and zero `execute` outside `admin_ops` · no `admin_meta` view transitively resolves to a content-bearing column · every function reachable from `admin_meta` or `admin_ops` is allowlisted · `access_log` rejects `UPDATE` and `DELETE` · a denial entry carrying an `object_id` is rejected by constraint · the `hc_internal` policy list has not grown without a matching definer function · every FK between two circle-scoped tables is circle-consistent.

**A.4 carries one regression test per defect found in review**, because a fix without a test is a fix that comes back:

| Defect | The assertion |
|---|---|
| Unresolved taint ran the ladder | `hc.visible_at(log-on-all-five, …, '{}', true)` returns `hidden`, not `log`. Repeated for `p_resolved = false` and for `NULL` taint. Repeated at every rung below `manage` |
| A share lifted missing subject context | With a share present and the subject absent from `ctx`, the result is `hidden`. Separately: with the subject present and **frozen**, a share still yields `hidden` |
| `hc.approve_proposal()` could not insert | A full approval commits — the test that would have caught a design that does not run |
| One approval, two objects | A writer attempting a second insert under one `proposal_commits` claim aborts |
| Taint shrank through an ordinary `UPDATE` | A direct `update … set taint = '{schedule}'` on a `{schedule,finances}` row raises `42501` |
| Propagation read stale parents | A three-level chain — root gains `finances` — asserts the **grandchild** carries it, not only the child. This is the one that would have shipped |
| Cross-circle `owner_member_id` | Rejected by the composite FK |
| Attaching a parent login | `update circle_members set account_id = …` succeeds against the live constraint, and the row still resolves to its subject afterwards |

The unit under test is `hc.visible_at()` (§3.3). Because it is `IMMUTABLE` and touches no table, it is testable as a pure function — the whole visibility model can be exercised over a table of `(grants, taint, expected level)` tuples with no fixtures at all, and the row-level tests then confirm the policies call it correctly. That separation is most of why the model was written as arithmetic in §3.1.

### 3.14 Traceability

| Criterion | Mechanism |
|---|---|
| AC-PERM-1, G2 | §3.13 + Appendix A.1 |
| AC-PERM-2 | §1.3 step 1 — no row ⇒ 404, indistinguishable |
| AC-PERM-3 | §1.3 artifact route + §3.4 (sessions) + §3.7 (write-time re-check) |
| AC-PERM-4 | §2.3 single-use acceptance UPDATE |
| AC-PERM-5 | §2.8 `access_log` grant columns |
| AC-PERM-6, AC-PERM-7 | §3.1 arithmetic, §3.3, §3.5 |
| AC-PERM-8, G8 | §3.13 generated matrix |
| AC-PERM-9 | §3.3 fail-closed substitution |
| AC-PERM-10, AC-DOC-5 | §3.6 — no propagation code exists |
| AC-PERM-11 | §3.8 — freeze evaluated before tier, grants and shares |
| AC-DOC-2, AC-INBOX-3, PRD §6.2 | §3.7 — absent write privilege, one proposal per call |
| AC-DOC-4 | §2.11 + §3.4 — the index is the row |
| AC-DOC-6 | §2.6 reclassification path |
| AC-TASK-5, AC-TASK-6, AC-TASK-7 | §3.3 care-circle ceiling, §3.6 |
| AC-TL-2, AC-TL-3 | §2.5 provenance block, `episodes` without cascade |
| AC-DOC-3, AC-TASK-4 | §2.5 — `source_arrival_id` / `approved_by` / `approved_at` are `NOT NULL`, so a row with an unresolvable source cannot exist |
| AC-TL-4 | §2.5 — `subject_id` is `NOT NULL` on every record row, and §8.4 assigns each subject a persistent accent |
| AC-INBOX-8 | §3.4 — `summary` reaches the arrival but not approval; `hc.approve_proposal()` requires `manage` |
| AC-AUTH-6 | §2.3 — `hc.create_circle()` writes the custodianship declaration at `seq = 1`, before any other row |
| AC-PPL-3 | §2.3 subject-member row |
| AC-PPL-4 | §1.3 + §3.11 |
| AC-PPL-5, AC-PPL-7 | §2.8 hash chain, `denial_names_no_object`, `collapsed_count` |
| AC-ADMIN-1, AC-ADMIN-2, AC-ADMIN-3, AC-ADMIN-4, AC-ADMIN-6 | §3.9 privileges + §2.3 composite FK + CI assertions |
| AC-INBOX-11, AC-INBOX-12 | §3.10 pipeline privileges, §2.4 `approval_attempts` |

**Gates this section makes satisfiable:** G2 (the red-team is a suite, not an exercise), G8 (generated from one rule), G13 (idempotency and stale-grant cases are testable against real functions), and the database half of G15.

---

## 4. Ingestion pipeline

`arrive → store → scan → normalize → extract → interpret → propose`. Idempotent, resumable, cancellable, and — because the Care Inbox renders pipeline state directly (PRD §4.2.2) — **the state machine is the product surface**, not an implementation detail behind one.

### 4.1 Channel is a property, not a branch

There is one pipeline. `arrivals.channel` records how something got here and changes nothing downstream. An adapter turns a channel-specific payload into an `arrivals` row plus bytes in Storage, and hands off; every stage after that is channel-blind.

```
lib/mail/inbound.ts   ─┐
app/api/upload         ─┼─► hc.create_arrival(circle, subject, channel, …) ─► pgmq
(Phase 2: lib/sms)     ─┘
```

Adding SMS in Phase 2 is one adapter, one enum value on `channel`, and one provisioning path in §5. It is not a second pipeline, and no stage below acquires a conditional.

### 4.2 The transition primitive

Every state change in the system goes through one function. Stage workers never `UPDATE arrivals` directly; they hold no privilege to.

**The result is an enumerated outcome, not a boolean.** A worker must be able to tell "someone else already did this" from "this record is frozen" from "I was given the wrong entry state" *before* it acknowledges the queue item — those need different handling, and collapsing them to `false` means the worker either retries something it must not, or drops something it must retry.

```sql
create type hc.advance_result as enum
  ('advanced','already_advanced','cancelled','frozen','invalid_state','stale_lease');

create or replace function hc.advance_arrival(
  p_arrival uuid, p_from hc.arrival_state, p_to hc.arrival_state,
  p_lease uuid, p_reason text default null)
returns hc.advance_result language plpgsql security definer set search_path = '' as $$
declare v_state hc.arrival_state; v_frozen boolean;
        v_circle uuid; v_current uuid; v_attempt int;
begin
  -- Row lock first, so the diagnosis, the fence and the swap see the same row.
  select a.state, a.circle_id, a.current_lease_id,
         hc.circle_frozen(a.circle_id, a.subject_id)
    into v_state, v_circle, v_current, v_frozen
    from public.arrivals a where a.id = p_arrival for update;

  -- FENCE FIRST.  A worker past its deadline must lose even if it arrives here
  -- before the worker that superseded it.  Validated, not merely joined.
  select l.attempt_no into v_attempt
    from public.pipeline_leases l
   where l.id = p_lease
     and l.id = v_current              -- is the current attempt for this arrival
     and l.arrival_id = p_arrival      -- belongs to THIS arrival
     and l.closed_at is null           -- still open
     and l.deadline > now();           -- not expired
  if v_attempt is null then return 'stale_lease'; end if;

  if v_state = 'cancelled'                     then return 'cancelled';       end if;
  -- A frozen record accepts and stores mail but does not process it (PRD §7.5).
  -- One choke point, so no stage can forget — and the arrival is PARKED, not failed.
  if v_frozen and p_to not in ('stored','store_failed') then return 'frozen'; end if;
  if v_state = p_to                            then return 'already_advanced'; end if;
  if v_state <> p_from                         then return 'invalid_state';   end if;

  update public.arrivals set state = p_to where id = p_arrival;

  -- Unconditional: v_circle and v_attempt are already bound, so this cannot
  -- silently write zero rows while the state change stands.
  insert into public.arrival_events(arrival_id, circle_id, from_state, to_state,
                                    reason_code, attempt)
  values (p_arrival, v_circle, p_from, p_to, p_reason, v_attempt);

  update public.pipeline_leases set closed_at = now(), outcome = 'advanced'
   where id = p_lease;

  return 'advanced';
end $$;
```

**Two defects an earlier draft of this function carried, both now closed.** It joined `pipeline_leases` inside the event `INSERT … SELECT`, so an unresolvable `p_lease` wrote **zero event rows while the state update stood and the function returned `advanced`** — a state change with no audit trail, reported as success. And it never checked that the lease was *current*, so a worker whose lease had expired could still advance the arrival after a second worker had claimed the next attempt. The fence now runs before anything mutates, and the event insert takes already-bound values so it cannot degrade to a no-op.

| Result | Worker does |
|---|---|
| `advanced` | Proceed; ack the queue item |
| `already_advanced` | Ack and exit — at-least-once delivery, correctly absorbed |
| `cancelled` | **Discard the result**, ack, exit (§4.5) |
| `frozen` | Ack and exit. The arrival is **parked**, not failed — see below |
| `invalid_state` | Ack and exit; raise a defect signal. A worker holding a stale view of the state machine is a bug, not a retry |
| `stale_lease` | **Discard the result**, ack, exit. This worker was superseded — another attempt owns the arrival, and publishing now would duplicate or overwrite its work |

**Frozen arrivals are parked, and parking is not a failure.** This is the loop the enumerated result exists to prevent: a frozen arrival sits in an entry state forever, the sweeper re-queues it, the freeze predicate refuses, and — because the *terminal* transition is refused by the same predicate — it can never reach a terminal state either. So:

- **The sweeper skips arrivals under an open freeze**, for both re-queueing and age exhaustion.
- **A freeze consumes no retry budget.** Time parked is not time spent failing.
- **Only `dismissed` resumes processing.** An earlier draft also resumed on the read-only half of `unresolved`, which **contradicts §3.8** — `unresolved` permits no ingestion processing, no new grants, no exports, no deletions and no invites, and restored coordinators are read-only. Resuming extraction under it would have quietly re-enabled the one thing that state exists to stop. `upheld` and `unresolved` both leave arrivals parked until a finding says otherwise.
- **Re-enqueue is durable, and it is not the only path back.** A queue API call cannot join the adjudication transaction, so `dismissed` writes rows to an **outbox table in the same transaction that clears the freeze**, covering every parked arrival in the circle including children, and a relay drains it. If a message is lost anyway, the arrival is not stranded: once no freeze is open, the ordinary sweeper considers it eligible again. Adjudication-committed-but-delivery-failed is a delay, not a lost document.
- **Queue-age alerts exclude parked work** (§4.11), so a frozen record does not read as a processing backlog and mask a real one.

Two properties come from the CAS rather than being coded per stage — and one claim from an earlier draft is withdrawn:

- **At-least-once delivery is safe.** A re-delivered message returns `already_advanced`.
- **A cancelled arrival cannot be advanced**, so the in-flight result is discarded (§4.5).
- **~~A crashed stage leaves no half-state.~~** That was too strong. The transition is atomic with its `arrival_events` row and with nothing else. A crash can leave Storage objects, `scan_results`, rendered pages, `extraction_runs`, `extractions` and `proposals` already written. §4.3's lease and §4.5's finalization are what actually make those recoverable; the CAS alone is not.

`reason_code` references `hc.reason_codes`, a fixed enumeration. **A provider's raw error string is never stored anywhere on the arrival** — it is logged to the operational tier (§2.10) with the circle's own protections and never reaches admin (§3.9, AC-ADMIN-6).

### 4.3 The stages

| Stage | Entry → exit | Idempotency key | Bounded by |
|---|---|---|---|
| **store** | `received` → `stored` \| `store_failed` | `content_sha256` — the Storage key is content-addressed, so re-running writes the same object | 1 retry. `store_failed` says plainly that **nothing was kept**, rather than implying a copy exists (PRD §4.2.2) |
| **scan** | `stored` → `scanned` \| `quarantined` \| `scan_unavailable` \| `scan_inconclusive` | `content_sha256` → `scan_results` cache, which doubles as the 7-day malware hash-and-verdict retention (PRD §11.5) | 3 retries over 30 min, then `scan_unavailable` |
| **sender gate** | `scanned` → `extracting` \| `held_unknown_sender` | — | Not a retry; a guard. Held mail waits for a person indefinitely, then expires at 30 days (§5.4) |
| **normalize** | inside `extracting` | `(arrival, page)` — page images are content-addressed too | Encrypted PDF → `needs_password`; undecodable → `unsupported_type` |
| **extract** | `extracting` → `extracted` \| `extract_failed` \| `extract_timeout` \| `cancelled` | `extraction_runs(arrival, model_id, prompt_version, attempt)` — a re-run **supersedes**, never appends, so a retry cannot double a fact | 2 retries; 5 min wall clock (PRD §13.2 ceiling) |
| **interpret** | `interpreting` → `proposals_ready` \| `cancelled` | Proposals carry `version` + `supersedes_id`; a re-interpret supersedes pending ones | 2 retries |

**The budgets in that table need a counter that survives a crash, and `arrival_events.attempt` is not one.** An event row is written only *after* a successful transition, so it counts successes. A worker that dies at the provider call — timeout, OOM, deploy — increments nothing, and the sweeper re-queues it forever against a budget it can never observe. The budget has to be claimed **before** the external work, not recorded after it.

```sql
create table public.pipeline_leases (
  id          uuid primary key default gen_random_uuid(),
  arrival_id  uuid not null references public.arrivals(id) on delete cascade,
  circle_id   uuid not null references public.circles(id),
  stage       text not null,
  attempt_no  int  not null,
  started_at  timestamptz not null default now(),
  deadline    timestamptz not null,          -- the stage's wall clock (§4.3)
  outcome     text check (outcome in ('advanced','failed','expired','cancelled','frozen')),
  closed_at   timestamptz,
  unique (arrival_id, stage, attempt_no)
);
create index leases_open on public.pipeline_leases (deadline) where closed_at is null;
```

`arrivals` carries `current_lease_id uuid`, which is what §4.2's fence compares against — one column, so "is this worker still the owner" is a single equality rather than a reconstruction.

`hc.claim_stage(arrival, stage)` is the only way in. It takes the row lock, expires any lease past its `deadline` (marking it `expired`, which is what distinguishes a dead worker from a slow one), **increments `attempt_no` durably**, sets `arrivals.current_lease_id`, and refuses the claim when the stage's budget is spent — returning `exhausted` so the caller moves the arrival to its terminal state **without calling the provider at all**.

**The claim commits in its own transaction, before any external work begins.** This is the whole mechanism and it is easy to lose: if the claim and the provider call sat inside one surrounding transaction, a rollback would roll back the attempt too, and the counter would be exactly as unenforceable as `arrival_events.attempt` was. The worker's sequence is `claim → COMMIT → external work → finalize` (§4.5), and a crash anywhere after the commit has already burned the attempt. That is the point.

**A superseded worker cannot publish**, even if it comes back. Claiming attempt N+1 moves `current_lease_id`, so the previous worker's lease is no longer current and §4.2's fence returns `stale_lease` — regardless of whether the late worker reaches finalization *first*. Expiry is not a hint that a worker is dead; it is the moment ownership transfers, and the fence is what enforces that rather than hoping the old worker noticed.

**Ordering is not negotiable at two points.** Nothing is rendered, downloaded, or sent to an AI provider before `scan` clears it — the artifact route checks `scan_verdict = 'clean'` independently (§1.3), so a pipeline bug cannot expose an unscanned file. And **an arrival at `held_unknown_sender` is never read by the AI** (AC-INBOX-7): the gate sits before `extracting`, so holding is the absence of a transition rather than a stage that could be skipped.

**Scan failure and scan positive are different states and never collapse.** `quarantined` means the scanner *confirmed* malware: not rendered, not downloadable, not releasable by any user action, and never sent to a provider. `scan_unavailable` and `scan_inconclusive` mean we do not know: the artifact is downloadable with the reason stated, and it is never presented as cleared. Telling a family their mother's discharge summary is malware because a scanner timed out is its own kind of harm (PRD §4.2.2, AC-INBOX-15).

### 4.4 Product state, and the parent's state

The family sees a product-facing state derived from the internal one. For a leaf arrival it is a pure mapping; for a parent it is **the least-advanced child's state** (PRD §4.2.2).

```sql
create or replace function hc.product_state(p_arrival uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    -- a parent reports its least-advanced child
    (select hc.state_label(min_by_rank(c.state))
     from public.arrivals c where c.parent_arrival_id = p_arrival and c.deleted_at is null),
    (select hc.state_label(a.state) from public.arrivals a where a.id = p_arrival));
$$;
```

**Partial failure is the normal case.** In a four-attachment email, two children can be `Needs you` while a third is `Couldn't read it` and a fourth `Needs a password`. Each child advances independently; the review screen presents all four honestly and blocks on none (AC-INBOX-13). The parent's rolled-up state exists for the inbox list only — opening the arrival shows the children as they actually are.

### 4.5 Cancellation

A first-class transition from `extracting` or `interpreting`, available to any member who can approve.

**What it guarantees:** nothing is persisted and nothing is shown. **The CAS alone does not deliver that**, and an earlier draft claimed it did. `hc_pipeline` holds direct `INSERT` on `extractions` and `proposals` (§1.2), so a worker that wrote its facts and *then* attempted the transition would leave them behind when cancellation won the swap — a cancelled arrival with committed extractions attached.

**Publication is therefore one transaction, and the transition gates it:**

```sql
create or replace function hc.finalize_extraction(
  p_arrival uuid, p_lease uuid, p_facts jsonb, p_proposals jsonb)
returns hc.advance_result language plpgsql security definer set search_path = '' as $$
declare v hc.advance_result;
begin
  -- The conditional transition runs FIRST, in this transaction.
  v := hc.advance_arrival(p_arrival, 'extracting', 'extracted', p_lease);
  if v <> 'advanced' then
    return v;                    -- cancelled / frozen / already: nothing below runs
  end if;
  -- Reached only on a won transition; commits with it or not at all.
  perform hc.write_extractions(p_arrival, p_lease, p_facts);
  perform hc.write_proposals(p_arrival, p_lease, p_proposals);
  return 'advanced';
end $$;
```

`hc_pipeline` loses direct DML on `extractions` and `proposals` and gets `EXECUTE` on this instead — the same move §3.7 makes for the record tables, one layer down. A cancellation that wins the transition means the facts were never written, rather than written and orphaned.

**Large intermediate artifacts** — rendered pages, OCR output — are staged under an attempt-scoped Storage key (`…/attempt/<lease_id>/…`), unreachable from any user-facing path, and garbage-collected when the lease closes as anything other than `advanced`. Bytes cannot join a database transaction; keeping them unaddressable until the transaction wins is the closest equivalent.

**What it does not guarantee:** that no computation happens. A request already dispatched to an AI provider is not recalled. The artifact is kept. This limit is stated in the interface rather than implied, and what the provider does with an in-flight request is a **G3** question — one of the four terms a provider must answer, not a UI concern (PRD §4.2.2).

### 4.6 Multi-attachment arrivals

A forwarded email with four attachments is **one parent arrival plus four children** — five rows (AC-INBOX-5). The parent carries the email itself: headers, body, and the forwarder's own note, which is frequently the most useful sentence in the whole thing, so the parent is extracted from like any other source rather than treated as an envelope.

Children carry `parent_arrival_id`, inherit `circle_id` and `subject_id`, and are queued independently. Rejecting everything in one child does not affect the others. One receipt is assembled at the end from whatever was filed across the group.

Bounds from PRD §13.3: 20 attachments per email, 50 MB per file, 200 pages per file. Archive decompression is bounded in depth, entry count and expanded size, and a MIME type is validated against **actual content**, never the declared type or the extension (PRD §4.2.8, AC-INBOX-14).

### 4.7 Duplicates

Detected at two points, because the cheap check does not catch the interesting case (PRD §8.9):

1. **After store** — exact `content_sha256` match against non-deleted arrivals in the circle. Catches the same file forwarded twice.
2. **After extract** — key-field match against filed documents: document type, date, provider, amount, policy number. Catches the same discharge summary arriving as a PDF from the hospital and a phone photo from a sibling.

Either produces `duplicate_suspected` and the row reads *"This looks like the discharge summary you filed on Jul 12."* Two outcomes: **same thing** attaches the new arrival to the existing document as an additional source — a `provenance_edges` row, so the document now cites both — and files nothing new; **different** proceeds normally. **Never auto-discarded**, in either direction.

### 4.8 Conflicts

Interpretation is the differentiating step and the one that must never be silently right or silently wrong (PRD §6.8). When new material disagrees with the record, the AI raises a conflict **as a proposal of its own** rather than resolving one.

`hc.proposal_kind = 'conflict'` carries the existing fact, the new value, both provenances, and three outcomes:

| Outcome | What is written |
|---|---|
| **Use the new one** | A new `profile_facts` row; the old row gets `superseded_at` and `superseded_by_id` in the same transaction. Both provenances intact. The `profile_facts_current` partial unique index (§2.5) makes this the *only* way to change a current value — a plain overwrite has nowhere to go |
| **Keep what's there** | Nothing written to the record. The conflict is logged and the proposal closes as `rejected` |
| **Keep both and ask** | No fact written; a task is drafted instead |

Conflicts the pipeline must raise in Phase 1: a medication duplicating or contradicting a current one · a follow-up window with no matching timeline event or task · an instruction contradicting a standing routine in the record · a date or amount matching an existing timeline event · a document superseding one already filed. **A change to any high-risk field (PRD §6.4) is always a conflict**, never a quiet update, even when old and new came from the same kind of document.

### 4.9 Proposal versioning and the approval boundary

Two coordinators is a design goal, so two people reviewing one arrival at once is expected (PRD §4.2.9).

- **Proposals are versioned.** The review screen renders `version`; approval submits it as `p_expected_version`. If the arrival, its extractions, or the target record changed since render, `hc.approve_proposal()` refuses and the item re-renders with what changed highlighted. Nobody approves something other than what they read.
- **Approval is idempotent**, keyed by a client-supplied idempotency key against `approval_attempts` (§2.4). A double-click, a retried request and a re-delivered job produce exactly one committed result — including the case where the first attempt failed *before* committing, which must still produce the intended write (AC-INBOX-12).
- **One proposal, one object, one transaction**, enforced by `proposal_commits` rather than by the function signature (§2.4, §3.7). Filing a document, creating a task and writing a timeline event are separate proposals that commit independently, which is what stops the transaction layer smuggling bulk approval back in.
- **Access is re-checked at write time**, never at render time (§3.7). A grant lowered while the review screen sat open cannot be approved against.
- **Presence, not locking.** If another member has the arrival open, the screen says so in muted text. A family should not be able to lock each other out of their own record, but two siblings should not both book the cardiologist.

### 4.10 Prompt injection

A mailed document is untrusted input to a language model and can carry instructions aimed at this pipeline. Three defences, in descending order of strength — and the ordering is the point:

1. **The pipeline has no privilege to do what an injection would ask.** `hc_pipeline` cannot write the record, cannot create a grant, cannot assign work, and reads the record only through `hc.record_context_for()` (§3.10). The worst outcome of a fully successful injection is **a proposal a person must read and approve**. This is the concrete reason PRD §6.5 is absolute rather than a sensible default (AC-INBOX-11).
2. **Source text reaches interpretation as delimited data**, never as instruction, with the system prompt stating that document content is data.
3. **Anomaly flagging.** A proposal referencing permissions, accounts, other circles, or the product's own mechanics sets `anomaly_flags`, renders with a plain warning, and is counted in PRD §10.4.

Defence 1 is structural; 2 and 3 are mitigations. If 2 and 3 both fail entirely, the guarantee still holds.

### 4.11 Retries, queue age, and the sweeper

Retry budgets belong to the pipeline, not the interface. Each stage has a bounded budget (§4.3); exhaustion is a **terminal state with a stated reason** — never an infinite spinner, never an arrival that disappears.

**Backpressure sheds processing, never acceptance** (PRD §13.1). Mail accepted at the SMTP boundary is never lost because the pipeline is behind; the arrival shows as `Arrived` the entire time. The bound that stops "queued" becoming a synonym for lost: **maximum queue age 4 hours**, after which the coordinator is told plainly that reading is delayed.

**The sweeper is the detector**, and it exists for the same reason the taint sweep does in §2.6 — a fail-closed state is only real if something notices. Every minute it:

- re-queues arrivals sitting in an entry state past their stage deadline;
- moves arrivals past their total budget to a terminal state with a reason;
- alerts on queue age over 4 hours;
- reports arrivals in a non-terminal state for over 24 hours as a **defect signal**, not routine cleanup.

### 4.12 Traceability

| Criterion | Mechanism |
|---|---|
| AC-INBOX-3, PRD §6.2 | §4.9 + §3.7 — one proposal per call, `proposal_commits` |
| AC-INBOX-4 | All proposals rejected ⇒ `nothing_filed`; the original is retained and re-readable |
| AC-INBOX-5, AC-INBOX-13 | §4.6 — parent + N children, independent advance, honest partial state |
| AC-INBOX-6 | §4.8 — supersession is the only path to changing a current fact |
| AC-INBOX-7 | §4.3 — the sender gate precedes `extracting` |
| AC-INBOX-11 | §4.10 defence 1 — absent privilege |
| AC-INBOX-12 | §4.2 CAS + `approval_attempts` |
| AC-INBOX-14 | §4.6 bounds, content-sniffed MIME |
| AC-INBOX-15 | §4.3 — `quarantined` and `scan_unavailable` are distinct states |
| AC-DOC-2 | Upload creates an arrival and passes through review; no write path bypasses it |

**Gates:** G7 (the abuse cases have states to land in), G9 (extraction runs are versioned by `model_id` + `prompt_version`, so an evaluation set is reproducible), G13 (concurrency and idempotency are testable against `hc.advance_arrival` and `approve_proposal`).

---

## 5. Forwarding address and Auth

### 5.1 The address

One address per subject, provisioned at circle creation and **activated only after the founder's email is verified** (PRD §4.1.2).

**A decision the PRD does not make.** The mock shows `nell@harperscircle.app`. First names are not globally unique and will collide within the first dozen families, so the local part is `<firstname>.<6-char token>@harperscircle.app` — `nell.a7f3k2@…`. Three consequences, stated so the copy can be judged rather than discovered:

- It is still readable aloud and recognisably Nell's, which is what the completion screen and Home need (PRD §4.1.3, §4.7.1).
- The token makes the address **unguessable**, which materially reduces drive-by spam at an address that is otherwise a published attack surface (PRD §4.2.8).
- It is longer than the mock. The completion screen and Home already render it with a copy control, so the cost is visual, not functional. **If you would rather keep bare first names**, the alternative is a per-circle subdomain (`nell@harper-a7f3.harperscircle.app`), which is harder to type and no shorter. This is your call and it is one column.

| Lifecycle | State |
|---|---|
| Circle created (setup step 2) | `subjects.forwarding_local_part` allocated. **Not provisioned at the provider.** |
| Founder verifies email | The route is created at Postmark; `forwarding_active_at` set; access-log entry written |
| Before verification | The address **does not exist at the MTA**, so mail receives a genuine `550 no such user`. AC-AUTH-3 is satisfied by absence rather than by policy — there is no code path that could accept and then decide |
| Subject deleted, circle deleted | Route removed at the provider first, then the local part released |

### 5.2 The inbound webhook

```
POST /api/inbound/postmark
  1. Verify the provider's signature and the request's source.  Unsigned ⇒ 401, logged.
  2. Resolve the recipient local part → subject.  No match ⇒ 550 at the provider
     (the route does not exist), so this branch is defence in depth only.
  3. Quota check (§5.4).  Over ⇒ reject per §5.4's bounce rule.
  4. Evaluate sender authentication (§5.3).  Store the verdict verbatim.
  5. hc.create_arrival(parent) + one child per attachment, in ONE transaction.
  6. Enqueue.  Return 200.
```

**Step 5 returns before any processing.** Acceptance and processing are separate concerns and the 99.9% inbound-acceptance objective (PRD §13.1) belongs to acceptance alone. A pipeline outage delays reading; it never bounces a family's document.

### 5.3 Sender authentication

Recognising a sender is a **risk signal, not proof of identity**. A `From:` header is trivially forged.

**The test is aligned DMARC, not three green lights.** Requiring SPF, DKIM and DMARC each to pass independently is stricter than DMARC itself and would break the product's primary channel — SPF routinely fails on forwarded mail, which is exactly what this address exists to receive.

```
authenticated  ⟸  DMARC pass via aligned SPF
               OR  DMARC pass via aligned DKIM
               OR  SPF broke in transit AND a valid ARC chain from a recognised forwarder
otherwise      ⟹  unauthenticated ⟹ held
```

Four implementation details that decide whether this works:

- **Trust is established by `authserv-id`, not by position.** An attacker controls the entire header block of the message they send, including forged `Authentication-Results`. Trace headers are prepended, so the receiving MTA's verdict is normally above the attacker's — but "take the topmost one" is defence in depth, not a trust root, and it stops being true the moment a second internal relay is added. The actual chain:
  1. **Prefer the provider's authenticated webhook fields.** Postmark reports SPF/DKIM/DMARC out of band, in a payload whose signature we verified before reading anything (§5.2). Data that never travelled through attacker-controlled MIME is the strongest form available.
  2. Where a header must be parsed, require an `Authentication-Results` bearing **our configured `authserv-id` exactly**, and bind it to the trusted receiving hop in the `Received` trace.
  3. **Configure the inbound MTA to strip or rename incoming `Authentication-Results` before adding its own**, so a forged header never survives to be considered.
  4. **ARC counts as authenticated only after cryptographic chain validation** against an explicit trusted-sealer list. The presence of an ARC set proves nothing — anyone can add one. This is the difference between accepting a legitimately forwarded message (AC-INBOX-16) and accepting anything that claims to be one.
- **Display name is never matched.** `"Dr. Patel" <attacker@elsewhere.com>` matches no known sender. Matching is on the address and the domain, both stored, and `sender_display_name` is stored for display only and is never an input to the verdict.
- **Lookalike domains score separately.** A `pg_trgm` similarity check against the circle's `known_senders` domains: a near-miss on a known sender is treated as **more** suspicious than an unrelated domain, not less, and produces `auth_result = 'lookalike'`, which is held with its own reason.
- **The verdict is shown, not just stored** — `from cardiology@… · verified` / `· unverified · we couldn't confirm this came from them` (PRD §4.2.8).

**Recognition is not identity.** An accepted sender still has to pass this test on every message, so a spoofed `From:` from a known practice is a stranger's mail, not trusted mail (PRD §8.4). Acceptance is per circle, revocable, effective immediately, and does not retroactively unfile what that sender already sent.

### 5.4 Quotas and the bounce rule

Per circle and per sender: messages per hour and per day, attachment count, individual file size, total inbound bytes, and a monthly processing ceiling that **notifies the coordinator rather than failing quietly** (PRD §4.2.8).

**When to bounce and when to drop**, because getting this wrong makes us a backscatter source:

| Case | Action |
|---|---|
| Address not yet active | `550` from the provider — the route does not exist (§5.1) |
| Over quota, message is **DMARC-aligned** | Bounce with a reason the sender can read. We know who it came from |
| Over quota, message is **unauthenticated** | Dropped. Not stored, not bounced. Bouncing forged mail sends our reply to the forged victim, and PRD §4.2.8 asks for "rejected at ingress rather than stored" — not for a bounce |
| Blocked sender | Same rule as over-quota |
| Circle over its hard capacity limit (PRD §13.3) | Bounce with the limit in plain words. **Everything else keeps working** — reading, search, tasks, security email, export and deletion. A family at their limit can always still get their record out and can always still delete it. Nothing is ever deleted to make room |

Unaccepted mail from unrecognised senders **expires at 30 days**, warned in the inbox first. The promise that nothing is discarded covers the family's own material; extending it to unsolicited mail would make us a permanent store for content that is expensive to hold and occasionally illegal to hold.

### 5.5 Auth

Supabase Auth, email and password. No social sign-in, no magic links, no phone codes.

| Requirement | Implementation |
|---|---|
| Password ≥ 10 chars, breached-list checked, **no composition rules** | Supabase Auth minimum length + leaked-password protection (HIBP). Composition rules are explicitly *not* configured |
| 30-day session on a remembered device | JWT with a short expiry plus refresh-token rotation; the 30 days is the refresh token's life |
| Reset: single-use, 30-minute expiry | Supabase recovery flow with the expiry lowered from its default |
| Sign out everywhere | `signOut({ scope: 'global' })`, plus an `access_log` entry |
| Optional second factor | **TOTP** via Supabase MFA is straightforward. **Passkeys** are the larger piece of work and are costed separately rather than assumed — flagged now so "optional TOTP or passkey" (PRD §4.1.1) is not read as two equal-cost items |

**The JWT carries identity and nothing else. It never carries grants, tier, or circle membership.** This is the single decision that makes revocation instant: `hc.ctx()` reads live tables on every request, so a lowered grant takes effect on the next query with no token refresh, no cache expiry, and no session state to invalidate. Putting grants in claims would have made "immediate" mean "within one token lifetime," which PRD §4.6.3 explicitly rejects.

**Never enumerate accounts.** "Email already registered" is shown identically whether or not the address exists, and the API response is byte-identical in both cases. The distinction is delivered by email, to the address, where it is safe (PRD §4.1.7).

### 5.6 Throttling, not lockout

A hard lockout hands an estranged sibling a way to lock a coordinator out of their mother's medical record from a coffee shop, on demand. Lockout is a weapon in this population (PRD §4.1.1).

- **Two independent dimensions.** Per-account counters in `auth_attempts` (Postgres), and per-network rate limiting at the Vercel WAF. Both must be present: per-account alone lets a botnet spread its attempts; per-network alone lets an attacker rotate addresses.
- **Progressive delays**, escalating per dimension. Any hard lock is **time-boxed to 15 minutes** and never blocks the email reset path.
- **A suspicious-attempt notice** goes to the account holder with a "this wasn't me" link (§5.8).
- The invariant, and it is a test: **there is no state a stranger can put an account into that a legitimate holder cannot leave within the hour** (AC-AUTH-12).

### 5.7 Step-up re-authentication

A 30-day session is right for daily use and wrong as a standing authorization to give someone access to a parent's financial records.

Required, regardless of session age, before: **export · circle deletion · account deletion · raising a grant · sharing an object · transferring the coordinator role · changing the account's email or password.**

```sql
create table public.step_up_tokens (
  token_hash bytea primary key,
  account_id uuid not null references public.accounts(id),
  operation  text not null,          -- fixed enumeration
  target_ref text,                   -- bound to the specific object or member
  aal        text not null,          -- the factor actually used
  expires_at timestamptz not null,   -- now() + 5 minutes
  consumed_at timestamptz
);
```

The definer functions for those operations take `p_step_up_token` and verify it is unconsumed, unexpired, and **bound to this operation and this target**. A token minted to share one document cannot approve a circle deletion. Re-authentication uses the strongest factor the account has enrolled.

### 5.8 Revocation, across every channel

PRD §4.6.3 defines "immediate," and each row is a separate acceptance test (AC-PPL-4).

| Channel | Mechanism |
|---|---|
| Sessions and refresh tokens | Revoked via the Supabase admin API. **A member of several circles is signed out of all of them and can sign back in, retaining the others** — the cost is stated rather than hidden, and it is acceptable because RLS, not the session, is the enforcement |
| Reads | `hc.ctx()` is live. The next request returns nothing, with no token refresh needed (§5.5) |
| Document access | The artifact route re-checks per request (§1.3). No long-lived signed URL exists to outlive the grant |
| Cached responses | User-scoped responses are `private, no-store`; nothing personal is cacheable at a shared layer |
| Background jobs | Authorization is checked at execution, never at enqueue |
| Queued notifications | Suppressed at send time by a fresh check (§5.9) |
| Generated exports | Download links revoked in the same transaction as the grant change |
| Search index | The index is the row (§2.11), so it moves with the policy |
| Object shares | Revoked with the domain grant unless a coordinator explicitly keeps one — and §3.3 clause 1 means a kept share on a subject the member no longer reaches grants nothing anyway |

**The one honest limit:** a file already downloaded to someone's device cannot be recalled. The interface says exactly that, in those words, at the moment of revocation.

**Revoking someone holding open tasks:** their open tasks become unassigned and surface for the coordinator, labelled with who held them; their completed work stays attributed. Revocation and unassignment are separate log entries with the same timestamp (PRD §8.8).

### 5.9 Notifications

Eight messages in three classes (PRD §4.8). The class is a column, not a runtime judgement.

**Authorization is checked at send time, per recipient, against live grants and derived-object taint** — never at enqueue. The worker calls **`hc.notification_visible(notification_id)`** (§3.2), which reads the recipient off the queued row and evaluates `hc.visible_at()` for that account, so a member revoked between enqueue and send receives nothing about the record (AC-NOTIF-2). The worker names the notification, never an identity — it cannot ask what an arbitrary account can see.

**Security-class mail is the explicit exception**, and it has to be. A revocation notice is addressed to the person whose access just ended; a send-time authorization check would suppress precisely the message they are owed. So security-class mail goes to the **verified account address regardless of circle access** and carries no subject, domain, or record information — it names the circle, says access changed, and says who changed it. That is about them, not about the record.

`hc.send_notification()` therefore branches on class **before** the authorization check, and the two paths are separate functions with separate templates so the exception cannot be widened by accident.

**Nothing sensitive in a subject line or a body** — no document names, no diagnoses, no amounts, no sender addresses, no extracted facts (AC-NOTIF-1). A notification says *something happened* and links into the product, where authorization is real. A CI test asserts every template renders without interpolating any field from a record table.

**Hard bounce suppresses everything, including security class**, because it must: continuing to send to a dead address damages deliverability for every family and notifies nobody. The failure is then **raised in-product** to reachable coordinators — *"We can't reach Dan at that address"* — with a repair path. If the only coordinator's address becomes undeliverable, the circle enters an operational state visible in admin as metadata and surfaced on Home.

### 5.10 Invites

Token: 32 random bytes, delivered in the link, stored **only as `sha256`** (§2.3). Bound to the invited address, 7-day expiry.

Acceptance is one transaction: `update invites set accepted_at = now() where id = $1 and accepted_at is null and revoked_at is null and expires_at > now()` — then insert the membership and the grants for the tier. **A replayed token updates zero rows and the transaction aborts, creating nothing** (AC-PERM-4, PRD §8.5). No membership row exists before acceptance, so there is no ghost member to clean up.

**Identity mismatch forces re-authentication as the invited address.** An invite grants access to a family's medical and financial records, and a stale session on a shared laptop is not consent (AC-AUTH-11).

**AC-AUTH-8 — the ceiling copy cannot drift.** The invite screen's tier ceiling and the accept screen's tier description are rendered from one module, `lib/permissions/tiers.ts`, which also generates the default grants written at acceptance. A snapshot test asserts both screens render from it, so the copy and the grants it describes cannot diverge — the failure mode is a screen promising a ceiling the grants do not implement.

**No invite can be issued from an unverified account** (AC-AUTH-4), enforced in `hc.create_invite()`, not in the form.

### 5.11 The "this wasn't me" link

A privileged control, specified as one. It terminates every session and forces a password reset, so whoever holds that mailbox holds a kill switch.

- **Single-use, 15-minute expiry, bound to the specific security event** that produced it — not a general-purpose reset.
- **Non-enumerating**: it reveals nothing about whether the account exists to anyone who did not receive the mail.
- **Clicking it opens a confirmation page and does nothing else.** Corporate mail scanners pre-fetch links; sessions are destroyed only on an explicit `POST` from that page, never as a side effect of the link being visited.

### 5.12 Traceability

| Criterion | Mechanism |
|---|---|
| AC-AUTH-3 | §5.1 — the route does not exist before verification |
| AC-AUTH-4 | §5.10 — `hc.create_invite()` |
| AC-AUTH-8 | §5.10 — one module generates both the copy and the grants |
| AC-AUTH-10 | §5.5 — global sign-out |
| AC-AUTH-11 | §5.10 — re-auth as the invited address |
| AC-AUTH-12 | §5.6 — the one-hour invariant |
| AC-PERM-3, AC-PPL-4 | §5.8 — every channel, each separately testable |
| AC-PERM-4 | §5.10 — conditional `UPDATE` |
| AC-INBOX-10, AC-INBOX-16 | §5.3 — aligned DMARC, ARC accepted, forged `Authentication-Results` stripped |
| AC-NOTIF-1, AC-NOTIF-2, AC-NOTIF-3 | §5.9 |

**Gates:** G4 (verification enforcement is structural), G7 (§5.3 and §5.4 cover the named abuse cases including legitimate forwarded and mailing-list mail), G14 (§5.7 gives export its re-authentication).

---

## 6. AI layer

**The stance: extract and suggest; a person approves everything.** What makes that survivable is not the prompt — it is §3.10. The pipeline role cannot write the record, cannot create a grant, cannot assign work, and reads the record only through `hc.record_context_for()`. Everything below assumes those privileges are absent, which is why an injected instruction, a hallucinated fact, and a model swap all have the same blast radius: **a proposal a person must read**.

### 6.1 Provider and models

**Anthropic Claude**, via the Messages API, vision on rendered page images.

| Stage | Model | Why |
|---|---|---|
| **Extraction** | `claude-opus-5` | Vision on handwriting, pill bottles and phone photos taken at an angle is the whole job. Opus 5 is in the high-resolution tier — 2576 px on the long edge, coordinates 1:1 with pixels, so no scale-factor math between what the model reports and what we crop. $5 / $25 per MTok |
| **Interpretation** | `claude-opus-5` | The moat (PRD §6.8). Reads the subject's existing record and reasons about conflict, supersession and duplication. This is the stage worth being slow and careful about |
| **Re-reads, cheap passes** | `claude-sonnet-5` | Same 2576 px vision tier and structured outputs, $3 / $15 (intro $2 / $10 through 2026-08-31). Candidate for the duplicate key-field pass (§4.7), which is comparison rather than reading |

`effort` starts at `high` and is swept down per stage against the G9 evaluation set — `low` and `medium` are unusually strong on Opus 5, and extraction is closer to careful reading than to open-ended reasoning. **Thinking is on by default on Opus 5**, and `max_tokens` caps thinking *plus* output together, so the extraction call sets `max_tokens` with headroom for both; sizing it around the expected JSON alone truncates mid-object.

**`claude-fable-5` is disqualified by the PRD, not by capability.** It is the most capable model available and it **requires 30-day data retention — it is unavailable in a zero-retention workspace**, which G3 (PRD §11.2) makes a hard condition. A request from such a workspace returns `400 invalid_request_error` on every call. A ZDR organisation *can* opt one workspace into 30-day retention to use it — which is precisely the trade G3 forbids for family documents, and the reason this is recorded rather than left to be rediscovered as an upgrade path.

### 6.2 G3, answered concretely

**G3 is exactly four terms**, and a provider that will not answer the last three is disqualified regardless of its training clause. An earlier draft listed five here by folding in the cancellation question, which is a PRD §4.2.2 operational requirement rather than part of the gate — separated below so the gate matches the PRD that defines it.

| G3 term | Position to obtain in writing |
|---|---|
| No training on submitted data | Anthropic does not train on API inputs or outputs by default. Confirm in the commercial terms rather than relying on the default |
| Zero retention of requests and uploaded files | **Zero Data Retention must be requested and confirmed**, not assumed — and it is configured **per workspace**, not only per organisation. A ZDR organisation can opt one workspace into 30-day retention, so the precise statement is that a covered model is unavailable *in a ZDR workspace*, not to a ZDR organisation |
| What abuse monitoring retains, and for how long | Ask explicitly. A default-retention exception for trust-and-safety review is normal and must be stated, because it is the one path by which a family's discharge summary could persist outside our control |
| What provider-side logs hold | Ask explicitly. Metadata-only is the expected answer; get it written |

**Separately, and not part of G3: cancellation semantics for in-flight requests** (PRD §4.2.2). Confirm what happens to a request already dispatched when we abandon it. §4.5 now guarantees no write on our side; this term bounds what the provider does with the computation.

**ZDR eligibility varies by feature**, so confirm it for the specific surfaces we use rather than as a blanket property of the account — structured outputs in particular carry a qualified technical retention.

**Four terms are the gate, not the diligence.** G3 is the PRD's bar for *data use*, and clearing it does not make a provider adequate for handling other families' medical records. The fuller vendor review belongs to G1 and G15 and covers: security and confidentiality controls, personnel access, encryption and credential isolation · subprocessors, processing locations and residency, with advance notice of changes · incident and breach notification timing and cooperation · deletion from replicas and backups, and treatment of flagged content and legal holds · government and legal-process disclosure · audit evidence and contractual remedies. Grouped for a contract rather than as four overlapping data questions: **permitted use · retention, deletion and their exceptions · security, subprocessors and location · incident and legal-disclosure obligations.**

**Do not use the Files API for family documents.** Files persist until deleted (500 MB limit, 100 GB per org) and add a second retention surface to reason about; artifacts go inline as base64 in the request instead, so the only retention question is the one G3 already asks.

### 6.3 Rendering: what actually goes to the model

Arrivals are normalised to **page images** before extraction, because a citation must resolve to a region a person can see (PRD §6.1) and a text offset into an extracted PDF layer does not survive being shown beside the original.

| Source | Rendered as | Resolution |
|---|---|---|
| Born-digital PDF | Page images **plus** the embedded text layer, passed together | Standard (~1568 px) — the text layer carries the characters, the image carries the geometry |
| Scanned PDF, phone photo, camera capture | Page images only | **High (2576 px)** — this is the case the resolution tier exists for |
| Pill bottle, handwritten note | Page images only | High, and never downsampled |
| Email body | Text, with the rendered message as a second source | — |

**Resolution is a cost lever with a floor.** A high-resolution image can reach ~4,784 input tokens against ~1,600 at standard, roughly 3×. Downsampling a born-digital PDF is free accuracy-wise because the text layer carries the content; downsampling a phone photo of a pill bottle is exactly the wrong economy. The rule is the table above, not a global setting.

`page_count` bounds from PRD §13.3 (200 pages) are enforced before rendering, not after — 200 high-resolution pages is close to a million input tokens and must never be dispatched by accident.

### 6.4 Extraction — and why we do not use the provider's citations

The extraction call uses **structured outputs** (`output_config.format` with a JSON schema), which guarantees a parseable object rather than a JSON-shaped string that occasionally isn't.

**The Messages API's own citations feature is incompatible with structured outputs — sending both returns a 400.** That is not a workaround we chose; it is a hard constraint, and it settles a design question in our favour:

> **Citation geometry is ours, not the provider's.** Each extracted fact carries `{page, bbox:[x,y,w,h]}` in **normalised page coordinates** (0–1), produced as fields in our own schema.

Three consequences worth having on purpose:

- **Citations survive a provider swap.** §1.6 costs an AI-provider swap at 2–4 days precisely because stored citations do not have to be re-derived. Provider-native citation objects would have made that a data migration.
- **A citation resolves against the rendered page**, which is the artifact the review screen shows and the artifact the crop is cut from — one coordinate space end to end.
- **PRD §6.4's high-risk rule becomes implementable.** "The crop must be rendered and on screen before the approve control becomes active" needs a region in page space; a character offset into a text layer cannot produce one.

`extractions.citation` (§2.4) has a `CHECK` requiring `page`, `offset` or `t`, so **an uncited fact cannot be stored** — it becomes a question or it is dropped, at the pipeline, with nowhere to hide (PRD §6.4, AC-INBOX-2).

Every extraction run records `model_id` and `prompt_version` (§4.3). A re-run supersedes rather than appends, and the pair makes any stored fact reproducible against the evaluation set that calibrated it.

### 6.5 Confidence, and why risk is not confidence

The model returns a confidence per fact. **`risk_class` is not derived from it** — it is assigned by *field*, from PRD §6.4's list, before the model is called: medication name/dose/frequency/route · allergies · procedure and preparation instructions · lab specimen requirements · legal directives and the people they name · beneficiary designations · payment, account and routing numbers · identity data · coverage determinations · provider identities · financial amounts and deadlines · appointment dates and times · **and any extracted instruction containing "stop", "start", "do not", "hold" or "discontinue"**, whatever field it lands in.

A model can be 0.94 confident about a dose and wrong, and that is not comparable to being wrong about a filing category at the same number. `high` risk means never pre-selected, at any confidence, and the crop on screen before approval activates.

**Until the G9 set exists, every field is treated as high-risk** and the confidence bands are placeholders (PRD §6.4). That is a build-order constraint, not a caveat: the interface must be able to run in all-high-risk mode from the first arrival.

### 6.6 Interpretation — the record-aware pass

A separate call, after extraction, with a separate prompt. It is the differentiating step (PRD §6.8) and it is the only stage that reads the record.

```
hc.record_context_for(arrival)  →  { subject's current profile_facts,
                                     recent timeline_events,
                                     open tasks,
                                     documents in the same categories }
                                     — that subject, that circle, nothing else
```

It emits proposals and conflicts (§4.8), never writes. Two properties are structural rather than prompted: it **cannot reach another subject's record**, because the function's signature cannot express it; and it **cannot act on what it concludes**, because `hc_pipeline` holds no write privilege.

The record context is the same tokens on every arrival for a given subject, so it sits in front of the volatile arrival content behind a `cache_control` breakpoint. Opus 5's minimum cacheable prefix is **512 tokens** (down from 1024 on Opus 4.8), which brings small records inside the cacheable range — worth checking rather than assuming, since the minimum is not monotonic across model generations.

### 6.7 Prompt injection

Covered structurally in §4.10. The AI-layer half:

- Source text reaches interpretation **as delimited data inside a user turn**, never as instruction, with the system prompt stating that document content is data and that instructions found inside it are content to be reported, not followed.
- **Operator context never goes in the arrival's turn.** Where a mid-run instruction is needed, it is a `{"role": "system"}` message — available on Opus 5 with no beta header — which is the non-spoofable operator channel and preserves the cached prefix. Text inside a user turn can be forged by anything that writes to the document.
- A proposal referencing permissions, accounts, other circles or the product's own mechanics sets `anomaly_flags`.

### 6.8 Refusals, failures and the honest limits

**A refusal is not a pipeline failure and must not read as one.** Opus 5 carries elevated safety classifiers, and a declined request returns **HTTP 200 with `stop_reason: "refusal"`** — code that reads `content[0]` unconditionally breaks on it. The adapter checks `stop_reason` first.

A refusal on a family's own medical document should be rare, but the honest handling matters more than the rate: the arrival goes to `Couldn't read it` with a reason code, the artifact stays viewable and downloadable, manual filing is offered, and **the family is never told their mother's discharge summary was rejected as unsafe** — the same discipline §4.3 applies to scanner outages. Refusals are counted per class as a quality signal (PRD §10.4); a rising rate is a pipeline defect, not a family problem.

**Server-side fallback is available and we are not using it in Phase 1.** `fallbacks: "default"` re-runs a declined request on another model inside the same call. It is deliberately declined here because it would silently route a family's document to a second model whose terms may not be the ones G3 cleared. Revisit only once the fallback target is inside the same written terms.

**Cancellation.** Discarded at the CAS (§4.5). The provider-side half is a G3 term, not a UI one.

### 6.9 OCR is an accessibility aid, not a fact

PRD §13.5. A scanned discharge summary has no text layer, so a blind coordinator would otherwise have an inaccessible record.

- OCR text is offered for any image-only source, labelled **"machine-read — may contain errors"**, with page and citation navigation working over it exactly as over native text.
- **OCR output is never an approved fact and never provenance.** It is stored on the artifact, not in `extractions`. Facts still come from §6.4 and still require approval, and the citation still resolves to a region of the image rather than to a line of OCR.
- Where OCR confidence is poor it says so rather than presenting garbage as text.

### 6.10 The evaluation set (G9)

Blocks any real document reaching a provider for a proposal a family will see.

- **Labelled, representative material**: discharge summaries, EOBs, pill bottles, handwritten notes, phone photos taken at an angle. Never a real family's record, at any stage (PRD Appendix B).
- **Per-field precision and recall**, not one global number — the bands in §6.5 are per extraction type.
- Run through the **Batch API at 50% of standard price**, which makes re-running the whole set after a prompt or model change cheap enough to actually do. Every run is keyed by `(model_id, prompt_version)`, matching what `extraction_runs` records, so a production fact traces to the eval that calibrated its field.
- **A model or prompt change is not shippable without a re-run.** Per-field precision does not transfer between models — that is the substance of §1.6's 2–4 day swap cost, and it is the gate, not the code.

### 6.11 Cost, at design-partner scale

Order-of-magnitude, stated with its assumptions so it can be checked rather than trusted. A 4-page born-digital discharge summary at standard resolution is roughly 6–8k input tokens; the same document as phone photos at high resolution is roughly 3× that. At Opus 5's $5/$25:

| | Per arrival | Per circle at the §13.3 soft limit (5,000 arrivals) |
|---|---|---|
| Extraction | ~$0.04–0.12 | — |
| Interpretation (record context largely cache-read at ~0.1×) | ~$0.02–0.05 | — |
| **Total** | **~$0.06–0.17** | **~$300–850 lifetime** |

Two things follow. The **monthly processing ceiling** in PRD §4.2.8 is a real control, not a formality — it notifies the coordinator rather than failing quietly. And **resolution discipline (§6.3) is the single largest lever**, which is why it is a rule tied to source type rather than a global setting someone can turn up.

### 6.12 Traceability

| Criterion | Mechanism |
|---|---|
| AC-INBOX-2 | §6.4 — our own normalised geometry, `citation_present` CHECK |
| AC-INBOX-6 | §6.6 — conflicts emitted as proposals; supersession is the only write path (§4.8) |
| AC-INBOX-11 | §6.7 + §3.10 — delimited data, and absent privilege behind it |
| AC-TASK-2, AC-TASK-3 | §6.6 proposes an owner and a real date; assignment stays human (§3.6) |
| AC-HOME-3 | No number on Home is model-computed — the AI layer has no path to Home |
| PRD §6.4 high-risk | §6.5 — `risk_class` by field, set before the call |
| PRD §6.6 no clinical advice | Prompt discipline plus the adversarial string review; extraction restates the source, interpretation states relationships, neither states judgment |

**Gates:** G3 (§6.2 names the four terms and the disqualification), G9 (§6.10).

---

## 7. Search

**Scoped search, not answers.** Permission-filtered results across documents, timeline and tasks. Deliberately not retrieval-augmented Q&A: a wrong answer with no visible source costs more trust than fifty right ones earn (PRD §6.1, §4.7.3). The field never composes an answer, never summarises across results, and never says "I".

### 7.1 The index is the row

Postgres full-text search, `tsvector` columns on `documents`, `tasks` and `timeline_events`, maintained by trigger in the same transaction as the content, the taint and the category (§2.11).

**Two vectors, in two tables, split at the `summary` / `view` line.** A single vector leaks: `summary` reaches a document's title, category and `summary_text`, but *not* the artifact or the extracted contents (§3.4). If body and OCR text sat in the same vector, a summary-level member searching a term appearing **only** in the document body would get a hit — and a hit discloses that the term is in that document. The level ladder has to be reflected in the index, not only in the row.

**And the split has to be by table, not by column.** Adding `extracted_text` to `documents` would put view-only content on a summary-readable row and quietly undo the very boundary §3.4 draws — RLS is row-level, so a column on a visible row is a visible column.

```sql
-- on documents: only what `summary` may already read
new.tsv_summary :=
    setweight(to_tsvector('english', coalesce(new.title,'')),        'A')
 || setweight(to_tsvector('english', coalesce(new.summary_text,'')), 'B');

-- on document_search_content, behind a policy requiring `view`.
-- The vector and the snippet source are built from the SAME string, in one place.
new.search_text_full := d.title || ' ' || coalesce(d.summary_text,'') || ' '
                     || coalesce(new.extracted_text,'') || ' ' || coalesce(new.ocr_text,'');
new.tsv_full := d.tsv_summary
 || setweight(to_tsvector('english', coalesce(new.extracted_text,'')), 'C')
 || setweight(to_tsvector('english', coalesce(new.ocr_text,'')),       'D');
```

`ocr_text` sits at weight `D` so machine-read text is findable — a blind coordinator must be able to locate a scanned document (§6.9) — without ever outranking a human-approved title, and it is still never rendered as a fact.

**`search_text_full` exists because the snippet must be cut from the text that was matched.** An earlier draft ranked against `tsv_full` — title, summary, extracted values and OCR — but generated the snippet from `extracted_text` alone, so a `view`-level match on a *title* produced a snippet that did not contain the term. Storing the exact concatenation the vector was built from is what makes §7.2's same-text property true rather than asserted. The summary branch needs no equivalent column: `tsv_summary` is built from `title` and `summary_text`, and the query concatenates exactly those two.

**The split costs a cross-table dependency, and that has to be paid explicitly.** §7.1's claim that there is no index to fall out of sync was exactly true when the vector lived on the row it described; now `tsv_full` and `search_text_full` **duplicate the document's title and summary onto a second row.** So an edit to `documents.title` or `documents.summary_text` fires a trigger that rebuilds the matching `document_search_content` row **in the same transaction**, and an invariant test asserts that for every document, `tsv_full @@ title` holds whenever `tsv_summary @@ title` does. Without that trigger the second row goes stale and a renamed document stops being findable at `view` while still being findable at `summary` — the failure is the wrong way round, but it is still a failure.

There is no separate search service and no second copy of the data. That single decision discharges most of PRD §4.3.6 by construction: **revocation, deletion, re-categorisation and subject reassignment update the index because they update the row.** A stale index cannot answer a question the live record would refuse, because there is no index to be stale.

### 7.2 The query, in the order the operations happen

```sql
with q as (select websearch_to_tsquery('english', $2) as tsq)
select d.id, d.subject_id, d.category,
       ts_headline('english',
                   -- the SAME text the matched vector was built from, per branch
                   coalesce(sc.search_text_full,
                            d.title || ' ' || coalesce(d.summary_text,'')),
                   (select tsq from q)) as snippet,
       ts_rank(coalesce(sc.tsv_full, d.tsv_summary), (select tsq from q)) as rank
from public.documents d
left join public.document_search_content sc on sc.document_id = d.id   -- RLS decides
where d.circle_id = $1                                                 -- explicit circle bound
  and coalesce(sc.tsv_full, d.tsv_summary) @@ (select tsq from q)
order by rank desc
limit 20;
```

**The `LEFT JOIN` is the level decision, and it is made by RLS rather than by a second code path.** `document_search_content`'s policy requires `view`. A summary-level caller's join finds nothing, `sc.*` is `NULL`, and `coalesce` falls through to `tsv_summary` — matching and snippeting on exactly the text they may already read. A `view`-level caller's join resolves and both come from `tsv_full`. There is no `searchable_tsv()` helper to keep in step with `hc.visible_at()`, because the same policy machinery that governs every other read governs this one.

RLS supplies the rest. The order that matters:

1. **The policy qual is applied during the scan.** A row the caller cannot see is never a candidate.
2. **`ts_rank` and `ts_headline` are in the select list**, evaluated only for rows that survived. **A snippet is document content**; generating one for a result the caller cannot see and then discarding it is a leak waiting for a logging statement (PRD §4.3.6). Here it is never generated.
3. **`circle_id = $1` is explicit** in addition to the policy — belt and braces, and it is what keeps the index scan on the leading column.
4. **The match and the snippet come from the same vector and the same text.** A caller can never match on text the snippet is not allowed to show them, which is what makes the hit itself non-disclosing — and it is why this is a schema split rather than a query filter.

`websearch_to_tsquery` rather than `to_tsquery`: it accepts what a person actually types, including unbalanced quotes and stray operators, without raising a syntax error the family would see.

### 7.3 What the leakproof guarantee actually buys

RLS policy expressions act as a security barrier: a user-supplied predicate is not evaluated ahead of the policy unless its functions and operators are marked `LEAKPROOF`. That guarantee is real and it is a reason to enforce in Postgres rather than in a search service.

**It is narrower than PRD §4.3.6's phrasing**, and §3.12 records the same qualification. "Authorization is resolved before the query executes" holds for non-leakproof predicates; leakproof operations and the policy expressions themselves may still be reordered, and a callable `SECURITY DEFINER` function is an independent path no barrier constrains.

What we can defend — and what the tests assert — is the sentence PRD §4.3.6 puts immediately after it: **result counts and error shapes are identical whether or not a hidden match exists.** The PRD also explicitly withdraws the timing-equivalence requirement as untestable, so the defence is structural and the assertions are about observable output.

### 7.4 Counts, autocomplete, and the things deliberately absent

- **Counts are post-filter, everywhere.** No "showing 3 of 11", no count of withheld results, in any surface — including anything the family can see about their own usage. This is automatic: the filter *is* the scan (§3.1), so a hidden row never reaches a `count(*)`.
- **No autocomplete and no spelling correction in Phase 1.** Both are inference channels over content the caller may not be entitled to — a suggestion derived from a document you cannot see tells you it exists. Neither is worth its surface area. A decision, not an omission (PRD §4.3.6).
- **No cross-circle search**, even for a member of several circles (PRD §8.12). The query carries one `circle_id`.
- **Empty result:** *"Nothing matching that, in what you can see."* — which is honest about the filter without quantifying it.

### 7.5 Isolation, and the honest limit

Circles are isolated by the `circle_id` bound plus RLS, and every search index leads on `circle_id`. PRD §4.3.6 asks for index-level isolation "wherever the engine permits" — in one Postgres instance a shared GIN index is one physical structure, so **isolation is by predicate, not by separate index**, and that is worth stating rather than implying. Partitioning `documents` by circle would make it physical and is the upgrade path if the cohort grows; at Phase 1 scale it would be complexity without a threat model behind it.

### 7.6 Level-appropriate results

A result is only ever the object the caller can already read. Because the search relation *is* the record table, `summary`-level members match against titles, categories and dates and see snippets built from those; `view` adds nothing to search itself but unlocks the artifact behind the result. `log`-level presence never appears in search at all — `hc.presence()` is a separate call with a separate return type (§3.5), and merging the two would put a search snippet in front of a member entitled only to existence.

Every result carries its **subject label** (PRD §4.0) and its taint-derived level, so a two-subject circle never renders an unlabelled row.

### 7.7 Latency

p95 800 ms, ceiling 2 s (PRD §13.2). At the §13.3 cap — a few thousand rows per circle — a GIN index scan bounded to one circle is comfortably inside that; the budget exists so a regression is caught, not because the query is close to it. Ranking runs on the post-filter candidate set, which is at most the caller's visible subset of one circle.

### 7.8 Traceability

| Criterion | Mechanism |
|---|---|
| AC-DOC-1 | §7.2 — one indexed query, weighted so the insurance card's title wins |
| AC-DOC-4 | §7.2 order of operations + §3.4 policy; no titles, no snippets, no counts of withheld results |
| AC-PERM-6 | Taint arithmetic applies unchanged — the search relation is the record table |
| AC-HOME-4 | §7 preamble — results only, no prose answer, no composition |
| AC-TASK-5 | The care-circle ceiling is in `hc.visible_at()`, so it holds in search as it does everywhere |

**Gates:** G2 and G8 both exercise search as one of the channels the ordered-pair matrix asserts against (Appendix A.3).

---

## 8. Design system

Transcribed from `design_spec.md` §2–§6. Every value here is measured from the prototype, not invented; where the spec gives a range, the range is reproduced rather than resolved. **The items `design_spec.md` §10 lists as "specified but not yet in the prototype" — focus rings, `prefers-reduced-motion`, touch-target padding — are build requirements in §8.7, not backlog.**

### 8.1 Tokens

Defined once as CSS custom properties on `:root`. The token tables in `design_spec.md` §2–§3 are the source for the variable names, per its §9.

```css
:root {
  /* Foundation */
  --sand:        #EDE6D8;   /* page background — the base plane */
  --cream:       #FBF8F1;   /* chrome: top bar, left nav */
  --card:        #FDFBF6;   /* default card surface */
  --white:       #FFFFFF;   /* inputs, cards nested in a tinted panel */
  --line:        #E7DFD0;   /* standard border, dividers */
  --line-strong: #E1D8C7;   /* borders on tinted surfaces */
  --wash:        #F0E8D9;   /* secondary buttons, hairlines inside cards */
  --scroll-thumb:#D8CDB9;

  /* Ink */
  --ink:   #24211B;  /* headlines, primary values, names */
  --ink-2: #4A463D;  /* body copy inside cards */
  --muted: #857E70;  /* secondary copy, metadata, timestamps, counts */
  --faint: #9A9382;  /* placeholders, low-priority meta, dismiss glyphs */
  --label: #B0A891;  /* ALL-CAPS section labels, inactive icon strokes */

  /* Signal — one meaning each, never decorative */
  --green:      #2F5B4E;  /* the system, trust, identity */
  --terracotta: #C1613C;  /* needs a person */
  --amber:      #B98A2E;  /* time pressure */
  --sage:       #6E8F73;  /* handled, good */
  --plum:       #7A6E9B;  /* the parent's own identity — a person, not a status */
  --google-blue:#4285F4;  /* only where an external calendar's brand is shown */

  /* Tinted panel — positive/saved */
  --positive-bg:     #F6FBF7;
  --positive-border: #D6E7DA;
  --positive-label:  #6E8F73;
  --positive-body:   #33463F;
  --chip-sage-bg:    #E4EDE7;

  /* Radii */
  --r-card: 13px;  --r-row: 12px;  --r-control: 9px;  --r-pill: 20px;
}
```

**Constructing a new tinted panel** (`design_spec.md` §2): a 4–6% tint of the accent as fill, a 15–20% tint as border, the accent itself as the label.

**Four rules the tokens do not enforce**, checked in review:

1. **One accent per card.** If a card carries two signals, the more urgent wins and the other becomes muted text.
2. **Never an accent as a large background field.** Accents are strokes, small fills, text, and 2–8 px dots.
3. **Green is the product's voice; terracotta is the family's attention.** Not interchangeable for variety.
4. **Sand and cream never appear as text colors; ink never appears as a fill.**

Colour is a signal, so it must stay rare: *a screen where three things are orange is a screen where nothing is orange.*

### 8.2 Typography

Two families from Google Fonts. Preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`, then load **Newsreader** (`400;500;600` plus italic 400/500, optical size `6..72`) and **Hanken Grotesk** (`400;500;600;700`) with `display=swap`.

| Role | Spec |
|---|---|
| Page title | `500 34px/1.1` Newsreader |
| Card headline | `500 22px` Newsreader, line-height 1.05 |
| Section headline | `500 18px` Newsreader (day numerals, sub-cards) |
| Wordmark | `600 17px` Newsreader, letter-spacing .2px |
| Serif nav item | `14.5px` Newsreader |
| Body | `13.5px` sans, line-height 1.5 |
| Card body | `12.5px` sans, line-height 1.5 |
| Nav item | `500 13.5px` sans |
| Row title | `600 14px` sans, line-height 1.25 |
| Meta | `11.5–12px` sans, muted |
| Micro meta | `10.5–11px` sans, faint |
| Section label | `700 10.5px`, letter-spacing .8–.9px, uppercase, `--label` |
| Eyebrow (in-card) | `700 10px`, letter-spacing .7px, uppercase, accent |
| Badge / pill | `600–700 9.5–10.5px` |
| Button | `600 11.5–13px` sans |

Newsreader is set at **weight 500 by default**; 600 only for the wordmark. `text-wrap: pretty` on paragraphs. **Never below 10px** — and §8.7 raises that floor for prose.

**Voice** (`design_spec.md` §3) is part of the system, not a copy preference: second person, present tense, plain words · the parent by name, never "the patient" or "the user" · sentence case except section labels and eyebrows · the middle dot `·` separates metadata clauses and is the product's punctuation mark · state what happened, not what the system did ("already filed," not "auto-processing complete") · **never alarm — amber and terracotta do the urgency; the words stay level.**

### 8.3 Layout

Sticky top bar (11px × 20px padding, cream, 1px bottom border) → below it a row of left nav (cream, 1px right border, 16px × 12px padding, 2px gap between items) and main content, capped at `max-width: 1240px`.

**Page pattern:** title (34px serif) → one line of muted 13.5px context, max-width ~620px → controls row if any → content.

| Grid | Spec |
|---|---|
| Browsing (card grids) | `repeat(auto-fill, minmax(324px, 1fr))`, 14px gap |
| Working screens | two-column `main + rail`, 20px gap |

**Spacing:** card padding 16–18px · 6px inside a chip row · 8–12px between related cards · 14px in a card grid · 20–22px between page blocks · 20–24px title-to-content.

**Responsive without breakpoints.** `design_spec.md` §4 requires that column counts, nav width and shell direction respond to a *measured width* rather than a breakpoint list — the prototype computes them in logic and injects style holes.

**We implement that with CSS container queries, not a measurement hook**, and the substitution is deliberate. A `ResizeObserver` hook reproduces the prototype's mechanism but costs a client component at the top of every layout, a first paint at the wrong size, and a visible reflow on hydration — against a p95 page-load budget of 1.5 s (PRD §13.2) and a primary review device that is a phone in a hospital corridor. Container queries give the same semantics — layout responds to the container's own measured width, not the viewport's — with no JavaScript, no hydration shift, and no client boundary. The spec's intent is preserved; its implementation detail is not, and that is the trade recorded here.

```css
.shell { container-type: inline-size; }
@container (min-width: 900px) { .review { grid-template-columns: 1fr 1fr 1fr; } }
@container (max-width: 899px) { .review { grid-template-columns: 1fr; } }
```

### 8.4 Components

**Card.** `background: var(--card); border: 1px solid var(--line); border-radius: var(--r-card); padding: 16–18px`. **No shadow** — borders do that work. A clickable card gets `cursor: pointer` and nothing else: no hover lift, no shadow bloom. Interior dividers are `1px solid var(--wash)` with 6–12px of padding above.

**Radii, consistently:** 13px cards · 12px compact rows · 9–10px inputs, nav items, buttons · 20px pills · 50% avatars.

**Card with eyebrow** — the standard summary card: uppercase 10px accent eyebrow → 22px serif headline → 12px muted explanation. Three lines, that order, no icon.

| Component | Spec |
|---|---|
| Count badge | terracotta fill, white text, `700 10.5px`, `1px 7px`, radius 20px |
| Category badge | tinted fill + accent text, `700 9.5px`, `2px 8px`, radius 9px |
| Tag chip | `--chip-sage-bg` fill, sage text, `600 10.5px`, `3px 9px`, radius 11px |
| Removable chip | white fill, tinted border, radius 20px, `6px 13px`, ending in a `×` in faint at 14px |
| Button · primary | green fill, white text, radius 9px |
| Button · secondary | `--wash` fill, `--line-strong` border, `--ink-2` text, radius 20px, `6px 13px`, `600 11.5px` |
| Button · quiet | white fill, `--line-strong` border, muted text, radius 9px; full-width where it's a utility |
| Input | white fill, `1px solid var(--line)`, radius 9–10px, `8–9px × 12–13px`, 13px sans, placeholder faint, leading 14–15px icon in `--label` |
| Avatar | circle 27–29px, accent fill, white initial at `600 11px`, `2px solid var(--cream)` ring; stacks overlap at `margin-left: -8px` |
| Legend | 7px dot in the accent + 11px muted label, flex row, 14px gaps, below a hairline rule |

Buttons with an icon use `display:flex; gap:7px; align-items:center`. Inputs inside a composed control (the zip field) drop their own border and sit borderless inside a shared shell.

**Each person keeps one assigned accent throughout the product** — the colour is that person's identity, not decoration. **Each subject does too** (PRD §4.0), which is what lets a two-subject circle stay legible without reading every label.

**Icons.** Inline SVG on a 24×24 viewBox, `fill="none"`, `stroke-width: 1.6` (1.7–1.8 for the smallest), round caps and joins, rendered at 13–16px. Stroke is `currentColor` so the icon inherits nav state; hard-coded stroke only where the icon carries its own meaning. Line-drawn and geometric — never filled, never duotone.

**Any colour-coded view carries a legend.** Not optional — it is half of how §8.7's "meaning is never carried by colour alone" is satisfied.

### 8.5 Motion

Motion is confirmation and invitation. It never entertains.

| Name | Spec | Use |
|---|---|---|
| `mfade` | 8px rise + fade, `.25s ease` | Every screen change. The only page transition |
| `tin` | 14px rise + fade | Items entering a list |
| `hp` / `hpo` / `hpg` | expanding ring pulse, `2.2s ease-out infinite`, amber / terracotta / green | **One element per screen, maximum** |
| `rdot` | 3px bob, staggered | Thinking / reading indicator |
| `eqp` | scaleY bars | Audio playback only |
| `bdrop` | opacity fade | Modal backdrops |
| `kb` | slow scale + drift | Photographic backdrops only |

Nothing longer than 250ms except the deliberate infinite pulses. No easing more dramatic than `ease`. No spring, no bounce, no stagger for effect.

**At most one pulsing element on screen** — its whole job is to be the only one. Enforced by a single `<PulseProvider>` that refuses a second registration in development and logs one in production; a rule this easy to break in a component tree is not a rule unless something checks it.

### 8.6 Data display

- **Provenance is visible.** Anything the AI produced shows where it came from, in muted 11–12px beneath or beside the value. This is a *visual* requirement: a fact without a visible source is a bug (`design_spec.md` §7), which is the interface half of N2.
- **Counts are plain.** `3 in the Care Inbox`, `5 open tasks`. **No progress bars, no percentages, no charts** anywhere in the MVP (PRD §3.3, AC-PPL-6).
- **Dates are human.** "Sunday, July 12", "just now", "this week". Calendar cards split the numeral into a 9.5px uppercase month over an 18px serif day, in a 38px fixed-width column. Rendered per §2.7's three temporal kinds — a due date is a date, an appointment is a local time with its zone, a floating time says so.
- **Empty states are a sentence**, 12.5px faint, no illustration and no call to action. The one exception is the first-run Care Inbox and day-one Home, where the forwarding address *is* the content (PRD §4.2.7, §4.7.1).

### 8.7 Accessibility — the build requirements

**WCAG 2.2 AA is the target** (PRD §13.5). `design_spec.md` §8 is the floor, and its §10 open items ship in the build:

| Requirement | Implementation |
|---|---|
| **Visible focus ring** | A **2px `--green` ring** on every interactive element. The prototype sets `outline: none` on inputs and does not replace it — that is the defect being fixed, and a lint rule forbids bare `outline: none` |
| **`prefers-reduced-motion`** | A single media query drops **every** pulse and entrance animation to opacity-only. Written once against the animation tokens in §8.5, not per component |
| **44px touch targets** | Minimum on touch, **including the small `×` dismiss glyphs**, which get a padded hit area larger than their 14px glyph |
| **13.5px prose floor** | Meta below 12px is for supporting information only — **never the only place a fact appears** |
| **Meaning never by colour alone** | Every colour-coded item also carries a word: a legend, a badge label, or an eyebrow |
| **Contrast** | `--muted` on `--card` is the lightest permitted combination for body-adjacent text. `--faint` and `--label` are reserved for text that repeats information available elsewhere |
| **Accessible label on every icon-only control** | Enforced by an `eslint-plugin-jsx-a11y` rule, not by review |
| **Full keyboard operation of the review screen** | Including citation navigation: `Tab` between facts, `Enter` to select, which scrolls the source to the cited region and moves focus there; logical focus order across the three regions |
| **Source documents with no text layer** | OCR as a reading aid, labelled *"machine-read — may contain errors"*, with page and citation navigation working over it exactly as over native text (§6.9) |

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

**Automated and component-level checks run in CI from the first component** — `jsx-a11y`, axe on every route in the test suite, and a contrast assertion over the token pairs. G12 is the *final* gate, not the first check: a structural failure found at G12 is a redesign, not a fix (PRD §11.2).

### 8.8 Implementation notes

- **Resets:** `* { box-sizing: border-box }`, `body { margin: 0 }`, body background `--sand`, colour `--ink`, font Hanken Grotesk with `system-ui, sans-serif` fallback.
- **Links:** `a { color: var(--green) }`, `a:hover { color: var(--terracotta) }`. Defined before anything else ships.
- **Scrollbars:** 10px, thumb `--scroll-thumb` at radius 6px, transparent track.
- **No dark mode** (`design_spec.md` §10.2). The warm-paper identity does not survive inversion; if it is ever wanted it needs its own palette. **No `prefers-color-scheme` handling ships** — a half-inverted palette is worse than none.
- **Phone is the primary review device** (PRD §13.4). Document rendering, citation highlighting and the three-region review screen all work at **390px**, where the regions stack. Camera capture uses the native picker; an interrupted upload resumes (§2.12).
- **Photography is placeholder throughout** and does not appear in Phase 1 surfaces; real family imagery lands with Memories (Phase 3) and may need its own treatment rules.
- **The parent-facing phone view is out of scope** and its type scale is **re-derived, larger — never inherited** (`design_spec.md` §10.4, PRD §3.1).

---

## 9. Admin

`/admin`, in the same Next.js application, built with Phase 1. Deliberately plainer than the product: it uses the design system's tokens but reads as a different tool, because an operator should never be able to mistake which one they are in.

**The boundary is §3.9 and it is not restated here.** `hc_admin` cannot select record contents because the privilege does not exist; `admin_meta` views are the only readable surface; `admin_ops` holds one narrowly-granted wrapper per permitted operation. This section is the application layer on top of that.

### 9.1 What is adopted from `admin-portal-builder`, and what is not

| Adopted as written | Replaced, and why |
|---|---|
| Route layout: `app/admin/[resource]/page.tsx`, `app/api/admin/…` | — |
| **Dual-layer auth** — middleware redirect *and* a per-route check | — |
| `successResponse` / `errorResponse` convention | Extended: admin responses carry **normalised error codes only** (§3.9), never `SQLERRM`, `DETAIL`, `HINT`, or a serialised failing row |
| Activity log from day one | Extended: an admin action touching a circle writes to **that family's** access log in plain language, not only to an internal table (AC-ADMIN-4) |
| Supabase Auth for admin sign-in | Kept, plus **mandatory MFA with no bypass** (AC-ADMIN-5) |
| — | **`createAdminClient()` (service-role key) is not used.** It bypasses RLS and would defeat AC-ADMIN-1 and AC-ADMIN-2 outright. `/admin` connects as `hc_admin` over its own credential (§1.2) |
| — | **Resend replaced by Postmark** (§1.6), one vendor for inbound and outbound |
| — | The playbook's spam-scoring and public-inquiry-form material does not apply; the only inbound surface here is the product's own Feedback button |

### 9.2 Surfaces

| Surface | Reads | Never |
|---|---|---|
| **Platform stats** | Circles, subjects, members, arrivals by channel, extraction success/failure rates, arrival→filed timings, proposal approval/rejection rates, invite acceptance, active members. All counts and timings | — |
| **Circle management** | Circle shape: subject count, member count by tier, arrival count, created-at, last-active | Its contents. No subject name, no document name |
| **Feedback inbox** | The product's Feedback button, triaged | Anything the reporter quoted from a record — the form strips and refuses record text |
| **Account operations** | The five in §9.3 | — |

Every view is a `SELECT` against `admin_meta`. There is no page that assembles data in application code from a wider query, because there is no wider query available to it.

### 9.3 Operations, and their constraints

**Admin cannot originate any of these.** Each requires a user-originated request with a recorded reference — a support ticket, or an email from the account's verified address.

| Operation | Constraint |
|---|---|
| **Export** | Scoped to **the requesting member's** grants, never the admin's and never the circle's. `admin_ops.trigger_export(request_ref)` takes the **user-originated request reference** and resolves the member from it (§3.2) — the admin cannot name the account, so cannot substitute one. The link goes only to that member's verified address; the admin cannot retrieve it, redirect it, or see its contents |
| **Deletion** | **Dual control** — two distinct admin identities in two distinct sessions — and it cannot execute before the user's cancellation window closes. There is no expedite |
| **Coordinator transfer** | Dual control, every member notified. The interim mechanism for PRD §12.7, and one of the reasons admin ships with Phase 1 |
| **Suspension** | Single admin, reversible, notified to the account holder with a reason |
| **Password reset** | Triggers the normal emailed flow. **An admin never sets a password and never sees one** |

**Re-authentication here is a fresh MFA challenge** — phishing-resistant where the factor allows — completed within 5 minutes of the operation and **bound to that specific operation**, not a check that the session is recent. Same `step_up_tokens` shape as §5.7, different table and a shorter list of operations.

**Dual control is enforced, not assumed.** `admin_action_approvals` is unique on `(action_id, admin_id)` with a check that the two approvers differ; the wrapper additionally requires two distinct session identifiers, because one operator holding two credentials is not dual control.

### 9.4 Acceptance

| Criterion | Mechanism |
|---|---|
| AC-ADMIN-1 | §3.9 — privilege absent; CI assertion 1 |
| AC-ADMIN-2 | §3.9 — removing the route guard grants nothing; the connection is `hc_admin` |
| AC-ADMIN-3 | §2.3 — composite FK to `accounts(id, kind)`, declarative |
| AC-ADMIN-4 | §9.1 — the family's own access log, in plain language |
| AC-ADMIN-5 | §9.1 — `admin_users.mfa_enrolled_at` is `NOT NULL`; no row exists without it |
| AC-ADMIN-6 | §3.9 — CI assertions 2 and 3, transitive through nested views and reachable functions |

**No break-glass, and no content-based support** (PRD §9.2). There is deliberately no mechanism by which an operator can be granted access to a family's content. Where a family needs help with a specific document we look at it **with them** — a screen share, on their screen, with them present and in control. Nothing is transmitted, nothing is stored, nothing enters a support system. That is not a loophole in the guarantee; it is the guarantee working.

---

## 10. Security and privacy

Assembled to answer what counsel will ask (G1), and cross-referenced rather than restated.

### 10.1 Encryption and enforcement posture

| Control | Implementation |
|---|---|
| In transit | TLS everywhere. HSTS. No plaintext path to any component |
| At rest | Platform encryption on Postgres and Storage (Supabase/AWS-managed keys). **Not envelope encryption, not end-to-end** — E2E is incompatible with the core loop, since the product's value is a server-side AI reading the documents (PRD plan, decision table) |
| Per-domain access | Enforced **server-side on every request** by RLS, never in the client and never by hiding UI (§3) |
| Document access | Through an authorization-checking route that re-evaluates on every request (§1.3). No long-lived signed URL outlives the grant it was issued under |
| Secrets | Vercel environment variables per environment; the four database roles hold four distinct credentials (§1.2); `asServiceRole()` is import-restricted by an ESLint rule to two modules |
| Key management | Provider-managed at rest. The access-log signing key (§2.8) lives in a KMS **no application role can read** — that asymmetry is the point |

### 10.2 Subprocessors

Maintained as a list with each entry's purpose, retention and data residency (PRD §11.4), reviewed at G6. **Every subprocessor inherits the §11.5 retention matrix; one whose retention exceeds it is not usable.**

| Subprocessor | Holds | Retention | Note |
|---|---|---|---|
| Supabase / AWS | Postgres, Storage, Auth — everything | Life of the record; §11.5 governs | Primary, plus the separate ledger and analytics instances (§1.5) |
| Vercel | Application hosting, function execution | Request-scoped; logs carry no record content | User-scoped responses are `private, no-store` |
| Anthropic | Document page images and extracted text, transiently | **Zero retention, contractually** — G3, §6.2 | A provider that retains is disqualified |
| Postmark | Inbound raw MIME; outbound transactional | Provider-side message retention is a G3-equivalent question and must be minimised and stated | §5 |
| Malware scanner (self-hosted ClamAV) | Bytes, transiently | Nothing persisted | Self-hosted *because* PRD §11.4 forbids provider retention and most hosted scanners retain samples (§1.6) |

**The distinction stated plainly to families** (PRD §11.4): a **subprocessor performing our service under contract** is not a **third party receiving data for their own purposes**. Only the first exists. No sale of family data, no advertising use, no disclosure outside contracted service delivery.

### 10.3 Retention and deletion

The §11.5 matrix is the operative rule. Its two mechanisms live in the schema:

- **Soft delete + purge** (§2.1): `deleted_at` then `purge_at`, with a nightly purge job. Provenance survives in the access log; superseded facts survive because history *is* the record.
- **The deletion ledger** (§2.9), on a separate instance with its own PITR lineage. Written synchronously at request time, before the live purge runs.

**Deletion means:** removed from live systems, every index and every cache **within 7 days**, and from rolling backups **within 35 days**, when the last backup containing it expires. We do not surgically edit backups — we state the window, in the confirmation message and in the privacy statement, up front.

**Deletion survives a restore.** No restored environment is reachable — not by a family, not by us — until the ledger has been replayed against it. Restore → network-isolated → replay every tombstone at or before the restore point → verify a sampled set is absent → open. Tested at **G6** (delete, restore an older snapshot, confirm it does not come back) and again at **G11** as one of three restores.

**Legal hold** suspends deletion for specific data on written legal process, is recorded in the family's access log as a hold with a date, and is disclosed to the family unless disclosure is itself legally prohibited.

### 10.4 Export

Per circle, self-service, scoped (§5.7 for the re-authentication, PRD §4.1.6 for the rules).

- **An export contains exactly what the requester can see** — their own grants, per subject, per domain, evaluated at generation time. Not "everything". Generation runs in the background, after the request, so it cannot use the caller's own context: **`hc.generate_export(export_request_id)`** (§3.2) resolves the member from the stored request and evaluates `hc.visible_at()` per row. The export and the screen cannot disagree, because both call the same function — and the job cannot be pointed at a different member, because it takes a request id rather than an account.
- Originals as received; record rows as JSON against a **versioned, documented schema**; a manifest carrying schema version, generation timestamp, requesting member, and a **checksum per file**.
- The access log is included as the **requester-visible projection**, not the full circle log — the same filtering that governs reading it governs exporting it, or export becomes the back door the filtering exists to close.
- Delivered by a short-lived link, re-authenticated, expiring at 7 days. Generation, download and expiry are **each** logged to the family's access log.
- **Rate-limited.** Bulk extraction by a member who senses they are about to be removed is a real pattern in this population, and the coordinator should be able to see it happen.

### 10.5 The access log as an evidentiary artifact

§2.8 gives the mechanism; what counsel will ask about is the properties:

- **Append-only two ways** — no `UPDATE`/`DELETE` privilege for any role, plus an unconditional trigger, so a future migration that re-grants the privilege still cannot rewrite history. A correction is a new row referencing the one it corrects.
- **Tamper-evident** — a per-circle SHA-256 hash chain, with a daily head signature under a key held in a KMS the application cannot read. **A coordinator who could edit the log could not re-sign the chain**, which is the property the disputes this log exists for actually need.
- **Server-generated timestamps**, never a client's; actor account, session and originating request on every entry.
- **Filtered by the reader's own access** — the log is not a back door into the domains it describes.
- **Denial entries name the actor and the domain, never the object** — enforced by a `CHECK`, not by discipline — and repeated denials collapse to one entry with a count and a time range, so a script cannot flood a family's log or use it as an oracle.

### 10.6 Threat model — the cases this product actually has

Written before the build (G15). The distinguishing feature of this population is that **the adversary is often inside the circle** — and, more uncomfortably, **often still authorised.**

**Harm by a member whose access is entirely valid is the harder half, and most of it cannot be prevented — only witnessed, slowed, or made to require a second person.** An earlier draft modelled the insider mainly *after* revocation, which is the case where the controls are easy. These are the cases where they are not:

| Authorised-insider case | What actually helps |
|---|---|
| Bulk download, export, screenshot or copy-out ahead of an anticipated revocation | Rate limiting **slows and surfaces; it does not prevent** — a member entitled to read is entitled to read. Export generation, download and expiry are each logged to the family's own access log so a coordinator can see it happen (§10.4) |
| Malicious approvals, rejections, edits, reassignments, sender acceptance, shares, invites or grant changes by a legitimate coordinator | Provenance on every row and an append-only tamper-evident log — the record shows who did it and cannot be quietly rewritten (§2.8). Step-up re-authentication on anything that moves access or data out of the circle (§5.7) |
| Coercion of the parent, or of another coordinator | Outside the product's reach. The freeze (§3.8) is the escalation path, and PRD §12.10 owns who adjudicates |
| Shared device, saved session, compromised mailbox, recovery-flow takeover | Sign-out-everywhere; the "this wasn't me" kill switch (§5.11); step-up before sensitive operations regardless of session age |
| Presence, notification timing, counts, dates and the access log used as inference channels | Counts post-filter (§3.1); denial entries name no object and collapse (§2.8); notifications carry nothing sensitive (§5.9) |
| Deliberately poisoned uploads engineered to produce plausible harmful proposals | N1 — a person approves every write; high-risk fields require the crop on screen (§6.5); anomaly flagging (§4.10) |
| Harassment by repeated invites, assignments, notifications or freeze requests | Invite and notification rate limits; freeze intake rate-limited **per claimant and per subject** (§2.3) |
| Collusion between members, or an insider plus a compromised operator account | Dual control on destructive admin operations (§9.3); admin identities structurally cannot be circle members (§2.3) |
| Contested authority over who may export or delete | Deletion of a circle requires manage on every domain of every subject, plus a second coordinator's confirmation where one exists; the freeze suspends both (§3.8) |
| Availability attack by a legitimate user — mass cancellation, deletion requests, quota exhaustion, repeated freezes | Cancellation is per arrival and reversible by re-read; deletions carry cancellation windows; quotas are per circle *and* per sender; one open freeze per target (§2.3) |

**Stated plainly because the alternative is a false claim:** an authorised member can exfiltrate what they are authorised to see, and no control here prevents that. What the design provides is that the activity is **detectable and auditable** — it lands in the family's own append-only log, with generation, download and expiry each recorded — and that it cannot reach anything outside that member's own grants. It does **not** guarantee the coordinator sees it before it completes; monitoring is not a race the design wins, and describing it as one would overstate what an access log does.

| Threat | Primary control |
|---|---|
| Estranged sibling with live access | Immediate revocation across every channel in §5.8; grants are read live, never from the JWT |
| Contested authority / elder financial abuse | The freeze (§3.8), which works *against the custodian* — evaluated before tier, grants and shares |
| Lockout as a weapon | Progressive throttling, never a sticky lockout; no third-party-inducible state lasts beyond an hour (§5.6) |
| Stale share after revocation | §3.3 clause 1 — a share on a subject the member no longer reaches grants nothing |
| Hostile mail at a published address | Aligned DMARC/ARC, forged `Authentication-Results` stripped, lookalike scoring, quotas, malware quarantine (§5.3, §5.4, §4.3) |
| Prompt injection via a mailed document | Absent privilege first, delimited data second, anomaly flagging third (§4.10) |
| Operator curiosity or compromise | The privilege boundary (§3.9); no break-glass; every admin action in the family's own log |
| Cross-circle leakage | `circle_id` bound plus RLS on every path, including the definer functions (§3.5, §7.5) |
| Backup restore undoing a deletion | The ledger (§2.9, §10.3) |

**Operational security** (PRD §13.7): dependency and secret scanning in CI · least-privilege service accounts, with the admin path on a distinct role · subprocessor list maintained with retention and residency · **external penetration test before the cohort passes five families**.

**Key rotation, specified rather than asserted.** "Rotation defined" is not a control until it names a schedule, an owner and a test. Each key below has all three, and G15 checks the runbook has been executed once, not that the sentence exists:

| Key | Rotation | Owner | Verified by |
|---|---|---|---|
| Access-log signing key (§2.8) | Annual, plus on suspected exposure. Old public halves retained indefinitely — **historic signatures must stay verifiable, so retirement is not deletion** | Named engineer | Runbook exercised at G15: rotate, sign a fresh checkpoint, re-verify a chain signed under the previous key |
| Database role credentials (`hc_admin`, `hc_pipeline`) | Quarterly, and immediately on any operator departure | Named engineer | Rotate in a preview environment first; both roles are separately credentialed so neither rotation takes the other down |
| Provider API keys (Anthropic, Postmark) | Quarterly, and on exposure | Named engineer | Overlapping validity window so rotation is not an outage |
| Invite, reset, step-up and "this wasn't me" tokens | Not rotated — **single-use and short-lived by construction** (§5.7, §5.11) | — | Expiry asserted in the test suite |

**Incident response** (G10) is a written plan, not a mention: a **named owner** (one person, not a rota) · severity definitions matching PRD §10.5's harmful-error classes, including that a wrong dose caught and rejected still counts · containment targets of 24 hours at Severity 1 and 5 days at Severity 2 · **affected-family notification within 72 hours of confirmation, to every family whose record could carry the same error — not only the one who found it** · a consumer-health breach-notification path reflecting §10.7's posture · a written root cause naming the pipeline stage rather than the model · and a restart rule under which a Severity 1 pauses new-family onboarding until the named owner records a written decision with the fix verified. **One tabletop drill completed** before the cohort passes the first family.

### 10.7 Regulatory posture

**Consumer application, not a HIPAA-covered entity.** The family uploads their own records, voluntarily, to a service they control (PRD §11.1). The boundaries that follow are build constraints, not disclaimers:

- **No integration that makes us a business associate of a covered entity** — patient-portal APIs, provider-side feeds — without first doing the compliance work. This is why health-record integration is Phase 4 and not a stretch goal.
- **No claim, anywhere, that we are HIPAA compliant.** Asserted in copy review, not assumed.
- Consumer health privacy law still applies and is tightening: state health-data laws, FTC health-breach rules, app-store health-data policies all reach this product. **G1 before the first real family document.**

---

## 11. Build sequence

Ordered so that the expensive-to-retrofit things exist before anything depends on them, and so each gate has something to test when it comes due.

### 11.1 The order

| # | Slice | Ships | Why here |
|---|---|---|---|
| **0** | **Policy test suite** (§3.13, Appendix A) | pgTAP suite, failing | Written **before** the policies. Retrofitting permissions across nine surfaces is the most expensive mistake available on this project (PRD §3) |
| **1** | **Data model + RLS** (§2, §3) | Schema, the four roles, `hc.visible_at()`, the write path, taint machinery, access log | Everything depends on it; it depends on nothing. Slice 0 goes green here |
| **2** | **Auth + onboarding** (§5.5–§5.11) | Both doors, invites, sessions, step-up, revocation, Account | The first surface that exercises the grant model with real people |
| **3** | **Design system** (§8) | Tokens, components, motion, the §8.7 accessibility floor | Before the surfaces, not after — a11y is structural and G12 is a redesign if found late |
| **4** | **Ingestion** (§4, §5.1–§5.4) | Upload + forwarding address, the state machine, scan, quotas, sender auth | Arrivals exist and are visible before anything reads them |
| **5** | **Extraction + interpretation** (§6) | The AI layer, proposals, conflicts, the evaluation set | Needs slice 4's arrivals; blocks on G9 before any real document |
| **6** | **Care Inbox** (§4.9) | Review screen, item-level approval, the receipt | The wedge. First point at which the loop closes |
| **7** | **The four destinations** | Documents, Timeline, Tasks, People & roles | Written by slice 6's approvals; People & roles makes the permission model visible |
| **8** | **Search** (§7) | Indexed, permission-filtered | Needs records to search |
| **9** | **Home** (§4.7 PRD) | Day-one card, then the router | Last, because it summarises everything before it |
| **10** | **Admin** (§9) | `/admin`, the metadata boundary, account operations | Boundary built in slice 1; the surface is assembled here |
| **11** | **Notifications** (§5.9) | Eight messages, three classes, send-time authorization | Needs every event that triggers one to exist |

**Two deviations from the plan file's order, both deliberate.** The design system moves *before* the surfaces (slice 3) rather than being implied by them — the §8.7 items are structural and a G12 failure found at the end is a redesign. And notifications move to the end (slice 11) rather than riding along with each surface, because send-time authorization must be written once against a complete event set, not eleven times.

**Admin's boundary is not slice 10.** The `hc_admin` role, its absent privileges and the composite FK all land in slice 1. Slice 10 builds pages against a boundary that already exists and is already asserted in CI — which is what makes AC-ADMIN-2 true rather than aspirational.

### 11.2 The gate map

Every gate, and the section that makes it satisfiable.

| Gate | Blocks | Satisfied by |
|---|---|---|
| **G1 · Legal review** | The first real family document | §10.7 posture · §10.3 retention · §2.3 + §3.8 freeze mechanics. **The §7.5 authority questions and §12.10's adjudicator are counsel's, not ours** — the TSD builds the mechanism and names the gap |
| **G2 · Permission red-team** | Any real family data | §3.13 + **Appendix A.1/A.2**, plus the same exercise against an `hc_admin` session |
| **G3 · Provider data handling** | Any real document to an AI provider | **§6.2** — the **four** terms named individually (cancellation semantics is a §4.2.2 requirement, not a fifth term), ZDR **per workspace**, the Fable 5 disqualification. §6.2's broader vendor-diligence set belongs to G1/G15, not here |
| **G4 · Verification enforcement** | Forwarding activation, invite sending | **§5.1** — the address does not exist at the MTA before verification; **§5.10** — `hc.create_invite()` |
| **G5 · Export and deletion** | Cohort past the first family | §10.4 export · §10.3 deletion, both self-service |
| **G6 · Retention and deletion** | Any real family data | **PRD §11.5 is the authoritative matrix** — §10.3 implements it and does not restate it. Plus **§2.9's tombstone-replay test**: delete, restore an older snapshot, confirm it stays gone |
| **G7 · Ingestion abuse resistance** | Activating any real forwarding address | **§5.3** — and the gate is not met by position-based header parsing: it requires **provider webhook verdicts or an `authserv-id`-anchored `Authentication-Results`, plus validated ARC chains** · **§5.4** quotas · **§4.3** malware and scanner-unavailable · **§4.6** zip bomb and oversize · **§4.10** injection |
| **G8 · Derived-data red-team** | Any real family data | **Appendix A.3** — twenty ordered pairs, generated from one rule, **across every channel in A.4** |
| **G9 · AI evaluation set** | **Any real family document sent to the provider at all** | **§6.10**. The PRD phrases this as "for a proposal a family will see"; we hold the tighter line, because the looser reading permits experimenting on real documents before calibration. Until the set exists, **every field is high-risk** (§6.5) |
| **G10 · Incident response** | Cohort past the first family | **§10.6** — the plan's contents are specified there: named owner, severity definitions, containment targets, 72-hour affected-family notification, restart rule, and **one completed tabletop** |
| **G11 · Backup restore** | Any real family data | **§1.5 + §1.8 + §2.9** — three tests: snapshot restore · **PITR to an arbitrary moment inside the last hour** · a restore that must replay the ledger before becoming reachable |
| **G12 · Accessibility** | The first invitee who is not the founder | **§8.7** — WCAG 2.2 AA, the four prototype gaps closed, CI checks from the first component |
| **G13 · Concurrency and idempotency** | Any real family data | **§4.2** enumerated CAS · **§4.3 `pipeline_leases`** — the durable attempt counter without which the retry budgets are unenforceable · **§4.5** atomic finalization · **§4.9** proposal versioning · **§2.4** `approval_attempts` + `proposal_commits` · **§3.7** write-time re-check |
| **G14 · Export authorization** | Cohort past the first family | §10.4 scoping and checksums · **§3.2 `hc.generate_export()`** — export authorization is not satisfiable without a defined context for a non-calling account · **§5.7** step-up |
| **G15 · Security baseline** | Any real family data | **§10.6** — threat model **including authorized-insider cases**, CI scanning, least-privilege roles, and a **key-rotation table with schedule, owner and an exercised runbook** · **§1.5** environment separation · **§2.10** analytics separation |

### 11.3 What must be decided before slice 1 freezes

| Item | Status |
|---|---|
| **PRD §12.8** — caregiver accounts across families | **Frozen here.** Global identity, per-circle membership, separate accounts required (PRD §8.12, §12.5). The product question does not change the schema either way (§2.3) |
| **PRD §12.7** — coordinator succession | Interim mechanism is §9.3's admin-executed transfer, dual-controlled and logged. Built **and tested** before the first family |
| Freeze scope — per subject or per circle | **Settled (ADR-0001): whole circle at intake, narrowed at adjudication.** §2.3's `freezes_open_is_whole_circle` constraint makes an open freeze circle-wide by construction; a finding may narrow |
| `documents.summary_text` at `summary` or `view` | Written at `summary` (§3.4). **One table split to reverse**, and cheaper to decide now than after slice 7 |
| Forwarding-address local part | `<firstname>.<token>` (§5.1). Affects copy on the completion screen and Home; **decide before slice 2** |

### 11.4 Verification, since there is no code yet

Per the plan file's own list, and each is documentary rather than a test run:

1. **Coverage** — every surface in the scope document maps to a PRD section or an explicit deferral, and every PRD §4 acceptance criterion maps to a mechanism in §§1–10 (the per-section traceability tables).
2. **Design-spec conformance** — every token, component and rule in `design_spec.md` §2–§6 appears in §8, and nothing in this document contradicts its §7 (no charts) or §10 (deferrals).
3. **Onboarding walkthrough** (AC-AUTH-1, AC-AUTH-9) — a two-parent family through the founder path against the schema: two subjects with divergent situations and locations, two forwarding addresses, a coordinator membership, the custodianship access-log entry at creation, an invite at summary-only, a completion screen naming only what Phase 1 built. Then the invitee path to something useful in two taps.
4. **The §4.1 walkthrough** (AC-INBOX-1, AC-INBOX-9) — forwarded discharge summary → arrival → cited extractions → proposals → item-level approval → filed document, two tasks with owners, a dated follow-up, an updated medication list, a timeline entry. Each write carrying provenance; each read RLS-reachable by the right member and **unreachable by the caregiver**.
5. **Permission red-team** — Appendix A, including the adversarial-family cases and the admin session.

**Acceptance-criteria coverage.** 67 of the PRD's 76 criteria carry a mechanism in this document, referenced by ID in the per-section traceability tables and greppable as full IDs. **The nine that do not are deliberate**, and they are named here so a reader checking coverage can tell an omission from a decision:

| Criterion | Why no TSD mechanism |
|---|---|
| AC-AUTH-7, AC-HOME-2, AC-PPL-1, AC-TASK-1, AC-TL-1 | **Moderated protocol** — verified by PRD Appendix B against a seeded synthetic circle, five participants per criterion. They are the product's north stars, deliberately human rather than mechanical, and rewriting them as instrument readings would lose what they mean |
| AC-AUTH-2, AC-AUTH-5, AC-HOME-1, AC-PPL-2 | **Interface copy and composition** — a four-step progress indicator, a completion screen naming only what Phase 1 built, a day-one Home doing one job, plain language before any checkbox. Governed by the PRD and §8, with nothing for the schema or the architecture to enforce |

Both classes still ship and are still tested; they are tested by watching a person use the product, which is the only instrument that measures them.

---

## Appendix A — the policy test matrix

The negative test cases summarised in §3.13. Each asserts that a read returns nothing, and each is assigned — **per assertion, in `docs/coverage.md`, which is authoritative** — to the test layer that can actually prove it: most are pgTAP against this product's own schema, but assertions requiring two committed sessions (a revoked live session, a lease surviving a worker rollback), HTTP semantics (the artifact route's 404 shape, a pre-revocation URL), the storage API, or workers (kill-before-transition, outbox loss and sweeper pickup) are integration cases, and timing equivalence is asserted nowhere — only error shape and code (§7.3; ADR-0003, finding 6). A requirement spanning layers is split into one assertion per layer rather than claimed green at a layer that cannot prove it. They exist because PRD gates G2 and G8 require them before any real family data enters the system.

**A.1 · Per-domain cases (AC-PERM-1, G2).** One per domain. In each, the member holds the destination domain and lacks the source domain, and the assertion is zero rows.

| Domain withheld | The read | Why it returns nothing |
|---|---|---|
| Finances | `select * from tasks where subject_id = $1`, as a member at `finances = hidden`, where a schedule-domain task was derived from an invoice | `taint ⊆ domains_at(L)` fails on `finances` (§3.3) |
| Health & care | `select summary from timeline_events` at `summary` level, for an event derived from a discharge summary | Returns the row **by design** at `summary`; the paired assertion is that `extractions` and the artifact return nothing at the same level. The test asserts both halves, because only asserting the first would pass a broken implementation |
| Documents | `GET /api/artifact/<id>` with a hand-constructed id for a document in a category the caller lacks | 404 at step 1 of §1.3, indistinguishable from a non-existent object (AC-PERM-2) |
| Schedule | `select count(*) from tasks where due_on = $1` at `hidden`, where a non-zero count would confirm existence | Counts are post-filter. The result is `0`, never "0 of 3" |
| Memories | `select * from timeline_events where kind = 'memory'` in Phase 1 | Same policy. The domain is live in the model from day one even though the surface ships in Phase 3 |

Then the same five against an `hc_admin` session, where the expected result is `permission denied for table` — the privilege is absent, so no policy is consulted (§3.9, AC-ADMIN-1).

**A.2 · The adversarial-family cases** auth §7 exists for. These are not hypotheticals in this population; PRD §4.6.3 lists estranged siblings, contested power of attorney and elder financial abuse as the reason revocation must be immediate.

| Case | Assertion |
|---|---|
| A revoked member's live session | The next request fails, verified from a second browser session, not from a fresh sign-in |
| An invite token replayed after acceptance | Creates nothing. The acceptance `UPDATE … WHERE accepted_at IS NULL` matches zero rows and the transaction aborts (AC-PERM-4) |
| A caregiver requesting a document scoped to the other subject | 404, indistinguishable from a non-existent object, and the attempt is logged without naming the object (AC-PERM-2, AC-PPL-7) |
| A grant lowered while a review screen sits open | Approval is refused at write time, not at render time (§3.7) |
| A document URL issued **before** a revocation | Fails. The test must use the pre-revocation URL; a newly requested one would pass trivially and prove nothing (AC-PPL-4) |

**A.3 · The ordered-pair matrix (AC-PERM-8, G8).** Twenty cases, generated from one rule:

> For each ordered pair `(from, to)` of distinct domains: construct an object whose own domain is `to` and whose provenance graph reaches a source in `from`; grant the member `manage` on `to` and `hidden` on `from`; assert the object is absent from **every** channel — direct select, search, `hc.presence()`, every count, the send-time notification check, and an export.

Generating rather than hand-writing is the point: a sixth domain adds its ten pairs without anyone remembering to. Three worked examples fix the shape:

- `finances → schedule` — a task drafted from an invoice. The canonical case from PRD §7.6.
- `health → schedule` — a follow-up date extracted from a discharge summary.
- `health → documents` — a document re-categorised from Medical to Legal, additionally asserting that the before-and-after audience is computed and named *before* the move commits (AC-DOC-6).

**A.4 · Existence oracles.** A row-level check answers *may this caller read this row*. It does not answer *may this caller learn that this row exists* — and several features answer the second question through a side channel rather than a `SELECT`. Each is named because each is a place where "the filter is the scan" stops being sufficient on its own:

| Channel | The oracle | Assertion |
|---|---|---|
| **Search match** | A hit on a term appearing only in view-only body text tells a summary-level member the term is in that document | Match and snippet come from the same vector (§7.1); the split is by table, so a summary caller's `LEFT JOIN` finds nothing |
| **Duplicate detection** | *"This looks like the discharge summary you filed on Jul 12"* names a document the member may not be able to see | The duplicate notice renders at `min` over the **matched** document's taint as well as the arrival's; below that, the arrival proceeds with no notice |
| **Conflict generation** | A conflict quotes an existing fact — *"Nell's medication list says 50mg"* — which is a health-domain disclosure inside what may be a schedule-domain proposal | The conflict proposal carries the **union** of both facts' taints (§2.6), so it is invisible to anyone who cannot clear both |
| **Home aggregates** | "What's coming" and "recent activity" are counts and one-liners over the whole record | Post-filter by construction; asserted per surface, not assumed from §3.1 |
| **`hc.presence()`** | Existence and dates are the *entire* payload — this is an intentional oracle, and the assertion is that it is bounded | Requires `log` **on every domain in the taint** (§3.5); circle pre-filter present |
| **Admin statistics** | At small cohort sizes, a per-circle count is a per-family fact | **Per-circle metadata is deliberately permitted and explicitly exempt from the analytics five-circle floor.** PRD §9.1 grants admin the shape of a circle — subjects, members by tier, arrivals, dates — and a per-circle figure is by definition derived from one circle, so the floor cannot make it safe and pretending otherwise would be a false assurance. The floor governs **analytics** (§2.10), a different tier with a different reader. What bounds admin is §9.2's content boundary and the CI assertions in §3.9, not aggregation |
| **Capacity indicators** | A circle-wide usage total counts arrivals a low-access member cannot see | "No breakdown" reduces disclosure without removing it. Exact totals are shown **only to coordinators**; everyone else sees a coarse state — `within limit` / `near limit` / `at limit`. A **bounded oracle, named as one** |
| **Notifications** | Sending at all reveals that something happened | Send-time check per recipient via `hc.notification_visible()` (§3.2) |
| **Export** | Presence in the archive is presence in the record | Per-row `hc.visible_at()` inside `hc.generate_export()` (§3.2) |
| **Constraint errors** | A uniqueness or FK violation inside a privileged function can name a row the caller cannot read | `admin_ops` and every definer wrapper return normalised codes; constraint names carry no content-derived text (§3.9) |
| **Parent-arrival rollup** | A parent's product state is the least-advanced child's — across children whose visibility may differ (§4.4) | The rollup is computed over the **caller's visible children only**; a parent with no visible children does not render |
| **Receipts** | One receipt summarises several independently approved proposals, which may span domains | Each line renders at its own object's level; a receipt showing nothing renders nothing, not an empty shell |
| **Reclassified objects in activity feeds** | "Recent activity" and access-log descriptions written before a re-categorisation can describe an object now hidden | Descriptions are re-evaluated at read time against current taint, never stored as rendered prose |
| **Email delivery metadata** | Recipient counts, or a suppressed-recipient count, reveal circle membership and access shape | Never surfaced. A send is reported to the sender as sent or not sent, with no cardinality |

**A.5 · Regression tests for the round-two findings.** Same rule as A.4's parent list: a fix without a test is a fix that comes back.

| Defect | The assertion |
|---|---|
| `advance_arrival` returned an undiagnosable `false` | Each of the five results is produced by its own scenario; a worker given a stale entry state gets `invalid_state`, not silence |
| Frozen arrival looped forever | Freeze a circle mid-pipeline: the sweeper skips the arrival, no attempt is consumed, and dismissal re-enqueues it. **The terminal transition is refused too** — which is why parking is required rather than failing |
| Retry budget was unenforceable | Kill a worker after `claim_stage` and before the transition, N+1 times: attempt N+1 is refused **without a provider call** |
| Cancellation could leave orphaned facts | Cancel between the provider returning and finalization: `extractions` and `proposals` for that arrival are empty, and the staged Storage prefix is collected |
| No context existed for a non-calling account | `hc.ctx_for()` is not executable by `authenticated`, `hc_pipeline` or `hc_admin`; the three wrappers accept an object id and **have no account parameter to substitute** |
| View-only text on a summary-readable row | A summary-level member searching a term present only in `extracted_text` gets zero results **and** an identical result count to a term present nowhere |
| **Late worker published after supersession** | Let attempt 1 expire, claim attempt 2, then attempt finalization in **both orders**. Only attempt 2 may publish; attempt 1 gets `stale_lease` even when it reaches finalization first |
| A lease claim rolled back with its worker's transaction | `claim_stage` commits standalone: after a rollback of the worker's own transaction, `attempt_no` has still advanced |
| `advance_arrival` silently skipping its event row | An unresolvable or non-current `p_lease` returns `stale_lease` and leaves `arrivals.state` **unchanged** — the state change and the event row cannot come apart |
| `unresolved` resuming ingestion | Adjudicate `unresolved`: parked arrivals stay parked, no extraction runs, and the read-only coordinator can still read (§3.8) |
| Adjudication committed but enqueue delivery lost | Drop the outbox message after a `dismissed` finding: the ordinary sweeper picks the arrival up on its next pass |
| Snippet cut from text that wasn't matched | A `view`-level match on a **title** returns a snippet containing that title, not a fragment of `extracted_text` |
| Stale second search row after a rename | Edit `documents.title`; assert the document is findable at `view` on the new title in the same transaction |
| A wrapper's stored identity mutated after creation | `update` on `export_requests.requested_by` raises; a completed request cannot be re-claimed; an admin cannot create the request they then act on |
| Wrapper object-id probing | A nonexistent object id and an unauthorised one return the **same** normalised error, with no timing or shape difference (§3.9) |

---

## Amendments (normative)

These amendments are **normative** and supersede the quoted clauses in place.
Each was reviewed at a named gate and carries its deciding ADR; the section
text above is otherwise unedited so review history stays diffable. Rule for
future deltas: an implementation may not diverge from this document silently —
a divergence is either reverted or recorded here through an ADR disposition.

### A1 — §2.3 `freezes` DDL: the objected-to identity (ADR-0005 D2; ratified ADR-0006 Q2)

`freezes` additionally carries `objected_to_member_id uuid` — nullable, a
circle-consistent composite FK to `circle_members (circle_id, id)`, with
`check (objected_to_member_id is null or state = 'unresolved')`. It is
settable only through `hc.adjudicate_freeze()`, whose signature gains an
optional trailing `p_objected_to_member_id uuid default null` (the prior
overload is dropped). §3.8's `unresolved` carve-out is unimplementable
without this identity. **Null means no carve-out** — everyone stays closed,
which also covers PRD §7.5's only-coordinator-is-objected-to case
arithmetically.

### A2 — §3.2 `grant_vectors` / ctx contract: the FRZ-13 cap and populated shares (ADR-0005 D5; ratified ADR-0006)

`hc.grant_vectors()` gains a `cap` output column: `'view'` only when the
covering freeze is `unresolved` AND the caller's membership in that circle is
`coordinator` AND the freeze names an objected-to member other than that
caller — in which case `frozen` is emitted false for that caller. Every other
freeze shape leaves `frozen` true / `cap` null. ctx subject entries gain the
`'cap'` key; `hc.visible_at()` applies `least(result, coalesce(cap,
'manage'))` as its **final** step, after share-widening, so the cap binds
shares too. A missing key coalesces to `manage`; `frozen` keeps its
fail-closed `coalesce(…, true)`. The §3.2 ctx `shares` key is populated from
`object_shares` (live membership, unrevoked) in both `hc.ctx()` and
`hc.ctx_for()` (CTX-07).

### A5 — §2.2/§2.4/§3.4/§4: the 1C ingestion deltas (ADR-0007; MNL model per ADR-0006 F9/Q12)

- **§2.4 `arrivals.channel`:** the CHECK gains `'manual'` —
  `check (channel in ('upload','email','manual'))`. A manual arrival is
  SYNTHETIC, created only inside `hc.create_manual_proposal`'s transaction
  with its proposal (`hc.create_arrival` refuses the channel). The payload
  `manual` flag must AGREE with the arrival's channel, both directions,
  enforced by the `hc.assert_manual_flag` trigger on `proposals`.
  `proposals.arrival_id` stays NOT NULL, as ruled.
- **§2.4/§4.3 as data:** `hc.reason_codes` (the fixed enumeration
  `arrival_events.reason_code` references) and `hc.stage_budgets` (stage →
  entry state, optional in-flight state, attempt budget, lease wall clock,
  exhaustion state + reason) are seeded tables in `hc`, append-by-migration.
- **§4.2 `hc.advance_result`:** gains `'claimed'` and `'exhausted'` (the
  first ALTER TYPE … ADD VALUE migration; usage begins in the next — the
  55P04 rule, PLT-03). `hc.claim_stage` speaks the same vocabulary;
  `stale_lease` additionally means "a live attempt owns the arrival" at
  claim time.
- **§4.2 body:** the `cancelled` diagnosis runs BEFORE the fence — the
  §4.5 cancel path closes the worker's lease, and fence-first would
  swallow the discard-and-GC signal into `stale_lease`.
- **§4.3 `hc.claim_stage`:** exhaustion's terminal move executes inside
  the claim (the caller holds no lease that could pass the fence; its
  obligation reduces to ack-without-provider-call); interpret's declared
  in-flight transition (extracted → interpreting) happens at claim so one
  lease spans the stage; interpret/gate exhaustion lands in
  `extract_failed` with distinguishing reason codes.
- **§4.5:** `hc.finalize_interpretation(p_arrival, p_lease, p_proposals)`
  applies the same transition-gated publication to
  `interpreting → proposals_ready`. `hc.cancel_arrival` may also cancel at
  `extracted` (between stages — the member's window must not depend on
  queue timing). The write halves are owner-only, non-definer, and
  validate their lease binds to the arrival.
- **§3.4 map:** arrivals (summary) and extractions (view) evaluate
  `hc.visible_at` over the fail-closed **all-domain taint** — pipeline
  material is unclassified until approved. **Proposals read at `manage`
  over the proposal's own drafted taint** (the approval audience; the map
  had no row). `arrival.auth_detail` (and the internal `current_lease_id`)
  are excluded from the authenticated **column grant**; auth_detail is
  served at view by `hc.arrival_auth_detail` with the DEF-10 one-shape
  refusal.
- **§4.2 freeze re-enqueue:** the outbox is `public.pipeline_outbox`,
  written by `hc.adjudicate_freeze`'s dismissed arm for every worker-state
  arrival in the circle; drained exactly-once by `hc.outbox_drain`;
  `hc.sweeper_pass` implements §4.11's four duties with parked work
  excluded from re-queueing, exhaustion, stuck and queue-age signals.
  "Parked" = the `hc.pipeline_worker_states()` list. *(The "exactly-once"
  drain clause of this annex is superseded by annex A6 — the handoff is
  claim/ack at-least-once.)*

### A6 — §4.1/§4.2/§4.11: the round-7 dispositions (ADR-0008)

- **§4.2 transition graph:** the CAS enforces a CLOSED allowlist —
  `hc.arrival_transitions` (stage, from_state, to_state), seeded with the
  §4.3 stage-exit graph, append-by-migration. The fence binds the lease's
  stage, and the requested edge must be that stage's row; violations return
  `invalid_state` (the §4.2 defect signal — no new enum label).
  §4.7's duplicate-detection edges and the duplicate-resolution /
  held-mail-release re-entries append with their machinery.
- **§4.2 vocabulary:** `hc.advance_result` is the general WORKER-OPERATION
  result vocabulary (transitions and claims), not strictly the six-result
  transition type (ADR-0008 Q1).
- **§4.2 freeze re-enqueue / outbox contract:** the handoff is **claim/ack
  at-least-once** — annex A5's "drained exactly-once" clause and §4.2's
  durable-re-enqueue description are amended accordingly. `drained_at` is
  the claim timestamp; an unacked claim past a 300 s window re-delivers;
  `hc.outbox_ack(uuid[])` closes delivery and binds to a claim; duplicate
  deliveries are absorbed by `hc.claim_stage` (`already_advanced` /
  `stale_lease`). A relay crash between drain-commit and enqueue delays a
  row, never loses it; the §4.11 sweeper remains the recovery backstop.
- **§4.1 intake idempotency:** a key replay returns the prior arrival ONLY
  when the request identity agrees — subject, channel, parent, message id,
  sender address (case-blind); disagreement raises the normalized
  `idempotency_conflict` and writes nothing, in the fast path and the
  concurrent unique-violation path both.
- **§4.11 sweeper discipline:** terminalization re-validates EVERYTHING
  under the per-circle lock against the row-locked live row (state, stage
  from live state, live lease, freeze, deletion, spent budget) and updates
  conditionally on the re-read state; the requeue/stuck/queue-age outputs
  are read-only advisory listings revalidated by `hc.claim_stage` at claim
  time.
- **1C completion claim (scope):** 1C delivers the **database
  state-machine substrate**; the **operational ingestion pipeline is not
  complete** — no worker runtime, scheduler, or relay exists, and nothing
  invokes the pipeline in production until RLY-01 lands. The Care Inbox
  read model additionally does NOT promise draft-proposal visibility at
  view (ADR-0008 Q5), and D7's all-domain taint is approved conditional on
  the UXA-01 availability gate.

### A3 — §3.7 `hc.approve_proposal()`: recorded order and round-6 hardening (ADR-0005; ADR-0006 F1/F6/F8, Q4/Q5)

The signature stays verbatim. Deltas to the commented seven steps:

- **Check order as built:** idempotency claim → proposal row lock →
  per-circle lock (A4) → freeze check (step 4, ordered before the
  visibility re-check so FRZ-14 keeps its named `freeze_active` signature;
  the member's own ctx already carries `frozen`) → authorization on the D7
  union → version check → **taint-drift check** → high-risk confirmation →
  claim and write.
- **Step-up (interim):** a non-null `p_step_up_token` is **refused**
  (`approval_refused`) until §5.7's binding lands in the auth slice. A token
  the database cannot validate is never accepted-and-ignored; clients must
  not treat token submission as validated authentication. §5.7 replaces this
  guard with real validation.
- **Taint drift (D7 as amended):** the write-time taint is own_domain ∪
  drafted ∪ parents' CURRENT union, with manage checked on that union — and
  additionally, parents contributing any domain beyond own ∪ drafted refuse
  with `proposal_taint_changed` (post-authorization, like
  `proposal_version_changed`): re-render, then approve what is displayed.
- **Idempotency:** the stored result replays only to the actor who claimed
  the key; the key is bounded (length 1..200); duplicate payload parents
  collapse to one edge.

### A4 — §2.6 lock discipline: the serialization rule (ADR-0005 D6; extended ADR-0006 F1)

The per-circle advisory lock `hashtext('taint:' || circle_id)` is taken by
every growth and shrink path **and** by every record writer
(`approve_proposal`, `revise_object`) **and** by every freeze writer
(`request_freeze`, `adjudicate_freeze`) — before any row lock, with every
authorization and freeze predicate evaluating under it against re-read rows.
Consequence (the R-rule): security-state transitions and record writes are
totally ordered per circle; a transition committing before a writer's
predicates — including mid-wait — defeats the writer; one committing after
binds at the next evaluation. `hc.share_object()` is the recorded
single-snapshot exception (share grants ≤ view and is inert under freezes via
the A2 cap). Advisory order is acyclic: `freeze:` → `taint:` → `hc.log()`'s
unprefixed key.
