import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js';

/**
 * The ONE classifier of an auth-server error, shared by the page gate
 * (lib/auth/session.ts) and the request proxy (proxy.ts) — 7B B1, OW-11.
 * Pure: no `server-only`, no I/O, so the proxy bundle can carry it.
 *
 * THE RULE (round-19 F-2): ONLY AN AUTHENTICATION ANSWER MEANS SIGNED OUT. A
 * fault is not an authentication answer, and neither is silence.
 *
 * `AuthSessionMissingError` and a 4xx from GoTrue are the auth server telling
 * us about the session. Everything else — a fetch that failed
 * (`AuthRetryableFetchError` is what supabase-js wraps a dead socket in), a
 * 5xx from Kong or GoTrue, a 429, and anything unclassifiable — is the auth
 * server failing to tell us anything at all.
 *
 * 429 is called out because it is the most tempting to mis-file: a rate limit
 * arrives as a 4xx and reads like a refusal, but being throttled is not being
 * signed out, and `token_refresh = 150 / 5 min / IP` is shared by every
 * browser context a gate runs.
 */
export function isAuthenticationAnswer(error: unknown): boolean {
  if (isAuthSessionMissingError(error)) return true;
  if (isAuthRetryableFetchError(error)) return false;
  if (isAuthApiError(error)) {
    const { status } = error;
    if (status === 429) return false;
    return status < 500;
  }
  return false;
}

/** The fault, named for the operational log — never for a person. */
export function faultText(error: unknown): string {
  const e = error as { name?: string; status?: number; message?: string };
  return `${e?.name ?? 'Error'}${e?.status ? ` ${e.status}` : ''}: ${e?.message ?? String(error)}`;
}
