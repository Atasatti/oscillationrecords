import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { isAutomationKey, setRuleState } from "@/lib/automations";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// PATCH /api/automations/[key] — toggle a rule on/off and/or update its config.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const guard = await requirePermission(request, "outreach:write");
  if (!guard.ok) return guard.response;
  try {
    const { key } = await params;
    if (!isAutomationKey(key)) {
      return NextResponse.json({ error: "Unknown automation" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      enabled?: unknown;
      config?: unknown;
    };
    const patch: { enabled?: boolean; config?: Record<string, unknown> } = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.config && typeof body.config === "object" && !Array.isArray(body.config)) {
      patch.config = body.config as Record<string, unknown>;
    }
    if (patch.enabled === undefined && !patch.config) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const row = await setRuleState(key, patch);
    await recordAudit(request, guard.token, {
      action: "update",
      resource: "automation",
      resourceId: key,
      summary:
        patch.enabled !== undefined
          ? `${patch.enabled ? "Enabled" : "Disabled"} automation "${key}"`
          : `Updated automation "${key}" settings`,
      metadata: { enabled: row.enabled, config: row.config },
    });

    return NextResponse.json({ ok: true, enabled: row.enabled, config: row.config });
  } catch (e) {
    console.error("automation PATCH error:", e);
    return NextResponse.json({ error: "Failed to update automation" }, { status: 500 });
  }
}
