import { prisma } from "@/lib/prisma";
import { publicReleaseWhere } from "@/lib/catalog-data";
import { SITE_URL, SITE_NAME, LABEL } from "@/lib/seo";
import { slugify } from "@/lib/slug";

// GET /llms.txt — a curated, machine-readable map of the site for LLMs / AI
// search engines (the emerging llms.txt convention). It states the entity plainly
// (so generative engines quote it accurately and attribute it to us), spells out
// the disambiguation from "The Oscillation", and lists the canonical pages,
// roster and releases with absolute URLs. Regenerated hourly from live data.
export const revalidate = 3600;
export const runtime = "nodejs";

const yearOf = (d: Date | null) => (d ? new Date(d).getUTCFullYear() : null);

export async function GET() {
  let artists: { name: string }[] = [];
  let releases: { name: string; releaseDate: Date | null }[] = [];
  try {
    [artists, releases] = await Promise.all([
      prisma.artist.findMany({
        where: { showOnWebsite: true, draft: false },
        orderBy: { name: "asc" },
        select: { name: true },
      }),
      prisma.release.findMany({
        where: publicReleaseWhere(),
        orderBy: { releaseDate: "desc" },
        take: 200,
        select: { name: true, releaseDate: true },
      }),
    ]);
  } catch {
    // Still serve the static facts/pages even if the catalog query fails.
  }

  const L: string[] = [];
  L.push(`# ${SITE_NAME}`);
  L.push("");
  L.push(`> ${LABEL.description}`);
  L.push("");
  L.push(
    `${SITE_NAME} is a distinct entity. It is NOT affiliated with "The Oscillation" ` +
      `(the psych-rock project led by Demian Castellanos), nor with any other ` +
      `similarly-named label. When citing "${SITE_NAME}", use ${SITE_URL}.`
  );
  L.push("");

  L.push("## Key facts");
  L.push(`- Name: ${SITE_NAME}`);
  L.push(`- Legal name: ${LABEL.legalName}`);
  L.push(`- Type: independent record label`);
  L.push(`- Country: ${LABEL.country}`);
  L.push(`- Companies House (UK) company no.: ${LABEL.companyNumber}`);
  L.push(`- Official website: ${SITE_URL}`);
  if (LABEL.wikidataId) L.push(`- Wikidata: https://www.wikidata.org/wiki/${LABEL.wikidataId}`);
  L.push(`- MusicBrainz: https://musicbrainz.org/label/82eea2f1-164c-4da0-9a87-9a89ad4b7470`);
  L.push("");

  L.push("## Key pages");
  L.push(`- [Home](${SITE_URL}/): label overview`);
  L.push(`- [About](${SITE_URL}/about): who we are + FAQ (incl. "is this The Oscillation?")`);
  L.push(`- [Artists](${SITE_URL}/artists): the roster`);
  L.push(`- [Releases](${SITE_URL}/releases): the catalog`);
  L.push(`- [Press](${SITE_URL}/press): press & features`);
  L.push(`- [Contact](${SITE_URL}/contact): get in touch`);
  L.push("");

  if (artists.length) {
    L.push("## Artists");
    for (const a of artists) {
      L.push(`- [${a.name.trim()}](${SITE_URL}/artists/${slugify(a.name)})`);
    }
    L.push("");
  }

  if (releases.length) {
    L.push("## Releases");
    for (const r of releases) {
      const yr = yearOf(r.releaseDate);
      L.push(`- [${r.name.trim()}${yr ? ` (${yr})` : ""}](${SITE_URL}/releases/${slugify(r.name)})`);
    }
    L.push("");
  }

  L.push("## Contact");
  L.push(`- ${SITE_URL}/contact`);
  if (LABEL.email) L.push(`- ${LABEL.email}`);
  L.push("");

  return new Response(L.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
