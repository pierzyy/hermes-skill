---
name: android-webview-import-export
description: Pattern for adding import/export + file sharing to Android WebView apps — CSV format, FileProvider, WeChat integration, page-load timing fix
category: software-development
tags: [android, webview, csv, import, export, fileprovider, wechat]
---

# Android WebView Import/Export Pattern

Reusable pattern for adding data import/export and file sharing to any Android WebView app. Based on FundMonitor implementation with multiple iterations and fixes.

## File Format: CSV (NOT TOML/JSON/txt)

**Always use CSV.** TOML fails on mobile — no native editor supports it. CSV opens in Excel/WPS/Numbers/any text editor on both mobile and PC.

```csv
# FundMonitor Data Export
# 2026-05-19 20:45
组合,Emoji,代码,名称,持有金额,持仓成本
全天候组合,🌐,000218,国泰黄金ETF联接A,3750.98,3750.98
海外全球,🌍,006282,摩根欧洲动力策略股票(QDII)A,5241.21,5241.21
```

Key CSV generation rules:
- Comment lines start with `#`
- First CSV row is a header line
- Special characters: quote fields containing `,` or `"` with double-quote escaping
- Use `.toFixed(2)` for amounts to avoid floating-point noise

## Android Side

### AndroidManifest.xml — Intent Filters

```xml
<!-- Receive files from WeChat -->
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/csv" />
</intent-filter>
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="application/octet-stream" />
</intent-filter>
```

### FileProvider — For Sharing Files (not text)

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_paths" />
</provider>
```

`res/xml/file_paths.xml`:
```xml
<paths>
    <external-path name="downloads" path="Download/" />
</paths>
```

### MainActivity — Handling Incoming Files

**CRITICAL:** WeChat shares files via `Intent.EXTRA_STREAM` (URI), not `Intent.EXTRA_TEXT`. Must handle BOTH:

```kotlin
val sharedText: String? = when {
    Intent.ACTION_SEND == intent.action -> {
        val streamUri: Uri? = intent.getParcelableExtra(Intent.EXTRA_STREAM)
        if (streamUri != null) {
            readTextFromUri(streamUri)
        } else {
            intent.getStringExtra(Intent.EXTRA_TEXT)
        }
    }
    else -> null
}

private fun readTextFromUri(uri: Uri): String? {
    return try {
        contentResolver.openInputStream(uri)?.bufferedReader()?.readText()
    } catch (e: Exception) { null }
}
```

### WebView Timing — The Page-Load Bug

**NEVER call `evaluateJavascript` before `loadUrl` completes.** The JS function doesn't exist yet.

**WRONG:**
```kotlin
val bridge = AndroidBridge(context, this)
bridge.setSharedText(sharedText)  // calls evaluateJavascript — FAILS
loadUrl("file:///android_asset/index.html")
```

**RIGHT — use `onPageFinished`:**
```kotlin
val bridge = AndroidBridge(context, this)
bridge.setSharedText(sharedText)  // just stores, no evaluateJavascript

webViewClient = object : WebViewClient() {
    override fun onPageFinished(view: WebView?, url: String?) {
        super.onPageFinished(view, url)
        if (sharedText != null) {
            view?.evaluateJavascript(
                "if(typeof onSharedTextReceived==='function') onSharedTextReceived()", null)
        }
    }
    // ... shouldInterceptRequest ...
}
loadUrl("file:///android_asset/index.html")
```

### AndroidBridge — JS Interface

```kotlin
class AndroidBridge(private val activity: Activity, private val webView: WebView) {
    private var pendingSharedText: String? = null

    @JavascriptInterface
    fun exportFile(json: String) { /* save to Downloads */ }

