import { NextRequest, NextResponse } from "next/server";
import type { JWT } from "next-auth/jwt";
import { requireStaff } from "@/lib/auth-guard";
import { isAdminToken } from "@/lib/auth-session";
import { recordAudit } from "@/lib/audit";
import { isCronAuthorized } from "@/lib/cron";
import { emailConfigured, isValidEmail, sendEmail } from "@/lib/email";
import { buildDigest } from "@/lib/digest";
import { getStaffDirectory } from "@/lib/staff-directory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FROM_NAME = "Oscillation Records";

// GET /api/admin/digest — preview the current digest (any staff).
export async function GET(request: NextRequest) {
  const guard = await requireStaff(request);
  if (!guard.ok) return guard.response;
  const digest = await buildDigest();
  return NextResponse.json(
    { subject: digest.subject, html: digest.html, isEmpty: digest.isEmpty, emailConfigured: emailConfigured() },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

// POST /api/admin/digest — send the digest.
//   { test: true }  → send only to the caller (any staff).
//   {}              → send to all staff (owner only, or a CRON_SECRET trigger).
export async function POST(request: NextRequest) {
  const cron = isCronAuthorized(request);
  let token: JWT | null = null;
  if (!cron) {
    const guard = await requireStaff(request);
    if (!guard.ok) return guard.response;
    token = guard.token;
  }

  if (!emailConfigured()) {
    return NextResponse.json(
      { error: "Email sending isn't configured yet. Add an email provider to send." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const test = body?.test === true && !cron;
  const digest = await buildDigest();

  // Test send → just the caller.
  if (test) {
    const to = token?.email;
    if (!isValidEmail(to)) {
      return NextResponse.json({ error: "Your account has no email address" }, { status: 400 });
    }
    const r = await sendEmail({ to, subject: digest.subject, html: digest.html, fromName: FROM_NAME });
    if (!r.ok) return NextResponse.json({ error: "Send failed" }, { status: 502 });
    return NextResponse.json({ ok: true, sent: 1, test: true });
  }

  // Send to all staff → owner only (a cron trigger is pre-authorized).
  if (!cron && !isAdminToken(token)) {
    return NextResponse.json({ error: "Only an owner can send to all staff" }, { status: 403 });
  }

  const staff = await getStaffDirectory().catch(() => []);
  const recipients = [...new Set(staff.map((s) => s.email).filter(isValidEmail))];
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < recipients.length; i += 10) {
    const batch = recipients.slice(i, i + 10);
    const results = await Promise.all(
      batch.map((to) => sendEmail({ to, subject: digest.subject, html: digest.html, fromName: FROM_NAME }))
    );
    for (const r of results) { if (r.ok) sent += 1; else failed += 1; }
  }

  if (token) {
    await recordAudit(request, token, {
      action: "create",
      resource: "digest",
      summary: `Sent the daily digest to ${sent}/${recipients.length} staff`,
      metadata: { sent, failed },
    });
  }
  return NextResponse.json({ ok: true, sent, failed, recipients: recipients.length });
}
