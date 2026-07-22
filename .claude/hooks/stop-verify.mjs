#!/usr/bin/env node
/**
 * Stop hook — definition-of-done nudge.
 *
 * When the turn ends and tracked source files (.ts/.tsx/.js/.jsx/.prisma) are
 * modified, surface a reminder to run `npx tsc --noEmit` and `npm run lint`
 * before considering the work done. Deliberately NON-blocking: it emits a
 * systemMessage and exits 0, so it never loops or forces a slow full typecheck
 * on every turn — it just makes the "done" bar visible.
 *
 * git is often not on PATH on this machine, so fall back to known install paths
 * and use `-c safe.directory` for the repo.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const repo = process.cwd();

function findGit() {
  const candidates = [
    "git",
    "C:\\Program Files\\Git\\cmd\\git.exe",
    "C:\\Program Files\\Git\\bin\\git.exe",
    "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    `${process.env.LOCALAPPDATA ?? ""}\\Programs\\Git\\cmd\\git.exe`,
  ];
  for (const c of candidates) {
    if (c === "git" || existsSync(c)) return c;
  }
  return null;
}

function changedFiles(git) {
  try {
    const out = execFileSync(
      git,
      ["-C", repo, "-c", `safe.directory=${repo}`, "status", "--porcelain"],
      { encoding: "utf8" }
    );
    return out
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => l.slice(3).trim())
      .filter((f) => /\.(ts|tsx|js|jsx|prisma)$/.test(f));
  } catch {
    return [];
  }
}

const git = findGit();
if (!git) process.exit(0);

const files = changedFiles(git);
if (files.length === 0) process.exit(0);

const shown = files.slice(0, 6).join(", ");
const more = files.length > 6 ? ` (+${files.length - 6} more)` : "";
process.stdout.write(
  JSON.stringify({
    systemMessage:
      `Definition of done: ${files.length} source file(s) changed (${shown}${more}). ` +
      `Before calling this done, run \`npx tsc --noEmit\` and \`npm run lint\`, and stage ` +
      `explicit paths (never \`git add -A\`).`,
  })
);
process.exit(0);
