"use client";

import { geoEqualEarth, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import worldTopo from "world-atlas/countries-110m.json";

// Emerald — the dashboard's plays/listeners accent — as rgb so opacity can scale
// with the listener count.
const ACCENT = "52, 211, 153";

const WIDTH = 800;
const HEIGHT = 360;

// Build the country features + a fitted Equal-Earth projection once at module
// load (the topojson is static). Rendered as plain SVG paths — no map library,
// so it's React-19-safe and the world data only ships in this code-split chunk.
const topo = worldTopo as unknown as Topology;
const world = feature(
  topo,
  topo.objects.countries as GeometryCollection<{ name: string }>
) as unknown as FeatureCollection<Geometry, { name: string }>;
const projection = geoEqualEarth().fitSize([WIDTH, HEIGHT], world);
const pathOf = geoPath(projection);

const norm = (s: string) => s.trim().toLowerCase();

// Natural-Earth (world-atlas) country names that differ from the Intl.DisplayNames
// names we store, so those countries still shade. Common cases only — anything
// unmatched simply isn't shaded (it still shows in the Countries list).
const ALIASES: Record<string, string> = {
  "united states of america": "united states",
  "dem. rep. congo": "democratic republic of the congo",
  "central african rep.": "central african republic",
  "dominican rep.": "dominican republic",
  "eq. guinea": "equatorial guinea",
  "bosnia and herz.": "bosnia & herzegovina",
  "s. sudan": "south sudan",
  "solomon is.": "solomon islands",
};

/**
 * Choropleth world map for "Where listeners are": shades each country by its
 * listener count (emerald, intensity ∝ count). We only store country names
 * (no coordinates), so this maps countries — cities stay a list alongside.
 */
export default function ListenerMap({
  countries,
}: {
  countries: { name: string; count: number }[];
}) {
  const counts = new Map(countries.map((c) => [norm(c.name), c.count]));
  const max = Math.max(...countries.map((c) => c.count), 1);
  const countFor = (name: string) => {
    const n = norm(name);
    return counts.get(n) ?? counts.get(ALIASES[n] ?? " ") ?? 0;
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background/40">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: "100%", height: "auto" }}
        role="img"
        aria-label="World map shaded by where listeners are"
      >
        {world.features.map((f, i) => {
          const name = f.properties?.name ?? "";
          const count = countFor(name);
          const d = pathOf(f);
          if (!d) return null;
          return (
            <path
              key={i}
              d={d}
              fill={
                count > 0
                  ? `rgba(${ACCENT}, ${0.3 + 0.7 * (count / max)})`
                  : "rgba(255, 255, 255, 0.05)"
              }
              stroke="rgba(255, 255, 255, 0.1)"
              strokeWidth={0.4}
            >
              <title>{count > 0 ? `${name}: ${count}` : name}</title>
            </path>
          );
        })}
      </svg>
    </div>
  );
}
