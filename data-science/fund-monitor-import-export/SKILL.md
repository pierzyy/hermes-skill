---
name: fund-monitor-import-export
description: Add/update import/export for FundMonitor — CSV format (手机/PC 可编辑), FileProvider 分享文件, WeChat 导入 via EXTRA_STREAM
tags: [fund-monitor, import, export, csv, fileprovider, android, webview, intent]
---

# FundMonitor 导入导出

## 数据格式：CSV（不是 TOML）— v3.8-0521a+ 扩展为 10 列

选择 CSV 的原因：手机端 WPS/Excel、PC 端 Excel/VSCode/记事本都能直接编辑。TOML 虽然结构好但手机端无原生支持。

```csv
# FundMonitor Data Export
# 2026-05-21 13:00
组合,Emoji,代码,名称,持有金额,持仓成本,确认日期,确认涨跌幅,净值日期,手动编辑
全天候组合,🌐,000218,国泰黄金ETF联接A,3800.50,3700.00,2026-05-21,1.23,2026-05-21,0
```

### 新增 4 列（h[4]~h[7]）语义

| 列 | 字段 | 说明 |
|---|---|---|
| 7 | h[4] 确认日期 | 上次确认的交易日期，空=未确认 |
| 8 | h[5] 确认涨跌幅 | 确认当日的日涨跌幅百分比 |
| 9 | h[6] 净值日期 | 净值发布日期 |
| 10 | h[7] 手动编辑标志 | 0=允许自动滚动, 1=已确认后手动编辑锁定 |

### 向后兼容

旧 6 列 CSV 仍可正常导入——解析器按 `cells.length` 判断，缺列时默认填 `''/0/''/0`：
```javascript
var cfmDate = cells.length >= 7 ? (cells[6] || '') : '';
var cfmChgPct = cells.length >= 8 ? (parseFloat(cells[7]) || 0) : 0;
var navDate = cells.length >= 9 ? (cells[8] || '') : '';
var editFlag = cells.length >= 10 ? (parseInt(cells[9]) || 0) : 0;
```

## CSV 生成 / 导入要点

- 金额保留两位小数 `.toFixed(2)`
- 含逗号/引号的字段用双引号包裹，内部 `"` → `""`
- Android 侧不加 BOM，浏览器调试加 `\uFEFF` 兼容 Excel
- 导入时 `doImport` 的 merge/new 两个分支都需保留 `h[4]~h[7]`：`newH[4]||''` 等
- 模拟导入函数 `simulateDoImport` 在测试文件中需同步 mirror

## Android 侧文件分享

### FileProvider 配置

**AndroidManifest.xml**:
```xml
<provider android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.fileprovider"
    android:exported="false" android:grantUriPermissions="true">
    <meta-data android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/file_paths" />
</provider>
```

**res/xml/file_paths.xml**:
```xml
<paths><external-path name="downloads" path="Download/" /></paths>
```

### AndroidBridge.kt

```kotlin
@JavascriptInterface fun shareFile(json: String) {
    val file = saveToFile(filename, content)
    val uri = FileProvider.getUriForFile(activity, "${packageName}.fileprovider", file)
    Intent(ACTION_SEND).apply {
        type = "application/octet-stream"
        putExtra(EXTRA_STREAM, uri)
        addFlags(FLAG_GRANT_READ_URI_PERMISSION)
    }
}
```

## Android 侧接收微信文件

### MainActivity.kt — 同时处理 EXTRA_TEXT 和 EXTRA_STREAM

微信分享**文本**走 `EXTRA_TEXT`，分享**文件**走 `EXTRA_STREAM`（content URI），必须两个都处理：

```kotlin
val sharedText: String? = when {
    ACTION_SEND == intent.action -> {
        val streamUri: Uri? = intent.getParcelableExtra(EXTRA_STREAM)
        if (streamUri != null) readTextFromUri(streamUri)
        else intent.getStringExtra(EXTRA_TEXT)
    }
    else -> null
}

private fun readTextFromUri(uri: Uri): String? {
    return contentResolver.openInputStream(uri)?.bufferedReader()?.readText()
}
```

### Intent Filter

需要覆盖多种 MIME 类型（微信可能把 .csv 发成 `text/plain`、`text/csv` 或 `application/octet-stream`）：
```xml
<intent-filter> ... <data android:mimeType="text/plain" /> </intent-filter>
<intent-filter> ... <data android:mimeType="text/csv" /> </intent-filter>
<intent-filter> ... <data android:mimeType="text/*" /> </intent-filter>
<intent-filter> ... <data android:mimeType="application/octet-stream" /> </intent-filter>
```

## JS 侧：CSV 解析器

```javascript
function parseCSV(text) {
  // 跳过 # 注释行和 "组合," 表头行
  // 按"组合"列分组 → {name, emoji, holdings: [[code,name,amt,cost],...]}
  // parseCSVLine() 处理引号内逗号和 "" 转义
}
```

导入尝试顺序：CSV → TOML（兼容旧导出）→ `$PORTFOLIO$` 格式（兼容最早版本）

### 导入模式
- **替换**: 清空全部现有数据
- **覆盖**: 同名组合 → 同代码基金更新金额/成本，新基金追加；新组合 → 创建

## 数据流总结

```
导出: index.html → AndroidBridge.shareFile(json) → FileProvider → ACTION_SEND → 微信
导入: 微信 → ACTION_SEND → MainActivity (EXTRA_STREAM→readTextFromUri) → WebView → parseCSV()
```

## Pitfalls

- **CSV 是正确选择**：不要用 TOML/JSON/YAML，手机端无法编辑
- **EXTRA_STREAM 不是 EXTRA_TEXT**：微信分享文件走 stream，必须用 ContentResolver 读 URI
- **测试 mock 日期**：用 `getDelayThreshold(today, delay)` 而非硬编码日期
- **git worktree**：所有编辑在 dev worktree，commit → merge master → master 构建
- **h[4]-h[7] 必须贯穿导出→导入全链路**：导出加列 → parseCSV 解析 → doImport merge/new 保留 → simulateDoImport 测试 mirror。缺任何一环都会导致导入后确认状态丢失
- **h[7] 条件赋值**：用户编辑持有金额时，仅当基金已确认才设 h[7]=1（锁定），未确认时保持 0（允许后续滚动覆盖）——见 editFundById 改动
- **测试文件 mirror**：修改 parseCSV/simulateDoImport 后，必须同步更新 `test_fund_monitor.js` 中的同名函数
