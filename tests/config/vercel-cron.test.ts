import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// ============================================================================
// A8 · The security-actions sweep has a CHECKED-IN production invoker
// (round-10 finding 3): the wasnt-me retry contract is "delay, never a
// loss" only if something actually invokes the sweep. This pin makes the
// scheduler part of the reviewed tree — vercel.json's cron block — so the
// claim never again rests on a comment. Cadence: sub-daily (the §5.11
// maximum tolerated pending age is cadence-bound; the ops runbook records
// the threshold and the Hobby-plan daily-only limitation as insufficient).
// ============================================================================

describe('A8 · vercel.json schedules the security-actions sweep', () => {
  const cfg = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../vercel.json'), 'utf8'),
  ) as { crons?: { path: string; schedule: string }[] };

  it('a cron entry targets /api/worker/security-actions', () => {
    const cron = (cfg.crons ?? []).find((c) => c.path === '/api/worker/security-actions');
    expect(cron).toBeDefined();
  });

  it('the cadence is sub-daily — a pending kill waits minutes, not a day', () => {
    const cron = (cfg.crons ?? []).find((c) => c.path === '/api/worker/security-actions');
    // Hour field '*': the sweep runs at least hourly.
    expect(cron?.schedule).toMatch(/^\S+ \* \* \* \*$/);
  });
});
