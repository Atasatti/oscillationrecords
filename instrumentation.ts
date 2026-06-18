/**
 * Next.js instrumentation — site-wide server error capture into the ErrorLog
 * table (admin "Errors" page). Two sources:
 *
 *   1. register(): patches console.error so the errors the app ALREADY logs in
 *      its route try/catch blocks (`console.error("…", error)`) are captured —
 *      this is where most real errors surface (they're caught, so they never
 *      reach onRequestError).
 *   2. onRequestError(): Next's hook for UNCAUGHT errors (RSC renders, server
 *      actions, edge/middleware, route throws that aren't caught).
 *
 * Both report via `fetch` to the internal ingest API (never Prisma directly —
 * instrumentation is bundled for the Edge runtime too, where Prisma can't run).
 * The ingest URL comes from a trusted env base only (never a spoofable Host).
 */

function ingestTarget(): { url: string; secret?: string } | null {
  const base = (
    process.env.ERROR_LOG_INGEST_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/+$/, "");
  if (!base) return null;
  return {
    url: `${base}/api/error-log`,
    secret: process.env.ERROR_LOG_INGEST_SECRET || process.env.NEXTAUTH_SECRET,
  };
}

function report(payload: {
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  digest?: string | null;
}): void {
  const t = ingestTarget();
  if (!t) return;
  fetch(t.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(t.secret ? { "x-error-source": t.secret } : {}),
    },
    body: JSON.stringify({ source: "server", ...payload }),
    keepalive: true,
  }).catch(() => {});
}

export async function register(): Promise<void> {
  // Only patch console in the Node.js runtime (edge has its own minimal console
  // and can't reach Prisma anyway; reporting still goes over fetch).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!ingestTarget()) return;

  const original = console.error.bind(console);
  let windowStart = 0;
  let windowCount = 0;

  console.error = (...args: unknown[]) => {
    original(...args); // preserve normal logging
    try {
      // Only capture console.error calls that carry a real Error object — the
      // app's route catches use `console.error("message:", error)`. This skips
      // plain string logs / warnings so the error log stays signal, not noise.
      const err = args.find((a): a is Error => a instanceof Error);
      if (!err) return;

      const prefix = args.filter((a): a is string => typeof a === "string").join(" ");
      const message = (prefix ? `${prefix} ` : "") + err.message;

      // Loop guard: never capture the logger's own failures.
      if (
        message.includes("recordError failed") ||
        message.includes("error-log ingest failed")
      ) {
        return;
      }

      // Throttle: cap reports per second so an error storm can't flood the
      // ingest endpoint (the server still de-dupes identical errors by count).
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        windowCount = 0;
      }
      if (windowCount >= 20) return;
      windowCount += 1;

      report({ message: message.slice(0, 2000), stack: err.stack ?? null });
    } catch {
      /* never throw from console.error */
    }
  };
}

export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string; headers?: Record<string, string> },
  context?: { routeType?: string }
): Promise<void> {
  try {
    const path = request?.path || "";
    // Don't report errors from the error-log endpoints themselves (loop guard).
    if (path.startsWith("/api/error-log") || path.startsWith("/api/admin/error-log")) {
      return;
    }
    const e = (err ?? {}) as { message?: string; stack?: string; digest?: string };
    report({
      message: e.message || "Server error",
      stack: e.stack ?? null,
      path,
      method: request?.method ?? null,
      digest: e.digest ?? null,
      statusCode: context?.routeType === "route" ? 500 : null,
    });
  } catch {
    /* never throw from the error hook */
  }
}
