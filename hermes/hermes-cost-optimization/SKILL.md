---
name: hermes-cost-optimization
description: 5-step Hermes 模型使用成本优化方案——降低 LLM API 费用而不显著影响体验。覆盖默认模型切换、路由阈值调优、max_tokens 限制、对话历史压缩、辅助任务降级。
category: hermes
---

# Hermes 成本优化方案

## 触发条件

当用户反映模型成本太高，或想在不降低体验的前提下节省 API 费用时使用。

## 五步优化方案

### 方案一：默认模型 flash + 反向升级

**核心思路**：将默认模型从 pro 改为 flash（便宜模型），同时增加反向升级逻辑——当消息被智能路由判定为 complex 时自动升级到 pro。

**改动文件**：

1. **`/opt/data/config.yaml`** — 改默认模型
   ```yaml
   smart_model_routing:
     default: deepseek-v4-flash  # 原来是 deepseek-v4-pro
   ```

2. **`/opt/hermes/agent/smart_model_routing.py`** — 新增 `_resolve_strong_model()`
   
   在 `resolve_turn_route()` 函数中，当 `if not route`（智能路由不干涉）时，检查当前默认模型是不是便宜模型。如果是，调用 `_resolve_strong_model()` 反向查找对应的强模型：
   
   ```python
   # 新增函数
   def _resolve_strong_model(model: str, config: dict) -> str:
       """When default is a cheap model, find the corresponding strong model via model_pairs."""
       model_pairs = config.get("smart_model_routing", {}).get("model_pairs", {})
       for strong, cheap in model_pairs.items():
           if cheap == model:
               return strong
       # fallback: try to extrapolate (e.g., flash -> pro)
       if "flash" in model:
           return model.replace("flash", "pro")
       return model
   ```
   
   在 `if not route:` 分支调用：
   ```python
   if not route:
       # 默认模型是便宜模型时，检查是否需要反向升级
       if score is not None and score >= complex_threshold:
           strong_model = _resolve_strong_model(default_model, config)
           if strong_model != default_model:
               route = {
                   "model": strong_model,
                   "reason": f"complex({score:.2f}>={complex_threshold}) => upgraded to {strong_model}",
                   "source": "escalation"
               }
   ```

### 方案二：调高 complex 阈值

**核心思路**：提高判定为"复杂"的阈值，让更多中等难度任务（日常技术排查等）走便宜模型。

**改动文件**：**`/opt/data/config.yaml`**

```yaml
smart_model_routing:
  thresholds:
    simple_cutoff: 0.15     # 不变
    medium_cutoff: 0.30     # 不变
    complex_cutoff: 0.40    # 原 0.35 → 0.40
  medium_policy: cheap      # 不变
```

**验证**：这个配置不需要重启 AionUi，gateway 每轮重读 config 即时生效。

### 方案三：限制 max_tokens

**核心思路**：给所有 API 调用设输出 token 上限，避免单次超长回复浪费 token。

**改动文件**：

1. **`/opt/data/config.yaml`** — provider 层级加 max_tokens
   ```yaml
   providers:
     opencode-go:
       api_key: "xxx"
       base_url: "https://opencode.ai/zen/go/v1"
       max_tokens: 4096  # 新增
   ```

2. **`/opt/hermes/agent/smart_model_routing.py`** — 路由层 4 个 runtime dict 传递 max_tokens
   
   在所有 resolve_turn_route() 返回的 dict 中加：
   ```python
   runtime.update({"max_tokens": provider_cfg.get("max_tokens", 4096)})
   ```

3. **`/opt/hermes/gateway/run.py`** — primary dict 加 max_tokens
   ```python
   "primary": {
       "api_key": cfg["providers"][provider]["api_key"],
       "max_tokens": cfg["providers"][provider].get("max_tokens", 4096),
       ...
   }
   ```

4. **`/opt/hermes/cli.py`** — 同上

5. **`/opt/hermes/cron/scheduler.py`** — primary dict + AIAgent 手动传参

6. **`/opt/hermes/acp_adapter/session.py`** — AIAgent kwargs 加 max_tokens

### 方案四：降低 max_turns + 历史压缩调优

**核心思路**：减少每轮对话最大工具调用次数，调优上下文压缩参数更早、更激进地压缩。

**改动文件**：**`/opt/data/config.yaml`**

```yaml
agent:
  max_turns: 30                    # 原 90
  compression:
    enabled: true
    model: deepseek-v4-flash       # 强制走 flash
    threshold: 0.30                # 原 0.50（默认），上下文使用30%就开始压缩
    protect_last_n: 10             # 原 20（默认），只保留最近10条
    target_ratio: 0.15             # 原 0.20（默认），摘要更精炼
```

**注意**：`agent.max_turns` 在 gateway 启动时映射为 `HERMES_MAX_ITERATIONS` 环境变量，改后需重启 AionUi。

### 方案五：辅助任务强制走 flash

**核心思路**：vision/web_extract/session_search/compression 等后台辅助任务不需要 pro 的推理能力，全部强制走 flash。

**改动文件**：**`/opt/data/config.yaml`**

```yaml
auxiliary:
  compression:
    model: deepseek-v4-flash       # 强制 flash
    api_key: ""                    # 留空自动继承 provider 的 key
    base_url: "https://opencode.ai/zen/go/v1"
  vision:
    model: deepseek-v4-flash
    api_key: ""
    base_url: "https://opencode.ai/zen/go/v1"
  web_extract:
    model: deepseek-v4-flash
    api_key: ""
    base_url: "https://opencode.ai/zen/go/v1"
  session_search:
    model: deepseek-v4-flash
    api_key: ""
    base_url: "https://opencode.ai/zen/go/v1"
```

## 覆盖范围确认

| 方案 | Gateway (微信) | CLI (AionUi) | Cron |
|:----|:-------------:|:------------:|:----:|
| ① 默认 flash + 反向升级 | ✅ resolve_turn_route | ✅ 同函数 | ✅ 同函数 |
| ② complex 阈值 0.40 | ✅ 每轮重读 config | ✅ 共读 config | ✅ 运行时读取 |
| ③ max_tokens=4096 | ✅ primary + runtime | ✅ primary + runtime | ✅ primary + 显式传参 |
| ④ max_turns=30 | ✅ ENV 映射 | ✅ CLI_CONFIG 读取 | ✅ _cfg 读取 |
| ④ 历史压缩 | ✅ AIAgent 读取 | ✅ 同 AIAgent | ✅ 同 AIAgent |
| ⑤ 辅助 flash | ✅ auxiliary 配置 | ✅ 同模块 | ✅ 同模块 |

## 已知问题 / Pitfalls

- **ACP 会话持久化**：AionUi 的 ACP session（session.py）**不经过 resolve_turn_route()**，直接创建 AIAgent。旧 session 从 state.db 恢复后仍然使用创建时的默认模型。解决：发 `/new` 或 `/reset` 重建 session，或 `/model` 手动切换。
- **辅助任务 api_key 留空**：必须设为 `""`（空字符串）而不是删除或注释掉，否则代码会报错。空字符串时自动从 provider 继承。
- **改动后重启 AionUi**：方案一（代码修改）+ 方案三（多文件修改）+ 方案四（ENV 映射）需要重启 AionUi 才生效；方案二 + 方案五（纯 config 改动）即时生效。
