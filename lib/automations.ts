// Automation rules ("when X → do Y") for the label ops. A small, curated set of
// built-in rules the admin can toggle on/off — not a no-code rule builder. Each
// rule creates OutreachTasks, at most once per source entity (idempotent via the
// AutomationFire ledger). Server-only (touches prisma). See app/admin/automations.

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// Rule registry (code-level source of truth; DB only stores enabled/config)
// ---------------------------------------------------------------------------

export type AutomationKind = "event" | "scheduled";

export type AutomationRuleDef = {
  key: string;
  name: string;
  description: string;
  kind: AutomationKind;
  /** One-line note on what it produces (shown in the UI). */
  creates: string;
  defaultConfig: Record<string, unknown>;
};

export const PITCH_ACCEPTED_KEY = "pitch_accepted_task";
export const RELEASE_CAMPAIGN_KEY = "release_campaign_tasks";
export const DEMO_RECEIVED_KEY = "demo_received_task";
export const POST_RELEASE_KEY = "post_release_tasks";

export const AUTOMATION_RULES: readonly AutomationRuleDef[] = [
  {
    key: PITCH_ACCEPTED_KEY,
    name: "Pitch accepted → follow-up task",
    description:
      "When a pitch is marked Accepted, create a high-priority task to lock the premiere/feature and send assets, linked to the pitch's releases and artists.",
    kind: "event",
    creates: "One task per accepted pitch",
    defaultConfig: {},
  },
  {
    key: DEMO_RECEIVED_KEY,
    name: "New demo → review task",
    description:
      "When a new demo is logged in the A&R pipeline, create a task to listen and rate it, so nothing sits unheard in the inbox.",
    kind: "event",
    creates: "One task per new demo",
    defaultConfig: {},
  },
  {
    key: RELEASE_CAMPAIGN_KEY,
    name: "Upcoming release → pre-release campaign",
    description:
      "When a scheduled release comes within N days, create a pre-release campaign task with a promo checklist, linked to the release and its artists.",
    kind: "scheduled",
    creates: "One task per upcoming release",
    defaultConfig: { daysBefore: 21 },
  },
  {
    key: POST_RELEASE_KEY,
    name: "Release goes live → post-release wrap-up",
    description:
      "When a release's date passes (within N days), create a post-release task with a wrap-up checklist — confirm it's live, log placements, thank curators — linked to the release and its artists.",
    kind: "scheduled",
    creates: "One task per newly-released title",
    defaultConfig: { daysAfter: 3 },
  },
];

const RULE_BY_KEY = new Map(AUTOMATION_RULES.map((r) => [r.key, r]));

export function isAutomationKey(k: unknown): k is string {
  return typeof k === "string" && RULE_BY_KEY.has(k);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Rule state (registry defaults merged over the DB row)
// ---------------------------------------------------------------------------

export type RuleState = {
  key: string;
  name: string;
  description: string;
  kind: AutomationKind;
  creates: string;
  enabled: boolean;
  config: Record<string, unknown>;
  lastRunAt: string | null;
  firedCount: number;
};

/** Clamp/whitelist a rule's config so only known, in-range keys are stored. */
function sanitizeConfig(key: string, config: Record<string, unknown>): Record<string, unknown> {
  if (key === RELEASE_CAMPAIGN_KEY) {
    const raw = Number(config.daysBefore);
    const daysBefore = Number.isFinite(raw) ? Math.min(90, Math.max(1, Math.round(raw))) : 21;
    return { daysBefore };
  }
  if (key === POST_RELEASE_KEY) {
    const raw = Number(config.daysAfter);
    const daysAfter = Number.isFinite(raw) ? Math.min(30, Math.max(1, Math.round(raw))) : 3;
    return { daysAfter };
  }
  return {};
}

function mergedConfig(key: string, rowConfig: unknown): Record<string, unknown> {
  const def = RULE_BY_KEY.get(key);
  return { ...(def?.defaultConfig ?? {}), ...(isObj(rowConfig) ? rowConfig : {}) };
}

/** All rules with their current enabled/config + fire counts, for the admin UI. */
export async function getRuleStates(): Promise<RuleState[]> {
  const [rows, fireGroups] = await Promise.all([
    prisma.automationRule.findMany(),
    prisma.automationFire.groupBy({ by: ["ruleKey"], _count: { _all: true } }),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const fires = new Map(fireGroups.map((g) => [g.ruleKey, g._count._all]));
  return AUTOMATION_RULES.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      name: def.name,
      description: def.description,
      kind: def.kind,
      creates: def.creates,
      enabled: row?.enabled ?? false,
      config: mergedConfig(def.key, row?.config),
      lastRunAt: row?.lastRunAt ? row.lastRunAt.toISOString() : null,
      firedCount: fires.get(def.key) ?? 0,
    };
  });
}

async function loadRule(key: string): Promise<{ enabled: boolean; config: Record<string, unknown> }> {
  const row = await prisma.automationRule.findUnique({ where: { key } });
  return { enabled: row?.enabled ?? false, config: mergedConfig(key, row?.config) };
}

