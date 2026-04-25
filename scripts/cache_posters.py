#!/usr/bin/env python3
"""Download all poster images referenced in data/wishlist.json into data/posters/.

Douban's CDN blocks hotlinks without a douban.com Referer; static-hosted pages
can't forge that header, so we cache the thumbnails into the repo and rewrite
each movie's `cover` field to a relative path.
"""
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA = os.path.join(ROOT, "data", "wishlist.json")
OUT_DIR = os.path.join(ROOT, "data", "posters")

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def download(url: str, dest: str) -> bool:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Referer": "https://movie.douban.com/",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
    except Exception as e:
        print(f"  err {url}: {e}", file=sys.stderr)
        return False
    if len(data) < 200:
        print(f"  small ({len(data)}b) {url}", file=sys.stderr)
        return False
    with open(dest, "wb") as f:
        f.write(data)
    return True


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(DATA, encoding="utf-8") as f:
        bundle = json.load(f)

    n_ok = n_skip = n_fail = 0
    for i, m in enumerate(bundle["movies"]):
        url = m.get("cover", "")
        if not url or url.startswith("data/") or url.startswith("posters/"):
            n_skip += 1
            continue
        # filename: {id}.jpg (preserve extension if available)
        ext = os.path.splitext(url.split("?")[0])[1] or ".jpg"
        fname = f"{m['id']}{ext}"
        dest = os.path.join(OUT_DIR, fname)
        rel = f"data/posters/{fname}"
        if os.path.exists(dest) and os.path.getsize(dest) > 200:
            m["cover_remote"] = url
            m["cover"] = rel
            n_skip += 1
            continue
        ok = download(url, dest)
        if ok:
            m["cover_remote"] = url
            m["cover"] = rel
            n_ok += 1
        else:
            n_fail += 1
        if (i + 1) % 25 == 0:
            print(f"  {i+1}/{len(bundle['movies'])} (ok={n_ok} fail={n_fail} skip={n_skip})", file=sys.stderr)
        # gentle pacing
        time.sleep(0.05)

    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)

    print(f"done: ok={n_ok} skip={n_skip} fail={n_fail}", file=sys.stderr)


if __name__ == "__main__":
    main()
