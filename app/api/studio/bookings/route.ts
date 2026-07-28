import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStudioAccess, isAdminRequest, isSameOrigin } from "@/lib/auth-guard";
import { resolveUserId } from "@/lib/current-user";
import { recordAudit } from "@/lib/audit";
import { validateBookingInput, bookingsOverlap, formatStudioDate, formatStudioTime } from "@/lib/studio-schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BookingDTO = {
  id: string; start: string; end: string;
  title: string | null; bookerName: string | null; mine: boolean; notes: string | null;
};

function parseRange(req: NextRequest): { from: Date; to: Date } {
  const url = new URL(req.url);
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = fromRaw ? new Date(fromRaw) : new Date(Date.now() - 7 * 864e5);
  const to = toRaw ? new Date(toRaw) : new Date(Date.now() + 60 * 864e5);
  const valid = !isNaN(from.getTime()) && !isNaN(to.getTime());
  return valid ? { from, to } : { from: new Date(Date.now() - 7 * 864e5), to: new Date(Date.now() + 60 * 864e5) };
}

// GET /api/studio/bookings?from&to — confirmed bookings intersecting [from,to].
export async function GET(request: NextRequest) {
  const guard = await requireStudioAccess(request);
  if (!guard.ok) return guard.response;
  try {
    const email = (guard.token.email as string).toLowerCase();
    const owner = await isAdminRequest(request);
    const { from, to } = parseRange(request);
    const rows = await prisma.studioBooking.findMany({
      where: { status: "confirmed", start: { lt: to }, end: { gt: from } },
      orderBy: { start: "asc" },
    });
    const bookings: BookingDTO[] = rows.map((b) => {
      const mine = b.bookerEmail.toLowerCase() === email;
      return {
        id: b.id,
        start: b.start.toISOString(),
        end: b.end.toISOString(),
        title: b.title,
        bookerName: b.bookerName,
        mine,
        notes: mine || owner ? b.notes : null,
      };
    });
    return NextResponse.json({ bookings }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("studio bookings GET error:", e);
    return NextResponse.json({ error: "Failed to load bookings" }, { status: 500 });
  }
}

// POST /api/studio/bookings — create a booking (instant, no approval).
export async function POST(request: NextRequest) {
  const guard = await requireStudioAccess(request);
  if (!guard.ok) return guard.response;
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const validated = validateBookingInput({
      startDate: String(o.startDate ?? ""),
      startTime: String(o.startTime ?? ""),
      endDate: String(o.endDate ?? ""),
      endTime: String(o.endTime ?? ""),
    });
    if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
    const { start, end } = validated;

    const title = typeof o.title === "string" && o.title.trim() ? o.title.trim().slice(0, 200) : null;
    const notes = typeof o.notes === "string" && o.notes.trim() ? o.notes.trim().slice(0, 2000) : null;

    // Authoritative overlap check immediately before insert (browser view can be
    // stale). Only confirmed bookings that intersect the requested window matter.
    const clashers = await prisma.studioBooking.findMany({
      where: { status: "confirmed", start: { lt: end }, end: { gt: start } },
      select: { start: true, end: true },
    });
    const clash = clashers.some((c) => bookingsOverlap(start, end, c.start, c.end));
    if (clash) {
      return NextResponse.json({ error: "That time overlaps an existing booking." }, { status: 409 });
    }

    const email = (guard.token.email as string).toLowerCase();
    const userId = await resolveUserId(guard.token);
    const bookerName = (typeof guard.token.name === "string" ? guard.token.name : null);
    const booking = await prisma.studioBooking.create({
      data: { userId, bookerEmail: email, bookerName, start, end, title, notes, status: "confirmed" },
    });

    await recordAudit(request, guard.token, {
      action: "create",
      resource: "studio_booking",
      resourceId: booking.id,
      summary: `Booked studio ${formatStudioDate(start)} ${formatStudioTime(start)}–${formatStudioTime(end)}`,
    });

    const dto: BookingDTO = {
      id: booking.id, start: booking.start.toISOString(), end: booking.end.toISOString(),
      title: booking.title, bookerName: booking.bookerName, mine: true, notes: booking.notes,
    };
    return NextResponse.json({ booking: dto }, { status: 201 });
  } catch (e) {
    console.error("studio bookings POST error:", e);
    return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
  }
}
