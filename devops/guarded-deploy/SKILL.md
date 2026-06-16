---
name: guarded-deploy
description: 主 session（微信 gateway）内 MEDIUM+ 任务统一走子 agent 隔离执行，限制迭代上限。任何预估≥6轮tool call的任务都走 delegate_task。
level: agent
categories:
  - devops
tags: [delegate, safety, iteration-limit, isolation]
---

# Guarded Deploy — 主 session 任务隔离

## 铁律

主 session（微信 gateway）**不得直接执行**以下任务：

| 类别 | 示例 |
|------|------|
| 服务部署 | Docker/apt/npm 安装、服务配置 |
| 构建排错 | 编译失败、依赖缺失、运行时错误 |
| 配置变更 | 防火墙、网络、系统参数修改 |
| 反复试错 | 不确定根因、需要尝试多种方案 |
| 数据批处理 | 批量文件处理、大量 API 调用 |
| 工具链任务 | build APK、构建 exe 等 |

**简单判断法**：如果预估 > 5 次 tool call，必须 delegate。

## 调用模板

```python
delegate_task(
    goal="<明确目标>",
    context="""
环境：绿联NAS Docker容器 /opt/hermes=overlay(重启丢失) /opt/data=持久化
当前状态：<简要说明背景>
预期结果：<描述成功标准>
""",
    toolsets=["terminal", "file", "web"] + (["browser"] if 需要交互页 else []),
    max_iterations=15
)
```

## 主 session 职责清单

| 阶段 | 做什么 | 不做什么 |
|------|--------|----------|
| 接收请求 | 判断任务级别 → MEDIUM+ → 准备 context | 不要直接开始执行 |
| 子 agent 运行时 | 等待结果 | 不要并行干其他事 |
| 后处理 | curl 验证 / 检查进程 / 报告摘要 | 不要深入子 agent 的中间过程 |

## 迭代上限的意义

| 上限 | 适用 | 意义 |
|------|------|------|
| 15 | 一般部署/排查 | 够解决已知模式的故障 |
| 20 | 复杂多步骤 | 涉及多个子系统联动 |
| >20 未返回 | ❌ **停止提问题** | 已有问题，等待结果 |

## 反模式

- ❌ 主 session 里 `terminal()` 连跑 10+ 轮
- ❌ context 写太简略导致子 agent 跑偏
- ❌ 子 agent 失败后主 session 自己接着试（等于白隔离）
- ❌ 忘记设 `max_iterations`（默认 50，太长）
