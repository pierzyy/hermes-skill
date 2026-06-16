---
name: hermes-model-routing-tags
description: Hermes 智能模型路由（model_pairs 配对 + 7维打分）+ 回复自动标签 —— 按主力模型自动匹配便宜模型，每句回复前自动显示当前使用的模型全称
category: hermes
---

# Hermes 智能模型路由 + 模型标签

## 功能概述

1. **智能模型路由**：7 维度加权打分，分 SIMPLE/MEDIUM/COMPLEX 三层，自动将简单消息分流到便宜模型（flash），复杂任务走主力模型（pro）。支持按主力模型配对（不同主力→不同便宜），`model_pairs` 优先，`cheap_model` 兜底。
2. **模型标签**：每句回复独占一行显示当前模型全称（如 `[deepseek-v4-pro]`），标签由路由系统注入 ephemeral prompt，反映真实使用的模型。

## 配置文件（/opt/data/config.yaml）

```yaml
smart_model_routing:
  enabled: true
  mode: scoring              # "scoring" (推荐) or "binary" (legacy)
  model_pairs:               # 按主力模型配对（优先）
    - primary: deepseek-v4-pro
      cheap:
        provider: deepseek
        model: deepseek-v4-flash
    - primary: mimo-v2.5-pro
      cheap:
        provider: xiaomi
        model: mimo-v2.5
  cheap_model:               # 兜底（model_pairs 未匹配时）
    provider: deepseek
    model: deepseek-v4-flash
  scoring:
    tiers:
      simple: 0.15           # score < 0.15 → cheap
      medium: 0.15           # score >= 0.15 → medium (see medium_policy)
      complex: 0.35          # score >= 0.35 → strong
    medium_policy: strong    # "cheap" or "strong" — strong=MEDIUM走pro
```

## 7维度打分体系

每个维度独立判断，累加 0-1 复杂度分数：

