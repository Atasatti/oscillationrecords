import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { runScheduledAutomations } from "@/lib/automations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /api/automations/run — evaluate the scheduled (time-based) automations now.
// Idempotent: each rule creates its task at most once per entity. Wired to the
// "Run now" button; a cron could also hit this. Static "run" segment wins over the
// sibling [key] route, so it isn't treated as a rule key.
export async function POST(request: NextRequest) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { created } = await runScheduledAutomations();
    if (created > 0) {
      await recordAudit(request, guard.token, {
        action: "bulk",
        resource: "automation",
        summary: `Ran scheduled automations — created ${created} task${created === 1 ? "" : "s"}`,
        metadata: { created },
      });
    }
    return NextResponse.json({ created });
  } catch (e) {
    console.error("automation run error:", e);
    return NextResponse.json({ error: "Failed to run automations" }, { status: 500 });
  }
}
