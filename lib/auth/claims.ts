import 'server-only';
import type { RequestClaims } from '@/lib/db';

/**
 * Claims for the request-role channel.
 *
 * decodeTrustedAccessToken: payload decode WITHOUT signature verification —
 * for tokens received DIRECTLY from GoTrue over the server-to-server call
 * that minted them (signInWithPassword's response). Never use it on a
 * token that arrived from a browser; cookie-borne sessions go through
 * asUser().auth.getClaims(), which verifies.
 */
export function decodeTrustedAccessToken(accessToken: string): RequestClaims {
  const payload = accessToken.split('.')[1];
  if (!payload) throw new Error('decodeTrustedAccessToken: not a JWT');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as RequestClaims;
}
