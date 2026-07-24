"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useUnsavedChangesContext } from "@/hooks/unsaved-changes-context";

// Friendly labels for known admin path segments. Mongo ObjectId segments (24 hex
// chars) are shown generically since resolving names needs data we don't have here.
const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  "site-content": "Site content",
  budgets: "Budgets",
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

// Singular detail segments (/admin/release/<id>, /admin/artist/<id>) have no index
// page at their own path — the list lives at the PLURAL route. Point their crumb
// link at the list so it doesn't 404 on the missing /admin/release index.
const SEGMENT_HREF_OVERRIDES: Record<string, string> = {
  release: "/admin/releases",
  artist: "/admin/artists",
};

// Sub-views that live at a top-level route but belong under a primary section in
// the nav (reached via the in-page tab strip). Their flat path doesn't reflect
// that nesting, so give them an explicit "Admin › <Parent> › <Leaf>" trail that
// matches the sidebar. Keep in sync with SectionTabs. (Subscribers / Templates /
// Automations now nest under their parent in the URL too — /admin/newsletter/…,
// /admin/tasks/… — so the generic trail already reads correctly for them.)
const SUBVIEW_TRAIL: Record<string, { parentLabel: string; parentHref: string; label: string }> = {
  "/admin/pipeline": { parentLabel: "Releases", parentHref: "/admin/releases", label: "Pipeline" },
  "/admin/timeline": { parentLabel: "Releases", parentHref: "/admin/releases", label: "Timeline" },
};

const isId = (seg: string) => /^[0-9a-f]{24}$/i.test(seg);

// Resolved entity names for id-bearing trails, kept for the session so a name
// is fetched once per release/artist, not on every navigation.
const entityNameCache = new Map<string, string>();

/**
 * The display name of the release/artist an admin path points at, so its crumb
 * can read "Admin › Releases › Solar Flares" instead of a generic "Edit". This
 * matters most mid-creation: the New page hands off to the draft's edit URL
 * after step 1, and a crumb that flips from "New" to "Edit" reads as the flow
 * unexpectedly changing mode — the release's own name reads as a progression.
 * Returns null until resolved (callers fall back to "Edit").
 */
