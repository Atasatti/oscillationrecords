import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizeItems, normalizeTemplateName, normalizeTemplateDescription } from "@/lib/task-template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// PATCH /api/outreach/templates/[id] { name?, description?, items? } — edit a template.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown;
      description?: unknown;
      items?: unknown;
    };
    const data: { name?: string; description?: string | null; items?: Prisma.InputJsonValue } = {};
    if (body.name !== undefined) {
      const name = normalizeTemplateName(body.name);
      if (!name) return NextResponse.json({ error: "Please name the template" }, { status: 400 });
      data.name = name;
    }
    if (body.description !== undefined) data.description = normalizeTemplateDescription(body.description);
    if (body.items !== undefined) {
      const items = normalizeItems(body.items);
      if (items.length === 0) return NextResponse.json({ error: "Add at least one task" }, { status: 400 });
      data.items = items as unknown as Prisma.InputJsonValue;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const updated = await prisma.taskTemplate.update({ where: { id }, data });
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "template",
      resourceId: id,
      summary: `Updated task template "${updated.name}"`,
    });
    return NextResponse.json({
      template: { id: updated.id, name: updated.name, description: updated.description, items: normalizeItems(updated.items) },
    });
  } catch (e) {
    console.error("template PATCH error:", e);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

// DELETE /api/outreach/templates/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const existing = await prisma.taskTemplate.findUnique({ where: { id }, select: { name: true } });
    if (!existing) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    await prisma.taskTemplate.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete",
      resource: "template",
      resourceId: id,
      summary: `Deleted task template "${existing.name}"`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("template DELETE error:", e);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
