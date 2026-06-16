---
name: tailscale-direct-connection
description: Diagnose why Tailscale can't establish a direct P2P connection and work through the fix options in order.
category: devops
---

# Tailscale 直连诊断与修复

当 `tailscale ping <peer>` 返回 `direct connection not established` 时使用。

## 诊断：对比两端 netcheck

在两台机器上分别跑 `tailscale netcheck`，对比关键字段：

| 字段 | 正常值 | 问题值 |
|------|--------|--------|
| `UDP` | `true` | `false` → 网络封了 UDP |
| `PortMapping` | `UPnP` / `NAT-PMP` | 空 → 路由器不支持打洞 |
| `MappingVariesByDestIP` | `false` | **`true` → 对称 NAT，致命** |
| `IPv6` | `yes, 2xxx:...` | `no` / `fdxx:...`（ULA 私有）|

## 修复流程（按成功率从高到低）

### 1. 防火墙放行（双方都要做）

**Windows：** 安全中心 → 防火墙 → 允许应用 → 勾选 Tailscale 的专用+公用
或管理员 PowerShell：
```powershell
New-NetFirewallRule -DisplayName "Tailscale Full Access" -Direction Inbound -Program "C:\Program Files\Tailscale\tailscaled.exe" -Action Allow
```

**Linux：** 
```bash
iptables -I INPUT -p udp --dport 41641 -j ACCEPT
```

放行后双方重启 Tailscale，重新测试。

### 2. 路由器开 UPnP

登录路由器管理页 → 开启 UPnP（或 NAT-PMP）。如果路由器不支持 UPnP，手动做端口转发：UDP 41641 → 本机 IP。

### 3. 客户端先发起（对称 NAT 时试试）

对称 NAT 不让外面进来，但内部发起的连接能收到回复。让被对称 NAT 挡住的机器先 `tailscale ping` 对方，然后对方立刻回 ping。有时能建立短暂映射。

### 4. IPv6 直连

如果两端都有公网 IPv6（`2xxx:` 开头），Tailscale 自动走 IPv6 直连，完全绕过 IPv4 NAT。
- Windows：`ipconfig | findstr /i IPv6`
- Linux：`ip -6 addr show | grep global`

ULA（`fdxx:`）和 link-local（`fexx:`）不算公网。

### 5. 终态：接受 DERP 中继

如果两端满足以下任一条件，直连基本无解：
- 任一端 `MappingVariesByDestIP: true` 且无 UPnP
- 任一端 `PortMapping` 为空 且路由器不可控
- 两端都无公网 IPv6

此时 DERP 中继是唯一可行方案。延迟 ~100-400ms，全程 WireGuard 加密，日常可用。

## 终态判断速查

```
对称NAT + 无UPnP + 无公网IPv6 = 死心，用DERP
```

## 踩坑记录

1. 桌面端 `ncpa.cpl` 里找不到 Tailscale 网卡 → 重装 Tailscale
2. Windows 防火墙 `New-NetFirewallRule` 报 "拒绝访问" → 没以管理员身份运行 PowerShell
3. `tailscale set --randomize-client-port` 不存在 → 部分版本没有此参数，用 `tailscale up --help` 确认
4. 公司网络对称 NAT 无解 → 直接跳过排查，确认 `netcheck` 即可下结论
