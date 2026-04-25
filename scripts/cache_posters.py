#!/usr/bin/env python3
"""Cache poster thumbnails locally so the static page renders without
Douban's required Referer header.

Usage:
    python3 scripts/cache_posters.py [data/wishlist.json data/collectlist.json ...]

If no args, all *list.json under data/ are processed.
"""
import glob
import json
import os
import sys
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
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
        return False
    with open(dest, "wb") as f:
        f.write(data)
    return True


def process(path: str):
    with open(path, encoding="utf-8") as f:
        bundle = json.load(f)

    os.makedirs(OUT_DIR, exist_ok=True)
    n_ok = n_skip = n_fail = 0
    movies = bundle.get("movies", [])
    for i, m in enumerate(movies):
        url = m.get("cover_remote") or m.get("cover", "")
        if not url:
            n_skip += 1
            continue
        # If cover is already a local-relative path, recover original from cover_remote
        if url.startswith("data/") and not m.get("cover_remote"):
            n_skip += 1
            continue
        ext = os.path.splitext(url.split("?")[0])[1] or ".jpg"
        fname = f"{m['id']}{ext}"
        dest = os.path.join(OUT_DIR, fname)
        rel = f"data/posters/{fname}"
        if os.path.exists(dest) and os.path.getsize(dest) > 200:
            m["cover_remote"] = url if not url.startswith("data/") else m.get("cover_remote", "")
            m["cover"] = rel
            n_skip += 1
            continue
        if download(url, dest):
            m["cover_remote"] = url
            m["cover"] = rel
            n_ok += 1
        else:
            n_fail += 1
        if (i + 1) % 25 == 0:
            print(f"  [{os.path.basename(path)}] {i+1}/{len(movies)} ok={n_ok} fail={n_fail} skip={n_skip}", file=sys.stderr)
        time.sleep(0.05)

    with open(path, "w", encoding="utf-8") as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
    print(f"[{os.path.basename(path)}] done: ok={n_ok} skip={n_skip} fail={n_fail}", file=sys.stderr)
    return n_fail


def main():
    if len(sys.argv) > 1:
        paths = sys.argv[1:]
    else:
        paths = sorted(glob.glob(os.path.join(ROOT, "data", "*list.json")))
        if not paths:
            print("no data/*list.json files found", file=sys.stderr)
            sys.exit(1)

    failures = 0
    for p in paths:
        failures += process(p)
    if failures:
        print(f"total failures: {failures}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
