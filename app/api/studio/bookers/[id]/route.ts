import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isSameOrigin } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const existing = await prisma.studioBooker.findUnique({ where: { id }, select: { email: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.studioBooker.delete({ where: { id } });
    await recordAudit(request, guard.token, {
      action: "delete", resource: "studio_booker", resourceId: id,
      summary: `Revoked studio booking access from ${existing.email}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("studio booker DELETE error:", e);
    return NextResponse.json({ error: "Failed to remove from allowlist" }, { status: 500 });
  }
}
