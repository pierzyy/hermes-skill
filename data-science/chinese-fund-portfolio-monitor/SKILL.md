---
name: chinese-fund-portfolio-monitor
description: Monitor Chinese mutual fund portfolios (公募基金) — identify fund codes from screenshots, fetch real-time NAV estimates, generate beautiful HTML dashboard cards, send as WeChat images, and set up cron-based hourly reporting.
tags: [fund, china, portfolio, qieman, 且慢, 基金, nav, monitoring, wechat]
---

# Chinese Fund Portfolio Monitoring

End-to-end pipeline: screenshot → OCR → fund codes → monitoring script → HTML dashboard → WeChat image → cron job.

## When to Use

- User has a portfolio on 且慢/天天基金/支付宝等 and wants automated monitoring
- User sends a screenshot of their holdings and needs codes extracted + beautiful cards generated
- User wants hourly portfolio valuation updates during market hours with image delivery

---

## Step 0: Environment Setup

```bash
# Chinese OCR
apt-get install -y tesseract-ocr tesseract-ocr-chi-sim

# Chinese fonts for HTML rendering (CRITICAL)
apt-get install -y fonts-noto-cjk fonts-wqy-microhei fonts-wqy-zenhei

# Emoji fonts (CRITICAL - without this, all icons show as □□□)
apt-get install -y fonts-noto-color-emoji

# Fix browser if broken
apt-get update && apt-get install -y libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libxcomposite1 libxdamage1 libatspi2.0-0t64
```

---

## Step 1: Extract Fund List from Screenshot

```bash
tesseract /opt/data/cache/images/img_xxx.jpg /tmp/fund_ocr -l chi_sim
cat /tmp/fund_ocr.txt
```

OCR output is messy. Extract: fund names, holding amounts, total portfolio value.

---

## Step 2: Match Fund Codes & Verify

**Primary verification API** — most reliable:
```python
url = f'http://fund.eastmoney.com/pingzhongdata/{code}.js'
# Search for: fS_name = "基金全称"
# Cross-reference: fund name should contain key characters from OCR name
```

**Real-time estimate API** (only works for domestic funds, not QDII):
```python
url = f'https://fundgz.1234567.com.cn/js/{code}.js'
# Returns: jsonpgz({"dwjz":"3.6656","gsz":"3.7138","gszzl":"1.32",...})
```

**Fund code patterns:**
- A-share (A类): even-ending codes
- C-share (C类): A+1 (odd)
- QDII: 0xxxxx, 1xxxxx
- Money market: 000xxx
- ETF联接: 01xxxx, 05xxxx

**⚠️ OCR errors are common**: "大成" can become "招商", fund company names get garbled. Always verify via pingzhongdata API.

---

## Step 3: Fund Types & Estimate Availability

| Type | Has Real-Time Estimate? | Examples |
|------|------------------------|----------|
| 黄金ETF联接 | ✅ Yes | 000218, 008701 |
| 纳斯达克100联接 | ✅ Yes (US market hours) | 019547, 018966 |
| 标普500联接 | ✅ Yes (US market hours) | 050025, 017641 |
| 国内纯债 | ✅ Yes | 003156, 000914 |
| 红利低波指数 | ✅ Yes | 012708 |
| **QDII美元债** | ❌ No | 007360, 002400, 100050 |
| **QDII全球债** | ❌ No | 004998, 008367, 008095 |
| **QDII越南/亚太** | ❌ No | 008763 |
| **货币基金** | ❌ No | 000509 |
| **QDII标普/纳指联接(非交易时段)** | ❌ No | — |

**NEW: QDII ETF Proxy Estimation** — when fundgz fails, fall back to tracking the underlying ETF:

| QDII Fund Type | ETF Proxy | Data Source |
|---|---|---|
| 纳指100联接 | QQQ (Invesco QQQ) | Eastmoney push2 |
| 标普500联接 | SPY (SPDR S&P 500) | Sina Finance |
| 美元债 | AGG (iShares US Agg Bond) | Sina |
| 亚洲美元债 | EMB (iShares EM USD Bond) | Eastmoney |
| 全球债券 | BNDX (Vanguard Total Intl Bond) | Eastmoney |
| 欧洲股票 | VGK (Vanguard Europe) | Sina |
| 日本股票 | EWJ (iShares Japan) | Sina |
| 德国DAX | EWG (iShares Germany) | Sina |
| 新兴市场 | EEM (iShares EM) | Sina |
| 亚太市场 | VPL (Vanguard Pacific) | Sina |
| 全球股票 | VT (Vanguard Total World) | Sina |
| 生物科技 | XBI (SPDR Biotech) | Sina |
| 医疗保健 | XLV (SPDR Healthcare) | Sina |
| 消费品 | XLY (Consumer Discretionary) | Sina |
| 商品/抗通胀 | GLD (SPDR Gold) | Sina |

