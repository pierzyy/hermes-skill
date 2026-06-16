---
name: android-apk-cli-build
description: Build Android APKs from command-line tools only (no Gradle, no Android Studio). Use for headless Linux environments where Gradle is unavailable or too heavy. Covers aapt2 + javac + d8 + zipalign + apksigner workflow with JDK 21 compatibility fixes.
version: 1.0.0
tags: [android, apk, build, cli, aapt2, d8, javac, headless]
---

# Android APK CLI Build (No Gradle)

## When to Use
- Headless Linux server without Gradle or Android Studio
- Simple APKs with few Java source files
- WebView-based apps (HTML/CSS/JS bundled in assets/)
- Quick rebuilds of existing Cordova/WebView APKs

## Prerequisites
- JDK 11+ (JDK 21 verified)
- Android SDK (cmdline-tools)
- Build tools (both 34.0.0 and 35.0.0 recommended)

## Build Script Pattern

```bash
#!/bin/bash
set -e

SDK=/opt/android-sdk
BUILD_TOOLS=$SDK/build-tools/35.0.0   # d8/apksigner (JDK 21 compatible)
AAPT2=$SDK/build-tools/34.0.0/aapt2    # generates traditional XML (NOT proto)
PLATFORM=$SDK/platforms/android-34

# 1. Compile resources
$AAPT2 compile --dir app/src/main/res -o build/compiled-resources.zip

# 2. Link (NO --proto-format! Traditional XML only)
$AAPT2 link -I $PLATFORM/android.jar \
  --manifest app/src/main/AndroidManifest.xml \
  --java build/ -o build/apk/base.apk \
  build/compiled-resources.zip

# 3. Compile Java (--release 11 for JDK 21 compatibility with d8)
javac --release 11 -cp $PLATFORM/android.jar \
  -d build/classes \
  build/com/example/app/R.java \
  app/src/main/java/com/example/app/*.java

# 4. DEX (MUST use build-tools 35 for JDK 21 compiled classes)
$BUILD_TOOLS/d8 --lib $PLATFORM/android.jar \
  --output build/dex build/classes/com/example/app/*.class

# 5. Package
unzip -qo build/apk/base.apk -d build/apk_unpacked
cp build/dex/classes.dex build/apk_unpacked/
cp -r app/src/main/assets build/apk_unpacked/
cd build/apk_unpacked && zip -qr ../unsigned.apk . && cd -

# 6. Align
$BUILD_TOOLS/zipalign -f 4 build/unsigned.apk build/aligned.apk

# 7. Sign (--min-sdk-version required for proto-format APKs)
$BUILD_TOOLS/apksigner sign --ks debug.keystore \
  --ks-pass pass:android --key-pass pass:android \
  --min-sdk-version 26 --out build/App.apk build/aligned.apk
```

## Critical Compatibility Matrix

| Component | Build-tools 34 | Build-tools 35 |
|-----------|:-------------:|:-------------:|
| aapt2     | ✅ Use this  | ❌ Proto-format manifest breaks phones |
| d8 (JDK 21) | ❌ Crashes  | ✅ Use this |
| apksigner | ✅ OK       | ✅ OK (needs --min-sdk-version) |
| zipalign  | ✅ OK       | ✅ OK |

**Rule**: aapt2 from 34, everything else from 35.

## WebView shouldInterceptRequest Pattern

For injecting headers (like Referer) that browsers block but native code can set:

```java
webView.setWebViewClient(new WebViewClient() {
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        if (url.contains("api.fund.eastmoney.com")) {
            try {
                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setRequestProperty("Referer", "https://fundf10.eastmoney.com/");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.connect();
                return new WebResourceResponse("application/json", "UTF-8", conn.getInputStream());
            } catch (Exception e) { e.printStackTrace(); }
        }
        return super.shouldInterceptRequest(view, request);
    }
});
```

No external HTTP library needed — HttpURLConnection is in android.jar.

## Common Pitfalls

1. **Proto-format manifest**: build-tools 35's aapt2 defaults to proto. Phones can't parse it → "App not installed" or "Package corrupt". Fix: use build-tools 34 aapt2, or remove `--proto-format` flag.
2. **JDK 21 + d8 crash**: d8 8.2.2 (in build-tools 34) crashes on JDK 21 classes with NPE. Fix: use build-tools 35 d8.
3. **HTML escaping in patches**: Never use patch tool for JS strings with backslash escapes. Always rebuild from known-working base.
4. **JS validation**: Run `node --check` on extracted JS before packaging.
5. **WeChat blocks .apk files**: Always zip with password `123456`.

## Verification
```bash
# Check JS syntax
python3 -c "import re,subprocess; ..." 

# Check APK manifest format
unzip -p build/App.apk AndroidManifest.xml | head -c 100
# Traditional: starts with binary XML header
# Proto: much smaller, starts differently

# Install test
adb install build/App.apk
```
