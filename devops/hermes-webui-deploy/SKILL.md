---
name: hermes-webui-deploy
description: Hermes WebUI 部署与启动——进程监控和配置仪表盘，含 token 获取、启动命令、端口配置。
---

# Hermes WebUI 部署与启动

Hermes WebUI (v1.3.1) 是 Hermes Agent 的进程监控和配置仪表盘，提供 Dashboard、Sessions、Config、Cron、Skills 等页面。

## 目录结构

```
/opt/data/hermes-webui/
├── .venv/              # Python 虚拟环境
├── frontend/dist/      # 前端构建产物（已构建）
├── webui/              # FastAPI 后端
│   ├── auth.py         # X-Hermes-Token 认证
│   ├── config.py       # 配置管理（默认端口 8643）
│   ├── server.py       # FastAPI 应用入口
│   └── ...
└── pyproject.toml
```

## 启动

```bash
cd /opt/data/hermes-webui && HERMES_HOME=/opt/data .venv/bin/python -m webui --port 8643
```

**必须设置 `HERMES_HOME=/opt/data`**，否则会去 `~/.hermes/` 找 state.db 等文件。

**必须 background 启动**（`terminal(background=true)`），否则会阻塞 tool call。

## Token 获取

Token 存储在 `/opt/data/auth.json` 的 `webui_token` 字段：

```bash
cat /opt/data/auth.json | grep webui_token
```

首次启动时如果 `auth.json` 不存在，WebUI 会自动生成 64 位 hex token 并写入。

## 认证方式

所有 API 请求需带 Header：`X-Hermes-Token: <token>`

## 端口

- 默认端口：8643
- 通过 `--port` 参数或 `HERMES_WEBUI_PORT` 环境变量修改

## 验证

```bash
ss -tlnp | grep 8643  # 确认端口监听
curl -H "X-Hermes-Token: <token>" http://localhost:8643/api/health
```

## 注意事项

- 前端已在 `frontend/dist/` 预构建，无需 `npm run build`
- 3000 端口被「爱盼-网盘资源搜索」占用，不是 Hermes WebUI
- 25610 端口（Workbench v3）当前未运行
- Mission Control 在 `/opt/data/mission-control/`，配置端口 25602，但 .env 中 AUTH_USER/AUTH_PASS 为占位符 `***`，需通过 `/setup` 页面创建管理员账户