| # | 维度 | 条件 | 加减分 |
|---|------|------|--------|
| 1 | 长度 | <15字（且无工具词） | -0.15 |
|   |      | <15字（有操作类工具词命中） | 0（取消惩罚） |
|   |      | 200-400字 | +0.10 |
|   |      | >400字 | +0.20 |
| 2 | 代码/技术词 | 代码块 (```) | +0.30 |
|   |      | 技术术语（架构/并发/算法/加密/function/class/api等） | +0.20 |
| 3 | 推理标记 | 一步步/分析/思考/推理/step by step/analyze等 | +0.20~0.35 |
| 4 | 简单标记 | 你好/什么是/hello/谢谢/翻译 | -0.25 |
| 5 | 多步模式 | 首先…然后/步骤1/first…then/流程/方案 | +0.20 |
| 6 | 工具操作词 | 仅明确操作动作：启动/停止/重启/部署/构建/安装/删除/迁移/备份/升级/kill/git/docker等（不含查询/查看类词） | +0.15~0.25 |
| 7 | 追问复杂度 | 多个问号（2+ ???） | +0.15 |

**分层**：
- 0.00 ~ 0.15 → SIMPLE → cheap 模型（flash）
- 0.15 ~ 0.35 → MEDIUM → strong 模型（pro）
- 0.35 ~ 1.00 → COMPLEX → strong 模型（pro）

## 模型标签

标签使用模型全称，实现为 `_model_to_tag()` 静态方法：

```python
@staticmethod
def _model_to_tag(model_name: str) -> str:
    short = model_name.split("/")[-1]  # 去掉 provider 前缀
    return f"[{short}]"
```

输出格式：标签独占一行，无冒号，空一行再接回复内容。

标签指令已强化为【强制】中文硬指令（2026-05-30）：
「你的回复第一行必须是 '[标签]'（只写标签，不要冒号和其他内容）。这个标签不可省略、不可修改、不可解释。违者视为错误。」

注意：微信客户端会吞掉 `[标签]:`（带冒号）格式，所以**禁止使用冒号**。纯方括号格式在微信上正常显示。

## 架构说明

### 路由层（agent/smart_model_routing.py）
- `_compute_complexity_score(text)` — 7维度加权打分
- `_classify_tier(score, cfg)` — 分 SIMPLE/MEDIUM/COMPLEX
- `_resolve_cheap_model(cfg, current_model)` — 先查 model_pairs，再 fallback cheap_model
- `choose_cheap_model_route(user_message, cfg, current_model)` — 主函数，根据 mode 调用 binary 或 scoring
- `resolve_turn_route(user_message, cfg, primary)` — 完整 turn 解析

### Gateway 层（gateway/run.py）
- `_load_smart_model_routing()` — 每轮从 config.yaml 重新读取
- `_model_to_tag()` — 模型名→标签
- 主消息流：路由解析 → 标签注入 `combined_ephemeral` → AIAgent 创建

### CLI 层（cli.py）\n- `_model_to_tag()` — 同 gateway 的映射\n- `_resolve_turn_agent_config()` — 返回 route 附带 `model_tag`\n- `_init_agent()` — 接收 `model_tag`，注入 ephemeral system prompt\n\n### Cron 层（cron/scheduler.py）\n- `run_job()` 中在 `resolve_turn_route()` 之后直接计算标签\n- 注入方式：将标签指令传给 AIAgent 的 `ephemeral_system_prompt` 参数\n- 代码位置：line 718-725（在 turn_route 解析之后、fallback_model 之前）\n- `_cron_model_name = turn_route.get(\"model\", \"\")`\n- `_cron_model_tag = f\"[{_cron_model_name.split('/')[-1]}]\"`\n- 注意：cron 没有独立的 `_model_to_tag()` 方法，直接 inline 计算\n- 2026-05-30 补上：之前 cron 一直缺少标签注入，所有保活任务的回复都没有模型标签

### ACP/AionUi 层（acp_adapter/）

**标签注入**（`session.py`）：
- `_model_to_tag()` — 模块级函数，模型名→标签
- `_make_agent()` — 创建 AIAgent 时读取 `smart_model_routing` 配置，构建标签指令，注入 `ephemeral_system_prompt`

**每轮路由**（`session.py` + `server.py`）：
- `SessionManager.reroute_agent(state, target_model)` — 重建 agent 为新模型，保留对话历史
- `HermesACPAgent._apply_turn_routing(user_text, state)` — 每轮 prompt 前计算复杂度评分，决定切 flash 还是 pro
- 简单→切 cheap，复杂→切 strong，中等→按 `medium_policy` 决定
- 从 flash 切回 pro 时，通过 `model_pairs` 反查 primary 模型

**重启**：ACP adapter 代码改动后需重启 AionUi：
```bash
pkill -9 -f aioncore; pkill -9 -f "hermes acp"
nohup /opt/data/aionui-web-standalone/aionui-web start --remote --port 25808 &
# AionUi 重启后 admin 密码变随机 hash，需 bcrypt 重设为 admin123
python3 -c "
import bcrypt, sqlite3
pw = bcrypt.hashpw(b'admin123', bcrypt.gensalt())
conn = sqlite3.connect('/opt/data/home/.aionui-web/aionui-backend.db')
conn.execute('UPDATE users SET password_hash = ? WHERE username = ?', (pw.decode(), 'admin'))
conn.commit()
"

## 添加新模型

1. `config.yaml` 的 `providers.xxx.models` 加入新模型
2. `config.yaml` 的 `model_pairs` 加入新配对
3. 标签自动使用模型全称，无需额外配置
4. 无需重启（gateway 每轮重读配置）

## 调优

- 路由过于激进：提高 `tiers.simple` / `tiers.medium` / `tiers.complex` 阈值
- 路由过于保守：降低阈值
- medium 层不想走 cheap：设 `medium_policy: strong`
- 切换回旧版：`mode: binary`

## 测试

```bash
cd /opt/hermes
.venv/bin/python -m pytest tests/agent/test_smart_model_routing.py tests/agent/test_credential_pool_routing.py -v
```
