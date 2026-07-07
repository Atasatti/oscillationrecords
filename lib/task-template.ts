// Reusable task templates (TaskTemplate) — a named set of task specs that spawn
// tasks in one click. Pure — safe to import on server or client. The category /
// priority vocab mirrors the Tasks page; unknown values fall back to a default.

export const TEMPLATE_CATEGORIES = ["pitching", "research", "admin", "social", "sync", "radio", "catalog"] as const;
export const TEMPLATE_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export interface TemplateItem {
  title: string;
  category: string;
  priority: string;
}

export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_DESC_MAX = 300;
export const TEMPLATE_ITEMS_MAX = 40;

const isCategory = (v: unknown) => typeof v === "string" && (TEMPLATE_CATEGORIES as readonly string[]).includes(v);
const isPriority = (v: unknown) => typeof v === "string" && (TEMPLATE_PRIORITIES as readonly string[]).includes(v);

export function normalizeTemplateName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, TEMPLATE_NAME_MAX) : "";
}

export function normalizeTemplateDescription(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().slice(0, TEMPLATE_DESC_MAX) : "";
  return s || null;
}

/** Coerce arbitrary stored/submitted data into clean TemplateItem[] (blank titles dropped). */
export function normalizeItems(raw: unknown): TemplateItem[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 300) : "";
    if (!title) continue;
    out.push({
      title,
      category: isCategory(o.category) ? (o.category as string) : "admin",
      priority: isPriority(o.priority) ? (o.priority as string) : "medium",
    });
    if (out.length >= TEMPLATE_ITEMS_MAX) break;
  }
  return out;
}
