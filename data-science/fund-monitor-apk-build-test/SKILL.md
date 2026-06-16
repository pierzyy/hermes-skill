---
name: fund-monitor-apk-build-test
description: Build FundMonitor APK, validate with local test harness before sending. Covers common bugs and the WebView architecture gotcha.
category: data-science
---

# FundMonitor APK Build & Test

## Critical Architecture
**The app is a WebView loading `app/src/main/assets/index.html`.** The Kotlin/Compose files in `app/src/main/java/com/fundmonitor/` are **DEAD CODE** — they are never executed. All logic is in the single HTML file's `<script>` blocks. Do NOT modify Kotlin files to fix runtime behavior.

## Worktree Discipline — IRON RULE

**ALL edits must happen in `/opt/data/FundMonitor-claude-dev/` (dev worktree, branch `dev`).** Then commit → merge to master → build from master. NEVER edit master directly — it causes merge conflicts and confusion.

```bash
# ✅ CORRECT flow
cd /opt/data/FundMonitor-claude-dev  # edit here
git add -A && git commit -m "..."    # commit on dev
cd /opt/data/FundMonitor-claude       # switch to master
git merge dev -m "..."               # merge dev into master
# ... now build from master
```

```bash
# ❌ WRONG — editing master directly causes merge conflicts
cd /opt/data/FundMonitor-claude  # DO NOT edit here
```

## Build (from master worktree ONLY, AFTER merging dev)

```bash
cd /opt/data/FundMonitor-claude  # ⚠️ MUST be master, NOT dev
export ANDROID_HOME=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk /opt/data/FundMonitor.apk  # ⚠️ COPY IS REQUIRED — build does NOT auto-copy to /opt/data/FundMonitor.apk
```

## APK Delivery — CRITICAL IRON LAW

**MEDIA tag MUST be the ENTIRE message.** Nothing else. No text before, no text after, no tables, no lists, no code blocks.

```
✅ CORRECT (single message):
MEDIA:/opt/data/FundMonitor.apk

❌ WRONG (will be silently dropped by WeChat):
MEDIA:/opt/data/FundMonitor.apk
**v3.8-0520p** — fixes for spacing...

❌ WRONG:
| Step | Status |
|------|--------|
| Build | ✅     |
MEDIA:/opt/data/FundMonitor.apk
```

**Pattern**: Send APK as a standalone message first, then send the summary in a second message.

## Full Workflow Pipeline (mandatory, display every step to user)

```
📁 dev worktree  → 修改 index.html
🧪 syntax        → node test_fund_monitor.js --syntax    (2 blocks)
📝 commit        → git add + git commit                   (in dev)
🔀 merge         → git merge dev                          (in master)
🧪 full test     → node test_fund_monitor.js --all        (192 cases)
🔨 build         → ./gradlew assembleDebug                (in master)
📤 deploy        → cp + standalone MEDIA message          (no other text!)
```

Every step must show its output inline. Tests must show the pass count, not truncated.

## Warm Palette (v3.8-0520i+, user-approved)

Do NOT revert to cold Apple colors. The user prefers this warm scheme:

```
--bg:  #1c1814 (espresso black)
--fg:  rgba(255,248,238,0.92) (ivory white)
--red: #E07B5A (terracotta red, for gains)
--green: #8DA870 (sage green, for losses)
--blue: #B89960 (amber gold, for accent/interactive)
Cards/borders: rgba(210,190,160,...) (milk tea beige base)
```

- Tables: NO zebra striping. Use warm `border-bottom` separators (0.06 alpha).
- Border+radius on `<table>` itself (border-collapse:separate), wrapper only scrolls.
- Sort buttons: active state uses `var(--blue)` (amber), not green.
- Confirmed rows: `rgba(212,147,92,0.12)` (warm orange tint).

## Source Detail Badges

`formatSourceDetail(detail)` parses source_detail strings into colored badges:
- **Valuation** (净值/估值/万份): `.badge-val` — cyan background `rgba(128,168,152,0.15)`
- **Date** (M/D HH:MM): `.badge-date` — purple background `rgba(160,128,112,0.15)`
- Date format: YYYY-MM-DD → M/D (e.g. 2026-05-19 → 5/19)
- Combined date+time: "5/19 14:30" in one badge
- Source badge: wrapped in `.badge-src` (margin:0 for uniform spacing)
## Source Detail Badges — CRITICAL CSS RULE

**Badge box-model MUST be on the same class as the background.** The `.badge` base class historically had `display:inline-block;padding:2px 6px;border-radius:4px` but NO `background`. This created a phantom "outer box" → the parent element's background showed through the transparent padding area, visually nesting the child `.badge-xxx` background inside it (user saw "两个背景框").

**Rule**: Box-model properties (display, padding, border-radius) must be on the SAME CSS class as `background`. Either:
- Put everything on `.badge-xxx` classes (`.badge` becomes typography-only)
- Or put background on `.badge` base class

