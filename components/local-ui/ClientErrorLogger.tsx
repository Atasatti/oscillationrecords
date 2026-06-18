"use client";

import { useEffect } from "react";

/**
 * Captures uncaught client-side errors and unhandled promise rejections and
 * reports them to /api/error-log (where they're de-duplicated and surfaced in
 * the admin "Errors" page). Self-throttled so a tight error loop can't spam the
 * endpoint. Renders nothing.
 */
export default function ClientErrorLogger() {
  useEffect(() => {
    let last = 0;

    const send = (message: string, stack?: string) => {
      if (!message) return;
      const now = Date.now();
      if (now - last < 1000) return; // throttle: at most ~1/sec from this tab
      last = now;
      try {
        const body = JSON.stringify({
          message: String(message).slice(0, 2000),
          stack: stack ? String(stack).slice(0, 8000) : undefined,
          path: window.location.pathname,
        });
        // keepalive so the report survives a navigation/unload.
        fetch("/api/error-log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    };

    const onError = (e: ErrorEvent) => send(e.message || "Script error", e.error?.stack);
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string | undefined;
      const message =
        typeof r === "string" ? r : r?.message || "Unhandled promise rejection";
      const stack = typeof r === "object" ? r?.stack : undefined;
      send(message, stack);
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
