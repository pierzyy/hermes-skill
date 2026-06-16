---
name: aionui-nas-deploy
description: 在绿联 NAS（Debian 13, x86_64, 容器环境）上部署 AionUi WebUI 的完整流程，含 Docker/NPM 路线判断、前端构建、aioncore 下载及 ACP 连接 Hermes
category: devops
---

# AionUi NAS 部署指南

## 🎯 推荐方案：预编译二进制（唯一正确路径）

**不要从源码构建！** `aionui-web` 是 94MB 自包含二进制，内嵌后端（aioncore）+ 前端静态文件，**无需 Node.js / pnpm / bun / npm install**。

### 一键部署

```bash
# 1. 下载（用国内镜像）
curl -L --max-time 600 -o /tmp/aionui-web.tar.gz \
  "https://gh.ddlc.top/https://github.com/iOfficeAI/AionUi/releases/download/v2.1.2/aionui-web-2.1.2-linux-x86_64.tar.gz"

# 2. 解压
tar xzf /tmp/aionui-web.tar.gz -C /tmp/

# 3. 启动（远程访问）
chmod +x /tmp/aionui-web/aionui-web
/tmp/aionui-web/aionui-web start --remote --port 25808
# 默认 port=25808, data-dir=~/.aionui-web, 认证=本地模式免密码
```

访问：`http://<NAS_IP>:25808`

### 持久化

⚠️ **必须复制整个目录**（不能只复制二进制）！`aionui-web` 启动时在自身路径下找 `static/` 和 `bundled-aioncore/`，单独移动二进制会导致 `static dir not found` 错误。

```bash
cp -r /tmp/aionui-web /opt/data/aionui-web-standalone
# 以后直接：
/opt/data/aionui-web-standalone/aionui-web start --remote --port 25808
```

### CLI 子命令

| 命令 | 用途 |
|------|------|
| `start` | 启动 WebUI（默认），支持 `--port` `--remote` `--data-dir` `--log-dir` |
| `resetpass` | 重置管理员密码 |
| `version` | 显示版本 |
| `help` | 帮助 |

## ⚠️ 不要尝试 Docker

此 NAS 环境运行在容器内（cgroup `0::/`），Docker daemon 启动时会报：
```
failed to mount overlay: operation not permitted
iptables: Permission denied (you must be root)
```
Docker-in-Docker 不可行。

## 下载：镜像选择

**GitHub Releases 走 Azure CDN (`release-assets.githubusercontent.com`)，从国内 NAS 完全不通。**

### ✅ 可用镜像（2026-05-26 验证）

| 镜像 | 速度 | 备注 |
|------|------|------|
| **gh.ddlc.top** | ~470KB/s | 首选 |
| **gh.idayer.com** | ~470KB/s | 备选 |

下载命令模板：
```bash
curl -L --max-time 600 -o /tmp/aionui-web.tar.gz \
  "https://<镜像>/https://github.com/iOfficeAI/AionUi/releases/download/v2.1.2/aionui-web-2.1.2-linux-x86_64.tar.gz"
```

### ❌ 已确认不可用

| 镜像/方式 | 失败原因 |
|---------|---------|
| `github.com/releases/download/...` 直连 | Azure CDN 被墙，超时 |
| API `releases/assets/{id}` | 龟速 5KB/s，~430KB 后卡死 |
| `gh.con.sh` | 被举报暂停（返回 "Suspent due to abuse report"） |
| `ghproxy.net` / `ghproxy.com` | 超时 |
| `ghps.cc` / `fastgit.org` / `yumenaka.net` / `99988866.xyz` | 全部 000 无响应 |
| npm (`npm search aioncore`) | 未发布 |

### 兜底方案：外部下载

如果所有镜像都挂了，让用户在手机/PC 下载 98MB 文件传到 NAS `/tmp/`：
```
https://github.com/iOfficeAI/AionUi/releases/download/v2.1.2/aionui-web-2.1.2-linux-x86_64.tar.gz
```

## Hermes Agent 接入

### 自动发现（首选）

