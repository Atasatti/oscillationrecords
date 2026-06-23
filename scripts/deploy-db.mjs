// One-shot DB deploy: sync the Prisma schema to the target database, then run
// the upcoming -> Release migration (which also backfills `status` on legacy
// docs). Wraps the two steps from DEPLOY.md into one guarded command.
//
//   Preview (safe, default):   npm run db:deploy
//   Execute:                   npm run db:deploy -- --confirm
//
// SAFETY: this mutates whatever DATABASE_URL points at. In this repo, .env
// points at PRODUCTION, so an unguarded run would write to prod. Nothing is
// changed unless you pass --confirm (or set CONFIRM_DEPLOY=1); without it the
// script just prints the target and the steps it WOULD run.
//
// Steps it runs:
//   1. prisma db push  — create new collections/indexes + fields (PageView,
//      LinkClick, ErrorLog, PressItem, User.role, Release.status/comingSoonOrder).
//      Non-destructive: only adds. (No --accept-data-loss, so a destructive
//      diff would abort rather than silently drop data.)
//   2. scripts/migrate-upcoming-to-release.mjs — REQUIRED: backfills
//      status=RELEASED on legacy releases (Mongo stores no value for the new
//      enum, and without it they vanish from the public site) and copies any
//      UpcomingRelease docs into Release(status=SCHEDULED).
//
// comingSoonOrder (Int?) and User.role (String? @default) are optional, so
// neither needs a backfill; admins are covered by the allowlist in
// lib/auth-session.ts regardless of the role field.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const confirmed =
  process.argv.includes("--confirm") || process.env.CONFIRM_DEPLOY === "1";

// Resolve DATABASE_URL for a masked target display (env first, then .env).
function resolveDbUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
    const m = env.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    /* no .env on disk (e.g. CI) — rely on the platform's env */
  }
  return null;
}

// Show only host/db — never the credentials.
function maskTarget(url) {
  if (!url) return "(DATABASE_URL not found)";
  try {
    const noProto = url.replace(/^[a-z+]+:\/\//i, "");
    const at = noProto.indexOf("@");
    const hostPart = at >= 0 ? noProto.slice(at + 1) : noProto;
    return hostPart.split("?")[0];
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

const dbUrl = resolveDbUrl();

console.log("--------------------------------------------------");
console.log(" DB deploy");
console.log("   target :", maskTarget(dbUrl));
console.log("   step 1 : prisma db push");
console.log("   step 2 : scripts/migrate-upcoming-to-release.mjs");
if (dbUrl && /tlsAllowInvalidCertificates=true/i.test(dbUrl)) {
  console.log("   WARNING: DATABASE_URL has tlsAllowInvalidCertificates=true —");
  console.log("            never run this against production with that set.");
}
console.log("--------------------------------------------------");

if (!confirmed) {
  console.log("Preview only — nothing was changed.");
  console.log("Execute with:  npm run db:deploy -- --confirm");
  process.exit(0);
}

function run(label, cmd) {
  console.log(`\n> ${label}\n  ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`\nx ${label} failed (exit ${r.status ?? "?"}). Aborting.`);
    process.exit(r.status || 1);
  }
}

run("Sync schema (prisma db push)", "npx prisma db push");
run(
  "Migrate upcoming -> Release + backfill status",
  "node --use-system-ca scripts/migrate-upcoming-to-release.mjs"
);

console.log("\nDB deploy complete.");
