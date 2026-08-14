/**
 * asAdmin() — the /admin path (TSD §1.2, §1.9, §3.9).
 *
 * Connects AS `hc_admin` over Supavisor in transaction mode, with its own
 * credential — never PostgREST, never a JWT role claim, never the service
 * role. The admin boundary is an absent privilege, not a token: `hc_admin`
 * can SELECT the `admin_meta` views and nothing else.
 */
export function asAdmin(): never {
  throw new Error('asAdmin(): not implemented until the /admin surfaces land (TSD §9)');
}
