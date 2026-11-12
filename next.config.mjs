import { buildStamp } from "./lib/build-stamp.mjs";

/**
 * The stamp is computed once, here, at build time — where the sources exist.
 *
 * It is threaded through in two ways on purpose, because they fail
 * independently:
 *
 *   generateBuildId  makes Next's own build id BE the content hash, so
 *                    .next/BUILD_ID carries it into the standalone image.
 *   env.MMA_BUILD    inlines the same value into the server bundle, so the
 *                    route can answer without touching the filesystem.
 *
 * This file is ALSO evaluated at runtime by the standalone server, where app/
 * and content/ are not in the image. buildStamp() returns 'unknown' there
 * rather than throwing — see lib/build-stamp.mjs. That is why the route prefers
 * the inlined value and falls back to reading BUILD_ID, rather than calling
 * buildStamp() itself.
 */
const BUILD = buildStamp();

/**
 * Security headers on every answer (HIPAA map, 2026-11-12 sweep; same set as octopus-kit
 * server/safeguards.js secureHeaders). The CSP restricts only framing, <base>, form targets and
 * plugins; it does NOT restrict script, style, img or connect, so Next's inline bootstrap scripts,
 * fonts and favicons from auth's /brand/ keep working. Next already serves dynamic pages with
 * no-store and fingerprinted assets as immutable, so no Cache-Control is added here.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  generateBuildId: () => BUILD,
  env: { MMA_BUILD: BUILD },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
