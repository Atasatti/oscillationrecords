import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { isStaffRole, type StaffRole } from "@/lib/permissions";
import { getStaffDirectory } from "@/lib/staff-directory";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/users — current staff: the bootstrap owner allowlist + any user
// with a staff role (owner or scoped). Bootstrap entries are "locked" (managed in
// code, always owner). Owner-only (user + role management). The staff-readable
// picker list lives at /api/admin/staff.
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const admins = await getStaffDirectory();
    return NextResponse.json(
      { admins },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("admin users GET error:", e);
    return NextResponse.json({ error: "Failed to load staff" }, { status: 500 });
  }
}

// POST /api/admin/users { email, role? } — grant a staff role. Promotes an
// existing user or pre-creates one keyed by email (sign-in matches by email, so
// they get the role the first time they sign in with that Google account).
export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    // Default to owner ("admin") to preserve the historical "Add admin" behavior;
    // the UI passes an explicit scoped role when one is chosen.
    const role: StaffRole = isStaffRole(body.role) ? body.role : "admin";

    const user = await prisma.user.upsert({
      where: { email },
      create: { email, role },
      update: { role },
      select: { id: true, name: true, email: true, image: true, role: true },
    });

    await recordAudit(request, guard.token, {
      action: "role.change",
      resource: "user",
      resourceId: user.id,
      summary: `Granted "${role}" to ${email}`,
      metadata: { email, role },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    console.error("admin users POST error:", e);
    return NextResponse.json({ error: "Failed to add staff member" }, { status: 500 });
  }
}
