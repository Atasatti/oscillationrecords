# Oscillation Records

> A Record Label That Puts Artists First

The official website and content-management platform for Oscillation Records — a public-facing
catalog (artists, releases, tracks) with an admin dashboard, listener analytics, and the
Benert Remix competition.

![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?logo=prisma&logoColor=white)
![License](https://img.shields.io/badge/license-Proprietary-red)

---

## Overview

Oscillation Records is a [Next.js](https://nextjs.org) (App Router) application backed by
MongoDB via Prisma, with Google sign-in, S3-hosted media, and a single-admin content workflow.

**Public site** — home, about, artists & artist pages, releases & release pages, contact, a
global music player, fuzzy search, and newsletter signup.

**Admin dashboard** (`/admin`) — manage the full catalog (artists, singles/EPs/albums, tracks),
drag-and-drop ordering, site settings (footer links, hero imagery), and a listener-analytics
dashboard.

**Benert Remix** — a timed remix competition with authenticated user uploads.

## Tech stack

| Area | Tools |
| --- | --- |
| Framework | Next.js 15 (App Router, Turbopack), React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, tw-animate-css, Radix UI primitives, `motion`, lucide-react / react-icons |
| Auth | NextAuth v4 (Google provider), JWT sessions |
| Database | MongoDB (Atlas) via Prisma 6 |
| Storage | AWS S3 (presigned uploads) via AWS SDK v3 |
| Admin UX | `@dnd-kit` drag-and-drop reordering |

## Getting started

### Prerequisites

- Node.js 18.18+ (or 20+)
- A MongoDB connection string (Atlas or local)
- Google OAuth credentials and an AWS S3 bucket (for sign-in and uploads)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment — copy the template and fill in real values
cp .env.example .env

# 3. Generate the Prisma client and push the schema
npm run db:generate
npm run db:push

# 4. Run the dev server
npm run dev
```

Open <http://localhost:3000>.

All required environment variables are documented in [.env.example](.env.example). For the
Google sign-in / admin setup, see [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md).

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Generate Prisma client + production build |
| `npm run start` | Run the production build |
| `npm run lint` | Lint with ESLint |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:push` | Push the Prisma schema to the database |

## Project structure

```text
app/
  (auth)/            login & signup pages
  (main)/            public pages (about, artists, releases, contact)
  admin/             admin dashboard & catalog management
  benert-remix/      remix competition
  api/               route handlers (catalog, uploads, analytics, auth)
components/          UI: admin/, sections/, local-ui/, ui/ (shadcn-style), …
lib/                 auth, prisma, s3, rate-limit, formatting helpers
prisma/              schema.prisma (MongoDB)
docs/                setup & reference docs
public/              static assets & logos
middleware.ts        protects /admin and /benert-remix/admin pages
```

## Documentation

- 🎨 [BRAND.md](BRAND.md) — brand design sheet (name, logo, color, type, voice)
- 🔐 [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md) — Google auth & admin access
- 🛡️ [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — security review & remediation record
- ⚡ [PERFORMANCE.md](PERFORMANCE.md) — performance findings & optimization notes
- 🤝 [CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute

## Security

API authorization lives in [lib/auth-guard.ts](lib/auth-guard.ts) (`requireAdmin` /
`requireUser`); **every mutating route must guard itself** — middleware only protects pages, not
the API. Read [SECURITY_AUDIT.md](SECURITY_AUDIT.md) before adding endpoints.

## License

Proprietary — © Oscillation Records. All rights reserved. See [LICENSE](LICENSE).
