---
name: fund-monitor-windows-build
description: Build Windows .exe for the Fund Monitor PyQt5 app using Wine + PyInstaller cross-compilation. Full project architecture, pitfalls, and rebuild workflow.
version: 1.1.0
tags: [fund, monitor, windows, exe, pyqt5, wine, pyinstaller, cross-compile]
---

# Fund Monitor Windows Build

## Project Overview

PyQt5 desktop app that monitors three Chinese mutual fund portfolios with real-time data from multiple sources (天天基金, 东方财富, 新浪财经). Supports add/delete/edit funds per portfolio, auto-refresh scheduling, and NAV confirmation detection.

## Project Structure

```
/opt/data/fund_monitor_app/
├── main.py              # PyQt5 GUI (QMainWindow, QTabWidget, PieChart, FundDialog)
├── data_engine.py       # Multi-source data fetcher (fundgz → Eastmoney → Sina)
├── portfolio_config.py  # Default 8-portfolio definitions (fallback)
├── market_utils.py      # Trading hours, refresh scheduling
├── portfolios.json      # User-customized portfolio data (auto-generated on first save)
└── README.md
```

## Current Portfolios (8 total)

京东基金, 指数生财, 简慢, 全天候, 海外全球, 长赢150, 稳稳财进, 个人养老基金

Build environment: `/opt/wine-py32/` (32-bit Wine prefix + 32-bit Python embeddable)
Web/Android PWA: `/opt/data/fund_monitor_web/index.html` (single-file, JSONP-based, PWA-ready)

## Android PWA (v1.0 — 2026-05-07)

Single-file HTML5 app at `/opt/data/fund_monitor_web/index.html`. Full feature parity with Windows PyQt5 version.

### Critical: JSONP required for all API calls
When opened as a local HTML file (`file:///...`) or in a WebView, `fetch()` is **blocked by CORS**. All three data sources must use script-tag injection (JSONP):
- **fundgz**: Override global `window.jsonpgz` callback before injecting script tag
- **Eastmoney push2**: Use `callback=cbName` query parameter
- **Sina (hq.sinajs.cn)**: Inject script tag, read `window['hq_str_gb_TICKER']` on load

Never use `fetch()` for data APIs in the PWA — it silently fails with empty results.

### JSONP Engine pattern
```javascript
// Fundgz: override global callback
window.jsonpgz = function(data) { resolve(data); cleanup(); };
const s = document.createElement('script');
s.src = 'https://fundgz.1234567.com.cn/js/' + code + '.js?rt=' + Date.now();
document.head.appendChild(s);

// Eastmoney: callback parameter
s.src = url + '&callback=' + cbName;

// Sina: read global variable after script loads
s.onload = function() {
  const val = window['hq_str_gb_' + ticker];
  // parse val.split(',')
};
```

### Data persistence
Uses `localStorage` key `fundMonitorPortfolios` — same `[code, name, amount, cost_basis]` format as Python version. Auto-upgrades old 3-element format on load.

### PWA manifest
Base64-encoded manifest with `display: standalone` for "Add to Home Screen" on Android Chrome. No service worker needed (data is live-refresh, not offline-capable).

### APK building (attempted)
- Requires: JDK 21+ (`apt install default-jdk-headless`), Android SDK command-line tools
- Path: Download cmdline-tools, use `sdkmanager` for build-tools/platform, compile APK with `aapt2`/`d8`/`apksigner`
- The PWA approach is actually preferred over APK — no install, auto-updates, works on iOS too

## Architecture (main.py)

- **Class `FundMonitorApp(QMainWindow)`**: Main window with 8 tabs + 总览
- **Tab structure**: Each portfolio tab has: summary bar (4 metrics) → pie chart + fund table (side by side) → CRUD buttons
- **Data flow**: `_manual_refresh()` → background thread → `process_portfolio()` → `pyqtSignal` → UI update
- **Persistence**: Add/delete/edit writes to `portfolios.json` immediately
- **Scheduling**: `QTimer` ticks every 60s, directly calls `_manual_refresh()` (no delta-time check)
- **Signals**: `RefreshSignals(QObject)` with `update_ui` and `update_status` pyqtSignals

### Key Classes

