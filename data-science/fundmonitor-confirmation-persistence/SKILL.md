---
name: fundmonitor-confirmation-persistence
description: FundMonitor 已确认状态接力完整修复——确认持久化、持有金额滚动策略(h[7]冗余分析)、CSV导入导出状态保留、h[4]跨周末匹配、f10兜底、CLEANUP时序、QDII非交易时段确认。
version: 5.0.0
tags: [fundmonitor, confirmation, persistence, morning-gap, debug, f10-fallback, cleanup-timing, runtime-state, qdii, apk-recovery, webview-fetch-referer, cors, cleanup-version-trap, nav-delay, threshold, prevNavs-race, isMarketHours-guard, holding-amount-roll, h7-redundant, csv-import-export, delay-plus-one-fix, h6-vs-h4, jzzl-recovery-guard, hk-fundgz-stale, webview-file-cache, h5-not-reset-after-roll, confirmedChgPct-stale, self-loop-closed-loop, double-gain-bug, cleanup-lastRolledDate-vulnerability]
---

# FundMonitor 确认状态持久化与交易日接力

## 问题

1. **早上 8 点后**：国内基金已确认状态消失，变成缓存数据
2. **收盘后**：基金用昨天的已确认数据显示
3. **QDII 基金**：非交易时段显示「QDII待更新」，永不确认
4. **非交易时段**：已确认基金走全流程 processFund → 被 closingCache 覆盖（v3.8-0520a）

## 四处根因

### Bug 1: loadPortfolios h[4] 跨周末不匹配（早上丢失）

**位置**: `loadPortfolios()` 中的 `h[4] === today`

`getTradingDate()` 在 9:30 前返回上一交易日，跨周末时跳过非交易日：

```
周四晚确认 → h[4] = "2026-05-14"（周四）
周一早 8:00 → getTradingDate() = "2026-05-15"（周五，退一天+跳过周末）
"2026-05-14" !== "2026-05-15" → 匹配失败 → todayConfirmed 没恢复 ❌
```

**修复**: 9:30 前对任何有 h[4] 的基金恢复确认

```javascript
const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
if (h[4] === today) {
    todayConfirmed.add(h[0]); confirmedChgPct[h[0]] = h[5]||0;
} else if (nowMins < 570 && h[4] && h[4].length === 10 && h[5] !== undefined) {
    todayConfirmed.add(h[0]); confirmedChgPct[h[0]] = h[5]||0;
}
```

### Bug 2: f10 兜底条件 C 未检查日期（收盘后误确）

**位置**: `processFund` 非交易时段 f10 兜底

**修复**: 加 jzrq 检查：
```javascript
} else if (!prevDwjz && f10.chg_pct != null && f10.chg_pct !== 0 
           && f10.jzrq >= new Date().toISOString().slice(0,10)) {
```

### Bug 3: CLEANUP 时序问题 — loadPortfolios 先于 CLEANUP

CLEANUP 清除 localStorage 时，`todayConfirmed` 已从旧 `h[4]` 恢复。需同步清除运行时状态：

```javascript
todayConfirmed.clear();
for (var k in confirmedChgPct) delete confirmedChgPct[k];
```

### Bug 4: 确认阈值一刀切导致误用旧净值确认（v3.7-0518a 修复）

**症状**: 收盘后大多数基金立即用「前几天」的净值确认（如周一 15:05 用上周五净值确认国内基金）。

**三重根因**:
1. **applyF10Confirmation QDII Path A**: 仅检查「15:00 后 + JZZZL 有效」，不检查 jzrq 日期
2. **f10兜底 国内**: 用 2 交易日阈值（周一 15:05 → jzrq=周五 >= 周四阈值 → 确认❌）
3. **f10兜底 QDII**: 用 3 交易日阈值（太宽松）

**核心修复 (v3.7-0518a)**: 每种基金按净值延迟天数分配独立阈值。

##### `getNavDelay(code, name)` — 净值延迟天数

| 类型 | delay | 说明 |
|------|-------|------|
| 国内/HK同区 | 0 | T日晚出T日净值 |
| QDII 股票 | 1 | T+1晚出T日净值 |
| QDII 债券 | 1 | ≤T+2，按 T+1 处理 |
| FOF 017253 | 2 | T+2 |
| FOF 017242 | 3 | T+3 |

```javascript
function getNavDelay(code, name) {
  if (code === '017242') return 3;  // FOF T+3
  if (code === '017253') return 2;  // FOF T+2
  var hkT0 = ['022680','014674','000071','012348'];
  for (var i=0; i<hkT0.length; i++) if (code===hkT0[i]) return 0;  // HK同区
  var isQd = QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code] || isQdiiByName(name);
  if (!isQd) return 0;
  var bkw = ['美元债','债券','票息','精选美元'];
  for (var i=0; i<bkw.length; i++) if (name && name.indexOf(bkw[i])!==-1) return 1;
  return 1;  // QDII股票
}
function getDelayThreshold(todayDate, delay) {
  var d = new Date(todayDate + 'T12:00:00');
  for (var n=0; n<delay; ) { d.setDate(d.getDate()-1); if (d.getDay()!==0 && d.getDay()!==6) n++; }
  return d.toISOString().slice(0,10);
}
```

##### `applyF10Confirmation` 统一为 jzrq 阈值判定

```javascript
var delay = getNavDelay(code, name);
var threshold = getDelayThreshold(todayStr, delay);

if (!prevDwjz) {
  // Path A: jzrq 到达预期 → 确认（含 JZZZL=0 的债基场景）
  if (f10data.jzrq && f10data.jzrq >= threshold) shouldConfirm = true;
} else {
  // Path B: dwjz 变化 OR jzrq 已到预期（解决 NAV 不变的低波动场景）
  if (dwjzChanged || (f10data.jzrq >= threshold)) shouldConfirm = true;
}
```

##### `f10兜底` QDII/国内统一为一个按 delay 判定的段落

```javascript
var f10Delay = getNavDelay(code, name);
var f10Thr = getDelayThreshold(tradingDate, f10Delay);
if (f10 && f10.dwjz && f10.jzrq && f10.jzrq >= f10Thr) {
  // 确认（含 NAV 不变、chg_pct=0、首次加载等所有场景）
  r.confirmed = true; return r;
}
// 阈值外 → 标记待更新
r.source = (f10Delay>0 ? 'QDII待更新' : '待更新');
```

##### 收盘缓存 TTL 按类型区分

```javascript
var cacheMaxAge = 8*3600*1000;  // 国内 fundgz 8h
if (cacheDelay > 0 && c && c.type === 'etf') cacheMaxAge = 365*24*3600*1000;  // QDII ETF 无 TTL
```

**关键教训**: 
1. 不同基金净值延迟不同，阈值必须按类型区分，不能一刀切
2. NAV 不变时 dwjz 比较会漏确认 → 用 jzrq 阈值兜底
3. 港股同区基金（022680 等）delay=0，不应按 QDII 处理

## 持有金额滚动策略 (v3.8-0521b 最终方案)

### 数据结构（holding 数组，7 元素）

| 索引 | 字段 | 说明 |
|---|---|---|
| h[0] | code | 基金代码 |
| h[1] | name | 基金名称 |
| **h[2]** | **amount（滚动基准）** | 每日滚动的持有金额，前一日收盘确认后更新 |
| h[3] | costBasis（持仓成本） | 冻结的原始买入成本，写入后不再变化 |
| **h[4]** | **confirmedDate** | 上次确认的交易日期。滚动的**唯一守卫** |
| h[5] | confirmedChgPct | 上次确认时的日涨跌幅（API 刷新时自动填充） |
| h[6] | navDate | 净值日期（API 刷新时自动填充） |

### 滚动公式

```javascript
// 每次刷新：当日市值 = 滚动基准 × (1 + 当日涨跌幅/100)
cur_val = h[2] * (1 + chgPct / 100);
gain = cur_val - h[2];

// ⚠️ 仅收盘后滚动（v3.8-0522a 修复）：锁定到次日收盘，避免盘中提前滚导致盈亏重复计算
// 原因：chgPct 是当日相对昨收的涨跌幅，盘中提前滚 h[2] 后 cur_val = 新h[2]*(1+chgPct/100) 会二次叠加
if (isAfterMarketClose() && Math.abs(h[2] - cur_val) > 0.005) {
    h[2] = cur_val;  // 覆盖写入持久化
}
```

### 滚动时机：isAfterMarketClose() 守卫（v3.8-0522a）

```
function isAfterMarketClose() {
  const now = new Date();
  if (!isTradingDay(now)) return true;  // 非交易日：前日收盘已是终值
  return now.getHours() * 60 + now.getMinutes() >= 900;  // 15:00 后
}
```

| 场景 | wasNewToday | isAfterMarketClose | 滚 h[2]？ | h[4] 更新？ |
|---|---|---|---|---|
| Day1 20:00 首次确认 | true | true | ✅ | ✅ h[4]=Day1 |
| Day2 09:00 打开 app | true | **false** | **❌** | ✅ h[4]=Day2 |
| Day2 15:01 收盘后刷新 | false | true | ✅ (h[2]≠cur_val) | ❌ |
| Day2 20:00 再次确认 | false | true | ❌ (h[2]=cur_val) | ❌ |

