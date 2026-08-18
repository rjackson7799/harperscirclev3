import 'server-only';
import { insertAccountRow, unconfirmEmail as maintenanceUnconfirm } from '@/lib/db/maintenance';

/**
 * Account-identity wrappers for the create-account boundary (TSD §2.3;
 * PRD §4.1.2). Both ride the maintenance boundary; see lib/db/maintenance
 * for why each write exists and the round-10 question each one carries.
 */

export async function bootstrapAccount(userId: string, displayName: string): Promise<void> {
  await insertAccountRow(userId, displayName);
}

export async function unconfirmEmail(userId: string): Promise<void> {
  await maintenanceUnconfirm(userId);
}
