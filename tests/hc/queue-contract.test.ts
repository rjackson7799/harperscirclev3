import { describe, expect, it } from 'vitest';
import { DEFERRAL_THRESHOLD_SECONDS, READ_VT_SECONDS } from '@/lib/hc/workers';

// ============================================================================
// 6B B3 · the queue's visibility arithmetic, pinned as a CONTRACT
// (ADR-0023 R4/F-7 + R4/F-13).
//
// R4/F-7: the read visibility timeout was 120 s while the extract stage's
// §4.3 wall clock is 300 s — so for any extract that actually worked,
// MID-FLIGHT REDELIVERY WAS THE NORMAL CASE: a second reader received the
// in-flight message, its claim answered stale_lease, and the second reader
// archived the message UNCONDITIONALLY while the first still held the
// lease. Correctness survived (claim-before-work), but the queue's shape
// made the exceptional path the routine one.
//
// R4/F-13 (verified positive at round 15, asserted here so it cannot
// drift): releaseDeferredWork's threshold is DERIVED from the read window —
// raise one and the other moves — because the two are separated only by HOW
// FAR in the future a vt sits, and a threshold that lagged a raised read
// window would hand an in-flight message to a second reader.
// ============================================================================

describe('R4/F-7 · the read visibility window outlives the longest stage', () => {
  it('READ_VT_SECONDS exceeds the 300 s extract stage clock — redelivery of an in-flight message is the exception again', () => {
    expect(READ_VT_SECONDS).toBeGreaterThan(300);
  });

  it('the deferral-release threshold is DERIVED from the read window and sits well below the deferral (R4/F-13)', () => {
    expect(DEFERRAL_THRESHOLD_SECONDS).toBe(READ_VT_SECONDS + 180);
    expect(DEFERRAL_THRESHOLD_SECONDS).toBeLessThan(3600);
  });
});
