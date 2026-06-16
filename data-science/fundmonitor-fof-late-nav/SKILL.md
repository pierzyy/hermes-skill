---
name: fundmonitor-fof-late-nav
description: FundMonitor FOF/养老基金净值确认兜底 — 针对净值发布晚2-3天的FOF基金的特殊处理，同时防止误伤正常国内基金
version: 1.0.0
tags: [fundmonitor, fof, nav, confirmation, bug-fix]
---

# FundMonitor FOF 基金净值确认兜底

## 背景

养老FOF基金（如 017253、017242）的东方财富 f10 官方净值发布日期比正常基金晚 2-3 天。正常基金当天晚上就能拿到 `jzrq >= 今天` 的净值，但 FOF 需要等到次日甚至第三日。这导致 `applyF10Confirmation` 的国内 Path A（`jzrq >= 今天日历日`）对 FOF 永远不成立。

## 022463 误伤案例

加的FOF兜底（`JZZZL≠0→确认`）被错误设为全局生效，导致正常国内基金（022463 易方达上证科创50联接C）在15:00-16:00（f10还在前一天数据，JZZZL=+1.75%）被误确认成昨天的涨跌幅。

## 解决方案

### 1. FOF 识别

```javascript
function isFOF(fundName) {
  return /FOF|养老|目标日期|目标风险/.test(fundName);
}
```

### 2. applyF10Confirmation Path A — 仅 FOF 用 JZZZL 兜底

Path A 末尾，`jzrq >= 今天` 判定之后，**仅对 isFOF 返回 true 的基金**加兜底：

```javascript
if (isFOF(fundName) && f10.JZZZL && parseFloat(f10.JZZZL) !== 0) {
  h[5] = f10.chgPct;
  h[4] = today;
  // prevNavs 写入等
}
```

### 3. processFund 非交易时段 — todayConfirmed 守卫 + f10 兜底

两处都需要名称判定限定为仅 FOF：

| 位置 | 问题 | 修复 |
|------|------|------|
| applyF10Confirmation Path A 末尾 | JZZZL≠0 全局兜底 | 加 `isFOF()` 判断 |
| processFund todayConfirmed 守卫 | 同样的 JZZZL 兜底 | 加 `isFOF()` 判断 |

### 4. 核心原则

- **正常国内基金**：必须等 `jzrq >= 今天` 才确认，期间用 fundgz 估值过渡
- **FOF 基金**：可特殊处理，JZZZL 有效即确认
- **QDII 基金**：不受此逻辑影响（走独立的时间窗口确认）

## 验证

1. 清空缓存后确认 022463 非交易时段涨跌幅=fundgz 估值（约 -0.20%），不走 JZZZL 兜底
2. 017253/017242 在 JZZZL 有效时仍能正确确认
3. 正常国内基金（110011等）jzrq<今天时显示 fundgz 估值
