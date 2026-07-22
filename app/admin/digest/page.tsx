import { emailConfigured } from "@/lib/email";
import { buildDigest } from "@/lib/digest";
import { getStaffDirectory } from "@/lib/staff-directory";
import { requirePageStaff } from "@/lib/page-guard";
import DigestClient from "./DigestClient";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
  // Revocation-aware gate before building the digest (catalog + outreach summary)
  // and reading the staff directory — middleware only checks the 30-day token's
  // cached role. Staff-level, matching middleware's rule for this unmapped path.
  await requirePageStaff();

  let html = "";
  let isEmpty = true;
  let staffCount = 0;
  try {
    const [digest, staff] = await Promise.all([buildDigest(), getStaffDirectory().catch(() => [])]);
    html = digest.html;
    isEmpty = digest.isEmpty;
    staffCount = new Set(staff.map((s) => s.email).filter(Boolean)).size;
  } catch {
    // Render an empty preview on a transient error.
  }
  return <DigestClient html={html} isEmpty={isEmpty} staffCount={staffCount} emailConfigured={emailConfigured()} />;
}
