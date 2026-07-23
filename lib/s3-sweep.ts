import { prisma } from "@/lib/prisma";
import { deleteS3Object, keyFromOwnBucketUrl } from "@/lib/s3";

/**
 * Best-effort S3 cleanup when catalog records stop referencing a file — the
 * missing half of the upload lifecycle. Deleting a release, removing a track,
 * or replacing a track's audio used to leave the old object in the bucket
 * forever: the orphan sweep of 2026-07-23 found 132 such files (4.66 GB), most
 * of them under the PUBLIC tracks/audio/ prefix and so anonymously
 * downloadable long after their records were gone. Call this with the
 * now-unreferenced URLs after the DB write commits.
 *
 * Safety properties:
 *  - Confined to the catalog media prefixes below — a crafted URL can never aim
 *    the sweep at another scope's objects (contracts, competition entries, …).
 *  - Re-checks the database for any REMAINING reference to the same URL before
 *    deleting, so a file shared between two tracks/releases (duplicated test
 *    releases do this) survives until the last reference goes.
 *  - Best-effort by design: deleteS3Object never throws, and neither does this —
 *    a failed sweep must never fail the mutation that already committed.
 *    Anything missed is picked up by scripts/cleanup-orphaned-audio.mjs.
 */
const SWEEPABLE_PREFIXES = [
  "tracks/audio/",
  "tracks/stems/",
  "tracks/images/",
  "releases/images/",
  // Legacy upload paths still present on older rows.
  "singles/audio/",
  "singles/images/",
  "eps/audio/",
  "eps/images/",
  "albums/audio/",
  "albums/images/",
  "song-images/",
] as const;

function sweepableKey(url: string): string | null {
  const key = keyFromOwnBucketUrl(url);
  if (!key) return null;
  return SWEEPABLE_PREFIXES.some((p) => key.startsWith(p)) ? key : null;
}

/** True when some OTHER row still references this exact URL. */
async function stillReferenced(url: string): Promise<boolean> {
  const [track, release, asset] = await Promise.all([
    prisma.track.findFirst({
      where: { OR: [{ audioFile: url }, { stemsFile: url }, { image: url }] },
      select: { id: true },
    }),
    prisma.release.findFirst({ where: { coverImage: url }, select: { id: true } }),
    prisma.asset.findFirst({ where: { fileUrl: url }, select: { id: true } }),
  ]);
  return Boolean(track || release || asset);
}

/** Delete the S3 objects behind `urls` unless something still references them.
 *  Call AFTER the DB write that dropped the references has committed. */
export async function sweepCatalogObjects(
  urls: Array<string | null | undefined>
): Promise<void> {
  // De-dupe: a release delete hands us the same cover once per code path.
  const candidates = [...new Set(urls.filter((u): u is string => Boolean(u)))];
  for (const url of candidates) {
    try {
      const key = sweepableKey(url);
      if (!key) continue;
      if (await stillReferenced(url)) continue;
      await deleteS3Object(key);
    } catch (e) {
      // Never let cleanup break the request; the orphan script is the backstop.
      console.error("sweepCatalogObjects: failed for", url, e);
    }
  }
}
