---
name: torrent-search
description: Search for torrent/magnet resources (movies, TV shows, anime) when the user needs downloadable content not found on Chinese cloud drives or streaming platforms.
---

# Torrent Search

Use when the user wants to find downloadable BT resources (movies, TV shows, anime, etc.) that aren't available on Chinese cloud drives (夸克/百度网盘).

## Priority: Knaben.eu First

**Always start with Knaben.eu** — it's the only torrent indexer confirmed reachable from this environment. Most other torrent sites are blocked or geo-restricted.

```bash
curl -sL --max-time 30 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  "https://knaben.eu/search/URL_ENCODED_QUERY"
```

Or via Python:
```python
import requests, re
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}
r = requests.get(f"https://knaben.eu/search/{quote(query)}", headers=HEADERS, timeout=30)
magnets = re.findall(r'magnet:\?[^"\'<> ]{30,400}', r.text)
```

## Sites That DO NOT Work (don't bother)

| Site | Issue |
|------|-------|
| ThePirateBay (.org) | Connection timeout (60s+) |
| 1337x.to | SSL CERT_AUTHORITY_INVALID |
| RARBG.to | No response / blocked |
| TorrentGalaxy.to | No response |
| LimeTorrents.lol | No response |
| EZTV (eztvx.to) | Empty response |
| TorrentDownloads.me | Connection timeout |
| BTDigg (btdig.com) | No response |
| SolidTorrents.to | No response |
| TorrentProject2 | Page loads but magnet extraction unreliable |
| BT之家 (btbtt15.com) | SPA — data loaded via JS, not curl-friendly |
| BT蚂蚁 (btee.org) | 403 Forbidden |
| 磁力熊 (cilixiong.com) | No response |
| BTSOW | No response |

## Knaben Search Tips

- Use English titles for best results (not Chinese translations)
- For TV shows: search `"Show Name" COMPLETE` or `"Show Name" S01` to find season packs
- Knaben returns up to 100 results per page
- Deduplicate by `dn=` parameter (magnet link name)
- Rate limit: space requests at least 5-10 seconds apart to avoid connection resets. Multiple rapid requests from the same IP will cause `ConnectionResetError(104, 'Connection reset by peer')`.
- **Re-fetching the same search**: A second `requests.get()` to Knaben within seconds of the first WILL trigger rate limiting. If you need to run additional filters on the same results, re-use the first response text (store it) rather than making a new request. Use `curl` for the first pass (faster), then if rate-limited, switch to `requests` with a fresh User-Agent.

## Extracting Magnet Links

Parse magnet links with regex: `magnet:\?[^"'<> ]{30,400}`
Extract metadata:
- Name: `re.search(r'dn=([^&]+)', magnet)` then `unquote()`
- InfoHash: `re.search(r'btih:([A-Fa-f0-9]{40})', magnet)`

## Fallback Strategy

If Knaben is down or rate-limited:
1. Chinese cloud drive search (`chinese-cloud-drive-search` skill) — for content likely shared domestically
2. Rutracker.org — Russian tracker, often has English content with original audio tracks
3. Direct Google search `"title" magnet` — hit or miss from this environment

## Common Patterns

- "COMPLETE" in filename = full season pack
- "720p" / "1080p" = resolution
- "HEVC" / "x265" = modern codec (smaller files)
- "WEBRip" / "WEB-DL" = high quality source
- "AMZN" = Amazon Prime source
- "SKST" / "MeGusta" = release group names

## Episode Filtering for TV Seasons

When the user wants a specific season's episodes, extract and deduplicate by episode number, preferring the best quality:
- **Priority**: 1080p SKST > 1080p HEVC > 720p HEVC
- Use `re.search(r'[sS](\d+)[Ee](\d+)', name)` to extract season/episode
- Sort by episode number, deduplicate by keeping highest-quality version
- Present results as a clean table with InfoHash for easy batch import

## Content Availability Limits

Not all content is equally available on BT. Know when to stop searching:

| Content Type | Availability | Example |
|---|---|---|
| Movies, classic TV (pre-2015) | ✅ Full packs | Breaking Bad, LOTR |
| Anime (subbed/dubbed) | ✅ Good | Most popular series |
| Children's TV 5+ years old | ✅ Season packs | Peppa Pig S01-S04 |
| Recent children's TV (2-5yr) | ⚠️ Scattered episodes only | Peppa Pig S06 (2019) → 6 EZTV eps |
| Brand-new children's TV (<2yr) | ❌ Nothing | Peppa Pig S07-S11 → zero results |
| Mainstream Disney/Pixar/Nickelodeon | ❌ Rarely on BT | Actively DMCA'd |

**Why**: Heavily copyrighted children's content stays on streaming platforms (Netflix, Disney+, Amazon Prime). Piracy groups don't prioritize it (returns are lower vs. adult audience content). Chinese cloud drive sites (4kpan, 搜盘王) actively exclude mainstream international IP to avoid liability.

**When BT fails for recent children's content**, tell the user honestly. Don't keep searching — it's not there. Suggest streaming platform alternatives or periodic re-scans.
