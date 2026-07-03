import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { isDemoStage, normalizeRating, demoStr, safeUrl } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// PATCH /api/outreach/demos/[id] — partial update (full edit, or a quick stage /
// rating change from the card). Only the provided fields are touched.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const raw = await request.json().catch(() => ({}));
    const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if ("artistName" in o) {
      const s = demoStr(o.artistName, 200);
      if (!s) return NextResponse.json({ error: "Artist name is required" }, { status: 400 });
      data.artistName = s;
    }
    if ("contactName" in o) data.contactName = demoStr(o.contactName, 200);
    if ("contactEmail" in o) data.contactEmail = demoStr(o.contactEmail, 320);
    if ("link" in o) data.link = safeUrl(o.link);
    if ("genre" in o) data.genre = demoStr(o.genre, 80);
    if ("source" in o) data.source = demoStr(o.source, 120);
    if ("stage" in o && isDemoStage(o.stage)) data.stage = o.stage;
    if ("rating" in o) data.rating = normalizeRating(o.rating);
    if ("notes" in o) data.notes = demoStr(o.notes, 2000);
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const demo = await prisma.demo.update({ where: { id }, data });
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "demo",
      resourceId: id,
      summary: `Updated demo "${demo.artistName}"${data.stage ? ` → ${data.stage}` : ""}`,
      metadata: { stage: data.stage, rating: data.rating },
    });
    return NextResponse.json({ demo });
  } catch (e) {
    console.error("demo PATCH error:", e);
    return NextResponse.json({ error: "Failed to update demo" }, { status: 500 });
  }
}

// DELETE /api/outreach/demos/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.demo.findUnique({ where: { id }, select: { artistName: true } });
    if (!existing) return NextResponse.json({ error: "Demo not found" }, { status: 404 });

    await prisma.demo.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "demo",
      resourceId: id,
      summary: `Deleted demo from "${existing.artistName}"`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("demo DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete demo" }, { status: 500 });
  }
}
