---
name: fund-monitor-android-build
description: Build Fund Monitor as Android APK — WebView with native request interception to add Referer headers that browsers block. Pure command-line build (aapt2 + javac + d8), no Gradle/Android Studio needed.
version: 2.2.0
deprecated: true
deprecation_reason: |
  ⚠️ 此 skill 已废弃（2026-05-21）。它描述的是旧的最小化 aapt2 构建方案，产出的 APK 仅 ~86KB，缺少 Kotlin/Gradle/Compose 等完整项目依赖。用户收到的 APK 只有 86KB 而不是正常的 16MB，无法安装使用。

  请改用以下 skill：
  - fund-monitor-apk-build：Gradle 标准构建，WebView + Compose Surface 架构
  - fund-monitor-native-compose：完整 Kotlin + Gradle + Compose 项目说明

  正确项目路径：/opt/data/FundMonitor-claude-dev/（dev worktree）
  正确构建命令：cd /opt/data/FundMonitor-claude-dev && ./gradlew assembleDebug
  正确输出：app/build/outputs/apk/debug/app-debug.apk（~16MB）
  错误项目路径：/opt/data/fund_monitor_app/android/（此 skill 描述的项目）
  错误输出：build/FundMonitor.apk（~86KB）
---
tags: [fund, monitor, android, apk, webview, referer, interception, aapt2, d8]
---

# Fund Monitor Android APK Build (v2: Native Interception)

## Core Breakthrough

**Browsers (including WebView JS context) block custom `Referer` headers in `fetch()`.** The 东方财富 f10/lsjz API requires `Referer: https://fundf10.eastmoney.com/` — making it impossible to call from PWA/HTML.

**Solution: Intercept at the native layer.** Override `WebViewClient.shouldInterceptRequest()` to detect requests to 东方财富 domains, re-issue them natively via `HttpURLConnection` with the correct Referer, and return the response. Zero changes needed in HTML — `fetch()` calls work transparently.

```
HTML:  fetch("https://api.fund.eastmoney.com/f10/lsjz?fundCode=000008")
         ↓
WebView: shouldInterceptRequest detects "api.fund.eastmoney.com"
         ↓
Native:  HttpURLConnection → add Referer header → get response
         ↓
HTML:    receives data as if CORS never existed
```

## Architecture

```
APK structure:
├── AndroidManifest.xml       (INTERNET permission)
├── classes.dex               (MainActivity with interception WebViewClient)
├── assets/index.html         (Complete PWA: JS engine + UI)
└── META-INF/                 (Debug signing)
```

## Environment

- **JDK**: OpenJDK 21 (or 17)
- **Android SDK**: at `/opt/android-sdk/`
  - `platforms;android-34`
  - `build-tools;35.0.0` ⚠️ Must be 35+ (34.0.0 d8 crashes on JDK 21)
  - `platform-tools`
- **No Gradle**: Uses aapt2 + javac + d8 + apksigner directly
- **Working dir**: `/opt/data/fund_monitor_app/android/`
- **Build script**: `/opt/data/fund_monitor_app/android/build.sh`

## Build Script (`build.sh`)

```bash
#!/bin/bash
set -e
SDK=/opt/android-sdk
BUILD_TOOLS=$SDK/build-tools/35.0.0   # ⚠️ d8/apksigner must be 35+
AAPT2=$SDK/build-tools/34.0.0/aapt2   # ⚠️ aapt2 MUST be 34 (35 proto-format breaks APK)
PLATFORM=$SDK/platforms/android-34
PROJ=/opt/data/fund_monitor_app/android
OUT=$PROJ/build

export ANDROID_SDK_ROOT=$SDK

# 1. aapt2 compile + link (use v34 — no --proto-format!)
$AAPT2 compile --dir $PROJ/app/src/main/res -o $OUT/compiled-resources.zip
$AAPT2 link -I $PLATFORM/android.jar \
  --manifest $PROJ/app/src/main/AndroidManifest.xml \
  --java $OUT/ -o $OUT/apk/base.apk $OUT/compiled-resources.zip

# 2. javac (JDK 21 needs --release 11 for d8 compat)
javac --release 11 -cp $PLATFORM/android.jar -d $OUT/classes \
  $OUT/com/fundmonitor/app/R.java \
  $PROJ/app/src/main/java/com/fundmonitor/app/MainActivity.java

# 3. d8 (build-tools 35 handles JDK 21 class files)
$BUILD_TOOLS/d8 --lib $PLATFORM/android.jar \
  --output $OUT/dex $OUT/classes/com/fundmonitor/app/*.class

# 4. Package
mkdir -p $OUT/apk_unpacked
unzip -qo $OUT/apk/base.apk -d $OUT/apk_unpacked
cp $OUT/dex/classes.dex $OUT/apk_unpacked/
cp -r $PROJ/app/src/main/assets $OUT/apk_unpacked/
cd $OUT/apk_unpacked && zip -qr $OUT/fundmonitor-unsigned.apk . && cd -

# 5. Align + Sign
$BUILD_TOOLS/zipalign -f 4 $OUT/fundmonitor-unsigned.apk $OUT/fundmonitor-aligned.apk
$BUILD_TOOLS/apksigner sign --ks $PROJ/debug.keystore \
  --ks-pass pass:android --key-pass pass:android \
  --min-sdk-version 26 \
  --out $OUT/FundMonitor.apk $OUT/fundmonitor-aligned.apk
```

