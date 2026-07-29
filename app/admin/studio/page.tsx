import { requirePageOwner } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/admin/shell/PageHeader";
import StudioAdminClient, { type AdminBooking, type AdminBooker } from "./StudioAdminClient";

export const dynamic = "force-dynamic";

export default async function AdminStudioPage() {
  await requirePageOwner();

  let bookings: AdminBooking[] = [];
  let bookers: AdminBooker[] = [];
  try {
    const [bRows, kRows] = await Promise.all([
      prisma.studioBooking.findMany({ where: { status: "confirmed", end: { gt: new Date() } }, orderBy: { start: "asc" }, take: 500 }),
      prisma.studioBooker.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    bookings = bRows.map((b) => ({ id: b.id, start: b.start.toISOString(), end: b.end.toISOString(), title: b.title, bookerName: b.bookerName, bookerEmail: b.bookerEmail }));
    bookers = kRows.map((k) => ({ id: k.id, email: k.email, name: k.name, note: k.note, createdAt: k.createdAt.toISOString() }));
  } catch {
    // Empty on a transient DB error.
  }

  return (
    <div>
      <PageHeader title="Studio" description="Manage who can book the studio, and see or cancel any booking." />
      <StudioAdminClient initialBookings={bookings} initialBookers={bookers} />
    </div>
  );
}
