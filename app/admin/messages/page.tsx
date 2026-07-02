import { prisma } from "@/lib/prisma";
import { getStaffDirectory } from "@/lib/staff-directory";
import { normalizeStatus, normalizePriority } from "@/lib/contact-ticket";
import AdminMessagesClient, {
  type ContactMessageDTO,
  type StaffOption,
} from "./AdminMessagesClient";

// Server component: ship the contact messages in the initial HTML. Middleware
// gates /admin, so this only runs for admins. Open first, then newest.
export const dynamic = "force-dynamic";

export default async function AdminMessagesPage() {
  let initialMessages: ContactMessageDTO[] = [];
  let staff: StaffOption[] = [];
  try {
    const [rows, directory] = await Promise.all([
      prisma.contactMessage.findMany({
        orderBy: [{ handled: "asc" }, { createdAt: "desc" }],
        take: 500,
      }),
      getStaffDirectory(),
    ]);
    initialMessages = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      message: r.message,
      handled: r.handled,
      status: normalizeStatus(r.status, r.handled),
      assigneeId: r.assigneeId ?? null,
      priority: normalizePriority(r.priority),
      createdAt: r.createdAt.toISOString(),
    }));
    // Only staff with a real account id can be assigned a ticket.
    staff = directory
      .filter((s): s is typeof s & { id: string } => !!s.id)
      .map((s) => ({ id: s.id, name: s.name, email: s.email }));
  } catch {
    // Fall back to an empty list on a transient DB error.
  }
  return <AdminMessagesClient initialMessages={initialMessages} staff={staff} />;
}
