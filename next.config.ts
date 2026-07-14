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
  // Pin the workspace root to this project. A stray lockfile in the parent dir
  // (C:\Users\…\package-lock.json) made Next infer too high a root and try to
  // watch C:\ system files in dev (the Watchpack EINVAL errors). This silences
  // that warning and scopes file watching / output tracing to the project.
  outputFileTracingRoot: __dirname,
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
    // Keep the admin area and API out of search indexes. robots.txt `Disallow`
    // only asks crawlers not to fetch; an X-Robots-Tag: noindex header actually
    // deindexes URLs that were already crawled (and API JSON responses).
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      { source: "/admin", headers: noindex },
      { source: "/admin/:path*", headers: noindex },
      { source: "/api/:path*", headers: noindex },
    ];
  },
  async redirects() {
    // The admin IA was flattened: the "catalog" / "content" routing-group segments
    // were removed from URLs, and a few sub-views were re-nested under their nav
    // parent. Keep the OLD paths working (bookmarks, any missed internal link) by
    // redirecting them to the new locations. Temporary (307) — these are internal,
    // noindexed admin routes. Exact rules precede their wildcard so a bare path and
    // its sub-routes each map cleanly.
    return [
      { source: "/admin/catalog", destination: "/admin/site-content", permanent: false },
      { source: "/admin/catalog/:path*", destination: "/admin/:path*", permanent: false },
      { source: "/admin/content/calendar", destination: "/admin/calendar", permanent: false },
      { source: "/admin/outreach/newsletter", destination: "/admin/newsletter", permanent: false },
      { source: "/admin/outreach/newsletter/:path*", destination: "/admin/newsletter/:path*", permanent: false },
      { source: "/admin/outreach/templates", destination: "/admin/tasks/templates", permanent: false },
      { source: "/admin/outreach/templates/:path*", destination: "/admin/tasks/templates/:path*", permanent: false },
      { source: "/admin/subscribers", destination: "/admin/newsletter/subscribers", permanent: false },
      { source: "/admin/subscribers/:path*", destination: "/admin/newsletter/subscribers/:path*", permanent: false },
      { source: "/admin/automations", destination: "/admin/tasks/automations", permanent: false },
      { source: "/admin/automations/:path*", destination: "/admin/tasks/automations/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
