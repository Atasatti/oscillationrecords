import Link from "next/link";
import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/seo";

// Root 404 — the global fallback for any unmatched route outside the (main) group
// (which has its own not-found). Self-contained so it doesn't depend on the public
// nav/footer, and returns the correct 404 status with a noindex so stale/old URLs
// aren't indexed. Most 404s here are old catalog links, so we point back to the
// main sections rather than a dead end.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/releases", label: "Releases" },
  { href: "/artists", label: "Artists" },
  { href: "/press", label: "Press" },
];

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">404</p>
      <h1 className="mt-3 text-3xl font-light tracking-tighter sm:text-4xl">
        We couldn&rsquo;t find that page
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        The link may be out of date. Try one of these instead — or head back to the {SITE_NAME} home page.
      </p>
      <nav className="mt-8 flex flex-wrap items-center justify-center gap-3" aria-label="Suggested pages">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-full border border-white/15 px-4 py-2 text-sm text-gray-200 transition-colors hover:border-white/40 hover:text-white"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
