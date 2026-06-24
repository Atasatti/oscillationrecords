import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { isAdminEmail } from "@/lib/auth-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH /api/admin/users/[userId] { role: "admin" | "user" } — change a user's
// role. Used by Settings to grant/revoke admin access. Bootstrap (owner) accounts
// are code-level and can't be changed here; you also can't remove your own access.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { userId } = await params;
    const body = await request.json().catch(() => ({}));
    const role = body.role === "admin" ? "admin" : body.role === "user" ? "user" : null;
    if (!role) {
      return NextResponse.json({ error: "role must be 'admin' or 'user'" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (isAdminEmail(user.email)) {
      return NextResponse.json(
        { error: "This is a built-in owner account — manage it in code, not here." },
        { status: 400 }
      );
    }
    if (
      role === "user" &&
      user.email &&
      guard.token.email &&
      user.email.toLowerCase() === (guard.token.email as string).toLowerCase()
    ) {
      return NextResponse.json({ error: "You can't remove your own admin access." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, role: true },
    });
    return NextResponse.json({ user: updated });
  } catch (e) {
    console.error("admin users PATCH error:", e);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}
