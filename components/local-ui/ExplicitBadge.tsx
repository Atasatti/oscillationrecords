import React from "react";

type Props = {
  className?: string;
  /** `sm` = cards; `md` = player; `lg` = admin titles; `xl` = large public release title */
  size?: "sm" | "md" | "lg" | "xl";
};

/** Parental advisory — high-contrast red “E” (common streaming convention). */
export default function ExplicitBadge({ className = "", size = "sm" }: Props) {
  const sizeClasses =
    size === "xl"
      ? "min-h-9 min-w-9 px-2 text-lg"
      : size === "lg"
        ? "min-h-8 min-w-8 px-1.5 text-base"
        : size === "md"
          ? "min-h-[1.35rem] min-w-[1.35rem] px-1 text-[11px]"
          : "min-h-[1.25rem] min-w-[1.25rem] px-[5px] text-[11px]";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded font-bold leading-none text-white ${sizeClasses} border-2 border-red-400 bg-red-600 shadow-[0_0_0_1px_rgba(0,0,0,0.35),0_2px_10px_rgba(220,38,38,0.55)] ring-1 ring-red-300/40 ${className}`}
      aria-label="Explicit"
      title="Explicit content"
    >
      E
    </span>
  );
}