AionUi 通过 PATH 自动检测 Hermes。Hermes CLI 位于 `/opt/hermes/.venv/bin/hermes`。

**关键**：必须在启动 aionui-web 前将 Hermes 加入 PATH，因为 aioncore 子进程继承父进程的 PATH。

```bash
export PATH="/opt/hermes/.venv/bin:$PATH"
/opt/data/aionui-web-standalone/aionui-web start --remote --port 25808
```

启动后检查日志：Hermes 不出现在 `agent unavailable` 列表中即为已检测。

### 架构

AionUi spawn 独立的 `hermes` 子进程处理每个会话，不直接连接常驻的 Hermes Gateway。

### 已确认可用的 Agent（2026-05-26）

| Agent | 命令 | 备注 |
|-------|------|------|
| Hermes | `/opt/hermes/.venv/bin/hermes` | 需手动加入 PATH |
| Claude Code | `claude` | 自动检测 |
| Aion CLI | 内置 | 无需配置 |

## 踩坑记录

1. **不要从源码构建**：pnpm install + bun run package 耗时且最终仍需 aioncore 二进制，预编译 tarball 一步到位
2. **aioncore 非源码产物**：不在仓库中，`resources/bundled-aioncore/linux-x64/` 为空，必须从 Release 下载
3. **gh.ddlc.top 是最稳定的国内镜像**：实测 98MB/3.5min，ghproxy 和 gh.con.sh 均已失效
4. **`--remote` 标志必须加**：默认只绑定 127.0.0.1，加 `--remote` 才绑定 0.0.0.0
5. **本地模式免密码**：启动日志显示 `Running in local mode — authentication is disabled`
6. **⛔ cron 保活用 `pgrep -f` 会误报**：`pgrep -f aionui-web` 会匹配到 cron 自己的 bash 命令中包含的 `aionui-web` 字符串（如 `eval 'pgrep -f aionui-web...'`），导致永远误报"进程存活"，挂了也不重启。正确做法：用 `ss -tlnp | grep 25808` 检测端口，或用 `pgrep -x aionui-web` 精确匹配进程名
7. **⚠️ 不能单独移动二进制**：必须复制整个目录，`aionui-web` 启动时在自身路径下找 `static/` 和 `bundled-aioncore/`

## 密码管理

首次启动或 `resetpass` 会生成随机密码（如 `%CEolgsx&1mqua0C`），太复杂。

### 重置密码

```bash
/opt/data/aionui-web-standalone/aionui-web resetpass
# 输出新随机密码，同时打印 username: admin
```

### 改为简单密码

`resetpass` 不支持自定义密码，需调 API（假设后端端口为 37749，从 `ss -tlnp | grep aioncore` 获取）：

```bash
# 1. 先 resetpass 获取临时密码
NEW_TEMP=$(/opt/data/aionui-web-standalone/aionui-web resetpass 2>&1 | grep "new password" | awk '{print $NF}')

# 2. 用临时密码通过 API 改
curl -s -X POST http://127.0.0.1:37749/api/webui/change-password \
  -H "Content-Type: application/json" \
  -d "{\"current_password\":\"$NEW_TEMP\",\"new_password\":\"aionui123\"}"
```

## 桌面端 Electron 应用

从 Linux NAS 构建 Windows Electron 桌面应用（WebView 壳包装 AionUi WebUI），参见 `electron-portable-windows-build` 技能。

当前桌面端地址：`AionUi.exe` → `http://100.107.124.78:25808`（Tailscale IP）

## 保活 Cron

AionUi 启动后需保活，用 cron 每分钟检测：

```yaml
# 通过 Hermes cronjob 创建
action: create
name: "AionUi 保活"
schedule: "* * * * *"  # 每分钟
prompt: |
  检查 AionUi 进程是否存活。如果 `pgrep -f aionui-web` 无输出，则执行：
  export PATH="/opt/hermes/.venv/bin:$PATH"
  nohup /opt/data/aionui-web-standalone/aionui-web start --remote --port 25808 &>/tmp/aionui.log &
  sleep 2
  如果启动成功，输出 "AionUi 已重新启动"；
  如果已在运行，输出 "AionUi 正常运行中"。
deliver: local  # 保活提醒只存本地，不推送
```

