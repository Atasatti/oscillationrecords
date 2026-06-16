import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-guard";
import { getDistinctGenres } from "@/lib/admin-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/artists/genres — distinct genre tags for the table filter.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  try {
    const genres = await getDistinctGenres();
    return NextResponse.json({ genres });
  } catch (error) {
    console.error("Error fetching genres:", error);
    return NextResponse.json({ error: "Failed to fetch genres" }, { status: 500 });
  }
}