Full mapping in `/opt/data/scripts/qdii_estimator.py`.

---

## Step 4: Build Monitoring Script

**Architecture** (all scripts in `/opt/data/scripts/`):

```
fund_monitor_core.py    ← 核心模块（并行拉取 + QDII估算 + 格式化输出）
qdii_estimator.py       ← QDII ETF代理估算（双数据源：Eastmoney + Sina）
{name}_monitor.py       ← 各组合脚本（定义 PORTFOLIO 列表，调用 core）
```

**Creating a new portfolio script:**

```python
#!/usr/bin/env python3
"""组合名 - 实时监控脚本"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fund_monitor_core import process_portfolio, print_report

PORTFOLIO = [
    ("基金名称", "代码", 持有金额),
    # ...
]

if __name__ == '__main__':
    report = process_portfolio(PORTFOLIO, "组合显示名", "📊")
    print_report(report)
```

**Features:**
- 并行拉取所有基金 fundgz 数据（ThreadPoolExecutor, 8 workers, 3s timeout）
- QDII债券基金自动跳过 fundgz（已知无数据列表: QDII_BOND_NO_DATA），直接走ETF估算
- ETF缓存（2分钟TTL），同一ETF多次使用只请求一次
- 预热阶段并行拉取所有需要的ETF代理数据（ThreadPoolExecutor, 5 workers）

**Symlink scripts for cron**: Cron expects scripts in `~/.hermes/scripts/`:
```bash
cd ~/.hermes/scripts && ln -sf /opt/data/scripts/{fund_monitor_core,qdii_estimator,jianman,overseas,qieman}_monitor.py .
```

---

## Step 5: Generate HTML Dashboard Card

**Design specs (v3 — centered, large fonts):**

```css
body { font-family: 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; background: #0d1117; width: 920px; margin: 0 auto; padding: 28px; }
.title { font-size: 32px; font-weight: 800; text-align: center;
  background: linear-gradient(135deg, #58a6ff, #bc8cff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.subtitle { font-size: 19px; color: #8b949e; text-align: center; }

/* ⭐ 当日组合总涨跌幅 — 高亮区域 */
.daily-pnl { background: linear-gradient(135deg, rgba(88,166,255,0.15), rgba(188,140,255,0.15));
  border: 1px solid rgba(88,166,255,0.3); border-radius: 14px; padding: 16px 24px; text-align: center; margin-bottom: 18px; }
.daily-pnl .value { font-size: 38px; font-weight: 800; }

.row { display: flex; align-items: center; padding: 11px 18px; background: #161b22; border: 1px solid #21262d; border-radius: 10px; margin-bottom: 5px; }
.row-name { font-size: 21px; font-weight: 600; color: #c9d1d9; flex: 2.5; }
.row-code { font-size: 18px; color: #58a6ff; font-family: 'Consolas', monospace; background: rgba(88,166,255,0.12); padding: 3px 10px; border-radius: 5px; width: 80px; text-align: center; }
.row-amount { font-size: 22px; font-weight: 700; color: #f0f6fc; width: 140px; text-align: right; }
.row-change { font-size: 21px; font-weight: 700; width: 90px; text-align: right; }
```

Color convention: **Chinese market — 红涨绿跌**
```css
.up { color: #f85149; } .down { color: #3fb950; } .gray { color: #8b949e; }
```

**ETF estimation tag**: Show `ETF` badge on rows where QDII estimation was used:
```css
.tag { font-size: 16px; padding: 1px 6px; border-radius: 4px; }
.tag-em { background: rgba(88,166,255,0.2); color: #58a6ff; }
.tag-sina { background: rgba(188,140,255,0.2); color: #bc8cff; }
```

**Template structure**: Title → Subtitle → **当日组合总涨跌幅** (daily-pnl block) → Category Summary → 持仓明细 (rows) → Footer.

---

## Step 6: Screenshot & Send to WeChat

### ⚠️ CRITICAL: MEDIA delivery method

**WRONG** — `send_message` with MEDIA: goes as plain text, not image:
```python
send_message(message="MEDIA:/path/to/screenshot.png")  # ❌ shows literal text on WeChat
```

