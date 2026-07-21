import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-guard";
import { getStaffDirectory } from "@/lib/staff-directory";
import { normalizeStatus, normalizePriority } from "@/lib/contact-ticket";
import AdminMessagesClient, {
  type ContactAttachmentDTO,
  type ContactMessageDTO,
  type StaffOption,
} from "./AdminMessagesClient";

// Server component: ship the contact messages in the initial HTML. Open first,
// then newest.
export const dynamic = "force-dynamic";

/** Coerce the stored `attachments` JSON into the DTO shape, dropping anything
 *  malformed (or without a url) so a bad row can't crash the admin list. */
function toAttachments(raw: unknown): ContactAttachmentDTO[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>) : null))
    .filter((a): a is Record<string, unknown> => a !== null)
    .map((a) => ({
      name: typeof a.name === "string" && a.name ? a.name : "attachment",
      url: typeof a.url === "string" ? a.url : "",
      size: typeof a.size === "number" ? a.size : 0,
      type: typeof a.type === "string" ? a.type : "",
    }))
    .filter((a) => a.url !== "");
}

export default async function AdminMessagesPage() {
  // Revocation-aware gate BEFORE reading message PII (names/emails/bodies) —
  // middleware is token-only, so this direct-read page would otherwise leak up to
  // 500 tickets to a demoted staffer's still-valid JWT. Matches the API's
  // outreach:read.
  await requirePagePermission("outreach:read");

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
      attachments: toAttachments(r.attachments),
    }));
    // Only staff with a real account id can be assigned a ticket.
    staff = directory
      .filter((s): s is typeof s & { id: string } => !!s.id)
      .map((s) => ({ id: s.id, name: s.name, nickname: s.nickname, email: s.email }));
  } catch {
    // Fall back to an empty list on a transient DB error.
  }
  return <AdminMessagesClient initialMessages={initialMessages} staff={staff} />;
}