## MainActivity.java — The Interception Pattern

```java
package com.fundmonitor.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import java.io.*;
import java.net.*;

public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccessFromFileURLs(true);       // CORS off
        s.setAllowUniversalAccessFromFileURLs(true);   // CORS off
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();

                // ⭐ Intercept 东方财富 API calls, inject Referer
                if (url.contains("api.fund.eastmoney.com/f10/lsjz") ||
                    url.contains("push2.eastmoney.com")) {
                    return proxyWithReferer(url,
                        "https://fundf10.eastmoney.com/");
                }
                // 天天基金 also benefits from Referer
                if (url.contains("fundgz.1234567.com.cn")) {
                    return proxyWithReferer(url,
                        "https://fund.eastmoney.com/");
                }
                return super.shouldInterceptRequest(view, request);
            }

            private WebResourceResponse proxyWithReferer(
                    String url, String referer) {
                try {
                    HttpURLConnection conn = (HttpURLConnection)
                        new URL(url).openConnection();
                    conn.setConnectTimeout(8000);
                    conn.setReadTimeout(8000);
                    conn.setRequestProperty("Referer", referer);
                    conn.setRequestProperty("User-Agent", "Mozilla/5.0");
                    conn.connect();

                    String mime = conn.getContentType();
                    if (mime == null) mime = "application/json";
                    String enc = conn.getContentEncoding();
                    if (enc == null) enc = "UTF-8";

                    return new WebResourceResponse(
                        mime.split(";")[0].trim(), enc,
                        conn.getInputStream());
                } catch (Exception e) { return null; }
            }
        });

        webView.loadUrl("file:///android_asset/index.html");
        setContentView(webView);
    }
}
```

## HTML Data Engine (v2)

With native interception, the HTML can call 东方财富 f10/lsjz directly via `fetch()`:

