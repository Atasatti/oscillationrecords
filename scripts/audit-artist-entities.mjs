// READ-ONLY SEO/entity audit: for every public artist, report which Knowledge-
// Graph signals are present vs missing — the strong identifiers (Wikidata,
// MusicBrainz, ISNI) that drive a Google Knowledge Panel, plus the streaming/
// social links that become schema.org `sameAs`. Makes NO writes; safe on prod.
//
//   node --env-file=.env --use-system-ca scripts/audit-artist-entities.mjs
//
// Re-run after filling gaps in the admin to track entity completeness over time.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// The three identifiers Google's Knowledge Graph trusts most for reconciliation.
const STRONG = [
  ["wikidataId", "Wikidata"],
  ["musicBrainzId", "MusicBrainz"],
  ["isni", "ISNI"],
];
// Emitted into the artist's MusicGroup JSON-LD `sameAs` (see lib/seo.ts).
const SAMEAS = [
  ["spotifyLink", "Spotify"],
  ["appleMusicLink", "Apple"],
  ["youtubeLink", "YouTube"],
  ["soundcloudLink", "SoundCloud"],
  ["instagramLink", "Instagram"],
  ["xLink", "X"],
  ["tiktokLink", "TikTok"],
  ["facebookLink", "Facebook"],
  ["tidalLink", "Tidal"],
  ["amazonMusicLink", "Amazon"],
];

const has = (v) => typeof v === "string" && v.trim().length > 0;
const mark = (v) => (has(v) ? "✓" : "·");

async function main() {
  const all = await prisma.artist.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      showOnWebsite: true,
      wikidataId: true,
      musicBrainzId: true,
      isni: true,
      spotifyLink: true,
      appleMusicLink: true,
      youtubeLink: true,
      soundcloudLink: true,
      instagramLink: true,
      xLink: true,
      tiktokLink: true,
      facebookLink: true,
      tidalLink: true,
      amazonMusicLink: true,
    },
  });

  const artists = all.filter((a) => a.showOnWebsite);
  const hidden = all.length - artists.length;
  console.log(
    `\nPublic artists: ${artists.length}` +
      (hidden ? `  (+${hidden} hidden, not audited)` : "") +
      "\n"
  );

  // Per-artist table, weakest entity signals first (your work-list order).
  const rows = artists
    .map((a) => {
      const strong = STRONG.filter(([f]) => has(a[f])).length;
      const links = SAMEAS.filter(([f]) => has(a[f])).length;
      return { a, strong, links };
    })
    .sort((x, y) => x.strong - y.strong || x.links - y.links || x.a.name.localeCompare(y.a.name));

  const nameW = Math.min(28, Math.max(12, ...artists.map((a) => a.name.length)));
  console.log(
    "ARTIST".padEnd(nameW) + "  WIKI  MBID  ISNI   sameAs"
  );
  console.log("-".repeat(nameW + 26));
  for (const { a, links } of rows) {
    const name = a.name.length > nameW ? a.name.slice(0, nameW - 1) + "…" : a.name;
    console.log(
      name.padEnd(nameW) +
        `   ${mark(a.wikidataId)}     ${mark(a.musicBrainzId)}     ${mark(a.isni)}    ${links}/${SAMEAS.length}`
    );
  }

  // Summary: coverage per identifier + the explicit gap lists.
  console.log("\n— Coverage —");
  for (const [field, label] of STRONG) {
    const have = artists.filter((a) => has(a[field]));
    const missing = artists.filter((a) => !has(a[field]));
    console.log(
      `${label.padEnd(11)} ${have.length}/${artists.length} have it` +
        (missing.length ? `  ·  missing: ${missing.map((m) => m.name).join(", ")}` : "")
    );
  }

  const noStrong = rows.filter((r) => r.strong === 0).map((r) => r.a.name);
  console.log(
    `\n— Highest priority (no Wikidata / MusicBrainz / ISNI at all): ${noStrong.length} —`
  );
  console.log(noStrong.length ? "  " + noStrong.join("\n  ") : "  none 🎉");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
