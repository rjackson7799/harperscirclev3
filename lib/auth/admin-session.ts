import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminSessionRead =
  | { kind: 'verified-session'; identity: { sub: string; session_id: string; aal: 'aal2'; exp: number } }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

/** Verification only. Operator registration and live DB state still gate reads. */
export async function readAdminSession(_client: SupabaseClient): Promise<AdminSessionRead> {
  return { kind: 'unavailable' };
}
