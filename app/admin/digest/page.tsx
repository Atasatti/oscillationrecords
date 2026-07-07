import { emailConfigured } from "@/lib/email";
import { buildDigest } from "@/lib/digest";
import { getStaffDirectory } from "@/lib/staff-directory";
import DigestClient from "./DigestClient";

export const dynamic = "force-dynamic";

export default async function DigestPage() {
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
