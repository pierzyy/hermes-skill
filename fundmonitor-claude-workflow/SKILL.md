---
name: fundmonitor-claude-workflow
description: FundMonitor 通过 Claude Code 委托开发的完整流程 — 严格在 dev worktree 修改，禁止直接 patch master。版本号需同步四处：build.gradle.kts(versionName)、index.html(title)、index.html(.ver span)、build.gradle.kts(versionCode) — 独立工作区、分阶段实时汇报、版本命名、CLEANUP_VERSION bump 陷阱、merge 冲突处理。用户要求所有 FundMonitor 开发由 Claude Code 完成。
version: 1.0.0
tags: [fundmonitor, claude-code, delegate, workflow, cleanup-version, wechat-progress]
---

# FundMonitor Claude Code 委托开发流程

## 原则

- **所有 FundMonitor 开发由 Claude Code 完成**，不在 Hermes 直接改代码
- 唯一项目 `/opt/data/FundMonitor-claude`（原 FundMonitorNative 已删除，此为唯一工作区）

## 工作区（git worktree 双区架构）

**严格禁止直接在 master 改代码。所有修改必须在 dev worktree 完成。**

| 目录 | 分支 | 用途 |
|------|------|------|
| `/opt/data/FundMonitor-claude/` | master | 构建 APK 的唯一源 |
| `/opt/data/FundMonitor-claude-dev/` | dev | Claude Code 在此修改代码 |
| `/opt/data/scripts/test_fund_monitor.js` | — | 共享测试脚本 |
| `/opt/data/FundMonitor.apk` | — | 最终 APK 输出 |

**标准流程**（每步标注所在目录）：
1. 📁 dev — Claude Code 在 dev worktree 改代码
2. ✅ dev — 语法校验（`vm.Script` 编译内联 JS）
3. 📝 dev — `git add + commit`
4. 🔀 master — `git merge dev`（在 master worktree 执行）
5. 🔨 master — `./gradlew assembleDebug`
6. 📤 — `cp` APK + MEDIA 发送

**不可跳过任何步骤。Hermes 不可直接用 patch/terminal 改代码**（除非用户明确允许紧急修复）。

### Merge 冲突处理

**常见冲突源：** master 被独立 version-bumped（如直接 commit 了 `v4.0-0525h-cc`），而 dev 有代码改动的版本号是 `v4.0-0526a-cc`。此时 `git merge dev` 必然在 `build.gradle.kts` 和 `index.html` 的版本行上冲突。

**标准解法：** dev 是代码改动的唯一源，冲突时接受 dev 版本。

```bash
cd /opt/data/FundMonitor-claude
git checkout --theirs app/build.gradle.kts app/src/main/assets/index.html
git add app/build.gradle.kts app/src/main/assets/index.html
git commit -m "Merge dev: <简短描述>"
```

**不要手动编辑冲突标记——** `git checkout --theirs` 一次性解决所有冲突行，更快且不出错。

## 委托命令

```javascript
delegate_task({
  acp_command: 'claude',
  goal: '完整任务描述',
  context: '工作区路径、需改的文件、约束条件、CSS变量等',
  max_iterations: 50-100
})
```

## 版本命名与同步

- 格式：`大版本.日期-字母-cc`，如 `4.0-0522f-cc`
- `-cc` 后缀标识 Claude Code 构建
- versionCode：4.x 从 100 起，每次构建 +1

**⚠️ 版本号必须同步四处，缺一不可：**

| 位置 | 字段 | 示例 |
|------|------|------|
| `build.gradle.kts` | `versionName` | `"4.0-0522f-cc"` |
| `index.html` | `<title>` | `Fund Monitor v4.0-0522f-cc` |
| `index.html` | topbar `.ver` span (HTML body L1163) | `v4.0-0522f-cc` |
| `build.gradle.kts` | `versionCode` | `105` |

**关键陷阱：** topbar `.ver` span 容易被遗漏——它是 HTML body 中的硬编码字符串，必须手动 grep 确认。历史问题：v4.0-0525g-cc 的 `<title>` 是 `0525g`，但 `.ver` span 仍然是 `0522f`（落后三个版本未更新）。每次改版本号后用 `search_files(pattern='v4\\.0-')` 确认所有四处一致。

## 分阶段实时汇报

委托 Claude Code 后，向用户发送微信进度：

