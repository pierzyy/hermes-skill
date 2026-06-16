---
name: hermes-model-switching
description: Switch models in Hermes sessions — /model command for session-only switching vs config.yaml for persistent switching. Covers gateway interception requirements and common pitfalls.
version: 1.0.0
---

# Hermes 模型切换

Hermes 支持两种模型切换方式，**不要混淆**。

## 方式一：`/model` 会话级切换（推荐，不改 config）

```
/model --provider deepseek --global deepseek-v4-pro    # --provider + --global 持久化切换
/model --provider xiaomi mimo-v2.5-pro                 # 切换到 xiaomi provider 的 mimo
/model deepseek-v4-pro                                  # 仅在同 provider 内切换
/model --global deepseek-v4-pro                         # 会话 + 持久化到 config.yaml
```

- `/model --provider <name> <model>` — **跨 provider 切换**，provider 在前，模型名在后
- `/model <name> --global` — 才会写入 config.yaml
- **不支持 `provider:model` 冒号语法**，冒号被保留给 OpenRouter variant suffix
- 切换后**下一条消息**生效，对话上下文保留

### ⚠️ **不支持 `provider:model` 冒号语法**

Hermes 代码层面**不支持 `provider:model` 冒号语法**。冒号被保留给 OpenRouter 的 variant suffix（`:free`、`:extended`、`:fast`）。以下写法无效：

```
# ❌ 无效 — "skywork:skywork-ai/skyclaw-v1" 被当成一个模型名，provider 不变
/model skywork:skywork-ai/skyclaw-v1
```

跨 provider 切换**必须用 `--provider` flag**。

### ⚠️ `--provider` flag 位置陷阱

`--provider` 放最后会被当成模型名的一部分：
```
# ❌ 无效 — "mimo-v2.5-pro --provider xiaomi" 被当成一个模型名
/model mimo-v2.5-pro --provider xiaomi

# ✅ 正确 — flag 放前面
/model --provider xiaomi mimo-v2.5-pro
```

### ⚠️ 关键：必须以 `/` 开头

Gateway 通过 `event.text.startswith("/")` 判断是否为命令。以下情况 `/model` **不会被拦截**，会直接传给 agent（无效）：

```python
# ❌ 不会拦截 — 消息以 [ 开头
[Assistant Rules]
/model skyclaw

# ❌ 不会拦截 — 前面有空格或其他字符
 /model skyclaw
```

**正确用法**：单独发送一条以 `/` 开头的消息：
```
/model skyclaw
```

## 方式二：改 config.yaml（持久化，非会话级）

脚本路径：`/opt/data/scripts/switch_model.py`

```bash
python3 /opt/data/scripts/switch_model.py skyclaw
python3 /opt/data/scripts/switch_model.py deepseek
```

这会直接修改 `/opt/data/config.yaml` 的 `model.default` 和 `model.provider`，影响**所有后续会话**。**不要用此方式做临时切换**。

## 智能模型路由（smart_model_routing）

开启后，短消息自动路由到更便宜的模型。v2 支持 **model_pairs 配对**，不同主力模型绑定各自的 cheap 端：

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

### 涉及文件

- 配置：`/opt/data/config.yaml` 的 `smart_model_routing` 段
- 路由逻辑：`/opt/hermes/agent/smart_model_routing.py`
- 配置读取：`/opt/hermes/gateway/run.py` line 986（已改为每轮重读文件，无需重启）

### 模型标签实时显示

开启 `smart_model_routing` 后，agent 回复前会自动加上模型标签，反映当前实际使用的模型（包括路由命中的 cheap 模型）。标签映射由 `/opt/hermes/gateway/run.py` 的 `_model_to_tag()` 定义：

| 模型 | 标签 |
|------|------|
| deepseek-v4-pro | `[Dsv4p]` |
| deepseek-v4-flash | `[Dsv4f]` |
| mimo-v2.5-pro | `[Mimo25p]` |
| mimo-v2.5 | `[Mimo25]` |
| skyclaw-v1 | `[Skyclaw]` |

