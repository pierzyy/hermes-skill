---
name: fund-monitor-android-apk
description: Build FundMonitor Android APK — WebView + Kotlin/Gradle, three-source parallel data engine (f10/lsjz ∥ fundgz ∥ ETF), QDII stale-NAV rule, money market via 万份收益, source badges, Compose-failure fallback to WebView.
version: 2.0.0
tags: [android, apk, webview, fund, monitor, data-engine, qdii, gradle]
---

# Fund Monitor Android APK v2.0

WebView-based Android APK with a three-source parallel data engine. **Do NOT use Compose** — it causes black screen on user's device. WebView + single HTML asset is the only reliable approach.

## Build

```bash
cd /opt/data/FundMonitor-claude
ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk /opt/data/FundMonitor.apk
```

## Project Structure

```
/opt/data/FundMonitor-claude/
├── app/src/main/
│   ├── java/com/fundmonitor/
│   │   ├── MainActivity.kt          # WebView shell + OkHttp Referer interceptor
│   │   └── data/                     # (Compose-era code, NOT used — kept for reference)
│   ├── assets/
│   │   └── index.html                # The entire app (HTML + CSS + JS, ~900 lines)
```

## WebView Configuration (Critical)

```kotlin
settings.javaScriptEnabled = true
settings.domStorageEnabled = true
settings.allowFileAccess = true
settings.allowFileAccessFromFileURLs = true        // REQUIRED for cross-origin fetch()
settings.allowUniversalAccessFromFileURLs = true    // REQUIRED
settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
```

Without these three lines, `fetch()` to external APIs silently fails from `file:///android_asset/`.

## OkHttp Referer Interceptor

```kotlin
val refererMap = mapOf(
    "fundgz.1234567.com.cn" to "https://fund.eastmoney.com/",
    "push2.eastmoney.com" to "https://quote.eastmoney.com/",
    "api.fund.eastmoney.com" to "https://fundf10.eastmoney.com/",
    "hq.sinajs.cn" to "https://finance.sina.com.cn/"
)
```

`shouldInterceptRequest` proxies matching hosts through OkHttp with Referer headers. This bypasses the browser's restriction on setting custom Referer in `fetch()`.

## Data Engine: Three-Source Parallel Architecture

```
processFund(code, name, amount, prevDwjz):
  0. 货币基金? → f10/lsjz 万份收益 → daily gain
  1. 已确认? → skip (reuse cached)

  2. Promise.all([fetchF10Nav(code), fetchFundData(code), getETFEstimate(code)])

  3. Priority decision:
     A. applyF10Confirmation(f10) → NAV changed? ✅ 已确认 → return
     B. applyFundgz(fi) → 国内基金实时估值 → return (save f10 dwjz for future)
     C. applyETF(etf) → QDII实时盘中价 → return (save f10 dwjz for future)
     D. f10 only (no real-time):
        - QDII? → [待更新] don't apply stale NAV, just save dwjz
        - Domestic? → apply f10 normally
```

### Key Design Decisions

1. **Parallel, not serial** — All three data sources fire simultaneously via Promise.all. Never use serial fallback (f10→fundgz→ETF) — it prevents ETF from running when f10 succeeds.

2. **f10 for confirmation, not display** — f10/lsjz provides official T+1 NAV used ONLY to detect NAV changes. Real-time display comes from fundgz (domestic) or ETF proxy (QDII).

3. **QDII stale-NAV rule** — If a QDII fund has no real-time source (no fundgz, ETF failed/no mapping), do NOT apply the stale f10 NAV. Show [待更新] and keep cur_val = amount unchanged. The stale NAV is saved as dwjz for future comparison; when a genuinely new NAV arrives, `applyF10Confirmation` detects the change and confirms.

## API Endpoints

| Source | URL | Used For |
|--------|-----|----------|
| f10/lsjz | `api.fund.eastmoney.com/f10/lsjz?fundCode={code}&pageIndex=1&pageSize=1&callback=jQuery` | Official NAV confirmation |
| fundgz | `fundgz.1234567.com.cn/js/{code}.js` | Domestic real-time estimate |
| Eastmoney ETF | `push2.eastmoney.com/api/qt/stock/get?secid=105.{TICKER}&fields=f43,f57,f58,f169,f170` | QDII live price |
| Sina ETF | `hq.sinajs.cn/list=gb_{ticker}` | QDII live price (fallback) |

## Money Market Funds (货币基金)

f10/lsjz DWJZ field = 万份收益 (yuan per 10,000 shares).
- Daily gain = 万份收益 × amount / 10000
- NAV is always ~1.0000, cur_val stays at amount
- Display: source "货币基金", chg_str shows absolute gain amount as "+¥X.XX"

Codes: 003389, 000509, 009790, 004939 (and others in MONETARY_FUNDS set)

## ETF Proxy Matrix

| ETF | Eastmoney (em) | Sina | Used By |
|-----|:---:|:---:|---------|
| QQQ | ✅ | ✅ | 纳指100 funds |
| SPY | ✅ | ✅ | 标普500 funds |
| AGG | ❌ | ✅ | 美元债 funds |
| EMB | ✅ | ✅ | 亚洲美元债 |
| BNDX | ✅ | ✅ | 全球债券 |
| VGK | — | ✅ | 欧洲股票 |
| EWJ | — | ✅ | 日本股票 |
| EWG | — | ✅ | 德国DAX |

Preference in FUND_ETF_MAP reflects which source to try first.