**CORRECT** — put MEDIA: in the **final response text** (goes through reply pipeline → extract_media → send_image_file):
```
最终回复：
📊 组合名 | 时间
数据摘要...
MEDIA:/opt/data/cache/screenshots/browser_screenshot_xxx.png
```

### Screenshot workflow

```python
# 1. Generate HTML
write_file('/tmp/portfolio_{name}.html', html_content)

# 2. Load in browser (fonts must be installed first!)
browser_navigate('file:///tmp/portfolio_{name}.html')

# 3. Take screenshot (vision analysis fails on DeepSeek, but screenshot IS captured)
browser_vision(question='check')
# → screenshot saved to /opt/data/cache/screenshots/browser_screenshot_xxx.png
# → Note the path from the error response

# 4. Include MEDIA: path in your final reply text — NOT in send_message
```

---

## Step 7: Cron Job

```python
cronjob(action='create',
    name='{组合名}-每小时估值',
    schedule='0 10-15 * * 1-5',   # Mon-Fri, 10:00-15:00 hourly
    script='{name}_monitor.py',    # Must be in ~/.hermes/scripts/
    repeat=0,                      # Forever
    prompt='''读取脚本输出并格式化报告：
📊 {组合名} | {时间}
总投入 ¥xx,xxx.xx | 估值 ¥xx,xxx.xx | {涨跌%}
---
分类汇总...
重点关注（涨跌超2%的基金）
简要点评（1-2句话）''')
```

**Cron schedule**: `30 11,15,21 * * 1-5` = 11:30, 15:00, 21:00 on weekdays (中午收盘, 下午收盘, 晚间美股开盘).

**Cron prompt template** (MUST include HTML card + screenshot + send steps):
```
第1步: cd /opt/data/scripts && python3 {name}_monitor.py 获取数据
第2步: 生成HTML卡片到 /tmp/{name}_card.html（深色主题/微软雅黑/竖向排列/红涨绿跌）
第3步: browser_navigate("file:///tmp/{name}_card.html") → browser_vision 截图
第4步: send_message(weixin, "MEDIA:{截图路径}") + 文字摘要
```

**Cron script path**: Scripts must be at `~/.hermes/scripts/`. Symlink from `/opt/data/scripts/`.

---

## Pure Frontend PWA/APK Architecture (Zero Backend Proxy)

When building a single-page HTML app or Android APK (WebView wrapper), all data must come from public APIs accessible from a browser `fetch()` call — **no backend proxy, no NAS relay**.

### Critical API Capability Matrix

| API | Source | Needs Referer? | Works in Browser? | Data |
|-----|--------|:---:|:---:|------|
| `fundgz.1234567.com.cn/js/{code}.js` | 天天基金 | ❌ No | ✅ Yes | dwjz, gsz, gszzl, jzrq, gztime |
| `push2.eastmoney.com/api/qt/stock/get?secid=105.{TICKER}` | 东方财富 | ❌ No | ✅ Yes | ETF real-time price/chg |
| `hq.sinajs.cn/list=gb_{ticker}` | 新浪财经 | ❌ No | ✅ Yes | ETF real-time price/chg |
| `api.fund.eastmoney.com/f10/lsjz` | 东方财富 | **✅ YES** | ❌ **NO** | Fund NAV history |
| `push2.eastmoney.com` (secid=0.{CODE}) | 东方财富 | ❌ No | ❌ Returns stock, not fund | — |

**Key insight**: Browsers **forbid** `fetch()` from setting `Referer` header. Any API requiring Referer (`f10/lsjz`) is **inaccessible** from pure frontend JavaScript. The only workaround is a backend proxy — but proxies are unreliable on mobile (NAS may be unreachable, process may die).

### Pure Frontend Data Flow

```
国内基金 → fundgz.1234567.com.cn  → dwjz(净值) + gsz(估值) + gszzl(涨幅%) + jzrq(净值日期)
QDII基金 → push2.eastmoney.com 或 hq.sinajs.cn → ETF实时价格替代
确认逻辑 → fundgz dwjz 与上次不同 → 标记已确认 ✅
```

### Confirmation Logic (Pure Frontend)

Without Eastmoney `f10/lsjz`, confirmation relies solely on 天天基金 `fundgz` API:

```javascript
// fundgz returns: {dwjz, gsz, gszzl, jzrq, gztime}
// jzrq = net value date (e.g. "2026-05-07")
// dwjz = unit net value for that date

if (prevDwjz && dwjz && parseFloat(dwjz) !== parseFloat(prevDwjz)) {
    // Net value changed → confirmed!
    // Calculate actual market value from new dwjz
    curVal = amount * parseFloat(dwjz) / parseFloat(prevDwjz);
    todayConfirmed.add(code);
}
```

