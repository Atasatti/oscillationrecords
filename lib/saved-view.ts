// A saved Tasks view — the list/board/calendar controls we persist per user.
// Pure; safe to import on server or client. The vocab mirrors the Tasks page
// (STATUS_FILTERS, GROUP_OPTIONS, view toggle); unknown values fall back to a safe
// default so an old/hand-edited config never breaks the page.

export type SavedViewConfig = {
  tab: string;
  view: "list" | "board" | "calendar";
  groupBy: string;
  categoryFilter: string;
  assigneeFilter: string;
};

const TABS = new Set(["attention", "all", "todo", "in_progress", "blocked", "done"]);
const VIEWS = new Set(["list", "board", "calendar"]);
const GROUPS = new Set(["none", "status", "assignee", "category", "priority"]);

const str = (v: unknown, max = 64) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export const SAVED_VIEW_NAME_MAX = 40;
export const SAVED_VIEWS_PER_USER_MAX = 30;

export function normalizeViewName(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().slice(0, SAVED_VIEW_NAME_MAX) : "";
}

export function normalizeViewConfig(raw: unknown): SavedViewConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const tab = TABS.has(String(o.tab)) ? String(o.tab) : "all";
  const view = VIEWS.has(String(o.view)) ? (String(o.view) as SavedViewConfig["view"]) : "list";
  const groupBy = GROUPS.has(String(o.groupBy)) ? String(o.groupBy) : "none";
  return {
    tab,
    view,
    groupBy,
    categoryFilter: str(o.categoryFilter),
    assigneeFilter: str(o.assigneeFilter),
  };
}
