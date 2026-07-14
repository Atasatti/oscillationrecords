import { getRuleStates } from "@/lib/automations";
import AdminAutomationsClient from "./AdminAutomationsClient";

// Middleware gates /admin/tasks/automations to outreach:write, so this only runs for
// staff who can manage automations. This render is read-only — scheduled rules
// fire via the explicit POST /api/automations/run ("Run scheduled now", or a
// cron), never as a side effect of loading the page.
export const dynamic = "force-dynamic";

export default async function AdminAutomationsPage() {
  const rules = await getRuleStates().catch(() => []);
  return <AdminAutomationsClient initialRules={rules} />;
}
