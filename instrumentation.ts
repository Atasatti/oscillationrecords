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
    // Dedicated ingest secret only — never NEXTAUTH_SECRET (that would ship the
    // session-signing key in a plaintext header). If unset, reports are sent
    // without the header and the ingest endpoint treats them as rate-limited
    // client reports, which is the safe default.
    secret: process.env.ERROR_LOG_INGEST_SECRET,
  };
}

/**
 * True for the "the client went away" family of errors — a browser navigating,
 * closing a tab, or cancelling a fetch while a request is still in flight.
 *
 * Node raises these on the server, and a long-lived Next server (dev, or a local
 * `next build && next start`) surfaces them as `uncaughtException`, which it logs
 * through console.error — so without this filter the patch below records them as
 * server errors. They aren't: nothing in the app failed, and the request was
 * already answered or abandoned by the only party that cared. Left in, one of
 * them sits permanently "Live" on the Errors page with a rising count, which is
 * exactly the noise this module exists to keep out.
 *
 * Deliberately narrow. A bare `Error: aborted` carrying ECONNRESET is Node's
 * request-teardown signature; an ECONNRESET while *we* call an upstream API
 * reads differently ("fetch failed", "socket hang up") and is still reported.
 */
export function isClientDisconnect(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ECONNRESET" && err.message === "aborted") return true;
  if (code === "ERR_STREAM_PREMATURE_CLOSE") return true;
  return false;
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

      // A client that navigated away mid-request is not an application error.
      if (isClientDisconnect(err)) return;

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
    // Same reasoning as the console patch: a cancelled request isn't a fault.
    if (isClientDisconnect(err)) return;
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
