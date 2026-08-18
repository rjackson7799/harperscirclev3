import 'server-only';
import { makeRoleFactory, type RoleDb } from './role-pool';

/**
 * asAdmin() — the /admin path (TSD §1.2, §1.9, §3.9).
 *
 * Direct connection pinned to `hc_admin` — never PostgREST, never a JWT
 * role claim, never the service role. The admin boundary is an absent
 * privilege, not a token: `hc_admin` can SELECT the `admin_meta` views and
 * nothing else (AC-ADMIN-1/2 rest on privileges that do not exist).
 * The deploy credential rides HC_ADMIN_DB_URL; hc_admin itself is NOLOGIN.
 */
const factory = makeRoleFactory('hc_admin', 'HC_ADMIN_DB_URL');

export function asAdmin(): RoleDb {
  return factory();
}
