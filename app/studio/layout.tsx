import { ToastProvider } from "@/components/local-ui/Toast";

export const dynamic = "force-dynamic";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-8 text-white">{children}</main>
    </ToastProvider>
  );
}
