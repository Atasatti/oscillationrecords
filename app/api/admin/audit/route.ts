import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/audit?resource=&action=&limit=&before=
// Owner-only view of the admin activity trail, newest first. `before` is an ISO
// timestamp cursor for "load older".
export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const { searchParams } = new URL(request.url);
    const resource = searchParams.get("resource") || "";
    const action = searchParams.get("action") || "";
    const before = searchParams.get("before") || "";
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "100", 10) || 100, 1), 200);

    const where: Record<string, unknown> = {};
    if (resource) where.resource = resource;
    if (action) where.action = action;
    if (before) {
      const d = new Date(before);
      if (!Number.isNaN(d.getTime())) where.at = { lt: d };
    }

    const items = await prisma.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      take: limit,
    });

    // Distinct resources present, so the viewer's filter only offers real values.
    const resourcesRaw = await prisma.auditLog.findMany({
      distinct: ["resource"],
      select: { resource: true },
      orderBy: { resource: "asc" },
    });

    return NextResponse.json(
      { items, resources: resourcesRaw.map((r) => r.resource) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    console.error("admin audit GET error:", e);
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}
