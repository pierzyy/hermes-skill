---
name: fund-monitor-webview-apk
description: Build and maintain the FundMonitor Android APK — WebView + HTML/JS architecture with multi-source fund data engine, QDII ETF proxy, and dark-theme UI.
tags: [fund, android, webview, apk, qdii, etf, money-market, chinese-fund]
---

# Fund Monitor WebView APK

Android APK built as WebView wrapper around a single HTML/JS file. Compose UI was abandoned (black screen on target device). WebView is 100% reliable.

## Project Location & Build

```
/opt/data/FundMonitor-claude/
├── app/src/main/java/com/fundmonitor/MainActivity.kt   # WebView + OkHttp interceptor
├── app/src/main/assets/index.html                       # Full app (HTML/JS/CSS)
└── build.gradle.kts
```

### Debug Build (quick, unsigned)

```bash
cd /opt/data/FundMonitor-claude
ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk /opt/data/FundMonitor.apk
```

### Release Build (signed) — NAS memory constraints

The NAS has limited RAM (~7.7GB total, ~1.6GB free). Full `clean assembleRelease` with R8 minification needs 1.5GB+ heap. Reduce to 1.5GB and kill zombie Gradle processes first:

```bash
# 1. Kill hung/zombie Gradle daemons
pkill -9 -f gradle 2>/dev/null; sleep 2

# 2. Clean intermediates if assets changed (Gradle cache may miss HTML changes)
rm -rf app/build/intermediates/assets

# 3. Build with reduced heap (may timeout on foreground — use background if needed)
cd /opt/data/FundMonitor-claude
ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
  ./gradlew assembleRelease --no-daemon \
  -Dorg.gradle.jvmargs=-Xmx1536m
```

**Build timeout workaround**: When the NAS is under load, foreground builds may time out at 300s. Use background build + poll:

```bash
# Start background build
terminal(command="cd /opt/data/FundMonitor-claude && ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs=-Xmx1536m 2>&1", background=true, timeout=600)
# Returns session_id → use process(action='wait', session_id=..., timeout=120) to block until done
```

Typical build time: ~49s with warm Gradle cache, up to 5m on clean build.

### Sign the APK (manual, when build produces unsigned APK)

```bash
BUILD_TOOLS=/opt/android-sdk/build-tools/35.0.0
UNSIGNED=app/build/outputs/apk/release/app-release-unsigned.apk
KEYSTORE=/opt/data/fund_monitor_app/android/debug.keystore
# Keystore alias: fundmonitor, password: android

$BUILD_TOOLS/zipalign -p -f 4 "$UNSIGNED" /tmp/FundMonitor_aligned.apk
$BUILD_TOOLS/apksigner sign --ks "$KEYSTORE" --ks-pass pass:android \
  --ks-key-alias fundmonitor --key-pass pass:android /tmp/FundMonitor_aligned.apk
$BUILD_TOOLS/apksigner verify /tmp/FundMonitor_aligned.apk
cp /tmp/FundMonitor_aligned.apk /opt/data/FundMonitor.apk
```

### Portfolio Data Recovery (from portfolio_config.py)

If user data is lost (uninstall, data wipe), the canonical source for ALL portfolio holdings is:

```
/opt/data/fund_monitor_app/portfolio_config.py
```

This file defines all 8 portfolios with fund codes, names, and amounts. To embed them in the APK:

```python
exec(open('/opt/data/fund_monitor_app/portfolio_config.py').read())
# Build DEFAULT_PORTFOLIOS from PORTFOLIOS dict
# Each holding: [code, name, amount, cost, confirmedDate, chgPct, navDate, manualFlag]
```

The 8 portfolios are: 京东基金(🛒) 指数生财(📈) 简慢(🐢) 全天候(🌐) 海外全球(🌍) 长赢150(🏆) 稳稳财进(🏦) 个人养老基金(🏥)

### ⚠️ WebView Cache Stale JS (Beta 0512b fix)

Android WebView caches `file:///android_asset/index.html` aggressively. After APK reinstall, old JS may persist even though the APK contains new code.

**Fix**: Add cache-control meta tags and ask user to uninstall before reinstall:

```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
```

### Portfolio Data Recovery (from portfolio_config.py)

If user data is lost (uninstall, data wipe), the canonical source for ALL portfolio holdings is:

```
/opt/data/fund_monitor_app/portfolio_config.py
```

This file defines all 8 portfolios with fund codes, names, and amounts. To embed them in the APK:

```python
# Parse portfolio_config.py and generate DEFAULT_PORTFOLIOS
exec(open('/opt/data/fund_monitor_app/portfolio_config.py').read())

parts = ['const DEFAULT_PORTFOLIOS = {']
for name, cfg in PORTFOLIOS.items():
    emoji = cfg['emoji']
    parts.append(f'  "{name}":{{emoji:"{emoji}",name:"{name}",holdings:[')
    for code, fname, amt in cfg['holdings']:
        parts.append(f'    ["{code}","{fname}",{amt:.2f},{amt:.2f},"",0,"",0],')
    parts.append('  ]},')
parts.append('};')

new_default = '\n'.join(parts)
# Replace empty DEFAULT_PORTFOLIOS = {} in index.html
```

Each holding format: `[code, name, amount, cost, confirmedDate, chgPct, navDate, manualFlag]`

### Verify APK contains updated assets

```bash
python3 -c "
import zipfile
with zipfile.ZipFile('/opt/data/FundMonitor.apk', 'r') as z:
    html = z.read('assets/index.html').decode('utf-8')
    print(f'Size: {len(html)} bytes, has closingCache: {\"closingCache\" in html}')
"

## WebView Configuration (MainActivity.kt)

```kotlin
WebView(ctx).apply {
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.allowFileAccess = true
    settings.allowFileAccessFromFileURLs = true        // CRITICAL for CORS
    settings.allowUniversalAccessFromFileURLs = true    // CRITICAL for CORS
    settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW  // HTTPS in file://
}
```

### ⚠️ WebView Cache Stale JS（v4.0-0525b 增强修复）

Android WebView caches `file:///android_asset/index.html` aggressively. After APK reinstall, old JS may persist even though the APK contains new code. Symptoms: code changes verified in APK zip but user still sees old behavior.

**关键发现**：`clearCache(true)` + `LOAD_NO_CACHE` 只对 HTTP 请求生效，对 `file:///android_asset/` 的 HTML **完全无效**。

**完整修复（Kotlin 层，必须四管齐下）**：
1. `clearCache(true)` — 清除内存缓存
2. `clearHistory()` + `clearFormData()` — 清除导航/表单缓存
3. `deleteDatabase("webview.db")` + `deleteDatabase("webviewCache.db")` — 物理删除持久化缓存文件
4. URL 加版本参数破坏缓存 key：`loadUrl("file:///android_asset/index.html?v=106")`
5. 每次发版**必须 bump `versionCode`**，否则 Android 拒绝覆盖安装同版本 APK

**HTML meta 标签**（辅助，不可靠）：
```html
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
```

**User action**：卸载旧 APK 再装新的是最可靠的方式。如不卸载，WebView 可能仍用缓存资产。

### OkHttp Referer Injection

The `shouldInterceptRequest` WebViewClient intercepts API calls and injects Referer headers via OkHttp. This is how f10/lsjz (which requires Referer) works from a browser context:

```kotlin
val refererMap = mapOf(
    "fundgz.1234567.com.cn" to "https://fund.eastmoney.com/",
    "push2.eastmoney.com" to "https://quote.eastmoney.com/",
    "api.fund.eastmoney.com" to "https://fundf10.eastmoney.com/",
    "hq.sinajs.cn" to "https://finance.sina.com.cn/"
)
```

## Data Engine Architecture (JS)

### Three-Source Parallel Fetch

```
Promise.all([
  fetchF10Nav(code),      // 东方财富 f10/lsjz — official NAV (confirmation)
  fetchFundData(code),     // 天天基金 fundgz — real-time estimate (ALL funds)
  getETFEstimate(code)     // ETF proxy — real-time price (QDII)
])
```

**⚠️ v3.2 架构变更：不再预判跳过 fundgz。** 之前的 `skipFundgz` 提前阻止 QDII 基金调用 fundgz，但港股 QDII（如 022680 恒生科技）天天基金有有效估值。现在所有基金都调 fundgz：有数据自然用，空数据（jsonpgz(); 耗时 < 1s）自然落到 ETF/兜底路径。

### Market Hours Detection (API-driven, no hardcoded calendar)

**Do NOT hardcode annual holiday calendars.** Use a live API check instead — it handles holidays,
makeup trading days, and requires zero annual maintenance.

**Principle**: Sina's SSE index API (`hq.sinajs.cn/list=sh000001`) returns a date field (`p[30]`).
During market hours on a trading day, it equals today's date. On holidays or weekends, it shows
the last trading day's date. This difference is used to detect real-time market status.

```javascript
// ── Trading day cache + API check ──
let tradingDayCache = {}; // {'2026-05-09': true/false}
const TRADING_CACHE_KEY = 'fm_trading';

function loadTradingCache() {
  try { tradingDayCache = JSON.parse(localStorage.getItem(TRADING_CACHE_KEY) || '{}'); } catch(e) { tradingDayCache = {}; }
}
function saveTradingCache() {
  const keys = Object.keys(tradingDayCache).sort();
  while (keys.length > 30) delete tradingDayCache[keys.shift()];
  try { localStorage.setItem(TRADING_CACHE_KEY, JSON.stringify(tradingDayCache)); } catch(e) {}
}

async function checkMarketAlive() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const resp = await fetch('https://hq.sinajs.cn/list=sh000001',
      { headers: { 'Referer': 'https://finance.sina.com.cn/' }, signal: ctrl.signal });
    clearTimeout(t);
    const text = await resp.text();
    const m = text.match(/"([^"]*)"/);
    if (m) {
      const p = m[1].split(',');
      const apiDate = p[30] || ''; // Sina field 30 = date (YYYY-MM-DD)
      const todayStr = new Date().toISOString().slice(0, 10);
      return apiDate === todayStr;
    }
  } catch(e) {}
  return true; // API fail → assume trading (conservative fallback)
}

function isTradingDay(date) {
  const ds = typeof date === 'string' ? date : date.toISOString().slice(0, 10);
  if (tradingDayCache[ds] !== undefined) return tradingDayCache[ds];
  const d = typeof date === 'string' ? new Date(ds + 'T12:00:00') : date;
  return d.getDay() !== 0 && d.getDay() !== 6; // weekday heuristic, corrected at 9:30
}

function isMarketHours() {
  const now = new Date();
  if (!isTradingDay(now)) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return m >= 570 && m < 900; // 9:30-15:00 CST
}

// Periodic check (every 60s) — only fires API during 9:30-15:00 on weekdays, once per day
async function periodicTradingCheck() {
  const now = new Date();
  const ds = now.toISOString().slice(0, 10);
  const m = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay();
  if (day !== 0 && day !== 6 && m >= 570 && m < 900 && tradingDayCache[ds] === undefined) {
    const isAlive = await checkMarketAlive();
    tradingDayCache[ds] = isAlive;
    saveTradingCache();
    if (!isAlive) { updateMarketStatus(); /* refresh UI */ }
  }
}

// In init():
// loadTradingCache();
// setInterval(periodicTradingCheck, 60000);
// periodicTradingCheck();
```

**Timeline**: App starts → `loadTradingCache()` → `periodicTradingCheck()` runs immediately.
During 9:30-15:00 on weekdays, if today isn't cached yet, calls Sina API (3s timeout).
If date==today → cache true. If date!=today → cache false (holiday), refresh UI.
API failures default to true (conservative: assume trading, let other signals correct).

**Why this works**: Before 9:30, weekday heuristic is used (harmless — corrected within 60s).
After 9:30 on a holiday, the API shows yesterday's date → instantly detected as non-trading.
Makeup trading Saturdays: the API shows today's date → correctly detected as trading.
Results cached in localStorage (30-day sliding window).

### ⚠️ Non-Trading Hours Unified Priority — v3.5 final (Beta 0512e)

**After extensive trial and error (v3.2→v3.4→v3.5→0512a→b→c→d→e), the correct non-trading priority is:**

```
非交易时段 {
    ① closingCache（所有基金类型统一先查，不区分 QDII/国内）
       ├─ type='etf'  → ETF·新浪 QQQ（ETF ticker 合并到 badge，详情显示估算净值）
       └─ type='fundgz' → 天天基金 净值X.XX (时间)（去掉"收盘"字样）

    ② 无缓存 → f10 兜底
       ├─ QDII → QDII待更新（不确认！）
       └─ 国内 → f10，仅当 f10.dwjz ≠ prevDwjz 才确认
}
```

**Source display format (Beta 0512e)**:
- `天天` → `天天基金` (full name in badge)
- ETF badge includes ticker: `ETF·新浪 QQQ` (src format: `"ETF-新浪财经 QQQ"`, sourceBadge parses ticker)
- fundgz closingCache: `净值X.XX (HH:MM)` — no "估" prefix, no "收盘"
- ETF closingCache: `估X.XXXX` — estimated NAV = f10.dwjz × (1 + chgPct/100), no stale date
- Remove all "收盘"/"缓存" text from source_detail
- f10 confirmed: `净值X.XX (YYYY-MM-DD)` — unchanged

**Why this order**: QDII f10 lags T+1~T+2, domestic f10 is T+0 same-day — but during non-trading hours NEITHER has today's NAV yet. Both should use the most recent closing estimate. Only when the official NAV changes (evening f10 publish) should f10 take over.

**⚠️ Critical: Three synchronization points that MUST all agree:**

1. **`applyF10Confirmation` Path A** (~line 574): QDII exclusion guard — `if (isQdiiFund) return false`. Otherwise QDII gets confirmed via f10 before reaching the non-trading branch.

2. **`processFund` confirmed early-return** (~line 486): Gate behind `isMarketHours()`. During non-trading hours, confirmed funds must fall through to the non-trading branch (which uses closingCache). Without this gate, confirmed funds show `source='东方财富'` permanently.

3. **`doRefresh` confirmed fund assembly** (~line 1542): During non-trading hours (`!isMarketHours()`), put confirmed funds into the `unconfirmed` array so they go through `processFund`. During trading hours, keep the fast confirmed path.

**⚠️ Domestic f10 `canConfirm` must check NAV change (Beta 0512d)**:
Changed from `prevDwjz > 0 → canConfirm=true` to `prevDwjz > 0 && f10.dwjz !== prevDwjz → canConfirm=true`.
A bond fund with unchanged NAV was getting re-confirmed every refresh with chgPct=0, blocking closingCache.
Without this fix, prevNavs populated via fallthrough → next refresh Path B with same f10 → canConfirm but chgPct=0 → confirmed with 0%.

