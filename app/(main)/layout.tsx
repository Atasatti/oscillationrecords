import Navbar from "@/components/local-ui/Navbar";
import Footer from "@/components/local-ui/Footer";
import CookieConsent from "@/components/local-ui/CookieConsent";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div>
      <Navbar />
      {children}
      <Footer />
      <CookieConsent />
    </div>
  );
}
