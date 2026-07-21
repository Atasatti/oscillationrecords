---
description: Scaffold a new API route handler with the auth guard already wired in, following this repo's conventions.
argument-hint: <path e.g. app/api/admin/foo/route.ts> [methods e.g. GET,POST]
allowed-tools: Read, Grep, Glob, Write, Edit
---

Arguments: **$ARGUMENTS**

Parse those arguments as `<route path> [methods]` — the first token is the file path for the new
route (e.g. `app/api/admin/foo/route.ts`), and any remaining tokens are the HTTP methods to
implement (e.g. `GET,POST`). Default to `GET, POST` if no methods are given. If no path is given,
ask for one before writing anything.

Follow this repo's route conventions exactly — do NOT invent a new style:

1. **Read a close neighbour first.** Find an existing route in a sibling directory (e.g. via
   `app/api/press/route.ts`) and mirror its imports, structure, and error handling.

2. **Runtime directives** at the top (these routes use `getToken` + often the AWS SDK):
   ```ts
   export const dynamic = "force-dynamic";
   export const runtime = "nodejs";
   ```

3. **Guard every handler** with the right helper from `@/lib/auth-guard`, and return the guard's
   response on failure — this is non-negotiable (`middleware.ts` does not protect `/api/*`):
   ```ts
   const guard = await requirePermission(request, "catalog:write"); // or requireAdmin / requireStaff / requireUser
   if (!guard.ok) return guard.response;
   ```
   - Mutations (POST/PUT/PATCH/DELETE) and any write → `requireAdmin` / `requirePermission(..., "<scope>:write")`.
   - Admin reads/dashboards → `requireStaff` / `requirePermission(..., "<scope>:read")`.
   - Any logged-in user → `requireUser`. Public GETs may skip the guard, but say so explicitly.
   - Pick the permission scope by matching what neighbouring routes use; if unsure, ask rather than guess.

4. **Never use `token.sub` as a Mongo id.** If you need the user's `User.id`, use `resolveUserId()`.

5. **Body of each handler**: wrap in `try/catch`, validate input, use `prisma` from `@/lib/prisma`,
   and on error `console.error(...)` + `return NextResponse.json({ error: "..." }, { status: 500 })`.

6. **Audit writes** where neighbours do: `await recordAudit(request, guard.token, { action, resource, resourceId, summary })`.

7. After writing the file, run `npx tsc --noEmit` to confirm it type-checks, and report what guard
   each handler uses so I can sanity-check the authorization.
