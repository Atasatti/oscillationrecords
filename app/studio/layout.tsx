import { ToastProvider } from "@/components/local-ui/Toast";

export const dynamic = "force-dynamic";

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      {/* Fixed-height app shell: the page itself never scrolls; the calendar fills
          and compresses to fit, and any inner list (agenda) scrolls within. */}
      <main className="mx-auto flex h-[100dvh] w-full max-w-6xl flex-col overflow-hidden px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white">{children}</main>
    </ToastProvider>
  );
}
