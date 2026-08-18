import 'server-only';
import { randomBytes } from 'node:crypto';
import { asGoTrueAdmin } from '@/lib/db/service-role';

/**
 * The single GoTrue-admin wrapper (the §1.7 fence allowlist's second
 * entry). Everything the app does with the admin credential is one of the
 * named operations below; the raw client never leaves this module.
 */

/**
 * The forced-reset half of the §5.11 kill (ADR-0013 F3): rotate the
 * password to entropy nobody holds, so the only way back in is the email
 * recovery path — which is never throttled (AC-AUTH-12) and lands in the
 * mailbox that pulled the kill switch. Session revocation is the DB half
 * (lib/db/maintenance.revokeAuthSessions — the probed GoTrue exposes no
 * per-user admin logout endpoint); lib/hc/security-actions composes both.
 */
export async function rotatePasswordToRandom(userId: string): Promise<void> {
  const { error } = await asGoTrueAdmin().updateUserById(userId, {
    password: randomBytes(32).toString('hex'),
  });
  if (error) throw error;
}
