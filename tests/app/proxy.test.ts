import { describe, expect, it } from 'vitest';

// ============================================================================
// A2 · proxy.ts — the §1.7 middleware session-refresh pass (Next 16 names
// it proxy). The behavioural half (rotation against live GoTrue) belongs to
// the E2E walkthrough; this pins the contract shape so the file cannot
// silently stop matching or stop exporting.
// ============================================================================

describe('A2 · proxy.ts exports the Next 16 proxy contract', () => {
  it('exports proxy() and a matcher that skips static assets', async () => {
    const mod = await import('@/proxy');
    expect(typeof mod.proxy).toBe('function');
    const matcher: string[] = mod.proxyConfig.matcher;
    expect(Array.isArray(matcher)).toBe(true);
    expect(matcher.join(' ')).toContain('_next/static');
  });
});
