import { prisma } from "@/lib/prisma";
import AdminMessagesClient, { type ContactMessageDTO } from "./AdminMessagesClient";

// Server component: ship the contact messages in the initial HTML. Middleware
// gates /admin, so this only runs for admins. Unhandled first, then newest.
export const dynamic = "force-dynamic";

export default async function AdminMessagesPage() {
  let initialMessages: ContactMessageDTO[] = [];
  try {
    const rows = await prisma.contactMessage.findMany({
      orderBy: [{ handled: "asc" }, { createdAt: "desc" }],
      take: 500,
    });
    initialMessages = rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      message: r.message,
      handled: r.handled,
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    // Fall back to an empty list on a transient DB error.
  }
  return <AdminMessagesClient initialMessages={initialMessages} />;
}
