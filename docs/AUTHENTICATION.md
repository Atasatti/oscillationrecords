# Authentication & Admin Access

Oscillation Records uses [NextAuth v4](https://next-auth.js.org) with **Google** as the only
sign-in provider, JWT sessions, and a single hard-coded admin account. Prisma + MongoDB store
users and related data.

## Environment variables

Auth needs the following (see [.env.example](../.env.example) for the full list):

```bash
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""              # openssl rand -base64 32
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
DATABASE_URL=""                 # MongoDB connection string
```

## Google Cloud setup

1. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an
   **OAuth 2.0 Client ID** (type: Web application).
2. Add an **Authorized redirect URI**: `<NEXTAUTH_URL>/api/auth/callback/google`
   (e.g. `http://localhost:3000/api/auth/callback/google` for local dev, and the production URL).
3. Copy the client ID and secret into `.env`.

## Who can sign in vs. who is admin

- **Any Google account** can sign in. On first sign-in the user is upserted into the database.
- **Admin** is a single email defined by `ADMIN_EMAIL` in
  [lib/auth-session.ts](../lib/auth-session.ts). Only that account can reach admin pages and
  admin APIs. To change the admin, edit that constant.

## Route protection

Protection is split between page-level middleware and per-route API guards.

- **Pages** — [middleware.ts](../middleware.ts) protects **only** `/admin/*` and
  `/benert-remix/admin/*`. Unauthenticated visitors are redirected to `/login`; signed-in
  non-admins are redirected home. **Every other page is public.**
- **API routes** — middleware does **not** cover `/api/*`. Each route authorizes itself using the
  helpers in [lib/auth-guard.ts](../lib/auth-guard.ts):
  - `requireAdmin(request)` — admin-only (catalog writes, analytics, admin settings).
  - `requireUser(request)` — any signed-in user (e.g. the remix competition upload).
  - `isAdminRequest(request)` — boolean, for response field gating (not access control).

When adding an endpoint, guard it explicitly. See [SECURITY_AUDIT.md](../SECURITY_AUDIT.md).

## Key files

| File | Responsibility |
| --- | --- |
| [lib/auth.ts](../lib/auth.ts) | NextAuth config (Google provider, JWT, callbacks) |
| [app/api/auth/[...nextauth]/route.ts](../app/api/auth/%5B...nextauth%5D/route.ts) | NextAuth route handler |
| [lib/auth-session.ts](../lib/auth-session.ts) | `ADMIN_EMAIL` + session-cookie/token helpers |
| [lib/auth-guard.ts](../lib/auth-guard.ts) | API authorization guards |
| [middleware.ts](../middleware.ts) | Page-level route protection |

## Sessions

- Strategy: **JWT** (no database session table is used by NextAuth).
- Lifetime: 30 days.
- Google access/refresh tokens are kept **server-side in the encrypted JWT only** — they are never
  exposed on the client session object.

## Local database commands

```bash
npm run db:generate   # generate the Prisma client
npm run db:push       # push the schema to MongoDB
```
