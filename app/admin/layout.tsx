import { ToastProvider } from "@/components/local-ui/Toast";
import AdminShell from "@/components/admin/shell/AdminShell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <AdminShell>{children}</AdminShell>
    </ToastProvider>
  );
}
