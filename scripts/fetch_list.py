#!/usr/bin/env python3
"""Fetch a Douban people list (wish / collect / do) and dump to JSON.

Usage:
    python3 scripts/fetch_list.py [--user USER] [--type wish|collect|do] [--out PATH]

Defaults: user=lfkdsk, type=wish, out=data/<type>list.json (wishlist.json / collectlist.json / dolist.json).
"""
import argparse
import html as ihtml
import json
import os
import re
import sys
import time
import urllib.request

PAGE_SIZE = 15
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

LIST_TITLES = {
    "wish": "想看",
    "collect": "看过",
    "do": "在看",
}

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def http_get(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def http_get_retry(url: str, attempts: int = 4) -> str:
    last = None
    for i in range(attempts):
        try:
            return http_get(url)
        except Exception as e:
            last = e
            wait = 2 ** i
            print(f"  retry {i+1} after {wait}s: {e}", file=sys.stderr)
            time.sleep(wait)
    raise RuntimeError(f"give up: {last}")


def parse_total(html: str, list_type: str) -> int:
    label = LIST_TITLES.get(list_type, "想看")
    m = re.search(rf"{label}的影视\s*\((\d+)\)", html)
    return int(m.group(1)) if m else 0


def parse_items(html: str):
    start = html.find('<div class="grid-view">')
    if start == -1:
        return []
    chunk = html[start:]
    items = []
    starts = [m for m in re.finditer(r'<div class="item comment-item"[^>]*data-cid="(\d+)"[^>]*>', chunk)]
    for i, m in enumerate(starts):
        cid = m.group(1)
        body_start = m.end()
        body_end = starts[i + 1].start() if i + 1 < len(starts) else len(chunk)
        items.append((cid, chunk[body_start:body_end]))
    return items


def text(s: str) -> str:
    return ihtml.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s))).strip()


COUNTRIES_KNOWN = {
    "中国大陆", "中国香港", "中国台湾", "美国", "日本", "韩国", "法国", "英国",
    "德国", "意大利", "西班牙", "印度", "泰国", "俄罗斯", "加拿大", "澳大利亚",
    "新西兰", "巴西", "墨西哥", "瑞典", "挪威", "丹麦", "芬兰", "波兰",
    "阿根廷", "南非", "伊朗", "土耳其", "比利时", "荷兰", "瑞士", "奥地利",
    "希腊", "葡萄牙", "捷克", "匈牙利", "罗马尼亚", "爱尔兰", "苏联", "新加坡",
    "马来西亚", "越南", "菲律宾", "印度尼西亚", "以色列", "阿联酋", "卢森堡",
    "冰岛", "智利", "古巴", "乌克兰", "塞尔维亚", "克罗地亚", "立陶宛",
    "挪威", "黎巴嫩", "巴基斯坦", "西西里",
}
GENRES_KNOWN = {
    "剧情", "喜剧", "动作", "爱情", "科幻", "动画", "悬疑", "惊悚", "恐怖",
    "犯罪", "同性", "音乐", "歌舞", "传记", "历史", "战争", "西部", "奇幻",
    "冒险", "灾难", "武侠", "情色", "纪录片", "短片", "运动", "黑色电影",
    "家庭", "儿童", "古装", "真人秀", "脱口秀",
}
LANGUAGES_KNOWN = {
    "汉语普通话", "粤语", "英语", "日语", "韩语", "法语", "德语", "西班牙语",
    "意大利语", "俄语", "葡萄牙语", "印地语", "泰语", "阿拉伯语", "土耳其语",
    "希伯来语", "波斯语", "希腊语", "瑞典语", "丹麦语", "芬兰语", "挪威语",
    "波兰语", "捷克语", "匈牙利语", "越南语", "印尼语", "马来语", "乌克兰语",
    "塞尔维亚语", "克罗地亚语", "拉丁语", "蒙古语", "藏语", "闽南语", "上海话",
    "客家话", "手语", "无对白", "马来西亚语",
}


