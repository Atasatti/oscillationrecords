import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { deleteArtistCascade } from "@/lib/artist-delete";
import { revalidateAdminCatalog } from "@/lib/admin-cache-tags";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/admin/artists/bulk — { ids: string[], action: "show" | "hide" | "delete" }
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermission(request, "catalog:write");
    if (!guard.ok) return guard.response;

    const body = await request.json();
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids.filter((id: unknown) => typeof id === "string")
      : [];
    const action = body.action;

    if (ids.length === 0) {
      return NextResponse.json({ error: "No ids provided" }, { status: 400 });
    }

    if (action === "show" || action === "hide") {
      await prisma.artist.updateMany({
        where: { id: { in: ids } },
        // Hiding also drops Featured: a hidden artist must never linger as
        // "hidden but featured" (mirrors the single-artist PATCH, and otherwise it
        // would still leak into the public featured carousel). Showing does NOT
        // restore Featured — it must be re-enabled explicitly.
        data:
          action === "hide"
            ? { showOnWebsite: false, featuredOnHome: false }
            : { showOnWebsite: true },
      });
      revalidateAdminCatalog();
      return NextResponse.json({ updated: ids.length });
    }

    if (action === "delete") {
      let deleted = 0;
      for (const id of ids) {
        if (await deleteArtistCascade(id)) deleted++;
      }
      revalidateAdminCatalog();
      return NextResponse.json({ deleted });
    }

    return NextResponse.json(
      { error: "action must be show, hide, or delete" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error in artists bulk action:", error);
    return NextResponse.json(
      { error: "Bulk action failed" },
      { status: 500 }
    );
  }
}
