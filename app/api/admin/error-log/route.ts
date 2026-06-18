import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/error-log?page=&pageSize=&source=&level=&resolved=
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "25", 10) || 25));

  const where: Prisma.ErrorLogWhereInput = {};
  const source = searchParams.get("source");
  if (source === "server" || source === "client") where.source = source;
  const level = searchParams.get("level");
  if (level === "error" || level === "warn") where.level = level;
  const resolved = searchParams.get("resolved");
  if (resolved === "true") where.resolved = true;
  else if (resolved === "false") where.resolved = false;

  const [items, total, unresolved] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { lastSeen: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.errorLog.count({ where }),
    prisma.errorLog.count({ where: { resolved: false } }),
  ]);

  return NextResponse.json({ items, total, unresolved, page, pageSize });
}

// PATCH /api/admin/error-log  { id, resolved }  — mark an error resolved/open.
export async function PATCH(request: NextRequest) {
  const guard = await requireAdmin(request);
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
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  if (searchParams.get("all") === "true") {
    const r = await prisma.errorLog.deleteMany({});
    return NextResponse.json({ ok: true, deleted: r.count });
  }
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id or all=true required" }, { status: 400 });
  }
  try {
    await prisma.errorLog.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
