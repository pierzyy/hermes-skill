---
name: frp-security-audit
description: 对公网 FRP 服务器进行安全审计——通过 FRP 仪表盘 API 检查端口暴露、认证方式、流量异常，给出加固建议
category: devops
---

# FRP 安全审计

## 审计目标

检查公网 FRP 服务器的安全性：
1. 哪些端口暴露在公网
2. 各端口的认证方式（无认证 / Basic Auth / Token / 密码）
3. 是否有扫描/攻击痕迹（异常流量、频繁连接）
4. 给出加固建议

## 前置条件

- 知道 FRPS 的公网 IP 和仪表盘端口（默认 7500）
- 拥有仪表盘管理员账号密码（`webServer.user` / `webServer.password`）

## 审计步骤

### Step 1：获取 FRPS 仪表盘 API 数据

FRP v0.69 的仪表盘根路径 `/` 重定向到 `/static/`（SPA 页面）。

已确认可用的 API 端点（区分大小写）：

```bash
# 服务器信息
curl -s -u "admin:密码" http://IP:7500/api/serverinfo

# 代理列表（按协议类型）
curl -s -u "admin:密码" http://IP:7500/api/proxy/tcp
# 如有其他代理类型可替换 tcp 为 udp/http/https
```

⚠️ **API 端点大小写敏感**：`/api/serverinfo`（小写 i）有效，`/api/serverInfo`（大写 I）返回 404。

响应为 JSON，关键字段：
- `totalTrafficIn` / `totalTrafficOut` — 总流量，异常高可能被扫描/攻击
- `clientCounts` — 客户端数量
- `curConns` — 当前活跃连接数
- 每个代理的 `todayTrafficIn` / `todayTrafficOut` — 各隧道今日流量
- `status` — "online" 或 "offline"
- `lastStartTime` / `lastCloseTime` — 最近重启/断开时间

用 `python3 -m json.tool` 格式化输出（需在终端中独立执行，不要管道链式调用）。

### ⚠️ FRP 仪表盘 API 权限说明

FRP v0.69 仪表盘 API **仅支持只读查询**，以下管理端点均返回 404：
- `/api/reload`（POST）
- `/api/stop`（POST）  
- `/api/restart`（POST）
- `/api/config`（GET）

因此**无法通过仪表盘 API 远程修改配置或重启服务**，加固操作必须通过 SSH 或云控制台完成。

### Step 2：外网端口可达性检测

```bash
for port in 7000 7500 25808 7501 3001 3002; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://IP:$port/" 2>/dev/null)
  echo "端口 $port → HTTP $code"
done
```

HTTP 000 = 超时/不可达，401 = 有认证，200 = 开放
FRP 控制端口 7000 非 HTTP 协议，用 /dev/tcp 检测：

```bash
timeout 3 bash -c 'echo > /dev/tcp/IP/7000' 2>/dev/null && echo "开放" || echo "未开放"
```

### Step 3：SSH 端口检测

```bash
timeout 3 bash -c 'echo > /dev/tcp/IP/22' 2>/dev/null && echo "SSH开放" || echo "SSH未开放"
```

### Step 4：检查认证方式

- FRP仪表盘 7500 → HTTP Basic Auth（明文传输凭据，风险中高）
- AionUi 25808 → 用户名+密码 Session 认证
- qBittorrent API → WebAPI 密码认证
- Homepage 3001 → 需单独检查
- Uptime 3002 → 无认证（只读可接受）
- SSH 22 → 密码认证（风险高）

## 风险评级

| 风险 | 条件 |
|:----:|------|
| 🔴 高 | SSH公网开放 + 密码认证；无认证的管理面板 |
| 🟡 中 | 有认证但明文传输（HTTP Basic Auth over HTTP）；弱密码 |
| 🟢 低 | 有认证 + HTTPS；或只读页面 |

## 加固建议（按优先级）

1. **SSH** — 改为高位端口 `/etc/ssh/sshd_config` 中 `Port 2222`，或限制白名单 IP
2. **FRP仪表盘加 HTTPS** — 使用自签证书或 Let's Encrypt，修改 `frps.toml` 添加 `webServer.tls.certFile` 和 `webServer.tls.keyFile`
3. **限制安全组入站 IP** — 如果 NAS 出站 IP 固定，将安全组来源从 `0.0.0.0/0` 改为具体 IP
4. **更换默认密码** — FRP仪表盘、qBittorrent、AionUi 全部用强密码
5. **FRP token 更换** — `auth.token` 改为随机字符串

## 异常流量判断

- 正常场景：uptime 监控轮询会产生少量入站流量（~12KB/天），总流量 ~50KB/天
- 异常场景：`totalTrafficIn` 突然飙升（MB/GB 级）、多个陌生客户端连接、`curConns` 持续不为 0
- 扫描痕迹：短时间大量连接到不同端口

## qBittorrent 端口混淆陷阱

当 FRP 远程端口（remotePort）与实际服务端口不一致时，容易误判服务状态：

- FRPC 配置中 qBittorrent 的 remotePort 可能不同于实际 WebUI 端口
- 真实端口（如 8888）和 FRP 映射端口（如 7501）可能指向不同实例
- **诊断方法**：先查本地服务 `ss -tlnp | grep qbittorrent`，再试实际配置文件中的 WebUI 端口
- 端口 8888 和 7501 同时存在时，常用默认密码 `adminadmin` 验证哪一个能登录

## 踩坑记录

- 百度云 BCC 的 ufw 不生效，外网防火墙需在**安全组**控制台配置
- FRP 仪表盘 API 端点因版本而异：v0.69 用 `/api/serverinfo` 和 `/api/proxy/tcp`
- 仪表盘返回 404 时尝试 `/api/status`、`/api/serverInfo` 等不同路径写法
- SSH 密码未知时可以用 `sshpass` 尝试已知密码，不要暴力穷举
