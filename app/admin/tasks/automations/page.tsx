import { getRuleStates } from "@/lib/automations";
import { requirePagePermission } from "@/lib/page-guard";
import AdminAutomationsClient from "./AdminAutomationsClient";

// Middleware gates /admin/tasks/automations to outreach:write, but only against
// the 30-day token's cached role — hence the revocation-aware re-check below,
// which reads the CURRENT role. This render is read-only: scheduled rules fire
// via the explicit POST /api/automations/run ("Run scheduled now", or a cron),
// never as a side effect of loading the page.
export const dynamic = "force-dynamic";

export default async function AdminAutomationsPage() {
  await requirePagePermission("outreach:write");

  const rules = await getRuleStates().catch(() => []);
  return <AdminAutomationsClient initialRules={rules} />;
}