新增模型时同步更新配置和标签映射。详见 `hermes-model-pair-routing` 技能。

1. 先在 `providers.<name>.models` 中加入 cheap 模型
2. 在 `smart_model_routing.model_pairs` 加一个 `- primary: / cheap:` 条目
3. 即时生效，无需重启

## 已配置的模型

| Provider | 模型名（必须和 API 返回一致） | 快捷指令 | 命令 |
|----------|---------------------------|----------|------|
| deepseek | deepseek-v4-pro | `切换ds4p` | `/model --provider deepseek --global deepseek-v4-pro` |
| deepseek | deepseek-v4-flash | `切换ds4f` | `/model --provider deepseek --global deepseek-v4-flash` |
| skywork | skywork-ai/skyclaw-v1 | `切换skyclaw` | `/model --provider skywork skywork-ai/skyclaw-v1` |
| xiaomi | mimo-v2.5-pro | `切换mimo` | `/model --provider xiaomi mimo-v2.5-pro` |
| xiaomi | mimo-v2.5 | `切换mimo5` | `/model --provider xiaomi mimo-v2.5` |

用户说快捷指令时，直接回复对应的 `/model` 命令，不加任何说明文字。

### ⚠️ 模型名必须与 API 返回完全一致

config.yaml 中 `providers.<name>.models` 里填的模型名**必须与 API `/models` 接口返回的 `id` 一致**，否则 Hermes 无法正确切换 provider。例如 skywork API 返回的是 `skywork-ai/skyclaw-v1`，config 里写 `skyclaw-v1` 会导致 `/model` 只改模型名但不切换 provider。

## 故障排查

| 症状 | 原因 | 解决 |
|------|------|------|
| `/model` 无响应 | 消息不以 `/` 开头 | 单独发一条 `/model xxx` |
| agent 收到了 `/model` 文本 | gateway 未拦截 | 检查消息开头是否为 `/` |
| 切换到了错误模型 | 不带 provider 前缀，搜不到就 fallback | 用冒号语法：`/model xiaomi:mimo-v2.5-pro` |
| 模型名正确但 provider 不切换 | config 中模型名与 API 返回不一致 | `curl API的/models接口`，确认 id 字段值 |
| `--provider` 被当成模型名 | flag 放在了模型名后面 | flag 放在模型名前，或用冒号语法代替 |
| `--provider` 语法正确但 provider 不变，模型名显示为 flag 字符串（如 `Model switched to: --provider skywork skywork-ai/skyclaw-v1`） | ACP 适配器的 `_cmd_model` 未调用 `parse_model_flags`，把全量参数当模型名处理（仅影响通过 ACP 协议连接的客户端，gateway 不受影响） | 修改 `/opt/hermes/acp_adapter/server.py` 的 `_cmd_model`，在 provider 自动检测前先调用 `from hermes_cli.model_switch import parse_model_flags` 解析 `--provider` flag，然后用 `explicit_provider` 直接指定 provider |
| `--provider` 语法正确，但显示 `Provider: custom` 而非预期的 provider 名 | provider 在 config.yaml 的 `providers:` 段定义了，但**不在 `PROVIDER_REGISTRY`**（`hermes_cli/auth.py`）中。`resolve_provider()` 抛出 AuthError → `_get_named_custom_provider` 接管 → 返回 `"provider": "custom"` | 1) 在 `hermes_cli/auth.py` 的 `PROVIDER_REGISTRY` 中注册该 provider（加 `ProviderConfig` 条目）。2) 如果该 provider 使用了非默认的 base_url 或 api_key（如在 config.yaml 中配置了代理地址），还需修改 `hermes_cli/runtime_provider.py` 的 API-key 处理段，让 `resolve_runtime_provider` 回退读取 `config.providers.<name>` 的 base_url 和 api_key，否则会用 `PROVIDER_REGISTRY` 的硬编码默认值而非 config 中的实际配置 |
