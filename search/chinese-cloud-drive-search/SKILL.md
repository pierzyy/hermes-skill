---
name: chinese-cloud-drive-search
description: Search for resources on Chinese cloud drives (夸克网盘, 百度网盘, 阿里云盘). Multi-strategy approach for finding working share links behind paywalls and anti-scraping sites.
---

# Chinese Cloud Drive Resource Search

Use this skill when the user asks for Chinese cloud drive (夸克网盘/百度网盘/阿里云盘) resource links, especially for media content like TV shows, movies, or educational materials.

## Strategy Order (try in sequence)

### 1. Baidu Search (most effective for Chinese resources)
- Use `curl` with proper `User-Agent: Mozilla/5.0...` header
- Search URL format: `https://www.baidu.com/s?wd={URL_ENCODED_KEYWORDS}&ie=utf-8`
- Baidu sometimes returns captcha — if so, try alternate approaches
- Extract all `http://www.baidu.com/link?url=...` links from the page
- Resolve each unique link with `curl -sL -o /dev/null -w "%{url_effective}"` to find real targets

### 2. Bing Search (fallback)
- Use: `https://www.bing.com/search?q={KEYWORDS}&count=30`
- Good for initial broad search but often misses cloud drive links

### 3. Known Resource Sites to Check
After resolving Baidu redirects, watch for these domains:
- `www.ertongpian.com` — children's animation resource forum (GBK encoded!)
- `www.yiyazaojiao.com` — 咿呀早教, paywalled but has links
- `www.52pojie.cn` — 吾爱破解, occasionally has working links
- `zhuanlan.zhihu.com` — Zhihu articles sometimes share links
- `tieba.baidu.com` — Baidu Tieba posts

### 4. Resolving Baidu Links
```bash
target=$(curl -sL -o /dev/null -w "%{url_effective}" --max-time 10 "$BAIDU_LINK" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
```

### 5. Extracting Quark/Baidu Pan Links
Search the page content for:
- Quark: `https?://pan\.quark\.cn/s/[a-zA-Z0-9]+`
- Baidu: `https?://pan\.baidu\.com/s/[a-zA-Z0-9_-]+`
- Also look for 提取码/密码/pwd patterns near the link

## Additional Resource Sites (user-suggested, browser-accessible)

### 搜盘王 (sou.ollvm.cn)
- URL: `https://sou.ollvm.cn/21232f?kw={KEYWORD}`
- SPA site — requires browser (JavaScript renders results)
- Has a "最新推荐" feed showing recently indexed resources
- If 0 results, try broader keywords or the English name

### 4K盘搜 (4kpan.vip)
- URL: `https://www.4kpan.vip/?q={KEYWORD}`
- Also SPA — requires browser
- Recognizes show names (displays synopsis) even when no resources indexed
- Has "最近更新" (latest) and category filters (电影/电视剧/动漫/综艺/短剧)
- Shows "未找到相关资源" when nothing indexed

### Search Strategy for These Sites
1. Use `browser_navigate` to open the search URL
2. Dismiss any popup dialogs first
3. Type keyword into search box, click search
4. Wait 3-5s for async results, then `browser_snapshot`
5. Try multiple keyword variations: Chinese name, English name, abbreviated forms
6. If no results, the content simply isn't indexed — suggest BT/torrent alternatives for niche foreign content
## Pitfalls

- **Encoding**: Chinese sites often use GBK/GB2312, not UTF-8. Decode with `raw.decode('gbk', errors='replace')` if you see garbled text
- **Paywalls**: Most dedicated resource sites (ertongpian, yiyazaojiao) require login or payment to reveal actual download links
- **Anti-scraping**: Sites may block right-click, F12, copy, and print. Parse HTML directly rather than relying on rendered content
- **SPA sites**: sou.ollvm.cn and 4kpan.vip are single-page apps — curl returns empty shells. Must use browser tool.
- **Search engine blocking**: Baidu/Google/Sogou/Bing all return captchas for automated curl requests. Use browser or specialized cloud drive search sites instead.
- **Multiple search attempts needed**: Try different keyword variations (with/without 全集, 中文版/英文版, season numbers)
- **Niche foreign content**: Less popular on Chinese cloud drives. BT/torrent (e.g., rarbg, 1337x) or streaming sites may have better coverage.
- **🔴 Mainstream international IP is NOT indexed**: Disney, Pixar, Nickelodeon, Peppa Pig, Paw Patrol, etc. — these are actively excluded from 4kpan/搜盘王 to avoid DMCA liability. If 4kpan returns "未找到相关资源" and BT also has nothing, it's not a search failure — the content simply doesn't exist on these platforms. Tell the user and offer alternatives (streaming, BT, periodic rescan).

## Keyword Variations
Try all of these to maximize coverage:
- 汪汪队之小砾与工程家族
- 小砾与工程家族
- Rubble & Crew (English name)
- Add: 全集, 夸克网盘, 百度网盘, 第一季, 第二季, 中文版, 英文版
