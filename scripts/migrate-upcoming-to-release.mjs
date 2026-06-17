// One-off migration: copy every UpcomingRelease into a Release with
// status=SCHEDULED, so "upcoming" becomes a real release carrying full metadata.
// Run once:  node --use-system-ca scripts/migrate-upcoming-to-release.mjs
// Idempotent-ish: skips when a SCHEDULED release with the same name + date exists.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const KIND = { single: "SINGLE", ep: "EP", album: "ALBUM" };

async function main() {
  // Backfill: existing Release docs created before the `status` field have it
  // missing in MongoDB (Prisma does NOT apply @default on read for Mongo — it
  // errors on the null enum, and they'd vanish from publicReleaseWhere). Set
  // them to RELEASED first. Idempotent.
  const backfill = await prisma.$runCommandRaw({
    update: "Release",
    updates: [
      {
        q: { $or: [{ status: { $exists: false } }, { status: null }] },
        u: { $set: { status: "RELEASED" } },
        multi: true,
      },
    ],
  });
  console.log(`Backfilled status=RELEASED on ${backfill.nModified ?? 0} existing release(s).`);

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

  console.log(`Done. Created ${created}, skipped ${skipped}.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
