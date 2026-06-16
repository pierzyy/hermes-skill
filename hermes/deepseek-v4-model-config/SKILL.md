---
name: deepseek-v4-model-config
description: Configure DeepSeek V4 Pro/Flash models correctly in Hermes — fix model normalization mapping and context length
version: 1.0.0
author: Hermes Agent
metadata:
  hermes:
    tags: [deepseek, model, config, context-length]
    category: hermes
---

# DeepSeek V4 Model Configuration in Hermes

When configuring DeepSeek V4 models (Pro/Flash) in Hermes, there are **two files** that must be updated for the model to work correctly.

## Problem

- `deepseek-v4-pro` / `deepseek-v4-flash` get mapped to `deepseek-chat` by `_normalize_for_deepseek()`, which may route to the wrong model on your DeepSeek account
- Context length defaults to 128K (`"deepseek": 128000`) instead of 1M (DeepSeek V4's actual capability)

## Fixes

### 1. Model normalization (`model_normalize.py`)

Add v4 models to `_DEEPSEEK_CANONICAL_MODELS` so they pass through without being mapped to `deepseek-chat`:

```python
_DEEPSEEK_CANONICAL_MODELS: frozenset[str] = frozenset({
    "deepseek-chat",
    "deepseek-reasoner",
    "deepseek-v4-pro",    # ← add
    "deepseek-v4-flash",  # ← add
})
```

**File**: `/opt/hermes/hermes_cli/model_normalize.py` (line ~117)

### 2. Context length (`model_metadata.py`)

Add a specific entry for v4 before the generic `deepseek` fallback:

```python
# DeepSeek
"deepseek-v4": 1048576,          # DeepSeek V4 series (1M context)
"deepseek": 128000,              # fallback for older deepseek models
```

**File**: `/opt/hermes/agent/model_metadata.py` (line ~130)

The fuzzy matching checks `default_model in model_lower` sorted by key length (longest first), so `"deepseek-v4" in "deepseek-v4-pro"` matches before the shorter `"deepseek"` key.

## Verification

```python
from hermes_cli.model_normalize import normalize_model_for_provider
normalize_model_for_provider("deepseek-v4-pro", "deepseek")
# → "deepseek-v4-pro"  (not "deepseek-chat")
```

## Config.yaml

In `/opt/data/config.yaml`:
```yaml
model:
  default: deepseek-v4-pro
  provider: deepseek
  base_url: https://api.deepseek.com/
```

## Reasoning / Thinking config

DeepSeek V4 Pro supports OpenRouter-style `reasoning` extra_body for thinking mode.
When using the native DeepSeek API (`api.deepseek.com`), Hermes' `_supports_reasoning_extra_body()` returns **False** (it only gates reasoning for OpenRouter routes). So `reasoning_effort: xhigh` in config.yaml has **no effect** on native DeepSeek API calls.

To actually enable thinking on native DeepSeek API, you would need to modify `run_agent.py` at line ~6769:

```python
# Currently:
if "openrouter" not in self._base_url_lower:
    return False

# To enable thinking for DeepSeek:
if "openrouter" not in self._base_url_lower and "deepseek" not in self._base_url_lower:
    return False
```

DeepSeek V4 Pro's `thinking` parameter is binary (true/false) — **no effort levels** unlike OpenRouter which has none/low/medium/high/xhigh.

**Option A**: Stay on native DeepSeek API — thinking works but no effort level control
**Option B**: Switch to OpenRouter (`openrouter/deepseek/deepseek-v4-pro`) — full reasoning_effort control

## Notes

- DeepSeek API only accepts certain model identifiers (test with `GET /v1/models`)
- `deepseek-v4-pro` and `deepseek-v4-flash` are valid model IDs on the API
- For older models (v3, etc.), `deepseek-chat` is the correct fallback
- `streaming.enabled: true` in config.yaml enables streaming output (required for best experience with V4 models)