1. 🟢 启动阶段 — "Claude 已启动，正在读取文件…"
2. 📊 定位阶段 — "已定位：CSS line 263、JS line 2118"
3. 🔧 修改阶段 — "Claude 已完成修改…"
4. 🧪 测试阶段 — "测试通过 196/196 ✅"
5. 🔨 构建阶段 — "构建成功"
6. 📤 发送阶段 — MEDIA 标签单独一行

## ⚠️ 关键陷阱：h[6] nav_date 自循环（v4.0-0530a-cc 修复）

**根因**: doRefresh 快速路径中 `nav_date: h[6]||navDateMap[h[0]]||''`（line ~2231），而 post-processing 又 `var nd = f.nav_date || navDateMap[f.code]` → `h[6] = nd`。`f.nav_date` 等于 `h[6]`，形成死循环 — h[6] 首次确认后永不更新。

**症状**: 数据源显示 "东方财富 + 净值X.XXXX (滞后日期)"，日期比实际净值日期晚一天，但盈亏/涨跌幅正确。

**修复模式**（两处修改）:
1. 快速路径 push 前：`var effNavDate = (fundGzChg !== undefined) ? getTradingDate() : (h[6]||navDateMap[h[0]]||'')` — 有新鲜 fundgz 时用今天，无 fundgz（QDII）保留旧值
2. 后处理：`if ((!nd || nd !== getTradingDate()) && fundGzToday && fundGzToday[f.code] !== undefined) { nd = getTradingDate(); navDateMap[f.code] = nd; }` — 补刀更新

**适用场景**: 任何 h[i] 字段在快速路径 push 对象中被赋值为 `h[i]` 自身，然后 post-processing 又通过 push 对象字段写回 `h[i]` 的闭环模式。

## ⚠️ 关键陷阱：CLEANUP_VERSION bump

**每次修改确认逻辑或 h[2] 滚动逻辑，必须 bump CLEANUP_VERSION。**

原因：如果旧 APK 已持久化 `fm_cleanup_v='14'`，新 APK 不 bump 的话 CLEANUP 不会执行 → 脏数据残留 → 修改不生效。

```javascript
// ❌ 死路 — 用户已安装过 v14
var CLEANUP_VERSION = '14';

// ✅ 正确 — bump 到 '15'
var CLEANUP_VERSION = '15';
```

## h[2] 滚动逻辑（v4.0-0527c-cc+ 终态）

**v4.0-0527c-cc 关键变更: h[2] 滚动不再清零 h[5]。**

```javascript
// 滚动条件：h[2] 更新为最新市值，h[5] 保留已确认涨跌幅
if (isAfterMarketClose() && lastRolledDate[f.code] !== today && Math.abs(h[2] - f.cur_val) > 0.005) {
    h[2] = Math.round(f.cur_val * 100) / 100;
    lastRolledDate[f.code] = today;  // 持久化，锁定到次日
    // h[5] 不再清零 — 保留 confirmedChgPct 供后续刷新
}
```

**变更原因**: 旧逻辑在滚动时 `h[5]=0` → `confirmedChgPct=0` → 下次 doRefresh 快速路径得出 chgPct=0 → QDII 确认后仍显示 0% 涨跌。新逻辑保留 h[5]，让 confirmedChgPct 可复用。

**配合变更**: doRefresh 快速路径新增 `confirmedChgPct=0` 回退 — 当 ccp 为 0 且 fundgz 无数据时，不回显 0%，而是送回 processFund 获取实时数据。

**设计保证：**
- 当天收盘后首次确认 → `lastRolledDate[code]` 为空或昨日 → ≠ today → 滚 ✅
- 当天二次刷新 → `lastRolledDate[code] === today` → 不滚 ✅
- 次日早 7:23 → `getTradingDate()` 返回昨日 → `today`=昨日 → `lastRolledDate`=昨日 → 不滚 ✅
- 次日收盘后 → `today`=次日 → `lastRolledDate`=昨日 → ≠ → 滚 ✅
- 手动编辑 h[2] → 不影响 lastRolledDate（正交）✅

**CLEANUP_VERSION '28'：** 清除所有基金的 h[5] 和 lastRolledDate，强制从零开始避免旧持久化的 h[5]=0 脏数据自循环。

## 备份

```bash
# 重大修改前
BACKUP_DIR=/opt/data/FundMonitor-backup-$(date +%Y%m%d-%H%M)
mkdir -p "$BACKUP_DIR"
cp /opt/data/FundMonitor.apk "$BACKUP_DIR/"
cp -r /opt/data/FundMonitor-claude "$BACKUP_DIR/"
```