```javascript
// ⭐ Batch fetch 东方财富 official NAV (WebView injects Referer)
async function fetchEMNavBatch(codes) {
  const results = {};
  await Promise.allSettled([...new Set(codes)].map(async code => {
    try {
      const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1`;
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(6000),
        headers: {'User-Agent': 'Mozilla/5.0'}
        // Referer auto-injected by native shouldInterceptRequest!
      });
      const data = await resp.json();
      if (data?.ErrCode === 0) {
        const item = data.Data?.LSJZList?.[0];
        if (item) results[code] = {
          date: item.FSRQ, dwjz: item.DWJZ,
          chg_pct: parseFloat(item.JZZZL || 0)
        };
      }
    } catch(e) {}
  }));
  return results;
}
```

### Data Source Priority (v2.1 — 东方财富优先)

| Priority | Source | Method | Referer needed |
|----------|--------|--------|:---:|
| 1 ⭐ | 东方财富 f10/lsjz (官方净值) | `fetch()` → intercepted | ✅ Native injects |
| 2 | 天天基金 fundgz (估值+净值) | `fetch()` | ✅ Native injects |
| 3 | QDII ETF 实时价 | `fetch()` push2/sina | ✅ Native injects |

### NAV Confirmation: 东方财富优先，天天基金备选

```javascript
// ⭐ Priority: 东方财富 official NAV first (the reason we built a native APK)
// 1. 东方财富 f10/lsjz dwjz changed → confirm (official NAV, most accurate)
// 2. 天天基金 fundgz dwjz changed → confirm (backup, when 东方财富 not yet updated)
// 3. Confirmed funds frozen for the day — no more API calls
// 4. QDII: ETF实时价 as fallback when no NAV available yet
// 5. 盘中估值展示: 天天基金 gsz/gszzl (fast, real-time)
```

## Pitfalls

1. **build-tools 34.0.0 + JDK 21 = d8 crash**: `NullPointerException: Cannot invoke "String.length()"` on anonymous inner classes. **Must use build-tools 35.0.0+** with JDK 21.

2. **build-tools 35 aapt2 proto-format breaks APK on real devices**: `aapt2 link --proto-format` generates a protobuf AndroidManifest that causes "package appears to be corrupt" on many phones (especially older Android versions). **Solution: Use aapt2 from build-tools 34 for ALL resource compilation** (generates traditional binary XML, universally compatible), while using d8/apksigner from 35 (for JDK 21 compat). Set `AAPT2=$SDK/build-tools/34.0.0/aapt2` separately from `BUILD_TOOLS=$SDK/build-tools/35.0.0`. Remove `--proto-format` flag entirely. Verify with: `unzip -p APK AndroidManifest.xml | xxd | head -1` — should show binary XML (`^C^@^H^@`), NOT protobuf.

3. **`--min-sdk-version 26` in apksigner**: Required when APK manifest is in binary format that apksigner can't auto-detect minSdkVersion from. Safe to always include.

4. **`read_file()` in execute_code returns line-numbered content**: `hermes_tools.read_file()` returns `{"content": "     1|actual content\n     2|more content", ...}` — the content includes `LINE|` prefixes. Writing this via `write_file()` corrupts the file (line numbers embedded in output). **Fix**: After using execute_code to write a file, immediately clean it: `sed -i 's/^[[:space:]]*[0-9]\{1,4\}|//' /path/to/file`. Alternatively, use `terminal("cat /source > /dest")` for simple file copies. This caused the "界面被改坏了" bug where HTML displayed line numbers.

5. **Gradle downloads fail**: `services.gradle.org` and `dl.google.com` time out from this NAS. Use sdkmanager for Android tools, and command-line aapt2/javac/d8 for building (no Gradle).

6. **WebView CORS**: Must set BOTH `setAllowFileAccessFromFileURLs(true)` AND `setAllowUniversalAccessFromFileURLs(true)`.

7. **String vs numeric NAV comparison**: Always `parseFloat()` before comparing — `"1.2340" !== "1.234"` causes false positives.

8. **Promise-based dedup**: Cache the promise itself (not the resolved value) so concurrent callers share one in-flight request.

9. **APK delivery via WeChat**: `.apk` files blocked by WeChat. Use `zip -P 123456 Output.apk.zip FundMonitor.apk` with password. `MEDIA:/path` prefix delivers as file in WeChat — but is unreliable (sometimes fails silently). Retry if user doesn't receive. Direct `.apk` without zip works but WeChat may block it silently.

10. **Asset index.html MUST be updated BEFORE build.sh**: The HTML at `app/src/main/assets/index.html` is the actual app content. Any changes to HTML must be written to this path BEFORE running build.sh.

11. **confirmed_count after merge**: After merging confirmed + unconfirmed funds, recalculate `result.confirmed_count = result.funds.filter(f => f.confirmed).length`.

12. **JS ReferenceError from stale variable references (totalCost)**: When patching JS code via string replacement, removing a variable declaration (`let totalCost = 0;`) while leaving references to it (`totalCost += cost;`, `const hg = tv - totalCost`) causes a ReferenceError that silently crashes the entire app — the UI just shows the initial spinner/loading state forever with no visible error. **Fix**: Always grep the file for ALL references to a variable before removing its declaration. If any remain, replace the entire function with `patch` tool rather than doing partial string replacements.

13. **HTML line number pollution in execute_code**: `hermes_tools.read_file()` returns content prefixed with `LINE_NUM|` (e.g., `    12|actual line`). Writing this via `write_file()` embeds the line numbers. The patch tool is NOT affected by this (it operates on raw file), but execute_code file writes are. **Fix**: After any execute_code write_file to an HTML/text file, run `sed -i 's/^[[:space:]]*[0-9]\{1,4\}|//' /path/to/file`. Verify with `head -3 file`.

14. **CSS layout: flex-based scrolling for APK**: Tab bar horizontal scroll requires `display:flex; flex-shrink:0` on `.tab` items and `touch-action:pan-x` on the wrapper. Content area vertical+horizontal scroll needs `body{height:100vh;overflow:hidden}` + `.app{display:flex;flex-direction:column;height:100vh}` + `#tabContent{flex:1;overflow:auto}`. Remove `.app` padding (let #tabContent have its own `padding:6px`) to avoid scroll bar misalignment.