**关键**：`wasNewToday` 仍负责 h[4]/h[5] 的持久化标记（确认日期/涨跌幅），但 h[2] 的实际滚动由 `isAfterMarketClose()` 独立控制。两者解耦后：
- 盘中确认 → h[4] 更新但 h[2] 不滚 → 后续刷新 cur_val 仍用旧 h[2] 计算 → 不重复叠加
- 收盘后 → h[2] 滚到当日终值 → 次日成为新基准

### 一次性回滚公式（参考，v3.8-0522b 已从 CLEANUP 移除）

当 h[2] 被盘中提前滚动后需回退（仅作公式参考，生产 CLEANUP 不执行回滚）：

```javascript
// h[2] = h[2] / (1 + h[5]/100)
// h[5] 存储的是确认时的 chgPct（当日相对昨收涨跌幅）
// 例：h[2]=102.5, h[5]=2.5 → old_h2 = 102.5/1.025 = 100.0 ✓
const oldH2 = Math.round(h[2] / (1 + h[5] / 100) * 100) / 100;
```

**触发条件**：`h[4] === today` 且 `h[5] !== 0` → 今日确认过且涨跌幅非零 → 可能被提前滚动。

**⚠️ v3.8-0522b 决定**：用户选择不在 CLEANUP 中自动回滚已提前滚动的 h[2]。理由：打开 app 后由 `isAfterMarketClose()` 触发一次正常滚动即可（h[2] → 当日 cur_val），不需回溯到昨收再重新算。CLEANUP v13 只清运行时状态（`todayConfirmed`、`prevNavs`、`confirmedNavs` 等），强制下轮走全流程 API。

**为什么不需要 h[7] 手动编辑标志**：

| 场景 | h[4] | wasNewToday | 滚动？ | h[7] 需要吗？ |
|---|---|---|---|---|
| 未确认，无编辑 | `''` 或昨天 | `true` | ✅ | **不需要** |
| 未确认，有人工编辑 | `''` 或昨天 | `true` | ✅ 覆盖编辑 | **不需要** |
| 已确认，无编辑 | `today` | `false` | ❌ | **不需要** |
| 已确认，有人工编辑 | `today` | `false` | ❌ | **不需要** |

**结论**: h[7] 在所有场景下都是冗余的。`wasNewToday` 一条条件完整覆盖了滚动控制。v3.8-0521b 已完全删除 h[7]（从 8 元素数组回到 7 元素）。

### 用户编辑的语义

用户手动修改 h[2] 后直接写入持久化，不设任何标志：
- 编辑时基金未确认 → 当晚确认时 `wasNewToday=true` → 滚动覆盖编辑 → 编辑是"临时值"
- 编辑时基金已确认 → `wasNewToday=false` → 不滚动 → 编辑是"最终值"

### CSV 导入导出：只需 h[4]

**CSV 格式（7 列）**：
```
组合,Emoji,代码,名称,持有金额,持仓成本,确认日期
```

**为什么只需要 h[4]**：
1. h[5] (confirmedChgPct) 和 h[6] (navDate) 导入后可被 API 刷新自动填充——导入后基金不在 `todayConfirmed` 中，下次刷新会走 `processFund` 拉取 f10 数据更新
2. h[7] 已删除，不需要

**向后兼容**：旧 6 列 CSV 导入时 h[4] 默认 `''` → `wasNewToday=true` → 允许滚动 → 行为正确。旧 10 列 CSV（v3.8-0521a 格式）多出的列被忽略，不影响解析。

**导入已确认基金的关键路径**：
1. 导入 h[4]=today → 基金不在 `todayConfirmed` 中（import 不触发 loadPortfolios）
2. 下次刷新 → 走 processFund → 获取新鲜 f10 数据
3. `wasNewToday = h[4] !== today = false` → **不重复滚动** ✅
4. h[5]/h[6] 被 API 数据更新 → savePortfolios 持久化

**症状**: 早上打开 App（9:30 前），昨天已确认的基金显示"缓存兜底数据"而非"东方财富·已确认"。

**根因**: 两处已确认守卫硬性要求 `isMarketHours()` 才生效：

1. **`doRefresh()` line 1947**: `if (todayConfirmed.has(h[0]) && isMarketHours())` — 非交易时段已确认基金被丢进 `unconfirmed` 列表，走全流程 processFund
2. **`processFund()` line 663**: `if (todayConfirmed.has(code) && isMarketHours())` — 同样跳过

在非交易时段，已确认基金经过 API 拉取 → applyF10Confirmation → closingCache/f10 兜底等多层逻辑，可能被中间环节覆盖为"缓存兜底数据"。

**修复 (v3.8-0520a)**:
- 两处都移除 `&& isMarketHours()` 条件
- 已确认基金在任何时段都走快速路径，直接返回 confirmedChgPct 数据
- 不拉 API，不被 closingCache/f10 兜底干扰

**测试覆盖**: `test_fund_monitor.js --timeline` 新增 8 场景时间线模拟，验证 Day1 开盘→收盘→确认→跨日→Day2 开盘前→开盘 的完整状态接力。关键断言：Day2 09:22（用户场景）确认状态完好（confirmed=true, source=东方财富）。

**时间线测试关键技术点**:
1. `mockGetTradingDate(dateStr, hour, minute)`: 模拟 getTradingDate()，使用中午 T12:00:00 创建 Date 避免 UTC 偏移导致的跨日错误，用本地时间方法格式化（`getFullYear/getMonth/getDate`）而非 `.toISOString()`
2. `mockLoadPortfolios(holdings, tradingDate, nowHour, nowMinute)`: 模拟 loadPortfolios 从 h[4] 恢复 todayConfirmed
3. `mockDoRefresh(holdings, tc, ccp, pn, cc, opts)`: 模拟 doRefresh 的 confirmedFunds/unconfirmed 分流
4. `processFund` 镜像需要 `nowDateStr` 和 `tradingDate` 参数替代 `new Date()`，否则在模拟时间场景中会使用真实当前日期导致阈值计算错误

**症状**：收盘后所有基金（含国内/QDII/FOF）立刻用前几天净值确认，126/130 基金显示"已确认"。

**根因**：`applyF10Confirmation` 和 f10 兜底对所有基金类型用统一阈值（国内2交易日/QDII3交易日），QDII 周一收盘后 `jzrq=上周五` 被 3 天阈值覆盖 → 确认上周五净值。

**修复三件套**：

### A. 新增 `getNavDelay(code, name)` — 每种基金自己的延迟

```javascript
function getNavDelay(code, name) {
  if (code === '017242') return 3;  // FOF T+3
  if (code === '017253') return 2;  // FOF T+2
  var hkT0 = ['022680','014674','000071','012348']; // 港股同区T日
  for (var i=0; i<hkT0.length; i++) if (code===hkT0[i]) return 0;
  var isQd = QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code] || isQdiiByName(name);
  if (!isQd) return 0;   // 国内 T 日
  var bkw = ['美元债','债券','票息','精选美元'];
  for (var i=0; i<bkw.length; i++) if (name && name.indexOf(bkw[i])!==-1) return 1;
  return 1;  // QDII 股票 T+1
}
```

### B. `>=` vs `>` 的微妙区别

| 基金类型 | delay | 阈值计算 | 比较符 | 周一(5/18) f10.jzrq=5/15 | 周二(5/19) f10.jzrq=5/18 |
|---|---|---|---|---|---|
| 国内 | 0 | today=5/18 | `>=` | 5/15 < 5/18 → 不确认 ✓ | — |
| QDII T+1 | 1 | 1TD back=5/15 | `>` | 5/15 = 5/15 → 不确认 ✓ | 5/18 > 5/15 → 确认 ✓ |

**关键**：QDII 必须用 `>`，否则 `jzrq=上周五` 恰好等于 `1天前阈值` 时被 `>=` 命中。

### C. `applyF10Confirmation` 四规则

| 场景 | 国内(delay=0) | QDII/FOF(delay>0) |
|---|---|---|
| Path A (无prevDwjz) | jzrq>=today → 确认 | **不确认**，返回 false |
| Path B dwjz变 | jzrq>=today → 确认 | 确认（新净值发布） |
| Path B dwjz不变 | jzrq>=today → 确认 | jzrq>threshold → 确认 |
| 恢复(JZZZL) | 同上 | 同上 |

### D. 脏 h[4] 持久化绕过所有新逻辑（最隐蔽的坑）

旧版 APK 把 `h[4]="2026-05-18"` 写入了 localStorage。新版 `loadPortfolios` 在 line 968 检测到 `h[4]===today` → 恢复进 `todayConfirmed` → `processFund` 第 745 行守卫直接返回已确认状态，**完全不走 f10 新逻辑**。

**修复**：每次修改确认逻辑后必须 bump `CLEANUP_VERSION`，触发 CLEANUP 清除所有非货基的 `h[4]/h[5]/h[6]`。

```
教训：修改确认判定条件时，如果旧版本已经持久化了不符合新规则的确认状态，
必须 bump CLEANUP_VERSION 强制清除，否则新代码完全不会被走到。
```

## 代码恢复：从 APK 提取原版 HTML

当本地代码被错误修改且无 git 历史时：

