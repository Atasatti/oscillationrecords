import React from "react";

/**
 * Consistent admin page header: title + optional description on the left, and an
 * optional actions slot (buttons) on the right. Replaces the ad-hoc centered
 * hero headers each admin page used to roll its own.
 */
export default function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-8">
      <div className="min-w-0">
        {/* Brand fluid type scale (BRAND.md §5): clamp()-based, light + tight. */}
        <h1 className="font-light leading-tight tracking-tighter text-[length:var(--text-h2)]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
