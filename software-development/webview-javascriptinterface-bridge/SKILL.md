---
name: webview-javascriptinterface-bridge
description: When WebView shouldInterceptRequest fails to reliably add headers to JS fetch/XHR, use @JavascriptInterface OkHttp bridge to bypass WebView networking entirely.
tags: [android, webview, javascript-interface, okhttp, networking, cors, referer]
---

# WebView @JavascriptInterface OkHttp Bridge

## Problem

When `shouldInterceptRequest` + OkHttp reliably intercepts and adds custom headers (Referer, etc.) for some API calls but mysteriously fails for others in WebView — symptoms:
- API works perfectly from server-side Python test
- JS `fetch()` and XHR both return null in WebView
- Some URLs work, others on the same host don't
- Root cause: WebView internal network stack quirks on certain Android versions

The definitive fix: `@JavascriptInterface` bridge. JS calls Kotlin/Java directly, OkHttp makes the request natively, result returned as string. **Completely bypasses WebView's network layer.**

## Pattern

### Kotlin side

```kotlin
import android.webkit.JavascriptInterface

class ApiBridge {
    @JavascriptInterface
    fun fetch(url: String): String {
        return try {
            val req = Request.Builder().url(url)
                .addHeader("Referer", "https://example.com/")  // custom headers here
                .addHeader("User-Agent", "Mozilla/5.0").build()
            val resp = okClient.newCall(req).execute()
            resp.body?.string() ?: ""
        } catch (_: Exception) { "" }
    }
}

// In WebView setup:
webView.addJavascriptInterface(ApiBridge(), "ApiBridge")
```

### JavaScript side

```javascript
async function fetchWithBridge(url) {
  // Path 0: native OkHttp bridge — zero WebView networking involved
  try {
    if (typeof ApiBridge !== 'undefined' && ApiBridge.fetch) {
      const text = ApiBridge.fetch(url);
      if (text) return text;
    }
  } catch(e) {}
  
  // Path 1: fetch() fallback (WebView shouldInterceptRequest)
  // Path 2: XHR fallback
  ...
}
```

## Caveats

1. **Synchronous**: `@JavascriptInterface` blocks the JS thread. Only suitable for small responses (few KB). For large payloads, use `evaluateJavascript()` callback.
2. **String-only**: Return type must be String. Parse JSON on JS side.
3. **Thread safety**: OkHttp calls run on WebView's internal thread, not main thread — safe.
4. **Error handling**: Return empty string on failure, let JS decide fallback.

## Real-world example: FundMonitor f10 API

7 QDII funds' f10 API calls failed in WebView while others succeeded. API worked from Python. XHR fallback didn't help. Root cause: WebView network stack inconsistency.

Fix: `F10Bridge` with `@JavascriptInterface` added as Path 0 in `fetchF10Nav()`. Post-fix: all 7 funds confirmed correctly.
