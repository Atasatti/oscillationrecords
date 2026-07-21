import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth-guard";
import { getCatalogRefs } from "@/lib/catalog-refs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/catalog-refs — {id,name} lists of releases + artists for admin
// pickers (e.g. linking a task to a release/artist). Readable by ANY staff role
// so Outreach staff can link without catalog permissions.
export async function GET(request: NextRequest) {
  const guard = await requireStaff(request);
  if (!guard.ok) return guard.response;
  try {
    const refs = await getCatalogRefs();
    return NextResponse.json(refs, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("catalog-refs GET error:", e);
    return NextResponse.json({ error: "Failed to load catalog refs" }, { status: 500 });
  }
}
