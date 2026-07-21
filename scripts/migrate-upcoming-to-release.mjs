// One-off migration: copy every UpcomingRelease into a Release with
// status=SCHEDULED, so "upcoming" becomes a real release carrying full metadata.
//
// Dry-run (default, no writes):
//   node --env-file=.env --use-system-ca scripts/migrate-upcoming-to-release.mjs
// Apply for real:
//   node --env-file=.env --use-system-ca scripts/migrate-upcoming-to-release.mjs --apply
//
// Idempotent-ish: skips when a SCHEDULED release with the same name + date exists.
//
// STATUS: COMPLETED. The UpcomingRelease model has since been removed from
// prisma/schema.prisma (see the note there), so this script can no longer run —
// it exits early below. Kept as the historical record that schema.prisma and
// DEPLOY.md point at.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const KIND = { single: "SINGLE", ep: "EP", album: "ALBUM" };

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}\n`);

  // Guard FIRST, before any write: the source model is gone, so this migration
  // has already been applied. Without this the backfill below would still fire
  // against live data and only then crash on the missing model.
  if (!prisma.upcomingRelease) {
    console.log(
      "UpcomingRelease no longer exists in the Prisma schema — this one-off migration\n" +
        "has already been completed (unified into Release with status=SCHEDULED).\n" +
        "Nothing to do; exiting without touching the database."
    );
    return;
  }

  // Backfill: existing Release docs created before the `status` field have it
  // missing in MongoDB (Prisma does NOT apply @default on read for Mongo — it
  // errors on the null enum, and they'd vanish from publicReleaseWhere). Set
  // them to RELEASED first. Idempotent.
  const missingStatus = { $or: [{ status: { $exists: false } }, { status: null }] };
  if (APPLY) {
    const backfill = await prisma.$runCommandRaw({
      update: "Release",
      updates: [{ q: missingStatus, u: { $set: { status: "RELEASED" } }, multi: true }],
    });
    console.log(`Backfilled status=RELEASED on ${backfill.nModified ?? 0} existing release(s).`);
  } else {
    const counted = await prisma.$runCommandRaw({ count: "Release", query: missingStatus });
    console.log(`Would backfill status=RELEASED on ${counted.n ?? 0} existing release(s).`);
  }

  const upcoming = await prisma.upcomingRelease.findMany();
  console.log(`Found ${upcoming.length} upcoming release(s).`);

  let created = 0;
  let skipped = 0;
  for (const u of upcoming) {
    const kind = KIND[String(u.type).toLowerCase()] ?? "SINGLE";

    const existing = await prisma.release.findFirst({
      where: { name: u.name, status: "SCHEDULED", releaseDate: u.releaseDate },
      select: { id: true },
    });
    if (existing) {
      console.log(`  skip (already migrated): ${u.name}`);
      skipped++;
      continue;
    }

    if (!u.primaryArtistIds?.length) {
      console.warn(
        `  WARNING: "${u.name}" has no linked primary artists` +
          (u.primaryArtist ? ` (legacy text: "${u.primaryArtist}")` : "") +
          " — creating with empty primary artists; link them in the admin."
      );
    }

    if (!APPLY) {
      console.log(`  would migrate: ${u.name}`);
      created++;
      continue;
    }

    await prisma.release.create({
      data: {
        kind,
        status: "SCHEDULED",
        name: u.name,
        coverImage: u.image,
        releaseDate: u.releaseDate,
        preSaveUrl: u.preSmartLinkUrl ?? null,
        primaryArtistIds: u.primaryArtistIds ?? [],
        featureArtistIds: u.featureArtistIds ?? [],
        featureArtistNames: u.featureArtistNames ?? [],
        sortOrder: u.sortOrder ?? 0,
      },
    });
    created++;
    console.log(`  migrated: ${u.name}`);
  }

  console.log(
    `\nDone. ${
      APPLY
        ? `Created ${created}, skipped ${skipped}.`
        : `${created} would be created, ${skipped} already migrated (dry-run).`
    }`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
