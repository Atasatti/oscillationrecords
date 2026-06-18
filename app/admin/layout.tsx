import { ToastProvider } from "@/components/local-ui/Toast";
import { UnsavedChangesProvider } from "@/hooks/unsaved-changes-context";
import AdminShell from "@/components/admin/shell/AdminShell";

// Render the admin area dynamically so the per-request CSP nonce (set in
// middleware) is applied to the scripts on these pages.
export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <UnsavedChangesProvider>
        <AdminShell>{children}</AdminShell>
      </UnsavedChangesProvider>
    </ToastProvider>
  );
}
