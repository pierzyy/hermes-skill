---
name: fix-playwright-browser
description: Fix Playwright/Chromium browser when it fails with missing shared libraries (libnspr4.so, libnss3.so, etc.) on Debian-based Hermes deployments. Covers diagnosis and one-shot install.
category: devops
tags: [browser, playwright, chromium, dependencies, fix]
---

# Fix Playwright Browser Dependencies

When `browser_navigate` or any browser tool fails with `Target page, context or browser has been closed`, check the error log for the root cause. The most common culprit: missing shared libraries.

## Diagnosis

```bash
# 1. Check the error log for "error while loading shared libraries"
# 2. Find ALL missing libraries with ldd:
ldd /opt/hermes/.playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>&1 | grep "not found"
```

Typical missing libs on minimal Debian containers:
- `libnspr4.so` → package `libnspr4`
- `libnss3.so` → package `libnss3`
- `libnssutil3.so` → comes with `libnss3`
- `libatk-1.0.so.0` → package `libatk1.0-0t64` (Debian 13 trixie: `t64` suffix!)
- `libatk-bridge-2.0.so.0` → package `libatk-bridge2.0-0t64`
- `libXcomposite.so.1` → package `libxcomposite1`
- `libXdamage.so.1` → package `libxdamage1`
- `libatspi.so.0` → package `libatspi2.0-0t64`

## Fix

```bash
# IMPORTANT: apt-get update first — the package cache may be stale
apt-get update -qq && apt-get install -y \
    libnspr4 libnss3 \
    libatk1.0-0t64 libatk-bridge2.0-0t64 \
    libxcomposite1 libxdamage1 libatspi2.0-0t64
```

## Pitfalls

1. **`apt-cache search nspr` returns nothing before `apt-get update`** — the package cache was empty/stale. Always `apt-get update` first.
2. **Debian 13 (trixie) uses `t64` suffix** — `libatk1.0-0` is now `libatk1.0-0t64`. Adjust package names for your distro version.
3. **`sysctl: permission denied` warnings during install are harmless** — just kernel settings that don't affect the library install.
4. **Don't try `pip install playwright install-deps`** — it requires a full Node.js/Playwright setup. The direct `apt` approach is faster and sufficient.
5. **Browser will NOT work after install if the server can't reach external sites** — use `curl -sI --max-time 5 https://www.baidu.com` to verify basic network connectivity first.

## Verify

```bash
# Should show no "not found" lines
ldd /opt/hermes/.playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>&1 | grep "not found"
# Should return empty (no missing libs)
```

Then test: `browser_navigate` to a simple site like `https://www.baidu.com`.

## Chinese Fonts for Screenshots

If browser screenshots show garbled Chinese text (□□□ or tofu), install CJK fonts:

```bash
apt-get install -y fonts-noto-cjk fonts-wqy-microhei fonts-wqy-zenhei
```

HTML should specify font fallback: `font-family: 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', 'PingFang SC', sans-serif`.
