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
    // Cover/artist artwork URLs are admin-provided and can point at many hosts.
    // Kept permissive over https only (http image sources are blocked as mixed
    // content on the production https site anyway).
    //
    // NOTE: To enable the Next image optimizer (PERFORMANCE.md item 2), drop
    // `unoptimized: true` below and tighten this to the S3 bucket so the
    // optimizer isn't an open proxy:
    //   remotePatterns: [{ protocol: "https", hostname:
    //     "osrecord.s3.us-east-1.amazonaws.com" }]
    // All current artwork (verified) lives on that bucket. Confirm images load
    // in an environment with S3 access before shipping — the optimizer fetches
    // the source server-side, and also un-guard the per-image `unoptimized`
    // props in UpcomingReleasesSection / MeetArtistSection.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    unoptimized: true,
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
