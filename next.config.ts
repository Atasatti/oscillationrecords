import type { NextConfig } from "next";

// Content-Security-Policy, shipped REPORT-ONLY first so it reports violations
// (browser console) without blocking anything. Review for a release cycle, then
// switch the header key to "Content-Security-Policy" to enforce. Note:
// 'unsafe-inline' is a pragmatic first step (Next.js + our JSON-LD use inline
// scripts/styles); the stricter upgrade is nonce-based CSP via middleware.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Artwork is admin-provided and can live on many https hosts (S3, scdn, etc.).
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "form-action 'self'",
  "frame-src 'self' https://accounts.google.com",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  images: {
    // Image optimizer is ON, with a curated allowlist (not an open proxy) of the
    // hosts our images actually come from: S3 uploads, Spotify artwork (scdn.co,
    // from artist import), and Google avatars. If artwork on another host ever
    // 404s through the optimizer, add its host here.
    // VERIFY in a staging/prod environment with S3 + outbound access before
    // relying on this — the optimizer fetches each source image server-side.
    remotePatterns: [
      { protocol: "https", hostname: "**.amazonaws.com" },
      { protocol: "https", hostname: "**.scdn.co" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
