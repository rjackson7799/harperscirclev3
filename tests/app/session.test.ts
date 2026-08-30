import { describe, expect, it, vi } from 'vitest';
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthUnknownError,
} from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readLiveSession } from '@/lib/auth/session';

// ============================================================================
// ROUND-19 F-2 — the session gate must not render an OUTAGE as a SIGN-OUT.
//
// The gate founder's session answered 401 at 22:01 in run r2, six minutes
// after it was provisioned and SIX SECONDS after the same session rendered a
// signed-in /upload page (200, not the redirect that page takes when claims
// are null). A revoked session cannot un-revoke, so the session was live and
// the 401 was a fault in READING it — the call took 24.3 s and then answered
// "sign in first".
//
// The cause is one line: liveSessionClaims returned null for EVERY failure of
// getUser(), and null is the shape of "there is no session". Twenty call sites
// read that null as the signed-out answer. So an auth server that stalls, a
// gateway that 502s and a rate limit all sign a family out of the whole app.
//
// This route's own doctrine already forbids exactly that, one layer up
// (ADR-0027 D2): "a session the route could not READ in time is not a session
// that does not exist, and the difference is the only thing the caller needs —
// WHETHER TO TRY AGAIN." These pin it one layer down, where the collapse is.
//
// The rule: ONLY AN AUTHENTICATION ANSWER MEANS SIGNED OUT. A fault is not an
// authentication answer, and neither is silence.
// ============================================================================

/** Just enough client for the gate: the two auth round-trips it makes. */
function client(
  getUser: () => Promise<unknown>,
  getClaims: () => Promise<unknown> = async () => ({ data: { claims: { sub: 'u1' } } }),
): SupabaseClient {
  return { auth: { getUser: vi.fn(getUser), getClaims: vi.fn(getClaims) } } as unknown as SupabaseClient;
}

const USER = { data: { user: { id: 'u1' } }, error: null };

describe('F-2 · readLiveSession separates "not signed in" from "could not tell"', () => {
  it('a live session reads signed-in, and the claims ride along', async () => {
    const read = await readLiveSession(client(async () => USER));
    expect(read.kind).toBe('signed-in');
    expect(read.kind === 'signed-in' && read.claims.sub).toBe('u1');
  });

  it('the auth server SAYS no session ⇒ signed-out (an authentication answer)', async () => {
    const read = await readLiveSession(
      client(async () => ({ data: { user: null }, error: new AuthSessionMissingError() })),
    );
    expect(read.kind).toBe('signed-out');
  });

  it('a 401 from the auth server ⇒ signed-out (also an authentication answer)', async () => {
    const read = await readLiveSession(
      client(async () => ({ data: { user: null }, error: new AuthApiError('bad jwt', 401, 'bad_jwt') })),
    );
    expect(read.kind).toBe('signed-out');
  });

  it('NO error and NO user ⇒ signed-out', async () => {
    const read = await readLiveSession(client(async () => ({ data: { user: null }, error: null })));
    expect(read.kind).toBe('signed-out');
  });

  // ---- the four faults that r2's 401 was one of, and none of which is an
  // ---- authentication answer -------------------------------------------
  it('a fetch fault (the auth server did not answer) ⇒ unavailable, NEVER signed-out', async () => {
    const read = await readLiveSession(
      client(async () => ({
        data: { user: null },
        error: new AuthRetryableFetchError('fetch failed', 0),
      })),
    );
    expect(read.kind).toBe('unavailable');
  });

  it('a 502 from the gateway ⇒ unavailable', async () => {
    const read = await readLiveSession(
      client(async () => ({ data: { user: null }, error: new AuthApiError('bad gateway', 502, undefined) })),
    );
    expect(read.kind).toBe('unavailable');
  });

  it('a 429 rate limit ⇒ unavailable — being throttled is not being signed out', async () => {
    const read = await readLiveSession(
      client(async () => ({
        data: { user: null },
        error: new AuthApiError('over_request_rate_limit', 429, 'over_request_rate_limit'),
      })),
    );
    expect(read.kind).toBe('unavailable');
  });

  it('an error the client cannot classify ⇒ unavailable — silence is not an answer', async () => {
    const read = await readLiveSession(
      client(async () => ({
        data: { user: null },
        error: new AuthUnknownError('boom', new Error('socket hang up')),
      })),
    );
    expect(read.kind).toBe('unavailable');
  });

  it('a THROW out of getUser ⇒ unavailable, and the gate does not propagate it', async () => {
    const read = await readLiveSession(
      client(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    expect(read.kind).toBe('unavailable');
  });

  // ---- getClaims is the SECOND round-trip and was discarding its error ----
  it('getUser succeeds but getClaims FAULTS ⇒ unavailable, not signed-out', async () => {
    const read = await readLiveSession(
      client(
        async () => USER,
        async () => ({ data: null, error: new AuthRetryableFetchError('fetch failed', 0) }),
      ),
    );
    expect(read.kind).toBe('unavailable');
  });

  it('getUser succeeds but getClaims yields no sub ⇒ signed-out', async () => {
    const read = await readLiveSession(
      client(
        async () => USER,
        async () => ({ data: { claims: {} }, error: null }),
      ),
    );
    expect(read.kind).toBe('signed-out');
  });
});

// ---------------------------------------------------------------------------
// 7B B1 (GTE-01, OW-11): the describe that stood here — "liveSessionClaims
// keeps its contract for the twelve PAGE gates: a fault still yields null for
// PAGES, but SAYS SO" — pinned the collapse this round removes. The
// two-outcome function is gone; the page and route gates that replaced it are
// pinned in tests/app/gate.test.ts (the helpers) and tests/app/page-gate.test.ts
// (every site on disk). The instrument half survives there: the fault is still
// written down, at the site that read it.
// ---------------------------------------------------------------------------
