---
name: agent-anti-stuck
description: 防止 AI 编程 agent（Hermes/Claude Code 等）在 GUI 软件测试、反复试错等场景中陷入死循环/卡死的策略和工具集成方案。
---

# Agent 防卡死策略

## 问题场景

当 Hermes 进行有界面的软件编程（NiceGUI/Streamlit/Android 等）时，经常因为需要进入界面测试、遇到 bug 反复尝试修复，导致 agent 陷入死循环，session 卡死。典型表现：
- 反复调用相同的 tool（如重复 browser_navigate + browser_snapshot）
- 在同一个 bug 上反复尝试相同的修复方案
- GUI 框架的 DOM/WebSocket 问题导致 agent 误判，无限重试

## 核心工具：LoopBuster

**仓库**: https://github.com/liuchunwei732-cmyk/loopbuster
**安装**: `pip install loopbuster`（零硬依赖，核心仅用 stdlib）
**许可证**: MIT

### 检测策略（4 种）

| 策略 | 说明 |
|------|------|
| ExactRepeat | 精确重复检测 — 连续两次 tool call 完全相同 |
| FuzzyRepeat | 模糊重复检测 — Jaccard + 归一化 Levenshtein + 字典结构相似度 |
| CycleDetection | A→B→C→A 循环检测 |
| OutputStagnation | 输出停滞检测 — 多轮无实质性进展 |

### 硬守卫（3 种）

| 守卫 | 说明 |
|------|------|
| BudgetCeiling | 预算上限 — 总 tool call 数超限即终止 |
| RepeatCallGuard | 重复调用次数限制 — 同一 tool+参数 重复 N 次即阻断 |
| StateStasis | 状态无变化检测 — 文件/代码多轮无变化即警告 |

### Circuit Breaker 熔断器

在 tool call 前做预检，返回三种结果：
- `WARN` — 警告但允许执行
- `BLOCK` — 阻止执行
- `SUGGEST_ALTERNATIVE` — 建议替代方案

### MCP 协议支持

LoopBuster 提供 stdio-based MCP server，可作为 sidecar 进程运行，与 Hermes 通过 MCP 通信。这意味着无需修改 Hermes 核心代码即可集成。

## 分层防护策略

| 层级 | 工具 | 作用 |
|------|------|------|
| **L1 内嵌检测** | LoopBuster | 直接在 agent loop 中检测重复/循环/停滞 |
| **L2 调用层熔断** | llmix 或 aura-guard | LLM API 调用层 circuit breaker + 重试控制 |
| **L3 策略治理** | microsoft/agent-governance-toolkit | 全局策略（max iterations、超时、沙箱边界） |
| **L4 外部监控** | claudewatch 或 coze-loop | 旁路监控 + 异常告警 + 诊断 |

## 其他相关项目

| 项目 | Star | 亮点 |
|------|------|------|
| microsoft/agent-governance-toolkit | 4.4k | 微软官方，策略引擎 + 执行沙箱 |
| NVIDIA-NeMo/Guardrails | 6.5k | 对话流控制防无限循环 |
| guardrails-ai/guardrails | 7.0k | LLM 输出验证框架 |
| sno-ai/llmix | 129 | 内置 Circuit Breaker + 重试 + 缓存 |
| auraguardhq/aura-guard | 7 | 专为 agent tool call 设计的幂等性 + 循环检测 |
| blackwell-systems/claudewatch | 7 | Claude Code 专用 AgentOps，实时错误循环检测 |
| coze-dev/coze-loop | 5.5k | 全生命周期 Agent 可观测性平台 |

## 最小可行集成（MVP）

```python
# 在 Hermes agent loop 中插入 LoopBuster 检测
from loopbuster import LoopBuster, RepeatCallGuard, BudgetCeiling

buster = LoopBuster(
    guards=[
        RepeatCallGuard(max_repeats=3),      # 同一调用重复3次即阻断
        BudgetCeiling(max_calls=50),          # 总调用上限50次
    ],
    strategies=["exact_repeat", "fuzzy_repeat", "cycle_detection"],
)

# 每次 tool call 前检测
result = buster.check(tool_name, tool_params)
if result.action == "BLOCK":
    raise AgentStuckError(f"检测到死循环: {result.reason}")
```

## 现有 Hermes 防护机制

Hermes 已有的防卡死措施（memory 中记录）：
- `delegate_task(max_iterations=15)` — 子 agent 限制迭代上限
- `fix_stuck_conversations.py` — cron 每 10min 自动解卡杀僵尸 ACP
- `guarded-deploy` skill — MEDIUM+ 任务走子 agent 隔离

LoopBuster 可作为这些机制的**内嵌补充**，在 agent loop 内部实时检测，而非依赖外部 cron 事后清理。
