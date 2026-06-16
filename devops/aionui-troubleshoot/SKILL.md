---
name: aionui-troubleshoot
description: AionUi 常见问题排查与修复——登录失败、密码重置、进程状态诊断、数据库操作
category: devops
---

# AionUi 故障排查

## 触发条件
- AionUi WebUI 登录失败（用户名密码错误/401）
- 需要重置 admin 密码
- AionUi 进程异常需要诊断

## 关键路径

| 文件/路径 | 用途 |
|-----------|------|
| `/opt/data/home/.aionui-web/aionui-backend.db` | SQLite 数据库（用户、会话、配置） |
| `/opt/data/home/.aionui-web/logs/` | AionCore 日志（按日期命名） |
| `/opt/data/aionui-web-standalone/` | AionUi Web 前端 + bundled-aioncore |

## 进程检查

```bash
pgrep -la aion
# 应有2个进程：
# 1. aionui-web start --remote --port 25808  (Web 前端)
# 2. aioncore --port 35223                     (后端核心)

# 快速健康检查
curl -s -o /dev/null -w "HTTP %{http_code}" --connect-timeout 5 http://localhost:25808/
# 预期: HTTP 200
```

## 密码重置（登录失败）

### 1. 确认问题

查看登录日志：
```bash
grep -E "login.*401|login.*403" /opt/data/home/.aionui-web/logs/$(date +%Y-%m-%d).aioncore.log | tail -5
```

检查用户表：
```bash
python3 -c "
import sqlite3, datetime
conn = sqlite3.connect('/opt/data/home/.aionui-web/aionui-backend.db')
u = conn.execute('SELECT username, password_hash, updated_at FROM users').fetchall()
for r in u:
    print(f'User: {r[0]}, Updated: {datetime.datetime.fromtimestamp(r[1]/1000)}')
conn.close()
"
```

### 2. 重置密码

如果 bcrypt 不可用，先安装：
```bash
apt-get install -y python3-bcrypt
# 或 pip install bcrypt --break-system-packages（当 apt 不可用时）
```

重置为临时密码：
```bash
python3 -c "
import bcrypt, sqlite3, time
password = b'admin123'  # 临时密码，登录后让用户修改
hashed = bcrypt.hashpw(password, bcrypt.gensalt(rounds=12)).decode()
conn = sqlite3.connect('/opt/data/home/.aionui-web/aionui-backend.db')
conn.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?',
             (hashed, int(time.time() * 1000), 'admin'))
conn.commit()
conn.close()
print('密码已重置: admin / admin123')
"
```

### 3. 验证

让用户在 WebUI 上用新密码登录，登录后提醒去设置里修改密码。

## Hermes ACP 连接修复（AionUi 中找不到 Hermes）

### 症状
AionUi WebUI 登录后看不到 Hermes agent。

### 根因
`hermes` 命令不在系统 PATH 中，AionUi 无法通过 ACP 协议启动 Hermes。

### 诊断
```bash
which hermes                          # 确认命令是否可用
ls /opt/hermes/.venv/bin/hermes       # 查找 venv 中的安装
```

### 修复
```bash
# 创建符号链接到系统 PATH
ln -sf /opt/hermes/.venv/bin/hermes /usr/local/bin/hermes

# 验证 ACP 协议是否正常
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":1,"clientInfo":{"name":"test","version":"1.0"}}}' | timeout 5 hermes acp 2>&1
# 预期输出包含: "Initialize from test (protocol v1)"
```

## AionUi 重启流程 ⚠️ 铁律：只启动 aionui-web，让它自己管理 aioncore

**禁止手动同时启动 aioncore** — aionui-web 启动时会自动 spawn 自己的 aioncore。手动启动两个 aioncore 会导致端口冲突，登录返回 `BACKEND_UNREACHABLE`。这是最容易踩的坑。

```bash
# 1. 彻底停止所有相关进程
pkill -9 -f aionui-web; pkill -9 -f aioncore; pkill -9 -f "hermes acp"; sleep 2
pgrep -la aion && echo "仍有残留，手动 kill -9 <PID>" || echo "已清理"

# 2. 只启动 aionui-web（它会自动 spawn aioncore）
nohup /opt/data/aionui-web-standalone/aionui-web start --remote --port 25808 \
  > /dev/null 2>&1 &
sleep 6

# 3. 验证 — 直接测登录（而非仅 HTTP）
curl -s -X POST http://localhost:25808/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('success') else 'FAIL: '+d.get('error',''))"
# 成功: OK
# 失败: FAIL: BACKEND_UNREACHABLE → 重复步骤 1-2

# 4. 有 FRP 穿透时必须重启 frpc（隧道会因 aioncore 重启断开）
pkill frpc; sleep 1
nohup /opt/data/frp/frpc -c /opt/data/frp/frpc.toml > /dev/null 2>&1 &
sleep 3; pgrep frpc && echo "frpc OK" || echo "frpc FAIL"
```

