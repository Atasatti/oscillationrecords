import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, isSameOrigin } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  try {
    const bookers = await prisma.studioBooker.findMany({ orderBy: { createdAt: "desc" } });
    return NextResponse.json({ bookers }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("studio bookers GET error:", e);
    return NextResponse.json({ error: "Failed to load allowlist" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const email = typeof o.email === "string" ? o.email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 120) : null;
    const note = typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 500) : null;

    const existing = await prisma.studioBooker.findUnique({ where: { email }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "That email is already on the list." }, { status: 409 });

    const addedById = await resolveUserId(guard.token);
    const booker = await prisma.studioBooker.create({ data: { email, name, note, addedById } });
    await recordAudit(request, guard.token, {
      action: "create", resource: "studio_booker", resourceId: booker.id,
      summary: `Granted studio booking access to ${email}`,
    });
    return NextResponse.json({ booker }, { status: 201 });
  } catch (e) {
    console.error("studio bookers POST error:", e);
    return NextResponse.json({ error: "Failed to add to allowlist" }, { status: 500 });
  }
}
