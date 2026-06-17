"use client";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

/**
 * Period-over-period change chip. Monochrome per brand: a gain reads in white
 * (the accent), a drop in red (the only chromatic colour). No baseline → muted "—"
 * (avoids a misleading all-green "New" when there's no prior data).
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
  // No prior-period data to compare against — show a neutral marker, not "New".
  if (previous === 0) {
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs text-muted-foreground ${className}`} title="No prior-period data">
        <Minus className="h-3 w-3" /> —
      </span>
    );
  }

  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  const flat = Math.abs(pct) < 0.5;
  const good = invert ? !up : up;
  const color = flat ? "text-muted-foreground" : good ? "text-foreground" : "text-red-400";
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${color} ${className}`} title="vs previous period">
      <Icon className="h-3 w-3" />
      {Math.abs(pct).toFixed(pct >= 10 || pct <= -10 ? 0 : 1)}%
    </span>
  );
}
