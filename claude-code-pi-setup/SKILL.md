---
name: claude-code-pi-setup
description: 在 Raspberry Pi (arm64) 上安装和配置 Claude Code，通过 settings.json 接入非 Anthropic API（如 DeepSeek）。
---

# Claude Code on Raspberry Pi (arm64)

在树莓派 arm64（Debian/Raspberry Pi OS）上安装 Claude Code 并通过 `settings.json` 配置自定义 API 后端。

## 环境

- Raspberry Pi 4 / arm64 (aarch64)
- Debian Trixie / Raspberry Pi OS
- 已配置国内 npm 镜像（可选但强烈建议）

## 安装步骤

### 1. 安装 Node.js

```bash
sudo apt install -y nodejs npm
# 得到 Node 20.x + npm 9.x
```

### 2. 配置 npm（避免 sudo）

```bash
mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
export PATH=~/.npm-global/bin:$PATH
```

### 3. （可选）配置国内 npm 镜像

```bash
npm config set registry https://registry.npmmirror.com
```

### 4. 安装 Claude Code

```bash
npm install -g @anthropic-ai/claude-code
# 下载 arm64 原生二进制，~45秒（走国内镜像）
```

验证：
```bash
claude --version
# 2.1.146 (Claude Code)
```

## 配置自定义 API 后端

Claude Code 原生只支持 Anthropic API，但通过 `settings.json` 的 `env` 字段可以注入 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_API_KEY`，指向翻译代理或兼容端点。

### settings.json

位置：`~/.claude/settings.json`

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-proxy.example.com/v1",
    "ANTHROPIC_API_KEY": "***"
  }
}
```

- `ANTHROPIC_BASE_URL` — 指向兼容 Anthropic API 格式的端点
- `ANTHROPIC_API_KEY` — 后端需要的 API key

### 注意事项

- Claude Code 是无头原生二进制（非 Node.js），除 `settings.json` 外无其他配置入口
- `ANTHROPIC_BASE_URL` 硬编码在二进制内（默认 `api.anthropic.com`），只能通过 `settings.json` 覆盖
- 支持 `HTTP_PROXY`/`HTTPS_PROXY` 环境变量（可在 `settings.json` 的 `env` 段设置）
- 翻译层的 tool-calling 格式可能有细微差异，复杂任务建议测试验证

## 调用方式

```bash
# 一次性任务（推荐）
claude -p "任务描述" --max-turns 10

# 指定工作目录
claude -p "查看项目结构" --max-turns 5 --workdir /path/to/project

# 限制工具
claude -p "审查代码" --allowedTools "Read,Edit" --max-turns 5
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `EACCES: permission denied` | npm 全局安装需要 root | 设 `npm config set prefix ~/.npm-global` |
| `command not found: claude` | PATH 未加载 | `source ~/.bashrc` 或 `export PATH=~/.npm-global/bin:$PATH` |
| apt 安装超时 | 国内网络慢 | 已换清华镜像源则正常，耐心等 |
| `401 Unauthorized` | API key 或 BASE_URL 不对 | 检查 `~/.claude/settings.json` |

## 文件布局

```
~/.npm-global/
├── bin/claude           → 符号链接到原生二进制
└── lib/node_modules/
    └── @anthropic-ai/claude-code/
        └── bin/claude.exe    ← arm64 原生 ELF

~/.claude/
└── settings.json        ← API 配置
```
