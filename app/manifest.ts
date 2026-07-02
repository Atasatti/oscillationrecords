import type { MetadataRoute } from "next";
import { SITE_NAME } from "@/lib/seo";

// Web app manifest — makes the site installable and gives Android/Chrome a proper
// name, icon and (dark) theme instead of generic browser chrome. Served at
// /manifest.webmanifest and linked automatically by Next.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "Oscillation",
    description: "An independent record label that puts artists first.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      // SVG scales to any requested size (satisfies the installability size rule);
      // the PNG is a raster fallback for engines that don't take SVG icons.
      { src: "/logo-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