```python
import zipfile
with zipfile.ZipFile('/path/to/FundMonitor.apk', 'r') as z:
    html = z.read('assets/index.html')
    with open('target/index.html', 'wb') as f:
        f.write(html)
```

**教训**: 
1. `fund_monitor_app` 目录的 HTML 可能不是最新版（曾出现 814 行 vs 实际 1676 行）
2. 修改前先对比 APK 和本地文件的差异
3. 关键项目应保留独立备份

## 完整时间线 (v3.8+ per-type delay)

| 时间 | 国内(delay=0) | QDII(delay=1) | QDII债(delay=1) | FOF(delay=2/3) |
|------|-------------|-------------|----------------|---------------|
| 周一 15:05 | 待更新/ETF缓存 | ETF缓存 | ETF缓存 | 待更新 |
| 周一 20:00 | ✅ jzrq=5/18≥today | ETF缓存 | ETF缓存 | 待更新 |
| 周二 20:00 | ✅ | ✅ jzrq=5/18>5/15 | ETF缓存 | 待更新 |
| 周三 20:00 | ✅ | ✅ | ✅ jzrq=5/18>5/14 | 待更新(delay=3) |
| 周四 20:00 | ✅ | ✅ | ✅ | ✅ jzrq=5/18>5/13 |

### Bug 6: CLEANUP_VERSION 未 bump 导致持久化 h[4] 绕过新逻辑（2026-05-18）

**症状**: 修改了 applyF10Confirmation 和 f10兜底逻辑，但安装后行为不变 — 基金仍然以旧净值确认。

**根因**: 旧版 APK 已将所有基金 `h[4]` 持久化为当日日期。新版 APK 启动时 `loadPortfolios()` 从 `h[4]` 恢复 `todayConfirmed`（行 968-971: `h[4] === today`），所有基金被加入 `todayConfirmed` → processFund 行 745 `todayConfirmed.has(code)` 直接返回已确认状态，**完全跳过所有新写的确认逻辑**。

**修复**: 每次修改确认逻辑时 **必须 bump CLEANUP_VERSION**，触发 `init()` 中的 CLEANUP 代码段清空所有非货基的 `h[4]/h[5]/h[6]`、`prevNavs` 和 `todayConfirmed`。

### Bug 7: WebView 缓存旧 HTML（2026-05-18）

**症状**: APK 包内 HTML 已更新，但运行时加载的还是旧版。

**修复**: 在 MainActivity.kt 的 WebView 初始化中加入：
```kotlin
clearCache(true)
settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
```

#### Bug 11: h[2] 滚动后 confirmedChgPct/h[5] 未归零导致次日双倍收益 (v4.0-0526a-cc+ 修复)


**症状**: 不同组合的持有金额滚动行为不一致 —— 有的"加了两次收益"，有的"一次没加"。均在非交易时段观测到。


**根因**: h[5] 存储"确认时的涨跌幅"，h[2] 滚动吸收收益后 h[5] 没归零。次日 confirmedChgPct 从 h[5] 恢复 → 把已吸收的收益再次应用到已滚动的本金上。
```
周五: h[2]=100.0, chgPct=2.0%, curVal=102.0 → 收盘滚: h[2]=102.0, h[5]=2.0
周一: confirmedChgPct=h[5]=2.0 → curVal=102.0×1.02=104.04 → gain=2.04 ❌
```

**h[5] 自循环闭环**: h[5]→loadPortfolios→confirmedChgPct→快速路径→f.chg_pct→h[5]。已确认基金永远跳过了 processFund（不拉 API），涨跌幅永不更新。


**修复 (v4.0-0526a-cc)**:
1. h[2] 滚动时归零 `h[5]=0; confirmedChgPct[f.code]=0`
2. doRefresh 已确认基金预拉 fundgz（获取今日实时涨跌幅）
3. CLEANUP v25 清除所有非货基的旧 h[5]


### Bug 12: 删 App 重装后导入 CSV 确认状态丢失 (v4.0-0526b-cc 修复)


**症状**: 删 App 重装 → 导入 CSV → 基金显示 closingCache 而非"已确认"。


**根因（时序）**: init() 的 loadPortfolios 先执行（读到空数据），之后用户导入 CSV。importData 恢复了 h[4] 但没恢复 todayConfirmed → doRefresh 时全部走 processFund → 非交易时段退化为 closingCache。


**修复**: importData 末尾增加 todayConfirmed 恢复逻辑（镜像 loadPortfolios 三分支匹配）。


**教训**: 任何重新填充 portfolioData 的路径（导入/手动添加）都必须同步恢复 todayConfirmed/confirmedChgPct。

### Bug 13: fundgz 预拉取未检查 gztime 新鲜度导致废弃数据回填 (v4.0-0526c-cc 修复)


**症状**: QDII 基金 h[2] 正确但国内基金 h[2] 错误（双倍收益）。用户观察到此差异后定位。


**根因**: v4.0-0526a 加了 fundgz 预拉取但没检查 `gztime` 是否真的是今天的数据。开盘前 fundgz API 返回的是**昨天的估值数据**（gszzl=昨天的涨跌幅，gztime=昨天 15:00）。预拉取把它填进 confirmedChgPct → 又把昨天的涨跌幅应用到了已滚动的 h[2] → 绕过了 h[5] 归零的保护。

```
周一 7:45 开盘前:
  h[2]=102.0（周五已滚）, h[5]=0（已归零）✅
  fundgz 返回: gszzl=2.0, gztime="2026-05-25 15:00"（昨天的！）
  → chgPct=2.0（昨天的脏数据被填回来了）
  → curVal=102.0×1.02=104.04 ❌ 双倍！
```


**修复**: fundgz 预拉取增加 gztime 日期校验：
```javascript
if (_gz && _gz.gszzl && _gz.gszzl !== 'N/A' && _gz.gztime) {
    var _gzDate = _gz.gztime.slice(0, 10);
    var _todayDate = new Date().toISOString().slice(0, 10);
    if (_gzDate === _todayDate) {
        fundGzToday[code] = parseFloat(_gz.gszzl);
    }
}
```


**QDII vs 国内行为差异解释**:
- QDII: fetchFundData 被 QDII_NO_FUNDGZ 拦截 → 返回空 → chgPct=0 → **正确**
- 国内: fetchFundData 返回昨天 fundgz → gztime≠today → chgPct=0 → **正确**（修复后）


**教训**: 任何外部数据源（API）返回的数据都必须校验时效性。不能仅凭"有数据"就使用，必须确认数据产生时间与当前上下文匹配。


### Bug 13: QDII_NO_FUNDGZ 过度封堵导致港股基金丢失实时数据 (v4.0-0526d-cc)

**症状**：012348（天弘恒生科技）、022680（华泰恒生科技I）无 fundgz 实时估值，始终显示 ETF 数据。

**根因**：v4.0-0525g-cc 因某周一 fundgz API 临时返回过期数据，将这两只港股同区基金永久加入了 QDII_NO_FUNDGZ（一刀切封堵）。

**为什么不该封**：
- 港股同区基金在上海/深圳挂牌，天天基金**本应有**实时估值
- 过期数据是 API 服务端临时问题，非基金属性问题
- v4.0-0526c-cc 已有 gztime 新鲜度校验 → 过期数据会自动被拒绝

**修复**：从 QDII_NO_FUNDGZ 移除 012348/022680，让 gztime 校验兜底。

**教训**：**不要用永久封堵（黑名单）处理临时 API 问题**。fresness check（时间戳校验）是更正确的防御层。


### 全周模拟测试（--fullweek）

每次修改 h[2] 滚动/确认/chgPct 逻辑后，必须跑全周模拟测试验证：
```bash
node test_fund_monitor.js --fullweek
```

覆盖范围：22 时间点 × 3 基金类型（国内/QDII/FOF），验证：
- h[2] 仅收盘后滚动 + lastRolledDate 防重复
- 滚后 h[5] 归零 + confirmedChgPct 归零
- fundgz gztime 新鲜度校验（开盘前拒绝昨日数据）
- QDII T+1 / FOF T+2 延迟确认
- 跨日 + 跨周末确认状态保持
- chgPct=0 时 curVal=h[2]，无虚假收益

已集成到 `--all` 模式，每次构建自动运行（当前 262 项总测试）。

processFund 非交易时段有 4 个可能返回确认状态的路径，**任一命中即确认**：

**Step A (applyF10Confirmation)**:
- Path A (无 prevDwjz): 仅 delay=0(国内) + jzrq>=今天 → 确认
- Path B (有 prevDwjz): dwjz变 + (国内需jzrq>=今天 / QDII直接确认)
- Path B: NAV未变 + jzrq>=threshold(国内) or jzrq>threshold(QDII) → 确认

**已确认守卫**: `todayConfirmed.has(code)` → 直接返回（行 745）。此守卫会跳过所有后续逻辑，若 `todayConfirmed` 被持久化的 h[4] 污染 → 所有基金"假确认"。

**⓪ f10二次确认**: 仅国内 + jzrq>=今天 → 确认（行 750）

**② f10兜底**: jzrq>=阈值(国内) or jzrq>阈值(QDII) → 确认（行 800）

### getNavDelay 延迟分类

