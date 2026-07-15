import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { liveCutoff } from "@/lib/error-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/error-log?page=&pageSize=&source=&level=&resolved=
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "analytics:read");
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

  // Recency-driven split (see lib/error-log.ts): an error is "Live" only while
  // it's still firing. Live = not manually resolved AND seen within the window;
  // Log = manually resolved OR gone quiet past the window. This is what makes the
  // feed genuinely reflect current bugs instead of an all-time backlog.
  const cutoff = liveCutoff();
  const liveWhere: Prisma.ErrorLogWhereInput = { resolved: false, lastSeen: { gte: cutoff } };
  const logWhere: Prisma.ErrorLogWhereInput = {
    OR: [{ resolved: true }, { lastSeen: { lt: cutoff } }],
  };

  // The active view's base filter, then AND in the optional source/level facets.
  // Shallow-copy so adding source/level never mutates the pristine liveWhere/
  // logWhere objects the badge counts below reuse.
  const resolved = searchParams.get("resolved");
  const where: Prisma.ErrorLogWhereInput = { ...(resolved === "true" ? logWhere : liveWhere) };
  const source = searchParams.get("source");
  if (source === "server" || source === "client") where.source = source;
  const level = searchParams.get("level");
  if (level === "error" || level === "warn") where.level = level;

  const [items, total, unresolved, resolvedCount] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { lastSeen: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.errorLog.count({ where }),
    // Badges reflect the recency rule, source-independent (as before) so the
    // tab counts always show the true current-vs-resolved totals.
    prisma.errorLog.count({ where: liveWhere }),
    prisma.errorLog.count({ where: logWhere }),
  ]);

  return NextResponse.json({ items, total, unresolved, resolvedCount, page, pageSize });
}

// PATCH /api/admin/error-log  { id, resolved }  — mark an error resolved/open.
export async function PATCH(request: NextRequest) {
  const guard = await requirePermission(request, "analytics:write");
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    await prisma.errorLog.update({
      where: { id },
      data: { resolved: body?.resolved === true },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

// DELETE /api/admin/error-log?id=...  or  ?all=true
export async function DELETE(request: NextRequest) {
  const guard = await requirePermission(request, "analytics:write");
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("all") === "true") {
    const r = await prisma.errorLog.deleteMany({});
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "error",
      summary: "Cleared error-log entries",
      metadata: { deleted: r.count },
    });
    return NextResponse.json({ ok: true, deleted: r.count });
  }
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id or all=true required" }, { status: 400 });
  }
  try {
    await prisma.errorLog.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "error",
      resourceId: id,
      summary: "Cleared error-log entries",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
