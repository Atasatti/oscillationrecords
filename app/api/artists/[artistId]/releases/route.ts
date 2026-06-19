import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicReleaseWhere } from "@/lib/catalog-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET releases that list this artist as primary or feature
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  try {
    const { artistId } = await params;

    const releases = await prisma.release.findMany({
      where: {
        AND: [
          {
            OR: [
              { primaryArtistIds: { has: artistId } },
              { featureArtistIds: { has: artistId } },
            ],
          },
          publicReleaseWhere(),
        ],
      },
      orderBy: { createdAt: "desc" },
      include: {
        // The artist page only shows a track count — fetch ids, not full tracks.
        tracks: { select: { id: true } },
      },
    });

    return NextResponse.json(releases, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Error fetching artist releases:", error);
    return NextResponse.json(
      { error: "Failed to fetch releases" },
      { status: 500 }
    );
  }
}