| 延迟 | 类型 | 判断依据 |
|------|------|---------|
| 0 | 国内/港股T日 | 非QDII 或港股代码(022680/014674/000071/012348) |
| 1 | QDII股票 | FUND_ETF_MAP 有映射 或 QDII_NO_FUNDGZ 含 或 关键词 |
| 1 | QDII债券 | 同上+名称含美元债/债券/票息等关键词 |
| 2 | FOF 017253 | 硬编码 |
| 3 | FOF 017242 | 硬编码 |

**threshold 比较**: delay=0 用 `>=`（需净值日期达到今天）；delay>0 用 `>`（严格大于阈值，防止上周五净值恰好等于阈值时误确）。

### Bug 5: WebView fetch() Referer 被静默剥离 → f10 返回 null

**症状**: QDII 基金来源显示「ETF实时估值」而非「东方财富」，无法确认。
**根因**: Android WebView 中 `fetch()` API 的 `Referer` 头是 Fetch 规范中的"禁止头"，浏览器可能静默剥离后再传给 `shouldInterceptRequest`。即使 `shouldInterceptRequest` 用 HttpURLConnection 注入了 Referer，但如果 `fetch()` 请求在到达拦截器前就已因 CORS/Header 问题失败，则 `fetchF10Nav` 返回 null → 走 ETF closingCache → 永远不会确认。

**诊断方法**（通用）:
1. 先用 Python/curl 从服务器侧测试 API 是否正常返回数据
2. 对比 APK 内嵌 HTML 和源码是否一致：`zipfile.ZipFile('FundMonitor.apk').read('assets/index.html')`
3. 在 JS 中添加 `console.error` 捕获 `fetchF10Nav` 实际错误
4. 如果 API 服务器正常 + 代码一致 → 问题在 WebView 运行时

**修复方案（两处齐改）**:

A. `fetchF10Nav` 加 XHR 兜底（绕开 fetch CORS）:
```javascript
async function fetchF10Nav(code) {
  // 主路径: fetch()
  try {
    const text = await fetchWithFallback(url, {...}, 10000);
    if (text) return parseF10(text);
  } catch(e) { console.error('fetchF10Nav fetch failed:', e); }
  // 兜底: XMLHttpRequest（shouldInterceptRequest 拦截更可靠）
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.timeout = 10000;
    xhr.onload = () => { /* parse */ };
    xhr.onerror = xhr.ontimeout = () => resolve(null);
    xhr.send();
  });
}
```

B. QDII f10 兜底加入确认逻辑（修复 Bug 4 未落地）:
在 `processFund` 非交易时段 `isQdii` 分支（≈752行）加入 3 交易日阈值确认，不再直接标"QDII待更新"丢弃数据。

**最终版本**: v3.6-0515j+，CLEANUP_VERSION='8'。

## Bug 5: prevNavs 残留导致 QDII 净值未变时跳过确认（2026-05-16 修复）

**症状**：7 只 QDII 基金 f10 API 正常返回数据，但 `applyF10Confirmation` 返回 false，show 源显示「ETF实时估值」而非「东方财富·已确认」。

**根因**：旧版本曾确认过这些基金，`prevNavs` 保存了当时的 NAV。升级后 f10 返回同一日期同一净值 → `parseFloat(f10.dwjz) === parseFloat(prevDwjz)` → `applyF10Confirmation` 的 `else` 分支判定「净值未变」→ `shouldConfirm` 保持 false → 跌落到 ETF closingCache 路径。

**修复 (v3.6-0516c)**：
1. `applyF10Confirmation` 的 `else` 分支末尾增加恢复逻辑：净值未变但基金不在 `todayConfirmed` 时，用 JZZZL 恢复确认
2. CLEANUP v9 清除残留的 `fundMonitorPrevNavs` localStorage key
3. 同步添加 `F10Bridge`（Kotlin `@JavascriptInterface` + OkHttp）作为 f10 拉取第一路径

**备份位置**: `/opt/data/FundMonitor-claude/backups/v3.6-0516c/`

---

## v3.8 大修：按基金类型区分确认阈值 (2026-05-18)

### 症状
收盘后几乎所有基金(126/130)立即用前几天净值确认，显示「东方财富·已确认」。国内基金周一15:05用上周五净值确认，QDII更是大面积误确认。

### 根因 (5 层嵌套 Bug)

#### Bug A: f10兜底阈值一刀切
国内用 2 交易日阈值 → 周一 jzrq=周五 >= 周四阈值 → 确认❌
QDII 用 3 交易日阈值 → 周一 jzrq=周五 >= 上周三阈值 → 确认❌

**修复**: 新增 `getNavDelay(code, name)` 函数，每种基金按净值延迟天数分配独立阈值：

| delay | 类型 | 判断 |
|-------|------|------|
| 0 | 国内/港股同区 | 非QDII 或 HK代码(022680/014674/000071/012348) |
| 1 | QDII股票/债券 | FUND_ETF_MAP有映射 或 QDII_NO_FUNDGZ 或关键词 |
| 2 | FOF 017253 | 硬编码 |
| 3 | FOF 017242 | 硬编码 |

配套 `getDelayThreshold(todayDate, delay)` 计算 delay 个交易日前日期。

#### Bug B: >= vs > 的致命区别
QDII delay=1, threshold=1天前(周五)。周一 f10.jzrq=周五。
- `>=` → 5/15=5/15 → 确认❌ (恰好命中阈值)
- `>` → 5/15 不 > 5/15 → 不确认✓
- 周二 f10.jzrq=周一 → 5/18 > 5/15 → 确认✓

**修复**: domestic(delay=0)用 `>=`，QDII(delay>0)用 `>`。

#### Bug C: applyF10Confirmation Path A QDII 误确认
无 prevDwjz 时，QDII Path A 只检查「15:00后+JZZZL有效」，不检查 jzrq → 直接确认。

**修复**: Path A 仅允许 delay=0 确认；delay>0 直接 return false，留给其他路径。

#### Bug D: Path B 国内 dwjz 变即确认
周四→周五净值变化，周一检查时 dwjz 变了 → 确认，未检查 jzrq>=今天。

**修复**: 国内(delay=0) Path B 增加 jzrq>=today 检查。

#### Bug E: CLEANUP 不 bump → 持久化 h[4] 绕过所有新逻辑 ⚠️ 最隐蔽
旧版APK已将所有基金 `h[4]` 写为"2026-05-18"持久化。新版 loadPortfolios 检测到 `h[4] === today` → 全部恢复到 `todayConfirmed` → processFund 行745守卫直接返回已确认，**完全不走新写的确认逻辑**。

**修复**: 修改确认逻辑后必须 bump CLEANUP_VERSION，触发 CLEANUP 清空 h[4]。

#### Bug F: CLEANUP 清 localStorage 但不清运行时变量
`loadPrevNavs()`(line 1637)在 CLEANUP(line 1644)之前运行，把旧 `prevNavs` 恢复到 JS 变量。CLEANUP 只删了 localStorage 的 key，**运行时 `prevNavs` 对象仍保留旧数据** → QDII 全走 Path B → dwjz变 → 确认。

**修复**: CLEANUP 加 `prevNavs = {}`，同时清运行时变量。

#### Bug G: WebView 缓存旧 HTML
APK包内HTML已更新，但 WebView 加载的是缓存的旧版。

**修复**: MainActivity.kt 的 WebView init 中加入：
```kotlin
clearCache(true)
settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
```

### 最终确认四路径

processFund 非交易时段有 4 个返回确认的路径，**任一命中即确认**：

| 路径 | 触发条件 | 优先级 |
|------|---------|--------|
| Step A applyF10Confirmation | Path A: delay=0+jzrq>=today / Path B: dwjz变 or jzrq>=阈值 | 最高 |
| 已确认守卫 | todayConfirmed.has(code) | 行745 |
| ⓪ f10二次确认 | 仅国内 + jzrq>=today | 行750 |
| ② f10兜底 | jzrq>=阈值(国内) or jzrq>阈值(QDII) | 行800 |

### ⚠️ 重大教训：CLEANUP_VERSION 升级陷阱 (2026-05-18)

**背景**: v3.6-0516c 引入 QDII f10 兜底 3 交易日阈值确认 → 导致收盘后 126/130 基金误确认。尝试通过一系列修复解决，但每次修复引入新问题，形成升级死亡螺旋：

```
v3.7-0518a: 加 getNavDelay + 改 applyF10Confirmation + f10兜底
  → CLEANUP v9 已清除 h[4]，但 loadPrevNavs 在 CLEANUP 前恢复了旧 prevNavs
  → QDII 仍走 Path B 误确认 → 失败
v3.7-0518b: bump CLEANUP→v10，加 prevNavs={} 在 CLEANUP 中
  → 但 fm_cleanup_v 已是'10'，CLEANUP 不再执行
  → prevNavs 未清 → 失败
v3.8-0518c: bump CLEANUP→v11，加 prevNavs={} 
  → CLEANUP 执行但 fixedCount=0，savePortfolios 不触发
  → 同时动了 doRefresh 的 prevNavs 清空逻辑
  → App 启动后卡在"正在加载组合数据"，所有数据显示为空 → 失败
v3.8-0518e: 从 v3.6-0516c 备份恢复，只改 3 处核心逻辑，不动 CLEANUP/prevNavs/loadPortfolios ✅
```

**核心教训**:

