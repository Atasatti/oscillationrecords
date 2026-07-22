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
console.log("   step 0 : index-drift check (read-only)");
console.log("   step 1 : prisma db push");
console.log("   step 2 : scripts/migrate-upcoming-to-release.mjs");
console.log("   step 3 : index-drift re-check (must come back clean)");
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

function run(label, cmd, { allowFailure = false } = {}) {
  console.log(`\n> ${label}\n  ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", shell: true });
  if (r.status !== 0 && !allowFailure) {
    console.error(`\nx ${label} failed (exit ${r.status ?? "?"}). Aborting.`);
    process.exit(r.status || 1);
  }
  return r.status ?? 1;
}

const DRIFT_CMD = "node --use-system-ca scripts/check-index-drift.mjs";

// Step 0 — show what's about to change. Exit 1 just means "drift exists", which
// is the normal reason to be running a deploy, so it must not abort.
run("Index drift BEFORE", DRIFT_CMD, { allowFailure: true });

// `prisma db push` creates the declared indexes. A UNIQUE index cannot be built
// over duplicate values, so if ErrorLog.fingerprint still has duplicates this
// step fails — deliberately, and before anything else runs. Resolve with
// scripts/dedupe-error-log.mjs, then re-run. See docs/DB-INDEXES.md.
run("Sync schema (prisma db push)", "npx prisma db push");
run(
  "Migrate upcoming -> Release + backfill status",
  "node --use-system-ca scripts/migrate-upcoming-to-release.mjs"
);

// Step 3 — the deploy only counts as done if the database now matches the
// schema. A silent partial index build is exactly the drift this is here to stop.
const driftAfter = run("Index drift AFTER", DRIFT_CMD, { allowFailure: true });
if (driftAfter !== 0) {
  console.error(
    "\nx Indexes still drift from the schema after the push. Investigate before\n" +
      "  treating this deploy as complete (see docs/DB-INDEXES.md)."
  );
  process.exit(1);
}

console.log("\nDB deploy complete — schema and indexes match.");
