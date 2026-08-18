import { formFields, redirect303 } from '@/lib/auth/http';
import { SLICES } from '@/lib/setup/steps';

/**
 * Step 1 writes nothing (PRD §4.1.3) — the answers travel as query state
 * to step 2, whose submit lands them with the circle. The relationship
 * answer has no schema slot in Phase 1 (recorded in the 2B build ADR);
 * it is asked because the screen is specified to ask it.
 */
export async function POST(req: Request): Promise<Response> {
  const fields = await formFields(req);
  const slice = SLICES.some((s) => s.value === fields.slice) ? fields.slice : '';
  return redirect303(req, `/setup/step/2${slice ? `?slice=${encodeURIComponent(slice)}` : ''}`);
}