1. **不要用 CLEANUP_VERSION 做功能修复的触发器**。CLEANUP_VERSION 只应清除脏数据，不应依赖它来改变运行时行为。如果修改了确认逻辑，逻辑变化应该自带动生效，不依赖数据清除。

2. **`prevNavs` 在 init() 中的时序陷阱**:
   ```
   loadPrevNavs()  ← 第 1637 行，在 CLEANUP 之前，把旧值恢复到 JS 变量
   CLEANUP         ← 第 1644 行，删 localStorage 但运行时变量已污染
   ```
   如果在 CLEANUP 中加 `prevNavs = {}`，必须同步 bump CLEANUP_VERSION 才能执行。

3. **CLEANUP_VERSION bump 只生效一次**。同一版本安装第二次时 `fm_cleanup_v === CLEANUP_VERSION` → CLEANUP 不运行 → 加在 CLEANUP 内的任何修复代码都不会执行。

4. **从干净版本出发，只做精确定点修改**。这比反复 bump CLEANUP_VERSION 追赶脏数据要稳定得多。v3.8-0518e 的最终做法：
   - 从 v3.6-0516c 备份恢复完整 HTML
   - 只加 `getNavDelay()` / `getDelayThreshold()` 函数
   - 只改 `applyF10Confirmation`（Path A QDII 不确认 + Path B 国内加 jzrq 检查）
   - 只改 f10 兜底（用 getNavDelay 替换硬编码阈值）
   - **不动** CLEANUP_VERSION、prevNavs、loadPortfolios、doRefresh

5. **`prevDwjz` 判定用 `prevDwjz && parseFloat(prevDwjz) > 0`** 而不是 `!prevDwjz`。prevDwjz 可以是空字符串 `""` 或 `"0"`，`!""` 为 true 会错误进入 Path A。

## ⚠️ v4.0-0525 重大修正：delay+1 全面回退为 delay

### 根因认识演进

Bug 10 修复（v4.0-0524b-cc）将三处阈值统一为 `delay+1`，但这引入了新的误确认 bug：
- `getNavDelay()` 已为 QDII 返回更高 delay (1/2/3)，再加 1 是**二次补偿**
- 周一 QDII(delay=1)：`getDelayThreshold("5/25", 2)` = "5/21" → h[4]="5/21" 通过 → 误恢复
- HK(delay=0)：`getDelayThreshold("5/25", 1)` = "5/22" → h[4]="5/22" 通过 → 误恢复

**v4.0-0525 修正**：三处统一改为 `delay`（不加1）：
1. `applyF10Confirmation` JZZZL恢复：`recDelay+1` → `recDelay`
2. `f10兜底`：`f10Delay+1` → `f10Delay`
3. `loadPortfolios` QDII恢复：`qDelay+1` → `qDelay`

### 额外发现：loadPortfolios 应用 h[6] 而非 h[4] (v4.0-0525c-cc)

`h[4]`（确认日期）≠ `h[6]`（净值日期）。周五确认的 QDII 基金 h[4]="5/22" 但 h[6]="5/21"（周四净值）。
用 h[4] 比较阈值会误恢复 → 改用 h[6]：
```javascript
var qRef = h[6] || h[4];  // 净值日期优先，确认日期兜底
```

### 额外发现：JZZZL 恢复不应作用于 QDII (v4.0-0525e-cc)

JZZZL 恢复（applyF10Confirmation 中的丢失确认恢复分支）仅用于国内基金(delay=0)。
QDII(delay>0) 走 JZZZL 恢复会在 jzrq 恰好等于阈值时误确认（周一的 007280/008164）。
修复：增加 `recDelay === 0` 守卫。

### 额外发现：港股基金 fundgz 过期 (v4.0-0525g-cc)

部分港股基金（012348 恒生科技、022680 恒生科技、000071 恒生ETF）fundgz 在周一返回
周五过期估值（gztime="5/22 16:00", gszzl≠0），而实际涨幅为 0%。
对比 014674（港股通互联网）正常返回实时数据。这是天天基金 API 服务端问题。
修复：将 012348、022680 加入 QDII_NO_FUNDGZ 阻止过期 fundgz。

### WebView 缓存顽固问题 (v4.0-0525b-cc)

APK 内 HTML 已更新为 v4.0-0525b 但 app 显示 v4.0-0522f，原因是：
- `clearCache(true)` 和 `LOAD_NO_CACHE` 只对 HTTP 有效，对 `file:///android_asset/` 无效
- 需要更激进的清理：
```kotlin
clearCache(true)
clearHistory()
clearFormData()
settings.cacheMode = WebSettings.LOAD_NO_CACHE
try { ctx.deleteDatabase("webview.db") } catch (_: Exception) {}
try { ctx.deleteDatabase("webviewCache.db") } catch (_: Exception) {}
loadUrl("file:///android_asset/index.html?v=${versionCode}")
```
- URL 加版本参数 `?v=N` 破坏 file:// 缓存 key
- 每次改代码必须 bump versionCode，否则 Android 拒绝覆盖安装同版本 APK

## Bug 10: QDII 阈值 delay vs delay+1 不一致导致确认丢失 (2026-05-24 修复, v4.0-0524b-cc) — ⚠️ 已被 v4.0-0525 回退

### 症状
008367（汇添富全球消费 QDII, delay=1）在周末/非交易时段，确认状态丢失，h[4] 为空时回退到 ETF 实时估值显示，无法确认。

### 根因：三处 QDII 阈值不一致

`loadPortfolios` QDII 跨周末恢复分支 (line ~1202) 使用 `qDelay + 1`：

```javascript
var qThr = getDelayThreshold(today, qDelay + 1);  // ✅ delay+1
```

但 `applyF10Confirmation` JZZZL 恢复 (line ~872) 和 `f10` 兜底 (line ~1030) 使用 `delay`：

```javascript
// applyF10Confirmation — ❌ 只用 delay
var recThr = getDelayThreshold(now, recDelay);
// f10 兜底 — ❌ 只用 delay
var f10Thr = getDelayThreshold(tradingDate, f10Delay);
```

**问题**：QDII 的 jzrq 天然滞后 1 天（T+1 晚才出 T 日净值）。`getDelayThreshold(today, 1)` 回退 1 个交易日，得到的阈值恰好是上一个交易日的日期。而 QDII 的 jzrq 也是上一个交易日 → 在 `>=` 比较下可能匹配失败（取决于边界条件），导致无法确认。

**为什么 `loadPortfolios` 分支能工作**：`loadPortfolios` 读的是 `h[4]`（持久化的确认日期），这个日期本身就是「发送确认的那天的 tradingDate」。`getDelayThreshold(today, delay+1)` 回退 `delay+1` 交易日 → 覆盖了确认日期 → `h[4] >= qThr` 能通过。

**为什么 JZZZL 恢复和 f10 兜底失败**：这两个路径读的是 `f10data.jzrq`（东方财富 API 返回的净值日期），而非持久化的 `h[4]`。jzrq 比 tradingDate 晚 `delay` 天（QDII T+1 净值发布日期晚 1 天）。`getDelayThreshold(today, delay)` 回退恰好 `delay` 天 → 阈值日期和 jzrq 在同一天 → 边界条件可能不匹配。

### 修复：三处统一使用 `delay+1`（⚠️ 此修复后被 Bug 10b 推翻，见下）

```javascript
// applyF10Confirmation JZZZL 恢复 (line ~872)
var isQDconf = QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code] !== undefined || isQdiiByName(name);
var recThr = getDelayThreshold(now, isQDconf ? recDelay + 1 : recDelay);

// f10 兜底 (line ~1030)
var f10Thr = getDelayThreshold(tradingDate, isQdii ? f10Delay + 1 : f10Delay);
```

**规则**：FundMonitor 中所有 QDII 确认阈值比较必须使用 `delay+1`，无论路径是 `loadPortfolios`（已正确）、`applyF10Confirmation`（本次修复）还是 `f10` 兜底（本次修复）。

### 教训
1. **同一逻辑在多处实现时，必须保持阈值计算一致**。`loadPortfolios` 用 `delay+1`，其他地方用 `delay` → 行为分裂。
2. **持久化数据 (h[4]) 和实时 API 数据 (f10.jzrq) 的语义不同**。前者是「确认那天的交易日」，后者是「净值发布日期」——两者的时间差不同，但阈值计算需要统一。
3. **测试镜像 (test_fund_monitor.js) 必须同步修补**，否则回归测试会漏。

## Bug 10b: `delay+1` 过度补偿导致 QDII/HK 误确认（2026-05-25 修复, v4.0-0525a-cc）

### 症状
周一打开 App：所有 QDII 显示「已确认」但数据是 5/21（周三）；港股显示「已确认」但数据是 5/22（周五）。国内基金正确显示「待更新」。

### 根因：`delay+1` 是二次补偿

**Bug 10 修复在三处加了 `delay+1`，但 `getNavDelay()` 已经为 QDII 返回了正确的延迟值（1/2/3）**。`+1` 等于重复计数：

```
getNavDelay('050025', '博时标普500') = 1    ← 已含 QDII 的 1 天延迟
getDelayThreshold(today, 1) = 上一个交易日   ← 阈值已正确
getDelayThreshold(today, 1+1=2) = 两个交易日前 ← 过度补偿！
```

