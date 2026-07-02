import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth-guard";
import { getStaffDirectory } from "@/lib/staff-directory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/staff — the team directory for assignee pickers etc. Readable by
// ANY staff role (not just owners), so scoped staff can assign tasks to teammates.
// Management (grant/revoke roles) stays owner-only at /api/admin/users.
export async function GET(request: NextRequest) {
  const guard = await requireStaff(request);
  if (!guard.ok) return guard.response;
  try {
    const staff = await getStaffDirectory();
    return NextResponse.json(
      { staff },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("admin staff GET error:", e);
    return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
  }
}
