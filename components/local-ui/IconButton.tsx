"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import React from "react";
import classNames from "classnames";

interface IconButtonProps {
  text: string;
  onClick?: () => void;
  /** When set, the whole control is a Next.js link (preferred for navigation). */
  href?: string;
  className?: string;
  /** Disables the button variant (ignored when `href` is set). */
  disabled?: boolean;
  /** Button type — use "submit" to submit an enclosing form. Defaults to "button". */
  type?: "button" | "submit";
  /** Accessible label when the visible text isn't descriptive enough. */
  "aria-label"?: string;
}

const IconButton: React.FC<IconButtonProps> = ({
  text,
  onClick,
  href,
  className,
  disabled,
  type = "button",
  "aria-label": ariaLabel,
}) => {
  const shellClass = classNames(
    "inline-flex items-center bg-white rounded-full overflow-hidden shadow-md p-1.5 cursor-pointer transition-opacity hover:opacity-95",
    disabled && "opacity-60 pointer-events-none",
    className
  );

  const label = (
    <span className="px-3 font-semibold text-black !text-sm md:text-base uppercase">
      {text}
    </span>
  );

  // Arrow is purely visual — the click target is the whole pill (Link/button
  // below), so a span (not a nested button) keeps the entire control clickable
  // and the markup valid.
  const arrow = (
    <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-2xl bg-black text-white">
      <ArrowRight className="h-5 w-5" aria-hidden />
    </span>
  );

  // A real link when navigating: the whole pill is clickable and crawlable.
  if (href) {
    return (
      <Link href={href} className={shellClass}>
        {label}
        {arrow}
      </Link>
    );
  }

  // Otherwise a real button so the ENTIRE pill is clickable (and keyboard
  // accessible) — not just the arrow.
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={shellClass}
    >
      {label}
      {arrow}
    </button>
  );
};

export default IconButton;
