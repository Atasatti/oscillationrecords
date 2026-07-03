import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";
import {
  normalizeViewConfig,
  normalizeViewName,
  SAVED_VIEWS_PER_USER_MAX,
} from "@/lib/saved-view";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/views — the signed-in user's saved Tasks views, oldest first.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  const userId = await resolveUserId(guard.token);
  if (!userId) return NextResponse.json({ views: [] });
  try {
    const rows = await prisma.savedView.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, config: true },
    });
    const views = rows.map((r) => ({ id: r.id, name: r.name, config: normalizeViewConfig(r.config) }));
    return NextResponse.json({ views });
  } catch (e) {
    console.error("saved views GET error:", e);
    return NextResponse.json({ error: "Failed to load views" }, { status: 500 });
  }
}

// POST /api/outreach/views { name, config } — save the current view under a name.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  const userId = await resolveUserId(guard.token);
  if (!userId) return NextResponse.json({ error: "No account" }, { status: 400 });
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; config?: unknown };
    const name = normalizeViewName(body.name);
    if (!name) return NextResponse.json({ error: "Please name the view" }, { status: 400 });

    const count = await prisma.savedView.count({ where: { userId } });
    if (count >= SAVED_VIEWS_PER_USER_MAX) {
      return NextResponse.json(
        { error: `You can save up to ${SAVED_VIEWS_PER_USER_MAX} views. Delete one first.` },
        { status: 400 }
      );
    }

    const config = normalizeViewConfig(body.config);
    const created = await prisma.savedView.create({
      data: { userId, name, config: config as unknown as Prisma.InputJsonValue },
      select: { id: true, name: true, config: true },
    });
    return NextResponse.json(
      { view: { id: created.id, name: created.name, config: normalizeViewConfig(created.config) } },
      { status: 201 }
    );
  } catch (e) {
    console.error("saved views POST error:", e);
    return NextResponse.json({ error: "Failed to save view" }, { status: 500 });
  }
}
