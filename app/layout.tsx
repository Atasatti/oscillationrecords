import type { Metadata } from "next";
import { Inter, Lato } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { MusicProvider } from "@/contexts/music-context";
import { MusicPlayer } from "@/components/local-ui/MusicPlayer";
import UserDemographicsCollector from "@/components/user/UserDemographicsCollector";
import CookieConsent from "@/components/local-ui/CookieConsent";
import PageViewTracker from "@/components/local-ui/PageViewTracker";
import GoogleAnalytics from "@/components/local-ui/GoogleAnalytics";
import ClientErrorLogger from "@/components/local-ui/ClientErrorLogger";
import NewsletterPrompt from "@/components/local-ui/NewsletterPrompt";
import { SITE_URL, SITE_NAME } from "@/lib/seo";

// Load all weights by omitting `weight`
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

// Only the weights actually used (light 300 for body, regular 400, bold 700).
// Was 100/300/400/700/900 — each non-variable weight is its own preloaded
// woff2, so trimming the two unused extremes drops 2 render-blocking font
// preloads at first paint. (100 had no usages; 900 was only the ExplicitBadge,
// now font-bold.)
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
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
    images: [{ url: "/og-default.png", width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: "A Record Label That Puts Artists First",
    images: ["/og-default.png"],
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
            <PageViewTracker />
            <GoogleAnalytics />
            <ClientErrorLogger />
            <NewsletterPrompt />
          </MusicProvider>
        </SessionProvider>
      </body>
    </html>
  );
}