## MEDIA 发送

APK 发送必须用 `send_message` 且 MEDIA 标签**单独一行**，否则微信不识别。

## 测试（统一 Test Bench v2）

**测试文件已重构为统一 test bench 架构。** 通过 `vm.Script` 加载真实 `index.html`，测试只提供"激励"（时间、API mock、持仓数据），调用真实 `processFund()` / `loadPortfolios()` 断言输出。不再维护影子代码。

```bash
# 全量测试（134 项：19 基础 + 105 全周 + 9 CSV + 1 语法）
cd /opt/data/scripts && node test_fund_monitor.js --all

# 快速单项
node test_fund_monitor.js --unit       # 19 项 processFund 基础测试
node test_fund_monitor.js --fullweek   # 105 项全周模拟（22 时间点 × 3 类型）
node test_fund_monitor.js --syntax     # JS 语法校验
```

**`--fullweek` 覆盖**: 模拟周一 9:30 到下周一的 22 个时间点，3 只代表基金（国内 delay=0 / QDII delay=1 / FOF delay=3），验证 h[2] 滚动、确认状态接力、跨周末保持、快速路径回退。

**测试架构核心优势**：修改 `processFund` / `loadPortfolios` 等生产逻辑后，不需要同步任何测试代码——test bench 自动使用最新版本。

**测试必须 100% 通过才能发 APK。**

## 调试教训：不同基金类型表现差异是定位根因的钥匙

v4.0-0526c-cc 的 stale fundgz 漏洞是由用户的精确观察定位的：

> "大多数QDII的h2累加好像是正确的，大多数国内基金债券的h2累加是不正确的"

**为什么 QDII 对、国内错？** 逐条对比两类的数据路径：
- QDII → `fetchFundData` 被 `QDII_NO_FUNDGZ` 拦截 → 返回空 → chgPct=0 → 碰巧正确
- 国内 → `fetchFundData` 返回昨天的 fundgz (gszzl=2.0, gztime=昨天15:00) → chgPct=2.0 → 双倍

**教训**: 当不同基金类型表现不一致时，不要先改代码。先对比两类基金的完整数据路径差异，差异点就是根因所在。这次三类差异（QDII有/无fundgz、delay值、ETF映射）全部排查后，只有 fundgz 拉取路径在不检查新鲜度时会引入脏数据。

## ⚠️ 关键陷阱：processFund 短接陷阱（ccp=0 回退）

**场景**: QDII 导入 CSV 后 `h[5]=0`（滚后归零）→ loadPortfolios 恢复 `todayConfirmed` + `confirmedChgPct=0` → doRefresh 快速路径 `ccp=0` → `chgPct=null` → 送回 processFund。

**陷阱**: processFund 检测到 `todayConfirmed.has(code)` 后**直接使用 confirmedChgPct[code]=0**，完全不经过 ETF 数据路径。这是正确的生产行为（ccp=0 表示无新鲜数据），但对于测试场景需要特殊处理：清除 tc 中的该代码，让 processFund 走正常 ETF 路径获取实时涨跌幅。

**测试验证**: 新增 `runCsvImportTest()`（`--csvimport` 模式）测试此路径。断言 QDII 的三层恢复、ccp=0 检测、ETF 回退、chgPct≠0、gain≠0。

## h[2] 滚动逻辑（v4.0-0527c-cc+ 终态）

**v4.0-0527c-cc 关键变更: h[2] 滚动不再清零 h[5]。**

```javascript
// 滚动条件：h[2] 更新为最新市值，h[5] 保留已确认涨跌幅
if (isAfterMarketClose() && lastRolledDate[f.code] !== today && Math.abs(h[2] - f.cur_val) > 0.005) {
    h[2] = Math.round(f.cur_val * 100) / 100;
    lastRolledDate[f.code] = today;  // 持久化，锁定到次日
    // h[5] 不再清零 — 保留 confirmedChgPct 供后续刷新
}
```

**变更原因**: 旧逻辑在滚动时 `h[5]=0` → `confirmedChgPct=0` → 下次 doRefresh 快速路径得出 chgPct=0 → QDII 确认后仍显示 0% 涨跌。新逻辑保留 h[5]，让 confirmedChgPct 可复用。

**配合变更**: doRefresh 快速路径新增 `confirmedChgPct=0` 回退 — 当 ccp 为 0 且 fundgz 无数据时，不回显 0%，而是送回 processFund 获取实时数据。
