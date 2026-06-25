import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// AI / generative-search crawlers we deliberately welcome, so the site is
// eligible to be read, grounded and CITED by these engines (the goal of GEO —
// generative-engine optimisation). Listing them explicitly — including the
// "Extended" tokens that ONLY govern AI use (Google-Extended → Gemini/Vertex,
// Applebot-Extended → Apple Intelligence) — documents the choice so a future
// robots edit can't silently lock us out of AI answers. Same policy as `*`.
const AI_CRAWLERS = [
  "GPTBot", // OpenAI training
  "OAI-SearchBot", // ChatGPT search index
  "ChatGPT-User", // ChatGPT live fetch (user-triggered)
  "PerplexityBot", // Perplexity index
  "Perplexity-User", // Perplexity live fetch
  "ClaudeBot", // Anthropic crawler
  "Claude-User", // Claude live fetch
  "anthropic-ai",
  "Google-Extended", // Gemini / Vertex grounding
  "Applebot-Extended", // Apple Intelligence
  "CCBot", // Common Crawl (feeds many LLMs)
  "Amazonbot",
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  // Keep the admin surface and API out of every crawler's index.
  const disallow = ["/admin", "/api"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: AI_CRAWLERS, allow: "/", disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
