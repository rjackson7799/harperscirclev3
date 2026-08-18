import { formFields, redirect303 } from '@/lib/auth/http';
import { RELATIONSHIPS, SLICES } from '@/lib/setup/steps';

/**
 * Step 1 writes nothing (PRD §4.1.3) — BOTH answers travel as query state
 * to step 2, "held until step 2 creates the circle" as the PRD says
 * (round-10 finding 1, ADR-0015). Step 2's submit lands the slice
 * (accounts.slice); the relationship is present at circle creation but
 * has no schema slot in Phase 1 — its column is queued in the ADR-0015
 * bound-amendment batch, and lands as one line in step 2 when it exists.
 */
export async function POST(req: Request): Promise<Response> {
  const fields = await formFields(req);
  const slice = SLICES.some((s) => s.value === fields.slice) ? fields.slice : '';
  const relationship = RELATIONSHIPS.some((r) => r.value === fields.relationship)
    ? fields.relationship
    : '';
  const params = new URLSearchParams();
  if (slice) params.set('slice', slice);
  if (relationship) params.set('relationship', relationship);
  const query = params.toString();
  return redirect303(req, `/setup/step/2${query ? `?${query}` : ''}`);
}
