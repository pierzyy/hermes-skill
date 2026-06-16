---
name: android-apk-no-gradle
description: Build Android APK from command-line tools only (no Gradle/Android Studio). Pure aapt2 + javac + d8 + apksigner pipeline.
---

# Android APK Build Without Gradle

Build a signed Android APK using only command-line SDK tools. No Gradle, no Android Studio, no wrapper downloads.

## When to Use

- Gradle unavailable or download blocked
- Need fast incremental builds (just one .java change)
- Headless Linux build environment
- WebView-based APK (Cordova/manual)

## Prerequisites

```
export ANDROID_SDK_ROOT=/opt/android-sdk
BUILD_TOOLS=$ANDROID_SDK_ROOT/build-tools/35.0.0  # d8/apksigner
AAPT2=$ANDROID_SDK_ROOT/build-tools/34.0.0/aapt2  # traditional XML manifest
PLATFORM=$ANDROID_SDK_ROOT/platforms/android-34
```

**Critical:** Use aapt2 from build-tools 34 (generates binary XML, compatible with all Android versions). build-tools 35 aapt2 generates proto-format manifest that old devices & apksigner can't parse.

Use d8 from build-tools 35 (compatible with JDK 21 class files). build-tools 34 d8 crashes on JDK 21 output.

## Build Script (build.sh)

```bash
#!/bin/bash
set -e

SDK=/opt/android-sdk
BUILD_TOOLS=$SDK/build-tools/35.0.0
AAPT2=$SDK/build-tools/34.0.0/aapt2
PLATFORM=$SDK/platforms/android-34
PROJ=/path/to/project
OUT=$PROJ/build

# 1. Compile resources
$AAPT2 compile --dir $PROJ/app/src/main/res -o $OUT/compiled-resources.zip

# 2. Link (NO --proto-format!)
$AAPT2 link -I $PLATFORM/android.jar \
  --manifest $PROJ/app/src/main/AndroidManifest.xml \
  --java $OUT/ -o $OUT/apk/base.apk \
  $OUT/compiled-resources.zip

# 3. Compile Java
javac --release 11 -cp $PLATFORM/android.jar \
  -d $OUT/classes \
  $OUT/com/name/app/R.java \
  $PROJ/app/src/main/java/com/name/app/*.java

# 4. DEX
$BUILD_TOOLS/d8 --lib $PLATFORM/android.jar \
  --output $OUT/dex $OUT/classes/com/name/app/*.class

# 5. Package
unzip -qo $OUT/apk/base.apk -d $OUT/apk_unpacked
cp $OUT/dex/classes.dex $OUT/apk_unpacked/
cp -r $PROJ/app/src/main/assets $OUT/apk_unpacked/
cd $OUT/apk_unpacked && zip -qr $OUT/unsigned.apk . && cd -

# 6. Align
$BUILD_TOOLS/zipalign -f 4 $OUT/unsigned.apk $OUT/aligned.apk

# 7. Sign (generate keystore first if needed)
$BUILD_TOOLS/apksigner sign \
  --ks $PROJ/debug.keystore \
  --ks-pass pass:android --key-pass pass:android \
  --min-sdk-version 26 \
  --out $OUT/App.apk $OUT/aligned.apk
```

## WebView with Referer Injection

For calling APIs that require Referer (e.g. Eastmoney), override `shouldInterceptRequest` in WebViewClient:

```java
webView.setWebViewClient(new WebViewClient() {
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (url.contains("api.fund.eastmoney.com/f10/lsjz")) {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestProperty("Referer", "https://fundf10.eastmoney.com/");
                conn.setRequestProperty("User-Agent", "Mozilla/5.0");
                conn.connect();
                InputStream stream = conn.getInputStream();
                String mime = conn.getContentType();
                return new WebResourceResponse(
                    mime.split(";")[0].trim(), "UTF-8", stream);
            } catch (Exception e) { e.printStackTrace(); }
        }
        return super.shouldInterceptRequest(view, request);
    }
});
```

## Key to CSS Scrolling in WebView

For flex layout with scrollable tabs + scrollable content:

```css
body { height: 100vh; overflow: hidden; }
.app { display: flex; flex-direction: column; height: 100vh; max-width: 600px; margin: 0 auto; }
.topbar { flex-shrink: 0; }
.tabs-wrap { overflow-x: auto; flex-shrink: 0; touch-action: pan-x; height: 42px; }
.tabs-wrap::-webkit-scrollbar { height: 0; }
.tab { flex-shrink: 0; }  /* critical: prevent flex compression */
#tabContent { flex: 1; overflow-y: auto; overflow-x: auto; }
.bottom { flex-shrink: 0; }
```

## Pitfalls

1. **aapt2 proto-format**: build-tools 35 generates proto manifest — incompatible with many devices
2. **d8 + JDK 21**: build-tools 34 d8 crashes on JDK 21 class files. Use build-tools 35 d8.
3. **apksigner --min-sdk-version**: required when manifest is binary XML (add `--min-sdk-version 26`)
4. **Tab flex-shrink**: Without `flex-shrink:0`, tabs get compressed and scrolling breaks
5. **Double overflow**: Nested `overflow-x:auto` containers break scroll behavior — let parent handle it
6. **WebView CORS**: Must set `setAllowUniversalAccessFromFileURLs(true)` for fetch() from file:// URLs

## Hermes Tool Traps

When editing HTML/JS inside APK assets, avoid these Hermes tool gotchas:

1. **read_file → write_file corruption**: `read_file` returns content with `LINE|` prefixes. Writing this raw output back via `write_file` will corrupt the file with line numbers. Always use `terminal(sed)` or Python `read_file` + strip before writing.

   ```bash
   # Fix line number pollution:
   sed -i 's/^[[:space:]]*[0-9]\{1,4\}|//' file.html
   ```

2. **patch tool quote escaping**: The `patch` tool may double-escape quotes (`\"` → `\\"`) in replacement strings. Verify with `cat -v` and fix with:

   ```bash
   python3 -c "html=open('f').read(); html=html.replace('\\\\\\\\\"','\"'); open('f','w').write(html)"
   ```

3. **execute_code string matching**: When using execute_code to find-and-replace in files, multi-line `old_string` often doesn't match due to invisible whitespace differences. Prefer `patch` tool for exact replacements.

4. **APK verification**: After building, always verify the embedded HTML is clean:

   ```bash
   unzip -p App.apk assets/index.html | head -3  # should show <!DOCTYPE html>
   ```