周一 10:18（today="2026-05-25"）：QDII delay=1 → `getDelayThreshold("5/25", 2)` = "5/21"（周四）→ h[4]="5/21" >= "5/21" → **误恢复**。港股 delay=0 → `getDelayThreshold("5/25", 1)` = "5/22" → h[4]="5/22" >= "5/22" → **误恢复**（isQdiiByName 匹配「香港」「恒生」导致港股进入 QDII 分支）。

### 修复：三处统一改为 `delay`（不加1）

| 位置 | 修改前 | 修改后 |
|------|--------|--------|
| `applyF10Confirmation` JZZZL恢复 | `isQDconf ? recDelay+1 : recDelay` | `recDelay` |
| `f10兜底` | `isQdii ? f10Delay+1 : f10Delay` | `f10Delay` |
| `loadPortfolios` QDII恢复 | `qDelay + 1` | `qDelay` |

### 验证：`delay` 不会带回 Bug 10

周六 QDII f10兜底：tradingDate="5/22", delay=1 → threshold="5/21", f10.jzrq="5/22" >= "5/21" → 确认 ✓。周一 h[4]="5/22" 恢复：threshold="5/22", "5/22" >= "5/22" → 恢复 ✓。**`delay` 对 Bug 10 场景和周一场景均正确。**

### 关键教训

⚠️ **`getNavDelay` 的返回值已经包含了 QDII 的净值延迟，不需要也不应该再 `+1`**。Bug 10 修复的本质是「统一三处阈值」而非「选 delay+1」——选了错误的值。

## Bug 10c: loadPortfolios 用 h[4] 而非 h[6] 比较阈值（2026-05-25 修复, v4.0-0525c-cc）

### 症状
修复 Bug 10b 后 QDII 基金仍显示「已确认」。CSV 数据：`confirmedDate=5/22`（周五确认），`navDate=5/21`（周四净值）。h[4]="5/22" >= threshold="5/22" → 仍被恢复。

### 根因：确认日期 ≠ 净值日期

QDII T+1 特性：周四的净值周五傍晚才发布。用户周五晚上确认时，`h[4]` 记录的是「确认发生的交易日」（周五），但实际净值日期 `h[6]` 是周四（5/21）。loadPortfolios QDII 恢复一直用 `h[4]` 比较阈值，应该用 `h[6]`（净值日期）反映数据真实新鲜度。

### 修复：用 h[6] 优先，h[4] 兜底

```javascript
var qRef = h[6] || h[4];  // 净值日期优先，确认日期兜底
if (qRef >= qThr) { ... }
```

周一推演：
- QDII (h[6]="5/21", h[4]="5/22"): qRef="5/21" < threshold="5/22" → **不恢复** ✓
- HK (h[6]="5/22", h[4]="5/22", delay=0): qRef="5/22" < threshold="5/25" → **不恢复** ✓

### 教训

**持久化的两个日期字段语义不同**：`h[4]` 是「哪天确认的」，`h[6]` 是「净值是哪天的」。对 QDII 这种延迟发布净值的基金，两者可以差一天。跨周末恢复时，应该用净值日期判断数据是否过时。

## Bug 10d: JZZZL 恢复误确认 QDII（2026-05-25 修复, v4.0-0525e-cc）

### 症状
修复 Bug 10c 后，007280（摩根日本QDII）和 008164（标普红利低波QDII）在周一被错误确认，数据源「东方财富」，用 5/22 数据。其他 QDII 基金正常显示「待更新」。

### 根因：JZZZL 恢复对 QDII 也生效

`applyF10Confirmation` 中 JZZZL 恢复分支（「丢失确认状态且 jzrq 已到预期 → 恢复」）未区分基金类型：

```javascript
// 修复前
if (!shouldConfirm && !todayConfirmed.has(code) && f10data.chg_pct != null 
    && f10data.chg_pct !== 0 && f10data.jzrq) {
    var recDelay = getNavDelay(code, name);
    var recThr = getDelayThreshold(now, recDelay);
    if (f10data.jzrq >= recThr) { shouldConfirm = true; }
}
```

周一，这两个 QDII 的 f10 已返回 jzrq="5/22"（周五净值），recDelay=1，recThr="5/22" → jzrq>=阈值 → 被确认。而其他 QDII 的 f10 尚未更新（jzrq="5/21" < "5/22"）→ 没被确认 → 表现不一致。

**深层原因**：JZZZL 恢复的设计意图是「恢复丢失的确认状态」，即基金昨天已确认但 todayConfirmed 丢了。但 QDII 基金**本就不该在周一确认**（周一 NAV 尚未发布），JZZZL 恢复不应为 QDII 创造新的确认。

### 修复：JZZZL 恢复仅限 delay=0（国内基金）

```javascript
// 修复后
var recDelay = getNavDelay(code, name);
if (!shouldConfirm && !todayConfirmed.has(code) && recDelay === 0 
    && f10data.chg_pct != null && f10data.chg_pct !== 0 && f10data.jzrq) {
    var recThr = getDelayThreshold(now, recDelay);
    if (f10data.jzrq >= recThr) { shouldConfirm = true; }
}
```

**为什么国内基金不受影响**：国内基金的 Path A（`jzrq >= todayStr`）在同样条件下先一步确认了，JZZZL 恢复对国内基金本就是死代码（`!shouldConfirm` 为 false）。

### 教训

**JZZZL 恢复的语义是「恢复」而非「首次确认」**。QDII 的确认应走正常 Path B（净值变化时）或等待 f10 兜底，不应通过「恢复」路径首次确认。

## HK 基金与 fundgz（2026-05-25）

### 关键规则

**港股同区基金（delay=0，如 012348/022680/014674/000071）不应加入 QDII_NO_FUNDGZ**。虽然 `isQdiiByName` 可能匹配它们的名称（如「恒生」「香港」），但它们有天天基金实时估值（fundgz），且 delay=0 意味着阈值逻辑按国内处理。加入 QDII_NO_FUNDGZ 会阻止 fundgz 拉取，导致失去实时估值能力。

正确做法：港股基金的基金代码已在 `getNavDelay` 的 `hkT0` 列表中标记 `delay=0`，阈值逻辑自然按国内处理。`isQdiiByName` 误匹配只影响 `isQdii` 判断（用于区分 QDII/非 QDII 路径），但 `fetchFundData` 的 fundgz 门控只检查 `QDII_NO_FUNDGZ.has(code)`，不检查 `isQdiiByName`。所以港股基金只要不在 QDII_NO_FUNDGZ 中，就能正常拉取 fundgz。

## WebView file:// 缓存 + versionCode 陷阱（2026-05-25）

### 症状
APK 安装后 App 仍显示旧版本号，即使 APK 内 HTML 已更新。`clearCache(true)` + `LOAD_NO_CACHE` 对 `file:///android_asset/` 无效。

### 修复

**MainActivity.kt**（除原有 `clearCache(true)` 外增加）：
```kotlin
clearHistory()
clearFormData()
try { ctx.deleteDatabase("webview.db") } catch (_: Exception) {}
try { ctx.deleteDatabase("webviewCache.db") } catch (_: Exception) {}
loadUrl("file:///android_asset/index.html?v=106")  // 版本参数破坏缓存 key
```

**versionCode 必须 bump**：Android 静默拒绝覆盖安装同 versionCode 的 APK。不改 versionCode，用户装的永远是旧版。

## ⚠️ 每次修改确认逻辑后的 Checklist

### 症状
周一下午打开 App：
- 所有 QDII 基金显示「已确认」但数据是 5/21（周三），应该是「待更新」
- 港股基金显示「已确认」但数据是 5/22（周五），应该和国内基金一样「待更新」
- 国内基金/债券/黄金/货币正确

### 根因：`delay+1` 是二次补偿

**Bug 10 修复（v4.0-0524b-cc）在三处加了 `delay+1`，但 `getNavDelay()` 已经为 QDII 返回了更高的 delay 值（1/2/3）**。再加 `+1` 相当于重复计数：

```
getNavDelay('050025', '博时标普500') = 1    ← 已含 QDII 的 1 天延迟
getDelayThreshold(today, 1) = 上一个交易日   ← 阈值已正确
getDelayThreshold(today, 1+1=2) = 两个交易日前 ← 过度补偿！
```

**周一 10:18 的数值推演（today="2026-05-25"）**：

| 基金类型 | delay | `delay+1` 阈值 | h[4] 值 | 结果 |
|---------|-------|---------------|---------|------|
| QDII 股票 | 1 | 2→"5/21"(周四) | "5/21" | ≥ 阈值 → **误恢复！** |
| QDII 债券 | 1 | 2→"5/21" | "5/21" | ≥ 阈值 → **误恢复！** |
| 港股(delay=0) | 0 | 1→"5/22"(周五) | "5/22" | ≥ 阈值 → **误恢复！** |
| 国内(delay=0) | 0 | - | - | 不进入 QDII 分支 → ✓ |

**港股为何受影响**：`isQdiiByName` 匹配「香港」「恒生」关键词 → 港股基金（022680 等）进入 QDII 恢复分支 → 虽然 `getNavDelay=0`，但 `delay+1=1` 给了 1 天容忍 → 周五确认的港股在周一仍被恢复。

### 修复：三处统一改为 `delay`（不加1）

