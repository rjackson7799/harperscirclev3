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
// 6B B1 · the rasterizer pair is opted OUT of Server Components bundling
// (the 5B B2 pin, re-pinned for the replacement engines — D24 ruling 1).
// `@napi-rs/canvas` is a native N-API addon that resolves its own .node
// binary through require at runtime, and `pdfjs-dist` resolves its font,
// cmap and wasm resource directories relative to its own installed files;
// bundled into the RSC graph both resolutions break, and the extract
// worker's very first render would fail in production while every local
// test stayed green. `pg` rides Next's own built-in external list; these
// two do not, so the opt-out is named here and pinned here. `mupdf`
// (AGPL-3.0-or-later) is REMOVED, so its opt-out must be gone with it —
// a lingering external for an absent package would be the last trace of
// the dependency the ruling removed.
// ============================================================================

describe('6B B1 · the rasterizer is a native require, not a bundle', () => {
  it('serverExternalPackages names the replacement pair and no longer names mupdf', () => {
    const external =
      (nextConfig as { serverExternalPackages?: string[] }).serverExternalPackages ?? [];
    expect(external).toContain('pdfjs-dist');
    expect(external).toContain('@napi-rs/canvas');
    expect(external).not.toContain('mupdf');
  });
});