Current (correct) approach:
```css
.badge{font-size:9px;margin-left:4px;vertical-align:middle;font-weight:500} /* typography only, NO box-model */
.badge-tt{display:inline-block;padding:2px 6px;border-radius:4px;background:rgba(10,132,255,.12);color:var(--blue)}
/* ... same pattern for all badge-xxx */
```

**Also**: `sourceBadge()` default fallthrough cases use inline styles. Those MUST include `display:inline-block;padding:2px 6px;border-radius:4px` because `.badge` base class no longer provides them.

## Confirmed Fund Styling (v3.8-0520t+)

- **Sort order**: Confirmed funds sorted FIRST (both per-portfolio and "全部" card). Sort logic: `if (a.confirmed !== b.confirmed) return a.confirmed ? -1 : 1;`
- **Name color**: `var(--orange)` (#D4935C) instead of `var(--green)`
- **Row tint**: `tr.confirmed td { background:rgba(212,147,92,0.12)!important }`
- **Left border**: `tr.confirmed td:first-child { border-left:3px solid var(--orange) }`

## Source Detail with Date (v3.8-0520u+)

`navDateMap` global tracks NAV publication dates for confirmed funds across sessions. Populated during f10 confirmation, read by todayConfirmed fast paths. Ensures source_detail shows `净值1.2345 (2026-05-19)` even when API is skipped.

```javascript
// Declaration (alongside confirmedChgPct)
const navDateMap = {}; // {code: nav_date}

// Populate in all f10 confirmation paths:
navDateMap[code] = f10data.jzrq || '';

// Use in todayConfirmed fast paths:
r.source_detail = prevNavs[code] ? '净值'+prevNavs[code]+(navDateMap[code]?' ('+navDateMap[code]+')':'') : '';

// Clear on trading date switch:
for (const k in navDateMap) delete navDateMap[k];

// ⚠️ CRITICAL: Restore from h[6] in loadPortfolios()
// navDateMap is runtime-only. On app restart, todayConfirmed/confirmedChgPct are restored
// from h[4]/h[5], but navDateMap must ALSO be restored from h[6] or confirmed funds
// will show source_detail with date but NO 净值 (user sees only "东方财富 5/19").
if (h[4] === today) {
  todayConfirmed.add(h[0]); confirmedChgPct[h[0]] = h[5]||0;
  if (h[6]) navDateMap[h[0]] = h[6];  // ← MANDATORY
}
```

## Sign Bug Pattern — `(x>=0?'+':'')+Math.abs(x)` LOSES MINUS SIGN

**Bug**: When `x < 0`, `(x>=0?'+':'')` returns empty string and `Math.abs()` strips the negative. Result: `-30` displays as `30` — the minus sign is silently dropped.

**Fix**: `(x>=0?'+':'-')+Math.abs(x)` — always emit either `+` or `-`.

This pattern appeared in summary metric rendering (lines 1803-1804, 1726). Always audit `Math.abs()` calls paired with sign-ternary for this bug.
1. **JZZZL `0` treated as null**: `item.JZZZL ? parseFloat(...) : null` — JS treats `0` as falsy. Fix: `item.JZZZL !== undefined && item.JZZZL !== '' ? parseFloat(...) : null` (line ~188)
2. **Confirmed path `curVal = amount`**: Non-market-hours confirmed path (line ~742) set `cur_val = amount` directly. Fix: `cur_val = amount * (1 + chgPct/100)`
3. **`prevNavs` overwritten on confirmation**: `prevNavs[f.code] = f.dwjz` (line ~1546) overwrites the correct reference NAV with the current one, causing next refresh to compute zero gain. Fix: removed the line, let unconfirmed-phase `savePrevNav` calls handle it.
4. **Holding amount compound growth**: `h[2] = f.cur_val` ran on every refresh, not just first confirmation. Fix: only update when `wasNewToday` (h[4] ≠ today).
5. **QDII `source_detail` missing NAV/date**: After prevNavs cleared, the non-market-hours confirmed path had no fallback for source_detail. Fix: use `f10.dwjz` from the parallel fetch.

## Debugging Blank Screen / Silent JS Errors

When the app shows only the loading spinner after a change, the JS is throwing an error silently. WebView doesn't surface console errors visibly.

**Step 1: Wrap the render call in init() with try-catch**
```javascript
try {
  if (activeKey === '__overview__') renderOverview();
  else if (activeKey) renderPortfolio(activeKey);
} catch(e) {
  $('tabContent').innerHTML = '<div style="color:var(--red);padding:20px">Error: '+e.message+'</div>';
}
```
This surfaces the error directly in the UI so the user can report it.

**Step 2: Check for duplicate variable declarations**
After large code edits, `const x = ...; const x = ...;` can slip through. Search the HTML: `grep -n "const loading\|const chgColor\|function clrSpan" index.html`

**Step 3: Test JS in Node with mocked DOM**
```bash
cd /opt/data/FundMonitor-claude-dev && node -e "
var fs = require('fs'); var html = fs.readFileSync('app/src/main/assets/index.html','utf8');
var m = html.match(/<script>([\s\S]*?)<\/script>/); var js = m[1];
// Mock minimal globals
global.document = { getElementById: function(){ return { innerHTML:'', classList:{add:function(){},remove:function(){}} }; } };
global.localStorage = { getItem:function(){return null}, setItem:function(){}, removeItem:function(){} };
global.DEFAULT_PORTFOLIOS = {}; global.FUND_ETF_MAP = {}; global.QDII_NO_FUNDGZ = new Set();
global.MONETARY_FUNDS = new Set(); global.todayConfirmed = new Set(); global.confirmedChgPct = {};
global.prevNavs = {}; global.closingCache = {}; global.portfolioResults = {};
global.etfCache = {}; global.tradingDayCache = {}; global.autoEnabled = false;
global.\$ = function(){ return { innerHTML:'', classList:{add:function(){},remove:function(){}}, style:{}, value:'' }; };
eval(js); if (typeof init === 'function') init();
console.log('OK');
"
```
If this throws, the error message tells you exactly what's wrong.

**Step 4: Always bump CLEANUP_VERSION when modifying logic that touches persisted state**
Stale localStorage data (h[4], prevNavs, closingCache) can bypass all code fixes. The cleanup code in `init()` wipes stale state on version change.

## Patch Tool Escaping Pitfall

When using the `patch` tool to edit JS template strings that contain `\"` (escaped double-quotes inside JS strings), the tool can corrupt them to `\\\"` (double-escaped). This creates syntax errors in the HTML.

**Always verify after patching JS strings:**
```bash
grep -n '\\\\\\\\\\"' app/src/main/assets/index.html  # should return NOTHING
```

**Fix if corrupted:**
```bash
cd /opt/data/FundMonitor-claude-dev && python3 -c "
with open('app/src/main/assets/index.html','r') as f:
    text = f.read()
text = text.replace('\\\\\\\"', '\\\"')
with open('app/src/main/assets/index.html','w') as f:
    f.write(text)
"

## Pitfall: Wrong Build System (86KB vs 16MB APK)

There are TWO build systems, easily confused:

| System | Location | Command | Output |
|--------|----------|---------|--------|
| ✅ **Gradle** (correct) | `/opt/data/FundMonitor-claude*/` | `./gradlew assembleDebug` | **16MB** |
| ❌ Minimal aapt2 | `/opt/data/fund_monitor_app/android/` | `bash build.sh` | **86KB** |

The minimal aapt2 script builds a bare WebView shell without OkHttp, Compose, or Kotlin dependencies. It produces a functionally broken APK. **Always use Gradle from FundMonitor-claude-dev/master.**

## Adaptive Icon: PNG Foreground Pattern

For proper icon sizing on modern Android launchers, use adaptive icon with PNG foreground:

1. Generate foreground PNG at **432×432** (108dp @ 4x) with content inside **66dp safe zone** (264px centered).
2. Place at `drawable-nodpi/ic_launcher_fg.png` (nodpi prevents density scaling artifacts).
3. Adaptive icon XML uses `<bitmap>` foreground:

```xml
<!-- res/mipmap-anydpi-v26/ic_launcher.xml -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground>
        <bitmap android:src="@drawable/ic_launcher_fg" android:gravity="center"/>
    </foreground>
</adaptive-icon>
```

4. Background is a simple solid-color vector drawable (`#0A0A0E` for dark theme).
5. Remove old mipmap PNGs and vector foreground XML to avoid conflicts.

**Do NOT use** traditional mipmap PNGs (48×48/72×72/etc) — they appear tiny inside modern launcher masks.

## Help Document: Browser-Based Fallback Pattern

When WebView `innerHTML`-based modal content fails to render (only shows title, body is blank), a reliable alternative is to save HTML to cache and open with system browser:

**AndroidBridge.kt** — `openHelp(html)` method:
```kotlin
@JavascriptInterface
fun openHelp(html: String) {
    activity.runOnUiThread {
        val file = File(activity.cacheDir, "fundmonitor_help.html")
        file.writeText(html)
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "text/html")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        activity.startActivity(intent)
    }
}
```

**index.html** — `showHelp()`:
```javascript
function showHelp() {
  fetch('help.html')
    .then(function(r) { return r.text(); })
    .then(function(html) { AndroidBridge.openHelp(html); })
    .catch(function() {
      // fallback: embedded template
      AndroidBridge.openHelp(document.getElementById('helpFallback').textContent);
    });
}
```

This pattern is reusable for any in-app documentation that fails to render in WebView modals.

## Version bump steps
1. Update `<title>` in `index.html` (version letter)
2. Update `CLEANUP_VERSION` if data migration or logic changes touch persisted state
3. Update `versionCode` and `versionName` in `build.gradle.kts`
4. Run `test_fund_monitor.js --all`
5. Build & send
