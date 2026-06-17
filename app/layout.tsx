import type { Metadata } from "next";
import { Inter, Lato } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { MusicProvider } from "@/contexts/music-context";
import { MusicPlayer } from "@/components/local-ui/MusicPlayer";
import UserDemographicsCollector from "@/components/user/UserDemographicsCollector";
import CookieConsent from "@/components/local-ui/CookieConsent";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

// Load all weights by omitting `weight`
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["100", "300", "400", "700", "900"], // All available weights
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: "A Record Label That Puts Artists First",
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: "A Record Label That Puts Artists First",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "A Record Label That Puts Artists First",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${lato.variable} antialiased dark`}>
        <SessionProvider>
          <MusicProvider>
            {children}
            <MusicPlayer />
            <UserDemographicsCollector />
            <CookieConsent />
          </MusicProvider>
        </SessionProvider>
      </body>
    </html>
  );
}