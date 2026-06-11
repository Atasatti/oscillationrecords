import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

// Force dynamic rendering - prevent static generation
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/artists/[artistId] - Get a single artist by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  try {
    const { artistId } = await params;

    const artist = await prisma.artist.findUnique({
      where: {
        id: artistId,
      },
    });

    if (!artist) {
      return NextResponse.json(
        { error: "Artist not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(artist);
  } catch (error) {
    console.error("Error fetching artist:", error);
    return NextResponse.json(
      { error: "Failed to fetch artist" },
      { status: 500 }
    );
  }
}

// PUT /api/artists/[artistId] - Update artist
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { artistId } = await params;
    const body = await request.json();
    const {
      name,
      biography,
      profilePicture,
      composer,
      lyricist,
      leadVocal,
      xLink,
      tiktokLink,
      spotifyLink,
      instagramLink,
      youtubeLink,
      facebookLink,
      appleMusicLink,
      tidalLink,
      amazonMusicLink,
      soundcloudLink,
    } = body;

    if (!name || !biography) {
      return NextResponse.json(
        { error: "Name and biography are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.artist.findUnique({
      where: { id: artistId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Artist not found" },
        { status: 404 }
      );
    }

    const artist = await prisma.artist.update({
      where: { id: artistId },
      data: {
        name,
        biography,
        profilePicture: profilePicture || null,
        composer: composer || null,
        lyricist: lyricist || null,
        leadVocal: leadVocal || null,
        xLink: xLink || null,
        tiktokLink: tiktokLink || null,
        spotifyLink: spotifyLink || null,
        instagramLink: instagramLink || null,
        youtubeLink: youtubeLink || null,
        facebookLink: facebookLink || null,
        appleMusicLink: appleMusicLink || null,
        tidalLink: tidalLink || null,
        amazonMusicLink: amazonMusicLink || null,
        soundcloudLink: soundcloudLink || null,
      },
    });

    return NextResponse.json(artist);
  } catch (error) {
    console.error("Error updating artist:", error);
    return NextResponse.json(
      { error: "Failed to update artist" },
      { status: 500 }
    );
  }
}

// PATCH /api/artists/[artistId] - Partial update (currently the "Show on website" toggle)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { artistId } = await params;
    const body = await request.json();
    const { showOnWebsite } = body;

    if (typeof showOnWebsite !== "boolean") {
      return NextResponse.json(
        { error: "showOnWebsite must be a boolean" },
        { status: 400 }
      );
    }

    const existing = await prisma.artist.findUnique({
      where: { id: artistId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Artist not found" },
        { status: 404 }
      );
    }

    const artist = await prisma.artist.update({
      where: { id: artistId },
      data: { showOnWebsite },
    });

    return NextResponse.json(artist);
  } catch (error) {
    console.error("Error updating artist visibility:", error);
    return NextResponse.json(
      { error: "Failed to update artist" },
      { status: 500 }
    );
  }
}

// DELETE /api/artists/[artistId] - Delete an artist and all related data
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { artistId } = await params;

    // Check if artist exists
    const artist = await prisma.artist.findUnique({
      where: { id: artistId },
    });

    if (!artist) {
      return NextResponse.json(
        { error: "Artist not found" },
        { status: 404 }
      );
    }

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

    // Now delete the artist
    await prisma.artist.delete({
      where: { id: artistId },
    });

    return NextResponse.json({ message: "Artist deleted successfully" });
  } catch (error) {
    console.error("Error deleting artist:", error);
    return NextResponse.json(
      { error: "Failed to delete artist" },
      { status: 500 }
    );
  }
}