function useEntityName(kind: "releases" | "artists" | null, id: string | null): string | null {
  const cached = id ? entityNameCache.get(id) ?? null : null;
  const [, setResolved] = useState(0);
  useEffect(() => {
    if (!kind || !id || entityNameCache.has(id)) return;
    let alive = true;
    fetch(`/api/${kind}/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const name = typeof d?.name === "string" ? d.name.trim() : "";
        if (alive && name) {
          entityNameCache.set(id, name);
          setResolved((n) => n + 1);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kind, id]);
  if (!cached) return null;
  // Crumbs sit in the topbar — keep a runaway release title from eating it.
  return cached.length > 32 ? `${cached.slice(0, 31)}…` : cached;
}

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
  const raw = pathname.split("/").filter(Boolean); // e.g. ["admin","releases"]

  // Special case: the ISNI guide (/admin/guides/isni). It's reached from the
  // artist editor's "Claim ISNI" links, which pass ?artist=<id> to keep context.
  // The generic trail would read "Admin › Guides › Isni" with a "Guides" crumb
  // that 404s (there's no /admin/guides index). Render the artist flow instead —
  // "Admin › Artists › Edit › ISNI" — with Edit linking back to that artist's
  // editor (dropped when there's no artist context, e.g. from the create form).
  const isIsniGuide = pathname === "/admin/guides/isni";

  // The one release/artist id this trail points at (admin paths carry at most
  // one), so its crumb can be labelled with the entity's name.
  let entityKind: "releases" | "artists" | null = null;
  let entityId: string | null = null;
  for (let i = 1; i < raw.length; i++) {
    const seg = raw[i] ?? "";
    if (!isId(seg)) continue;
    const prev = raw[i - 1];
    if (prev === "releases" || prev === "release") { entityKind = "releases"; entityId = seg; }
    else if (prev === "artists" || prev === "artist") { entityKind = "artists"; entityId = seg; }
    break;
  }
  if (!entityId && isIsniGuide) {
    const a = searchParams.get("artist");
    if (a && isId(a)) { entityKind = "artists"; entityId = a; }
  }
  const entityName = useEntityName(entityKind, entityId);

  if (raw.length === 0) return null;

  let crumbs: Crumb[];

  // Special case: the singular detail/VIEW page — /admin/{release|artist}/<id>
  // (e.g. the "View release" button from the editor). Its path has no "edit"
  // segment, so the generic trail would read "Admin › Releases › Details" and
  // lose the edit→view flow + the way back to the editor. Render an explicit
  // "Admin › Releases › Edit › View" so the context and backward navigation are
  // clear, with Edit linking to this item's editor.
  const isDetailView =
    raw.length === 3 &&
    raw[0] === "admin" &&
    (raw[1] === "release" || raw[1] === "artist") &&
    isId(raw[2] ?? "");

  const subview = SUBVIEW_TRAIL[pathname];

  if (subview) {
    crumbs = [
      { label: "Admin", href: "/admin", isLast: false },
      { label: subview.parentLabel, href: subview.parentHref, isLast: false },
      { label: subview.label, href: pathname, isLast: true },
    ];
  } else if (isIsniGuide) {
    const artistId = searchParams.get("artist");
    crumbs = [
      { label: "Admin", href: "/admin", isLast: false },
      { label: "Artists", href: "/admin/artists", isLast: false },
      ...(artistId && isId(artistId)
        ? [{ label: entityName ?? "Edit", href: `/admin/artists/${artistId}/edit`, isLast: false }]
        : []),
      { label: "ISNI", href: pathname, isLast: true },
    ];
  } else if (isDetailView) {
    const kind = raw[1]; // "release" | "artist"
    const id = raw[2];
    const plural = `${kind}s`; // releases | artists
    crumbs = [
      { label: "Admin", href: "/admin", isLast: false },
      { label: kind === "release" ? "Releases" : "Artists", href: `/admin/${plural}`, isLast: false },
      { label: entityName ?? "Edit", href: `/admin/${plural}/${id}/edit`, isLast: false },
      { label: "View", href: pathname, isLast: true },
    ];
  } else {
    const kept = raw
      .map((seg, i) => ({ seg, i }))
      .filter(({ seg, i }) => {
        // An id segment immediately before "edit" is redundant: the bare-id URL only
        // redirects into the editor, so the crumb would link back to the same Edit
        // page. Drop it so the trail reads "Admin › Releases › Edit" instead of the
        // confusing "Admin › Releases › Details › Edit".
        if (isId(seg) && raw[i + 1] === "edit") return false;
        return true;
      });

    crumbs = kept.map(({ seg, i }, idx) => {
      let label = labelFor(seg);
      // Rebuild hrefs from the original path, except for singular detail segments
      // that have no index page of their own (→ their plural list route).
      let href = SEGMENT_HREF_OVERRIDES[seg] ?? "/" + raw.slice(0, i + 1).join("/");
      // An id directly under the plural list (e.g. /admin/releases/<id>/tracks): the
      // bare-id route only redirects to the editor, so label it with the entity's
      // NAME (fallback "Edit" until it resolves) and link straight there — clearer
      // than "Details", and consistent with the editor being where you return.
      if (isId(seg) && (raw[i - 1] === "releases" || raw[i - 1] === "artists")) {
        label = entityName ?? "Edit";
        href = "/" + raw.slice(0, i + 1).join("/") + "/edit";
      }
      // The editor leaf itself (/admin/releases/<id>/edit — its id segment was
      // dropped above): name it after the entity too. This is what keeps the
      // create flow coherent — the New page hands off to the draft's edit URL
      // after step 1, and "Admin › Releases › <the name you just typed>" reads
      // as the same flow continuing, where a sudden "Edit" read as a mode change.
      if (seg === "edit" && isId(raw[i - 1] ?? "") && (raw[i - 2] === "releases" || raw[i - 2] === "artists")) {
        label = entityName ?? "Edit";
      }
      return { label, href, isLast: idx === kept.length - 1 };
    });
  }

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 overflow-hidden text-sm">
        {crumbs.map((c, idx) => {
          // On a narrow topbar the whole trail can't fit, and shrinking every crumb
          // equally turns it into an unreadable "Ad… › Outre… › Pitc… › E…". Instead
          // keep only the current page and its immediate parent on mobile — enough to
          // know where you are and step back — and restore the full trail at ≥sm,
          // where the header has room. Ancestors never truncate; only the (usually
          // short) current-page crumb may, as a safety for long names.
          const hideOnMobile = idx < crumbs.length - 2;
          // Key by index, not href: some trails legitimately repeat an href, and
          // duplicate React keys corrupt reconciliation — leaving stale crumb nodes
          // behind across navigations. The trail is fully re-derived from the
          // pathname each render, so the index is a stable, collision-free key.
          return (
            <li
              key={idx}
              className={`flex items-center gap-1.5 ${c.isLast ? "min-w-0" : "shrink-0"} ${hideOnMobile ? "hidden sm:flex" : ""}`}
            >
              {c.isLast ? (
                <span className="truncate font-medium text-foreground" aria-current="page">
                  {c.label}
                </span>
              ) : (
                <>
                  <Link
                    href={c.href}
                    onClick={onLinkClick}
                    className="whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {c.label}
                  </Link>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
