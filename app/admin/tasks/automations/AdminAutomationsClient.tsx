"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import PageHeader from "@/components/admin/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/local-ui/Toast";
import type { RuleState } from "@/lib/automations";

const fmtWhen = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "never";

// Scheduled rules carry a single "N days" config — either daysBefore (pre-release
// campaign) or daysAfter (post-release wrap-up). Pick the field the rule uses so
// the editor shows the right label/bounds and patches the right key.
const dayCfg = (config: Record<string, unknown>) => {
  if ("daysAfter" in config) {
    const n = Number(config.daysAfter);
    return { field: "daysAfter" as const, value: Number.isFinite(n) ? n : 3, max: 30, label: "days after the release date" };
  }
  const n = Number(config.daysBefore);
  return { field: "daysBefore" as const, value: Number.isFinite(n) ? n : 21, max: 90, label: "days before the release date" };
};

export default function AdminAutomationsClient({ initialRules }: { initialRules: RuleState[] }) {
  const toast = useToast();
  const router = useRouter();
  const [rules, setRules] = useState<RuleState[]>(initialRules);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);

  // Re-sync when the server re-renders (e.g. after "Run now" → router.refresh()),
  // so firedCount / lastRunAt reflect the latest sweep. Toggles reconcile via the
  // PATCH response and don't call refresh, so this won't clobber in-flight edits.
  useEffect(() => {
    setRules(initialRules);
  }, [initialRules]);

  const hasScheduled = rules.some((r) => r.kind === "scheduled");
  const enabledCount = rules.filter((r) => r.enabled).length;

  const patchRule = async (
    key: string,
    patch: { enabled?: boolean; config?: Record<string, unknown> }
  ) => {
    const prev = rules;
    setPending((p) => new Set(p).add(key));
    setRules((rs) =>
      rs.map((r) =>
        r.key === key
          ? {
              ...r,
              ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
              ...(patch.config ? { config: { ...r.config, ...patch.config } } : {}),
            }
          : r
      )
    );
    try {
      const res = await fetch(`/api/automations/${key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json().catch(() => ({}))) as { enabled?: boolean; config?: Record<string, unknown> };
      if (!res.ok) throw new Error();
      setRules((rs) =>
        rs.map((r) =>
          r.key === key ? { ...r, enabled: j.enabled ?? r.enabled, config: j.config ?? r.config } : r
        )
      );
    } catch {
      toast.error("Failed to update automation");
      setRules(prev);
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(key);
        return n;
      });
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/automations/run", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { created?: number };
      if (!res.ok) throw new Error();
      const n = j.created ?? 0;
      toast.success(n > 0 ? `Created ${n} task${n === 1 ? "" : "s"}` : "No new tasks — everything's up to date");
      router.refresh();
    } catch {
      toast.error("Failed to run automations");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Automations"
        description="Rules that turn events into tasks so the ops run themselves. Toggle each on or off — nothing fires while it's off."
        actions={
          hasScheduled ? (
            <Button variant="outline" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run scheduled now
            </Button>
          ) : null
        }
      />

      <p className="mb-4 text-sm text-muted-foreground">
        {enabledCount} of {rules.length} active.
        {hasScheduled ? " Event rules fire automatically; scheduled rules run when you press Run scheduled now." : ""}
      </p>

      <div className="flex flex-col gap-3">
        {rules.map((r) => {
          const busy = pending.has(r.key);
          return (
            <div key={r.key} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <Badge variant={r.kind === "event" ? "muted" : "outline"}>
                      {r.kind === "event" ? "Event" : "Scheduled"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{r.creates}</span>
                    <span className="text-border" aria-hidden>·</span>
                    <span>{r.firedCount} created so far</span>
                    {r.kind === "scheduled" ? (
                      <>
                        <span className="text-border" aria-hidden>·</span>
                        <span>last run {fmtWhen(r.lastRunAt)}</span>
                      </>
                    ) : null}
                  </div>

                  {r.kind === "scheduled" && r.enabled ? (() => {
                    const cfg = dayCfg(r.config);
                    return (
                      <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                        Trigger
                        <input
                          key={`days-${cfg.field}-${cfg.value}`}
                          type="number"
                          min={1}
                          max={cfg.max}
                          defaultValue={cfg.value}
                          disabled={busy}
                          aria-label={cfg.label}
                          onBlur={(e) => {
                            const v = Math.min(cfg.max, Math.max(1, Math.round(Number(e.target.value) || cfg.value)));
                            e.target.value = String(v);
                            if (v !== cfg.value) patchRule(r.key, { config: { [cfg.field]: v } });
                          }}
                          className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
                        />
                        {cfg.label}
                      </label>
                    );
                  })() : null}
                </div>

                {/* Enable / disable toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.enabled}
                  aria-label={`${r.enabled ? "Disable" : "Enable"} ${r.name}`}
                  disabled={busy}
                  onClick={() => patchRule(r.key, { enabled: !r.enabled })}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                    r.enabled ? "bg-emerald-500" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                      r.enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                  {busy ? (
                    <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-black/60" />
                  ) : null}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
