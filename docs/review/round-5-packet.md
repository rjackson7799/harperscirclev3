# Third-party review — round 5: the slice-1A authorization kernel

**Date:** 2026-08-15
**Branch:** `slice/1a-authorization-kernel` · PR #1 (red→green history on
GitHub) · base `main` @ `2edf1f8`
**Environment:** Postgres 17.6 (Supabase local image, CLI 2.100.1 pinned),
same stack as ADR-0002. CI: digest-pinned gitleaks → npm ci → containment
grep → `supabase db start` → `db:reset` → pgTAP → lint → typecheck.
**Prior rounds:** ADR-0003 (round 4) dispositions bound this build; all
nine findings are implemented as specified there.

## What is under review

The identity & authorization kernel, built red-first: roles/schemas ·
§2.2 enums · `accounts`, `admin_users`, `circles`, `subjects`,
`circle_members`, `access_grants`, `invites` · `freezes` + `freeze_claims`
exactly as §2.3 (three declarative constraints, immutable claims ledger,
whole-circle intake, whole-circle-by-default `unresolved`) · `access_log`
per §2.8 with `hc.log()` · `hc.dom/all_domains/ladder/visible_at` (§3.3
verbatim) · `hc.uid/grant_vectors/ctx/ctx_for` (§3.2, one deviation below) ·
`hc.request_freeze/adjudicate_freeze` · `hc.create_circle` (custodianship
at seq = 1). 248 pgTAP assertions across 9 files; `docs/coverage.md` is
the per-assertion manifest with 1B/1C-staged guarantees `pending`.

## Migrations (each a safe boundary; RLS enabled+forced at creation)

| # | File | Contents |
|---|---|---|
| M1 | `20260815200001_roles_schemas_extensions.sql` | hc_internal/hc_pipeline/hc_admin (NOLOGIN, guarded), schemas hc/admin_meta, citext/pg_trgm/pgcrypto/pgmq, **global** EXECUTE deny-by-default, schema USAGE |
| M2 | `20260815200002_enums_and_pure_fns.sql` | §2.2 enums verbatim; dom/all_domains/ladder/visible_at (IMMUTABLE, table-free) |
| M3 | `20260815200003_identity_tables.sql` | five identity tables; MATCH SIMPLE composite to accounts(id,kind); circle-consistent composites + unique(circle_id,id); platform default grants revoked |
| M4 | `20260815200004_grants_invites.sql` | access_grants (unit of access), invites (zero request-path privilege) |
| M5 | `20260815200005_freezes.sql` | freezes + freeze_claims per §2.3 as amended; zero request-path privilege; hc_internal bounded (no freeze DELETE; claims append-only) |
| M6 | `20260815200006_access_log.sql` | log_event_types (7 codes), access_log, append-only trigger, `hc.log()` (advisory-lock chain) |
| M7 | `20260815200007_ctx.sql` | hc.uid (deviation 1), grant_vectors, ctx, ctx_for; identity read policies |
| M8 | `20260815200008_freeze_fns.sql` | request_freeze (ledger + rate limits), adjudicate_freeze (uniform P0001) |
| M9 | `20260815200009_create_circle.sql` | create_circle: declarations at seq 1–2 before any row; two-subject cap; founder + subject-member manage grants |

## Policy inventory (live capture, complete)

```
access_grants_internal          access_grants  SELECT  {hc_internal}
access_grants_internal_create   access_grants  INSERT  {hc_internal}
access_grants_select_own        access_grants  SELECT  {authenticated}
access_log_internal             access_log     SELECT  {hc_internal}
access_log_internal_append      access_log     INSERT  {hc_internal}
accounts_internal               accounts       SELECT  {hc_internal}
accounts_select_self            accounts       SELECT  {authenticated}
circle_members_internal         circle_members SELECT  {hc_internal}
circle_members_internal_create  circle_members INSERT  {hc_internal}
circle_members_select           circle_members SELECT  {authenticated}
circles_internal                circles        SELECT  {hc_internal}
circles_internal_create         circles        INSERT  {hc_internal}
circles_select                  circles        SELECT  {authenticated}
freeze_claims_internal          freeze_claims  SELECT  {hc_internal}
freeze_claims_internal_write    freeze_claims  INSERT  {hc_internal}
freezes_internal                freezes        SELECT  {hc_internal}
freezes_internal_adjudicate     freezes        UPDATE  {hc_internal}
freezes_internal_write          freezes        INSERT  {hc_internal}
subjects_internal               subjects       SELECT  {hc_internal}
subjects_internal_create        subjects       INSERT  {hc_internal}
```

`invites`, `freezes`, `freeze_claims`, `access_log`, `admin_users` carry
**no** authenticated policy: fail closed until the slice that needs them.
The hc_internal list is pinned by test 002:13 — it cannot grow without the
suite moving.

## Definer inventory and grants (002 asserts all of this mechanically)

SECURITY DEFINER, owner `hc_internal` (NOLOGIN; sole member: postgres, the
documented migration-runner exemption): `ctx()` → EXECUTE authenticated ·
`create_circle(text,jsonb,text[])` → EXECUTE authenticated ·
`ctx_for(uuid)`, `grant_vectors(uuid)`, `request_freeze(...)`,
`adjudicate_freeze(...)` → EXECUTE **nobody**. SECURITY INVOKER:
`log(...)` (reachable only from hc_internal chains), `uid()`,
`access_log_immutable()`, and the four pure functions (dom, all_domains,
ladder, visible_at → EXECUTE authenticated; policies evaluate them as the
caller). `search_path` pinned on every definer + `log`. Zero PUBLIC
EXECUTE anywhere in hc; global default-privilege revokes for both the
migration runner and hc_internal.

## Privilege snapshot (002:10–12, two directions)

