---
name: fundmonitor-source-detail-debug
description: Diagnose FundMonitor source_detail display bugs — confirmed funds showing "东方财富"+date without NAV. Covers navDateMap persistence, type coercion from JSON.parse, defensive validation, and the todayConfirmed fast-path vs f10-confirmation path distinction.
tags: [fundmonitor, debug, source-detail, navdatemap, localStorage, json-parse, type-coercion]
---

# FundMonitor source_detail 显示 bug 诊断

## 症状
已确认基金的数据源列显示 `[东方财富] [日期]`，但缺少净值 badge (`[净值X.XXXX]`)，且日期可能不是正确的净值日期。

## 已确认基金的数据流

两条已确认路径：
1. **`todayConfirmed` 快速路径** (line ~725)：先于 API 调用，直接返回——使用 `prevNavs[code]` + `navDateMap[code]` 构造 source_detail
2. **f10 确认路径** (line ~855-873, ~994-1017)：通过 f10 API 获取净值后确认——source_detail 由 `f10.dwjz` + `f10.jzrq` 构造

第一次刷新（`todayConfirmed` 为空）：走 f10 确认路径 ✅  
第二次刷新（`todayConfirmed` 已填充）：走快速路径 → **这里容易出 bug**

## 根因分析

### 1. JSON.parse 类型转换
`JSON.stringify(prevNavs)` 保存时，数值被写成数字而非字符串。`JSON.parse` 恢复时，`prevNavs[code]` 变成 **number 类型**（如 `1.051` 而非 `"1.0510"`）。

```javascript
// 错误：number 拼接字符串可能丢失精度
'净值' + 1.051  // "净值1.051"（末尾0丢失）
```

### 2. "null"/"undefined" 字符串
某些边界条件下 `prevNavs[code]` 可能是字符串 `"null"` 或 `"undefined"`，它们是 **truthy**，导致 source_detail 生产 `"净值null (2026-05-19)"`，`formatSourceDetail` 的 `[\d.]+` 正则匹配不到数字 → NAV badge 不生成。

### 3. navDateMap 为空时仍添加日期括号
如果 `navDateMap[code]` 为空但 `prevNavs[code]` 存在，source_detail 变成 `"净值1.2345 ()"`——空括号看起来像格式错误。

### 4. CLEANUP_VERSION 清空后恢复
`CLEANUP_VERSION` 升级时清空 `prevNavs`、`h[6]`、`todayConfirmed`。第一次刷新走 f10 确认（正确），但 `navDateMap` 仅存内存——重启后丢失。必须持久化到 localStorage（`fm_nav_dates`），并在 `loadPrevNavs()` 中恢复。

## 修复方案

### 防御性 source_detail 构造
```javascript
var navVal = prevNavs[code];
if (navVal && typeof navVal !== 'string') navVal = String(navVal);
var navDate = navDateMap[code];
if (navDate && typeof navDate !== 'string') navDate = String(navDate);
if (navVal && navVal !== 'null' && navVal !== 'undefined' && parseFloat(navVal) > 0) {
  r.source_detail = '净值' + navVal + (navDate ? ' (' + navDate + ')' : '');
} else {
  r.source_detail = '';
}
```

关键点：
- `typeof` 检查确保 string 类型
- 显式排除 `"null"` / `"undefined"` 字符串
- `parseFloat(navVal) > 0` 确保是正数
- navDate 可选——没有时不添加括号

### navDateMap 持久化
在 `savePortfolios()` 和 `doRefresh` 结尾分别保存：
```javascript
try { localStorage.setItem('fm_nav_dates', JSON.stringify(navDateMap)); } catch(e) {}
```

在 `loadPrevNavs()` 中恢复：
```javascript
try {
  const raw = localStorage.getItem('fm_nav_dates');
  if (raw) { Object.assign(navDateMap, JSON.parse(raw)); }
} catch(e) {}
```

### formatSourceDetail 正则加固
```javascript
// 允许标签与数值间有可选空格
var valMatch = detail.match(/(净值|估值|万份)\s*([\d.]+)/);
```

## 验证方法
```bash
# 在 APK 中验证修复
unzip -o FundMonitor.apk assets/index.html
grep "parseFloat(nv) > 0" assets/index.html  # 防御性检查
grep "fm_nav_dates" assets/index.html         # 持久化（应有4处）
grep -c "净值' + f10" assets/index.html      # 空格bug（应为0）
```

## 相关文件
- `/opt/data/FundMonitor-claude/app/src/main/assets/index.html` — 主逻辑
- `/opt/data/scripts/test_fund_monitor.js` — 回归测试