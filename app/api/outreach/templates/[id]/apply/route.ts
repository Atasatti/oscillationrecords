import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { normalizeItems } from "@/lib/task-template";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);
const objectIds = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && isObjectId(x)) : [];

// POST /api/outreach/templates/[id]/apply { releaseIds?, artistIds? } — spawn the
// template's tasks (optionally linked to releases/artists).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const template = await prisma.taskTemplate.findUnique({ where: { id } });
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const items = normalizeItems(template.items);
    if (items.length === 0) return NextResponse.json({ error: "Template has no tasks" }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const releaseIds = objectIds(body.releaseIds);
    const artistIds = objectIds(body.artistIds);

    const res = await prisma.outreachTask.createMany({
      data: items.map((it) => ({
        title: it.title,
        category: it.category,
        priority: it.priority,
        status: "todo",
        releaseIds,
        artistIds,
      })),
    });

    await recordAudit(request, guard.token, {
      action: "bulk",
      resource: "task",
      summary: `Applied template "${template.name}" — created ${res.count} task${res.count === 1 ? "" : "s"}`,
      metadata: { template: template.name, count: res.count },
    });

    return NextResponse.json({ created: res.count }, { status: 201 });
  } catch (e) {
    console.error("template apply error:", e);
    return NextResponse.json({ error: "Failed to apply template" }, { status: 500 });
  }
}
