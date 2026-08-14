# Harper's Circle

A family operating system for aging-parent care.

The governing documents live in `docs/`: `PRD.md` (product), `TSD.md`
(technical), `design_spec.md` (visual and interaction contract). Architecture
decisions are recorded in `docs/adr/`.

## Toolchain (pinned)

- Node 22.15 (`.nvmrc`), npm 10.9 (`packageManager`)
- Next.js 16.3.1, TypeScript
- Supabase CLI 2.100.1 (devDependency), local Postgres 17 (`supabase/config.toml`)

## Commands

```
npm run dev        # Next.js dev server
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm run db:reset   # apply all migrations to local Supabase from empty
npm run test:db    # pgTAP suite (supabase/tests)
npm run db:verify  # database lint
```

Local database work requires Docker Desktop, then `npx supabase start`.

## The one ordering rule

Permissions are written first and tested first (PRD §3). The authorization
kernel (slice 1A) lands green and reviewed before anything else exists.
`lib/db/` exposes one client factory per trust boundary (TSD §1.2); the
service-role factory is deliberately not in the barrel — see
`lib/db/service-role.ts` and `scripts/check-service-role-containment.mjs`.
