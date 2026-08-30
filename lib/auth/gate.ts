import 'server-only';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestClaims } from '@/lib/db';
import { readLiveSession } from './session';
import { redirect303 } from './http';
import { sessionUnavailablePage } from '@/lib/http/session-unavailable';

/**
 * THE PAGE GATE WITH ITS THREE OUTCOMES INTACT — 7B B1 (GTE-01; ADR-0028 D8
 * item 2 / OW-11; D15 item 1 / OW-15). Every signed-in page and every form
 * route gates through one of the two functions here, so the third outcome
 * cannot be dropped by a call site that only remembered two.
 *
 * WHAT WAS WRONG. `liveSessionClaims` flattened `readLiveSession`'s
 * `unavailable` to `null`, and null is the shape of "there is no session".
 * ADR-0028 D15 counted the sites: 21 — 3 refuse with a status (artifact,
 * upload/token, upload/complete: they already read the three outcomes) ·
 * 10 pages redirect to /sign-in · 5 form routes redirect exactly as the
 * pages do · 1 layout degrades · 2 do not gate at all (invite/submit and
 * members/remove read getClaims directly). So an auth server that stalled, a
 * gateway that 502'd, and a rate limit each signed a family out of their
 * own record during an availability incident (round-19 F-2, the PRODUCT
 * half). The 10 and the 5 now come here; `liveSessionClaims` is gone.
 *
 * THE RULE, unchanged: ONLY AN AUTHENTICATION ANSWER MEANS SIGNED OUT. On
 * `signed-out` a page redirects and a route 303s to /sign-in, exactly as
 * before. On `unavailable` a page RENDERS the state (components/ui/
 * SessionUnavailable — a Server Component cannot set a status; the proxy
 * answers the 503 for the request it observes the fault on, see proxy.ts)
 * and a route ANSWERS 503 with `retry-after` and `private, no-store` —
 * never a sign-in, never success, never silence: the fault is logged with
 * its cause, which is the instrument half of F-2.
 */

/** A signed-in read always carries `sub` — readLiveSession refuses one
 *  without it — so the pages need no `!` to hand it on. */
export type SignedInClaims = RequestClaims & { sub: string };

export type PageGate =
  | { kind: 'signed-in'; claims: SignedInClaims }
  | { kind: 'unavailable'; why: string };

export function signInPath(next: string): string {
  return `/sign-in?next=${encodeURIComponent(next)}`;
}

/**
 * For a page. `signed-out` REDIRECTS (throws Next's redirect, so nothing
 * below the gate runs); the caller renders `unavailable` and proceeds on
 * `signed-in`. `next` is the page's own path — where sign-in returns to and
 * where "try again" points.
 */
export async function gatePage(supabase: SupabaseClient, next: string): Promise<PageGate> {
  const read = await readLiveSession(supabase);
  if (read.kind === 'signed-in') return { kind: 'signed-in', claims: read.claims as SignedInClaims };
  if (read.kind === 'signed-out') redirect(signInPath(next));
  console.error(`session: the live session could not be READ at ${next} — ${read.why}`);
  return { kind: 'unavailable', why: read.why };
}

export type RouteGate =
  | { kind: 'signed-in'; claims: SignedInClaims }
  | { kind: 'refused'; response: Response };

/**
 * For a form route. Both refusals come back as the Response to return —
 * the 303 to /sign-in on `signed-out`, the 503 page on `unavailable` — so a
 * route has exactly one line between the read and its work.
 */
export async function gateRoute(
  supabase: SupabaseClient,
  req: Request,
  next: string,
): Promise<RouteGate> {
  const read = await readLiveSession(supabase);
  if (read.kind === 'signed-in') return { kind: 'signed-in', claims: read.claims as SignedInClaims };
  if (read.kind === 'signed-out') {
    return { kind: 'refused', response: redirect303(req, signInPath(next)) };
  }
  console.error(`session: the live session could not be READ at ${next} — ${read.why}`);
  return { kind: 'refused', response: sessionUnavailablePage(next) };
}
