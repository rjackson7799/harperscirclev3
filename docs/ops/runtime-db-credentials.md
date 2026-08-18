# Runtime database credentials — the threat model (ADR-0015 F4)

Round-10 finding 4 is correct about the fact: the application runtime
holds `HC_DB_URL`, a credential that can run maintenance SQL and
`SET ROLE`. Both privileged channels ride it —
[`lib/db/request-role.ts`](../../lib/db/request-role.ts) (the
transaction-boxed anon/authenticated channel) and
[`lib/db/maintenance.ts`](../../lib/db/maintenance.ts) (the six
enumerated ops). The owner ruled (ADR-0015): **accepted for 2B with this
threat model recorded; the least-privilege replacements are queued as a
MANDATORY entry criterion of the next slice that opens the DB.** This
document is the record.

## What the credential is, exactly

| Environment | Identity | Facts |
|---|---|---|
| Local (CLI stack) | `postgres` @ 127.0.0.1:54342 | IS a superuser in the local image — the same identity the migration runner, both DB test suites and the 2A mirror triggers already use. Nothing production-like about it |
| Hosted (Supabase) | the project's `postgres` role over the direct/pooler URL | NOT a cluster superuser on hosted Supabase (that is `supabase_admin`), but it owns the application schemas, holds broad grants on `public`/`hc`, and can `SET ROLE` to the request roles. **Deploy checklist:** at provisioning, record the actual `rolsuper`/`rolbypassrls` flags and grant list of the role the URL resolves to — verify, never assume |

Credential separation that already exists: `HC_ADMIN_DB_URL` /
`HC_PIPELINE_DB_URL` (the §1.7 factories) are DISTINCT env vars — hosted
they are dedicated LOGIN credentials for the NOLOGIN `hc_admin` /
`hc_pipeline` roles, provisioned at deploy; only locally do they point at
the same maintenance URL. The service-role key is a separate credential
under its own single-module containment. Migrations are applied by the
Supabase CLI over its own connection at deploy time — the app runtime
never runs migrations; sharing the ROLE is not sharing the runway.

## Blast radius, honestly

An attacker who achieves arbitrary code execution in the server runtime
(injection, compromised dependency, arbitrary server execution) can use
this credential to read and write anything the `postgres` role reaches —
including `auth.*`. The ESLint fences and the closed op list are
SOURCE-organization controls: they make an accidental new privileged
query a CI failure and a deliberate one a visible, reviewable diff; they
do not constrain a compromised runtime. No app-layer arrangement can —
which is why the real mitigations are:

1. **No generic query surface** — every maintenance export is one named,
   parameterized statement with an in-statement guard; there is no
   string-assembling path to widen a query without a diff.
2. **The compromise-independent floor** — what the DB enforces against
   ANY caller: RLS on request roles, the R-rule lock discipline,
   hc_internal-only writers, the access_log immutability trigger.
   A runtime compromise is a catastrophic event; the 2A machinery is
   what still refuses quietly widening the record surfaces.
3. **The queued split (the actual fix):** the next DB slice's batched
   amendment creates (a) definer functions for the four public-schema
   ops — `create_account`, `describe_invite`, `set_slice`,
   `set_opening_context` — moving them onto request-role authority, and
   (b) a dedicated LOGIN role for the runtime holding ONLY: membership
   in anon/authenticated (the SET ROLE channel), EXECUTE on the definers,
   and the two `auth.*` statements (unconfirm, revoke-sessions) — or
   those two stay on a maintenance credential that the request path then
   never holds. After the split, `HC_DB_URL`'s blast radius drops from
   "the postgres role" to "the enumerated surface".

## Why the four definers wait (the owner ruling's argument)

Writing them now means DDL past the spent ≤ 8 bound, re-opening the 2A
migration tree and its pgTAP inventory pins (002: 49 definers, the grant
matrix) inside a dispositions session — the exact churn the bound exists
to prevent. Each op meanwhile has an in-statement guard and a 2A
precedent, and the postcondition hardening (round-10 finding 7, applied)
makes their zero-row outcomes loud. The risk carried in the interim is
the runtime-compromise scenario above — which the definers reduce but do
not remove (the runtime must still hold SOME credential), and which no
2B-internal alternative removes either.

## Rotation and leak response

- **Rotation:** hosted, reset the database password in the Supabase
  dashboard, update the Vercel env vars (`HC_DB_URL`,
  `HC_ADMIN_DB_URL`, `HC_PIPELINE_DB_URL` as applicable), redeploy. No
  code change; the pools read env at cold start.
- **Leak response:** rotate immediately; then audit — `access_log` is
  append-only and immutable (INV-09), `auth.sessions`/`auth.audit_log_entries`
  cover the auth side; assume writes may have occurred and reconcile
  against backups. A leaked `HC_DB_URL` is a full-data incident and is
  treated as one — the family-notification duty in the PRD's privacy
  paragraph applies.
- **Never in logs:** the URL appears in no log line; pool errors print
  messages, not connection strings (pg's default), and route code never
  interpolates it.