| Class | Role |
|-------|------|
| `FundMonitorApp(QMainWindow)` | Main window, 8 tabs, scheduling |
| `RefreshSignals(QObject)` | Thread-safe signal bridge |
| `FundDialog(QDialog)` | Add/edit fund with auto name lookup |
| `PieChart(QWidget)` | Custom QPainter pie chart for asset allocation |
| `PortfolioState` (in data_engine) | Cross-refresh NAV tracking |

### Fund CRUD

- Add: `_add_fund(key)` → `FundDialog` → append to `portfolio_data[key]['holdings']` → `save_portfolios()` → refresh
- Delete: `_delete_fund(key)` → confirm dialog → del from list → save → refresh
- Edit: `_edit_fund(key)` → `FundDialog` pre-filled → replace → save → refresh
- **Data format**: `[[code, name, amount, cost_basis], ...]` (4-element; cost_basis tracks original purchase cost for cumulative return calculation)

### Auto-fill Fund Name

`FundDialog` uses a debounced timer (400ms) on `code_edit.textChanged` to call `fetch_fund_name(code)` which queries `https://fundgz.1234567.com.cn/js/{code}.js`. Results cached in `_fund_name_cache`. Shows ✅/❌ status indicator.

### Tab Auto-Width

```python
self.tabs.tabBar().setExpanding(False)  # Size to content, not evenly distributed
self.tabs.setUsesScrollButtons(True)     # Scroll when too many tabs
```

### Portfolio Summary Bar (v4.2)

Each tab shows 5 metrics above the fund table, with pie chart embedded on the right:
- **持有金额**: Opening amount, unchanged intraday until NAV confirmation (`sum(amount)`)
- **当日收益**: Today's gain = `total_market - total_amount`
- **持有收益**: Historical total gain = `total_market - total_cost`
- **当日涨跌幅**: Portfolio-weighted daily change %
- **累计收益率**: `(total_market - total_cost) / total_cost * 100`

### Asset Allocation Pie Chart

Custom `PieChart(QWidget)` drawn with `QPainter` — zero external dependencies. Classifies funds into 6 categories via `classify_asset(name)`:
- 股票, 债券, 货币, QDII, 贵金属, 其他

### Holdings Data Format (v4.0)

Each holding is now `[code, name, amount, cost_basis]`:
- `amount`: Current reference value (updated on NAV confirmation)
- `cost_basis`: Original purchase cost (NEVER changes)
- `load_portfolios()` auto-upgrades old 3-element format by setting `cost_basis = amount`

## Windows Build Process

