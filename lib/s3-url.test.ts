import { describe, expect, it } from "vitest";
import {
  assetDownloadHref,
  assetViewHref,
  benertUserKeyPrefix,
  isPrivateAssetKey,
  isPrivateAssetUrl,
  publicFileUrl,
} from "./s3-url";

// Public/private classification is the whole of audit #1's app-side contract: the
// bucket policy stops serving the private prefixes anonymously, so anything that
// still hands out a raw bucket URL for one of those keys is a live leak.

describe("isPrivateAssetKey", () => {
  it("classifies sensitive prefixes as private", () => {
    for (const key of [
      "assets/master/abc/track.wav",
      "benert-remix/user123/remix.wav",
      "contact/uuid/demo.mp3",
      "documents/deal.pdf",
      "quarantine/tracks/audio/1700-orphan.wav",
      "releases/agreements/abc123/uuid/contract.pdf",
      "task-attachments/uuid/notes.docx",
      // ALL track audio since the 2026-07-24 incident (unreleased masters were
      // anonymously downloadable) — playback goes through the status-gated
      // /api/tracks/[trackId]/audio route, never the raw bucket URL.
      "tracks/audio/1700-track.mp3",
      "tracks/stems/1700-stems.zip",
    ]) {
      expect(isPrivateAssetKey(key), key).toBe(true);
    }
  });

  it("leaves public site media public", () => {
    for (const key of [
      "releases/images/cover.jpg",
      "artists/images/photo.jpg",
      "press/images/shot.jpg",
      "site/hero.webp",
    ]) {
      expect(isPrivateAssetKey(key), key).toBe(false);
    }
  });

  it("does not treat a public sibling of a private prefix as private", () => {
    // `releases/agreements/` is private but `releases/images/` must not be.
    expect(isPrivateAssetKey("releases/images/agreements-cover.jpg")).toBe(false);
  });
});

describe("isPrivateAssetUrl", () => {
  it("only matches our own bucket", () => {
    expect(isPrivateAssetUrl(publicFileUrl("tracks/stems/x.zip"))).toBe(true);
    expect(isPrivateAssetUrl("https://evil.example.com/tracks/stems/x.zip")).toBe(false);
    expect(isPrivateAssetUrl(publicFileUrl("releases/images/cover.jpg"))).toBe(false);
    expect(isPrivateAssetUrl(null)).toBe(false);
  });

  it("survives a percent-encoded key", () => {
    const url = publicFileUrl("contact/uuid/My%20Song.mp3");
    expect(isPrivateAssetUrl(url)).toBe(true);
  });
});

describe("assetViewHref", () => {
  it("keeps the direct URL for public media", () => {
    const url = publicFileUrl("releases/images/cover.jpg");
    expect(assetViewHref(url)).toBe(url);
  });

  it("routes a private object through the authorization shim", () => {
    const url = publicFileUrl("releases/agreements/abc/uuid/contract.pdf");
    const href = assetViewHref(url, "contract.pdf");
    expect(href.startsWith("/api/assets/download?")).toBe(true);
    const q = new URLSearchParams(href.split("?")[1]);
    expect(q.get("url")).toBe(url);
    expect(q.get("name")).toBe("contract.pdf");
    expect(q.get("disposition")).toBe("inline");
  });

  it("leaves an external URL alone", () => {
    expect(assetViewHref("https://example.com/a.pdf")).toBe("https://example.com/a.pdf");
  });
});

describe("assetDownloadHref", () => {
  it("defaults to an attachment disposition and encodes the name", () => {
    const url = publicFileUrl("assets/master/uuid/final mix.wav");
    const q = new URLSearchParams(assetDownloadHref(url, "final mix.wav").split("?")[1]);
    expect(q.get("url")).toBe(url);
    expect(q.get("name")).toBe("final mix.wav");
    expect(q.get("disposition")).toBeNull();
  });
});

describe("benertUserKeyPrefix", () => {
  it("strips non-alphanumerics so a crafted sub can't escape the prefix", () => {
    expect(benertUserKeyPrefix("../../etc")).toBe("benert-remix/etc/");
    expect(benertUserKeyPrefix("abc123")).toBe("benert-remix/abc123/");
  });

  it("returns null when there's nothing usable left", () => {
    expect(benertUserKeyPrefix("///")).toBeNull();
    expect(benertUserKeyPrefix(undefined)).toBeNull();
  });
});
