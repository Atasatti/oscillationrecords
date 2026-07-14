import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";
import { normalizeViewName, normalizeViewConfig } from "@/lib/saved-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: unknown): v is string => typeof v === "string" && /^[a-f\d]{24}$/i.test(v);

// PATCH /api/outreach/views/[id] { name?, config? } — rename a view and/or update
// its saved config to the caller's current controls. Owner-scoped.
export async function PATCH(
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
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; config?: unknown };

    const data: { name?: string; config?: Prisma.InputJsonValue } = {};
    if (body.name !== undefined) {
      const name = normalizeViewName(body.name);
      if (!name) return NextResponse.json({ error: "Please name the view" }, { status: 400 });
      data.name = name;
    }
    if (body.config !== undefined) {
      data.config = normalizeViewConfig(body.config) as unknown as Prisma.InputJsonValue;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    // Scope by userId so a user can only edit their own views.
    const res = await prisma.savedView.updateMany({ where: { id, userId }, data });
    if (res.count === 0) return NextResponse.json({ error: "View not found" }, { status: 404 });

    const updated = await prisma.savedView.findFirst({
      where: { id, userId },
      select: { id: true, name: true, config: true },
    });
    return NextResponse.json({
      view: updated
        ? { id: updated.id, name: updated.name, config: normalizeViewConfig(updated.config) }
        : null,
    });
  } catch (e) {
    console.error("saved views PATCH error:", e);
    return NextResponse.json({ error: "Failed to update view" }, { status: 500 });
  }
}

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
