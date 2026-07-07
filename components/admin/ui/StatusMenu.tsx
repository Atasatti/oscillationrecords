"use client";

import { ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

/**
 * A status control shown as a coloured pill (dot + label + chevron) that opens a
 * clean dropdown — replaces the heavy native <select> in list rows. The active
 * pill colour comes from `pill`; each option carries its own dot colour.
 */
export type StatusItem<T extends string> = {
  key: T;
  label: string;
  /** Tailwind classes for the dot, e.g. "bg-sky-500". */
  dot: string;
  /** Tailwind classes for the active pill (border+bg+text). */
  pill?: string;
};

export default function StatusMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel = "Change status",
}: {
  value: T;
  options: readonly StatusItem<T>[];
  onChange: (key: T) => void;
  ariaLabel?: string;
}) {
  const cur = options.find((o) => o.key === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
            cur?.pill ?? "border-border bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cur?.dot ?? "bg-zinc-500"}`} />
          {cur?.label}
          <ChevronDown className="h-3 w-3 opacity-60" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[9.5rem]">
        {options.map((o) => (
          <DropdownMenuItem
            key={o.key}
            onClick={(e) => { e.stopPropagation(); onChange(o.key); }}
            className="cursor-pointer gap-2 text-sm"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${o.dot}`} />
            {o.label}
            {o.key === value ? <Check className="ml-auto h-3.5 w-3.5 opacity-70" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
