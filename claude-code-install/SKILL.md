---
name: claude-code-install
description: 在当前 NAS 环境 (x86_64) 安装和配置 Claude Code 接入 DeepSeek API，含模型映射和实时进度汇报模式。
---

# Claude Code 安装与配置

## 环境

- x86_64 Linux (NAS)
- Node 20 + npm 9
- npm 镜像 `registry.npmmirror.com`

## 调用

```bash
claude -p "任务" --max-turns 10
claude -p "任务" --workdir /path
```

## 通过 Hermes 调用 + 实时进度汇报

`delegate_task` 是批量模式，等 Claude 全部干完才返回。用户无法感知进度。

**正确模式**：分阶段用 `send_message(target='weixin')` 发送进度：

```
🟢 Claude 已启动，正在读取文件…
📊 已定位关键代码段
🔧 Claude 正在修改…
✅ 修改完成，语法校验通过
🔨 构建中…
📤 发送 APK
```

## 独立工作区模式

重要项目需隔离 Claude 环境：

```bash
cp -r /opt/data/Project /opt/data/Project-claude
cd Project-claude && git init && git add -A && git commit -m "初始"
```

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_API_KEY": "你的key"
  }
}
```

## DeepSeek 模型映射

Claude Code 的 Anthropic 格式请求被 DeepSeek 翻译到实际模型：

| Claude Code 请求的模型 | DeepSeek 后端实际模型 |
|---|---|
| `claude-opus-4-20250514` | **deepseek-v4-pro**（默认，推荐） |
| `claude-sonnet-4-20250514` | **deepseek-v4-flash**（更快更便宜） |

默认使用 opus → V4 Pro。如需切换可在 settings.json 中指定。

## 调用

```bash
claude -p "任务" --max-turns 10
claude -p "任务" --workdir /path
```

## 通过 Hermes 调用 + 实时进度汇报

`delegate_task` 是批量模式，等 Claude 全部干完才返回。用户无法感知进度。

**正确模式**：分阶段用 `send_message(target='weixin')` 发送进度：

```
🟢 Claude 已启动，正在读取文件…
📊 已定位关键代码段
🔧 Claude 正在修改…
✅ 修改完成，语法校验通过
🔨 构建中…
📤 发送 APK
```

## 独立工作区模式

重要项目需隔离 Claude 环境：

```bash
cp -r /opt/data/Project /opt/data/Project-claude
cd Project-claude && git init && git add -A && git commit -m "初始"
```

**正确模式**：分阶段用 `send_message(target='weixin')` 发送进度：

```
🟢 Claude 已启动，正在读取文件…
📊 已定位关键代码段
🔧 Claude 正在修改…
✅ 修改完成，语法校验通过
🔨 构建中…
📤 发送 APK
```

实现方式：每个里程碑调用一次 `send_message`，让用户知道 Claude 在做什么、到哪一步了。

## 独立工作区模式

重要项目（如 FundMonitor）需要隔离 Claude 的工作环境，避免污染原版：

```bash
cp -r /opt/data/Project /opt/data/Project-claude
cd Project-claude && git init && git add -A && git commit -m "初始"
```

然后 `delegate_task` 的 `context` 中指定 `workdir: /opt/data/Project-claude`。
