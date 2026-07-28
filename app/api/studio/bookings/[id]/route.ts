import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioAccess, isAdminRequest, isSameOrigin } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import { validateBookingInput, bookingsOverlap, formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const isObjectId = (v: string) => /^[a-f\d]{24}$/i.test(v);

// True if the caller may modify this booking: an owner, OR the booking's own
// booker AND the booking is still upcoming (can't touch a past session).
function canModify(bookerEmail: string, callerEmail: string, start: Date, owner: boolean): { ok: boolean; error?: string; status?: number } {
  if (owner) return { ok: true };
  if (bookerEmail.toLowerCase() !== callerEmail.toLowerCase()) return { ok: false, error: "Forbidden", status: 403 };
  if (start.getTime() <= Date.now()) return { ok: false, error: "That booking has already started.", status: 400 };
  return { ok: true };
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStudioAccess(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const existing = await prisma.studioBooking.findUnique({ where: { id } });
    if (!existing || existing.status === "cancelled") return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const callerEmail = guard.token.email as string;
    const owner = await isAdminRequest(request);
    const gate = canModify(existing.bookerEmail, callerEmail, existing.start, owner);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const raw = await request.json().catch(() => ({}));
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    // Time change: all four fields must be present together and re-validated.
    if ("startDate" in o || "startTime" in o || "endDate" in o || "endTime" in o) {
      const validated = validateBookingInput({
        startDate: String(o.startDate ?? ""), startTime: String(o.startTime ?? ""),
        endDate: String(o.endDate ?? ""), endTime: String(o.endTime ?? ""),
      });
      if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
      const { start, end } = validated;
      const clashers = await prisma.studioBooking.findMany({
        where: { status: "confirmed", id: { not: id }, start: { lt: end }, end: { gt: start } },
        select: { start: true, end: true },
      });
      if (clashers.some((c) => bookingsOverlap(start, end, c.start, c.end))) {
        return NextResponse.json({ error: "That time overlaps an existing booking." }, { status: 409 });
      }
      data.start = start; data.end = end;
    }
    if ("title" in o) data.title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 200) : null;
    if ("notes" in o) data.notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim().slice(0, 2000) : null;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "No changes." }, { status: 400 });

    const booking = await prisma.studioBooking.update({ where: { id }, data });
    await recordAudit(request, guard.token, {
      action: "update", resource: "studio_booking", resourceId: id,
      summary: `Updated studio booking ${formatStudioDate(booking.start)} ${formatStudioTime(booking.start)}–${formatStudioTime(booking.end)}`,
    });
    return NextResponse.json({ booking: { id: booking.id, start: booking.start.toISOString(), end: booking.end.toISOString(), title: booking.title, bookerName: booking.bookerName, mine: true, notes: booking.notes } });
  } catch (e) {
    console.error("studio booking PATCH error:", e);
    return NextResponse.json({ error: "Failed to update booking" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStudioAccess(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id } = await params;
    if (!isObjectId(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const existing = await prisma.studioBooking.findUnique({ where: { id } });
    if (!existing || existing.status === "cancelled") return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const callerEmail = guard.token.email as string;
    const owner = await isAdminRequest(request);
    const gate = canModify(existing.bookerEmail, callerEmail, existing.start, owner);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    await prisma.studioBooking.update({ where: { id }, data: { status: "cancelled" } });
    await recordAudit(request, guard.token, {
      action: "delete", resource: "studio_booking", resourceId: id,
      summary: `Cancelled studio booking ${formatStudioDate(existing.start)} ${formatStudioTime(existing.start)}–${formatStudioTime(existing.end)}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("studio booking DELETE error:", e);
    return NextResponse.json({ error: "Failed to cancel booking" }, { status: 500 });
  }
}