## Fund-to-ETF Mapping

Defined in `FUND_ETF_MAP` JS object. Format: `'fundCode': ['ETF_TICKER', 'preferred_source']`. Must include both A and C share classes (e.g., 007721 and 007722 both → SPY).

`QDII_NO_FUNDGZ`: funds that should never call fundgz. **If fundgz `jzrq` is older than f10 `FSRQ`, add the fund to this set immediately** — stale fundgz poisons the data pipeline. Current 19 codes: QDII bonds (007360,002400,100050,004998,008367,008095,003385,050030), no-proxy (008763,007722), stale-fundgz QDII stocks (457001,377016,006282,007280,000614,378006,003629,202801,017894). `MONETARY_FUNDS`: money market funds.

## UI: Table Columns (v2.1)

7 columns: `# | 代码 | 基金名称 | 持有金额 | 涨跌幅 | 盈亏 | 来源`
- Table min-width: 610px, Source column: max-width 150px
- **All amounts display with 2 decimal places** (toFixed(2) / toLocaleString minimumFractionDigits:2)
- Badge colors: 天天(蓝) / 东方财富(黄) / 新浪(紫) / ETF·EM(橙) / 已确认(绿) / 货币(灰) / 待更新(黄)

### CRUD (v2.1) — NO prompt()/confirm()

Android WebView blocks `prompt()` and `confirm()` dialog popups. All CRUD uses modal-based UI:
- **Add fund**: Modal with code input → auto-fill name + classification badge
- **Delete fund**: Modal listing all funds, each with 🗑 button on the row
- **Edit fund**: Modal listing all funds → pick one → edit modal with code/name/amount + classification display
- **Portfolio management**: ⚙️ button in tab bar → modal listing all portfolios with ✏️ rename / 🗑 delete / ＋ create

### Fund Name Lookup (v2.1)

`fetchFundName(code)`: dual-source (fundgz → pingzhongdata/{code}.js). Works for QDII funds (fundgz alone fails for them).

### Auto-Classification (v2.1)

`classifyFund(code, name)` tags new funds: 货币基金 / QDII债 / QDII股票 / 国内债 / 国内股票. Shown in add/edit modals and toast messages. Classification determines which data sources apply (MONETARY_FUNDS → skip, QDII_NO_FUNDGZ → skip fundgz, FUND_ETF_MAP → use ETF proxy).

### Daily NAV Refresh (v2.1)

When `applyF10Confirmation` detects a NAV change and confirms, the confirmed `cur_val` replaces the holding `amount` in portfolioData (saved to localStorage). Next trading day's calculations use this new baseline. Only triggers when |newAmount - oldAmount| > 0.005 to avoid floating-point noise.

### Overview Click-to-Navigate (v2.1)

Overview cards have `onclick="switchTab(key)"` — tap any portfolio summary to jump directly to its detail tab.

## Pitfalls

1. **Compose black screen** — Do NOT use Compose multi-child layouts. The user's device crashes on Scaffold/Box/Column+weight. WebView is the only reliable approach.
2. **Serial fallback kills ETF** — If f10 succeeds first and returns, ETF is never tried. Must use Promise.all parallel.
3. **Source column too narrow** — 80px truncates badges. Minimum 150px.
4. **Missing WebView CORS settings** — Without allowFileAccessFromFileURLs/allowUniversalAccessFromFileURLs, fetch() silently fails.
5. **QDII NAV is T+2** — US market May 7 close → NAV published ~May 8 evening → available May 9. Don't treat this as a bug.
6. **AGG via Eastmoney fails** — AGG only works via Sina. FUND_ETF_MAP must prefer 'sina' for AGG.
7. **JSONP for fundgz, fetch for others** — fundgz has race condition with window.jsonpgz. Use mutex-serialized JSONP as fallback; fetch() is primary in WebView.
8. **Money market fundgz returns 404** — Don't try fundgz for money market funds.
9. **Stale QDII fundgz** — Some QDII funds return fundgz data with `jzrq` from weeks ago (e.g., 457001 returned April 20 on May 8). This passes `applyFundgz` checks and overrides live ETF proxy. Test: `curl -s "https://fundgz.1234567.com.cn/js/{code}.js" | grep jzrq`. If jzrq < latest f10 FSRQ, add to QDII_NO_FUNDGZ.
10. **prompt() / confirm() blocked on Android WebView** — Never use these for CRUD. Build modal-based UI instead (inject HTML into modalBox, use onclick handlers on buttons within the modal).
11. **File corruption via execute_code** — `write_file` inside execute_code truncated index.html to 156 bytes. Recover from Gradle build cache: `cp app/build/intermediates/assets/debug/index.html app/src/main/assets/index.html`. Use `patch` tool for targeted edits instead of execute_code for file modifications.
12. **Promise.allSettled + .then() reorders results** — `.then(r => { results[code]=r; funds.push(code); })` fires in completion order, not input order. Use `settled.map((s, i) => ...)` with index to preserve holdings order. Applies to both `processPortfolio()` and the unconfirmed-funds loop in `doRefresh()`.
13. **renderPortfolio iterates r.funds, not d.holdings** — Newly added funds won't render. Build `fundsByCode` lookup from `r.funds`, then iterate `d.holdings` with fallback to loading placeholder.
14. **Market-hours confirmation** — `applyF10Confirmation` must gate on `isMarketHours()` (Mon-Fri 9:30-15:00). During market hours, NAVs are not final; confirming would set wrong baselines for next-day calculations.
