// Shared auth for cron-triggerable endpoints (scheduled newsletter sends, the
// daily digest). An external scheduler (Vercel Cron, GitHub Action, cron-job.org)
// presents the CRON_SECRET; without it, only a session with the right permission
// can trigger the endpoint. Returns false when no secret is configured, so a
// forgotten env can never silently allow unauthenticated triggers.
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get("authorization") || request.headers.get("x-cron-secret") || "";
  return header === `Bearer ${secret}` || header === secret;
}
