import Navbar from "@/components/local-ui/Navbar";
import Footer from "@/components/local-ui/Footer";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      {/* WCAG 2.4.1 bypass block: first focusable element, hidden until focused,
          lets keyboard/AT users jump past the nav straight to the content. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[9999] focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-black"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main" tabIndex={-1}>{children}</main>
      <Footer />
    </div>
  );
}
