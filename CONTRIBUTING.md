# Contributing

Thanks for working on Oscillation Records. This guide covers local setup, conventions, and the
non-negotiable security rules for this codebase.

## Local setup

See the [README](README.md#getting-started). In short:

```bash
npm install
cp .env.example .env   # fill in real values
npm run db:generate
npm run db:push
npm run dev
```

## Branching & commits

- Branch off `main`: `feature/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.
- Write clear, imperative commit messages ("Add release reorder endpoint", not "added stuff").
- Keep PRs focused; one logical change per PR.

## Code style

- TypeScript everywhere; match the style of the surrounding code.
- Run before pushing:

  ```bash
  npm run lint
  npm run build
  ```

- `npm run build` runs `prisma generate` and a full type-check — treat a clean build as the bar.
- Match the existing markdown conventions; the repo style is defined in
  [.markdownlint.json](.markdownlint.json).

## Security rules (required)

Middleware only protects admin **pages** — it does **not** protect `/api/*`. Therefore:

- **Every** mutating or sensitive API route must guard itself with `requireAdmin` or
  `requireUser` from [lib/auth-guard.ts](lib/auth-guard.ts).
- Don't rely on the UI hiding a button — assume any endpoint can be called directly.
- Validate and sanitize user input; for S3 uploads use the helpers in [lib/s3.ts](lib/s3.ts).
- Never commit secrets. `.env*` is gitignored — keep it that way.
- Read [SECURITY_AUDIT.md](SECURITY_AUDIT.md) before adding endpoints.

## Design & brand

UI work should follow the [brand design sheet](BRAND.md) — colors, typography, spacing, and
tone. Reference the existing design tokens rather than introducing new raw values.

## Pull requests

- Fill out the PR template.
- Note any schema changes (`prisma/schema.prisma`) and whether `db:push` is required.
- Confirm `npm run lint` and `npm run build` pass.
