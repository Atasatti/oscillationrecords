import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizeDemoInput } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/demos — all demos, newest first.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    const demos = await prisma.demo.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ demos }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("demos GET error:", e);
    return NextResponse.json({ error: "Failed to load demos" }, { status: 500 });
  }
}

// POST /api/outreach/demos — log a demo.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const input = normalizeDemoInput(body);
    if (!input.artistName) return NextResponse.json({ error: "Artist name is required" }, { status: 400 });

    const demo = await prisma.demo.create({ data: input });
    await recordAudit(request, guard.token, {
      action: "create",
      resource: "demo",
      resourceId: demo.id,
      summary: `Logged a demo from "${demo.artistName}"`,
    });
    return NextResponse.json({ demo }, { status: 201 });
  } catch (e) {
    console.error("demos POST error:", e);
    return NextResponse.json({ error: "Failed to log demo" }, { status: 500 });
  }
}
