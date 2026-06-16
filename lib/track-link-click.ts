export type LinkContext = "release" | "artist" | "track";

/**
 * Fire-and-forget beacon recording an outbound streaming/social link click, for
 * click-through analytics. Uses sendBeacon so it survives the page unloading when
 * the link opens. Silently no-ops without a contextId or on any error — it must
 * never block the user's navigation.
 */
export function trackLinkClick(
  context: LinkContext,
  contextId: string | null | undefined,
  linkType: string,
  contextName?: string | null
): void {
  if (!contextId) return;
  try {
    const body = JSON.stringify({ context, contextId, linkType, contextName: contextName ?? null });
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        "/api/analytics/link-click",
        new Blob([body], { type: "application/json" })
      );
    } else {
      fetch("/api/analytics/link-click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* never block navigation */
  }
}
