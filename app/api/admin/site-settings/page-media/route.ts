import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-guard";
import { isSafeUrl } from "@/lib/url-safety";
import { savePageMedia } from "@/lib/page-media";
import {
  DEFAULT_PAGE_MEDIA,
  PAGE_IMAGE_FIELDS,
  type PageMedia,
} from "@/lib/page-media-defaults";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_ARTWORKS = 24;
const SINGLE_KEYS = new Set(PAGE_IMAGE_FIELDS.map((f) => f.key));

// Admin: save a partial patch of the page-media blob. Each provided key is
// validated (safe http(s) URL or site-relative path) before being stored; an
// empty string clears the override (the public site then shows the default).
export async function PUT(request: NextRequest) {
  const guard = await requireAdmin(request);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected an object of media fields" }, { status: 400 });
  }

  const patch: Partial<PageMedia> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (key === "contactArtworks") {
      if (!Array.isArray(value)) {
        return NextResponse.json({ error: "contactArtworks must be an array" }, { status: 400 });
      }
      const cleaned = value
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v) => v.length > 0 && isSafeUrl(v));
      if (cleaned.length > MAX_ARTWORKS) {
        return NextResponse.json(
          { error: `A maximum of ${MAX_ARTWORKS} images is allowed` },
          { status: 400 }
        );
      }
      // Empty array → fall back to the built-in collage.
      patch.contactArtworks = cleaned.length ? cleaned : DEFAULT_PAGE_MEDIA.contactArtworks;
      continue;
    }

    if (!SINGLE_KEYS.has(key as never)) continue; // ignore unknown keys
    if (typeof value !== "string") {
      return NextResponse.json({ error: `${key} must be a string` }, { status: 400 });
    }
    const trimmed = value.trim();
    // Empty string resets to the default for that field.
    const resolved = trimmed === "" ? DEFAULT_PAGE_MEDIA[key as keyof PageMedia] as string : trimmed;
    if (!isSafeUrl(resolved)) {
      return NextResponse.json({ error: `${key} is not a valid image URL` }, { status: 400 });
    }
    (patch as Record<string, unknown>)[key] = resolved;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const media = await savePageMedia(patch);
    // These images appear on the home, about and contact pages.
    revalidatePath("/");
    revalidatePath("/about");
    revalidatePath("/contact");
    return NextResponse.json(media);
  } catch (error) {
    console.error("Error saving page media:", error);
    return NextResponse.json({ error: "Failed to save page media" }, { status: 500 });
  }
}
