import type { NextConfig } from "next";

// S3 bucket host the app actually serves images from (mirrors lib/s3.ts). Used to
// scope the image optimizer to our bucket instead of all of *.amazonaws.com.
const S3_BUCKET =
  process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || "osrecord";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const S3_IMAGE_HOST = `${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;

// NOTE: Content-Security-Policy is set in middleware.ts (not here), because the
// /admin area uses a per-request nonce. These are the static security headers;
// the CSP header is attached per-response by the middleware.
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
    // Skip the optimizer in dev: it fetches images server-side from S3, which
    // can timeout on slower local networks. Production still runs the optimizer.
    ...(process.env.NODE_ENV === "development" && { unoptimized: true }),
    // Image optimizer is ON, with a curated allowlist (not an open proxy) of the
    // hosts our images actually come from: our own S3 bucket, Spotify artwork
    // (scdn.co, from artist import), and Google avatars. Scoped to the specific
    // bucket host (not all of *.amazonaws.com) to avoid the optimizer being able
    // to server-side-fetch arbitrary AWS-hosted content. If artwork on another
    // host ever 404s through the optimizer, add its host here.
    // VERIFY in a staging/prod environment with S3 + outbound access before
    // relying on this — the optimizer fetches each source image server-side.
    remotePatterns: [
      { protocol: "https", hostname: S3_IMAGE_HOST },
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
