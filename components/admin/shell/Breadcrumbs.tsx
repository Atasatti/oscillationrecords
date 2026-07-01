"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import React from "react";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";

// Friendly labels for known admin path segments. Mongo ObjectId segments (24 hex
// chars) are shown generically since resolving names needs data we don't have here.
const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  catalog: "Homepage",
  // Singular detail segments are labelled plural too — their crumb links to the
  // list page (see SEGMENT_HREF_OVERRIDES), so "Admin › Releases › Details" reads
  // consistently with where the link goes.
  artist: "Artists",
  artists: "Artists",
  release: "Releases",
  releases: "Releases",
  album: "Album",
  ep: "EP",
  single: "Single",
  create: "Create",
  edit: "Edit",
  "new": "New",
  settings: "Settings",
};

// Singular detail segments (e.g. /admin/catalog/release/<id>) have no index page
// at their own path — the list lives at the PLURAL route. Point their crumb link
// at the list so it doesn't 404 on the missing /admin/catalog/release path.
const SEGMENT_HREF_OVERRIDES: Record<string, string> = {
  release: "/admin/catalog/releases",
  artist: "/admin/catalog/artists",
};

const isId = (seg: string) => /^[0-9a-f]{24}$/i.test(seg);

function labelFor(seg: string) {
  if (SEGMENT_LABELS[seg]) return SEGMENT_LABELS[seg];
  if (isId(seg)) return "Details";
  return seg.charAt(0).toUpperCase() + seg.slice(1);
}

type Crumb = { label: string; href: string; isLast: boolean };

export default function Breadcrumbs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Breadcrumbs are the primary way back out of editors, so they must honour the
  // unsaved-changes guard the same way the sidebar does — a plain <Link> would
  // otherwise silently discard edits when navigating away.
  const guard = useUnsavedChangesContext();
  const onLinkClick = (e: React.MouseEvent) => {
    if (guard && !guard.confirmNavigation()) e.preventDefault();
  };
  // "catalog" is a routing group, not a place users navigate to (except when it
  // IS the page — the Homepage hub). Drop it from the trail unless it's the leaf,
  // so /admin/catalog/releases reads "Admin › Releases", not "Admin › Homepage › …".
  const raw = pathname.split("/").filter(Boolean); // e.g. ["admin","catalog","releases"]
  if (raw.length === 0) return null;

  let crumbs: Crumb[];

  // Special case: the ISNI guide (/admin/guides/isni). It's reached from the
  // artist editor's "Claim ISNI" links, which pass ?artist=<id> to keep context.
  // The generic trail would read "Admin › Guides › Isni" with a "Guides" crumb
  // that 404s (there's no /admin/guides index). Render the artist flow instead —
  // "Admin › Artists › Edit › ISNI" — with Edit linking back to that artist's
  // editor (dropped when there's no artist context, e.g. from the create form).
  const isIsniGuide = pathname === "/admin/guides/isni";

  // Special case: the singular detail/VIEW page — /admin/catalog/{release|artist}/<id>
  // (e.g. the "View release" button from the editor). Its path has no "edit"
  // segment, so the generic trail would read "Admin › Releases › Details" and
  // lose the edit→view flow + the way back to the editor. Render an explicit
  // "Admin › Releases › Edit › View" so the context and backward navigation are
  // clear, with Edit linking to this item's editor.
  const isDetailView =
    raw.length === 4 &&
    raw[0] === "admin" &&
    raw[1] === "catalog" &&
    (raw[2] === "release" || raw[2] === "artist") &&
    isId(raw[3]);

  if (isIsniGuide) {
    const artistId = searchParams.get("artist");
    crumbs = [
      { label: "Admin", href: "/admin", isLast: false },
      { label: "Artists", href: "/admin/catalog/artists", isLast: false },
      ...(artistId && isId(artistId)
        ? [{ label: "Edit", href: `/admin/catalog/artists/${artistId}/edit`, isLast: false }]
        : []),
      { label: "ISNI", href: pathname, isLast: true },
    ];
  } else if (isDetailView) {
    const kind = raw[2]; // "release" | "artist"
    const id = raw[3];
    const plural = `${kind}s`; // releases | artists
    crumbs = [
      { label: "Admin", href: "/admin", isLast: false },
      { label: kind === "release" ? "Releases" : "Artists", href: `/admin/catalog/${plural}`, isLast: false },
      { label: "Edit", href: `/admin/catalog/${plural}/${id}/edit`, isLast: false },
      { label: "View", href: pathname, isLast: true },
    ];
  } else {
    const kept = raw
      .map((seg, i) => ({ seg, i }))
      .filter(({ seg, i }) => {
        // "catalog" is a routing group, not a place users navigate to (except when
        // it IS the leaf — the Homepage hub). Drop it otherwise.
        if (seg === "catalog" && i !== raw.length - 1) return false;
        // An id segment immediately before "edit" is redundant: the bare-id URL only
        // redirects into the editor, so the crumb would link back to the same Edit
        // page. Drop it so the trail reads "Admin › Releases › Edit" instead of the
        // confusing "Admin › Releases › Details › Edit".
        if (isId(seg) && raw[i + 1] === "edit") return false;
        return true;
      });

    crumbs = kept.map(({ seg, i }, idx) => {
      let label = labelFor(seg);
      // Rebuild hrefs from the original path so dropped segments stay in the URL,
      // except for singular detail segments that have no index page (→ list route).
      let href = SEGMENT_HREF_OVERRIDES[seg] ?? "/" + raw.slice(0, i + 1).join("/");
      // An id directly under the plural list (e.g. /admin/catalog/releases/<id>/tracks):
      // the bare-id route only redirects to the editor, so label it "Edit" and link
      // straight there — clearer than "Details", and consistent with the editor
      // being where you return for that release.
      if (isId(seg) && (raw[i - 1] === "releases" || raw[i - 1] === "artists")) {
        label = "Edit";
        href = "/" + raw.slice(0, i + 1).join("/") + "/edit";
      }
      return { label, href, isLast: idx === kept.length - 1 };
    });
  }

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
                  onClick={onLinkClick}
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