## 保活（cron）

⚠️ **不要用 `pgrep -f aionui-web` 做存活检测！** 在 cron 环境中，`pgrep -f` 会匹配到 cron 自己的 bash 命令字符串中的 `aionui-web`，永远返回真，导致挂了也不重启（误报存活）。

**正确方式 — 端口检测**：
```bash
# cron job prompt（每分钟）:
# 检查 AionUi 是否存活：用 `ss -tlnp | grep 25808` 检测端口。
# 如果无输出表示已挂，则执行：
export PATH="/opt/hermes/.venv/bin:$PATH"
nohup /opt/data/aionui-web-standalone/aionui-web start --remote --port 25808 &>/tmp/aionui.log &
sleep 2
# 再次 `ss -tlnp | grep 25808` 确认启动成功。
```

## Tailscale（容器环境）

NAS 无 systemd，需手动启动 + `userspace-networking`：

```bash
tailscaled --tun=userspace-networking &
sleep 3
tailscale up --accept-routes
# 访问输出的 URL 完成认证
```

TPM 错误（`stat /dev/tpmrm0: no such file or directory`）和 tun 错误在容器环境正常，不影响功能。

### ⚠️ userspace-networking 无法访问本机 Tailscale IP

容器环境下使用 `--tun=userspace-networking`，**本机 Tailscale IP（如 `100.x.x.x`）无法回环访问本地服务**——外部客户端和本机 curl 均超时。这是用户态网络栈的固有限制。

**解决方案：`tailscale serve`**
```bash
# 暴露本地端口到 Tailscale 网络
tailscale serve --bg --http=25808 http://127.0.0.1:25808

# 之后通过 MagicDNS 域名访问：
# http://naszmy20221007:25808
```

`tailscale serve` 启动后实时生效，无需重启任何服务。客户端的 Electron 应用也应使用 MagicDNS 域名而非 IP。

### 保活（容器/无 systemd 环境）

容器无 systemd，进程挂了不会自动拉起。用 cron 保活：

```bash
# hermes cron create
cronjob action=create name="AionUi 保活" schedule="* * * * *" deliver=local
prompt: 检查 pgrep -f aionui-web 是否存活，挂了就重启。
```

每分钟检测一次，AionUi 挂了自动拉起。本地交付（不推送消息），静默运行。

### ⚠️ tailscale up 必须后台运行

`tailscale up` 会**无限阻塞**等待用户在浏览器完成 OAuth 认证。在 Hermes 中必须用 `background=true`：

```bash
# ❌ 错误：foreground 会超时（即使设 300s）
terminal("tailscale up --accept-routes", timeout=300)

# ✅ 正确：后台运行，用户可以慢慢认证
terminal("tailscale up --accept-routes 2>&1", background=true, timeout=300)
```

用户认证完成后，`tailscale status` 会显示已连接。如果后台进程仍在运行，`process('kill')` 关掉即可。

### 命令卡死/无响应修复

如果 `tailscale status` 或 `tailscale up` 没有任何输出且不返回（hangs），tailscaled 可能处于坏状态，出现 defunct 僵尸进程：

```bash
pkill tailscaled
sleep 2
tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state 2>&1 &
sleep 3
tailscale status  # 此时应正常返回 "Logged out."
```

### 完整授权流程（按顺序）

1. **确保 tailscaled 跑的**：`pgrep tailscaled`，没有就启动
2. **验证命令可用**：`tailscale status` 应立即返回（不卡），显示 "Logged out."
3. **后台拉起 up**：`tailscale up --accept-routes 2>&1`（background=true），输出里找 `https://login.tailscale.com/a/xxxxx`
4. **用户打开链接授权**
5. **验证**：`tailscale status` 显示已连接，`tailscale ip -4` 返回 100.x.x.x Tailscale IP

### 授权链接过期

每次 `tailscale up` 生成新链接，旧链接可能失效。如果用户说"授权了但 still Logged out"，重新 `tailscale up` 获取新链接即可。