| 位置 | 修改前 | 修改后 |
|------|--------|--------|
| `applyF10Confirmation` JZZZL恢复 | `isQDconf ? recDelay+1 : recDelay` | `recDelay` |
| `f10兜底` | `isQdii ? f10Delay+1 : f10Delay` | `f10Delay` |
| `loadPortfolios` QDII恢复 | `qDelay + 1` | `qDelay` |

### 验证：`delay` 不会带回 Bug 10

Bug 10 原始场景（周末 QDII 基金确认丢失）推演：

```
周六 (5/23), tradingDate="5/22" (周五)
  getDelayThreshold("5/22", 1) = "5/21" (周四)
  f10.jzrq="5/22" (周五 QDII NAV) >= "5/21" → 确认 ✓

周一 (5/25) 10AM, tradingDate="5/25"
  getDelayThreshold("5/25", 1) = "5/22" (周五)
  h[4]="5/22" >= "5/22" → 恢复 ✓
  h[4]="5/21" >= "5/22" → NOT 恢复 ✓ (正确拒绝周三旧数据)
```

`delay` 对 Bug 10 场景和今日场景均正确。Bug 10 修复的本质是「统一三处阈值」而非「选 delay+1」——选了错误的值。

### 关键教训

⚠️ **`getNavDelay` 的返回值已经包含了 QDII 的净值延迟，不需要也不应该再 `+1`**。`getDelayThreshold(today, getNavDelay(code, name))` 就是正确的阈值，任何额外的偏移都是重复计数。

同时注意：**versionCode 必须 bump**。本次修复的 APK（versionCode=105）和上次是同一版本号，Android 静默拒绝覆盖安装，用户实际运行的仍是旧版。必须 `versionCode++` 才能强制更新。

## ⚠️ 每次修改确认逻辑后的 Checklist
1. **bump versionCode** (从 N → N+1) — ⚠️ **最优先！Android 静默拒绝覆盖安装同版本号 APK，不 bump 用户装的永远是旧版**
2. **bump CLEANUP_VERSION** (从 'N' → 'N+1') — 否则持久化 h[4] 绕过新逻辑
3. **更新 versionName** 和 HTML `<title>` — 方便确认安装的版本
4. **`prevNavs = {}`** 加入 CLEANUP — 防止旧 prevNavs 走 Path B 误确认
5. **删除 app/build/intermediates/assets** — 否则增量构建不打包新 HTML
6. **验证 APK 内容**: `python3 -c "import zipfile; ..."` 检查 HTML 中关键字符串
7. **优先从干净备份恢复，只做最小修改** — 避免 CLEANUP_VERSION 升级陷阱

## CLEANUP 的正确姿势（v10 最终版）

清 h[4] 但**保留 prevNavs 和所有缓存**，避免"数据全空"：

```javascript
var CLEANUP_VERSION = '10';
if (localStorage.getItem('fm_cleanup_v') !== CLEANUP_VERSION) {
  for (var pk in portfolioData) {
    for (var h of portfolioData[pk].holdings || []) {
      if (!MONETARY_FUNDS.has(h[0]) && h[4]) {
        h[4] = ''; h[5] = 0; h[6] = '';  // 只清确认标记
      }
    }
  }
  if (fixedCount > 0) savePortfolios(portfolioData);
  todayConfirmed.clear();  // 清运行时状态
  // ⚠️ 不删 prevNavs / fm_portfolio_results / closingCache
  localStorage.setItem('fm_cleanup_v', CLEANUP_VERSION);
}
```

**教训**: v9 删了 `fundMonitorPrevNavs` + `fm_portfolio_results` → 所有基金无历史净值 → Path A 全不确认 → closingCache 也可能为空 → App 显示"数据全部为空"。**CLEANUP 只需清确认标记，缓存和净值历史都要保留**。

---

## Bug 11: h[2] 滚动后 confirmedChgPct/h[5] 未归零导致双倍收益（2026-05-26 诊断）

### 症状
不同组合表现不一致：京东基金"加了两次收益"（h[2] 滚过+旧涨跌幅再乘一次），指数生财"一次没加"（h[2] 没滚过，持有金额数字不变）。根本原因：h[2] 滚动吸收收益后，h[5] 和 confirmedChgPct 没有归零。

### 根因：h[5] 被用作两个不同语义

h[5] 同时充当：①"上次确认时的涨跌幅"（持久化恢复用）②"curVal 计算的乘数"。h[2] 滚后收益已吸收进本金，再乘 h[5] 就是二次计数。

### 数值推演（周五 2%涨幅，周一早上）

```
周五 20:00 收盘确认：
  h[2]=100.00 → 滚到 102.00 ✅
  h[5]=2.0（持久化） ⚠️ 未归零！
  lastRolledDate="2026-05-22"

周一 07:45（9:30前）：
  getTradingDate()="2026-05-22"（返回周五）
  loadPortfolios: h[4]=="2026-05-22" → todayConfirmed
  confirmedChgPct = h[5] = 2.0  ⚠️⚠️⚠️

  快速路径 dislay：
  curVal = 102.00 × 1.02 = 104.04 ❌ 双倍！
  gain = 104.04 - 102.00 = 2.04 ❌
```

### 致命连锁反应：h[5] 自循环闭环

```
h[5] → loadPortfolios(1212) → confirmedChgPct
     → 快速路径(2157) → f.chg_pct=confirmedChgPct
     → 后处理(2250) → h[5]=f.chg_pct → 循环！
```

此环一旦建立（首次 processFund 确认），永不打破。除非 CLEANUP 清除 h[5] 或基金走 processFund 全流程重新确认。

### 两条路径均有此 bug

- **doRefresh 快速路径** (2156-2165): `curVal = h[2] * (1 + confirmedChgPct/100)` ← 实际走的路径
- **processFund 已确认守卫** (733-739): `r.cur_val = amount * (1 + chgPct/100)` ← 防御代码，同样错误

### CLEANUP v24 加剧：删 lastRolledDate 但 h[2] 已滚

CLEANUP 删除 `fm_last_rolled_date` 后，lastRolledDate 变空，但 h[2] 已是滚后值。下次 `isAfterMarketClose()` 触达时，lastRolledDate 守卫失效 → h[2] 再次滚动 → 双倍永久持久化。

### 修复方向（尚未实施）

核心：h[2] 滚后 h[5] 和 confirmedChgPct 必须归零。
- 方案 A: 滚后归零 h[5]=0，confirmedChgPct=0。副作用：已确认基金显示 0 收益直到下次 processFund
- 方案 B: 归零 + 已确认基金轻量拉取 fundgz 获取今日涨跌幅
- 方案 C: 快速路径中用 `lastRolledDate >= h[4]` 判断是否已吸收 → chgPct=0

### Bug 11c: fundgz 预拉取未检查 gztime 新鲜度 → 昨日期脏 chgPct 泄漏 (v4.0-0526c-cc 修复)

**关键发现过程**: 用户观察到 QDII 的 h[2] 正确、国内基金的 h[2] 错误——这恰好反推出了 v4.0-0526a 的残留漏洞。

**根因**:
- QDII → `fetchFundData` 被 `QDII_NO_FUNDGZ` 拦截 → 返回 null → chgPct=0 → 正确
- 国内 → `fetchFundData` 开盘前返回昨天的 fundgz（gszzl=昨日涨跌幅, gztime=昨天15:00）
  → v4.0-0526a 的预拉取代码只检查了 `gszzl` 存在，**未检查 `gztime` 日期是否匹配今天**
  → 昨天的脏 chgPct 被填入 `fundGzToday` → 双倍 bug 又回来了

**修复**: fundgz 预拉取增加 `gztime.slice(0,10) === todayDate` 校验，开盘前 fundgz 日期不匹配 → chgPct=0 → curVal=h[2] ✅

```javascript
if (_gz && _gz.gszzl && _gz.gszzl !== 'N/A' && _gz.gztime) {
    var _gzDate = _gz.gztime.slice(0, 10);
    var _todayDate = new Date().toISOString().slice(0, 10);
    if (_gzDate === _todayDate) {
        fundGzToday[code] = parseFloat(_gz.gszzl);
    }
}
```

**教训**: 
1. **用户观察到的"QDII 正确、国内错误"现象是定位此 bug 的唯一线索**——如果只跑国内基金测试，会以为 v4.0-0526a 修复已经生效
2. **任何从外部 API 获取的"实时"数据都必须校验时间戳新鲜度**，否则非交易时段会成为脏数据泄漏窗口
3. **多类型对比测试（QDII vs 国内）能暴露单类型测试盲区**


### 全周模拟测试 (`test_fund_monitor.js --fullweek`)

**文件位置**: `test_fund_monitor.js` 的 `runFullWeekTest()` 函数（~400 行）

**覆盖范围**: 模拟周一 9:30 到下周一 9:30 的完整一周，22 个时间点，3 种基金类型（国内/QDII/FOF）

**每次构建前运行**: `node test_fund_monitor.js --fullweek`（66 项断言，已纳入 `--all` 模式）

