import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicReleaseWhere } from "@/lib/catalog-data";
import { isAdminRequest } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Internal distribution / rights / credit fields plus internal ordering. These
// must never reach anonymous callers — the canonical GET /api/releases/[id] and
// the shared card mappers already mask them, so this endpoint mirrors that.
const PRIVATE_RELEASE_FIELDS = [
  "upcCode",
  "catalogueNumber",
  "pLine",
  "cLine",
  "isrcCode",
  "composer",
  "lyricist",
  "leadVocal",
  "sortOrder",
  "homeOrder",
  "comingSoonOrder",
  "showOnHome",
  "showLatestOnHome",
] as const;

function toPublicRelease(release: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...release };
  for (const f of PRIVATE_RELEASE_FIELDS) delete out[f];
  return out;
}

// GET releases that list this artist as primary or feature
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ artistId: string }> }
) {
  try {
    const { artistId } = await params;
    const isAdmin = await isAdminRequest(request);

    // Non-admins must not learn about a not-yet-public (draft / hidden) artist,
    // even via the releases that credit them. Mirror getArtistDetail's 404 gate.
    if (!isAdmin) {
      const artist = await prisma.artist.findUnique({
        where: { id: artistId },
        select: { draft: true, showOnWebsite: true },
      });
      if (!artist || artist.draft || !artist.showOnWebsite) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

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

    // Admins get the full rows (the admin artist view relies on them); anonymous
    // callers get a public-safe shape with internal rights/ordering fields stripped.
    const payload = isAdmin
      ? releases
      : releases.map((r) => toPublicRelease(r as unknown as Record<string, unknown>));

    return NextResponse.json(payload, {
      headers: {
        // The admin (full) response carries private fields and must never be
        // cached by a shared CDN; the public (masked) response is safe to cache.
        "Cache-Control": isAdmin
          ? "private, no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
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
