import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { isTaskStatus } from "@/lib/task-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/outreach/tasks/bulk — act on many tasks at once.
//   { ids, delete: true }                         → delete them
//   { ids, status }                               → set status
//   { ids, assigneeId }  ("" / null clears)        → set assignee
// Catalog... outreach-gated (write) + audited.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "No task ids provided" }, { status: 400 });
    }

    if (body.delete === true) {
      const res = await prisma.outreachTask.deleteMany({ where: { id: { in: ids } } });
      await recordAudit(request, guard.token, {
        action: "bulk",
        resource: "task",
        summary: `Bulk deleted ${res.count} task${res.count === 1 ? "" : "s"}`,
        metadata: { count: res.count },
      });
      return NextResponse.json({ count: res.count });
    }

    const data: Record<string, unknown> = {};
    let what = "";
    if (isTaskStatus(body.status)) {
      data.status = body.status;
      what = `status → ${body.status}`;
    }
    if ("assigneeId" in body) {
      const a = typeof body.assigneeId === "string" && body.assigneeId.trim() ? body.assigneeId.trim() : null;
      data.assigneeId = a;
      what = a ? "reassigned" : "unassigned";
    }
    if (!Object.keys(data).length) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const res = await prisma.outreachTask.updateMany({ where: { id: { in: ids } }, data });
    await recordAudit(request, guard.token, {
      action: "bulk",
      resource: "task",
      summary: `Bulk updated ${res.count} task${res.count === 1 ? "" : "s"} (${what})`,
      metadata: { count: res.count, ...data },
    });
    return NextResponse.json({ count: res.count });
  } catch (e) {
    console.error("tasks bulk POST error:", e);
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
