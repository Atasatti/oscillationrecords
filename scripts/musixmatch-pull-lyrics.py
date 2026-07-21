#!/usr/bin/env python3
"""Pull the label's own lyrics from Musixmatch for review. NETWORK ONLY — writes
no database. Reads lyric-candidates.json (from export-lyric-candidates.mjs) and
writes lyrics-review.json for a human to review before ingest.

Uses Musixmatch's desktop-app API host (apic-desktop.musixmatch.com) with the
token.get -> usertoken flow. That host returns full, unrestricted lyrics and — key
for this environment — is reachable through the corporate proxy, whereas
www.musixmatch.com (the signature-auth host the musicxmatch_api wrapper uses) is
blocked here (Zscaler Error 54113). No API key required.

Install:  pip install -r scripts/requirements.txt
Run:      python scripts/musixmatch-pull-lyrics.py

Caveats: unofficial endpoint (ToS-gray) — pulls only the label's OWN lyrics. The
usertoken is rate-limited, so it is cached to .mxm-token.json and reused. See
docs/superpowers/specs/2026-07-08-lyrics-hub-design.md.
"""
import json
import os
import sys
import time

try:
    # Trust the OS certificate store so the corporate root CA is honoured. Harmless
    # off the corporate network (falls back to the Windows/macOS/Linux store).
    import truststore

    truststore.inject_into_ssl()
except Exception:
    pass

import requests

BASE = "https://apic-desktop.musixmatch.com/ws/1.1/"
APP = "web-desktop-app-v1.0"
TOKEN_CACHE = ".mxm-token.json"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MusixmatchDesktop/1.0"

session = requests.Session()
session.headers.update({"User-Agent": UA})


def norm(s):
    return "".join(c for c in (s or "").lower() if c.isalnum() or c == " ").strip()


def _get(path, params):
    p = {"app_id": APP, "format": "json"}
    p.update(params)
    return session.get(BASE + path, params=p, timeout=25).json()


def _status(j):
    try:
        return j["message"]["header"]["status_code"]
    except (KeyError, TypeError):
        return None


# ---- usertoken (cached + retried; token.get is rate-limited) ----------------
def _fetch_token():
    for _ in range(6):
        try:
            j = _get("token.get", {})
            body = j.get("message", {}).get("body", {})
            tok = body.get("user_token") if isinstance(body, dict) else None
            if tok and tok != "UpgradeOnlyUponRequest":
                return tok
        except Exception:
            pass
        time.sleep(8)  # back off past the throttle
    return None


_token = [None]


def _load_cached():
    if os.path.exists(TOKEN_CACHE):
        try:
            with open(TOKEN_CACHE, encoding="utf-8") as f:
                return json.load(f).get("token")
        except Exception:
            return None
    return None


def _save_cached(tok):
    try:
        with open(TOKEN_CACHE, "w", encoding="utf-8") as f:
            json.dump({"token": tok}, f)
    except Exception:
        pass


def token():
    if not _token[0]:
        _token[0] = _load_cached() or _fetch_token()
        if _token[0]:
            _save_cached(_token[0])
    return _token[0]


def refresh_token():
    _token[0] = _fetch_token()
    if _token[0]:
        _save_cached(_token[0])
    return _token[0]


# ---- lyrics extraction ------------------------------------------------------
def _clean(text):
    if not text:
        return None
    t = text
    # Strip a trailing commercial-use disclaimer if the API appends one.
    marker = t.find("*** This Lyrics")
    if marker != -1:
        t = t[:marker]
    t = t.strip()
    return t or None


def _lyrics_from(j):
    try:
        body = j["message"]["body"]
        lyr = body.get("lyrics", {}) if isinstance(body, dict) else {}
        if not isinstance(lyr, dict) or lyr.get("restricted"):
            return None
        return _clean(lyr.get("lyrics_body", ""))
    except (KeyError, TypeError, AttributeError):
        return None


def _call_lyrics(**params):
    j = _get("track.lyrics.get", dict(usertoken=token(), **params))
    if _status(j) == 401:  # token expired / renew
        refresh_token()
        j = _get("track.lyrics.get", dict(usertoken=token(), **params))
    return j


def pull_by_isrc(isrc):
    # ISRC is authoritative — the exact recording.
    try:
        return _lyrics_from(_call_lyrics(track_isrc=isrc))
    except Exception:
        return None


def pull_by_search(title, artist):
    # Fallback for candidates with no ISRC. Require EXACT normalized title AND
    # artist — a substring test would let "Low" match "Flow" and pull a different
    # artist's same-titled song. Returns (body, mxm_track_id, mxm_artist).
    try:
        j = _get(
            "track.search",
            dict(usertoken=token(), q_track=title, q_artist=artist, page_size=5, page=1),
        )
        if _status(j) == 401:
            refresh_token()
            j = _get(
                "track.search",
                dict(usertoken=token(), q_track=title, q_artist=artist, page_size=5, page=1),
            )
        hits = j["message"]["body"].get("track_list", [])
        nt, na = norm(title), norm(artist)
        if not na:
            return None, None, None
        for h in hits:
            tr = h.get("track", {})
            mxm_artist = tr.get("artist_name")
            if norm(tr.get("track_name")) == nt and norm(mxm_artist) == na:
                tid = tr.get("track_id")
                return _lyrics_from(_call_lyrics(track_id=tid)), tid, mxm_artist
    except Exception:
        pass
    return None, None, None


def main():
    if not token():
        print(
            "Could not obtain a Musixmatch usertoken (token.get throttled). "
            "Wait a minute and re-run — the token is cached once acquired.",
            file=sys.stderr,
        )
        sys.exit(1)

    with open("lyric-candidates.json", encoding="utf-8") as f:
        candidates = json.load(f)

    out = []
    for c in candidates:
        body, mxm_id, mxm_artist, method, conf = None, None, None, "none", 0.0
        if c.get("isrc"):
            body = pull_by_isrc(c["isrc"])
            if body:
                method, conf = "isrc", 1.0
        if not body:
            body, mxm_id, mxm_artist = pull_by_search(c["name"], c.get("primaryArtist", ""))
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
            "mxmArtist": mxm_artist,  # matched Musixmatch artist (search path) — check for mismatches
            "lyricsBody": body,
            "notes": "" if body else "no match / instrumental / restricted",
        })
        print("+" if body else ".", end="", flush=True)
        time.sleep(0.4)  # be polite

    with open("lyrics-review.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    found = sum(1 for o in out if o["lyricsBody"])
    print(f"\nWrote lyrics-review.json — {found}/{len(out)} matched.")


if __name__ == "__main__":
    main()
