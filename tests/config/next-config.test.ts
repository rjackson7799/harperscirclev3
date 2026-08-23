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

// ============================================================================
// 5B B2 · mupdf is opted OUT of Server Components bundling. It is a WASM
// build that resolves its own .wasm asset through Node's require/fs at
// runtime; bundled into the RSC graph that resolution breaks, and the
// extract worker's very first render would fail in production while every
// local test stayed green. `pg` rides Next's own built-in external list;
// mupdf is not on it, so the opt-out is named here and pinned here.
// ============================================================================

describe('5B B2 · the rasterizer is a native require, not a bundle', () => {
  it('serverExternalPackages names mupdf', () => {
    const external =
      (nextConfig as { serverExternalPackages?: string[] }).serverExternalPackages ?? [];
    expect(external).toContain('mupdf');
  });
});
