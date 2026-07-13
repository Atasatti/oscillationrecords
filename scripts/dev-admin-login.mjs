// scripts/dev-admin-login.mjs
//
// DEV-ONLY tooling. Mints a valid NextAuth session cookie for a bootstrap-admin
// email using the local NEXTAUTH_SECRET, so an automated browser (or curl) can
// reach the OAuth-gated /admin area locally without going through Google.
//
// It changes NOTHING in the app and ships no auth bypass — it only uses the same
// next-auth/jwt `encode()` the app's `getToken()` decodes with, and the secret
// that is already in your local .env. The security audits already note that
// anyone holding NEXTAUTH_SECRET can forge an admin JWT; this does exactly that,
// on purpose, on your own machine.
//
// It REFUSES to run when NODE_ENV=production.
//
// ┌ WARNING ───────────────────────────────────────────────────────────────────┐
// │ 1. The printed cookie is a live 30-day admin session. Treat it like a        │
// │    password: don't paste it anywhere shared, don't commit it.                │
// │ 2. Your local .env points at the LIVE production DB + S3. Being "logged in"  │
// │    locally means any admin WRITE hits production. Reproduce read-only, or    │
// │    revert whatever you toggle.                                               │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// Usage:
//   node --use-system-ca scripts/dev-admin-login.mjs [--email you@x.com]
//        [--name "Dev Admin"] [--sub <id>] [--url http://localhost:3000]
//        [--days 30] [--json]
//
//   --email  Bootstrap-admin email to impersonate (default: first ADMIN_EMAILS).
//   --json   Also print a Playwright-style cookies array (for storageState).
//
// The default output prints the cookie name/value plus a one-liner you can run
// in the browser console (or via a devtools `evaluate_script`) to set it, then
// navigate to /admin.

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const { encode, decode } = require("next-auth/jwt");

// Bootstrap admin allowlist — keep in sync with lib/auth-session.ts ADMIN_EMAILS.
const ADMIN_EMAILS = ["oscillationrecordz@gmail.com", "tinyminer2015@gmail.com"];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true; // flag
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("Refusing to run with NODE_ENV=production. This is a dev-only tool.");
    process.exit(1);
  }

  // Load .env / .env.local exactly like Next does, so NEXTAUTH_SECRET is present.
  loadEnvConfig(process.cwd());

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error("NEXTAUTH_SECRET is not set (checked .env / .env.local). Cannot mint a session.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const email = String(args.email || ADMIN_EMAILS[0]).toLowerCase();
  const name = String(args.name || "Dev Admin");
  const sub = String(args.sub || email); // token.sub → session.user.id; email works fine for admin
  const baseUrl = String(args.url || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
  const days = Number(args.days || 30);

  if (!ADMIN_EMAILS.includes(email)) {
    console.error(
      `\n"${email}" is not in the bootstrap ADMIN_EMAILS allowlist, so it won't pass the ` +
        `admin guards.\nUse one of: ${ADMIN_EMAILS.join(", ")}  (or add it to lib/auth-session.ts).`
    );
    process.exit(1);
  }

  // Cookie name mirrors lib/auth-session.ts sessionTokenCookieName(): the __Secure-
  // prefix is only valid over https, so http://localhost uses the plain name.
  const useSecure =
    (process.env.NEXTAUTH_URL?.startsWith("https://") ?? false) || !!process.env.VERCEL;
  const cookieName = useSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token";

  // Claims the app reads: email drives the bootstrap-admin allowlist (isAdminEmail),
  // role="admin" satisfies the token-level owner checks, sub feeds session.user.id.
  // encode() adds iat/exp/jti automatically.
  const token = { name, email, picture: null, sub, role: "admin" };
  const maxAge = days * 24 * 60 * 60;
  const value = await encode({ token, secret, maxAge });

  // Self-test: decode with the same secret to prove the app's getToken() will read it.
  const decoded = await decode({ token: value, secret });
  if (!decoded || decoded.email !== email) {
    console.error("Round-trip decode failed — the minted cookie would not be accepted. Aborting.");
    process.exit(1);
  }

  const expires = new Date(decoded.exp * 1000).toISOString();

  console.log("\n✅ Minted a dev admin session (verified it decodes back).\n");
  console.log(`  email:   ${email}`);
  console.log(`  role:    admin (owner, via bootstrap allowlist)`);
  console.log(`  expires: ${expires}`);
  console.log(`  cookie:  ${cookieName}\n`);
  console.log("Cookie value:\n");
  console.log(value);
  console.log("\n— To log in via the browser console (or a devtools evaluate_script), run this on");
  console.log(`  a ${baseUrl} tab, then navigate to ${baseUrl}/admin:\n`);
  console.log(
    `  document.cookie = ${JSON.stringify(`${cookieName}=${value}; path=/; max-age=${maxAge}; samesite=lax`)};`
  );

  if (args.json) {
    const url = new URL(baseUrl);
    const cookies = [
      {
        name: cookieName,
        value,
        domain: url.hostname,
        path: "/",
        expires: Math.floor(decoded.exp),
        httpOnly: true,
        secure: useSecure,
        sameSite: "Lax",
      },
    ];
    console.log("\nPlaywright cookies array (for storageState):\n");
    console.log(JSON.stringify({ cookies, origins: [] }, null, 2));
  }

  console.log("\n⚠ This grants full admin for 30 days and your local env writes to PROD. Don't share/commit it.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
