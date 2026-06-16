---
name: watchdog-daemon-keepalive
title: Watchdog 守护进程保活方案
description: 用 Python 守护进程替代 Hermes cron 做进程保活，零 LLM token 消耗。适用于任何需要定期检查进程并自动重启的场景。
---

# Watchdog 守护进程保活方案

## 适用场景

Hermes cron 的保活任务（FRP、AionUi、基金代理等）每次运行都走 LLM，即使只是执行一条 `pgrep` 命令，每个回合也消耗 ~200+ 输入 token + 输出 token。高频保活任务（每 2-5 分钟）日积月累就是数万 token 浪费。

**解决方案：** 用纯 Python 守护进程做保活，每 N 秒检查一次进程，挂了就重启。零 LLM token，零 Hermes cron 开销。

## 模板脚本

```python
#!/usr/bin/env python3
"""
Watchdog 守护进程 —— 纯本地保活，零 token 消耗。
每 INTERVAL 秒检查一次进程，挂了就重启。
日志写 LOG_FILE
"""

import subprocess
import time
import sys
import os
from datetime import datetime

LOG_FILE = "/opt/data/cron/output/watchdog.log"
INTERVAL = 120  # 检查间隔（秒）

SERVICES = {
    "frpc": {
        "pgrep": ["pgrep", "-f", "frpc -c /path/to/frpc.toml"],
        "start": ["/path/to/frpc", "-c", "/path/to/frpc.toml"],
    },
    "my_service": {
        "pgrep": ["pgrep", "-f", "my_service"],
        "start": ["nohup", "python3", "/path/to/my_service.py"],
    },
}

def log(msg):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    ts = datetime.now().strftime("%m-%d %H:%M:%S")
    with open(LOG_FILE, "a") as f:
        f.write(f"[{ts}] {msg}\n")

def check_and_restart():
    for name, cfg in SERVICES.items():
        ret = subprocess.run(cfg["pgrep"], capture_output=True)
        if ret.returncode != 0:
            try:
                subprocess.Popen(
                    cfg["start"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                log(f"{name}: 已重启")
            except Exception as e:
                log(f"{name}: 重启失败 - {e}")

if __name__ == "__main__":
    log("Watchdog 守护进程启动")
    while True:
        try:
            check_and_restart()
        except Exception as e:
            log(f"检查异常: {e}")
        time.sleep(INTERVAL)
```

## 部署步骤

```bash
# 1. 保存脚本并启动
nohup python3 /path/to/watchdog.py > /dev/null 2>&1 &

# 2. 检查是否运行
pgrep -f watchdog.py

# 3. （可选）添加一个每 30 分钟的 Hermes cron 保活，防止 watchdog 自己被杀死
#    用 Hermes cron 创建，prompt 只需：
#    检查 watchdog.py 是否存活。执行：`pgrep -f watchdog.py && echo ALIVE || echo DEAD`
#    如果输出 DEAD，执行：`nohup python3 /path/to/watchdog.py > /dev/null 2>&1 &`
#    其他情况回答 [SILENT]
```

## 坑 & 经验教训（2026-06 实测）

### 🔥 现象：Token 消耗暴涨

客户 was using 4 keepalive Hermes cron jobs (FRP 保活、Uptime 保活、AionUi 保活、基金代理保活)，每 2-5 分钟跑一次。当 API key 余额耗尽后：
- **35 次失败** → 每次重试 3 次 → **~721K tokens 浪费**
- **14,954 个 cron 会话文件** → 磁盘空间被吞
- 6 月 1 日单日疯狂重试 29 次 → **~600K tokens 烧光**

### 🔑 排查步骤（遇到未预期的 token 暴涨时）

1. **检查 API key 是否有效**：
   ```
   curl -s https://api.deepseek.com/v1/user/balance \
     -H "Authorization: Bearer $KEY"
   ```
   注意：config.yaml 中的 `api_key` 可能被 Hermes 显示为缩写（如 `sk-6bf...521e`），需要用 `od -c` 看原始字节确认完整 key

2. **检查 API key 是否被替换**：gateway 可能用了旧 key（环境变量或旧配置缓存）。对比 config.yaml 中的 key 和实际 API 请求中的 key

3. **统计 cron 失败日志**：
   ```bash
   grep 'HTTP 402' /opt/data/logs/agent.log
   grep 'Session hygiene' /opt/data/logs/agent.log
   ```

4. **检查 cron 会话文件数量**：
   ```bash
   ls /opt/data/sessions/session_cron_* | wc -l
   ls /opt/data/sessions/ | du -sh /opt/data/sessions/
   ```

### 🧹 清理旧 cron 会话文件

切换到 watchdog 后，需要手动删除旧的 cron 会话文件（Hermes 不会自动清理）：
```bash
# 按 cron job ID 删除
rm -f /opt/data/sessions/session_cron_62e1db134d99_*  # 基金代理保活
rm -f /opt/data/sessions/session_cron_6b5cf4d0a6aa_*  # FRP保活
rm -f /opt/data/sessions/session_cron_5ab8476fe1c5_*  # Uptime保活
rm -f /opt/data/sessions/session_cron_ac6a4189f35a_*  # AionUi保活
```

### ⚠️ 注意事项

- **每 30 分钟**一次 Hermes cron 检查 watchdog 自身存活，约 30-50 次/天 × ~250 token = ~7.5K-12.5K token/天，远低于每 2 分钟跑 LLM 方案（~576K token/天）
- watchdog.py 的日志轮转：长时间运行日志可能膨胀，可在脚本内加日志文件大小检查或交给 logrotate
- 如果容器重启，watchdog 会丢失。需要保证 Hermes cron 的保活在 gateway 启动后能重新拉起 watchdog
- 使用 `nohup` + `>/dev/null 2>&1 &` 确保守护进程在后台稳定运行
- **Hermes cron 会保存每次运行的 session 到磁盘**。即使 prompt 很短、[SILENT] 返回，每个文件也有 60KB+。长时间高频 cron 会产生数千个文件占用数 GB 空间