**⚠️ Critical: `saveClosingEstimate` runs at line 562, BEFORE the non-trading decision at line 669.** ETF/fundgz data fetched in the current doRefresh cycle is saved to closingCache first, then the non-trading branch reads it — same-cycle recovery works even after cleanup clears closingCache.

**⚠️ QDII must NEVER confirm when closingCache is empty.** If ETF APIs fail (WebView network issue), show `source='QDII待更新'`, `source_detail='... ETF离线'`, `cur_val=amount`. Confirming with f10 JZZZL would set h[5] → next refresh uses confirmed path → closingCache forever skipped.

**⚠️ Domestic f10 path only confirms on actual NAV change.** Changed from `prevDwjz > 0 → canConfirm=true` to `prevDwjz > 0 && f10.dwjz !== prevDwjz → canConfirm=true`. A bond fund with unchanged NAV (common) was getting re-confirmed every refresh with chgPct=0, blocking closingCache.

### Priority Decision (Branched: Trading vs Non-Trading) — v3.5 (Beta 0512b)

**⚠️ 非交易时段按基金类型分流（最终方案）**：
- **QDII**（有 ETF 映射或名称含 QDII 关键词）：closingCache 优先（ETF 代理价 > fundgz 估值）。**当 closingCache 为空时不确认**，f10 仅作兜底显示 `source='QDII待更新'`、 `source_detail='... ETF离线'`。因 f10 滞后 T+1~T+2，收盘缓存更准；确认会导致下次走 confirmed path 永远跳过 closingCache。
- **国内基金**（含黄金 ETF、港股通、债券等）：f10 优先（T+0 当日可用），但当 `canConfirm=false`（无 prevDwjz 且 JZZZL=null）时 **不返回**，继续走到 closingCache 兜底。同时保存 `prevNavs[code]=f10.dwjz` 使下次刷新 Path B 有 prevDwjz 可用。

**⚠️ 关键时序**：`saveClosingEstimate`（第 562 行）在 API 调用后立即执行，**早于**非交易时段决策（第 669 行）。本次刷新拉到的 ETF/fundgz 数据会先存入 closingCache，然后 QDII 分支就能读到——即使 closingCache 之前被清掉，同一次 doRefresh 也能恢复。

**⚠️ applyF10Confirmation Path A 必须排除 QDII**：`applyF10Confirmation` 在第 652 行执行，比分流（第 669 行）更早。Path A 入口处检查 `isQdiiFund` → QDII 直接 return false，防止抢走确认导致 QDII 分支永远走不到。

```
1. applyF10Confirmation(f10) — NAV 变了且能算出有效 chgPct 才确认
2. 非交易时段 → 按 isQdii 分流：
   QDII  → closingCache(ETF/fundgz) 优先 → f10 兜底标记"待更新"
   国内  → f10 优先（canConfirm 时确认）→ canConfirm=false 时走 closingCache 兜底
3. 交易时段 → fundgz → ETF → closingCache(8hTTL) → f10
```

**踩坑教训（v3.2→v3.4→v3.5）**：
- v3.2：closingCache 提到最优先 → 用户反馈"国内基金还在用5月8号的收盘估值" → 回退 f10 优先
- v3.2：f10 无条件优先 → QDII 的 T+2 滞后 f10 覆盖了 ETF 收盘数据 → QDII 永远显示过期净值
- v3.4：cleanup 剥离 h[4]/h[5] + 非交易 f10 路径以 chgPct=0 重新确认 → 所有基金永久显示 ¥0.00
- **v3.5 最终方案：按基金类型分流，QDII 走 closingCache，国内走 f10**

**Both paths start with:**
1. **applyF10Confirmation(f10)** → 只在能算出有效 chgPct 时才确认。Path A（无 prevDwjz）：要求 f10.chg_pct ≠ null 且 ≠ 0；Path B（有 prevDwjz）：比较新旧 NAV。不满足条件返回 false，进入分流分支。

**⚠️ Non-trading hours — QDII branch: closingCache FIRST, f10 fallback.**
```
const isQdii = QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code] || isQdiiByName(name);
if (isQdii) {
    const c = closingCache[code];
    if (c && (Date.now() - c.savedAt <= 8h)) {
        if (c.type === 'etf') → use ETF proxy price, source='ETF-新浪/东方财富'
        if (c.type === 'fundgz') → use fundgz estimate, source='天天基金' (港股 QDII 如 022680)
    }
    if no cache → f10 fallback: source='QDII待更新', cur_val=amount (不确认)
}
```

**⚠️ Non-trading hours — Domestic branch: f10 FIRST, closingCache fallback.**
```
if (f10 && dwjz && jzrq >= threshold) {
    // Try auto-confirm with canConfirm guard
    if (prevDwjz > 0 || f10.chg_pct ≠ null/0) → confirm + return
    // canConfirm=false: set f10 metadata but DON'T return → fall through to closingCache
}
// closingCache: try fundgz type (bond funds, etc.), then last-resort f10 display
```

**Trading hours branch (`isMarketHours()`):**
1. **applyFundgz(fi)** → Live fundgz estimate (domestic funds, all called)
2. **applyETF(etf)** → Live ETF proxy price (QDII funds)
3. **applyClosingCache()** → When both fundgz and ETF fail, use last known cache (8h TTL)
4. **f10-only fallback** → QDII with only f10 shows "待更新"; domestic shows f10 normally

### NAV Confirmation Rules (applyF10Confirmation) — v3.6 (Beta 0512f)

The confirmation logic has been fundamentally restructured to respect "today's publication" as the confirmation signal, not just NAV date comparison.

**Key principle**: A fund should only be confirmed when its official NAV was PUBLISHED today. For domestic funds, this means jzrq >= today's calendar date. For QDII funds, this means the NAV value actually changed (new publication detected by dwjz delta).

```javascript
function applyF10Confirmation(f10data) {
    if (!f10data || !f10data.dwjz) return false;
    if (isMarketHours()) return false; // 盘中不确认

    let shouldConfirm = false;

    if (!prevDwjz) {
      // Path A: 首次加载 — 按基金类型区分判定
      const isQdiiFund = QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code] !== undefined || isQdiiByName(name);
      if (isQdiiFund) {
        // QDII: Path A 永不确认 — f10 滞后 T+1~T+2，JZZZL 可能是前几天的旧数据
        // 等 Path B(f10.dwjz 变化)再确认
      } else {
      // 国内: jzrq >= 今天(日历日) → 确认
      if (f10data.jzrq) {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (f10data.jzrq >= todayStr) { shouldConfirm = true; }
      }
      // ⚠️ FOF 兜底：仅限养老 FOF/目标日期基金（名称含 FOF|养老|目标日期|目标风险）
      // 正常国内基金 15:00-20:00 f10 未更新时 JZZZL 是昨天的涨跌幅，误用会导致：
      //   × chgPct=+1.75%(昨天) 而非 -0.22%(今天)
      //   × prevNavs 污染 → 后续刷新叠加放大
      if (!shouldConfirm && /FOF|养老|目标日期|目标风险/.test(name||'') && f10data.chg_pct != null && f10data.chg_pct !== 0) {
        shouldConfirm = true;
      }
      }
    } else {
      // Path B: 有历史净值 — 比较新旧 + 确认是当天发布的
      const isQdiiB = QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code] !== undefined || isQdiiByName(name);
      if (parseFloat(f10data.dwjz) !== parseFloat(prevDwjz)) {
        if (isQdiiB) {
          // QDII: dwjz 变化 = 新净值发布 → 确认（净值日期必然滞后）
          shouldConfirm = true;
        } else if (f10data.jzrq) {
          // 国内: dwjz 变化 + jzrq >= 今天 → 确认（防止用昨天的中间数据确认）
          const todayStr = new Date().toISOString().slice(0, 10);
          if (f10data.jzrq >= todayStr) { shouldConfirm = true; }
        }
      }
    }

    if (shouldConfirm) {
      r.confirmed = true;
      r.dwjz = f10data.dwjz;
      r.nav_date = f10data.jzrq || '';
      r.source = '东方财富';
      r.source_detail = '净值' + f10data.dwjz + (f10data.jzrq ? ' ('+f10data.jzrq+')' : '');
      try {
        if (prevDwjz && parseFloat(prevDwjz) > 0) {
          r.cur_val = amount * parseFloat(f10data.dwjz) / parseFloat(prevDwjz);
          r.chg_pct = f10data.chg_pct != null ? f10data.chg_pct : ((parseFloat(f10data.dwjz)/parseFloat(prevDwjz)-1)*100);
        } else {
          r.chg_pct = f10data.chg_pct != null ? f10data.chg_pct : 0;
          r.cur_val = amount * (1 + r.chg_pct / 100);
        }
        r.chg_str = (r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
        r.gain = r.cur_val - amount;
        r.gain_str = (r.gain>=0?'+':'')+r.gain.toFixed(2);
      } catch(e) {}
      return true;
    }
    return false;
}
```

**Why Path A with getTradingDate()**: When prevDwjz is null (first install, app restart), `prevDwjz && ...` short-circuits to false. Using `getTradingDate()` instead of `new Date()` handles:
- **Holiday Monday**: `getTradingDate()` = last Friday → `yesterdayOfTd` = Thursday → jzrq (Friday) >= Thursday → confirms ✅
- **Normal Tuesday**: `getTradingDate()` = Tuesday → `yesterdayOfTd` = Monday → jzrq (Tuesday or Monday for QDII T+1) >= Monday → confirms ✅
- **App restart**: prevDwjz is null → Path A fires first refresh, sets prevNavs → subsequent refreshes use Path B comparison

**⚠️ Path A is NOT the only confirmation gate.** There's a second line of defense in the non-trading f10 fallback branch. On subsequent refreshes, Path B may skip confirmation because prevDwjz matches f10's unchanged DWJZ (e.g., a bond fund with 0.00% change). The non-trading f10 branch compensates:

```javascript
// In the non-trading hours branch (AFTER closingCache check):
if (f10 && f10.dwjz) {
    // Check if jzrq is recent → auto-confirm
    if (f10.jzrq && f10.jzrq >= (getTradingDate() - 1 day)) {
        r.confirmed = true;
        r.nav_date = f10.jzrq;
    }
    // Apply f10 NAV (all funds, including QDII)
    return r;
}
// closingCache was already checked BEFORE this block — it's not a fallback here
```

**Why this dual-gate matters**: Without it, funds whose NAV hasn't changed (common for bond funds) would fall through to `closingCache` on every subsequent refresh, showing "收盘估值" instead of "✅ 东方财富 净值X.XX (date)". The 110035 bug was exactly this — a domestic bond fund with 0.00% change that always showed fundgz closingCache because Path A confirmed once (prevDwjz null) then Path B never re-confirmed (same NAV) and the non-trading branch prioritized closingCache over f10.

### Money Market Fund Confirmation

Money funds have an **early-return path** that bypasses the main confirmation chain. They MUST have their own confirmation logic inline. Date check uses `getTradingDate()` (not `new Date()`) for holiday correctness:

```javascript
if (MONETARY_FUNDS.has(code)) {
    // Already confirmed today → skip API
    if (todayConfirmed.has(code)) {
        r.confirmed = true;
        r.source = '货币基金';
        r.source_detail = prevNavs[code] ? '万份'+prevNavs[code]+'元' : '';
        return r;
    }
    const mf10 = await fetchF10Nav(code);
    if (mf10 && mf10.dwjz) {
        const wanfen = parseFloat(mf10.dwjz);
        r.cur_val = amount; // NAV ≈ 1.0000
        r.gain = wanfen * amount / 10000;
        r.dwjz = mf10.dwjz;
        // Non-trading hours: 万份收益 locked → confirm
        if (!isMarketHours() && mf10.jzrq) {
            // ⚠️ Use getTradingDate(), not new Date().toISOString()
            if (mf10.jzrq >= getTradingDate()) {
                r.confirmed = true;
                r.source = '货币基金';
                r.source_detail = '万份'+wanfen.toFixed(4)+'元 ('+mf10.jzrq+')';
                return r;
            }
        }
        r.source = '货币基金';
        return r;
    }
    return r;
}
```

### Post-Confirmation Holding Amount Update

After confirmation, `doRefresh()` auto-updates the holding amount to the confirmed market value:

```javascript
if (f.confirmed && f.dwjz) {
    const h = portfolioData[k].holdings.find(h => h[0] === f.code);
    if (h && Math.abs(h[2] - f.cur_val) > 0.005) {
        h[2] = f.cur_val;  // holding amount = confirmed market value
        portfolioChanged = true;
    }
}
if (portfolioChanged) savePortfolios(portfolioData);
```

This ensures the next trading day uses the confirmed closing value as the baseline for gain calculation. **No lock** — user can still manually edit via ✏️ Edit button.

### Confirmed Fund Source Display (v3.0+)

**UI pattern**: ✅ prefix on fund name + yellow "东方财富" badge + "净值X.XX (date)" detail. The "已确认" green badge is no longer used.

Three places where confirmed source is set:

1. **applyF10Confirmation** (first confirmation): `source='东方财富'`, `source_detail='净值1.2345 (2026-05-09)'`
2. **processFund confirmed path** (rare fallback): `source='东方财富'`, `source_detail='净值'+prevNavs[code]`
3. **doRefresh confirmed assembly** (subsequent refreshes): `source='东方财富'`, `source_detail` uses both `prevNavs` (in-memory) and `h[4]` (persistent date):

```javascript
source_detail: (prevNavs[h[0]] ? '净值'+prevNavs[h[0]]+(h[4]?' ('+h[4]+')':'') : (h[4]?h[4]:''))
```

**Why h[4] fallback matters**: `prevNavs` is in-memory only, cleared on app restart. `h[4]` (confirmedDate) survives in localStorage. Without the h[4] fallback, source_detail shows empty after app restart even though the fund IS confirmed.

