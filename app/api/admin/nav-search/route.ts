import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/nav-search — lightweight id+name lists for the command palette
// (jump straight to a release or artist editor). Catalog-gated; the palette
// falls back to nav-only if this 403s for a non-catalog role.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const [releases, artists] = await Promise.all([
      prisma.release.findMany({ select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.artist.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 1000 }),
    ]);
    return NextResponse.json({ releases, artists }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("nav-search error:", e);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}
