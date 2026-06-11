# Performance Notes — Oscillation Records

**Date:** 2026-06-11

Two reported symptoms: pages feel sluggish, and search takes 10+ seconds. This doc records
the root causes, what was fixed in code, and the larger structural wins that still need a
running app to validate (the app couldn't be run in this environment — no `.env` / deps).

---

## Root causes

### Search (10+ seconds)

- `GET /api/releases?q=` loaded **every release with all of its tracks** (audio URLs, lyrics,
  credits JSON) and then fuzzy-matched in JS, plus it queried the artist collection twice.
- The navbar fires two requests (`/api/releases` + `/api/artists`); each is a separate
  serverless function that opens its own MongoDB connection.
- On a cold function + Atlas connection (`serverSelectionTimeoutMS` is 12s), this compounds.
- The client side was already fine — debounced 280ms, parallel, with request cancellation.

### Sluggish pages

- Every page is a **client component that fetches in `useEffect` after hydration**, against
  `force-dynamic` (uncached) APIs. The result is a waterfall: HTML → JS → hydrate → fetch →
  DB round-trip(s) → render. Users see spinners, then content pops in.
- The artist page fetched the artist first, **then** its releases + the full artist list
  (two sequential round-trips), and loaded full track records just to show a track count.
- Images use `unoptimized: true` with remote artwork, so nothing is resized (large LCP).

---

## Fixed in this change set

| Change | File | Effect |
| --- | --- | --- |
| List/search/carousel load only the first track's `audioFile` + a `_count`, not all tracks | [app/api/releases/route.ts](app/api/releases/route.ts) | Much smaller payloads and DB work for the grid and search |
| Public (non-admin) release responses are CDN-cacheable (`s-maxage=60, swr=300`); admin stays `no-store` | [app/api/releases/route.ts](app/api/releases/route.ts) | Repeat searches / grid loads served from the edge |
| Artist-releases query selects only track ids (page just needs the count) + caching | [app/api/artists/[artistId]/releases/route.ts](app/api/artists/%5BartistId%5D/releases/route.ts) | Lighter artist page |
| Artist page fetches artist + releases + roster in parallel | [app/(main)/artists/[artistId]/page.tsx](app/(main)/artists/%5BartistId%5D/page.tsx) | Removes one round-trip of latency |
| CDN caching on public, cookie-free reads | [app/api/artists/route.ts](app/api/artists/route.ts), [app/api/songs/latest/route.ts](app/api/songs/latest/route.ts), [app/api/site-settings/footer/route.ts](app/api/site-settings/footer/route.ts), [app/api/site-settings/stacked-hero/route.ts](app/api/site-settings/stacked-hero/route.ts) | Repeat loads served from the edge |

All cache keys include the query string, so different searches/limits cache independently.
Caching is only applied where the response does not depend on the auth cookie.

---

## Recommended next (need a running app to validate)

These are higher-impact but riskier, so they were **not** applied blind:

1. **Render pages as Server Components with the data already in the HTML.** This is the biggest
   win for "sluggish." Fetch in the server component (or a cached `fetch`/Prisma call) and pass
   data to a small client child for interactivity (e.g. the artist year filter, carousels).
   Eliminates the hydrate-then-fetch waterfall and the loading spinners. Candidates:
   `ArtistsSection`, `NewMusicSection`, `ReleasesSection`, the artist and release detail pages.

2. **Turn on image optimization.** Drop `unoptimized: true` in `next.config.ts`, restrict
   `remotePatterns` to the S3 bucket (and any other real hosts), and replace the raw `<img>` on
   the artist page with `next/image`. Expect a large LCP improvement. Verify artwork hosts are
   covered so images don't 404.

3. **Cold start / MongoDB connection.** The 10s tail is largely connection latency on cold
   serverless invocations. Options: Prisma Accelerate (connection pooling + query cache), a
   pooled driver, ensuring Atlas is in the same region as the Vercel functions, and lowering
   `serverSelectionTimeoutMS` so failures surface fast instead of hanging.

4. **Add DB indexes for the artist `has` queries.** `GET /api/artists/[id]/releases` and the
   artist delete filter on array membership. Add to `prisma/schema.prisma` and run
   `npm run db:push`:

   ```prisma
   model Release {
     // ...
     @@index([primaryArtistIds])
     @@index([featureArtistIds])
   }
   ```

   (Left out of this change set because schema changes need `prisma db push` to validate, which
   wasn't possible here.)

5. **Collapse search into one endpoint.** A single `GET /api/search?q=` returning both artists
   and releases halves the cold serverless invocations per keystroke-batch.

6. **Drop `force-dynamic` where not needed** so Next can cache more aggressively, now that the
   public reads carry explicit `Cache-Control`.

---

## How to validate

```bash
npm install
npm run build      # confirms the type-check passes
npm run start      # then run Lighthouse / check Network timings
```

Watch: search round-trip time, the release grid payload size (should be far smaller now), and
LCP on the home and artist pages.
