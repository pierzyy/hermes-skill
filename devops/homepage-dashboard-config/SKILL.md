---
name: homepage-dashboard-config
description: 配置和维护 Homepage 个人仪表盘（gethomepage.dev）—— 服务卡片、Widget 类型选择、书签、系统资源监控。适用于 NAS 自托管场景。
version: 1.0.0
---

# Homepage 仪表盘配置

Homepage 部署在 `/opt/data/homepage-dashboard/`，运行端口 3001，启动命令 `pnpm start --port 3001`。

## 配置文件结构

```
config/
├── services.yaml    # 服务卡片（核心配置）
├── widgets.yaml     # 信息类 widget（资源监控、搜索等）
├── bookmarks.yaml   # 书签链接
├── settings.yaml    # 主题、布局、语言
├── docker.yaml      # Docker 容器监控（未使用）
└── kubernetes.yaml  # K8s 监控（未使用）
```

## Widget 类型选择规则（关键陷阱）

Homepage 只支持**文档中列出的特定 widget 类型**，不可随意填写。

### ✅ 已验证可用的 widget 类型

| 类型 | 用途 | 配置位置 |
|------|------|----------|
| `resources` | CPU/内存/磁盘/运行时间 | `widgets.yaml`（不是 services.yaml！） |
| `iframe` | 嵌入任意 HTML 页面 | `services.yaml` 的 widget 段 |
| `qbittorrent` | qBittorrent 下载状态 | `services.yaml` 的 widget 段 |
| `uptimekuma` | Uptime Kuma 状态页 | `services.yaml`（需要 `slug` 参数） |

### ❌ 不支持的自定义 widget 类型

以下类型**不存在**，会显示"缺失的组件类型"错误：
- `aionui` — 自定义 Web 服务，无内置 widget
- `fundmonitor` — 自定义 Web 服务，无内置 widget
- `frp` — FRP 管理面板，无内置 widget

**解决方案**：移除 widget 配置，只保留 `href` + `icon` 作为纯链接卡片。

### 查找支持的 widget 类型

```bash
ls /opt/data/homepage-dashboard/docs/widgets/services/
# 每个 .md 文件对应一个支持的 widget 类型
```

## 配置示例

### services.yaml（服务卡片）

```yaml
---
- Home:
    - AionUi:
        href: http://localhost:3000
        description: AionUi Web 管理界面
        icon: aionui
    - FundMonitor:
        href: http://localhost:8080
        description: 基金监控仪表盘
        icon: chart-line

- Services:
    - Uptime:
        href: http://localhost:3002
        description: 服务状态监控
        icon: uptime
        widget:
          type: iframe                    # 自定义 HTML 页面用 iframe
          src: http://localhost:3002
          classes: h-60 sm:h-60 md:h-60 lg:h-60 xl:h-60 2xl:h-72
    - FRP:
        href: http://localhost:7500
        description: FRP 穿透管理
        icon: network                     # 无 widget，纯链接

- Downloads:
    - qBittorrent:
        href: http://localhost:7501
        icon: qbittorrent
        widget:
          type: qbittorrent
          url: http://localhost:7501
          username: admin
          password: adminadmin
```

### widgets.yaml（信息 widget）

```yaml
---
- resources:
    label: 系统资源
    cpu: true
    memory: true
    disk: /opt/data
    uptime: true
    refresh: 3000

- search:
    provider: duckduckgo
    target: _blank
```

⚠️ **`resources` 必须放在 widgets.yaml，不是 services.yaml！** 放在 services.yaml 会显示"缺失的组件类型: resources"。

### bookmarks.yaml（书签）

```yaml
---
- NAS Services:
    - AionUi:
        - abbr: AI
          href: http://localhost:3000
    - Homepage:
        - abbr: HP
          href: http://localhost:3001

- External:
    - GitHub:
        - abbr: GH
          href: https://github.com/
```

## Uptime Kuma vs 自定义 Uptime

| 场景 | widget 类型 | 要求 |
|------|-------------|------|
| 真正的 Uptime Kuma | `uptimekuma` | 需要 `slug` 参数指向状态页 |
| 自定义 HTML 监控页 | `iframe` | 直接嵌入 HTML |

当前 Uptime 服务（端口 3002）是 Python 自定义 HTML 页面，不是 Uptime Kuma，所以用 `iframe` 嵌入。

## 常见问题

| 症状 | 原因 | 解决 |
|------|------|------|
| "缺失的组件类型: xxx" | widget 类型不存在 | 查 docs/widgets/services/ 确认支持的类型 |
| "API 错误" | 后端服务未运行 | 检查服务端口是否监听 |
| resources 不显示 | 放在了 services.yaml | 移到 widgets.yaml |
| iframe 空白 | 跨域或 URL 错误 | 用 curl 测试 URL 是否可访问 |

## 当前服务状态

| 服务 | 端口 | 状态 |
|------|------|------|
| AionUi | 3000 | ✅ 运行中 |
| Homepage | 3001 | ✅ 运行中 |
| Uptime Monitor | 3002 | ✅ 运行中（Python） |
| FRP 管理面板 | 7500 | ❌ 未监听（管理面板在云服务器） |
| qBittorrent | 7501 | ❌ 未安装/未运行 |
| FundMonitor | 8080 | ❌ 未运行 |