**测试的关键行为**:
| 时间点 | 国内(delay=0) | QDII(delay=1) | FOF(delay=2) |
|---|---|---|---|
| Day1 09:30 | fundgz, h[2]不变 | ETF, h[2]不变 | 无数据 |
| Day1 20:00 | 确认+h[2]滚+h[5]=0 | 未确认 | 未确认 |
| Day1 22:00 | h[2]不滚(lastRolledDate锁) | — | — |
| Day2 07:45 | 确认保持, chgPct=0 | 未确认 | 未确认 |
| Day2 20:00 | 确认+滚+h[5]=0 | Day1 NAV确认+滚 | 未确认 |
| Day3 20:00 | 确认+滚 | Day2 NAV确认+滚 | Day1 NAV确认+滚 |
| Day6 周六 | 确认保持, h[2]不变 | 同左 | 同左 |
| Day7 周一07:45 | 跨周末确认保持, chgPct=0 | 同左 | 同左 |

**技术要点**: 使用确定性随机(seed=42)保证可复现；每个基金独立构建 f10/fi/etf mock 数据；包含完整的 `mockIsAfterMarketClose`、`lastRolledDate` 守卫、fundgz gztime 新鲜度校验逻辑


### 教训
1. **一个持久化字段不应同时充当"历史快照"和"实时乘数"**。h[5] 的两重语义是根因
2. **滚动操作修改了本金基准后，所有依赖"旧本金"算出的增量必须归零**
3. **自循环闭环（h[5]→confirmedChgPct→f.chg_pct→h[5]）是设计缺陷**：一旦建立就无法被真实数据打断
4. **CLEANUP 删除 lastRolledDate 但不清 h[2] 的已滚状态，等于拆除防火墙**
5. **任何从外部 API 获取的"实时"数据都必须校验时间戳新鲜度**：开盘前天天基金 API 返回昨天数据，必须过滤
6. **多类型对比测试（QDII vs 国内）能暴露单类型测试盲区**：用户观察到 QDII 正确/国内错误是关键诊断线索

## Bug 9: doRefresh 快速路径 source_detail 回退到 h[4] 纯日期（2026-05-20 修复）

### 症状
第一次刷新：已确认基金显示「东方财富 + 净值1.2345 + 5/19」✅  
第二次刷新（同会话）：显示「东方财富 + 5/20」❌（净值 badge 消失，只剩日期）

### 根因：双快速路径不一致

已确认基金有 **两个快速路径**，第二个刷新走的是 `doRefresh` 而非 `processFund`：

**路径 A — doRefresh 第 2064-2073 行**（实际命中的路径）：
```javascript
if (todayConfirmed.has(h[0])) {
    confirmedFunds.push({
        source_detail: (prevNavs[h[0]]
            ? '净值'+prevNavs[h[0]] + ((h[6]||h[4])?' ('+(h[6]||h[4])+')':'')
            : (h[4]?h[4]:'')),  // ← prevNavs 为空时回退到 h[4] 纯日期
        ...
    });
}
```

**路径 B — processFund 第 725-743 行**（永远走不到，因为 doRefresh 已过滤已确认基金）：
```javascript
if (todayConfirmed.has(code)) {
    r.source_detail = '净值' + prevNavs[code] + ...;
    return r;
}
```

**关键事实**：`prevNavs` 明确不在确认时更新（第 2142 行注释：`prevNavs 是"前一日参考值"`）。所以：
- 第一次刷新：基金未确认 → 走 `processFund → applyF10Confirmation` → source_detail 正确设置
- 第二次刷新：基金已在 `todayConfirmed` → 走 `doRefresh` 快速路径 → `prevNavs[code]` 为空 → 回退到 `h[4]` = `"2026-05-20"` → `formatSourceDetail` 只匹配到日期 → "5/20"

### 修复：新增 `confirmedNavs` 持久化 map

```javascript
const confirmedNavs = {};  // {code: dwjz} — 已确认净值

// doRefresh 确认时写入
confirmedNavs[f.code] = f.dwjz;

// doRefresh 快速路径优先用 confirmedNavs
source_detail: (prevNavs[h[0]]||confirmedNavs[h[0]]
    ? '净值'+(prevNavs[h[0]]||confirmedNavs[h[0]])+...
    : (h[4]?h[4]:''))

// 持久化
localStorage.setItem('fm_confirmed_navs', JSON.stringify(confirmedNavs));
// loadPrevNavs 中恢复
Object.assign(confirmedNavs, JSON.parse(raw));
// 新交易日清除
for (const k in confirmedNavs) delete confirmedNavs[k];
```

### 调试教训：诊断改错代码路径

之前的诊断版 APK（v3.8-0520ac）只在 `processFund` 路径去掉日期，但第二次刷新走的是 `doRefresh` 路径 → 诊断完全无效。这是典型的"改错代码路径"调试错误。

**原则**：当有两条或多条路径可以处理同一状态时，先确认实际走的是哪条路径，再针对性修改。不要假设。

### 持久化清单（所有新 map 必须完成的事项）

新增任何运行时 map 后，必须完成 5 处修改：
1. **声明** — 全局 `const` 声明
2. **写入** — 在数据产生处赋值（doRefresh 确认块）
3. **持久化** — `savePortfolios` + `doRefresh` 保存块（2 处 localStorage.setItem）
4. **恢复** — `loadPrevNavs` 中 Object.assign
5. **清除** — `doRefresh` 交易日切换 + `init` CLEANUP 块（2 处删除）

### confirmedNavs 死锁陷阱 (v4.0-0524a-cc 修复)

**死锁机制**：`doRefresh` 快速路径 line ~2121 构造 `f.dwjz = prevNavs[code]||confirmedNavs[code]||''`，然后 line ~2190 `if (f.confirmed && f.dwjz)` 才设置 `confirmedNavs[f.code] = f.dwjz`。若 `prevNavs` 和 `confirmedNavs` 都为空 → `f.dwjz=''` → `confirmedNavs` 永远不设置 → 下轮刷新同样死锁。

**症状**：大部分已确认基金的 `source_detail` 只显示日期（如"5/21"）无净值，原因就是两者都空时回退到 `h[4]` 纯日期。

**修复**：在 `loadPortfolios` 恢复 `todayConfirmed` 的同时，从 `h[2]`（持有金额）和 `h[5]`（确认涨跌幅）反推净值：

```javascript
if (restored && !confirmedNavs[h[0]] && !prevNavs[h[0]] && h[2] > 0) {
    confirmedNavs[h[0]] = (h[2] / (1 + (h[5]||0) / 100)).toFixed(4);
}
```

**为什么 `prevNavs` 也会为空**：CLEANUP 删除了 `fundMonitorPrevNavs` localStorage key，如果用户在新版 APK 首次打开后关闭 app 前 `doRefresh` 未完成保存 → `prevNavs` 丢失 → 陷入死锁。

---

## Bug 8: `&& isMarketHours()` 守卫导致非交易时段已确认状态丢失（2026-05-20 修复）

### 症状
「大多数基金昨天的已确认状态和数据没有保留到今天早上开盘前，打开 app 显示的是缓存兜底数据」

### 根因（两处同步 bug）

**Bug 8a: `doRefresh()` 第 1947 行**
```javascript
if (todayConfirmed.has(h[0]) && isMarketHours()) {
```
非交易时段（如早上 9:22），即使基金已通过 `loadPortfolios` 从 h[4] 成功恢复到 `todayConfirmed`，`isMarketHours()`=false → 守卫不触发 → 基金被放入 `unconfirmed` 列表 → 走全流程 `processFund()`。

**Bug 8b: `processFund()` 第 663 行**
```javascript
if (todayConfirmed.has(code) && isMarketHours()) {
```
同样只在交易时段触发。非交易时段已确认基金仍要：
1. 并行拉取 f10/fundgz/ETF（3 路 API）
2. 经过 `applyF10Confirmation` 判断
3. 才能抵达 867 行的非交易时段守卫

中间任何环节出问题（API 超时、f10 数据不对、closingCache 抢先返回）→ 已确认状态丢失。

### 修复（v3.8-0520a）

**两处均移除 `&& isMarketHours()`**，让已确认基金**任何时候**都走快速路径：

```javascript
// doRefresh() — 已确认基金直接构造结果，不进 processFund
if (todayConfirmed.has(h[0])) {  // 去掉 && isMarketHours()
    confirmedFunds.push({...});
}

// processFund() — 已确认基金立即返回，不拉 API
if (todayConfirmed.has(code)) {  // 去掉 && isMarketHours()
    r.confirmed = true;
    r.cur_val = amount * (1 + chgPct / 100);
    ...
    return r;
}
```

### 影响范围
- `doRefresh()` 行 1947：`todayConfirmed.has(h[0]) && isMarketHours()` → `todayConfirmed.has(h[0])`
- `processFund()` 行 663：`todayConfirmed.has(code) && isMarketHours()` → `todayConfirmed.has(code)`
- 注释同步更新：`else` 分支从「非交易时段 or 未确认」→「未确认」

### 教训
1. **`isMarketHours()` 不应出现在已确认守卫中**。已确认状态的职责是「跨时段接力」，加了时段条件就自废武功
2. **同一守卫逻辑在 doRefresh 和 processFund 各写了一遍**，修改时两处都要改，否则一边走快速路径另一边走全流程 → 不一致
3. **非交易时段走全流程 processFund 不仅慢（N 只基金 × 3 API），还会引入 closingCache/f10 兜底等干扰路径**
