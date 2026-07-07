import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{24}$/i.test(v);

// DELETE /api/outreach/views/[id] — remove one of the signed-in user's own views.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  const userId = await resolveUserId(guard.token);
  if (!userId) return NextResponse.json({ error: "No account" }, { status: 400 });
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    // Scope by userId so a user can only delete their own views.
    const res = await prisma.savedView.deleteMany({ where: { id, userId } });
    if (res.count === 0) return NextResponse.json({ error: "View not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("saved views DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete view" }, { status: 500 });
  }
}
