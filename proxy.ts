import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * The §1.7 session-refresh pass (Next 16: proxy.ts). Its ONE job is token
 * rotation: Server Components cannot write cookies, so the refresh that
 * @supabase/ssr performs when an access token has expired must happen here,
 * where Set-Cookie is possible. No authorization lives here — RLS decides
 * everything (§1.3); hiding UI is never the enforcement mechanism.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Validates the JWT signature locally and refreshes through GoTrue only
  // when expired — the rotation write lands on `response` via setAll.
  await supabase.auth.getClaims();

  return response;
}

export const proxyConfig = {
  // Everything except static assets and images; auth routes included — a
  // rotated session must reach the (auth) redirects too.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
