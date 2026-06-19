import { prisma } from "@/lib/prisma";

/**
 * Delete an artist and clean up everything that referenced them: tracks/releases
 * where the artist was a sole primary are deleted; otherwise the artist id is
 * removed from the primary/feature id arrays. Shared by the single-delete route
 * and the bulk-delete route so the cascade logic stays in one place.
 *
 * Returns false if the artist doesn't exist (so callers can 404), true on delete.
 */
export async function deleteArtistCascade(artistId: string): Promise<boolean> {
  const artist = await prisma.artist.findUnique({ where: { id: artistId } });
  if (!artist) return false;

  const tracks = await prisma.track.findMany({
    where: {
      OR: [
        { primaryArtistIds: { has: artistId } },
        { featureArtistIds: { has: artistId } },
      ],
    },
  });

  for (const track of tracks) {
    const updatedPrimary = track.primaryArtistIds.filter((id) => id !== artistId);
    const updatedFeature = track.featureArtistIds.filter((id) => id !== artistId);
    if (updatedPrimary.length === 0) {
      const count = await prisma.track.count({
        where: { releaseId: track.releaseId },
      });
      if (count <= 1) {
        await prisma.release.delete({ where: { id: track.releaseId } });
      } else {
        await prisma.track.delete({ where: { id: track.id } });
      }
    } else {
      await prisma.track.update({
        where: { id: track.id },
        data: {
          primaryArtistIds: updatedPrimary,
          featureArtistIds: updatedFeature,
        },
      });
    }
  }

  const releases = await prisma.release.findMany({
    where: {
      OR: [
        { primaryArtistIds: { has: artistId } },
        { featureArtistIds: { has: artistId } },
      ],
    },
  });

  for (const release of releases) {
    const stillThere = await prisma.release.findUnique({
      where: { id: release.id },
    });
    if (!stillThere) continue;

    const updatedPrimary = release.primaryArtistIds.filter((id) => id !== artistId);
    const updatedFeature = release.featureArtistIds.filter((id) => id !== artistId);

    if (updatedPrimary.length === 0) {
      await prisma.release.delete({ where: { id: release.id } });
    } else {
      await prisma.release.update({
        where: { id: release.id },
        data: {
          primaryArtistIds: updatedPrimary,
          featureArtistIds: updatedFeature,
        },
      });
    }
  }

  await prisma.artist.delete({ where: { id: artistId } });
  return true;
}
