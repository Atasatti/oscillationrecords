# Commit guide for this project (for AI agents)

Rules for any agent making git commits in this repo. Follow them exactly.

## 1. Never stage everything
The working tree almost always has the user's own in-progress WIP (uncommitted
edits to `schema.prisma`, auth files, `docs/*.md`, etc.). `git add -A` / `git add .`
would sweep that into your commit. **Always run `git status --porcelain` first,
identify which dirty files are yours, and stage only those by explicit path.**

## 2. Use `--literal-pathspecs` for Next.js paths
Route files contain `[`, `]`, `(`, `)` (dynamic routes + route groups). Git treats
`[releaseId]` as a glob character-class, so a plain `git add` can silently miss it.
Always:

```bash
git --literal-pathspecs add -- \
  "app/api/releases/[releaseId]/route.ts" \
  "app/(main)/artists/[artistId]/page.tsx"
```

## 3. Co-author trailer on every commit
End the message with the trailer for whatever model is committing, e.g.:

```
Co-Authored-By: <model> <noreply@anthropic.com>
```

## 4. Multi-line messages via a single-quoted heredoc
So `$` / backticks aren't expanded:

```bash
git commit -q -F - <<'EOF'
Short imperative summary

- what changed and why
- second point

Co-Authored-By: <model> <noreply@anthropic.com>
EOF
```

## 5. Commit locally; never push without explicit approval
The user must say "push" each time. Never `git push --force`, never `--no-verify`
(skip hooks), never bypass signing.

## 6. Branch — don't commit to `main`
Work on a feature branch (e.g. `admin-press-errors-page-media`). If you're on
`main`, branch first.

## 7. Verify before committing
No test runner exists, so run:

```bash
node ./node_modules/typescript/bin/tsc --noEmit
node ./node_modules/eslint/bin/eslint.js <changed files>
```

Builds need `--use-system-ca`; don't `next build` while the dev server runs.

## 8. Keep temp/scratch files out
Put throwaway scripts in the scratchpad dir (outside the repo) or delete them
before staging — another reason never to `git add -A`.

---

## The canonical recipe

```bash
git status --porcelain                      # 1. see what's dirty; pick only YOUR files
# ...typecheck + lint your changes...
git --literal-pathspecs add -- "path/one.ts" "path/two.tsx"   # 2. stage explicitly
git commit -q -F - <<'EOF'                   # 3. commit (co-author trailer)
Summary line

Details.

Co-Authored-By: <model> <noreply@anthropic.com>
EOF
git log --oneline -1                         # 4. confirm
# 5. STOP — do not push until the user approves
```

## Environment notes
- Use **Git Bash** (git is on PATH there). In PowerShell git may not be on PATH —
  use the full path and ensure `safe.directory` is set.
- `LF will be replaced by CRLF` warnings are harmless (repo normalizes line
  endings) — ignore them.
- The git user (BigHeck) is already configured.
- `gh` is **not** authenticated — you can't open PRs with it. After an approved
  push, share the compare URL instead:
  `https://github.com/Atasatti/oscillationrecords/compare/main...<branch>?expand=1`.
- Don't prefix commands with `cd` — the shell already starts in the project root.

## Top 3 mistakes to avoid
1. `git add -A` → commits the user's unfinished WIP. Stage explicit paths only.
2. Plain `git add "app/api/x/[id]/route.ts"` → glob-matching can miss it. Use
   `--literal-pathspecs`.
3. Pushing (or force-pushing) without being asked. Commit, then wait.
