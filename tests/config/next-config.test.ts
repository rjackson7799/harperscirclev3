import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';

// ============================================================================
// B9 · The dev server serves the LOCAL-GATE origin (the third costume of
// the localhost/127.0.0.1 schism): Next 16's cross-origin dev protection
// treats the browser's 127.0.0.1 as foreign to the server's own
// `localhost`, 403s /_next/static chunks, and the first genuinely
// client-JS surface (the tus upload form) never hydrates — a dead
// button, zero errors anywhere server-side. allowedDevOrigins is the
// documented fix; dev-only, no production effect.
// ============================================================================

describe('B9 · next.config allows the gate origin in dev', () => {
  it('allowedDevOrigins covers 127.0.0.1 (the playwright baseURL host)', () => {
    const allowed = (nextConfig as { allowedDevOrigins?: string[] }).allowedDevOrigins ?? [];
    expect(allowed).toContain('127.0.0.1');
  });
});
