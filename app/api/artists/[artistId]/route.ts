import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { deleteArtistCascade } from "@/lib/artist-delete";

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

// PATCH /api/artists/[artistId] - Partial update: "Show on website" and/or
// "Featured on home" toggles. Enabling featuredOnHome appends the artist to the
// end of the home-carousel order.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  try {
    const guard = await requireAdmin(request);
    if (!guard.ok) return guard.response;

    const { artistId } = await params;
    const body = await request.json();

    const data: { showOnWebsite?: boolean; featuredOnHome?: boolean; homeOrder?: number } = {};
    if (typeof body.showOnWebsite === "boolean") data.showOnWebsite = body.showOnWebsite;
    if (typeof body.featuredOnHome === "boolean") data.featuredOnHome = body.featuredOnHome;

    if (data.showOnWebsite === undefined && data.featuredOnHome === undefined) {
      return NextResponse.json(
        { error: "Provide showOnWebsite and/or featuredOnHome (boolean)" },
        { status: 400 }
      );
    }

    const existing = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!existing) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    // When newly featuring, append to the end of the home order.
    if (data.featuredOnHome === true && !existing.featuredOnHome) {
      const max = await prisma.artist.aggregate({
        where: { featuredOnHome: true },
        _max: { homeOrder: true },
      });
      data.homeOrder = (max._max.homeOrder ?? -1) + 1;
    }

    const artist = await prisma.artist.update({ where: { id: artistId }, data });
    return NextResponse.json(artist);
  } catch (error) {
    console.error("Error updating artist:", error);
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

    const deleted = await deleteArtistCascade(artistId);
    if (!deleted) {
      return NextResponse.json({ error: "Artist not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Artist deleted successfully" });
  } catch (error) {
    console.error("Error deleting artist:", error);
    return NextResponse.json(
      { error: "Failed to delete artist" },
      { status: 500 }
    );
  }
}



