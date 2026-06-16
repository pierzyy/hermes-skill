# APK Build Checklist — CRITICAL

Every FundMonitor APK build MUST follow these steps. Missing any step sends old code to the user.

## Mandatory Steps

```bash
cd /opt/data/FundMonitor-claude
ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew assembleDebug

# ⚠️ STEP 1: Copy — the build output is NOT automatically at /opt/data/FundMonitor.apk
cp app/build/outputs/apk/debug/app-debug.apk /opt/data/FundMonitor.apk

# ⚠️ STEP 2: Verify — unzip and grep for key changes to ensure the APK contains NEW code
cd /tmp && rm -rf assets && unzip -o /opt/data/FundMonitor.apk assets/index.html
grep -c "EXPECTED_STRING" assets/index.html
```

## Pitfalls

1. **APK path**: Build output is at `app/build/outputs/apk/debug/app-debug.apk`, NOT `/opt/data/FundMonitor.apk`. Must explicitly `cp`.
2. **versionCode**: Always bump in `app/build.gradle.kts` before build. Android silently refuses to install same `versionCode` — no error, just keeps old version.
3. **WeChat delivery**: APK must be sent as a **single `MEDIA:/opt/data/FundMonitor.apk` line** with no surrounding text. WeChat drops inline media in long messages.
4. **Verify with unzip**: Always grep for key changes inside the APK's `assets/index.html` to confirm the build included the new code.

## CSS Transparent Box Trap

When an element has `display:inline-block; padding:X; border-radius:X` but **NO background color**, the transparent padding area shows the parent element's background — creating a visual "outer box" effect. Always ensure box-model properties and background go on the SAME CSS class.

## Source Detail Navigation

- `formatSourceDetail(detail)` — parses `净值1.2345 (2026-05-19)` into colored badges
- All confirmed-fund paths set `source_detail` with "净值" prefix + NAV + optional date
- `navDateMap` is persisted to `fm_nav_dates` localStorage key alongside `prevNavs`
- Regex uses `\s*` between label and value: `/(净值|估值|万份)\s*([\d.]+)/`
