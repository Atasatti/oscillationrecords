import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { isAdminEmail } from "@/lib/auth-session";
import { isStaffRole } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH /api/admin/users/[userId] { role?, nickname? } — update a user's role
// and/or display nickname. `role` is a staff role (admin / catalog / promotion /
// analytics / viewer) or "user" to revoke all access; `nickname` is a display
// label (null/"" clears it). Owner-only. Bootstrap (owner) accounts are code-level
// so their ROLE can't be changed here (a nickname still can); you also can't
// reduce your own access.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { userId } = await params;
    const body = await request.json().catch(() => ({}));

    const wantsRole = body.role !== undefined;
    const wantsNickname = Object.prototype.hasOwnProperty.call(body, "nickname");
    if (!wantsRole && !wantsNickname) {
      return NextResponse.json(
        { error: "Provide a role and/or a nickname to update." },
        { status: 400 }
      );
    }

    // Validate the role, if it's being changed. "user" revokes all admin access.
    let role: string | null = null;
    if (wantsRole) {
      role = body.role === "user" ? "user" : isStaffRole(body.role) ? body.role : null;
      if (!role) {
        return NextResponse.json(
          { error: "role must be 'user' or a valid staff role" },
          { status: 400 }
        );
      }
    }

    // Validate the nickname, if it's being set. null / empty clears it; cap 40 chars.
    let nickname: string | null = null;
    if (wantsNickname) {
      const raw = body.nickname;
      if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
        nickname = null;
      } else if (typeof raw === "string") {
        nickname = raw.trim().slice(0, 40);
      } else {
        return NextResponse.json(
          { error: "nickname must be a string or null" },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, nickname: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Role changes are code-managed for owner accounts and can't lower your own
    // access. A nickname is only a display label, so it's allowed on any account.
    if (wantsRole) {
      if (isAdminEmail(user.email)) {
        return NextResponse.json(
          { error: "This is a built-in owner account — manage its role in code, not here." },
          { status: 400 }
        );
      }
      const isSelf =
        !!user.email &&
        !!guard.token.email &&
        user.email.toLowerCase() === (guard.token.email as string).toLowerCase();
      if (isSelf && role !== "admin") {
        return NextResponse.json({ error: "You can't reduce your own access." }, { status: 400 });
      }
    }

    const data: { role?: string; nickname?: string | null } = {};
    if (wantsRole) data.role = role!;
    if (wantsNickname) data.nickname = nickname;

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, email: true, role: true, nickname: true },
    });

    if (wantsRole) {
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
    }
    if (wantsNickname) {
      await recordAudit(request, guard.token, {
        action: "update",
        resource: "user",
        resourceId: updated.id,
        summary: nickname
          ? `Set nickname for ${updated.email ?? updated.id} to "${nickname}"`
          : `Cleared nickname for ${updated.email ?? updated.id}`,
        metadata: { email: updated.email, nickname },
      });
    }

    return NextResponse.json({ user: updated });
  } catch (e) {
    console.error("admin users PATCH error:", e);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}
