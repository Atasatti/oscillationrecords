// The canonical task status vocabulary (OutreachTask.status). Shared by the Tasks
// UI and the API so a new status can't be added in one place and silently
// rejected in another (as "blocked" was, once, in the bulk route). Pure — safe on
// server or client.

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}
