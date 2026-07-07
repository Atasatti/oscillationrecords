import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizeItems, normalizeTemplateName, normalizeTemplateDescription } from "@/lib/task-template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/outreach/templates — all task templates, newest first.
export async function GET(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:read");
  if (!guard.ok) return guard.response;
  try {
    const rows = await prisma.taskTemplate.findMany({ orderBy: { createdAt: "desc" } });
    const templates = rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      items: normalizeItems(t.items),
    }));
    return NextResponse.json({ templates });
  } catch (e) {
    console.error("templates GET error:", e);
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 });
  }
}

// POST /api/outreach/templates { name, description?, items } — create a template.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const name = normalizeTemplateName(body.name);
    if (!name) return NextResponse.json({ error: "Please name the template" }, { status: 400 });
    const items = normalizeItems(body.items);
    if (items.length === 0) return NextResponse.json({ error: "Add at least one task" }, { status: 400 });

    const created = await prisma.taskTemplate.create({
      data: {
        name,
        description: normalizeTemplateDescription(body.description),
        items: items as unknown as Prisma.InputJsonValue,
      },
    });
    await recordAudit(request, guard.token, {
      action: "create",
      resource: "template",
      resourceId: created.id,
      summary: `Created task template "${name}" (${items.length} task${items.length === 1 ? "" : "s"})`,
    });
    return NextResponse.json(
      { template: { id: created.id, name: created.name, description: created.description, items } },
      { status: 201 }
    );
  } catch (e) {
    console.error("templates POST error:", e);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}
