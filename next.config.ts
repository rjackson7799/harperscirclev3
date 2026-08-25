import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // B9: the local gate's browser sits on 127.0.0.1 while the dev server
  // considers its own origin `localhost` — without this, Next 16's
  // cross-origin dev protection 403s /_next/static chunks and any
  // client-JS surface (the tus upload form) silently never hydrates.
  // Dev-only; no production effect.
  allowedDevOrigins: ["127.0.0.1"],

  // 6B B1 (the 5B B2 opt-out, re-pointed at the replacement rasterizer —
  // D24 ruling 1): `@napi-rs/canvas` is a native N-API addon resolving its
  // own .node binary through require at runtime, and `pdfjs-dist` resolves
  // its font/cmap/wasm resource directories relative to its own installed
  // files. Bundling either into the Server Components graph breaks that
  // resolution, so both are opted OUT and required natively — the
  // documented mechanism for exactly this
  // (node_modules/next/dist/docs/01-app/03-api-reference/05-config/
  // 01-next-config-js/serverExternalPackages.md). `pg` is already on
  // Next's own built-in list; these two are not, so they are named here.
  //
  // 6B close-out: the OCR engine joins them, for the SAME reason and by the
  // same mechanism — B9 added a dependency of this exact shape and did not
  // add it here, so the bundle handed tesseract.js a module id
  // ("[project]/node_modules/tesseract.js/src/worker-script/node/index.js
  // [app-route] (ecmascript)") where it needed an absolute path, and §6.9's
  // reading aid was simply absent from the running app. `tesseract.js`
  // spawns its worker from a resolved filename; `@tesseract.js-data/eng` is
  // resolved by `lib/pipeline/ocr.ts` for `langPath`. Both are resolved BY
  // PATH from first-party code, which is now the mechanical rule:
  // `tests/lint/server-external-packages.test.ts` requires every such
  // package to be external, so the next dependency of this shape cannot be
  // added without saying so here.
  serverExternalPackages: [
    "pdfjs-dist",
    "@napi-rs/canvas",
    "tesseract.js",
    "@tesseract.js-data/eng",
  ],
};

export default nextConfig;