**Name display**: The renderPortfolio table prepends ✅ to confirmed fund names: `(f.confirmed?'✅ ':'')+f.name`. Combined with the blue row background (`tr.confirmed td { background:rgba(10,132,255,0.1) }`), confirmed funds are visually distinct.
```

### Holding Amount Logic (Full Design) — v2.6+

The holding amount lifecycle follows user-defined rules:

**Data structure**: `holdings[i] = [code, name, h[2]=currentAmount, h[3]=costBasis, h[4]=confirmedDate, h[5]=confirmedChgPct, h[6]=navDate]`

`h[4]` = the trading date when confirmation happened (from `getTradingDate()`).
`h[6]` = the actual NAV date from f10's `jzrq` field. These DIFFER for QDII T+1 funds: `h[4]`=Tuesday, `h[6]`=Monday. `h[6]` is what's displayed to the user; `h[4]` is used for cross-session confirmation state restoration.

Fields h[4] and h[5] are the **persistent confirmation state** — stored in localStorage alongside the fund data so app restart doesn't lose which funds are confirmed. See Confirmation Persistence section below.

**During market hours (未确认)**:
- `h[2]` = previous night's confirmed amount (or manually edited value)
- Manual edits via ✏️ are preserved — **do NOT call doRefresh() after edit** (removed from `editFundById` callback)
- P&L syncs with current `h[2]`: `cur_val = h[2] × gsz / dwjz`

**After confirmation**:
- NAV change applied to current `h[2]`: `h[2] = h[2] × newNAV / oldNAV`
- Confirmation date and daily change % saved to `h[4]`/`h[5]` **in the holdings array** (persists via `savePortfolios`)
- Also stored in runtime globals `todayConfirmed` Set and `confirmedChgPct` map
- If user manually edits AFTER confirmation: the edited `h[2]` is assumed to already include the day's gain. P&L reverse-calculated: `gain = h[2] - h[2]/(1 + chgPct/100)`

**Key globals for confirmation tracking**:
```javascript
const confirmedChgPct = {}; // {code: daily_change_percent} — stored at confirmation time
const todayConfirmed = new Set(); // Set of confirmed fund codes
let lastTradingDate = ''; // Detects trading day boundary crossing at 9:30
```

### Holdings Data Structure (v3.0+)

`holdings[i] = [code, name, h[2]=currentAmount, h[3]=costBasis, h[4]=confirmedDate, h[5]=confirmedChgPct, h[6]=navDate, h[7]=manualEditFlag]`

- **h[4]**: 确认交易日 (`getTradingDate()`) — 用于跨 session 恢复确认状态
- **h[6]**: 净值日期 (f10 API 的 `jzrq`) — 用于显示。QDII T+1 时 h[4]≠h[6]
- **h[7]**: 手动编辑标志 (0=自动/1=手动) — 确认时不覆盖手动输入的持有金额
- Migration in loadPortfolios: `h.length===6 → h.push('')`; `h.length===7 → h.push(0)`
- Default init: `[c,n,a,a,'',0,'',0]` (8 elements)
- editFundById preserves h[4]/h[5]/h[6] and sets h[7]=1

### Confirmation State Persistence (h[4]/h[5]/h[6]) — v2.8+

**Problem**: On app restart, `todayConfirmed` and `confirmedChgPct` are empty (in-memory only). All funds re-confirm via f10, and `cur_val = amount * (1 + chgPct/100)` adds the day's gain ON TOP of an amount that already includes it — **double-counting the gain**.

**Solution**: Store confirmation state directly in the holdings data array (h[4]=date, h[5]=chgPct), which survives app restarts via `savePortfolios()` → localStorage.

**Migration** (in `loadPortfolios`):
```javascript
if (h.length === 3) h.push(h[2]);       // [c,n,a] → [c,n,a,a]
if (h.length === 4) { h.push(''); h.push(0); }  // [c,n,a,a] → [c,n,a,a,'',0]
if (h.length === 5) h.push(0);           // [c,n,a,a,''] → [c,n,a,a,'',0]
if (h.length === 6) h.push('');          // [c,n,a,a,'',0] → [c,n,a,a,'',0,'']
```

**Restore on load**:
```javascript
const today = getTradingDate(); // uses 9:30 boundary, see below
if (h[4] === today) {
    todayConfirmed.add(h[0]);
    confirmedChgPct[h[0]] = h[5] || 0;
}
```

**Save on confirmation** (in `doRefresh` post-processing):
```javascript
if (f.confirmed && f.dwjz) {
    todayConfirmed.add(f.code);
    prevNavs[f.code] = f.dwjz;
    confirmedChgPct[f.code] = f.chg_pct;
    const today = getTradingDate();
    if (h[4] !== today || h[5] !== f.chg_pct) {
        h[4] = today;
        h[5] = f.chg_pct;
        portfolioChanged = true;
    }
    if (f.nav_date && h[6] !== f.nav_date) {
        h[6] = f.nav_date; // actual NAV date from f10.jzrq (differs for QDII T+1)
        portfolioChanged = true;
    }
    if (Math.abs(h[2] - f.cur_val) > 0.005) {
        h[2] = Math.round(f.cur_val * 100) / 100;
        portfolioChanged = true;
    }
}
```

### Trading Day Boundary (getTradingDate / lastTradingDate)

**⚠️ CRITICAL RULE: ALL date comparisons in confirmation logic MUST use `getTradingDate()`, never `new Date().toISOString()` or `new Date() - 86400000`.** Using calendar date causes failures on A-share holidays.

Confirmation state persists until **9:30 AM** of the next trading day, NOT midnight.
`getTradingDate()` walks backwards through non-trading days to find the last actual trading day.

```javascript
function getTradingDate() {
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < 570) { now.setDate(now.getDate() - 1); }
  // Walk back through cached non-trading days
  while (!isTradingDay(now)) {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().slice(0, 10);
}
```

**Why this matters — three places that were fixed:**
1. `applyF10Confirmation` Path A: `yesterdayOfTd = getTradingDate() - 1 day` (was `new Date() - 86400000`)
2. Money fund confirmation: `mf10.jzrq >= getTradingDate()` (was `new Date().toISOString()`)
3. `loadPortfolios` restore: `h[4] === getTradingDate()` (already correct)

**Auto-clear on new trading day** (at start of `doRefresh`):
```javascript
const td = getTradingDate();
if (lastTradingDate && td !== lastTradingDate) {
    todayConfirmed.clear();
    for (const k in confirmedChgPct) delete confirmedChgPct[k];
}
lastTradingDate = td;
```

**Confirmed fund path in processFund** (v3.0+):
```javascript
if (todayConfirmed.has(code)) {
    const chgPct = confirmedChgPct[code] || 0;
    r.confirmed = true;
    r.cur_val = amount;
    const preAmount = amount / (1 + chgPct / 100);
    r.gain = amount - preAmount;
    r.gain_str = (r.gain>=0?'+':'')+r.gain.toFixed(2);
    r.chg_pct = chgPct;
    r.chg_str = (chgPct>=0?'+':'')+chgPct.toFixed(2)+'%';
    r.source = '东方财富'; // NOT '✅ 已确认'
    r.source_detail = prevNavs[code] ? '净值'+prevNavs[code] : '';
    return r;
}
```

**Critical: doRefresh() confirmed fund assembly** — must use fresh h[2] and proper source:
```javascript
if (todayConfirmed.has(h[0])) {
    const chgPct = confirmedChgPct[h[0]] || 0;
    const preAmount = h[2] / (1 + chgPct / 100);
    const gain = h[2] - preAmount;
    confirmedFunds.push({
        code: h[0], name: h[1], amount: h[2], cur_val: h[2],
        chg_pct: chgPct, chg_str: (chgPct>=0?'+':'')+chgPct.toFixed(2)+'%',
        gain: gain, gain_str: (gain>=0?'+':'')+gain.toFixed(2),
        source: '东方财富', // NOT '✅ 已确认'
        source_detail: (prevNavs[h[0]]?'净值'+prevNavs[h[0]]+((h[6]||h[4])?' ('+(h[6]||h[4])+')':''):(h[4]?h[4]:'')),
        confirmed: true, dwjz: prevNavs[h[0]]||''
    });
}
```

**Edit callback — remove doRefresh() to prevent overwrite**:
```javascript
// In editFundById callback:
h[i] = [nc, nn, na, nc_cost, h[i][4]||'', h[i][5]||0, h[i][6]||''];
savePortfolios(portfolioData);
renderPortfolio(key);
// NO doRefresh() here — prevents cur_val from overwriting manual h[2]
toast('已更新 「'+nn+'」');
```

**Save confirmedChgPct during confirmation** (in doRefresh post-processing):
```javascript
if (f.confirmed && f.dwjz) {
    todayConfirmed.add(f.code);
    prevNavs[f.code] = f.dwjz;
    confirmedChgPct[f.code] = f.chg_pct;  // ← store for later P&L recalculation
    const h = portfolioData[k].holdings.find(h => h[0] === f.code);
    if (h && Math.abs(h[2] - f.cur_val) > 0.005) {
        h[2] = Math.round(f.cur_val * 100) / 100;
        portfolioChanged = true;
    }
}
```

### Closing Valuation Cache (closingCache) — v3.2

**TTL**: 统一 8 小时，不再区分交易/非交易。理由是 closingCache 是兜底——实时数据到了就会覆盖，不会用过时缓存。之前交易时段 5 分钟的 TTL 导致「9:30 看一眼→杀 app→11:00 再看」数据全丢。

**⚠️ loadClosingCache 交易时段清空 Bug（v3.2 修复）**：`loadClosingCache()` 曾包含 `if (isMarketHours()) { localStorage.removeItem('fm_closing_cache'); return; }`——交易时段重启 app 直接删除所有收盘缓存。已移除：`applyClosingCache()` 自带 TTL 过期处理，无需手动清空。

**⚠️ 非交易时段 type:'etf' 缓存被忽略 Bug（v3.2 修复）**：非交易时段兜底只检查了 `type:'fundgz'`，QDII 的 `type:'etf'` 缓存（ETF 收盘代理价格）永远被跳过——两个缺陷叠加导致 QDII 非交易时段永远显示过期 f10。修复：非交易时段先查 closingCache，同时支持 `type:'etf'` 和 `type:'fundgz'`。

**⚠️ saveClosingEstimate QDII + Fundgz Edge Case（v3.2 修复）**：QDII-by-name 且有 fundgz 数据但无 ETF 映射的基金（如 022680 恒生科技），`!isQdii` 守卫阻止了 fundgz 保存到 closingCache → 非交易时段无兜底。修复：有 fundgz 数据就保存，不管是否 QDII。ETF 有数据时优先覆盖。

**调用位置**：
1. 非交易时段 closingCache 优先（含 ETF 和 fundgz 两种类型）→ `source_detail='QQQ +0.45% 收盘'`
2. 交易时段 applyETF 失败后兜底 → `source_detail='QQQ +0.45%'`

### Refresh Result Persistence (cross-kill restore) — v3.2+

**Problem**: Killing the app during trading hours loses all last-known fund data. On reopen, `doRefresh()` must re-fetch everything from APIs, showing "加载中" until all data arrives.

**Solution**: Persist `portfolioResults` to localStorage after every successful refresh. On `init()`, restore cached results and render immediately before starting background refresh.

```javascript
// In doRefresh(), after portfolioResults = results:
try { localStorage.setItem('fm_portfolio_results', JSON.stringify({...results, _ts: Date.now()})); } catch(e) {
  console.error('save fm_portfolio_results failed:', e); }