## BACKEND_UNREACHABLE 诊断

登录返回 `{"error":"BACKEND_UNREACHABLE"}` (HTTP 502) 表示 aioncore 没有正确启动。直接 API 测试确认：

```bash
curl -s -w "\nHTTP %{http_code}" -X POST 'http://localhost:25808/login' \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
# 成功: {"success":true,...} + HTTP 200
# 失败: {"error":"BACKEND_UNREACHABLE"} + HTTP 502 → 重启 AionUi
```

## 对话卡在"正在处理中"（ACP session 污染）

### 症状
- 对话一直显示"正在处理中"，新消息排队不执行
- 日志显示 `Agent process exited (signal:15)` → `ACP protocol not connected`
- Hermes ACP 进程存在但不响应

### 根因
Hermes ACP 启动时从自己的 session DB 恢复了**错误的旧会话**（可能属于其他对话），导致 AionUi 和 Hermes 会话 ID 不匹配，通信中断。

### 诊断
```bash
# 看 AionUi 认为的 ACP session 映射
python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/data/home/.aionui-web/aionui-backend.db')
for s in conn.execute('SELECT conversation_id, session_id, session_status FROM acp_session').fetchall():
    print(s)
conn.close()
"

# 看 AionUi 日志中的 ACP 错误
grep 'ACP\|exited\|protocol not connected' /opt/data/home/.aionui-web/logs/$(date +%Y-%m-%d).aioncore.log | tail -10
```

### 修复：彻底清除 ACP session（双侧清理 + state.db）

**这是最关键步骤** — Hermes ACP 把 session 持久化在 `/opt/data/state.db`（`source='acp'`），
即使清空 AionUi 的 `acp_session` 表，Hermes 重启后仍会从 state.db 恢复旧 session，导致问题反复。

```bash
# 1. 停止所有进程
pkill -9 -f "hermes acp"; pkill -9 -f aionui-web; pkill -9 -f aioncore; sleep 2

# 2. 清理 AionUi 侧
python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/data/home/.aionui-web/aionui-backend.db')
conn.execute('DELETE FROM acp_session')
conn.execute(\"UPDATE conversations SET status='finished'\")
conn.commit(); conn.close()
print('AionUi DB cleaned')
"

# 3. ⚠️ 清理 Hermes state.db（关键！之前漏掉这一步导致反复卡住）
python3 -c "
import sqlite3
conn = sqlite3.connect('/opt/data/state.db')
rows = conn.execute(\"SELECT id FROM sessions WHERE source='acp'\").fetchall()
for r in rows:
    conn.execute('DELETE FROM messages WHERE session_id=?', (r[0],))
    conn.execute('DELETE FROM sessions WHERE id=?', (r[0],))
conn.commit()
print(f'Deleted {len(rows)} ACP sessions from state.db')
conn.close()
"

# 4. 重启 AionUi（只启动 aionui-web！）
nohup /opt/data/aionui-web-standalone/aionui-web start --remote --port 25808 > /dev/null 2>&1 &
sleep 6
curl -s -X POST http://localhost:25808/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('success') else 'FAIL')"

# 5. 重启 frpc（隧道因 aioncore 重启断开）
pkill frpc; sleep 1
nohup /opt/data/frp/frpc -c /opt/data/frp/frpc.toml > /dev/null 2>&1 &

# 6. ⚠️ 用户操作：刷新页面后「先切换到其他对话，再切回来」
# AionUi 检测到无 ACP session 才会创建新连接
```

## Mimo 模型 CLI 卡住 / 返回空响应

### 症状
- Hermes ACP 日志显示 `⚠️ Empty response from model — retrying (N/3)`
- AionUi 中对话长时间无输出

### 根因
Mimo 模型（xiaomi provider）有「推理优先」机制：先输出 `reasoning_content`，后输出 `content`。如果 `max_tokens` 太小，推理阶段吃掉所有配额，`content` 为空。

### 修复
在 `/opt/data/config.yaml` 的 xiaomi provider 添加：
```yaml
xiaomi:
  api_key: sk-xxx
  base_url: https://api.xiaomimimo.com/v1
  models:
  - mimo-v2.5-pro
  max_tokens: 16384  # 推理+回答都需要空间，8192 不够（实测复杂问题推理吃光后 content 为空）
  timeout: 600       # 10分钟超时，推理可能更长
```

验证 API 是否正常：
```bash
curl -s https://api.xiaomimimo.com/v1/chat/completions \
  -H "Authorization: Bearer $(grep -A3 'xiaomi:' /opt/data/config.yaml | grep api_key | sed 's/.*api_key: //')" \
  -d '{"model":"mimo-v2.5-pro","messages":[{"role":"user","content":"1+1=?"}],"max_tokens":200}' | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'][:100])"
```