/** Upsert a rule's enabled flag and/or config. Returns the stored row. */
export async function setRuleState(key: string, patch: { enabled?: boolean; config?: Record<string, unknown> }) {
  if (!RULE_BY_KEY.has(key)) throw new Error(`Unknown automation rule: ${key}`);
  const update: Prisma.AutomationRuleUpdateInput = {};
  const create: Prisma.AutomationRuleCreateInput = { key, enabled: false };
  if (typeof patch.enabled === "boolean") {
    update.enabled = patch.enabled;
    create.enabled = patch.enabled;
  }
  if (patch.config) {
    const clean = sanitizeConfig(key, patch.config) as Prisma.InputJsonValue;
    update.config = clean;
    create.config = clean;
  }
  return prisma.automationRule.upsert({ where: { key }, create, update });
}

// ---------------------------------------------------------------------------
// Idempotent task creation
// ---------------------------------------------------------------------------

type NewTask = {
  title: string;
  description?: string | null;
  category: string;
  priority?: string;
  dueAt?: Date | null;
  checklist?: { id: string; text: string; done: boolean }[];
  artistIds?: string[];
  releaseIds?: string[];
  notes?: string | null;
};

/**
 * Create a task for (ruleKey, entity) at most once. Claims a fire-ledger row
 * first (app-level check + the @@unique index once db push runs at deploy), then
 * creates the task and back-links it. Returns the new task id, or null if this
 * rule already fired for this entity (or lost a create race).
 */
async function fireOnce(ruleKey: string, entityType: string, entityId: string, task: NewTask): Promise<string | null> {
  const already = await prisma.automationFire.findFirst({
    where: { ruleKey, entityType, entityId },
    select: { id: true },
  });
  if (already) return null;

  let fireId: string;
  try {
    const fire = await prisma.automationFire.create({ data: { ruleKey, entityType, entityId } });
    fireId = fire.id;
  } catch {
    // A concurrent claim was rejected by the @@unique index (enforced once db
    // push runs at deploy) — someone else fired it. Pre-deploy, the findFirst
    // above is the guard; the window is small and the worst case is a dupe task.
    return null;
  }

  try {
    const created = await prisma.outreachTask.create({
      data: {
        title: task.title,
        description: task.description ?? null,
        category: task.category,
        priority: task.priority ?? "high",
        status: "todo",
        checklist: (task.checklist ?? []) as unknown as Prisma.InputJsonValue,
        artistIds: task.artistIds ?? [],
        releaseIds: task.releaseIds ?? [],
        dueAt: task.dueAt ?? null,
        notes: task.notes ?? null,
      },
    });
    await prisma.automationFire.update({ where: { id: fireId }, data: { taskId: created.id } }).catch(() => {});
    return created.id;
  } catch (e) {
    // Task create failed — release the claim so the rule can retry next time
    // instead of being permanently blocked by an orphaned fire row.
    console.error("automation task create failed; releasing fire claim:", e);
    await prisma.automationFire.delete({ where: { id: fireId } }).catch(() => {});
    return null;
  }
}

// ---------------------------------------------------------------------------
// Event rule — pitch accepted
// ---------------------------------------------------------------------------

type PitchLike = { id: string; contactId: string; artistIds: string[]; releaseIds: string[] };

/**
 * Called after a pitch transitions to "accepted". Best-effort: never throws into
 * the request. No-op unless the rule is enabled; idempotent per pitch.
 */
export async function onPitchAccepted(pitch: PitchLike): Promise<void> {
  try {
    const { enabled } = await loadRule(PITCH_ACCEPTED_KEY);
    if (!enabled) return;
    const contact = await prisma.outreachContact
      .findUnique({ where: { id: pitch.contactId }, select: { name: true } })
      .catch(() => null);
    const who = contact?.name?.trim() || "the contact";
    await fireOnce(PITCH_ACCEPTED_KEY, "pitch", pitch.id, {
      title: `Coordinate coverage — ${who}`,
      description:
        "A pitch was accepted. Confirm the details, lock the premiere/feature date, and send the final assets and links.",
      category: "pitching",
      priority: "high",
      artistIds: pitch.artistIds ?? [],
      releaseIds: pitch.releaseIds ?? [],
      notes: "Created automatically by the “Pitch accepted → follow-up task” automation.",
    });
  } catch (e) {
    console.error("onPitchAccepted automation error:", e);
  }
}

// ---------------------------------------------------------------------------
// Event rule — new demo logged
// ---------------------------------------------------------------------------

type DemoLike = { id: string; artistName: string; link?: string | null };

/**
 * Called after a demo is logged in the A&R pipeline. Best-effort: never throws
 * into the request. No-op unless the rule is enabled; idempotent per demo.
 */