15. **WeChat APK delivery quirks**: `MEDIA:/path/to.apk` may fail silently (user doesn't receive). `.apk` without zip can be blocked by WeChat (user gets nothing). `.apk.zip` with password (`zip -P 123456`) is most reliable. If user says "没有收到", re-send immediately with a different method. Also works to send via `send_message` tool if available.

16. **Monetary funds (货币基金) skip all API calls**: Monetary funds (钱袋子/增金宝/滚钱宝, codes: 003389, 000509, 009790, 004939) have near-constant NAV ~1.0000 and no daily NAV update. Skip ALL fetch requests for them — just display `cur_val = amount` with source "💵 货币基金". Use a `MONETARY_FUNDS` Set checked at the top of `processFund()`.

17. **QDII funds use 东方财富 official NAV chg_pct**: QDII funds have no real-time fundgz, but 东方财富 f10/lsjz returns their NAV (T+1) with `JZZZL` (涨跌幅). Use this as the primary data source for QDII NAV updates, with ETF实时价 only as fallback when f10/lsjz has no new data yet.

18. **Adaptive icon via vector XML**: Simple app icon using vector drawables (`res/drawable/ic_launcher_foreground.xml` + `ic_launcher_background.xml`) referenced from `res/mipmap-anydpi-v26/ic_launcher.xml`. No PNG generation needed for API 26+.

### Lessons from 2026-05-07/08 session — JS & Build Workflow

19. **`typeof x === 'number'` for zero values**: `if (nav.chg_pct)` is falsy when `chg_pct === 0` (fund unchanged). This silently skips QDII data when涨跌幅 is 0%. Always use `typeof nav.chg_pct === 'number'` for numeric checks where 0 is valid. Same for any other numeric field that can be zero.

20. **JS syntax validation before build — `node --check`**: Before building APK, validate ALL `<script>` blocks with Node.js syntax checker. A single syntax error silently prevents the entire JS from executing — the app just shows the initial spinner forever. Use:
```bash
python3 -c "
import re, subprocess
html = open('app/src/main/assets/index.html').read()
for i, js in enumerate(re.findall(r'<script>(.*?)</script>', html, re.DOTALL)):
    with open(f'/tmp/js_{i}.js','w') as f: f.write(js)
    r = subprocess.run(['node','--check',f'/tmp/js_{i}.js'], capture_output=True, text=True)
    print(f'Block {i}: {\"OK\" if r.returncode==0 else \"ERROR: \"+r.stderr[:200]}')
"
```
All blocks must pass before proceeding to build.

21. **`patch` tool double-escaping corruption**: When old_string/new_string contain backslash characters (`\`), the `patch` tool can double-escape them (`\"` → `\\\"`). This creates real syntax errors in JavaScript strings. **For multi-line JS edits involving backslashes, use terminal `python3 << 'PYEOF'` heredoc instead of `patch`.** The heredoc preserves exact character sequences. Reserve `patch` for single-line CSS changes and simple text replacements without backslashes.

22. **Rebuild from known-good base when cascading corruption occurs**: When incremental patches have introduced escaping errors or stale references, stop patching. Read the LAST CONFIRMED WORKING HTML, apply ALL changes in a single Python script (using `str.replace()`), validate with `node --check`, then build. This avoids accumulating corruption across multiple patch operations. The working base is at `/opt/data/fund_monitor_web/index.html`.

23. **`Promise.race` timeout for hung WebView requests**: If `shouldInterceptRequest` hangs on network calls (DNS timeout, connection refused), individual `fetch()` promises inside `fetchEMNavBatch` may never resolve or reject. Wrap the batch call with a hard timeout:
```javascript
navMap = await Promise.race([
  fetchEMNavBatch([...allCodes]),
  new Promise(r => setTimeout(() => r({}), 5000))
]);
```
This ensures the app proceeds after 5s with empty东方财富 data, falling back to天天基金. Without this, the entire `doRefresh()` hangs and the spinner never clears.

24. **renderPortfolio must be fully replaced, not partially patched**: When removing columns (cost, 持有收益, 累计收益率), replacing individual lines leaves dangling variable references (`totalCost`). A `ReferenceError: totalCost is not defined` silently crashes the entire app. **Grep for ALL references to a variable before removing its declaration, or replace the entire function body at once.**
