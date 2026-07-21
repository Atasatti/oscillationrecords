import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isObjectId } from "@/lib/object-id";
import { requirePermission } from "@/lib/auth-guard";
import { recordAudit } from "@/lib/audit";
import {
  loadBudgetSummary,
  normalizeBudget,
  isSpendCategory,
  type SpendEntry,
} from "@/lib/release-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/releases/[releaseId]/spend — budget target + spend entries + totals.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:read");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    const res = await loadBudgetSummary(releaseId);
    if (!res) return NextResponse.json({ error: "Release not found" }, { status: 404 });
    return NextResponse.json(res, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("release spend GET error:", e);
    return NextResponse.json({ error: "Failed to load budget" }, { status: 500 });
  }
}

// POST /api/releases/[releaseId]/spend { amount, category?, date?, note? } — add spend.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "A non-negative amount is required" }, { status: 400 });
    }

    const entry: SpendEntry = {
      id: crypto.randomUUID(),
      amount: Math.round(amount * 100) / 100,
      category: isSpendCategory(body.category) ? body.category : "other",
      date: typeof body.date === "string" && body.date ? body.date : null,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    };

    // Append atomically in a single document update, so two admins adding spend at
    // the same time can't clobber each other. A read-modify-write (read spend →
    // spread → write the whole array back) lets the second write overwrite the
    // first, silently dropping an entry. A single-document update is atomic in
    // MongoDB, so the aggregation-pipeline $set is safe without a transaction; it
    // also seeds the array when spend is null/absent, and the $isArray guard
    // tolerates a non-array value.
    const result = (await prisma.$runCommandRaw({
      update: "Release",
      updates: [
        {
          q: { _id: { $oid: releaseId } },
          u: [
            {
              $set: {
                spend: {
                  $concatArrays: [
                    { $cond: [{ $isArray: "$spend" }, "$spend", []] },
                    // $literal so the user-controlled fields (date, note) are stored
                    // verbatim and never evaluated as aggregation expressions — e.g. a
                    // note of "$name" must stay the literal string, not resolve to a
                    // field of the document.
                    { $literal: [entry] },
                  ],
                },
              },
            },
          ],
        },
      ],
    } as unknown as Prisma.InputJsonObject)) as unknown as { n?: number };

    // n = documents matched; 0 means the release doesn't exist.
    if (!result?.n) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    // Release name for the audit line — an independent read. The atomic append
    // above is what prevents the lost update, so this can't reintroduce the race.
    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { name: true } });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Recorded ${entry.amount} spend (${entry.category}) on "${release?.name ?? "release"}"${entry.note ? ` — ${entry.note}` : ""}`,
      metadata: { amount: entry.amount, category: entry.category, note: entry.note },
    });

    return NextResponse.json(await loadBudgetSummary(releaseId), { status: 201 });
  } catch (e) {
    console.error("release spend POST error:", e);
    return NextResponse.json({ error: "Failed to add spend" }, { status: 500 });
  }
}

// PATCH /api/releases/[releaseId]/spend { budget } — set or clear the budget target.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    const body = await request.json().catch(() => ({}));
    const budget = normalizeBudget(body.budget); // null clears it

    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { name: true } });
    if (!release) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    await prisma.release.update({ where: { id: releaseId }, data: { budget } });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: budget === null ? `Cleared the budget on "${release.name}"` : `Set the budget to ${budget} on "${release.name}"`,
      metadata: { budget },
    });

    return NextResponse.json(await loadBudgetSummary(releaseId));
  } catch (e) {
    console.error("release spend PATCH error:", e);
    return NextResponse.json({ error: "Failed to set budget" }, { status: 500 });
  }
}

// DELETE /api/releases/[releaseId]/spend?entryId=… — remove one spend entry.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ releaseId: string }> }
) {
  const guard = await requirePermission(request, "catalog:write");
  if (!guard.ok) return guard.response;
  try {
    const { releaseId } = await params;
    // Malformed id → Prisma throws instead of returning null. 404, not a 500.
    if (!isObjectId(releaseId)) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }
    const entryId = new URL(request.url).searchParams.get("entryId") || "";
    if (!entryId) return NextResponse.json({ error: "entryId is required" }, { status: 400 });

    // Remove atomically in a single document update, matching the POST: a
    // read-filter-write here has the same lost-update risk (a concurrent add or
    // delete could clobber it). $filter drops the matching entry in place; the
    // $isArray guard tolerates a null/absent spend.
    const result = (await prisma.$runCommandRaw({
      update: "Release",
      updates: [
        {
          q: { _id: { $oid: releaseId } },
          u: [
            {
              $set: {
                spend: {
                  $filter: {
                    input: { $cond: [{ $isArray: "$spend" }, "$spend", []] },
                    as: "e",
                    // $literal so the user-controlled entryId can't be read as an
                    // expression. Without it, entryId="$$e.id" makes cond always false
                    // and $filter drops EVERY entry — a crafted param would wipe the
                    // whole spend array instead of removing one.
                    cond: { $ne: ["$$e.id", { $literal: entryId }] },
                  },
                },
              },
            },
          ],
        },
      ],
    } as unknown as Prisma.InputJsonObject)) as unknown as { n?: number };

    // n = documents matched; 0 means the release doesn't exist.
    if (!result?.n) return NextResponse.json({ error: "Release not found" }, { status: 404 });

    const release = await prisma.release.findUnique({ where: { id: releaseId }, select: { name: true } });

    await recordAudit(request, guard.token, {
      action: "update",
      resource: "release",
      resourceId: releaseId,
      summary: `Removed a spend entry on "${release?.name ?? "release"}"`,
    });

    return NextResponse.json(await loadBudgetSummary(releaseId));
  } catch (e) {
    console.error("release spend DELETE error:", e);
    return NextResponse.json({ error: "Failed to remove spend" }, { status: 500 });
  }
}