export async function onDemoReceived(demo: DemoLike): Promise<void> {
  try {
    const { enabled } = await loadRule(DEMO_RECEIVED_KEY);
    if (!enabled) return;
    await fireOnce(DEMO_RECEIVED_KEY, "demo", demo.id, {
      title: `Review demo — ${demo.artistName}`,
      description: demo.link
        ? `Listen and rate the demo from ${demo.artistName}.\nLink: ${demo.link}`
        : `Listen and rate the demo from ${demo.artistName}.`,
      category: "research",
      priority: "medium",
      notes: "Created automatically by the “New demo → review task” automation.",
    });
  } catch (e) {
    console.error("onDemoReceived automation error:", e);
  }
}

// ---------------------------------------------------------------------------
// Scheduled rules — evaluated on demand (no cron): a "Run now" button + a
// best-effort sweep when the automations page loads. Idempotent, so safe to
// re-run. A cron can also POST /api/automations/run.
// ---------------------------------------------------------------------------

const CAMPAIGN_CHECKLIST = [
  "Pitch to DSP editorial (Spotify / Apple / Deezer)",
  "Send promo to press & playlist contacts",
  "Schedule social posts + Canvas/Clips",
  "Set up the pre-save / smart link",
  "Brief the artist on release-day actions",
];

const POST_RELEASE_CHECKLIST = [
  "Confirm the release is live on all DSPs",
  "Log any playlist / radio / press placements",
  "Thank curators, press & playlisters who supported it",
  "Update the artist's EPK + press one-sheet",
  "Post release-day + follow-up social content",
];

export async function runScheduledAutomations(): Promise<{ created: number }> {
  let created = 0;

  const { enabled, config } = await loadRule(RELEASE_CAMPAIGN_KEY);
  if (enabled) {
    // Re-clamp at the consumption point too, so the scan horizon stays bounded
    // regardless of how the config row was written (defense in depth).
    const daysBefore = Math.min(90, Math.max(1, Math.round(Number(config.daysBefore) || 21)));
    const now = new Date();
    const horizon = new Date(now.getTime() + daysBefore * 86_400_000);
    const releases = await prisma.release.findMany({
      where: { status: "SCHEDULED", releaseDate: { gt: now, lte: horizon } },
      select: { id: true, name: true, releaseDate: true, primaryArtistIds: true, featureArtistIds: true },
    });
    for (const r of releases) {
      const checklist = CAMPAIGN_CHECKLIST.map((text) => ({ id: crypto.randomUUID(), text, done: false }));
      const day = r.releaseDate ? r.releaseDate.toISOString().slice(0, 10) : "soon";
      const taskId = await fireOnce(RELEASE_CAMPAIGN_KEY, "release", r.id, {
        title: `Pre-release campaign — ${r.name}`,
        description: `${r.name} is out ${day}. Run the pre-release promo checklist before the date.`,
        category: "pitching",
        priority: "high",
        dueAt: r.releaseDate ?? null,
        checklist,
        artistIds: [...(r.primaryArtistIds ?? []), ...(r.featureArtistIds ?? [])],
        releaseIds: [r.id],
        notes: "Created automatically by the “Upcoming release → pre-release campaign” automation.",
      });
      if (taskId) created += 1;
    }
    // Stamp the sweep time (only if the row exists — i.e. the rule was toggled).
    await prisma.automationRule.updateMany({ where: { key: RELEASE_CAMPAIGN_KEY }, data: { lastRunAt: new Date() } }).catch(() => {});
  }

  const post = await loadRule(POST_RELEASE_KEY);
  if (post.enabled) {
    const daysAfter = Math.min(30, Math.max(1, Math.round(Number(post.config.daysAfter) || 3)));
    const now = new Date();
    const since = new Date(now.getTime() - daysAfter * 86_400_000);
    // Titles whose date has just passed — SCHEDULED ones auto-publish at query
    // time, so include both statuses in the just-released window.
    const releases = await prisma.release.findMany({
      where: { releaseDate: { gte: since, lte: now }, status: { in: ["SCHEDULED", "RELEASED"] } },
      select: { id: true, name: true, primaryArtistIds: true, featureArtistIds: true },
    });
    for (const r of releases) {
      const checklist = POST_RELEASE_CHECKLIST.map((text) => ({ id: crypto.randomUUID(), text, done: false }));
      const taskId = await fireOnce(POST_RELEASE_KEY, "release", r.id, {
        title: `Post-release wrap-up — ${r.name}`,
        description: `${r.name} is out. Confirm it's live everywhere and capture the wins.`,
        category: "pitching",
        priority: "medium",
        checklist,
        artistIds: [...(r.primaryArtistIds ?? []), ...(r.featureArtistIds ?? [])],
        releaseIds: [r.id],
        notes: "Created automatically by the “Release goes live → post-release wrap-up” automation.",
      });
      if (taskId) created += 1;
    }
    await prisma.automationRule.updateMany({ where: { key: POST_RELEASE_KEY }, data: { lastRunAt: new Date() } }).catch(() => {});
  }

  return { created };
}