### Environment Setup
```bash
# 32-bit Wine prefix
WINEARCH=win32 WINEPREFIX=/root/.wine wineboot -u

# 32-bit embeddable Python
curl -L -o /tmp/python-embed32.zip \
  "https://mirrors.huaweicloud.com/python/3.12.3/python-3.12.3-embed-win32.zip"
mkdir -p /opt/wine-py32 && cd /opt/wine-py32
python3 -c "import zipfile; zipfile.ZipFile('/tmp/python-embed32.zip').extractall('.')"
echo 'import site' >> python312._pth

# Install pip
WINEPREFIX=/root/.wine wine python.exe get-pip.py -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com

# Install PyQt5 + PyInstaller
WINEPREFIX=/root/.wine wine python.exe -m pip install PyQt5 pyinstaller -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

### Build Command
```bash
cd /opt/wine-py32
cp /opt/data/fund_monitor_app/*.py .
rm -rf build dist
WINEPREFIX=/root/.wine wine python.exe -m PyInstaller \
  --onefile --windowed --name "FundMonitor" \
  --hidden-import PyQt5 --hidden-import PyQt5.QtCore \
  --hidden-import PyQt5.QtWidgets --hidden-import PyQt5.QtGui \
  --add-data "portfolio_config.py;." \
  --clean main.py
# Output: dist/FundMonitor.exe (~31MB)
```

### Package for WeChat Delivery
```bash
cp dist/FundMonitor.exe /opt/data/ && chmod 777 /opt/data/FundMonitor.exe
cd /opt/data && 7z a -p123456 -tzip FundMonitor.zip FundMonitor.exe
# Send via MEDIA:/opt/data/FundMonitor.zip
```

## Pitfalls

1. **tkinter unavailable in embeddable Python** — embeddable Python lacks tcl/tk DLLs. PyQt5 is the solution (pip-installable, includes all Qt DLLs).
2. **64-bit Wine issues** — 64-bit Wine prefix creation hangs on headless server. Use 32-bit Wine + 32-bit Python embeddable.
3. **NSIS installer can't extract MSI** — Python's full installer uses NSIS, can't extract MSI with 7z. Use embeddable Python + pip install everything.
4. **PyQt5 signal thread safety** — Must use `pyqtSignal` + `QObject` for cross-thread UI updates. Direct UI calls from background threads will crash.
5. **`statusbar` vs `statusBar`** — PyQt5 uses camelCase `statusBar()`, but as an attribute it's `self.statusbar`. Signal connections must happen AFTER `_build_ui()` creates it.
6. **`{braces}` in CSS with `.format()`** — Python's `str.format()` interprets CSS braces as placeholders. Use `{{double braces}}` in CSS or separate CSS from format string.
7. **WeChat blocks .exe** — Encrypt with password (`-p123456 -tzip`) to bypass antivirus scanning during transfer.
8. **Chinese filename permissions** — Use ASCII filenames (`FundMonitor.exe`) to avoid cross-platform permission issues.
9. **Aliyun pip mirror** — PyPI downloads are unreliable from this NAS. Always use `-i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com`.
10. **DeepSeek vision not supported** — `vision_analyze` fails with `unknown variant image_url`. Use Tesseract OCR for screenshots instead.
11. **Dual-platform holdings** — user may hold same fund on 且慢 + another platform. Sum amounts by fund code after OCR.
10. **Portfolio data backward compatibility** — v4.0 changed holdings from 3-element `[code, name, amount]` to 4-element `[code, name, amount, cost_basis]`. `load_portfolios()` must auto-upgrade old format: `if len(h) == 3: h.append(h[2])`.
11. **Debounced API calls for auto-fill** — FundDialog's `_on_code_changed` uses `QTimer.singleShot(400ms)` to avoid hammering the fundgz API while user types. Cancel pending timer on each keystroke.
12. **QTabWidget tab width** — Default behavior evenly distributes tabs. Use `tabBar().setExpanding(False)` + `setUsesScrollButtons(True)` for content-sized tabs. With 8+ tabs, scrolling is essential.
13. **Pie chart without matplotlib** — Custom `QPainter` widget is ~50 lines vs 30MB matplotlib dependency. Classify funds with `classify_asset(name)` function (different from data_engine's `classify_fund` — pie chart uses simpler 6-category system).
15. **Pie chart resize** — When moving PieChart into summary_frame, reduce min size to 140×180 (from 180×220) and adjust legend positioning to fit narrower space.
16. **Col index shift** — Adding 序号 column shifts all column indices by +1. All QTableWidgetItem col indices must be updated, including the column width array and header labels.
17. **patch replace_all on code blocks** — NEVER use `replace_all=true` on Python code with `patch()`. The `except: pass` pattern appears multiple times and replace_all will match wrong instances, corrupting the file. Always use unique context strings for each replacement.
18. **Scheduler simplified** — Timer now fires at 60000ms and calls `_manual_refresh()` directly. No more last-update-time delta comparison. Simpler and guarantees exactly 60s intervals.
19. **QGroupBox title** — Overview tab uses separate QLabel for title instead of QGroupBox.setTitle(), allowing better font control and emoji rendering.
15. **`patch(replace_all=True)` file corruption** — When a pattern appears in multiple structurally different contexts (e.g., inside different try/except blocks), `replace_all` can break the file. For multi-section changes, rewrite the entire file with `write_file` instead. Example: `data_engine.py` corruption on 2026-05-07 — lost `_fetch_sina` function, had duplicate definitions.
16. **East Money f10 API requires Referer** — `api.fund.eastmoney.com/f10/lsjz` returns ErrCode -999 without `Referer: fundf10.eastmoney.com`. Browser fetch() strips custom Referer headers. Workaround: NAS proxy at `/opt/data/fund_proxy.py` on port 18900 adds the header server-side. Phone must be on home WiFi (192.168.3.95:18900) for East Money source.
17. **`AbortSignal.timeout()` unsupported** — Chrome <103 (older Android WebViews) lacks this. Use `new AbortController() + setTimeout(() => ctrl.abort(), ms)` pattern.
18. **NAV comparison: numeric, not string** — `"1.234" !== "1.2340"` is true in JS, triggering false confirmations. Always compare as `parseFloat(a) !== parseFloat(b)`.
19. **API-provided chg_pct is authoritative** — East Money's `JZZZL` field and fundgz's `gszzl` are more reliable than manual `(new/old-1)*100` calculation, which accumulates floating-point errors.
20. **Confirmed fund locking** — Once `todayConfirmed.has(code)`, skip all API calls for that fund. Reuse cached `cur_val` from previous result. Do NOT recalculate.
21. **JSONP fundgz race condition** — Concurrent `window.jsonpgz` overrides clobber each other. Use mutex chain: `_fundgzLock = _fundgzLock.then(() => new Promise(done => {...}))`. fetch() as primary path avoids this entirely in WebView.

## v4.2 Architecture (Current — 2026-05-07)

### v4.2 Changes (from v4.0/4.1)

| Change | Detail |
|--------|--------|
| Pie chart inline | PieChart now embedded inside summary_frame (right side), not separate widget. Min size reduced to 140×180. |
| Index column | Table now 8 columns: 序号(42px), 代码(62px), 名称(180px), 成本(85px), 估值(95px), 涨跌幅(68px), 盈亏(80px), 来源(200px) |
| Header beautified | Gradient `#353d4a→#2d333d→#21262d`, bottom 2px border `#30363d`, font 12px bold |
| Summary fonts ↑ | Title 14px blue (`#58a6ff`), subtitle 10px gray, value 22px bold Consolas+YaHei |
| Tab width ↑ | `min-width: 115px`, `padding: 12px 24px`, `font: 14px` |
| Refresh 60s | Timer → 60000ms, direct `_manual_refresh()` call (no delta check). All periods: 60s. |
| Timeouts ↑ | fundgz: 5s, eastmoney: 10s, sina: 8s, portfolio total: 120s |
| Overview enhanced | Each portfolio shows 3 lines: 开盘金额 / 当前市值 / 当日变动, monospace aligned |
| Window size | 1450×900 default, 1100×700 minimum |

### Data Engine Timeouts (v4.2)
- `fetch_fund_data`: `timeout=5` (was 3)
- `_fetch_eastmoney`: `timeout=10` (was 8)
- `_fetch_sina`: `timeout=8` (was 5)
- `process_portfolio`: `as_completed(futures, timeout=120)` (was 90)

### Scheduler (v4.2)
```python
self.timer.start(60000)  # was 30000
# _scheduler_tick calls _manual_refresh() directly — no delta check
```

### Table Structure (v4.2)
```
Columns: 序号 | 代码 | 基金名称 | 成本 | 当前估值 | 涨跌幅 | 盈亏 | 来源
Widths:   42 |  62 |    180  |  85 |    95   |   68  |  80 |  200
```
- Col 0 (序号): center-aligned, gray `FG_GRAY`
- Col 2 (名称): stretch to fill remaining space
- `verticalHeader().setVisible(False)`
- Header: gradient background, 2px bottom border, 12px bold blue font

### Summary Bar Layout (v4.2)
```python
summary_frame (QFrame, BG_CARD, border-radius 8px)
├── 5 metric boxes (spacing=20)
│   ├── 持有金额 (14px blue title, 22px white value)
│   ├── 当日收益 (red/green by sign)
│   ├── 持有收益 (red/green by sign)
│   ├── 当日涨跌 (red/green by sign)
│   └── 累计收益率 (red/green by sign)
├── Stretch
└── PieChart (140×180, embedded right side)
```
No separate `top_row` — summary_frame added directly to outer layout.

### Overview Tab Display (v4.2)
```python
# Each portfolio group box shows:
f"{emoji} {name}"                                    # blue bold 14px title
开盘金额  ¥{ta:>12,.0f}                               # monospace
当前市值  ¥{tv:>12,.0f}
当日变动  {gs}¥{gain:>9,.0f}  ({sign}{ov:.2f}%)  |  已确认 {n}/{total}
```

## v4.0 Architecture (8 Portfolios) [historical]

Portfolios: 京东基金, 指数生财, 简慢, 全天候, 海外全球, 长赢150, 稳稳财进, 个人养老基金

### Key v4.0 Features

| Feature | Implementation |
|---------|---------------|
| Tab auto-width | `tabBar().setExpanding(False)` + `setUsesScrollButtons(True)` |
| Auto-fill fund name | `FundDialog` connects `code_edit.textChanged` → 400ms debounce → `fetch_fund_name(code)` via 天天基金 API |
| Summary bar | 4 metrics per tab: 持有金额, 当日涨跌, 累计收益, 累计收益率 |
| Cumulative returns | `cost_basis` tracked as 4th element in holdings `[code, name, amount, cost_basis]` |
| Pie chart | Custom `PieChart(QWidget)` using `QPainter.drawPie()` — zero external deps |
| Asset classification | `classify_asset(name)` → 贵金属/货币/债券/股票/QDII |

### Fund Name Auto-Fetch

```python
def fetch_fund_name(code):
    url = f'https://fundgz.1234567.com.cn/js/{code}.js'
    # Returns fund name from JSON response
    # Cached in _fund_name_cache dict
```

### Holdings Data Format (v4.0)

```python
# portfolios.json / portfolio_config.py
holdings = [[code, name, amount, cost_basis], ...]
# cost_basis = amount on initial add, preserved across NAV confirmations
# 累计收益 = cur_val - cost_basis
# 累计收益率 = (cur_val - cost_basis) / cost_basis * 100
```

### Portfolio Data Entry via OCR

When user sends 且慢 app screenshots:
```bash
tesseract image.jpg stdout -l chi_sim --psm 6
```
Parse output for fund codes (6 digits), names, and amounts. Apply with targeted `patch` operations on `portfolio_config.py`. Always confirm extracted data with user before saving.

## OCR Portfolio Extraction Workflow

When user sends screenshots of fund holdings (from 且慢, 京东金融, etc.) and DeepSeek vision is unavailable:

```bash
# Install Tesseract with Chinese support (one-time)
apt-get install -y tesseract-ocr tesseract-ocr-chi-sim

# OCR a screenshot
tesseract image.jpg stdout -l chi_sim --psm 6
```

### OCR Pitfalls
- Use `--psm 6` (uniform text block) for app screenshots
- Fund codes often garbled — always ask user to verify codes
- Amounts with commas misinterpreted: "10,397.79" → "10.3927.79" in OCR
- Present extracted data in table format for user confirmation before saving
- For dual-platform holdings: sum amounts by fund code after OCR-ing both images

### Portfolio Config Update Pattern
1. OCR image → extract {code, name, amount}
2. Present table to user for verification
3. Use `patch` tool to update `portfolio_config.py`
4. User confirms → proceed, else user provides corrections → patch again

## OCR Portfolio Data Extraction

When user sends screenshots of fund holdings from Chinese finance apps (且慢, 京东金融, 天天基金, 华泰证券, 平安银行 etc.):

```bash
tesseract image.jpg stdout -l chi_sim --psm 6
```

**Workflow:**
1. OCR one image at a time — user confirms before next
2. Extract: fund code (6 digits), fund name, holding amount
3. Present extracted data for user verification — OCR often garbles codes and amounts
4. Multi-platform: if same fund code appears in two screenshots, **sum the amounts**
5. Store in `portfolio_config.py` as `(code, name, amount)` tuples

**Common OCR pitfalls:**
- Codes with 7 digits (e.g., `0220680`) → strip to 6 (`022680`)
- Decimal errors (e.g., `10.3927.79` → `10397.79`)
- Garbled Chinese fund names — always verify with user
- Tesseract install: `apt-get install -y tesseract-ocr tesseract-ocr-chi-sim`

## Latest UI Architecture (v4.2)

### Summary Bar Metrics (per portfolio, above fund table)
| Metric | Label | Value Source |
|--------|-------|-------------|
| 持有金额 | Opening amount (unchanged intraday) | `result['total_amount']` |
| 当日收益 | Today's gain | `total_market - total_amount` |
| 持有收益 | Lifetime total gain | `total_market - total_cost` |
| 当日涨跌 | Today's change % | `result['overall_chg']` |
| 累计收益率 | Lifetime return % | `(total_market - total_cost) / total_cost * 100` |

### Layout (v4.2 — pie chart embedded in summary bar)
- **Summary bar**: 5 metric columns + pie chart on the right side, all inside one dark card (`QFrame` with `QHBoxLayout`)
- **Pie chart**: `PieChart(QWidget)` with `setMinimumSize(140,140)`, `setMaximumHeight(180)`, `setMaximumWidth(200)` — embedded inside summary_frame layout
- **Below**: Fund table (QTableWidget, **8 columns**: 序号/代码/基金名称/成本/当前估值/涨跌幅/盈亏/来源)
- Column 0 (序号): 42px, center-aligned. Column widths: `[42, 62, 180, 85, 95, 68, 80, 200]`
- Serial number column uses `Qt.AlignCenter`

### Font & Style Specs (v4.2)
| Element | Font | Size | Color |
|---------|------|------|-------|
| Summary bar title | Microsoft YaHei bold | 14px | `#58a6ff` (blue) |
| Summary bar subtitle | Microsoft YaHei | 10px | `#8b949e` (gray) |
| Summary bar value | Consolas / Microsoft YaHei bold | 22px | context-dependent |
| Tab label | Microsoft YaHei | 14px | `#e6edf3` / `#58a6ff` (selected) |
| Table header | Microsoft YaHei bold | 12px | `#58a6ff` |
| Table cells | Microsoft YaHei | 12px | context-dependent |
| Tab min-width | — | 115px | — |
| Tab padding | — | 12px 24px | — |

### Window Geometry (v4.2)
- Default: 1450×900, Minimum: 1100×700

### Refresh Scheduling (v4.2)
- `QTimer` fires every **60,000ms** (was 30,000ms in v4.1)
- On tick, directly calls `_manual_refresh()` — no delta-time check
- Effective refresh: exactly 60 seconds (+ execution time)
- Thread join timeout: 120s (was 90s in v4.1)
- HTTP timeouts: fundgz 5s, eastmoney 10s, sina 8s

### Cost Basis Tracking
Portfolio data format: `[code, name, amount, cost_basis]`
- `amount` = last confirmed holding value (updated on NAV confirmation)
- `cost_basis` = original purchase cost (never changes)
- `total_cost` = sum of all cost_basis for lifetime return calculation

### Portfolio Config
`portfolio_config.py` defines `PORTFOLIOS` dict with 8 entries. Each: `{emoji, name, holdings: [(code, name, amount), ...]}`.
User edits persist to `portfolios.json`.

## Android APK Build (WebView)

Source: `/opt/fund-monitor-apk/` — minimal Android project using aapt2 + javac + d8 (no Gradle).
HTML entry: `/opt/data/fund_monitor_web/index.html`

```bash
# Copy latest HTML and rebuild APK
cp /opt/data/fund_monitor_web/index.html /opt/fund-monitor-apk/app/src/main/assets/
bash /opt/fund-monitor-apk/build.sh
# Output: /opt/data/fund_monitor_web/FundMonitor.apk
```

Build tools: `/opt/android-sdk/build-tools/34.0.0/` (aapt2, d8, zipalign, apksigner)
Platform: `/opt/android-sdk/platforms/android-34/android.jar`
JDK: `/usr/lib/jvm/java-21-openjdk-amd64`

### Android Data Engine
Uses `fetch()` as primary (WebView has CORS disabled via `setAllowUniversalAccessFromFileURLs(true)`).
JSONP fallback with mutex for `window.jsonpgz` to prevent concurrent clobbering.
All APIs: fundgz.1234567.com.cn, push2.eastmoney.com, hq.sinajs.cn.

### Android UI Differences
- Summary bar: vertical rows (label left, value right), not horizontal flex
- Default tab: overview (📊 总览)
- Pie chart: centered below metrics
- Tabs include overview button at position 0

## Rebuild Workflow

When user requests changes:
1. Edit files in `/opt/data/fund_monitor_app/`
2. Copy to `/opt/wine-py32/`
3. Rebuild: `rm -rf build dist && WINEPREFIX=/root/.wine wine python.exe -m PyInstaller --onefile --windowed --name "FundMonitor" --hidden-import PyQt5 --hidden-import PyQt5.QtCore --hidden-import PyQt5.QtWidgets --hidden-import PyQt5.QtGui --add-data "portfolio_config.py;." --clean main.py`
4. Package: `7z a -p123456 -tzip FundMonitor.zip FundMonitor.exe`
5. Send: `MEDIA:/opt/data/FundMonitor.zip`, password `123456`
