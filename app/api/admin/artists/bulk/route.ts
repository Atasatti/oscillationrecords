import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { deleteArtistCascade } from "@/lib/artist-delete";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/admin/artists/bulk — { ids: string[], action: "show" | "hide" | "delete" }
export async function POST(request: NextRequest) {
  try {
    const guard = await requireAdmin(request);
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
        data: { showOnWebsite: action === "show" },
      });
      return NextResponse.json({ updated: ids.length });
    }

    if (action === "delete") {
      let deleted = 0;
      for (const id of ids) {
        if (await deleteArtistCascade(id)) deleted++;
      }
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