`anon`, `hc_pipeline`, `hc_admin`: **zero** table privileges in public/hc.
`authenticated`: SELECT only on accounts, circles, subjects,
circle_members, access_grants. `hc_internal`: SELECT ×8 (those five +
freezes, freeze_claims, access_log, log_event_types) · INSERT ×7 (circles,
subjects, circle_members, access_grants, freezes, freeze_claims,
access_log) · UPDATE ×1 (freezes). No PUBLIC grant on any table. DELETE
granted to no role on anything.

## Test run (green output summary)

```
000_postgres_behaviour ....... ok   (15 — pre-1A platform net, untouched)
001_schema_invariants ........ ok   (53)
002_definer_invariants ....... ok   (13)
003_visible_at_truth_table ... ok   (36)
004_ctx_and_grant_vectors .... ok   (27)
005_identity_rls ............. ok   (18)
006_create_circle ............ ok   (22)
007_freeze ................... ok   (55)
008_perf_explain ............. ok   (9)
Files=9, Tests=248 — Result: PASS   (db:reset clean from empty, 9 migrations)
lint: clean · typecheck: clean · supabase db lint: no schema errors
```

## Red→green evidence (commit history on the PR)

Each red commit records its intended failure signature: M2 guardless
ladder (14 guard-property failures) · M3/M4 zero-row positives (fail-closed
boundary) · M5 constraints omitted (illegal freeze states accepted) · M7
granted-subjects-only grant_vectors (present-but-empty + frozen-flag
failures) · M8 no ledger (second claimant 23505 — ADR-0003 finding 1
live) · M9 declaration last (seq 1 = member_joined).

**Mutation test:** clause 2 removed → 003:11–14 red (freeze suite);
clause 3 fall-through → 003:16–21 red (AC-PERM-9 suite); restored →
248/248.

## Performance (008, measured at 100 circles × 2 subjects × 7 members)

Every textual `(select hc.ctx())` is an InitPlan node; the own-rows EXISTS
plans as a hashed (one-shot) SubPlan. Instrumented `ctx()`: exactly 1
execution for a one-reference query and 2 for a two-reference query over a
10-row visible scan — per textual reference, never per row (ADR-0003 f9).
Wall clock: subjects 2.9 ms, access_grants 11.2 ms (250 ms tripwire;
§1.8 page budget 1500 ms).

## Deviations and platform findings (dispositions requested)

1. **`hc.uid()` instead of `auth.uid()` inside definer bodies.** The auth
   schema is owned by `supabase_admin` (the image's only superuser);
   the migration runner (`postgres`) cannot grant its USAGE to
   hc_internal — the GRANT silently no-ops locally and in CI. `hc.uid()`
   reads the same `request.jwt` GUCs auth.uid() reads (no privilege
   required), identical semantics under PostgREST and tests. §3.2's
   observable contract is unchanged. *Is this acceptable as the permanent
   shape, or should deployment provision the auth-schema grant out of
   band and revert to the literal text?*
2. **Function-ACL-denial segfault (upstream bug).** Any function call
   refused by ACL as a request-path role crashes the backend (signal 11)
   on this image — minimal repro: a one-line SQL function with EXECUTE
   revoked, called as `authenticated`. Suspects among
   shared_preload_libraries: pgsodium/pg_tle/plan_filter. Table-privilege
   denials are unaffected. Consequence: function-closure tests assert
   `has_function_privilege() = false` (the property itself) instead of
   live denied calls; PostgREST never exposes `hc`, so no request path
   reaches a denied function directly. Upstream report to be filed.
   *Does the catalog-assertion form satisfy the invariant, and should 1B
   gate on the upstream fix?*
3. **Rate-limit constants** (PRD §7.5 pins semantics, not numbers):
   dismissed-prior claimant refused permanently; ≤3 claims per claimant
   per circle per 30 days; ≤10 per circle per 30 days. Function-local
   constants in `hc.request_freeze()`, test-asserted. *Reasonable
   defaults pending the counsel-owned adjudication protocol (G1)?*
4. **Identity-table read policy set** (TSD specifies the §3.4 shape, not
   these tables' rules): accounts self-row; circles/subjects/
   circle_members membership-scoped; access_grants own rows;
   invites/freezes/claims/access_log zero request-path access. *Confirm
   the fail-closed minimal set is right for 1A.*
5. **`access_log` in 1A** (kickoff's table list omitted it): forced by
   `seq = 1` custodianship (§2.3) and PRD §7.5 "Recorded". Family read
   policy, denial collapse, and head-signing staged to 1D as `pending`.
6. **ctx `shares` placeholder**: `object_shares` is 1B by the plan's
   slice boundary; ctx emits `'shares': {}` until 1B replaces the body
   with §3.2 verbatim. Clause-5 semantics fully truth-table-tested now
   (003); ctx integration `pending` (CTX-07).
7. **Custodianship declaration carries `subject_id` null** — it precedes
   the subject row by §2.3's own ordering; the subject is named in
   `detail` (subject_name, custodian, declared_on). *Confirm this reading
   of "it names subject, custodian and date".*
8. `pg_uuidv7` absent from the image → `gen_random_uuid()` on access_log
   (§2.1 "where enabled"; append locality only).

## Pointed review questions (beyond the dispositions above)

- Is the `hc_internal` write surface (INSERT-only + freezes UPDATE, no
  DELETE anywhere) the right long-term shape for 1B's revision paths?
- `hc.log()` is SECURITY INVOKER on the argument that only hc_internal
  chains reach it — prefer definer-with-empty-grants for uniformity, or
  keep the smaller definer inventory?
- The A.1 hc_admin cases run against identity tables in 1A (record tables
  land in 1B) — is the staged split in coverage.md acceptable?
