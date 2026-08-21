import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // B9: the local gate's browser sits on 127.0.0.1 while the dev server
  // considers its own origin `localhost` — without this, Next 16's
  // cross-origin dev protection 403s /_next/static chunks and any
  // client-JS surface (the tus upload form) silently never hydrates.
  // Dev-only; no production effect.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
