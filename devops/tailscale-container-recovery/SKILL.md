---
name: tailscale-container-recovery
description: "Diagnose and recover Tailscale: container startup/recovery, direct connection troubleshooting (DERP relay -> NAT/firewall fix), zombie process management, Windows peer firewall configuration."
category: devops
---

# Tailscale Container Recovery

For recovering Tailscale in the NAS container environment where Hermes runs as PID 1.

## Diagnosis

```bash
# Check if tailscale is working
tailscale status

# Check backend state
tailscale status --json | python3 -c "import sys,json; d=json.load(sys.stdin); print('BackendState:', d.get('BackendState'))"

# Check for zombies
ps aux | grep "[t]ailscale"
```

Key indicators:
- `BackendState: NeedsLogin` + all-zero public key → state file corrupted, node identity lost
- Multiple `<defunct>` processes → stale tailscale/tailscaled zombies
- `Logged out` → needs re-auth

## Recovery Procedure

1. **Kill the current tailscaled** (check PID from ps output)
2. **Start fresh tailscaled:**
   ```bash
   tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state &>/tmp/tailscaled.log &
   ```
3. **Trigger authentication:**
   ```bash
   tailscale up --accept-routes 2>&1
   ```
   This outputs a login URL. User must visit it in a browser to authenticate.
4. **Verify:** `tailscale status` should show online nodes.

## Direct Connection Troubleshooting

When `tailscale ping <peer>` shows all pongs via DERP relay and "direct connection not established":

### Step 1: Check both sides
```bash
# NAS side
tailscale netcheck 2>&1 | grep -E "UDP|PortMapping|MappingVaries"
```
Good signs: `UDP: true`, `PortMapping: UPnP` or `NAT-PMP`, `MappingVariesByDestIP: false`.
If PortMapping is empty → router doesn't support automatic port mapping.

### Step 2: Windows firewall (on the desktop peer)
Two methods — try GUI first if PowerShell admin access is an issue:

**Method A (GUI):** Windows 安全中心 → 防火墙和网络保护 → 允许应用通过防火墙 → 更改设置 → 找到 Tailscale → 勾选「专用」和「公用」两列 → 确定。

**Method B (CLI as Administrator):**
```powershell
New-NetFirewallRule -DisplayName "Tailscale Full Access" -Direction Inbound -Program "C:\Program Files\Tailscale\tailscaled.exe" -Action Allow
```

Then restart Tailscale: tray icon → Exit → reopen from Start menu.

### Step 3: Windows Tailscale adapter (if missing in network list)
- `Win+R` → `ncpa.cpl` → look for Tailscale adapter
- If missing: reinstall Tailscale from tailscale.com

### Step 4: Router UPnP
Both ends need UPnP or NAT-PMP enabled on their routers. If either side has symmetric NAT or no UPnP, direct connection will fall back to DERP relay. Run `tailscale netcheck` on the peer that can't connect directly to check their NAT type.

## Zombie Management

- PID 1 in this container is the Hermes Python process, NOT a standard init.
- Hermes does NOT have a SIGCHLD handler → zombie children of PID 1 are never automatically reaped.
- Zombies consume zero memory/CPU, only a PID slot. They're harmless.
- **Cannot be cleaned from outside** — `os.waitpid()` and `SIGCHLD` don't work because only the parent (PID 1) can reap.
- Using gdb to attach to PID 1 would freeze the entire container.
- They disappear on container restart.
- To permanently fix: add SIGCHLD handler to the Hermes gateway process.

## Keepalive

tailscaled 在容器环境经常意外退出。建议设置 cron 保活（用 `tailscale status` 检测，不能用 pgrep 同样会误报）：

```bash
# cron job: 如果 tailscale status 返回 "doesn't appear to be running"，重启 tailscaled
tailscale status 2>&1 | grep -q "doesn't appear" && {
  tailscaled --tun=userspace-networking --state=/var/lib/tailscale/tailscaled.state &>/tmp/tailscaled.log &
  sleep 3
  tailscale up --accept-routes 2>&1
}
```

## userspace-networking 限制

容器 `--tun=userspace-networking` 模式下，**本机 Tailscale IP 无法回环**（curl 100.x.x.x 超时）。内部访问本机服务需用 `tailscale serve`，外部客户端也应使用 MagicDNS 域名而非 IP。
