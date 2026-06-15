"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import React from "react";

// Friendly labels for known admin path segments. Mongo ObjectId segments (24 hex
// chars) are shown generically since resolving names needs data we don't have here.
const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  catalog: "Catalog",
  artist: "Artist",
  artists: "Artists",
  release: "Release",
  releases: "Releases",
  album: "Album",
  ep: "EP",
  single: "Single",
  create: "Create",
  edit: "Edit",
  "new": "New",
  settings: "Settings",
};

const isId = (seg: string) => /^[0-9a-f]{24}$/i.test(seg);

function labelFor(seg: string) {
  if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg];
  if (isId(seg)) return "Details";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean); // e.g. ["admin","catalog","artist","<id>"]

  if (segments.length === 0) return null;

  const crumbs = segments.map((seg, i) => ({
    label: labelFor(seg),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1.5 text-sm">
        {crumbs.map((c) => (
          <li key={c.href} className="flex items-center gap-1.5 min-w-0">
            {c.isLast ? (
              <span className="truncate font-medium text-foreground" aria-current="page">
                {c.label}
              </span>
            ) : (
              <>
                <Link
                  href={c.href}
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {c.label}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
