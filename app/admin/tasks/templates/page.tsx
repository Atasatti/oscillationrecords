import { prisma } from "@/lib/prisma";
import { requirePagePermission } from "@/lib/page-guard";
import { normalizeItems } from "@/lib/task-template";
import AdminTemplatesClient, { type Template } from "./AdminTemplatesClient";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  // Revocation-aware gate before reading task templates. Matches the templates
  // API's outreach:read.
  await requirePagePermission("outreach:read");

  let templates: Template[] = [];
  try {
    const rows = await prisma.taskTemplate.findMany({ orderBy: { createdAt: "desc" } });
    templates = rows.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      items: normalizeItems(t.items),
    }));
  } catch {
    // Empty list on a transient DB error.
  }
  return <AdminTemplatesClient initial={templates} />;
}
