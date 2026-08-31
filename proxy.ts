import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { faultText, isAuthenticationAnswer } from '@/lib/auth/session-outcome';
import { sessionUnavailablePage } from '@/lib/http/session-unavailable';

/**
 * The §1.7 session-refresh pass (Next 16: proxy.ts). Its ONE job is token
 * rotation: Server Components cannot write cookies, so the refresh that
 * @supabase/ssr performs when an access token has expired must happen here,
 * where Set-Cookie is possible. No authorization lives here — RLS decides
 * everything (§1.3); hiding UI is never the enforcement mechanism.
 *
 * 7B B1 · GTE-01 (OW-11): THE 503 A PAGE CANNOT ANSWER IS ANSWERED HERE. A
 * Server Component's honest moves are a render, a redirect, notFound and the
 * auth interrupts; none of them is a 503. This pass already reads the session
 * for every request it matches — `getClaims()` verifies the local HS256 token
 * by calling getUser — so when that read FAULTS (a dead socket, a 5xx, a 429:
 * `isAuthenticationAnswer` is the gate's own classifier) the proxy answers
 * `503` + `retry-after` + `private, no-store` with the same words the page
 * renders, for the request it observed the fault on. An authentication
 * ANSWER — no session, a 401 — passes through untouched: the page decides,
 * exactly as before. A page that reaches its own gate during the residual
 * window renders the state (components/ui/SessionUnavailable) at 200.
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
  const here = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  try {
    const { error } = await supabase.auth.getClaims();
    if (error && !isAuthenticationAnswer(error)) {
      console.error(`proxy: the live session could not be READ at ${here} — ${faultText(error)}`);
      return sessionUnavailablePage(here);
    }
  } catch (err) {
    console.error(`proxy: the live session could not be READ at ${here} — ${faultText(err)}`);
    return sessionUnavailablePage(here);
  }

  return response;
}

export const proxyConfig = {
  // Everything except static assets and images; auth routes included — a
  // rotated session must reach the (auth) redirects too.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
