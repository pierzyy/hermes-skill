---
name: decomposition-pipeline
title: Pro 规划 + Flash 执行分解管线
description: 复杂任务由 pro 模型分解为 JSON 子任务计划 → flash 模型逐条或批量执行子任务 → 汇总结果。pro 只花一次高质量 token 做规划，flash 低成本批量执行，大幅降低复杂任务的总 token 消耗。
tags: [task-decomposition, pro-flash, cost-optimization, pipeline, orchestration]
---

# Decomposition Pipeline — Pro 规划 + Flash 执行

## 核心思想

| 角色 | 模型 | 做什么 | Token 策略 |
|------|------|--------|------------|
| **规划者** | pro | 分析任务 → 输出 JSON 子任务列表 | **只花一次** pro token，质量高 |
| **执行者** | flash | 逐条或批量执行子任务 | **低成本** 批量跑，省大钱 |
| **汇总者** | flash | 合并子任务结果 → 最终输出 | **一次** flash 汇总 |

## 触发条件

同时满足以下条件时适合走分解管线：

- [x] 任务复杂（需要 5+ 个子步骤）
- [x] 子步骤之间**无强依赖**（可并行或串行但不依赖彼此的中间结果）
- [x] 子步骤类型统一（全是爬数据 / 全是文件操作 / 全是 API 调用）
- [x] 有明确的"完成标准"可逐条判断

**不适合**：
- 子步骤强依赖前一步中间结果（← 这种走单线 agent）
- 任务非常简单（< 3 步 → 直接做就行）
- 需要用户交互确认的步骤

## 标准流程

### Step 1: Pro 规划（主 session）

收到复杂任务后，先用 pro 模型（或在 context 中用 system prompt 指示）进行分析：

```
分析任务："当前要做什么"

要求输出以下 JSON 格式的计划：

{
  "analysis": "任务简要分析，判断是否适合分解",
  "subtasks": [
    {
      "id": "step-1",
      "goal": "子任务目标描述",
      "independent": true,
      "toolsets": ["terminal", "web"]
    },
    {
      "id": "step-2",
      "goal": "子任务目标描述",
      "dependent_on": ["step-1"],  // 有依赖才填
      "toolsets": ["terminal", "file"]
    }
  ],
  "fallback": "如果某步失败，整体降级方案"
}
```

### Step 2: Flash 执行（子 agent）

遍历 subtasks，对每个 independent=true 的子任务：

```python
# 批量模式（无依赖，并行）
delegate_task(
    tasks=[
        {"goal": subtask1, "context": "...", "toolsets": [...]},
        {"goal": subtask2, "context": "...", "toolsets": [...]},
        {"goal": subtask3, "context": "...", "toolsets": [...]},
    ],
    max_iterations=15
)

# 串行模式（有依赖，逐个）
results = []
for subtask in plan["subtasks"]:
    result = delegate_task(
        goal=subtask["goal"],
        context=f"... 前置结果: {results[-1] if subtask.get('dependent_on') else '无'}",
        toolsets=subtask["toolsets"],
        max_iterations=15
    )
    results.append(result)
```

### Step 3: Flash 汇总

收集所有子任务结果，用 flash 模型做一次汇总：

```
汇总要求：
1. 列出每个子任务的结果状态（成功/失败/部分成功）
2. 提取关键数据合并
3. 判断整体任务是否成功
4. 输出最终答案（用户可以理解的形式）
```

## 实战案例

### 案例 1: FundMonitor 基金数据刷新

```
pro 规划 →
{
  "subtasks": [
    {"id": "fetch-f10",  "goal": "从东方财富查所有基金净值", "independent": true},
    {"id": "fetch-fundgz", "goal": "从天天基金估实时估值", "independent": true},
    {"id": "fetch-qdii", "goal": "从QDII代理拉ETF实时价", "independent": true}
  ]
}

flash 执行 → 3 个 delegate_task 并行
flash 汇总 → 合并三个数据源，更新 UI 显示
```

### 案例 2: 基金日报完整流水线

```
pro 规划 →
{
  "subtasks": [
    {"id": "csv-parse",       "goal": "解析最新CSV获取持仓", "toolsets": ["file"]},
    {"id": "fund-check",      "goal": "巡检基金申购/经理变更", "toolsets": ["web"]},
    {"id": "macro-data",      "goal": "获取今日宏观指标", "toolsets": ["web"]},
    {"id": "sector-outlook",  "goal": "子行业研判", "toolsets": ["web"]},
    {"id": "operation-advice","goal": "操作建议", "toolsets": ["web"]},
    {"id": "render-image",    "goal": "生成PNG长图", "toolsets": ["terminal", "file"]}
  ]
}

flash 执行 → 前 4 个并行，第 5 个依赖前 4 的结果，第 6 个最后
flash 汇总 → 渲染完成 ✅ 日报已生成
```

## 与 Guarded Deploy 的关系

| | Guarded Deploy | Decomposition Pipeline |
|---|---|---|
| 解决什么问题 | 主 session 不死循环 | token 性价比最大化 |
| 核心手段 | delegate_task 隔离 | pro 规划 + flash 执行 |
| 适用场景 | 任何 MEDIUM+ 任务 | 复杂=5步+的任务 |
| 模型选择 | 不限定（子 agent 用默认模型） | **必须** pro 规划、flash 执行 |
| 组合使用 | 两者叠加：主 session pro 分解 → delegate_task flash 执行 | |

## 坑 & 经验教训

### 🔥 JSON 格式稳定性
- pro 模型输出 JSON 可能有格式问题（少逗号、单引号代替双引号）
- ✅ 使用 `json.loads()` 加上 `strict=False` 兜底
- ✅ 极端情况加一层正则修复：`re.sub(r"'([^']*)'", r'"\1"', text)`

### 🔥 子任务粒度
- 太细（每步 1 个工具调用）→ overhead 大于收益
- 太粗（每步 10+ 工具调用）→ 又回到了单 agent 模式
- ✅ 最佳粒度：每个子任务 3-8 个工具调用

### 🔥 依赖管理
- 有强依赖的子任务强行并行 → 失败
- ✅ `dependent_on` 字段必须严格执行，有依赖就串行
- ✅ 整体执行时间 ≈ 最长依赖链（不是子任务总数）

### 🔥 超时控制
- 批量 delegate_task 任一任务超时会影响整体
- ✅ 每个子任务设 `max_iterations=15`（别默认 50）
- ✅ 汇总时标注哪些子任务超时/失败，不全盘放弃

### 🔥 context 体积
- pro 规划的 context 传到 flash 时不必要带全部
- ✅ 每个子任务的 context 只传它需要的部分
- ✅ 汇总时只传结果摘要（不传完整中间数据）

## 验证方法

任务完成后检查：

1. 是否所有子任务都有明确结果（成功/失败）
2. 汇总是否正确合并了关键数据
3. 总 token 消耗是否显著低于全部走 pro 的单线方案
4. 如果有子任务失败，fallback 是否生效

简单对比：
```
全部走 pro:
  1次规划 + N次执行 = (1 + N) × pro单价

分解管线:
  1次pro规划 + N次flash执行 + 1次flash汇总
  = 1×pro + (N+1)×flash
  ≈ (N+1) × flash单价（当 N 较大时 pro 占比可忽略）

典型收益：N=5 → 节约 60-75%
```