**Trade-off**: 天天基金 `dwjz` updates ~2-6 hours later than 东方财富 `f10/lsjz` (usually by 8-10pm). During trading hours, only `gsz` (estimated value) is available — no confirmation until evening.

### Proxy Instability Lessons

When a proxy IS used (e.g., for `f10/lsjz` access):
1. **Process death is inevitable** — the proxy Python process will eventually die. Always add a watchdog (cron `*/5 * * * *` with `pgrep` check)
2. **Mobile-to-NAS connectivity is unreliable** — even on same WiFi, Android WebView may not reach `192.168.3.95:18900`
3. **Prefer systemd** over nohup when available; fall back to cron watchdog in containers
4. **Proxy downtime causes ALL confirmations to fail** — the app becomes useless. Pure frontend is more resilient.

### QDII ETF Proxy Mapping (Pure Frontend)

For QDII funds without `fundgz` support, use ETF real-time prices:

```javascript
const FUND_ETF_MAP = {
  '019547':['QQQ','em'],  // 纳指100 → QQQ via Eastmoney push2
  '050025':['SPY','sina'], // 标普500 → SPY via Sina
  '007360':['AGG','sina'], // 美元债 → AGG via Sina
  '100050':['BNDX','em'],  // 全球债 → BNDX via Eastmoney
  // ... full mapping in HTML
};
```

Both Eastmoney `push2` (105.{TICKER}) and Sina (`gb_{ticker}`) are used with fallback chain: try preferred source first, fall back to the other.

### Performance: Batch vs Sequential

**Do NOT batch API calls through a proxy** — adds a single point of failure:
```javascript
// ❌ Single point of failure
const navMap = await fetchEastMoneyBatch(allCodes); // proxy dies → everything fails

// ✅ Pure frontend — each API call independent
const promises = codes.map(code => fetchFundData(code)); // fundgz always available
```

---

## Pitfalls

1. **Chinese fonts CRITICAL**: Without `fonts-noto-cjk` + `fonts-wqy-microhei`, all Chinese characters render as tofu blocks (□□□) in browser screenshots
2. **Fund code A/C confusion**: OCR often can't distinguish A/C share class. Default to A (even code); user can correct
3. **QDII ETF估算覆盖**: QDII债券/海外股票基金通过追踪对应ETF（QQQ/SPY/AGG/EMB等）估算涨跌幅。双数据源：Eastmoney push2（优先）+ 新浪财经（备用）。天弘越南(008763)无代理ETF，仍显示"—"。
4. **MEDIA delivery**: MEDIA: must be in the **final response text** (reply pipeline → extract_media). Using `send_message(message="MEDIA:...")` sends literal text, NOT the image. Always put MEDIA: in your closing reply.
5. **Card design v3**: Centered layout, 920px width, all fonts +6px from original, mandatory "当日组合总涨跌幅" highlight block (38px value), ETF estimation rows tagged with ETF badge
5. **weixin.py patch fragile**: Verify and re-apply after every restart
6. **DeepSeek no vision**: `browser_vision` will always fail with "unknown variant image_url" error. The screenshot IS captured despite the error — check the `screenshot_path` in the error response
7. **Browser needs libnspr4.so**: If `browser_navigate` fails with "error while loading shared libraries", install the full dependency set from Step 0
8. **Pillow install fails on Debian 13**: Network issues may block pip. Use HTML→browser→screenshot as the only reliable image generation method
10. **QDII ETF API sourcing**: Yahoo Finance & Google Finance timeout from this server. Use ONLY: Eastmoney push2 (`105.{TICKER}`, fields f43/f170) for QQQ/EMB/BNDX/BND; Sina Finance (`gb_{ticker}`) for SPY/AGG/VGK/EWJ/EWG/EEM/VPL/VT/IWF/XLY/XLV/XBI/GLD. Always test new tickers before adding to FUND_ETF_MAP.
11. **Performance trap — large portfolios**: 37-fund portfolio with sequential API calls takes 2+ minutes. MUST use ThreadPoolExecutor for both fundgz fetches (8 workers) and ETF warmup (5 workers). Skip fundgz entirely for known bond-QDII codes (embed QDII_BOND_NO_DATA set).
12. **ETF cache is global**: `qdii_estimator.py` module-level `_cache` persists across imports. Same ETF used by multiple funds hits cache (2-min TTL). Warmup populates it once.
