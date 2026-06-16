---
name: hermes-model-pair-routing
description: 扩展 Hermes 智能模型路由：model_pairs 配对、实时模型标签显示、无需重启生效。当用户要求不同主力模型绑定不同 cheap 模型、在回复中实时显示当前模型标签时使用。
version: 1.0.0
---

# Hermes 智能模型路由扩展 — model_pairs + 实时模型标签

## 触发条件
- 用户需要不同主力模型绑定不同的 cheap 模型（而非全局单一 cheap_model）
- 用户需要在每句回复前自动显示当前实际使用的模型标签
- 需要改路由配置后**无需重启网关**即时生效

## 涉及文件
| 文件 | 作用 |
|------|------|
| `/opt/data/config.yaml` | 路由配置（model_pairs、cheap_model） |
| `/opt/hermes/agent/smart_model_routing.py` | 路由逻辑核心 |
| `/opt/hermes/gateway/run.py` | 网关层：配置重读、标签注入 |
| `/opt/hermes/cli.py` | CLI 层：路由复用 + 标签注入（与 gateway 独立） |
| `/opt/hermes/tests/agent/test_credential_pool_routing.py` | 测试 mock 需同步更新 |

---

## Step 1: 配置 model_pairs

在 `/opt/data/config.yaml` 的 `smart_model_routing` 块：

```yaml
smart_model_routing:
  enabled: true
  max_simple_chars: 160
  max_simple_words: 28
  model_pairs:
    - primary: deepseek-v4-pro
      cheap:
        provider: deepseek
        model: deepseek-v4-flash
    - primary: mimo-v2.5-pro
      cheap:
        provider: xiaomi
        model: mimo-v2.5
  cheap_model:                    # 兜底：未匹配到的模型走这个
    provider: deepseek
    model: deepseek-v4-flash
```

确保 cheap 模型已在 `providers.<name>.models` 列表中。

---

## Step 2: 修改 smart_model_routing.py

### 2a. 新增 `_resolve_cheap_model()` 函数

在 `_coerce_int()` 之后、`choose_cheap_model_route()` 之前插入：

```python
def _resolve_cheap_model(cfg: Dict[str, Any], current_model: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Resolve the cheap model to use, preferring model_pairs over cheap_model."""
    # 1. Try model_pairs first
    model_pairs = cfg.get("model_pairs")
    if isinstance(model_pairs, list) and current_model:
        current = current_model.strip().lower()
        for pair in model_pairs:
            if not isinstance(pair, dict):
                continue
            primary = str(pair.get("primary", "")).strip().lower()
            if primary == current:
                cheap = pair.get("cheap")
                if isinstance(cheap, dict):
                    provider = str(cheap.get("provider") or "").strip().lower()
                    model = str(cheap.get("model") or "").strip()
                    if provider and model:
                        return cheap
    # 2. Fall back to cheap_model (backward compat)
    cheap_model = cfg.get("cheap_model") or {}
    if not isinstance(cheap_model, dict):
        return None
    provider = str(cheap_model.get("provider") or "").strip().lower()
    model = str(cheap_model.get("model") or "").strip()
    if provider and model:
        return cheap_model
    return None
```

### 2b. 修改 `choose_cheap_model_route()`

签名加 `current_model: Optional[str] = None` 参数。

Body 中将原 cheap_model 解析替换为调用 `_resolve_cheap_model`：

```python
cheap_model = _resolve_cheap_model(cfg, current_model)
if not cheap_model:
    return None
```

底部的 `provider`/`model` 变量改为从字典取：

```python
route["provider"] = str(cheap_model.get("provider") or "").strip().lower()
route["model"] = str(cheap_model.get("model") or "").strip()
```

### 2c. 修改 `resolve_turn_route()` 传参

```python
route = choose_cheap_model_route(user_message, routing_config, current_model=primary.get("model"))
```

---

## Step 3: 模型标签实时显示

### 3a. `gateway/run.py` 添加 `_model_to_tag()`（在 `_load_smart_model_routing` 之后）

```python
@staticmethod
def _model_to_tag(model_name: str) -> str:
    """Map model name to a short display tag for response prefix."""
    mapping = {
        "deepseek-v4-pro": "[Dsv4p]",
        "deepseek-v4-flash": "[Dsv4f]",
        "mimo-v2.5-pro": "[Mimo25p]",
        "mimo-v2.5": "[Mimo25]",
        "skywork-ai/skyclaw-v1": "[Skyclaw]",
    }
    tag = mapping.get(model_name)
    if tag:
        return tag
    short = model_name.split("/")[-1][:8]
    return f"[{short}]"
```

### 3b. 路由解析后注入标签指令（gateway）

在 `turn_route = self._resolve_turn_agent_config(message, model, runtime_kwargs)` **之后**、
`_agent_config_signature()` 计算**之前**插入：

