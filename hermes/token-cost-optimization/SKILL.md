---
name: token-cost-optimization
description: 10 strategies to cut LLM token costs 60-97%. Hermes-native, battle-tested. Covers headroom-ai compression, model tiering, semantic cache, prompt caching, output control, tool minimization, batch API, token budget enforcement.
version: 1.0.0
source: https://github.com/protick-bjit2019/token-cost-optimization
---

# Token Cost Optimization — 10 Strategies

> Hermes Agent skill: cut LLM API token costs without degrading output quality.

## Quick Start

### Strategy 0: headroom-ai Context Compression (60-95% savings)

Install headroom-ai proxy that compresses prompts using ModernBERT before they hit the LLM:

```bash
pip install "headroom-ai[all]"
headroom proxy --port 8787  # starts compression proxy on port 8787
```

Then route Hermes traffic through it:
```bash
hermes config set model.base_url http://localhost:8787/v1
```

Verify: `curl -s http://localhost:8787/livez`

### Strategy 1: Measure First

Always start by measuring your baseline token usage. Use `tiktoken` or check `response.usage` in API responses.

```bash
pip install tiktoken
```

### Strategy 2: Model Tiering

Route simple queries to cheap models, complex queries to expensive ones. Hermes already has `smart_model_routing` with `model_pairs`. Ensure it's enabled:
- Simple: deepseek-v4-flash (cheap)
- Complex: deepseek-v4-pro (expensive)

### Strategy 3: Prompt Compression & Boilerplate Removal

Remove redundant text from system prompts. Keep only essential instructions. Strip verbose tool descriptions.

### Strategy 4: Context Window Management (Sliding Window)

For long conversations, keep only last N exchanges in context. Drop older messages that are no longer relevant.

### Strategy 5: Prompt Caching (Provider-Level)

Use Anthropic's `cache_control` or DeepSeek's context caching. Mark stable parts of your prompt (system prompt, tool definitions) as cacheable.

### Strategy 6: Semantic Caching

Cache LLM responses by semantic similarity. Two similar prompts → return cached result. Use `zilliztech/GPTCache` or equivalent.

### Strategy 7: Output Length Control

Set `max_tokens` to reasonable limits. Request structured output (JSON) to reduce verbosity.

### Strategy 8: Tool Call Minimization

Batch tool calls where possible. Avoid calling the same tool repeatedly for similar data. Cache tool outputs.

### Strategy 9: Batch API

Use batch API endpoints where available (50% discount on many providers). Queue non-urgent requests.

### Strategy 10: Token Budget Enforcement

Set a hard token budget per task/request. If exceeded, summarize context or use a cheaper model for the remainder.

## Smoke Test Results (Reference)

From the original skill test (claude-sonnet-4.5, 200-item JSON tool output):

```
BEFORE:  24,186 prompt tokens → $0.07256/call
AFTER:    2,592 prompt tokens → $0.00778/call
Saved:   21,594 tokens (89.3%) → $64.78 per 1,000 calls

Best combo: haiku-3 + headroom = 97.1% savings vs baseline
Prompt caching: 90% off for cached system prompts
```

## Installation for Hermes NAS

### 1. headroom-ai proxy (Strategy 0)

```bash
cd /opt/data
python3 -m venv headroom_venv
source headroom_venv/bin/activate
pip install "headroom-ai[all]"
headroom proxy --port 8787 &
```

### 2. Measure baseline (Strategy 1)

```bash
pip install tiktoken
python3 /opt/data/skills/hermes/token-cost-optimization/templates/smoke_test_token_opt.py
```

### 3. Verify model routing (Strategy 2)

Check that `smart_model_routing` is enabled in `/opt/data/config.yaml`.

## NAS-Specific Notes

- NAS has x86_64 compute → can run ModernBERT for compression
- headroom proxy runs on NAS (port 8787), accessible to Hermes agent
- Can also serve Cloud VM Hermes via SSH tunnel or FRP
- watchdog.py should monitor headroom proxy health

## Pitfalls

- headroom-ai requires Python 3.11+, check before installing
- First run downloads ModernBERT model (~500MB)
- Compression adds ~8-10ms latency per request
- Not all providers support prompt caching; verify with opencode-go / DeepSeek
- Semantic caching needs Redis (install via `apt-get install redis` on NAS)
