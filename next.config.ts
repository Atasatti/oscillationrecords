import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// S3 bucket host the app actually serves images from (mirrors lib/s3.ts). Used to
// scope the image optimizer to our bucket instead of all of *.amazonaws.com.
const S3_BUCKET =
  process.env.AWS_BUCKET_NAME || process.env.S3_BUCKET_NAME || "osrecord";
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const S3_IMAGE_HOST = `${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;

// Content-Security-Policy. ENFORCED in production; REPORT-ONLY in development so
// it never blocks the dev server's HMR (which uses eval). 'unsafe-inline' is
// retained because the site relies on SSG/ISR + Next's framework inline scripts
// and our JSON-LD <script> tags — dropping it requires nonce-based CSP, which
// would force fully dynamic rendering (loss of SSG/ISR). That hardening is the
// documented next step. ROLLBACK: set `cspHeaderKey` to the Report-Only name.
// 'unsafe-eval' is added in dev ONLY (HMR); never in production.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Artwork is admin-provided and can live on many https hosts (S3, scdn, etc.).
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "form-action 'self'",
  "frame-src 'self' https://accounts.google.com",
  "upgrade-insecure-requests",
].join("; ");

const cspHeaderKey = isDev
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

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
  { key: cspHeaderKey, value: csp },
];

const nextConfig: NextConfig = {
  images: {
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
