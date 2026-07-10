// Per-artist entity FAQ — the single source of truth for the visible Q&A on the
// artist page AND the matching FAQPage JSON-LD (Google requires the markup to
// mirror the visible text). Generated from the artist's own data so every artist
// gets a unique, standalone, quotable set of answers to the questions people — and
// AI assistants — actually ask: "who is X", "what genre", "where from", "what have
// they released". Pure data, so it's safe to import into a Server Component.
import { SITE_NAME, metaDescription } from "@/lib/seo";

type FaqArtist = {
  name: string;
  biography?: string | null;
  genres?: string[];
  city?: string | null;
  country?: string | null;
};

export type FaqItem = { question: string; answer: string };

export function buildArtistFaq(artist: FaqArtist, releaseNames: string[] = []): FaqItem[] {
  const name = artist.name;
  const genres = (artist.genres ?? []).map((g) => g.trim()).filter(Boolean);
  const city = artist.city?.trim() || null;
  const country = artist.country?.trim() || null;
  const releases = releaseNames.map((r) => r.trim()).filter(Boolean);
  const faq: FaqItem[] = [];

  // "Who is" — the real biography (Markdown-stripped + capped by metaDescription)
  // when present, else a factual sentence built from what we know. Always present.
  const bio = metaDescription(artist.biography, 300);
  faq.push({
    question: `Who is ${name}?`,
    answer:
      bio ||
      `${name} is an artist on ${SITE_NAME}, an independent UK record label${
        city ? `, based in ${city}` : ""
      }${genres.length ? `, making ${genres.slice(0, 3).join(", ")}` : ""}.`,
  });

  if (genres.length) {
    faq.push({
      question: `What genre is ${name}?`,
      answer: `${name} makes ${genres.slice(0, 4).join(", ")}, released on ${SITE_NAME}.`,
    });
  }

  if (city) {
    faq.push({
      question: `Where is ${name} from?`,
      answer: `${name} is from ${city}${country ? `, ${country}` : ""}.`,
    });
  }

  if (releases.length) {
    const shown = releases.slice(0, 6);
    faq.push({
      question: `What has ${name} released on ${SITE_NAME}?`,
      answer: `${name}'s releases on ${SITE_NAME} include ${shown.join(", ")}${
        releases.length > shown.length ? ", and more" : ""
      }. The full discography is on their artist page.`,
    });
  }

  return faq;
}
