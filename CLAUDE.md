# Oscillation Records — project guide

Next.js record-label site: a public catalog (artists, releases, tracks) plus a single-admin
content platform, listener analytics, and the Benert Remix competition.

## Stack

| Area | Tech |
| --- | --- |
| Framework | Next.js 15 (App Router, Turbopack), React 19, TypeScript 5 |
| Styling | Tailwind CSS v4, tw-animate-css, Radix UI primitives, `motion`, lucide-react / react-icons |
| Auth | NextAuth v4 (Google provider), JWT sessions |
| Database | MongoDB (Atlas) via Prisma 6 (`prisma/schema.prisma`) |
| Storage | AWS S3, presigned uploads via AWS SDK v3 |
| Admin UX | `@dnd-kit` drag-and-drop reordering |
| Hosting | Vercel (feature branch = preview deploy) |

## Structure

```text
app/(auth)/         login & signup
app/(main)/         public pages (about, artists, releases, contact)
app/admin/          admin dashboard & catalog management
app/benert-remix/   remix competition
app/api/            route handlers (catalog, uploads, analytics, auth)
components/          admin/, sections/, local-ui/, ui/ (shadcn-style)
lib/                 auth, prisma, s3, rate-limit, formatting helpers
prisma/schema.prisma MongoDB models
middleware.ts        protects /admin and /benert-remix/admin PAGES only
```

Reference docs: `README.md`, `SECURITY_AUDIT.md`, `PERFORMANCE.md`, `BRAND.md`, `DEPLOY.md`,
`docs/AUTHENTICATION.md`, `ADMIN-UX-AUDIT.md`.

## Hard rules — never violate these

1. **Every mutating API route MUST guard itself.** At the top of any POST/PUT/PATCH/DELETE
   handler, call the right helper from `lib/auth-guard.ts` and return its response on failure:
   `const guard = await requireAdmin(req); if (!guard.ok) return guard.response;`. The family is
   `requireAdmin` / `requireStaff` / `requirePermission(req, "<scope>:read|write")` / `requireUser`
   (plus `isSameOrigin` for CSRF). `middleware.ts` only protects pages, not API routes. Routes set
   `export const dynamic = "force-dynamic"` + `runtime = "nodejs"`, wrap logic in try/catch, and
   audit writes via `recordAudit(req, guard.token, {...})`. Read `SECURITY_AUDIT.md` before adding
   endpoints. New route? Use `/new-route`.
2. **Resolve real user IDs correctly.** `token.sub` is the Google OAuth subject, not the Mongo
   `User.id`. Use `resolveUserId()` (resolves by email) to get the real id.
3. **Match existing patterns.** Read a neighbouring page/route/component before writing a new
   one; follow its structure, naming, and imports. Prefer editing over inventing.
4. **The local `.env` points at LIVE production** MongoDB and S3. Any script or query run
   against it mutates real data. Never run destructive scripts casually; call out the risk.

## Environment gotchas

- Don't run `next build` while the dev server is running — it corrupts the `.next` cache.
- Node HTTPS (dev server, build, any script) needs `--use-system-ca` to clear the corporate
  proxy — `node --use-system-ca ...` (already wired into `npm run dev` / `build`).
- On PowerShell, use `-LiteralPath` when touching App Router dynamic-segment folders like
  `[id]` / `[slug]` (the brackets are glob metacharacters).

## Definition of done (when changing code)

- Type-checks clean (`npx tsc --noEmit`) and lints clean (`npm run lint`).
- New/changed behaviour is exercised — drive the actual flow, don't just assert it compiles.
- **Never `git add -A`.** Stage explicit paths. `--literal-pathspecs` is a top-level git option,
  so it goes BEFORE the subcommand: `git --literal-pathspecs add <path> ...` (putting it after
  `add` fails with "unknown option"). Needed for paths with `[id]`-style brackets.
- **Do not push or deploy without explicit approval.** Pushing the feature branch redeploys the
  Vercel preview; production deploys are a separate, gated step (`DEPLOY.md`).

## Common commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server (Turbopack, `--use-system-ca`) |
| `npm run build` | Prisma generate + production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (`test:watch` for watch mode) |
| `npm run db:generate` / `db:push` | Prisma client / push schema to MongoDB |
| `npm run db:deploy` | Guarded DB deploy (hits prod — see `DEPLOY.md`) |
