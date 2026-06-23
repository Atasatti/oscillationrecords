"use client";
import { Info } from "lucide-react";

/**
 * Small inline "ⓘ" with a hover/long-press tooltip (native title). Lightweight
 * help for column headers, toggles and labels whose purpose isn't obvious.
 */
export default function InfoHint({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span
      title={text}
      tabIndex={0}
      role="img"
      aria-label={text}
      className={`inline-flex cursor-help text-muted-foreground/70 hover:text-foreground ${className}`}
    >
      <Info className="h-3.5 w-3.5" />
    </span>
  );
}
