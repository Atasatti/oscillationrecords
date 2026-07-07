import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/artists/search?q= — roster artists with the INTERNAL reference
// fields (real name, contact email) used to prefill a royalty split. Catalog-gated;
// these fields are never exposed on the public /api/artists.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;

  const q = new URL(request.url).searchParams.get("q")?.trim().toLowerCase() || "";
  try {
    const artists = await prisma.artist.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, realName: true, contactEmail: true },
    });
    const items = artists
      .filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          (a.realName ?? "").toLowerCase().includes(q)
      )
      .slice(0, 20)
      .map((a) => ({
        id: a.id,
        name: a.name,
        realName: a.realName ?? null,
        email: a.contactEmail ?? null,
      }));
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("admin artist search error:", e);
    return NextResponse.json({ items: [] });
  }
}