    @JavascriptInterface
    fun shareFile(json: String) {
        // Save file → get content URI via FileProvider → ACTION_SEND with EXTRA_STREAM
        val uri = FileProvider.getUriForFile(activity, "$package.fileprovider", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/octet-stream"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(Intent.createChooser(intent, "分享文件"))
    }

    @JavascriptInterface
    fun getSharedText(): String = pendingSharedText ?: ""

    @JavascriptInterface
    fun clearSharedText() { pendingSharedText = null }

    fun setSharedText(text: String) { pendingSharedText = text }
    // NO evaluateJavascript call here — handled by onPageFinished
}
```

## JS Side

### CSV Export

```javascript
function buildExportCSV() {
  var rows = [['组合','Emoji','代码','名称','持有金额','持仓成本']];
  portfolioKeys.forEach(function(k) {
    d.holdings.forEach(function(h) {
      rows.push([d.name, d.emoji, h[0], h[1], h[2].toFixed(2), h[3].toFixed(2)]);
    });
  });
  return rows.map(function(r) {
    return r.map(function(cell) {
      var s = String(cell);
      return s.indexOf(',')!==-1 || s.indexOf('"')!==-1
        ? '"' + s.replace(/"/g,'""') + '"' : s;
    }).join(',');
  }).join('\n');
}
```

### CSV Parser (with quoted field support)

```javascript
function parseCSV(text) {
  var portfolios = [], map = {}, order = [];
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('组合,')) continue; // skip header
    var cells = parseCSVLine(line);
    if (cells.length < 5) continue;
    var pfName = cells[0], emoji = cells[1]||'💰';
    var code = cells[2], name = cells[3];
    var amt = parseFloat(cells[4]) || 0;
    var cost = cells.length >= 6 ? (parseFloat(cells[5]) || amt) : amt;
    if (!map[pfName]) { map[pfName] = { emoji: emoji, holdings: [] }; order.push(pfName); }
    map[pfName].holdings.push([code, name, amt, cost]);
  }
  for (var j = 0; j < order.length; j++) {
    var n = order[j];
    portfolios.push({ name: n, emoji: map[n].emoji, holdings: map[n].holdings });
  }
  return portfolios;
}

function parseCSVLine(line) {
  var cells = [], current = '', inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (i+1 < line.length && line[i+1] === '"') { current += '"'; i++; }
        else { inQuotes = false; }
      } else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { cells.push(current); current = ''; }
      else { current += c; }
    }
  }
  cells.push(current);
  return cells;
}
```

### Import with Merge/Replace

```javascript
function doImport(mode) {
  if (mode === 'replace') { portfolioData = {}; portfolioKeys = []; }

  portfolios.forEach(function(p) {
    // Find existing portfolio by name
    var existingKey = null;
    for (var i = 0; i < portfolioKeys.length; i++) {
      if (portfolioData[portfolioKeys[i]].name === p.name) { existingKey = portfolioKeys[i]; break; }
    }

    if (existingKey && mode === 'merge') {
      // Update existing funds by code, add new ones
      p.holdings.forEach(function(newH) {
        var idx = existing.holdings.findIndex(function(h){return h[0]===newH[0]});
        if (idx >= 0) {
          existing.holdings[idx][2] = newH[2]; // update amount
          existing.holdings[idx][3] = newH[3]; // update cost
        } else {
          existing.holdings.push([newH[0], newH[1], newH[2], newH[3], '', 0, '', 0]);
        }
      });
    } else {
      // New portfolio
      var key = 'import_' + Date.now().toString(36);
      portfolioData[key] = { emoji: p.emoji, name: p.name,
        holdings: p.holdings.map(function(h) { return [h[0], h[1], h[2], h[3], '', 0, '', 0]; }) };
      portfolioKeys.push(key);
    }
  });
  savePortfolios(portfolioData);
}
```

### User Feedback During Import

Always show toast messages so user knows what's happening:
- "检测到导入数据，正在解析..."
- "解析成功: N 个组合, M 只基金"
- Then show confirm modal with replace/merge choice

## Pitfalls

1. **TOML is a trap** — not editable on mobile. Always use CSV.
2. **`evaluateJavascript` before page load** — silently fails. Always use `onPageFinished`.
3. **WeChat shares files via URI** — need `Intent.EXTRA_STREAM` handling, not just `EXTRA_TEXT`.
4. **CSV in Excel needs BOM** — add `\uFEFF` prefix for UTF-8 detection on Windows.
5. **Intent filter must match mimeType** — WeChat may use `text/plain`, `application/octet-stream`, or `text/csv`. Register all three.
6. **FileProvider must be declared in manifest** — `FileProvider.getUriForFile()` fails silently without it.
