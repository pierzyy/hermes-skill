---
name: hermes-provider-hang-diagnosis
description: 诊断 Hermes CLI 切换模型后"卡住/无反应"的系统性方法——从 API 直连测试到 streaming 行为分析，覆盖 reasoning_content 假死、max_tokens 不足、超时等常见根因。
version: 1.0.0
---

# Hermes Provider Hang Diagnosis

诊断 Hermes CLI 切换模型后"卡住/无反应"的系统性方法。

## 触发条件

- 用户报告 `/model` 切换到某 provider 后 CLI 卡住
- 模型切换后无输出，一直"处理中"
- 用户怀疑 max_tokens 或其他设置导致

## 诊断流程

### Step 1: 找到 provider 配置

```bash
grep -A5 'provider_name:' /opt/data/config.yaml
```

关注 `api_key`、`base_url`、`models` 三个字段。

### Step 2: 测试 API 连通性（非 streaming）

```bash
API_KEY=$(grep -A3 'provider_name:' /opt/data/config.yaml | grep api_key | head -1 | sed 's/.*api_key: //')
MODEL="model-name-from-config"

curl -s "$BASE_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"说一个数字\"}],\"max_tokens\":50,\"stream\":false}" \
  --connect-timeout 10 --max-time 60
```

如果非 streaming 正常，继续下一步。

### Step 3: 测试 streaming 行为（关键！）

```bash
curl -s "$BASE_URL/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"说一个数字\"}],\"max_tokens\":200,\"stream\":true}" \
  --connect-timeout 10 --max-time 120 | head -c 3000
```

**重点检查 streaming chunk 结构：**

- 如果 chunk 中 `content: null` 但 `reasoning_content: "..."` 有值 → **推理阶段无输出，CLI 表现为"卡住"**
- 推理完成后才出现 `content: "..."` 的 chunk → 这是推理模型的正常行为，但用户体验差

### Step 4: 判断根因

| 现象 | 诊断 | 解决 |
|------|------|------|
| `reasoning_content` 先于 `content` 大量输出 | 推理模型正常行为，Hermes 在等待 content | 告知用户这是正常的；复杂问题推理可能数十秒 |
| API 完全不响应 | 网络/base_url/api_key 问题 | 检查连通性和认证 |
| 响应被截断，finish_reason=length | max_tokens 太低 | 增大 max_tokens |
| streaming chunk 格式异常 | provider 非标准 OpenAI 兼容 | 需要 transport 适配 |

## 已知 provider 行为

### Xiaomi MiMo (mimo-v2.5-pro)

- **Transport**: `openai_chat`
- **Streaming 行为**: 先输出 `reasoning_content` chunks（content=null），后输出 `content` chunks
- **症状**: 复杂问题推理阶段可长达数十秒，CLI 无输出，用户感知为"卡住"；若 `max_tokens` 不足，推理吃光配额后 `content` 为空→"Empty response from model"
- **Base URL**: `https://api.xiaomimimo.com/v1`
- **Config 路径**: `/opt/data/config.yaml` → `providers.xiaomi`
- **API key 提取命令**: `grep -A3 'xiaomi:' /opt/data/config.yaml | grep api_key | head -1 | sed 's/.*api_key: //'`
- **⚠️ max_tokens 铁律: ≥16384, timeout ≥600s**。8192 仍会被复杂问题的推理阶段吃光，实测 16384 才安全。Herems ACP 日志出现 `Empty response from model — retrying` 就是 token 不够的信号

## 陷阱

- `reasoning_content` 阶段 Hermes 的 `show_reasoning: true` 不一定能实时显示——取决于 transport 层如何处理 `content: null` 的 chunk
- `gateway_timeout: 1800`（30分钟）意味着如果 API 真的挂了，用户要等很久才知道
- 用户说"卡住"时，先确认是「完全没响应」还是「等了很久才有输出」——两者根因完全不同
- 不要假设是 max_tokens 问题，先用 curl 直接测 API 排除网络层
