#!/usr/bin/env node
/**
 * PreToolUse guard (Bash / PowerShell).
 *
 * The local `.env` points at LIVE production Mongo + S3, so a stray destructive
 * command hits real data. This hook blocks the handful of high-signal destructive
 * patterns and asks for an explicit, deliberate confirmation instead of letting
 * them run on autopilot. It intentionally does NOT block routine reads or the
 * everyday `npm run dev` / lint / build commands.
 *
 * Exit 0 = allow. Exit 2 = block, with the reason on stderr fed back to the model.
 */
import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

let payload = {};
try {
  payload = JSON.parse(readStdin() || "{}");
} catch {
  process.exit(0); // can't parse → don't get in the way
}

const input = payload.tool_input ?? {};
const command = String(input.command ?? "");
if (!command) process.exit(0);

// High-signal destructive patterns against the live DB / bucket / deploy path.
const DANGER = [
  { re: /dropDatabase|\.drop\s*\(/i, what: "drops a collection/database" },
  { re: /deleteMany|updateMany/i, what: "mass delete/update on the live DB" },
  { re: /prisma\s+migrate\s+reset|--force-reset|--accept-data-loss/i, what: "resets the Prisma DB" },
  { re: /\bdb:deploy\b/i, what: "runs the guarded prod DB deploy" },
  { re: /DeleteObjects?Command|s3\s+rb\b|deleteBucket/i, what: "deletes S3 objects/buckets" },
];

const hit = DANGER.find((d) => d.re.test(command));
if (hit) {
  process.stderr.write(
    `BLOCKED by guard-prod: this command ${hit.what}, and the local .env points at ` +
      `LIVE production data. If this is truly intended, tell the user exactly what will ` +
      `change and get explicit confirmation before re-running it (or run it yourself).`
  );
  process.exit(2);
}

process.exit(0);
