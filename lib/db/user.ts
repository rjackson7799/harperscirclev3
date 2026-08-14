/**
 * asUser() — the family request path (TSD §1.2, §1.3, §1.9).
 *
 * PostgREST via @supabase/ssr carrying the caller's session JWT. PostgREST
 * sets `role authenticated` and `request.jwt.claims`; RLS decides everything.
 * There is no service-role read path for family data, so a forgotten
 * `.eq('circle_id', …)` is a missing optimisation, never a leak.
 */
export function asUser(): never {
  throw new Error('asUser(): not implemented until the app surfaces land (TSD slice 2+)');
}
