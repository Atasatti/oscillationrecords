"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_PAGE_MEDIA,
  mergePageMedia,
  type PageMedia,
} from "@/lib/page-media-defaults";

// Module-level cache so the marketing pages fetch the editable images at most
// once per session, and instantly re-use them on subsequent mounts.
let cache: PageMedia | null = null;
let inflight: Promise<PageMedia> | null = null;

async function load(): Promise<PageMedia> {
  if (cache) return cache;
  if (!inflight) {
    inflight = fetch("/api/site-settings/page-media")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        cache = mergePageMedia(d);
        return cache;
      })
      .catch(() => {
        cache = { ...DEFAULT_PAGE_MEDIA };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Editable decorative images for the public pages. Returns the built-in
 * defaults immediately (so there's never a blank), then swaps to any admin
 * overrides once fetched. Falls back to defaults if the request fails.
 */
export function usePageMedia(): PageMedia {
  const [media, setMedia] = useState<PageMedia>(cache ?? DEFAULT_PAGE_MEDIA);
  useEffect(() => {
    let cancelled = false;
    load().then((m) => {
      if (!cancelled) setMedia(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return media;
}