// In init(), after loadPrevNavs():
try {
  const raw = localStorage.getItem('fm_portfolio_results');
  if (raw) {
    const cached = JSON.parse(raw);
    // 4 小时 TTL：覆盖整个交易时段
    if (cached._ts && (Date.now() - cached._ts < 4*3600*1000)) {
      delete cached._ts;
      // 逐个恢复：只恢复当前存在的组合（不要求数量匹配！）
      let restoredAny = false;
      for (const k of portfolioKeys) {
        if (cached[k] && cached[k].funds && cached[k].funds.length > 0) {
          if (!portfolioResults[k]) portfolioResults[k] = cached[k];
          restoredAny = true;
        }
      }
      if (restoredAny) hasCachedResults = true;
    }
  }
} catch(e) { console.error('load fm_portfolio_results failed:', e); }
// Then render immediately (renderOverview/renderPortfolio uses portfolioResults)
// setTimeout(() => doRefresh(), 100) — starts background refresh almost immediately
```

**⚠️ 曾被丢弃的 Bug**：之前使用 `Object.keys(cached).length === portfolioKeys.length` 做严格数量匹配。用户增删一个组合，缓存全体丢弃——包括国内和 QDII 全部丢失。改为逐个恢复，不要求数量匹配。

**Expiry**: 4 hours. Covers the full trading session (9:30-15:00 = 5.5h with buffer).

### Parallel ETF Fetch — v3.1+ (working approach)

**Was**: Sequential try — `fetchEastmoney(etf)` → if fail, `fetchSina(etf)`. Max latency = 8s + 8s = 16s.

**Now**: Fire both promises immediately, await primary first, fall back to secondary. Both run in parallel, but code only uses standard `Promise` (no ES2020). Max latency still ~8s (primary) + negligible time for secondary (already in-flight or cached).

```javascript
// ✅ 同时发出两个请求，先等首选源，失败则用备选
const emP = fetchEastmoney(etf);
const sinaP = fetchSina(etf);
const primary = (pref === 'em') ? emP : sinaP;
const secondary = (pref === 'em') ? sinaP : emP;
let r = await primary;
if (!r) r = await secondary;
```

`fetchEastmoney`/`fetchSina` internally catch all errors and return `null`, so they never reject. The secondary `await` is nearly instant if the primary was slow (request already in-flight).

### API Timeouts — v3.1+

| API | Timeout | Rationale |
|-----|---------|-----------|
| fetchF10Nav | 6s | f10 is slow but rarely needed during trading hours |
| fetchFundData (fetch) | 5s | fundgz is fast, 5s is plenty |
| fetchFundData (JSONP) | 5s | Same endpoint, matching timeout |
| fetchSina ETF | **8s** | ⚠️ Sina gb_ endpoints are noticeably slow — do NOT reduce below 8s |
| fetchEastmoney ETF | **8s** | ⚠️ Keep at 8s for reliability; reducing to 5s broke ETF fetching entirely |

**Pitfall**: Reduced ETF timeouts from 8s→5s broke ALL ETF data fetching. Both Sina and Eastmoney ETF endpoints need the full 8s window. Do not touch these.

### ⚠️ Non-Trading Hours Data Priority Design (v3.5 final — Beta 0512e)

**The correct priority for ALL fund types during non-trading hours:**

```
非交易时段 {
    ① 今日已确认(todayConfirmed) → 维持确认，返回东方财富（不退回缓存）
    ② closingCache 优先（所有类型）
       ├─ ETF 类型 → ETF·新浪 QQQ（涨跌幅来自缓存，详情显示估1.3573）
       └─ fundgz 类型 → 天天基金 净值1.2345 (16:00)
    ③ 无缓存 → f10 兜底
       ├─ QDII → QDII待更新（不敢用滞后的 f10 确认）
       └─ 国内 → f10，仅当 f10.dwjz ≠ prevDwjz 才确认
}
```

**Three critical gates that must work together:**

1. **`applyF10Confirmation` Path A** — split by fund type:
   - QDII: check `f10.chg_pct != null && !== 0` (JZZZL valid = new NAV published, regardless of jzrq date lag)
   - Domestic: check `jzrq >= new Date().toISOString().slice(0,10)` (today's calendar date)
   
2. **`processFund` confirmed early return** (line ~486): gate behind `&& isMarketHours()`. During non-trading, let confirmed funds fall through to closingCache check (but top guard catches them).

3. **`doRefresh` confirmed dispatch**: during `!isMarketHours()`, send confirmed funds to `unconfirmed` array (processFund) instead of `confirmedFunds` array (hardcoded 东方财富).

4. **Non-trading top guard**: `if (todayConfirmed.has(code))` → return confirmed data immediately, skip closingCache. This prevents the "first refresh correct, second refresh goes back to cache" bug.

**Source display (Beta 0512e):**
- Badge: "天天基金" (was "天天"), "ETF·新浪 QQQ" (ticker merged into badge)
- ETF closing: `估1.3573` (computed: f10.dwjz × (1 + chgPct/100), no stale date)
- fundgz closing: `净值1.2345 (16:00)` (no "收盘" text)
- f10 confirmed: `净值1.2345 (2026-05-11)` (date from f10.jzrq, valid for QDII lag)

**Cleanup migration gotcha**: Version-gated cleanup that strips h[4]/h[5] causes all funds to re-confirm with 0% chgPct. Fix: strip ONLY h[5]===0 for non-money-market (known corruption), keep valid chgPct. Never clear closingCache in cleanup — QDII needs it for non-trading display.

### ⚠️ Non-Trading f10 Confirmation chg_pct Bug (v3.2 fix)

**Bug** (introduced v3.2, fixed 0511j): The non-trading hours f10 confirmation path (added when closingCache was prioritized) computed `r.chg_pct` from `f10.chg_pct` (API's JZZZL field), which is frequently `null` or `0`. This got persisted to `h[5]` → `confirmedChgPct = 0` → all confirmed funds showed 0% change after restart.

**Root cause**: Two confirmation paths had inconsistent chg_pct calculation:
- `applyF10Confirmation` (old path): `r.chg_pct = (dwjz / prevDwjz - 1) * 100` ← correct
- Non-trading f10 branch (new path): `r.chg_pct = f10.chg_pct` (JZZZL) ← often null

**Fix**: The non-trading f10 confirmation path MUST also use prevDwjz comparison for chg_pct, with JZZZL as fallback only:

```javascript
// ✅ Correct: prevDwjz first, JZZZL as fallback
if (prevDwjz && parseFloat(prevDwjz) > 0) {
  r.chg_pct = (parseFloat(f10.dwjz) / parseFloat(prevDwjz) - 1) * 100;
} else if (f10.chg_pct != null) {
  r.chg_pct = f10.chg_pct;
}
r.chg_str = (r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
r.cur_val = amount * (1 + r.chg_pct / 100);
r.gain = r.cur_val - amount;
r.gain_str = (r.gain>=0?'+':'')+r.gain.toFixed(2);
```

**Impact**: This bug caused ALL funds confirmed via the non-trading path to permanently show 0% change. The value was persisted to localStorage (h[5]) and restored on next app launch via `confirmedChgPct[h[0]] = h[5]||0`.

**⚠️ applyF10Confirmation Path A MUST exclude QDII（v3.5 关键修复）**：
`applyF10Confirmation` 在 processFund 的第 652 行执行，比非交易时段 QDII/国内 分流（第 669 行）
更早。如果不加 QDII 判断，QDII 基金的 Path A（无 prevDwjz + f10.jzrq 够新 → shouldConfirm=true）
会直接抢走确认，以 `r.source='东方财富'` 返回，导致非交易时段 QDII 分支（closingCache 优先）
永远走不到。修复：Path A 入口处检查 `isQdiiFund` → QDII 直接 return false。

**⚠️ saveClosingEstimate 在非交易时段也能填充 closingCache（Beta 0512a 发现）**：
`saveClosingEstimate` 在 API 调用完成后立即执行（第 562 行），早于非交易时段决策（第 669 行）。
本次刷新拉到的 ETF/fundgz 数据会先存入 closingCache，然后 QDII 分支就能读到——即使
closingCache 之前被 cleanup 清掉，同一次 doRefresh 也能恢复。这保证 QDII 在 cleanup 后
首次刷新就能用到 ETF 收盘缓存。

**⚠️ QDII 无收盘缓存时不得以 f10 确认（Beta 0512a）**：
当 ETF API 拉取失败（WebView 中 hq.sinajs.cn 可能超时/被拒）导致 closingCache 为空时，
QDII 非交易分支的 f10 兜底 **不得设置 `r.confirmed=true`**。应以 `source='QDII待更新'`、
`source_detail='净值X.XX (date) ETF离线'` 显示，让用户看到诊断标记；cur_val=amount 不改变
持有金额。一旦确认（即使 JZZZL 有效），`h[5]=f10.chg_pct` 持久化后，下次刷新走 confirmed
path（source='东方财富'），closingCache 即便后来恢复也无法显示。

**⚠️ 国内基金 canConfirm=false 时应保存 prevNavs（Beta 0512a）**：
当 f10 数据近期可用但 `canConfirm=false`（无 prevDwjz 且 JZZZL=null）时，国内基金不回退
到 closingCache。但应在此处设置 `prevNavs[code]=f10.dwjz`，确保下次刷新 Path B 有 prevDwjz
可用，从而能正确计算涨跌幅并确认。不设的话会陷入死循环——每次刷新都 canConfirm=false。

### ⚠️ Non-Trading f10 Auto-Confirm with Invalid chgPct (v3.5 fix)

**Bug** (discovered 0512): The non-trading f10 path unconditionally set `r.confirmed = true` regardless of whether it could compute a meaningful chgPct. When `prevDwjz` was unavailable (fresh install, cleanup migration) AND `f10.chg_pct` (JZZZL) was null or 0, the fund got confirmed with `chgPct=0` → persisted to `h[5]=0` → **permanently showed 0% gain** until the next trading day boundary.

**Trigger scenarios**:
1. **One-time cleanup v3.4**: Stripped all `h[4]/h[5]` + cleared `prevNavs` → non-trading f10 path had no `prevDwjz` → re-confirmed with `chgPct=0` → `h[5]=0` persisted.
2. **Fresh install**: No `prevNavs`, no `prevDwjz` → first non-trading refresh confirms everything at 0%.

**Fix** (v3.5): Add `canConfirm` guard — only auto-confirm when we can compute a meaningful chgPct:

```javascript
if (f10 && f10.dwjz && f10.jzrq && f10.jzrq >= f10ThresholdStr) {
    r.dwjz = f10.dwjz;
    r.source = '东方财富';
    r.source_detail = '净值 ' + f10.dwjz + ' ('+f10.jzrq+')';
    r.nav_date = f10.jzrq;
    // ⚠ Only auto-confirm with meaningful chgPct
    var canConfirm = false;
    if (prevDwjz && parseFloat(prevDwjz) > 0) {
        r.chg_pct = (parseFloat(f10.dwjz) / parseFloat(prevDwjz) - 1) * 100;
        canConfirm = true;
    } else if (f10.chg_pct != null && f10.chg_pct !== 0) {
        r.chg_pct = f10.chg_pct;
        canConfirm = true;
    } else {
        r.chg_pct = 0;
        // Cannot compute meaningful chgPct → stay unconfirmed
    }
    if (canConfirm) { r.confirmed = true; }
    r.chg_str = (r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
    r.cur_val = amount * (1 + r.chg_pct / 100);
    r.gain = r.cur_val - amount;
    r.gain_str = (r.gain>=0?'+':'')+r.gain.toFixed(2);
    return r;
}
```

**Why `f10.chg_pct !== 0` matters**: JZZZL=0 in the API response means "no data available", not "0% change". Accepting it as valid confirms the fund with 0% gain permanently.

### ⚠️ Money Fund closingCache Stale Amount Bug (v3.2 fix)

**Bug** (introduced v3.2, fixed 0511i): Money fund closingCache restore used `mc.amount` (cached old holding amount) instead of current `amount` parameter. After user edited a money fund's holding amount, f10 API failure triggered cache restore → `r.cur_val = mc.amount` (old value) while portfolio totals used `amount` (new value) → massive discrepancy in daily/cumulative returns.

**Trigger scenario**: 
1. Money fund holding = ¥500,000
2. f10 succeeds → saves to closingCache: `{type:'monetary', wanfen:0.3456, amount:500000, ...}`
3. User edits holding to ¥5,000
4. App killed and reopened
5. f10 API fails → falls to closingCache restore
6. `r.cur_val = mc.amount = 500000` (should be 5000)
7. Overview: `total_amount = 5000, total_market = 500000` → "当日变动" = +¥495,000!

**Fix**: Always use the function parameter `amount` (current holding), never `mc.amount`:
```javascript
r.cur_val = amount; // ← current holding, NOT mc.amount
r.gain = mc.wanfen * amount / 10000;
```

### ⚠️ Design Lesson: closingCache Priority

When user says \"数据在用5月8号的估值\", they may mean the DISPLAY LABEL looks stale, not that the wrong data source is used. The user wanted \"数据来源+官方净值+日期\" format (f10), not \"收盘估值\" (closingCache).

**Dead-end path taken**: Made closingCache the primary non-trading-hours data source (3 checkpoints, early return before API). User rejected it — \"国内基金还是在用5月8号的收盘估值\".

**Correct solution**: f10 official NAV first (with date in source_detail), closingCache only as fallback. The f10 format \"东方财富 · 净值1.2345 (2026-05-08)\" is what the user expects.

QDII funds (in QDII_NO_FUNDGZ or FUND_ETF_MAP) without real-time data source: do NOT calculate market value from stale T+1/T+2 NAV. Instead show `[待更新]` and keep amount unchanged. When evening NAV arrives, `applyF10Confirmation` detects the change and updates.

### ⚠️ loadClosingCache Trading-Hours Deletion Bug (v3.2 fix)

**Bug**: `loadClosingCache()` had `if (isMarketHours()) { localStorage.removeItem('fm_closing_cache'); return; }`. This deleted ALL closing cache on app restart during trading hours. Result: QDII funds had no fallback data when ETF API calls were slow → showed \"QDII待更新\" instead of cached estimates.

**Fix**: Remove the trading-hours early-exit. `applyClosingCache()` already has `const maxAge = isMarketHours() ? 300000 : 8*3600*1000` — stale entries expire naturally. No need to manually delete.

### ⚠️ saveClosingEstimate QDII + Fundgz Edge Case (v3.2 fix)

**Bug**: QDII funds detected by `isQdiiByName()` (e.g., 022680 恒生科技ETF联接(QDII)) have valid fundgz data but no ETF mapping. The `!isQdii` guard prevented saving fundgz to closingCache, so these funds had no non-trading-hours fallback.

**Fix**: Always save fundgz when data is valid, regardless of QDII status. Only skip when ETF data is also available (ETF takes priority):

```javascript
if (fundgzData && fundgzData.gsz && fundgzData.dwjz && fundgzData.gszzl && fundgzData.gszzl !== 'N/A') {
  if (!isQdii || !etfData || etfData.chg_pct === undefined || etfData.chg_pct === null) {
    closingCache[cd] = { type:'fundgz', gsz:fundgzData.gsz, dwjz:fundgzData.dwjz, ...};
  }
}
// ETF always saves (higher priority, overwrites fundgz entry if both exist)
if (etfData && etfData.chg_pct !== undefined && etfData.chg_pct !== null) {
  closingCache[cd] = { type:'etf', ...};
}
```

### Money Market Fund closingCache (v3.2 fix)

**Bug**: Money funds return early from `processFund()` before reaching `saveClosingEstimate`. When f10 API returns null after market close, they showed "（无数据）" with no fallback.

**Fix**: Save money fund 万份收益 to closingCache as `type:'monetary'` immediately after successful f10 fetch. On subsequent f10 failure, restore from closingCache:

```javascript
// Save on success:
closingCache[code] = { type:'monetary', wanfen:wanfen, jzrq:mf10.jzrq, amount:amount, savedAt:Date.now() };
saveClosingCache();

// Restore on failure:
const mc = closingCache[code];
if (mc && mc.type === 'monetary' && (Date.now() - mc.savedAt < 8*3600*1000)) {
  r.gain = mc.wanfen * mc.amount / 10000;
  r.source = '货币基金';
  r.source_detail = '万份'+mc.wanfen.toFixed(4)+'元'+(mc.jzrq?' ('+mc.jzrq+')':'')+' 缓存';
  return r;
}
```

### Screen Rotation Black Screen Fix (v3.2)

**Bug**: Switching portrait/landscape destroyed and recreated the Activity + WebView, causing black screen with no recovery. Compose's `AndroidView` does NOT preserve WebView state across configuration changes.

**Fix**: Add `configChanges` to AndroidManifest to prevent Activity destruction:

```xml
<activity android:name=".MainActivity"
    android:configChanges="orientation|screenSize|keyboardHidden"
    ...
```

This keeps the WebView and all JavaScript state alive through rotation.

### ⚠️ Double Negative Sign Bug in renderOverview Percentage Display (v3.6-0513c fix)

**Bug**: The total card and portfolio cards used `(s+gc.toFixed(2)+'%')` where `s = gc>=0?'+':'-'`. When `gc` is negative, `gc.toFixed(2)` already includes the minus sign → `s` adds another → double negative: `--1.23%`.

**Root cause**: `.toFixed()` includes the negative sign for negative numbers. Prepending another sign character duplicates it.

**Fix**: Use `(gc>=0?'+':'')+gc.toFixed(2)+'%'` — only prepend `+` for positive values; let `.toFixed()` provide the `-` for negatives.

```javascript
// ❌ Double negative for negative values
const s = gc>=0?'+':'-';  // '-' when negative
'('+s+gc.toFixed(2)+'%)'   // '(--1.23%)'

// ✅ Correct: only prepend +, let toFixed handle -
'('+(gc>=0?'+':'')+gc.toFixed(2)+'%)'  // '(-1.23%)'
```

### ⚠️ confirmed_gain Field: Track Confirmed-Only Gains (v3.6-0513c)

**Use case**: Display "当日确认收益" row in the total overview card — accumulates gains only from officially NAV-confirmed funds, while "当日估算收益" shows total estimated gains from all real-time/cache sources.

**Implementation**: Add `confirmed_gain` field alongside `daily_gain` in `doRefresh()` for both code paths (unconfirmed branch and confirmed-only branch). In `renderOverview()`, aggregate with `portfolioKeys.reduce(...)`.

```javascript
// In doRefresh(), after daily_gain computation:
result.daily_gain = result.funds.reduce((s,f) => s + (f.gain || 0), 0);
result.confirmed_gain = result.funds.filter(f => f.confirmed).reduce((s,f) => s + (f.gain || 0), 0);

// In renderOverview():
const allConfirmedGain = portfolioKeys.reduce((s,k) => s + ((portfolioResults[k]||{}).confirmed_gain || 0), 0);
const cg = allConfirmedGain, cgR = totalAmt>0?cg/totalAmt*100:0;
```

**Behavior**: During market hours this is 0 (no funds confirmed yet). After close, as funds get confirmed via `applyF10Confirmation`, `confirmed_gain` grows incrementally — allowing the user to compare estimated vs confirmed returns.

### ✅ Confirmed Marker in All-Funds Card (v3.2)

**Missing**: The "📋 全部" card didn't show ✅ prefix or blue row highlight for confirmed funds, unlike the per-portfolio view.

**Fix**: In `renderAllFunds()`, add `(f.confirmed?'✅ ':'')` prefix to fund name and `class="confirmed"` to the `<tr>` element (same pattern as `renderPortfolio`):

```javascript
allTable += '<tr'+(f.confirmed?' class="confirmed"':'')+' style="color:'+ccol+...'">'+
  '<td>'+(f.confirmed?'✅ ':'')+f.name+'</td>'+...
```

**Do NOT include these keywords** — they match domestic Stock Connect funds:
- `互联` — matches \"港股通**互联**网\" (014674 富国中证港股通互联网), a non-QDII fund with valid fundgz
- `香港` — matches HK Stock Connect domestic funds
- `恒生` — matches 恒生科技/恒生指数 Stock Connect funds

**Safe keywords**: QDII, 海外, 全球, 纳斯达克, 标普, 美元债, 新兴市场, 越南, 印度, 日本, 欧洲, 德国, 英国

### Money Market Funds

`f10/lsjz` DWJZ field for money market = **万份收益** (daily return per 10,000 shares), NOT unit NAV.
- Daily gain = 万份收益 × holding_amount / 10000
- NAV is always ~1.0000, so `cur_val = amount` (unchanged)

### QDII_NO_FUNDGZ Classification — v3.1

**All QDII funds with ETF proxy mapping are now in QDII_NO_FUNDGZ (47 funds total).** This ensures trading hours always use real-time ETF prices, never stale fundgz estimates.

Funds outside QDII_NO_FUNDGZ use fundgz for real-time estimates. Test methodology to identify new QDII candidates:
```bash
curl -s -H "Referer: https://fund.eastmoney.com/" "https://fundgz.1234567.com.cn/js/{CODE}.js"
```
Check `jzrq` field. If `jzrq < 2026-05-06` (older than latest trading day), fund must be added to QDII_NO_FUNDGZ.

Current set includes: all QDII bond funds + QDII funds where fundgz returns stale data or `jsonpgz()` empty.

## ⚠️ v3.6 Confirmation Architecture (Beta 0512f) — Non-Trading Hours Priority

After extensive iteration, the confirmation logic was restructured around "published today" as the signal:

**applyF10Confirmation Path A (no prevDwjz):**
- QDII: Fully blocked — never confirms. f10 is always T+1/T+2 delayed, wait for Path B.
- Domestic: `jzrq >= today's calendar date` → confirms. Uses `new Date().toISOString().slice(0,10)`, not `getTradingDate()`.

**applyF10Confirmation Path B (prevDwjz available):**
- QDII: `f10.dwjz !== prevDwjz` → confirms. dwjz change = new NAV published.
- Domestic: `f10.dwjz !== prevDwjz` + `jzrq >= today` → confirms. Both conditions needed to avoid confirming intermediate old publications.

**Non-trading hours branch (unified) — v3.6 0542: todayConfirmed guard is UNCONDITIONAL:**
```
① todayConfirmed guard (ALL types, unconditional) → keep 东方财富 confirmed
**Non-trading hours branch (unified):**
```
**Non-trading hours branch (unified):**
```
① todayConfirmed guard (ALL types, UNCONDITIONAL) → keep 东方财富 confirmed
   ⚠️ DO NOT add jzrq conditions — at 8:40 AM f10.jzrq is still yesterday → guard fails → confirmed status lost
② closingCache first (ALL types)
   - QDII ETF cache: NO TTL — persists until Path B dwjz change
   - Domestic fundgz cache: 8h TTL
③ f10 fallback (when no cache)
   - QDII → 待更新
   - Domestic → f10 with jzrq check
```

**processFund confirmed early return**: Gated behind `isMarketHours()`. Non-trading hours: confirmed funds flow through to closingCache branch.

**doRefresh confirmed fund routing**: During non-trading hours, confirmed funds go to `unconfirmed` array (processFund), not `confirmedFunds` array.

### ⚠️ NAV Unchanged Confirmation Deadlock (v3.6 0513 discovery)

**Bug**: When a domestic fund's NAV doesn't change from yesterday (JZZZL=0.00, same dwjz), the fund can never get confirmed, even though f10 publishes today's jzrq. This affects low-volatility index funds, bond funds, and any fund with a zero-change day.

**Root cause**: Both confirmation paths require `dwjz !== prevDwjz`:
1. `applyF10Confirmation` Path B: `parseFloat(f10.dwjz) !== parseFloat(prevDwjz)` — fails when NAV unchanged
2. Non-trading f10 fallback: same comparison → `canConfirm=false` → no confirmation

**Example** (基金 012708 东方红中证红利低波动指数A, 2026-05-13):
- Yesterday prevDwjz = 1.3735
- Today f10: dwjz=1.3735, jzrq=2026-05-13, JZZZL=0.00
- `1.3735 !== 1.3735` → false → both paths skip → fund stays unconfirmed despite f10.jzrq=today

**Fix needed**: When `f10.jzrq >= today` AND `dwjz === prevDwjz` (NAV unchanged but today's data published), confirm with `chgPct=0%`. This is safe because:
- `cur_val = amount × (1 + 0/100) = amount` → no double-counting
- `|h[2] - cur_val| = 0` → doRefresh post-processing skips h[2] update
- h[4]/h[5]/h[6] update correctly records new confirmation day

**Fix locations**:
1. `applyF10Confirmation` Path B: add `else if (f10.jzrq >= today) { shouldConfirm = true; }` after dwjz equality
2. Non-trading f10 fallback: add `|| (prevDwjz && f10.jzrq >= today)` to canConfirm conditions

### ⚠️ NAV Unchanged Confirmation Deadlock (v3.6-0513e→0513f fix)

**Bug**: When a fund's NAV doesn't change from yesterday (JZZZL=0.00, same dwjz), neither confirmation path can confirm it, even though f10 publishes today's jzrq. This affects low-volatility index funds, bond funds, and any fund with a zero-change day.

**Root cause**: Both paths require `dwjz !== prevDwjz`:
1. `applyF10Confirmation` Path B: `parseFloat(f10.dwjz) !== parseFloat(prevDwjz)` → false
2. Non-trading f10 fallback: same comparison → `canConfirm=false`

**Example** (012708 东方红中证红利低波动指数A): prevDwjz=1.3735, f10.dwjz=1.3735, jzrq=2026-05-13, JZZZL=0.00.

**Critical lesson — WHERE to fix matters**: 
- ❌ `applyF10Confirmation` runs FIRST in the priority chain (before closingCache). Adding a "NAV unchanged → confirm with 0%" here caused a regression (0513e): ALL funds with unchanged NAV bypassed closingCache and showed 0% gain, even those with real-time data available.
- ✅ The non-trading f10 fallback is the safe place — gated behind `!isMarketHours()`, `closingCache` check, and `!isQdii`. It only activates as a last resort when no better data exists.

**Fix** (non-trading f10 fallback only):
```javascript
// In the canConfirm block, after the "NAV changed" condition:
} else if (prevDwjz && parseFloat(prevDwjz) > 0 && parseFloat(f10.dwjz) === parseFloat(prevDwjz) && f10.jzrq >= new Date().toISOString().slice(0,10)) {
    // NAV 未变但 jzrq>=今天 → 净值已发布，确认（chgPct=0）
    r.chg_pct = 0;
    canConfirm = true;
}
```

**Why chgPct=0 is safe here**: `cur_val = amount × (1 + 0/100) = amount` → no change, `|h[2] - cur_val| = 0` → doRefresh skips h[2] update. Only h[4]/h[5]/h[6] update to record the new confirmation.

### ⚠️ Bond Fund No-prevDwjz + JZZZL=0 Confirmation Gap (2026-05-14)

**Bug**: After v5 cleanup wiped `prevNavs`, bond funds (JZZZL=0, NAV unchanged) could never be confirmed. The non-trading f10 fallback's `canConfirm` ladder had 3 branches but a gap at the bottom:

| Branch | Condition | Bond (prevDwjz=null, JZZZL=0) |
|--------|-----------|:---:|
| ① | prevDwjz>0 && dwjz≠prevDwjz | ❌ prevDwjz null |
| ② | prevDwjz>0 && dwjz=prevDwjz && jzrq≥today | ❌ prevDwjz null |
| ③ | !prevDwjz && JZZZL≠0 | ❌ JZZZL=0 |
| **④ new** | **!prevDwjz && jzrq≥today** | **✅** |

**Fix**: Added branch ④ below ③ in the non-trading f10 fallback (after closingCache check, in `!isMarketHours()` block):

```javascript
} else if (!prevDwjz && f10.chg_pct != null && f10.chg_pct !== 0) {
    r.chg_pct = f10.chg_pct;
    canConfirm = true;
} else if (!prevDwjz && f10.jzrq >= new Date().toISOString().slice(0,10)) {
    // 无 prevDwjz + jzrq>=今天 → 净值已发布（即使 JZZZL=0，如债基/低波指数）
    r.chg_pct = 0;
    canConfirm = true;
}
```

**Why this is safe**: Only fires when no prevDwjz (first time after cleanup/install), in non-trading hours, after closingCache failed, for domestic funds only. chgPct=0 means `cur_val=amount` → holding unchanged. Once confirmed, prevDwjz is populated → future refreshes use branch ②.

**Affected funds**: 007147, 006484, 008216, and any bond/低波指数 fund with NAV unchanged on confirmation day.

### ⚠️ Double Negative Sign in renderOverview (v3.6-0513c fix)

**Bug**: `(s+gc.toFixed(2)+'%')` where `s = gc>=0?'+':'-'`. When gc is negative, `.toFixed()` already includes the minus sign, so `s` adds another: `--1.23%`.

**Fix**: Use `(gc>=0?'+':'')+gc.toFixed(2)+'%'` — only prepend `+` for positive; let `.toFixed()` provide `-` for negative.

### ⚠️ confirmed_gain Field (v3.6-0513c)

Add `confirmed_gain` alongside `daily_gain` in `doRefresh()` to track confirmed-only gains for the "当日确认收益" row in the overview total card. During market hours this is 0; after close it grows as funds get confirmed.

### ⚠️ Build & Version Conventions (v3.6-0513)

- **Build type**: Always `assembleDebug` (no R8). Release builds with R8 cannot overlay-install over debug-signed APKs.
- **Version format**: `3.6-MMDD[a-z]`, incremental letter per update (0513a → 0513b → ...)
- **User visibility**: Don't show Gradle build logs, just say "构建成功"
- **Asset cache**: `rm -rf app/build/intermediates/assets` before build to force asset refresh

### ⚠️ todayConfirmed Guard — Morning Date Boundary Bug (v3.6 0542 fix)

**Bug**: The `todayConfirmed` guard in `processFund`'s non-trading branch had conditional logic requiring `f10.jzrq >= today` for domestic funds. This was designed for evening hours (when NAVs publish with today's date), but **breaks in the morning** when f10 still returns yesterday's jzrq.

**Symptom**: At 8:40 AM, confirmed funds show closingCache data instead of ✅ confirmed status. User sees "已确认状态变成了昨天的收盘缓存".

**Root cause trace** (8:40 AM May 13):
1. `isMarketHours()` → false (correct)
2. Confirmed funds routed to `unconfirmed` → `processFund`
3. `todayConfirmed.has(code)` → true → guard entered
4. `f10.jzrq = "2026-05-12"` (yesterday's NAV, today's not yet published)
5. `"2026-05-12" >= "2026-05-13"` → false → `keepConfirm = false`
6. Falls through to closingCache → shows cache data instead of ✅

**Fix**: Remove ALL extra conditions from the guard. `todayConfirmed.has(code)` alone is sufficient — the fund was confirmed, nothing has changed to invalidate it, and the trading day boundary clearing is handled by `getTradingDate()` in `doRefresh`.

```javascript
// ❌ OLD: conditional guard breaks in morning
if (todayConfirmed.has(code)) {
  var keepConfirm = false;
  if (!isQdii) {
    if (f10 && f10.jzrq && f10.jzrq >= new Date().toISOString().slice(0,10)) keepConfirm = true;
  } else {
    if (f10 && f10.dwjz && prevNavs[code] && parseFloat(f10.dwjz) === parseFloat(prevNavs[code])) keepConfirm = true;
  }
  if (keepConfirm) { /* return confirmed */ }
  // fall through to closingCache
}

// ✅ FIXED: unconditional guard
if (todayConfirmed.has(code)) {
  const chgPct = confirmedChgPct[code] || 0;
  r.confirmed = true;
  // ... return confirmed data immediately
}
```

**Why unconditional is correct**: The `todayConfirmed` Set and `confirmedChgPct` map are validated when set (via `applyF10Confirmation` or `doRefresh` post-processing). The trading day boundary clearing (`getTradingDate() !== lastTradingDate`) in `doRefresh` handles cross-day invalidation. Extra date-based conditions only create false negatives at time boundaries.

**Source display (v3.6-0513b):**
- Badge: `天天基金` (was `天天`), ETF includes ticker: `ETF·新浪 QQQ`
- fundgz: `估值1.2345 (11:15)` — gsz value + HH:MM from gztime
- ETF live: `估值1.3573 (11:15)` — estimated NAV (f10.dwjz × (1+ETF_chg%/100)) + HH:MM from fetch timestamp
- ETF closing cache: `估1.3573` — no time (cached from prior session)
- f10 confirmed: `净值1.2345 (2026-05-11)` — official NAV + jzrq date
- No `收盘`/`官方` text anywhere in source_detail
- Remove all "收盘"/"缓存" text from source_detail

## ⚠️ Non-Trading Hours todayConfirmed Guard: No Extra Conditions (0513 fix)

**Bug (discovered 2026-05-13)**: The non-trading hours `todayConfirmed` guard had a `keepConfirm` condition that checked `f10.jzrq >= today`. This was correct for evening (NAVs just published → jzrq is today) but **broken for morning**: at 8:40 AM, jzrq is still yesterday's date → `"2026-05-12" >= "2026-05-13"` is false → confirmed status dropped → fund falls through to closingCache.

**Fix**: `todayConfirmed.has(code)` alone is sufficient to maintain confirmed status. The trading day boundary is already handled by `doRefresh`'s `getTradingDate()` check which clears `todayConfirmed` when the date rolls over. No extra f10 date conditions needed.

**Design rule**: The todayConfirmed guard should be unconditional. If a fund is in `todayConfirmed`, it stays confirmed until:
1. Next trading day boundary (handled by `getTradingDate()` in `doRefresh`)
2. New NAV data forces re-confirmation (handled by `applyF10Confirmation` before the guard)

### ⚠️ confirmedChgPct Persistence Fallback — todayConfirmed Empty Guard (v3.6-0515a fix)

**Bug (discovered 2026-05-15)**: Even with the unconditional `todayConfirmed` guard (above), confirmed status could still be lost in the morning if `todayConfirmed` (a runtime `Set`) was somehow empty. `todayConfirmed` is restored in two ways:
1. `loadPortfolios()`: `if (h[4] === getTradingDate())` — requires exact date match, vulnerable to edge cases
2. `doRefresh` post-processing: only repopulates AFTER a successful confirmation

If neither path populates `todayConfirmed`, the non-trading guard has nothing to work with and falls through to `closingCache`.

**Fix (3-part)**:

1. **Persist `confirmedChgPct` to localStorage** — in `savePortfolios()` and at end of `doRefresh` (independent of `portfolioChanged`):
```javascript
// savePortfolios:
try { localStorage.setItem('fm_confirmed_chg_pct', JSON.stringify(confirmedChgPct)); } catch(e) {}

// doRefresh end (line ~1551, alongside prevNavs save):
try { localStorage.setItem('fm_confirmed_chg_pct', JSON.stringify(confirmedChgPct)); } catch(e) {}
```

2. **Restore in `init()`** via new `loadConfirmedChgPct()`:
```javascript
function loadConfirmedChgPct() {
  try {
    const raw = localStorage.getItem('fm_confirmed_chg_pct');
    if (raw) { Object.assign(confirmedChgPct, JSON.parse(raw)); }
  } catch(e) {}
}
// Called in init() after loadPrevNavs()
```

3. **Fallback in non-trading guard** — use `confirmedChgPct[code]` as backup source:
```javascript
// OLD: todayConfirmed-only
if (todayConfirmed.has(code)) {

// NEW: todayConfirmed OR confirmedChgPct
const hasConfirmedData = todayConfirmed.has(code) || confirmedChgPct[code] !== undefined;
if (hasConfirmedData) {
  const chgPct = confirmedChgPct[code] || 0;
  // ...
}
```

**Why this is safe**: `confirmedChgPct` is:
- Set when a fund IS confirmed (same code path as `todayConfirmed`)
- Cleared at trading day boundary in `doRefresh` alongside `todayConfirmed`
- Only used as fallback within `!isMarketHours()` block (never during market hours)
- If stale (app not opened for days), `applyF10Confirmation` fires first and would re-confirm with new NAV before the fallback is reached

**Design rule**: `confirmedChgPct` is a **persistent mirror** of confirmation state. `todayConfirmed` (Set) is the primary auth source; `confirmedChgPct` (object, persisted) is the backup. Both must be cleared together at trading day boundaries.

### ⚠️ ETF Real-Time Display: Show Estimated NAV, Not Official NAV (0513 fix)

**Bug**: During trading hours, ETF branch (line 802) appended `' · 官方'+f10.dwjz` to `source_detail` — showing the stale official NAV instead of the ETF-computed estimated NAV.

**Fix**: `source_detail = '估值'+(parseFloat(f10.dwjz)*(1+etf.chg_pct/100)).toFixed(4)` — computes and displays the estimated NAV from ETF real-time change.

**Format**: `估值1.3573` (not `· 官方1.2345`). The `估值` prefix matches the non-trading ETF cache format `估1.3573` but uses the full word for clarity during live trading.

## ⚠️ ANTI-PATTERNS: Do Not Touch These

### ⚠️ Do NOT add conditions to todayConfirmed guard (v3.6-0513a fix)

**Bug**: The non-trading todayConfirmed guard had a `jzrq >= today` condition for domestic funds. At 8:40 AM, f10.jzrq is still yesterday's date → condition fails → confirmed status dropped → falls through to closingCache. User sees yesterday's closing cache instead of ✅ confirmed.

**Fix**: `todayConfirmed` alone is sufficient — if a fund is in the Set, maintain confirmed unconditionally. The trading day boundary is already handled by `doRefresh()` clearing `todayConfirmed` when `getTradingDate()` changes.

**Rule**: The non-trading todayConfirmed guard must be UNCONDITIONAL. No jzrq checks, no dwjz comparisons. Just check `todayConfirmed.has(code)` and return confirmed data.

### Debug vs Release Build

- **Release** (`assembleRelease`): R8 minification enabled → may prevent overlay install over existing debug-signed APK
- **Debug** (`assembleDebug`): No minification, auto-signed with debug keystore → always works for overlay installs
- **User preference**: Debug builds only, version format `3.6-MMDD[a-z]` with incremental letter per update (e.g., 3.6-0513a → 0513b → 0513c)

The `skipFundgz` variable (removed in v3.2) was based on the false assumption that all QDII funds have empty fundgz. **HK-market QDII funds** (恒生科技, 港股通 QDII, etc.) DO have valid fundgz data from 天天基金. Skip it and you lose real-time estimates for these funds.

The correct approach: always call fundgz. If it returns valid data (`jsonpgz({...})` with gsz/dwjz/gszzl), use it. If it returns empty (`jsonpgz();`), the natural fallback chain (ETF → closingCache → f10) takes over. The empty response costs < 1s and is parallelized with other API calls.

### Do NOT reduce API timeouts

All API timeouts are set to the **minimum reliable values**. Reducing any of them broke data fetching (2026-05-11 incident: reduced ETF 8s→5s killed all ETF data; reduced f10 10s→6s killed money fund data). The current values:

| API | Timeout | Notes |
|-----|---------|-------|
| fetchF10Nav | **10s** | Eastmoney f10 is slow, needs full window |
| fetchFundData (fetch) | **8s** | fundgz is usually fast, but keep headroom |
| fetchFundData (JSONP fallback) | **8s** | Same endpoint |
| fetchSina ETF | **8s** | ⚠️ Sina gb_ endpoints are slow — critical |
| fetchEastmoney ETF | **8s** | Keep at 8s for reliability |

### Do NOT use ES2020+ APIs in data-fetch paths

`Promise.allSettled` silently breaks on older Android WebView (Chrome <76). The TypeError gets caught and discarded, making ETF fetching return no data with no error visible. Use `Promise.all` with internal try/catch patterns instead.

## WebView JS Compatibility Rules

- ❌ `Promise.allSettled` — broken on Chrome <76
- ❌ `??` (nullish coalescing) — broken on Chrome <80  
- ❌ `?.` (optional chaining) — broken on Chrome <80
- ✅ `Promise.all` — supported everywhere
- ✅ Standard try/catch patterns
- ✅ `const`/`let`, arrow functions, template literals

`loadPortfolios()` calls `getTradingDate()`, which calls `isTradingDay()`, which reads `tradingDayCache`. If `loadTradingCache()` hasn't run yet, the cache is empty → wrong trading date on holidays → h[4] doesn't match → **all confirmed state silently lost on app restart**.

**Fix**: Move `portfolioData = loadPortfolios()` from module-level into `init()`, AFTER `loadTradingCache()`:

```javascript
// ❌ BROKEN — module level, tradingDayCache not loaded yet
let portfolioData = loadPortfolios();
function init() { loadTradingCache(); /* ... */ }

// ✅ FIXED — init() loads cache first, then portfolios
let portfolioData = null;
function init() {
  loadTradingCache();          // ← FIRST
  portfolioData = loadPortfolios();  // ← SECOND (gets correct trading date)
  portfolioKeys = Object.keys(portfolioData);
  loadPrevNavs();              // ← THIRD (restore NAV values)
  // ... render, refresh, etc
}
```

### prevNavs Persistence (Cross-Session Confirmed Fund Display)

`prevNavs` (the in-memory map of fund code → NAV value) is **not** stored in `portfolioData`. It needs separate localStorage persistence. Without it, after app restart, confirmed funds appear confirmed (✅ on name) but source_detail is empty (can't show "净值1.2345").

```javascript
// In savePortfolios() — always sync prevNavs alongside portfolio data
function savePortfolios(data) {
  try { localStorage.setItem('fundMonitorPortfolios', JSON.stringify(data)); } catch(e) {}
  try { localStorage.setItem('fundMonitorPrevNavs', JSON.stringify(prevNavs)); } catch(e) {}
}

// In init() — restore after portfolios are loaded
function loadPrevNavs() {
  try {
    const raw = localStorage.getItem('fundMonitorPrevNavs');
    if (raw) { Object.assign(prevNavs, JSON.parse(raw)); }
  } catch(e) {}
}

// In doRefresh() — save unconditionally after every refresh
try { localStorage.setItem('fundMonitorPrevNavs', JSON.stringify(prevNavs)); } catch(e) {}
```

### Manual Edit Protection (h[7] flag — v3.0+)

When a fund is confirmed, doRefresh post-processing overwrites `h[2]` with `f.cur_val`. If the user manually edited the holding amount, this silently reverts their change. `h[7]` is a boolean flag set to `1` in `editFundById`. Confirmation post-processing respects it:

```javascript
// editFundById: mark as manually edited
h[i] = [nc, nn, na, nc_cost, h[i][4]||'', h[i][5]||0, h[i][6]||'', 1]; // h[7]=1

// doRefresh post-processing: skip overwrite if manually edited
if (!h[7] && Math.abs(h[2] - f.cur_val) > 0.005) {
    h[2] = Math.round(f.cur_val * 100) / 100;
    portfolioChanged = true;
}

// New trading day: clear all manual flags (allow auto-update again)
for (const h of portfolioData[k].holdings || []) {
    if (h.length >= 8) h[7] = 0;
}
```

Migration in loadPortfolios: `if (h.length === 7) h.push(0);`
Default init: `[c,n,a,a,'',0,'',0]` (8 elements)

## ⚠️ Confirmed Fund Double-Count Prevention (v3.2 — 0511k fix, 0511l/m refinement)

**Problem**: After confirmation, `h[2]` is updated to today's market value. On subsequent same-day refreshes, `curVal = h[2] * (1 + chgPct/100)` applies the SAME `chgPct` again → holding amount grows with every refresh.

**Solution**: Check `h[4]` (confirmed date) against today's trading date. If already updated today, skip the forward calculation:

```javascript
const chgPct = confirmedChgPct[h[0]] || 0;
const alreadyUpdated = h[4] === td; // h[2] was already updated to today's value

// curVal: don't re-apply chgPct if already updated
const curVal = alreadyUpdated ? h[2] : h[2] * (1 + chgPct / 100);

// gain: calculate backwards if already updated (display only, doesn't touch h[2])
const gain = alreadyUpdated ? (h[2] - h[2] / (1 + chgPct / 100)) : (curVal - h[2]);
```

**Why `h[4] === td` works**: After confirmation, `h[4]` is set to today (line ~1396). Next trading day, `lastTradingDate` changes → `todayConfirmed.clear()` → `h[4]` is no longer "today" → forward calculation resumes on the new day's fresh `h[2]`.

## ⚠️ Portfolio Total Daily Gain: Use daily_gain NOT total_market - total_amount (v3.2 — 0511m fix)

**Problem**: Portfolio totals computed `total_market - total_amount`. For confirmed funds with `alreadyUpdated = true`, `cur_val = amount = h[2]` → they contribute ZERO to the daily change in totals, even though individual rows show correct gains.

**Root cause**: Confirmed already-updated funds have `cur_val == amount` by design (h[2] already includes the gain). `total_market - total_amount` zeros them out.

**Solution**: Sum individual fund gains instead:

```javascript
// In doRefresh() result computation:
result.daily_gain = result.funds.reduce((s,f) => s + (f.gain || 0), 0);
result.overall_chg = result.total_amount > 0 ? result.daily_gain / result.total_amount * 100 : 0;

// In renderPortfolio():
const tg = r.daily_gain || (tv - ta); // fall back to tv-ta for old cached results
const ov = r.overall_chg || 0;

// In renderOverview() per-portfolio card:
const gain = r.daily_gain || (tv - ta);

// In renderOverview() all-portfolios total:
const allGain = portfolioKeys.reduce((s,k) => s + ((portfolioResults[k]||{}).daily_gain || 0), 0);
```

**⚠️ Do NOT change `f.amount`** for confirmed funds — `amount` must stay as `h[2]` (current holding value) because it's displayed as "持有金额" in the portfolio summary. The `daily_gain` approach separates the display amount from the gain calculation.

## Critical JavaScript Bug: Promise Ordering

**DO NOT use `.then()` callbacks to populate ordered arrays from parallel promises:**

```javascript
// ❌ BUG: funds appear in random completion order
const funds = [];
const promises = holdings.map(h =>
    processFund(h[0], ...).then(r => { funds.push(h[0]); })
);
await Promise.allSettled(promises);
// funds[i] may NOT match holdings[i]!

// ✅ FIX: use settled.map() with index
const promises = holdings.map(h => processFund(h[0], ...));
const settled = await Promise.allSettled(promises);
const list = settled.map((s, i) => {
    // s corresponds to holdings[i] — order is GUARANTEED
    return s.status === 'fulfilled' ? s.value : fallback;
});
```

This bug caused fund names and amounts to mismatch in the table. Affected both `processPortfolio()` and `doRefresh()`.

## Asset Editing and Build Quirks

### Gradle Cache Misses HTML Changes

Gradle's `mergeReleaseAssets` task uses content hashing — but occasionally marks itself UP-TO-DATE even when `assets/index.html` changed. **Always force-clear intermediates after HTML edits:**

```bash
rm -rf app/build/intermediates/assets
```

Signs of cache miss: `mergeReleaseAssets UP-TO-DATE` in build output when you know assets changed.

### Using patch Tool with JS Strings

The `patch` tool can choke on complex JavaScript string escaping (backslash quotes inside single-quoted strings). When replacing functions with many concatenated HTML strings, prefer writing a Python script that reads/writes the file directly. Example at `/tmp/fix_layout.py` pattern.

### Debugging Rendering Issues: Extract & Compare Old APK

When UI rendering breaks in WebView (elements don't appear, layout is wrong) and the JS syntax passes `node --check`, the fastest diagnosis is to **extract the HTML from a known-working old APK and compare byte-for-byte** against the current source. Don't trust visual similarity — use hex dumps for critical sections:

```python
import zipfile

# Extract HTML from old working APK (e.g., Public version)
with zipfile.ZipFile('/opt/data/FundMonitor_Public.apk', 'r') as z:
    old_html = z.read('assets/index.html').decode('utf-8')

# Find the suspect function
idx = old_html.find('function renderOverview() {')
end = old_html.find('\n/* CRUD */', idx)
old_func = old_html[idx:end]

# Compare with current source
with open('/opt/data/FundMonitor-claude/app/src/main/assets/index.html') as f:
    new_html = f.read()
idx2 = new_html.find('function renderOverview() {')
end2 = new_html.find('\n/* CRUD */', idx2)
new_func = new_html[idx2:end2]

# Byte-level diff on critical sections (e.g., onclick escaping)
if old_func != new_func:
    # Use hex dump on the specific area that differs
    pass
```

**Common symptom**: Total card renders but individual portfolio cards don't. This means the `forEach` loop that builds `cards` threw an exception while the loop's accumulator variables (used by the total card) were still populated. Possible causes (in order of likelihood):
1. **`String.prototype.padStart` not available** in older Android WebView (Chrome <57). Desktop `node --check` passes because Node supports it. Fix: remove all `.padStart()` calls, use simple string formatting. **This is the #1 cause of "cards not rendering"** — padStart throws TypeError, forEach stops, `cards` stays empty, but total card variables were accumulated before the error.
2. An unescaped character in a string concatenation that produces malformed HTML — browser silently drops it on `innerHTML` assignment
3. A `reduce()` on undefined holdings array (check `d.holdings` exists)

**Fix strategy**: Revert to the old working function structure, then add new features incrementally (one line at a time). When the old version has `toLocaleString`/`padStart`, replace them with compatible alternatives BEFORE adding new code.

### Recovering Deleted index.html from APK

If the source HTML is accidentally deleted, extract it from the latest signed APK:

```python
import zipfile, os
with zipfile.ZipFile('/opt/data/FundMonitor.apk', 'r') as z:
    html = z.read('assets/index.html')
    with open('/opt/data/FundMonitor-claude/app/src/main/assets/index.html', 'wb') as f:
        f.write(html)
```

The signed APK (`/opt/data/FundMonitor.apk`) is preferred over the unsigned build output (which may not exist).

## Critical Rendering Bug: Holdings vs Results

**Issue**: `renderPortfolio()` iterated `r.funds` (last refresh results). Newly added funds exist in `portfolioData[key].holdings` but NOT in `portfolioResults[key].funds`, so they never rendered until the next refresh.

**Fix**: Iterate `d.holdings` and look up each fund in results by code:

```javascript
const fundsByCode = {};
(r.funds || []).forEach(f => { fundsByCode[f.code] = f; });

d.holdings.forEach((h, i) => {
    const f = fundsByCode[h[0]] || {
        code: h[0], name: h[1], amount: h[2], cur_val: h[2],
        chg_pct: 0, chg_str: '...', gain: 0, gain_str: '...',
        source: '加载中', source_detail: '', confirmed: false
    };
    const loading = f.source === '加载中';
    const badge = loading ? '' : sourceBadge(f.source);
    // Render with opacity:0.5 if loading
});
```

This ensures ALL holdings (including newly added, not-yet-refreshed ones) appear immediately in the table.

## Card Visibility Tuning

Frosted glass (`backdrop-filter: blur()`) renders poorly in Android WebView. Use higher-opacity card backgrounds with visible borders instead:
- Cards: `rgba(255,255,255,0.07)` (was 0.05)
- Borders: `rgba(255,255,255,0.12)` (was 0.08)
- Alternating rows: `rgba(255,255,255,0.03)` (was 0.02)
- Confirmed row highlight: `rgba(10,132,255,0.1)` (was 0.08)

## App Icon (Android mipmap) — Pillow Method

Current design (v2): **Morandi dual-tone + securities motif**. Diagonal split background (sage green #A3B5A6 / dusty rose #C4A4A4), three bullish candlesticks + upward trend line in warm gold, "FUND" (bold) / "MONITOR" (regular) stacked text in cream white #F5F0E8.

Generate with Pillow at 5 densities. **Critical sizing rule**: all visual elements must stay within the Android safe zone (inner ~66% diameter). Previous designs exceeded this and appeared cropped on phones.

```python
from PIL import Image, ImageDraw, ImageFont

# Morandi palette
GREEN  = (163, 181, 166)  # #A3B5A6 sage green (top-left)
ROSE   = (196, 164, 164)  # #C4A4A4 dusty rose (bottom-right)
CREAM  = (245, 240, 232)  # #F5F0E8 warm cream (text)
GOLD   = (210, 195, 170)  # chart line

def make_icon(size):
    # 1. Rounded-rect mask
    # 2. Diagonal split: polygon fill green (top-left) + rose (bottom-right) through mask
    # 3. Trend line + 3 candlesticks (bullish, hollow body)
    # 4. "FUND" (DejaVuSans-Bold, 30px) + "MONITOR" (DejaVuSans, 17px) stacked, centered
    # 5. Decorative cream dots
    # Save at SIZES = {'mdpi':48,'hdpi':72,'xhdpi':96,'xxhdpi':144,'xxxhdpi':192}
```

**Icon deployment**: Copy generated PNGs to `res/mipmap-{density}/ic_launcher.png` and `ic_launcher_round.png` at all densities. **Remove adaptive icon XML** (`res/mipmap-anydpi-v26/`) and foreground drawable (`res/drawable/ic_launcher_foreground.xml`) — the flat PNG design works correctly with Android's automatic shaping on API 26+.

```bash
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    dir="res/mipmap-${d}"
    cp "ic_${d}.png" "${dir}/ic_launcher.png"
    cp "ic_${d}.png" "${dir}/ic_launcher_round.png"
done
rm -f res/mipmap-anydpi-v26/ic_launcher*.xml
rm -f res/drawable/ic_launcher_foreground.xml
rm -f res/mipmap-*/ic_launcher_foreground.png
```

Also update `MainActivity.kt`: `setBackgroundColor(0xFF000000.toInt())` + MaterialTheme/Surface `Color(0xFF000000)` to match CSS background and avoid flash.

## ETF Proxy Availability (tested 2026-05-08)

| ETF | Eastmoney | Sina | Used for |
|-----|:---:|:---:|------|
| QQQ | ✅ | ✅ | 纳指100 (QQQ系) |
| SPY | ✅ | ✅ | 标普500 |
| AGG | ❌ | ✅ | 美元债 (007360,003385,004419,002286) |
| EMB | ✅ | ✅ | 亚洲美元债 (050030,002400) |
| BNDX | ✅ | ✅ | 全球债券 (100050,004998,008367,008095) |
| KWEB | — | ✅ | 中概互联 (006327,164906) |
| VNM | — | ✅ | 越南市场 (008763) — verified 2026-05-11 |
| SPLV | — | ✅ | 标普低波 (008164) — verified 2026-05-11 |
| VGK | — | ✅ | 欧洲股票 |
| EWJ | — | ✅ | 日本股票 |
| EWG | — | ✅ | 德国DAX |
| EEM | — | ✅ | 新兴市场 |
| VPL | — | ✅ | 亚太市场 (377016,457001) |
| VT | — | ✅ | 全球股票 (486002,003629,163813,270023,202801,019155) |
| IWF | — | ✅ | 大盘成长 (000043) |
| XLY | — | ✅ | 消费 (118002) |
| XLV | — | ✅ | 医疗 (000369) |
| XBI | — | ✅ | 生物科技 (017894) |
| GLD | — | ✅ | 黄金 (161815) |

## API Endpoints

| API | URL | Referer | Returns |
|-----|-----|---------|---------|
| 天天基金 fundgz | `fundgz.1234567.com.cn/js/{code}.js` | fund.eastmoney.com | JSONP: dwjz, gsz, gszzl, jzrq, gztime, name |
| 东方财富 f10/lsjz | `api.fund.eastmoney.com/f10/lsjz?fundCode={code}&pageIndex=1&pageSize=1` | fundf10.eastmoney.com | JSON: DWJZ, FSRQ, JZZZL |
| 东方财富 ETF | `push2.eastmoney.com/api/qt/stock/get?secid=105.{TICKER}&fields=f43,f57,f58,f169,f170` | quote.eastmoney.com | JSON: f43(price×1000), f170(chg%×100) |
| 新浪 ETF | `hq.sinajs.cn/list=gb_{ticker}` | finance.sina.com.cn | JS var: price, chg%, name |
| 基金名称查询 | `fund.eastmoney.com/pingzhongdata/{code}.js` | (none needed) | fS_name = "基金全称" |

## Fund Name Auto-Fill

Two-tier lookup:
1. fundgz (includes `name` field, fastest)
2. pingzhongdata (fallback, works for all fund types including QDII)

```javascript
async function fetchFundName(code) {
  // Try fundgz first (fast, includes name)
  // Fall back to pingzhongdata/{code}.js → extract fS_name
}
```

## Fund Classification — v3.2 with Auto-Detection

```javascript
function isQdiiByName(name) {
  // ⚠️ Do NOT add "互联", "香港", "恒生" — 港股通/国内基金会被误判
  return /QDII|海外|全球|纳斯达克|标普|美元债|新兴市场|越南|印度|日本|欧洲|德国|英国/.test(name||'');
}

function classifyFund(code, name) {
  if (MONETARY_FUNDS.has(code)) return '货币基金';
  if (FUND_ETF_MAP[code]) return 'QDII股票';        // ← MUST be before QDII_NO_FUNDGZ
  if (QDII_NO_FUNDGZ.has(code)) return 'QDII债';
  // 自动检测：名称含 QDII 等关键词 → 视为 QDII（即使未加入静态列表）
  if (isQdiiByName(name)) return 'QDII';
  if (/债|票息|中短|纯债|利率债|信用债/.test(name||'')) return '国内债';
  return '国内股票';
}
```

**⚠️ Order matters**: `FUND_ETF_MAP` check must come before `QDII_NO_FUNDGZ`. The expansion (v3.1) added all QDII stock funds to `QDII_NO_FUNDGZ` to skip fundgz — but those stocks should still be classified as "QDII股票", not "QDII债".

### Auto-Detection Design (v3.2)

`isQdiiByName()` uses fund name keyword matching to automatically identify QDII funds. This eliminates the need to manually maintain `QDII_NO_FUNDGZ` for new additions. The function is integrated at **4 points**:

1. **`classifyFund`**: Returns `'QDII'` for name-matched funds not in static sets
2. **`skipFundgz`** (line ~494): `QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code] !== undefined || isQdiiByName(name)` — auto-skips useless fundgz for new QDII funds
3. **`saveClosingEstimate` isQdii check**: Correctly caches ETF data (not fundgz) for auto-detected QDII
4. **`isQdiiNoRealtime` fallback**: Correctly shows "QDII待更新" instead of stale f10 for unmapped QDII

**Adding a new QDII fund workflow**: Only `FUND_ETF_MAP` needs updating (one line). `QDII_NO_FUNDGZ` is no longer required — `isQdiiByName` catches the fund by name and routes it correctly. If no ETF mapping exists, the fund shows "QDII待更新" as a safe fallback rather than displaying garbage fundgz data.

## Portfolio Display: Sort by Daily Change (v3.1+)

`renderPortfolio` now sorts holdings by daily change % descending before rendering:

```javascript
const sortedHoldings = [...d.holdings].sort((a, b) => {
    const fa = fundsByCode[a[0]] || {chg_pct: -Infinity};
    const fb = fundsByCode[b[0]] || {chg_pct: -Infinity};
    const ca = fa.chg_str === '...' ? -Infinity : fa.chg_pct;
    const cb = fb.chg_str === '...' ? -Infinity : fb.chg_pct;
    return cb - ca; // descending
});
sortedHoldings.forEach((h, i) => { ... });
```

Loading funds (source='加载中') sort to bottom via `-Infinity` mapping.

## All-Funds Merged Card (v3.1+)

`renderOverview` now includes an "📋 全部基金" card at the bottom. It merges all portfolios' funds by code, sums amounts and costs, sorts by daily change, and renders a full table with its own summary (holding amount, daily change %, cumulative gain).

```javascript
const allMap = {};
portfolioKeys.forEach(k => {
    // Build fundsByCode from results, iterate holdings
    // Merge by code: allMap[code].amount += h[2], allMap[code].cost += cost
});
// Calculate cur_val, gain, sort, render table rows + summary card
```

**Pitfall**: `FUND_ETF_MAP` check must come BEFORE `QDII_NO_FUNDGZ` in `classifyFund`. The QDII_NO_FUNDGZ expansion (19→47) added all ETF-mapped QDII stocks — they should classify as "QDII股票", not "QDII债".

### ⚠️ Cleanup v5 核弹事故（2026-05-14）

**事故**：v5 cleanup 在 `loadPortfolios()`恢复数据**之后**执行"全面清零"——删除 prevNavs、清空 todayConfirmed/confirmedChgPct、清除 closingCache、剥离所有 h[4]/h[5]/h[6]。用户早上打开 app → 确认状态全部消失。

**教训**：
1. Cleanup 必须在 `loadPortfolios()` **之前**运行，否则先恢复再删除 = 白干
2. Nuclear cleanup 不能删 `closingCache`（QDII 非交易时段唯一兜底）
3. 不能剥离所有 h[4]/h[5]/h[6]——这是用户花了数周积累的确认数据

**已回退**：v5 改为定向清理（仅 strip h[5]===0 的非货基脏数据）。

### ⚠️ closingCache 死锁 — f10 二次确认补刀（2026-05-14 深夜修复）

**Bug**：`applyF10Confirmation` 返回 false 后，`saveClosingEstimate`（同次刷新填入的 fundgz 数据）抢在 f10 兜底之前返回 → 每次刷新 fundgz 都覆盖 closingCache → 永远没机会确认。

**修复**：在非交易分支的 `todayConfirmed` 守卫和 `closingCache` 之间加 f10 二次确认——只要 f10.jzrq ≥ 今天 + 非 QDII → 直接确认，不等缓存。

新优先级顺序：
```
非交易时段:
① todayConfirmed 守卫 → 维持已确认
② f10 二次确认（新增）→ jzrq≥今天 → 直接确认
③ closingCache → 兜底
④ f10 兜底 → 最后手段
```

### ⚠️ 债基 JZZZL=0 确认 Gap（2026-05-14 夜晚发现）

**症状**：v5 清零 prevDwjz 后，债基（JZZZL=0.00，净值不变）永远无法确认。即使 f10 已发布今天净值（jzrq=今天），刷新后仍显示"待更新"。

**根因**：非交易时段 f10 兜底有三条 `canConfirm` 路径：

| 路径 | 条件 | 债基(JZZZL=0,无prevDwjz) |
|------|------|:---:|
| ① | prevDwjz>0 且 dwjz≠prevDwjz | ❌ 无prevDwjz |
| ② | prevDwjz>0 且 dwjz=prevDwjz 且 jzrq≥今天 | ❌ 无prevDwjz |
| ③ | !prevDwjz 且 JZZZL≠0 | ❌ JZZZL=0 |
| **④ 新增** | **!prevDwjz 且 jzrq≥今天** | **✅** |

**修复**：在非交易时段 f10 兜底的行 760 之后新增路径④——无 prevDwjz 但 jzrq≥今天 → 确认（chgPct=0）。这与 `cur_val=amount`（无变动）一致，`|h[2]-cur_val|=0` → doRefresh 跳过持有金额更新。仅更新 h[4]/h[5]/h[6] 记录新确认。

**安全边界**：仅非交易时段生效（`!isMarketHours()` gated），且 closingCache 为空时才走到此分支。

### ⚠️ One-Time Cache Cleanup Migration (v4 — 0512 final)

**⚠️ 版本演进**：
- **v3.4**：剥离所有 h[4]/h[5] + 清 prevNavs → 非交易时段 f10 以 chgPct=0 重新确认 → h[5]=0 持久化 → 永久 0% 收益
- **v3.5**：不剥离 h[4]/h[5]，不清 todayConfirmed。但 v3.4 已写入的 h[5]=0 被 loadPortfolios 恢复 → 仍然 0%
- **v4**：定向剥离 v3.4 残留的脏数据（h[5]===0 的非货基确认），同时清除 todayConfirmed/confirmedChgPct，保留 closingCache

**Pattern**: Version-gated in `init()`, after `loadPrevNavs()`, before portfolioResults restore:

```javascript
var CLEANUP_VERSION = '4';
if (localStorage.getItem('fm_cleanup_v') !== CLEANUP_VERSION) {
  // 1. Clear prevNavs — root cause of chgPct pollution (in-memory + localStorage)
  for (var ck in prevNavs) delete prevNavs[ck];
  localStorage.removeItem('fundMonitorPrevNavs');

  // 2. Fix v3.4 corruption: strip only h[5]===0 for non-money-market funds
  var fixedCount = 0;
  for (var pk in portfolioData) {
    for (var h of portfolioData[pk].holdings || []) {
      if (h[4] && h[5] === 0 && !MONETARY_FUNDS.has(h[0])) {
        h[4] = ''; h[5] = 0; h[6] = '';
        fixedCount++;
      }
      if (h.length >= 8) h[7] = 0;
    }
  }
  if (fixedCount > 0) savePortfolios(portfolioData);

  // 3. Clear runtime confirmation state (was restored from dirty h[4]/h[5])
  todayConfirmed.clear();
  for (var ck2 in confirmedChgPct) delete confirmedChgPct[ck2];

  // 4. Clear stale portfolio results (KEEP closingCache — QDII needs ETF proxy data)
  localStorage.removeItem('fm_portfolio_results');

  // 5. Mark done
  localStorage.setItem('fm_cleanup_v', CLEANUP_VERSION);
}
```

**What to clear vs preserve (v4):**

| Cache | Clear? | Reason |
|-------|--------|--------|
| `prevNavs` (fundMonitorPrevNavs) | ✅ Clear | Saved today's f10 NAV for non-confirmed funds |
| `fm_portfolio_results` | ✅ Clear | Cached fund results with bad chgPct |
| `fm_closing_cache` | ❌ **Preserve** | QDII 非交易时段需要 ETF 收盘数据 |
| `h[4]/h[5]/h[6]` with h[5]===0 (non-money) | ✅ **Strip** | v3.4 corruption — confirmed with 0% change |
| `h[4]/h[5]/h[6]` with h[5]≠0 | ❌ **Preserve** | Valid confirmation state |
| `h[2]` (holding amount) | ❌ Preserve | User data |
| `h[3]` (cost basis) | ❌ Preserve | User data |
| `fm_trading` | ❌ Preserve | Boolean flags, no pollution risk |
| `todayConfirmed` / `confirmedChgPct` | ✅ Clear | Was restored from dirty h[4]/h[5] by loadPortfolios |

**⚠️ 教训**：cleanup 版本升级必须考虑"上次 cleanup 可能已污染数据"的情况。v3.4 剥离 h[4]/h[5] 时写入的 h[5]=0 需要 v4 来修复。下次升级时也要检查当前版本是否有类似持久化脏数据。

## ⚠️ prevNavs Pollution: Non-Confirmed Fund NAV Saved as "Previous" (v3.3 — 0511n fix)

**Bug**: Line `else if (f.dwjz && !todayConfirmed.has(f.code)) { prevNavs[f.code] = f.dwjz; }` saved TODAY's f10 NAV for non-confirmed funds. On next session, `prevDwjz` ≈ current f10 NAV → `applyF10Confirmation` saw no NAV change → skipped confirmation. In the non-trading-hours f10 path, `chg_pct = (f10.dwjz / prevDwjz - 1) * 100 ≈ 0.02%` instead of actual ~1.75%.

**Example**: Domestic A500 fund (022463). Fundgz shows gsz=1.3337 during trading hours → `r.dwjz = f10.dwjz = 1.3347` (today's NAV). `prevNavs[code] = 1.3347` saved to localStorage. Reopen → `prevDwjz = 1.3347`, f10 still returns 1.3347 → `(1.3347/1.3344 - 1) * 100 ≈ 0.02%`.

**Fix**: Only save `prevNavs` for CONFIRMED funds. Remove the non-confirmed save line:
```javascript
// ❌ DELETED — pollutes prevNavs with today's NAV
else if (f.dwjz && !todayConfirmed.has(f.code)) { prevNavs[f.code] = f.dwjz; }
// ✅ prevNavs is only set for confirmed funds (f.confirmed && f.dwjz branch)
```

**Self-healing**: On `loadPortfolios`, detect suspicious confirmed funds (chgPct < 0.1% for non-monetary) and auto-clear:
```javascript
if (h[4] === today) {
  const chg = h[5] || 0;
  if (Math.abs(chg) < 0.1 && !MONETARY_FUNDS.has(h[0])) {
    h[4] = ''; h[5] = 0; // corruption detected → clear
    try { localStorage.removeItem('fm_portfolio_results'); } catch(e) {}
  } else {
    todayConfirmed.add(h[0]); confirmedChgPct[h[0]] = chg;
  }
}
```

## ⚠️ Parallel API Requests Cause Queue Timeouts (v3.3 — 0511n fix)

**Problem**: 30 funds × 3 APIs (f10 + fundgz + ETF) = **90 concurrent fetch requests**. Browser limits 6 connections per host. Requests 7-90 wait in queue → exceed 8-10s timeout → return null silently → funds show "待更新" or "无数据".

**Fix**: Process funds **one at a time** (not `Promise.all`). Each fund's 3 internal API calls still run in parallel, but only 3 requests at any time:
```javascript
// ❌ OLD: 30 funds × 3 APIs = 90 parallel requests
const fundPromises = unconfirmed.map(h => processFund(h[0], ...));
const settledFunds = await Promise.allSettled(fundPromises);

// ✅ NEW: one fund at a time, 3 concurrent requests max
const funds = [];
for (let i = 0; i < unconfirmed.length; i++) {
  const h = unconfirmed[i];
  try {
    const f = await processFund(h[0], h[1], h[2], prevNavs[h[0]]||null);
    funds.push(f);
  } catch(e) { /* fallback */ }
  completed++;
  updateLoading(...);
}
```

**Outer portfolio loop**: Also changed from `portfolioKeys.map(async k => { ... }); Promise.allSettled(promises)` to `for (const k of portfolioKeys) { ... }` — ensures portfolios don't compete for connections either.

**Trade-off**: Refresh is slower (30 funds ≈ 15-20s vs ~8s with parallel), but data is COMPLETE. Failed requests from timeouts are worse than slower loading.

## ⚠️ Patch Tool Double-Escape Trap

When patching JS strings inside HTML with `\"` embedded, the patch tool frequently double-escapes them to `\\\"` in the new_string. This corrupts the JavaScript silently — braces still balance, but the browser sees literal `\` characters. **After every patch, verify with:**
```bash
python3 -c "assert '\\\\\"' not in open('index.html').read()"
```
If corrupted, fix with `.replace('\\\\\\"', '\\"')`.

**Strong recommendation**: For any edit touching JS string concatenation with HTML, skip the `patch` tool entirely. Write a `python3` script via `terminal` that reads the file, does the replacement, verifies brace balance, and writes back. The patch tool is reliable for CSS changes and simple HTML edits only.

### Python edit template

```bash
python3 << 'PYEOF'
with open('app/src/main/assets/index.html') as f:
    html = f.read()

# Make changes...
html = html.replace(old_string, new_string)

# Verify
import re
m = re.search(r'<script>(.*?)</script>', html, re.DOTALL)
js = m.group(1)
assert js.count('{') == js.count('}'), "Braces unbalanced!"
assert '\\\\"' not in html, "Double-escaped quotes!"

with open('app/src/main/assets/index.html', 'w') as f:
    f.write(html)
print("Done")
PYEOF
```

## UI Specs (Current: Apple-style)

Dark theme with iOS design language:
- Background: `#000000` (true black, OLED-friendly)
- Cards: `rgba(255,255,255,0.05)` with `backdrop-filter: blur(20px)` (frosted glass)
- Borders: `rgba(255,255,255,0.08)` (subtle)
- Text primary: `rgba(255,255,255,0.92)`
- Text secondary: `rgba(255,255,255,0.45)`
- Font: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Microsoft YaHei'`
- Border radius: 14px (cards), 16px (modals), 8-10px (buttons/tabs)
- Monospace font: `'SF Mono', 'Menlo', 'Consolas'`
- All amounts: exactly 2 decimal places (`.toFixed(2)` or `toLocaleString({minimumFractionDigits:2,maximumFractionDigits:2})`)

**Decimal precision enforcement (3 locations)**:
1. Confirmation save: `h[2] = Math.round(f.cur_val * 100) / 100` — cur_val from NAV division can have 10+ decimals
2. Edit dialog display: `value="'+parseFloat(amt).toFixed(2)+'"` — show 2 decimals in input
3. Edit dialog save: `const na = Math.round(parseFloat(...) * 100) / 100` — enforce on user input

**⚠️ Display field pitfall — h[2] vs h[3]**:
The holdings array is `[code, name, h[2]=currentAmount, h[3]=costBasis, h[4]=confirmedDate, h[5]=confirmedChgPct, h[6]=navDate, h[7]=manualEditFlag]`. The table "持有金额" column MUST show `h[2]` (current), NOT `h[3]` (cost basis). Showing `cost` makes manual edits appear to not work because the edit updates `h[2]` but the table reads `h[3]`. Cost basis (`h[3]`) is ONLY used for "累计收益率" calculation in the summary. Fix: `'<td>¥'+parseFloat(h[2]).toFixed(2)+'</td>'`

**⚠️ Cost basis falsy bug**: `cost = h[3] || h[2]` silently replaces 0 with h[2] because JavaScript treats 0 as falsy. Fix: `cost = (h[3] != null && h[3] !== '' && !isNaN(h[3])) ? h[3] : h[2]`

**Cumulative P&L (v2.5+)**: Per-fund "累计收益" = `h[2]-h[3]` in table (auto-calculated, not editable). Per-portfolio summary shows cumulative sum. Overview cards (total + each portfolio) all display 累计收益 row. All numbers use `.toFixed(2)` with NO thousands separators — `¥203847.52` NOT `¥203,847.52`.

**⚠️ Negative sign display**: ALL places that calculate gains/cumulative P&L must use `(value>=0?'+':'-')` — NOT `(value>=0?'+':'')`. The empty string for negative values silently drops the minus sign when combined with `Math.abs()`. This was broken in 3 places: table cumulative gain, overview card, and total card.

Apple system colors (from iOS HIG):
```
Red: #FF453A  Green: #30D158  Blue: #0A84FF
Yellow: #FFD60A  Purple: #BF5AF2  Orange: #FF9F0A
```

Chinese market convention: **红涨绿跌** (row-level color inheritance via `<tr style="color:...">`)

### Color mapping (old → Apple)
| Old | New Apple | Usage |
|-----|-----------|-------|
| `#0d1117` | `#000000` | Background |
| `#161b22` | `rgba(255,255,255,0.05)` | Cards |
| `#21262d` | `rgba(255,255,255,0.06)` | Headers |
| `#e6edf3` | `rgba(255,255,255,0.92)` | Text |
| `#8b949e` | `rgba(255,255,255,0.45)` | Secondary text |
| `#f85149` | `#FF453A` | Red (涨) |
| `#3fb950` | `#30D158` | Green (跌) |
| `#58a6ff` | `#0A84FF` | Blue (accent) |

### Table (v3.0+)
10 columns: #/代码/名称/持有金额/持仓成本/累计收益/涨跌幅/当日盈亏/来源, min-width 610px, source col 150px.
- **持仓成本** (h[3]): manually editable via ✏️ modal, grey text, for cumulative P&L calculation. Edit preserves h[4]/h[5]/h[6]/h[7].
- **累计收益**: `h[2] - h[3]`, red/green, NOT manually editable. Format: `(cg>=0?'+':'-')+'¥'+Math.abs(cg).toFixed(2)`. **Negative values MUST show '-' sign**.
- **Edit modal** (v3.0+): preserves all confirmation state fields. Holdings array: `[code, name, amount, cost, confirmDate, chgPct, navDate, manualFlag]` (8 fields). Sets h[7]=1 on save.
- All numbers: NO thousands separators, `.toFixed(2)` formatting throughout (user requirement)
Entire row inherits red/green/gray color via `<tr style="color:...">`.
Source badges: 天天(蓝)/东方财富(黄)/新浪(紫)/ETF·EM(橙)/货币(灰)/待更新(黄).
Confirmed funds use ✅ on name + yellow "东方财富" badge (NOT a separate green "已确认" badge).
Confirmed rows: `tr.confirmed td { background:rgba(10,132,255,0.1)!important }`

### Daily NAV Refresh
When fund confirmed (NAV changed): update `portfolioData[k].holdings[i][2] = cur_val` so next trading day uses confirmed value as baseline.

### CRUD: Avoid prompt()/confirm()
`prompt()` and `confirm()` don't work reliably in Android WebView. Use modal-based UI instead:
- Delete/Edit funds: show scrollable modal list with per-item action buttons
- Delete portfolio: `⚙️` management button → modal list with 🗑 per portfolio
- Add fund: modal form with auto-fill name lookup, shows classification on match

## App Icon (Android mipmap)

Generate programmatically when no image tools available:
```bash
# Uses Python PPM → ffmpeg to PNG at 5 densities
# Icon: dark squircle with golden upward chart line
# Output: res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png
```
Manifest references: `android:icon="@mipmap/ic_launcher"`
Also update `MainActivity.kt`: `setBackgroundColor(0xFF000000.toInt())` + MaterialTheme/Surface `Color(0xFF000000)` to match CSS background and avoid flash.
