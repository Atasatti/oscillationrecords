// Sub-task checklist on an OutreachTask (Release.checklist Json). Pure — safe on
// server or client.

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Coerce arbitrary stored/submitted data into a clean ChecklistItem[] (drops blank text). */
export function normalizeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ChecklistItem[] = [];
  for (const i of raw) {
    if (!i || typeof i !== "object") continue;
    const o = i as Record<string, unknown>;
    const text = typeof o.text === "string" ? o.text.trim() : "";
    if (!text) continue;
    out.push({
      id: typeof o.id === "string" && o.id ? o.id : "",
      text,
      done: o.done === true,
    });
  }
  return out;
}

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