```python
current_model = turn_route.get("model", "")
model_tag = self._model_to_tag(current_model)
tag_instruction = (
    f"\n\n[MODEL IDENTITY: You are running on '{current_model}'."
    f" Start every response with '{model_tag}:' on its own line"
    f" (just the tag and colon, nothing else), then a blank line,"
    f" then your reply. This tag is injected by the routing system"
    f" — it reflects the actual model selected for this turn."
    f" Never omit or alter it.]"
)
combined_ephemeral = combined_ephemeral + tag_instruction
```

输出格式示例：
```
[Dsv4f]:

实际回复内容
```

---

## Step 4: 配置即时生效（无需重启）

在 `gateway/run.py` 的 `_resolve_turn_agent_config` 中：

```python
# 改前（缓存式，需重启）：
route = resolve_turn_route(user_message, getattr(self, "_smart_model_routing", {}), primary)

# 改后（每轮重读，即时生效）：
route = resolve_turn_route(user_message, self._load_smart_model_routing(), primary)
```

---

## Step 5: CLI 模型标签（独立于 gateway）

CLI 已有自己的路由逻辑（`cli.py` → `_resolve_turn_agent_config` → `resolve_turn_route`），
但标签注入需要单独添加。

### 5a. CLI 添加 `_model_to_tag()`（在 `_resolve_turn_agent_config` 之前）

```python
@staticmethod
def _model_to_tag(model_name: str) -> str:
    """Map model name to a short display tag for response prefix."""
    # ... 同 gateway 的 mapping
```

### 5b. `_resolve_turn_agent_config` 返回时附 `model_tag`

在 `route = resolve_turn_route(...)` 之后加：

```python
route["model_tag"] = self._model_to_tag(route.get("model", ""))
```

### 5c. `_init_agent` 签名加 `model_tag` 参数

```python
def _init_agent(self, *, model_override: str = None, runtime_override: dict = None,
                route_label: str = None, request_overrides: dict | None = None,
                model_tag: str = None) -> bool:
```

在 `effective_model = model_override or self.model` 之后、`self.agent = AIAgent(...)` 之前：

```python
_ephemeral = self.system_prompt if self.system_prompt else ""
if model_tag:
    _tag_instruction = (
        f"\n\n[MODEL IDENTITY: You are running on '{effective_model}'."
        f" Start every response with '{model_tag}:' on its own line"
        f" (just the tag and colon, nothing else), then a blank line,"
        f" then your reply. ...]"
    )
    _ephemeral = _tag_instruction + "\n\n" + _ephemeral if _ephemeral else _tag_instruction

self.agent = AIAgent(
    ...
    ephemeral_system_prompt=_ephemeral if _ephemeral else None,
    ...
)
```

### 5d. 两处 `_init_agent` 调用点都传 `model_tag`

```python
# 主聊天流（~7607行）
if not self._init_agent(
    ...,
    model_tag=turn_route.get("model_tag"),
):

# 后台任务流（~10089行）
if cli._init_agent(
    ...,
    model_tag=turn_route.get("model_tag"),
):
```

---

## Step 6: 测试更新

修改 `smart_model_routing` 或 `_resolve_turn_agent_config` 后，需同步更新测试 mock：

### Gateway 测试
```python
runner = SimpleNamespace(
    _smart_model_routing={"enabled": False},
    _load_smart_model_routing=lambda: {"enabled": False},  # ← 新增
)
```

### CLI 测试
```python
shell = SimpleNamespace(
    ...,
    _model_to_tag=lambda name: "[test]",  # ← 新增
)
```

---

## 工作原理

1. 用户发消息 → gateway 解析 provider/model
2. `_resolve_turn_agent_config()` 调用 `resolve_turn_route()`，传入当前主力模型名
3. `_resolve_cheap_model()` 在 `model_pairs` 中匹配 → 命中则用配对的 cheap，否则用 `cheap_model` 兜底
4. 标签指令连同模型名注入 system prompt
5. Agent 看到 `[MODEL IDENTITY: ...]` 后自动在回复前加 `[Tag]`
6. 智能路由命中时标签自动切换（简单消息走 flash → `[Dsv4f]`；复杂消息走 pro → `[Dsv4p]`）

---

## Step 7: 验证

```bash
cd /opt/hermes && .venv/bin/python -m pytest tests/agent/test_smart_model_routing.py tests/agent/test_credential_pool_routing.py -v
# 预期：20 passed（6 + 14）
```

---

## 注意事项

- 容器环境下 PID 1 杀不掉，通过「每轮重新读 config」绕过重启问题
- `model_pairs` 和 `cheap_model` 共存：有匹配走 pairs，无匹配走 cheap_model 兜底
- 标签注入写入 `combined_ephemeral`（gateway）或 `_ephemeral`（CLI），模型变化时自动重建 agent
- 标签从第二个回复起生效（当前回复的 agent 已创建，需下一条消息触发重建）
- 新增模型：config `model_pairs` + `_model_to_tag()` mapping + provider models 列表，三处各加一行
- **Gateway 和 CLI 的标签注入彼此独立**，需分别修改，不能只改一边
- 修改 `_resolve_turn_agent_config` 或 `_init_agent` 签名后，必须同步更新所有调用点（含测试 mock）
