---
name: fundmonitor-f10-confirm-diagnostic
description: Diagnose why QDII funds aren't confirmed in FundMonitor — F10Bridge @JavascriptInterface for bypassing WebView networking, and diagnostic injection pattern for JS decision trees.
tags: [fundmonitor, qdii, webview, javascriptinterface, debugging, f10, confirmation]
---

# FundMonitor QDII F10 Confirmation Diagnostic

Two reusable patterns developed while debugging 7 QDII funds showing "ETF实时估值" instead of "东方财富" confirmed.

## Pattern 1: F10Bridge — Bypass WebView Networking

When `shouldInterceptRequest` + OkHttp Referer injection fails for specific funds (fetch/XHR both fail but API works from Python), the root cause is at the WebView CORS/fetch layer. Solution: `@JavascriptInterface` bridge.

### Kotlin (MainActivity.kt)

```kotlin
import android.webkit.JavascriptInterface
import okhttp3.Request

class F10Bridge {
    @JavascriptInterface
    fun fetch(code: String): String {
        return try {
            val url = "https://api.fund.eastmoney.com/f10/lsjz?fundCode=$code&pageIndex=1&pageSize=1&callback=jQuery341"
            val req = Request.Builder().url(url)
                .addHeader("Referer", "https://fundf10.eastmoney.com/")
                .addHeader("User-Agent", "Mozilla/5.0").build()
            val resp = okClient.newCall(req).execute()
            resp.body?.string() ?: ""
        } catch (_: Exception) { "" }
    }
}

// In WebView.apply { ... }
addJavascriptInterface(F10Bridge(), "F10Bridge")
```

### JS (index.html)

```javascript
async function fetchF10Nav(code) {
  // Path 0: Native OkHttp bridge (bypasses WebView entirely)
  if (typeof F10Bridge !== 'undefined' && F10Bridge.fetch) {
    const text = F10Bridge.fetch(code);
    const result = parseF10Response(text);
    if (result) return result;
  }
  // Path 1: fetch() with shouldInterceptRequest
  // Path 2: XHR fallback
}
```

**Caveat**: `F10Bridge.fetch()` is synchronous from JS — blocks JS thread. For 7+ funds adds noticeable delay.

## Pattern 2: Diagnostic Injection

When a complex JS decision tree produces wrong results, inject diagnostic markers into UI fields (user can't see `console.log` on mobile).

### Implementation

```javascript
var _confirmDiag = '';  // closure variable

function applyF10Confirmation(f10data) {
    if (!f10data || !f10data.dwjz) { _confirmDiag = 'no_f10'; return false; }
    if (isMarketHours()) { _confirmDiag = 'market_hours'; return false; }
    // ... at each failure point:
    // _confirmDiag = 'nav_unchanged prev='+prevDwjz+' f10='+f10data.dwjz;
    // _confirmDiag = 'JZZZL_null_or_0 chg_pct='+f10data.chg_pct;
    // _confirmDiag = 'time<15:00 nowMins='+nowMins;
}
```

### Surface in UI

```javascript
r.source_detail = normalSourceDetail + (_confirmDiag ? ' [DIAG:'+_confirmDiag+']' : '');
```

### Diagnostic Codes

| Code | Meaning |
|------|---------|
| `no_f10` | f10 data missing or no dwjz |
| `market_hours` | In trading hours (skip confirmation) |
| `JZZZL_null_or_0 chg_pct=X` | JZZZL is null or 0 |
| `time<15:00 nowMins=N` | Before 15:00 cutoff |
| `nav_unchanged prev=X f10=Y` | Previous and current NAV identical |

## applyF10Confirmation Logic for QDII

Two branches, based on whether prevDwjz exists:

### Branch A: `!prevDwjz` (first load)
1. Must be QDII (`QDII_NO_FUNDGZ` / `FUND_ETF_MAP` / `isQdiiByName`)
2. `f10.chg_pct != null && !== 0` (JZZZL valid)
3. `nowMins >= 900` (after 15:00)
→ All three true → confirm

### Branch B: `prevDwjz` exists (has history)
1. Must be QDII
2. `parseFloat(f10.dwjz) !== parseFloat(prevDwjz)` (NAV changed)
→ Both true → confirm

If `prevDwjz` equals `f10.dwjz`, Branch B returns false. The ETF closingCache path is then used (source="ETF.xxx", not confirmed). This is expected when NAV hasn't changed, but can mask the root cause when prevNavs is polluted.

## Common Pitfalls

1. **prevNavs never populated**: The `savePrevNav` function referenced in comments (line 2223: "通过 savePrevNav 更新") **does not exist**. `prevNavs[code]` is never assigned during runtime — it's only loaded from `localStorage.fundMonitorPrevNavs` and persisted. Result: `prevDwjz` is always null/undefined for `processFund`, so `applyF10Confirmation` always takes the "no prevDwjz" path (line 857). This means Branch B (NAV-changed check, line 838-856) never fires.

2. **closingCache interception (← QDII not confirmed root cause)**: For QDII funds WITH fundgz data, `saveClosingEstimate` (line 824) saves fundgz to `closingCache`. In non-trading hours, `closingCache[code]` (line 1022-1024) intercepts BEFORE the f10 fallback (line 1049-1073). The fund shows fundgz estimate but is NOT confirmed. QDII-FOF funds bypass this because `applyF10Confirmation`'s FOF path (line 864) confirms them first. QDII without fundgz have no closingCache entry, so they reach the f10 fallback normally.

3. **Fix pattern for closingCache interception**: Add a QDII f10 secondary confirmation block BEFORE the closingCache check, mirroring the existing non-QDII block. See `app/src/main/assets/index.html` line 1000 for the implemented fix pattern.

4. **Non-market hours ordering**: `saveClosingEstimate` (line 824) runs BEFORE the priority decision (line 937+). ETF/fundgz data is already in `closingCache` when confirmation is attempted. If confirmation fails, the cache is immediately used, preventing the f10 fallback (line 1049-1073) from executing.
