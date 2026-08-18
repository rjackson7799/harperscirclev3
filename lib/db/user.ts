import 'server-only';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * asUser() — the family request path (TSD §1.2, §1.3, §1.9).
 *
 * PostgREST via @supabase/ssr carrying the caller's session JWT. PostgREST
 * sets `role authenticated` and `request.jwt.claims`; RLS decides
 * everything. There is no service-role read path for family data, so a
 * forgotten `.eq('circle_id', …)` is a missing optimisation, never a leak.
 *
 * hc.* is not reachable here (PIN-01) — definer calls ride the fenced
 * request-role channel through lib/hc/**.
 */

export type CookieBridge = {
  getAll(): { name: string; value: string }[];
  setAll(cookies: { name: string; value: string; options?: object }[]): void;
};

/** The pure half: a server client over an explicit cookie store. */
export function createUserClient(cookies: CookieBridge): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'asUser(): NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set',
    );
  }
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookies.getAll(),
      setAll: (toSet) => cookies.setAll(toSet),
    },
  });
}

/** The Next half: the same client over the request's cookie store. */
export async function asUser(): Promise<SupabaseClient> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  return createUserClient({
    getAll: () => store.getAll(),
    setAll: (toSet) => {
      try {
        for (const { name, value, options } of toSet) {
          store.set(name, value, options as never);
        }
      } catch {
        // Server Components cannot write cookies; the proxy refresh pass
        // owns rotation there (§1.7 middleware note).
      }
    },
  });
}