def parse_item(cid: str, body: str) -> dict:
    cover_m = re.search(r'<img[^>]+src="([^"]+)"', body)
    cover = cover_m.group(1) if cover_m else ""

    link_m = re.search(
        r'<a[^>]+title="([^"]*)"\s+href="(https://movie\.douban\.com/subject/\d+/?)"\s+class="nbg"',
        body,
    )
    pic_title = link_m.group(1) if link_m else ""
    link = link_m.group(2) if link_m else ""
    sm = re.search(r"/subject/(\d+)/", link)
    subject_id = sm.group(1) if sm else ""

    title_em = re.search(r"<em>([^<]+)</em>(.*?)</li>", body, re.DOTALL)
    titles = []
    if title_em:
        titles.extend([t.strip() for t in title_em.group(1).split("/") if t.strip()])
        tail_text = text(title_em.group(2))
        if tail_text.startswith("/"):
            tail_text = tail_text[1:].strip()
        for piece in tail_text.split("/"):
            piece = piece.strip()
            if piece:
                titles.append(piece)
    main_title = titles[0] if titles else pic_title
    aka = titles[1:] if len(titles) > 1 else []

    intro_m = re.search(r'<li class="intro">([^<]*)</li>', body)
    intro_raw = intro_m.group(1).strip() if intro_m else ""
    intro_parts = [p.strip() for p in intro_raw.split("/") if p.strip()] if intro_raw else []

    date_m = re.search(r'<span class="date">([^<]+)</span>', body)
    mark_date = date_m.group(1).strip() if date_m else ""

    rating_m = re.search(r'class="rating(\d)-t"', body)
    rating = int(rating_m.group(1)) if rating_m else 0

    cm = re.search(r'<span class="comment">([^<]*)</span>', body)
    comment = cm.group(1).strip() if cm else ""

    years = []
    countries = []
    genres = []
    languages = []
    other = []
    runtime = ""
    for p in intro_parts:
        ym = re.match(r"^(\d{4})(?:-\d{2}-\d{2})?", p)
        if ym:
            years.append(ym.group(1))
            continue
        if p in COUNTRIES_KNOWN:
            countries.append(p); continue
        if p in GENRES_KNOWN:
            genres.append(p); continue
        if p in LANGUAGES_KNOWN:
            languages.append(p); continue
        if re.match(r"^\d+\s*分钟$", p) or re.match(r"^\d+min$", p, re.IGNORECASE):
            runtime = p; continue
        other.append(p)
    year = years[0] if years else ""

    return {
        "id": subject_id or cid,
        "cid": cid,
        "title": main_title,
        "aka": aka,
        "url": link,
        "cover": cover,
        "year": year,
        "mark_date": mark_date,
        "rating": rating,
        "comment": comment,
        "countries": countries,
        "genres": genres,
        "languages": languages,
        "runtime": runtime,
        "intro_raw": intro_raw,
        "people": other,
    }


def fetch_list(user: str, list_type: str):
    base = f"https://movie.douban.com/people/{user}/{list_type}"
    first = http_get_retry(base)
    total = parse_total(first, list_type)
    pages = (total + PAGE_SIZE - 1) // PAGE_SIZE
    print(f"[{list_type}] total={total} pages={pages}", file=sys.stderr)

    movies = []
    for i in range(pages):
        if i == 0:
            html = first
        else:
            url = f"{base}?start={i * PAGE_SIZE}&sort=time&rating=all&filter=all&mode=grid"
            html = http_get_retry(url)
        items = parse_items(html)
        for cid, body in items:
            movies.append(parse_item(cid, body))
        print(f"  page {i+1}/{pages} -> {len(items)} (running {len(movies)})", file=sys.stderr)
        if i + 1 < pages:
            time.sleep(0.8)

    return {
        "user": user,
        "type": list_type,
        "label": LIST_TITLES.get(list_type, list_type),
        "total_declared": total,
        "fetched": len(movies),
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z") or time.strftime("%Y-%m-%dT%H:%M:%S"),
        "movies": movies,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--user", default="lfkdsk")
    p.add_argument("--type", default="wish", choices=["wish", "collect", "do"])
    p.add_argument("--out", default=None)
    args = p.parse_args()

    out = args.out or os.path.join(ROOT, "data", f"{args.type}list.json")
    out = os.path.abspath(out)
    os.makedirs(os.path.dirname(out), exist_ok=True)

    data = fetch_list(args.user, args.type)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"wrote {len(data['movies'])} items to {out}", file=sys.stderr)


if __name__ == "__main__":
    main()
