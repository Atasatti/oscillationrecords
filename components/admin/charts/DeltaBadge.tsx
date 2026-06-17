"use client";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

/**
 * Period-over-period change chip. Green = up, red = down, muted = flat/no baseline.
 * Set `invert` when a decrease is good (not used yet, kept for reuse).
 */
export default function DeltaBadge({
  current,
  previous,
  invert = false,
  className = "",
}: {
  current: number;
  previous: number;
  invert?: boolean;
  className?: string;
}) {
  if (previous === 0 && current === 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs text-muted-foreground ${className}`}>
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }
  if (previous === 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs text-emerald-400 ${className}`}>
        <ArrowUpRight className="h-3 w-3" /> New
      </span>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  const flat = Math.abs(pct) < 0.5;
  const color = flat
    ? "text-muted-foreground"
    : good
      ? "text-emerald-400"
      : "text-red-400";
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs ${color} ${className}`}
      title="vs previous period"
    >
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%
    </span>
  );
}
