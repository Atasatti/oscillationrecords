"use client";

import React from "react";

/**
 * The one segmented-control primitive for the admin — used for view switchers
 * (List / Board / Calendar) and status/type filters across every list page, so
 * they all read as the same tab language. A bordered track with a filled active
 * pill; an optional muted count per option; an "attention" variant for the amber
 * needs-attention toggle.
 */
export type SegOption<T extends string> = {
  key: T;
  label: React.ReactNode;
  count?: number;
  /** Override the active fill (e.g. a status colour). Defaults to white/10. */
  activeClass?: string;
};

export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = "default",
  ariaLabel,
  className = "",
}: {
  options: readonly SegOption<T>[];
  value: T;
  onChange: (key: T) => void;
  variant?: "default" | "attention";
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center rounded-lg border border-border bg-card p-0.5 ${className}`}
    >
      {options.map((o) => {
        const active = o.key === value;
        const activeFill =
          o.activeClass ??
          (variant === "attention" ? "bg-amber-500/15 text-amber-300" : "bg-white/10 text-foreground");
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              active ? activeFill : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
            {o.count !== undefined ? (
              <span className={`text-xs tabular-nums ${active ? "text-muted-foreground" : "text-muted-foreground/70"}`}>
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
