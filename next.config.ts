import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // B9: the local gate's browser sits on 127.0.0.1 while the dev server
  // considers its own origin `localhost` — without this, Next 16's
  // cross-origin dev protection 403s /_next/static chunks and any
  // client-JS surface (the tus upload form) silently never hydrates.
  // Dev-only; no production effect.
  allowedDevOrigins: ["127.0.0.1"],

  // 5B B2: mupdf is a WASM build that loads its own .wasm asset with
  // Node's own require/fs at runtime. Bundling it into the Server
  // Components graph breaks that resolution, so it is opted OUT and
  // `require`d natively — the documented mechanism for exactly this
  // (node_modules/next/dist/docs/01-app/03-api-reference/05-config/
  // 01-next-config-js/serverExternalPackages.md). `pg` is already on
  // Next's own built-in list; mupdf is not, so it is named here.
  serverExternalPackages: ["mupdf"],
};

export default nextConfig;
