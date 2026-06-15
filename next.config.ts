import type { NextConfig } from "next";

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
