// Enforce the AuditLog retention window (docs/DATA-RETENTION.md).
//
// AuditLog is the one collection deliberately kept identifiable through an
// account deletion — admin actions stay attributable for security and
// accountability. That exception is only defensible if it's bounded, so entries
// are purged AUDIT_RETENTION_MONTHS after the action they record.
//
// Dry run (default — counts, writes nothing):
//   node --env-file=.env --use-system-ca scripts/purge-audit-logs.mjs
// Apply:
//   node --env-file=.env --use-system-ca scripts/purge-audit-logs.mjs --apply
//
// NOTE: .env points at LIVE production MongoDB. --apply deletes real rows.

import { PrismaClient } from "@prisma/client";

// Kept in sync with AUDIT_RETENTION_MONTHS in lib/personal-data.ts (this is a
// plain .mjs script, so it can't import the TS module).
const RETENTION_MONTHS = 24;

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

function cutoff() {
  const d = new Date();
  d.setMonth(d.getMonth() - RETENTION_MONTHS);
  return d;
}

async function main() {
  const before = cutoff();
  console.log(`Mode: ${APPLY ? "APPLY (deleting)" : "DRY-RUN (no writes)"}`);
  console.log(`Retention: ${RETENTION_MONTHS} months — purging entries before ${before.toISOString()}\n`);

  const [total, expiring] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { at: { lt: before } } }),
  ]);
  console.log(`audit entries: ${total} total, ${expiring} past the retention window`);

  if (expiring === 0) {
    console.log("Nothing to purge.");
    return;
  }

  // Show the range being removed so an accidental cutoff is obvious before it runs.
  const oldest = await prisma.auditLog.findFirst({
    where: { at: { lt: before } },
    orderBy: { at: "asc" },
    select: { at: true, action: true, resource: true },
  });
  if (oldest) {
    console.log(`oldest expiring: ${oldest.at.toISOString()} (${oldest.action} ${oldest.resource})`);
  }

  if (!APPLY) {
    console.log("\nDry run — nothing deleted. Re-run with --apply to purge.");
    return;
  }

  const { count } = await prisma.auditLog.deleteMany({ where: { at: { lt: before } } });
  console.log(`\nPurged ${count} audit entries.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
