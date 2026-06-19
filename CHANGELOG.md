# Changelog

All notable changes to this project are documented here. This entry covers the
work on the `admin-press-errors-page-media` branch, built on top of the
catalogue baseline of 2026-06-10 (artists, releases, tracks, fuzzy search, and
the show-on-website toggle).

## [Unreleased]

### Added

- **Release lifecycle & unified Release Editor**
  - `ReleaseStatus` (DRAFT / SCHEDULED / RELEASED) with query-time publish
    gating; replaces the separate "upcoming release" model (migrated via
    `scripts/migrate-upcoming-to-release.mjs`).
  - Single Release Editor surface: tracklist, background uploads with progress,
    autosave, stems, apply-to-all, publish validation, and import-from-link.
    Legacy add/edit forms removed.

- **Admin redesign**
  - New admin shell (sidebar, breadcrumbs, page headers), quick search,
    "needs attention" triage, drag-to-reorder, toasts, and UI primitives
    (table, pagination, badge, skeleton).
  - New hubs/pages: Releases, Artists, Press, Homepage, Live data, Errors,
    Settings, Subscribers.

- **Consented analytics**
  - `PageView` and `LinkClick` models; cookie-consent banner + `/api/consent`;
    page-view and link-click tracking (analytics only run after opt-in).
  - Dashboard with plays, page views, link clicks, sessions/visits, UTM
    attribution, and trend charts; a "Live & raw data" inspector with bounded
    table sizes. IP addresses are never stored.

- **Artist & release enrichment**
  - Spotify import (photo, genres), MusicBrainz import, ISNI lookup, genre
    picker.
  - Per-artist and per-release SEO score (0–100) with a prioritised
    "what's missing" checklist in the admin roster.

- **Press**
  - `PressItem` model; public `/press` listing + per-release press section;
    admin press manager with reordering.

- **Editable homepage media**
  - Hero images, studio-photo carousel, and contact artwork are managed from
    admin (`SiteSettings` page-media); custom ordering for homepage sections.

- **Accounts & privacy (GDPR)**
  - Account page with data export and account deletion; Privacy and Terms
    pages; cookie consent.

- **Error logging**
  - `ErrorLog` model; server capture via `instrumentation.ts` (edge-safe
    ingest); client-side error logger; `/admin/errors` viewer.

- **SEO**
  - `app/sitemap.ts` (all static pages + every public artist/release, with
    image entries, hourly revalidate) and `app/robots.ts`.
  - schema.org JSON-LD: MusicGroup (artist), MusicAlbum (release),
    BreadcrumbList, Organization, and Press CollectionPage/BlogPosting;
    `sameAs` from streaming/social/MusicBrainz/ISNI for entity reconciliation.
  - Per-page metadata + OpenGraph/Twitter cards across home, about, artists,
    releases, press, and contact.

- **Newsletter**
  - Admin subscriber list; server-side validation (format + MX/A
    deliverability, disposable/fake-pattern blocking), rate limiting,
    honeypot, and de-duplication.

### Changed

- Prisma CLI and client aligned at 6.19.3.
- `lib/auth.ts` simplified to NextAuth v4 + role claim (removed dead Google
  token-refresh machinery).

### Security

- Role-based admin authorisation with DB-backed revocation; `requireAdmin` on
  every admin/mutation route (`lib/auth-guard`).
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy) plus a per-request nonce CSP for
  `/admin` via middleware.
- URL-scheme validation, rate limiting, and an image-optimizer host allowlist.
- See `SECURITY_AUDIT.md` for the full 2026-06-18 audit and remediation log.
