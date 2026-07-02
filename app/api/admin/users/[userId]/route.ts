import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { isAdminEmail } from "@/lib/auth-session";
import { isStaffRole } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH /api/admin/users/[userId] { role } — change a user's role. `role` is a
// staff role (admin / catalog / promotion / analytics / viewer) or "user" to
// revoke all access. Owner-only. Bootstrap (owner) accounts are code-level and
// can't be changed here; you also can't reduce your own access.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { userId } = await params;
    const body = await request.json().catch(() => ({}));
    // "user" revokes all admin access; any staff role assigns that role.
    const role = body.role === "user" ? "user" : isStaffRole(body.role) ? body.role : null;
    if (!role) {
      return NextResponse.json(
        { error: "role must be 'user' or a valid staff role" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (isAdminEmail(user.email)) {
      return NextResponse.json(
        { error: "This is a built-in owner account — manage it in code, not here." },
        { status: 400 }
      );
    }
    // Don't let an owner lock themselves out by reducing their own access.
    const isSelf =
      !!user.email &&
      !!guard.token.email &&
      user.email.toLowerCase() === (guard.token.email as string).toLowerCase();
    if (isSelf && role !== "admin") {
      return NextResponse.json({ error: "You can't reduce your own access." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, role: true },
    });

    await recordAudit(request, guard.token, {
      action: "role.change",
      resource: "user",
      resourceId: updated.id,
      summary:
        role === "user"
          ? `Revoked access from ${updated.email ?? updated.id}`
          : `Set ${updated.email ?? updated.id} to "${role}"`,
      metadata: { email: updated.email, from: user.role ?? null, to: role },
    });

    return NextResponse.json({ user: updated });
  } catch (e) {
    console.error("admin users PATCH error:", e);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}