## AionUi 全新启动后密码随机 — 专项排查

### 症状
- AionUi 刚重启，能打开登录页但 `admin` / `admin123` 登录失败
- `/api/auth/status` 返回 `user_count: 1, needs_setup: false`

### 根因
当 `.aionui-web` 目录被清除或首次创建时，aioncore 创建全新 `aionui-backend.db`，`admin` 用户自动创建但密码是随机 bcrypt hash。**不是** `admin123`。

### 修复
```bash
# 1. 确认数据库存在
ls -la /opt/data/home/.aionui-web/aionui-backend.db

# 2. 重置密码（必须用 Python，容器无 sqlite3 CLI）
python3 -c "
import bcrypt, sqlite3
password = b'admin123'
hashed = bcrypt.hashpw(password, bcrypt.gensalt(rounds=12)).decode()
conn = sqlite3.connect('/opt/data/home/.aionui-web/aionui-backend.db')
conn.execute('UPDATE users SET password_hash = ? WHERE username = ?', (hashed, 'admin'))
conn.commit()
conn.close()
print('密码已重置: admin / admin123')
"

# 3. 验证
python3 -c "
import bcrypt, sqlite3
conn = sqlite3.connect('/opt/data/home/.aionui-web/aionui-backend.db')
row = conn.execute(\"SELECT password_hash FROM users WHERE username='admin'\").fetchone()
print('Verify:', bcrypt.checkpw(b'admin123', row[0].encode()))
"
```

## 踩坑记录

- AionUi 的 `local mode`（`Running in local mode — authentication is disabled`）只在本地直接访问时生效，通过 FRP 穿透仍需认证
- `updated_at` 时间戳是毫秒级，用 `datetime.datetime.fromtimestamp(ts/1000)` 转换
- 数据库中的密码哈希格式为 bcrypt `$2b$12$...`
- `python3-bcrypt` 可通过 `apt-get install` 获得，比 pip 更稳定
- **hermes 命令不在 PATH** 是 AionUi 找不到 Hermes 的常见原因，ACP 初始化需要 `hermes acp` 可执行
- **⚠️ 重启铁律**：只启动 aionui-web，禁止手动启动 aioncore。aionui-web 自己 spawn aioncore，手动启动会导致端口冲突→BACKEND_UNREACHABLE
- **⚠️ FRP 双配置文件陷阱**：新版 frpc 用 `frpc.toml`，旧版用 `frpc.ini`。容器重启/重建后 `frpc.ini` 丢失但 `frpc.toml` 保留。启动命令必须用 `frpc -c /opt/data/frp/frpc.toml`，用 `.ini` 会报 `no such file or directory`
- AionUi 重启后 frpc 隧道必然断开（aioncore 端口变化），必须同时重启 frpc
- **read_file 显示脱敏 API key**：`sk-cqg...m1ef` 是截断版本，patch 时 old_string 不能用它，会覆盖真实 key。需从 diff 中恢复完整 key
- **ACP session 污染**：Hermes 启动时从本地 DB 恢复旧 session，可能与 AionUi 侧 conversation_id 不匹配导致"protocol not connected"。修复需清空双侧 session 表 + 重启 + **用户切换对话**
- **Mimo 推理占 token**：Mimo streaming 先吐 reasoning 后吐 content，max_tokens < 16384 时高概率 content 为空（8192 也不够！）
- **卡住对话恢复后**：清空 ACP session 后，用户必须**先切换到其他对话再切回来**，AionUi 才会创建新 ACP 连接
- **🔴 ACP session 持久化在 state.db**：Hermes 把 session 存在 `/opt/data/state.db`（`source='acp'`），仅清 AionUi 的 `acp_session` 表不够，必须同时清 state.db 中的 ACP sessions，否则重启后自动恢复→对话反复卡住
- **🔴 AionUi 全新启动 = 全新数据库 + 随机密码**：当清除整个 `.aionui-web` 目录后重启，aioncore 创建全新 `aionui-backend.db`，`admin` 用户自动创建但密码是随机 bcrypt hash，**不是** `admin123`。每次重启后必须检查并用 Python 重置密码，不能假设密码继承
- **容器 PID 1 无法杀死**：`hermes gateway run` 是容器 PID 1（init 进程），`kill -15 1` 被内核静默忽略。要重启 gateway 只能重启容器自身。改 Hermes 配置后**重启 AionUi**（强制重建 ACP 连接）来让新配置生效
- **容器无 sqlite3 CLI**：所有 DB 操作必须用 Python `sqlite3` 模块，不能用 `sqlite3` 命令
