# 豆瓣随机抽片

> 把豆瓣的「想看 / 看过」拉下来，配个能随机抽片的网页 — 解决「躺下来不知道看啥」。

线上：<https://douban-selector.lfkdsk.org>

<img width="1498" height="895" alt="image" src="https://github.com/user-attachments/assets/a2787246-ce0d-4c39-ab37-04379d88e0be" />


---

## ✨ 功能

- **想看 / 看过 双 Tab** — 顶部一键切换两份清单，分别带各自的总数。
- **随机抽片** — 点「抽一部 / 回顾一部」洗牌动画 → 揭晓抽中影片。可在筛选状态下抽（例如「日本剧情 80 年代」里随机一部）。
- **多维筛选** — 类型 / 地区 / 年代 / 语言四组多选 chip；「看过」Tab 多一组「评分」筛选。
- **全文搜索** — 片名、别名、演员、导演通搜。
- **排序** — 最近想看、最早想看、评分由高到低（看过）、年代、A→Z、随机洗牌。
- **海报网格 + 详情弹层** — 点卡片弹大图、星级、导演演员、想看 / 看过日期、外链豆瓣。
- **轻量级懒加载** — 海报用 `<img loading="lazy">`，网格按 60 张分块渲染（IntersectionObserver 自动续）。
- **海报走 CDN** — 海报缓存进 `data/posters/` 但**不**进部署包，运行时由 jsDelivr 直接从 GitHub raw 拉。Pages 部署包只剩几 MB。

## 🧱 仓库结构

```
.
├── index.html
├── assets/
│   ├── styles.css        # 单一样式文件
│   └── app.js            # 单一 JS 文件 (vanilla, 无构建)
├── data/
│   ├── wishlist.json     # 想看
│   ├── collectlist.json  # 看过
│   └── posters/          # 海报缓存 (不进 Pages 部署包)
├── scripts/
│   ├── fetch_list.py     # 解析豆瓣列表页
│   ├── cache_posters.py  # 下载海报
│   └── sync.sh           # 一键同步
├── .github/workflows/
│   └── deploy.yml        # GitHub Pages 部署
└── CNAME                 # 自定义域名
```

## 🚀 本地起站

```sh
python3 -m http.server 8765
# 访问 http://localhost:8765
```

`data/posters/` 在 `main` 分支里就有，本地直接读文件，不走 CDN。

## 🔄 同步最新数据

```sh
scripts/sync.sh                  # 默认 lfkdsk，刷 wish + collect
scripts/sync.sh somebody         # 换个用户
scripts/sync.sh lfkdsk wish      # 只刷想看
scripts/sync.sh lfkdsk collect   # 只刷看过
```

底层是先跑 `scripts/fetch_list.py --type wish|collect|do --user <user>` 写 `data/<type>list.json`，再跑 `scripts/cache_posters.py` 增量补海报（已下载的会跳过）。

## 🍴 Fork 改成你自己的

只需要改三处：

### 1. Fork 仓库

[lfkdsk/douban-selector](https://github.com/lfkdsk/douban-selector) → Fork。

### 2. 替换豆瓣账号

```sh
# 用你自己的豆瓣 ID 重新抓一份
scripts/sync.sh <你的豆瓣 ID>
git add data/ && git commit -m "sync my data" && git push
```

注意：豆瓣需要把账号设为公开才能抓（Settings → 隐私 → 收藏内容公开）。

### 3. 改 CDN 配置

`assets/app.js` 顶部：

```js
const CDN_OWNER = 'lfkdsk';          // ← 改成你的 GitHub 用户名
const CDN_REPO  = 'douban-selector'; // ← 仓库名（如果你也叫这个名字就不用改）
const CDN_REF   = 'main';
```

这一行决定了线上从哪里拉海报。

### 4. 改文案 / 元数据（可选）

- `index.html` 里 `@lfkdsk` 改成你的名字（`#profile-link`）；豆瓣外链 `#source-link` 也会自动跟着 JSON 里的 `user` 字段走，改完数据这里就自动正确。
- `index.html` 的 `<title>` / 头部品牌文字按口味改。

### 5. 自定义域名（可选）

- 想用自己的域名 → 改 `CNAME` 文件，在 DNS 把 `CNAME` 指向 `<你的用户名>.github.io`。
- 不要域名 → 直接删掉 `CNAME`，部署后访问 `https://<你的用户名>.github.io/<仓库名>/`。

### 6. 启用 GitHub Pages

仓库 Settings → **Pages**：

- **Source**: 选 *GitHub Actions*
- **Custom domain**: 填上你 `CNAME` 里那个域名，等校验绿即可

push 一下 `main` 分支就会自动触发 `.github/workflows/deploy.yml`，几分钟后线上生效。

## 🐛 一些小坑

- **海报必须缓存到本地**：豆瓣 CDN 强制要求 `Referer: movie.douban.com`，第三方静态站没法伪造。所以把缩略图 commit 进仓库 + 走 jsDelivr，是目前最省事的方案。
- **总数对不上 (354/356, 733/740)**：豆瓣自己的鬼数。任何 sort / mode 组合都拿不到完整列表 — 头号显示的总数包含一些被作者删除/隐藏但仍计数的条目，paginate 时不会出现。
- **强制刷新 jsDelivr 缓存**：把 `app.js` 里 `CDN_REF` 从 `main` 改成具体 commit SHA，jsDelivr 会按新 ref 重新拉。一般不用管。

## 📜 License

MIT
