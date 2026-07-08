#!/usr/bin/env python3
"""Pull the label's own lyrics from Musixmatch for review. NETWORK ONLY — writes
no database. Reads lyric-candidates.json (from export-lyric-candidates.mjs) and
writes lyrics-review.json for a human to review before ingest.

Install:  pip install -r scripts/requirements.txt
Run:      python scripts/musixmatch-pull-lyrics.py

Caveats: uses an unofficial, reverse-engineered Musixmatch wrapper — ToS-gray and
liable to break without notice. Pulls only the label's OWN lyrics. See
docs/superpowers/specs/2026-07-08-lyrics-hub-design.md.
"""
import json
import time
from musicxmatch_api import MusixMatchAPI

api = MusixMatchAPI()


def norm(s):
    return "".join(c for c in (s or "").lower() if c.isalnum() or c == " ").strip()


def lyrics_from(resp):
    # Standard Musixmatch schema: message.body.lyrics.lyrics_body. Confirm against
    # a live response the first time (print resp) — it's a reverse-eng wrapper.
    try:
        body = resp["message"]["body"]["lyrics"]["lyrics_body"]
        return body.strip() or None
    except (KeyError, TypeError, AttributeError):
        return None


def pull_by_isrc(isrc):
    try:
        return lyrics_from(api.get_track_lyrics(track_isrc=isrc)), None
    except Exception:
        return None, None


def pull_by_search(title, artist):
    try:
        res = api.search_tracks(f"{title} {artist}")
        hits = res["message"]["body"]["track_list"]
        nt, na = norm(title), norm(artist)
        for h in hits:
            tr = h["track"]
            if norm(tr.get("track_name")) == nt and na and na in norm(tr.get("artist_name")):
                tid = tr.get("track_id")
                return lyrics_from(api.get_track_lyrics(track_id=tid)), tid
    except Exception:
        pass
    return None, None


def main():
    with open("lyric-candidates.json", encoding="utf-8") as f:
        candidates = json.load(f)

    out = []
    for c in candidates:
        body, mxm_id, method, conf = None, None, "none", 0.0
        if c.get("isrc"):
            body, _ = pull_by_isrc(c["isrc"])
            if body:
                method, conf = "isrc", 1.0
        if not body:
            body, mxm_id = pull_by_search(c["name"], c.get("primaryArtist", ""))
            if body:
                method, conf = "search", 0.6
        out.append({
            "trackId": c["trackId"],
            "name": c["name"],
            "artist": c.get("primaryArtist", ""),
            "isrc": c.get("isrc"),
            "matchMethod": method,
            "confidence": conf,
            "mxmTrackId": mxm_id,
            "lyricsBody": body,
            "notes": "" if body else "no match / instrumental / restricted",
        })
        print("+" if body else ".", end="", flush=True)
        time.sleep(0.3)  # be polite; mirror genius-check.mjs

    with open("lyrics-review.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    found = sum(1 for o in out if o["lyricsBody"])
    print(f"\nWrote lyrics-review.json — {found}/{len(out)} matched.")


if __name__ == "__main__":
    main()
