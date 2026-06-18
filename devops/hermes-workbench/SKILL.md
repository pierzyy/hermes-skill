---
name: hermes-workbench
description: Hermes Workbench — 统一管理面板（Streamlit），含会话管理、子Agent追踪、NAS+云端双视图、Cron/技能/进程管理。端口25610。WebUI端口25603。
version: 10.1.0
---

# Hermes Workbench

Streamlit 管理面板，替代 AionUi 的轻量级方案。AionUi 风格：侧边栏会话卡片 + 右侧对话 + 顶栏管理模块。

## 启动

```bash
cd /opt/data/workbench-streamlit && \
.venv/bin/streamlit run app.py --server.port 25610 --server.address 0.0.0.0 --server.headless true &
```

## 保活

已迁移到 crontab（由 watchdog cron 统一管理），每 5 分钟检测：

```bash
*/5 * * * * /opt/data/workbench-streamlit/keepalive.sh
```

`keepalive.sh` 内容：检测 25610 端口，挂了就 `nohup` 拉起。

## 功能

| 区域 | 内容 |
|------|------|
| 侧边栏 | 新建对话（NAS/云端 + 模型选择）+ 活跃会话毛玻璃卡片 |
| 顶栏 | 历史会话 / 技能 / Cron / 进程 |
| 主区域 | 干净对话输出（过滤系统内部信息） |

## 关键文件

- `/opt/data/workbench-streamlit/app.py` — 主应用（注意：文件名是 app.py，不是 workbench_v9.py）
- `/opt/data/workbench-streamlit/.venv/` — Python 虚拟环境

## 云端 Hermes

- 路径: `/usr/local/bin/hermes` (v0.16.0)
- state.db: `/root/.hermes/profiles/cloud/state.db`
- 历史会话: 通过 `get_cloud_sessions()` / `get_cloud_messages()` SSH 拉取云端 state.db，在历史视图分 NAS/云端 两段显示

## 输出获取（从 state.db 读取，不解析终端）

**核心策略：Hermes 原生把干净回复存在 `state.db` 的 `messages.content` 字段，直接读数据库即可。AionUi / Mission Control / Hermes Studio 都是这样做的。**

### run_hermes 架构

```python
def run_hermes(query, model, target="NAS", resume_sid=None):
    """返回 (clean_content, session_id)。
    执行完成后从 state.db 直接读取 assistant 消息，不解析终端输出。"""
    # 1. 执行 hermes chat -q 命令
    # 2. 从 stdout 提取 session ID (regex: hermes --resume (\S+))
    # 3. 从 state.db 读取最后一条 assistant 消息
    # 4. 返回 (clean_content, sid)
```

### 辅助函数

```python
def _read_last_assistant(sid):
    """从 NAS state.db 读取指定 session 的最后一条 assistant 消息"""
    conn = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
    row = conn.execute(
        "SELECT content FROM messages WHERE session_id = ? AND role = 'assistant' ORDER BY timestamp DESC LIMIT 1",
        (sid,)
    ).fetchone()
    return row[0] if row else ""

def _read_last_assistant_cloud(sid):
    """从云端 state.db 读取指定 session 的最后一条 assistant 消息（通过 SSH sqlite3）"""
    r = subprocess.run(["ssh", ..., f"sqlite3 '{CLOUD_STATE_DB}' \"SELECT content FROM messages WHERE session_id = '{sid}' AND role = 'assistant' ORDER BY timestamp DESC LIMIT 1\""], ...)
    return r.stdout.strip()
```

### 关键教训

- ❌ 不要用正则解析终端输出 — 不同模型/环境输出格式不同，云端 NAS 格式也不同，硬解析脆弱且不可维护
- ✅ `state.db` 的 `messages.content` 字段存的已经是纯文本回复，零噪音
- ✅ 历史视图的 `clean_output` 保留用于兼容旧数据，新建对话不再调用
- ✅ 云端 `resume_display: minimal` 减少恢复会话时的冗余输出
- ✅ 云端 `tirith_enabled: false` 消除安全扫描器不可用警告

## 紧凑聊天 CSS（AionUi 风格）

```css
[data-testid="stChatMessage"] { padding: 0.3rem 0.5rem !important; margin-bottom: 0.15rem !important; }
[data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] { font-size: 0.78rem !important; line-height: 1.35 !important; }
[data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] p { margin: 0.15rem 0 !important; font-size: 0.78rem !important; line-height: 1.35 !important; }
[data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] ul,
[data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] ol { margin: 0.15rem 0 !important; padding-left: 1.2rem !important; }
[data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] li { margin: 0.05rem 0 !important; font-size: 0.78rem !important; line-height: 1.35 !important; }
[data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] code { font-size: 0.7rem !important; }
[data-testid="stChatMessage"] [data-testid="stMarkdownContainer"] pre { margin: 0.3rem 0 !important; font-size: 0.7rem !important; }
[data-testid="stChatMessage"] .stCaption { font-size: 0.6rem !important; margin-bottom: 0.1rem !important; }
```

## 会话管理（关键架构）

### run_hermes 签名

```python
def run_hermes(query, model, target="NAS", resume_sid=None):
    """返回 (clean_content, session_id)。
    执行完成后从 state.db 直接读取 assistant 消息，不解析终端输出。"""
```

### 核心教训

- **每次 `hermes chat -q` 都会在 state.db 创建新 session** — 必须捕获真实 session ID 并用于后续 `--resume`
- **语法必须是 `hermes chat --resume SID`**，不是 `hermes --resume SID`（漏了 `chat` 子命令会导致参数解析错误）
- **每个虚拟卡片独立管理真实 session ID** — 用 `st.session_state.real_sids = {sid: real_sid}` 字典，不能用全局变量
- **删除卡片时清理** — `st.session_state.real_sids.pop(to_remove, None)`
- **输入框清空** — 用计数器做 key 后缀 `f"followup_{sid}_{ctr}"`，提交后 `ctr += 1` 让 Streamlit 重建 widget
- **返回的 content 已是纯文本** — 调用方不需要再 `clean_output()`，直接 `st.markdown(content)` 即可

### 为什么会出现重复历史记录

每次 `hermes chat -q` 创建新 session → state.db 里多一条记录 → 历史会话列表出现重复。修复后首次用 `chat -q`，后续用 `chat --resume`，整个对话只占一条 session 记录。

- 卡片本身是按钮（整块可点击 = 跳转到对话），不再用 HTML div + 单独"查看"按钮
- 左侧 `⋮` 竖三点 popover 按钮，点击弹出重命名/删除菜单
- 重命名：输入新名称后点 ✓ 确认，保存到 `custom_names` 并持久化
- 删除：移除卡片、清理 chat_history/real_sids/custom_names 并持久化
- 按钮 CSS：毛玻璃效果（`backdrop-filter: blur(12px)`）、hover 高亮、active 青色边框

## 会话持久化

所有活跃会话数据持久化到 `/opt/data/workbench-streamlit/open_chats.json`，Workbench 重启后自动恢复：

```python
PERSIST_FILE = Path("/opt/data/workbench-streamlit/open_chats.json")

def load_persist():
    """从磁盘加载持久化的会话数据"""
    if PERSIST_FILE.exists():
        try:
            return json.loads(PERSIST_FILE.read_text())
        except: pass
    return {"open_chats": [], "custom_names": {}, "real_sids": {}, "chat_history": {}}

def save_persist():
    """将会话数据持久化到磁盘"""
    data = {
        "open_chats": st.session_state.open_chats,
        "custom_names": dict(st.session_state.custom_names),
        "real_sids": dict(st.session_state.real_sids),
        "chat_history": {k: v for k, v in st.session_state.chat_history.items()},
    }
    PERSIST_FILE.parent.mkdir(parents=True, exist_ok=True)
    PERSIST_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))
```

### 持久化时机

每次以下操作后调用 `save_persist()`：
- 新建对话卡片
- 重命名卡片
- 删除卡片
- 收到 assistant 回复（首次 + 后续 followup）

### 初始化

```python
_persist = load_persist()
if "open_chats" not in st.session_state:
    st.session_state.open_chats = _persist.get("open_chats", [])
if "chat_history" not in st.session_state:
    st.session_state.chat_history = _persist.get("chat_history", {})
if "real_sids" not in st.session_state:
    st.session_state.real_sids = _persist.get("real_sids", {})
if "custom_names" not in st.session_state:
    st.session_state.custom_names = _persist.get("custom_names", {})
```

### 关键教训

- ❌ 不要依赖 Streamlit session_state 持久化 — 进程重启后全部丢失
- ✅ 每次 mutation 后立即 `save_persist()`，不要等 rerun 结束时再存
- ✅ `chat_history` 的值是 list of dicts，JSON 序列化无问题
- ✅ 自定义名称用 `custom_names` dict 存储，`display_name = custom_names.get(cid, title[:30])`

## 🔴 三大架构陷阱（2025-06-18 修复）

### 陷阱1：消息渲染顺序 — 思考指示器必须在消息之后

**症状**: 用户提交消息后，消息不显示在对话框中，要等模型回复后才出现。有时原有对话还会消失。

**根因**: 思考指示器检查（`proc.poll() is None`）在消息渲染循环**之前**执行，发现进程还在跑就 `st.rerun()`，导致消息从未被渲染。

**修复**: 先渲染 `chat_history` 中的所有消息，**再**检查思考状态。

```python
# ✅ 正确顺序
for msg in st.session_state.chat_history.get(sid, []):  # 先渲染
    ...
proc_info = st.session_state.running_procs.get(sid)
if proc_info and proc_info["proc"].poll() is None:       # 再检查
    st.markdown(thinking_indicator)
    time.sleep(0.5)
    st.rerun()
```

### 陷阱2：NAS/云端分支缺失 — 云端对话走NAS命令

**症状**: 用户在 Workbench 选择"云端"新建对话，但 Hermes 回答的还是 NAS 环境（绿联 Docker 容器），云端服务器根本没被连接。

**根因**: `pending` 和 `followup` 两处代码硬编码了 NAS 的 `HERMES_BIN` 和本地 `subprocess.Popen`，完全忽略了 `target` 字段。

**修复**: 根据 `target` 分支处理：
- `target == "云端"` → SSH 到云端执行 `hermes chat`
- `target == "NAS"` → 本地 `subprocess.Popen`

```python
if target == "云端":
    safe_q = query.replace("'", "'\\''")
    ssh_cmd = f"hermes chat -q '{safe_q}' -m {model} --source workbench"
    proc = subprocess.Popen(["ssh", ..., f"{CLOUD_USER}@{CLOUD_HOST}", ssh_cmd], ...)
else:
    cmd = [HERMES_BIN, "chat", "-q", query, "-Q", "-m", model, "--source", "workbench"]
    proc = subprocess.Popen(cmd, env=env, ...)
```

### 陷阱3：全局监控读错数据库 — 云端回复去NAS读

**症状**: 多个活跃对话（NAS+云端）的回复可能串到不属于自己的对话框。

**根因**: 全局进程监控循环（第663行）对所有完成的进程统一调用 `_read_last_assistant()`，该函数只读 NAS 的 `/opt/data/state.db`。云端 Hermes 的回复存在云端的 `state.db` 里，全局循环去 NAS 读 → 读不到 → 或者读到其他 NAS 会话的回复 → 串线。

**修复**: 在 `running_procs` 中存储 `target` 字段，全局循环根据它选择读取函数：

```python
st.session_state.running_procs[sid] = {
    "proc": proc, "real_sid": resume, "output": "",
    "target": target  # ← 必须存储！
}

# 全局循环中：
target = pinfo.get("target", "NAS")
if target == "云端":
    content = _read_last_assistant_cloud(real_sid)
else:
    content = _read_last_assistant(real_sid)
```

### 核心教训

- **任何涉及 `target` 的分支逻辑必须在三处同步**：pending 启动、followup 发送、全局监控收尾。漏一处就出 bug。
- **全局监控循环是"收尾"逻辑**，它不创建进程，只读取已完成进程的结果。但它必须知道进程当初是用哪个 target 启动的。
- **Streamlit 的 `st.rerun()` 是双刃剑**：它让轮询成为可能，但如果在渲染之前就 rerun，渲染代码永远不会执行。

## 紧凑下拉框 CSS（强制所有层级）

Streamlit selectbox 有多层嵌套 div，必须全部加 `height: 26px !important`：

```css
div[data-testid="stSelectbox"] > div { height: 26px !important; }
div[data-testid="stSelectbox"] > div > div { height: 26px !important; padding: 0 2px !important; }
div[data-testid="stSelectbox"] > div > div > div { height: 26px !important; font-size: 0.72rem !important; line-height: 26px !important; }
div[data-testid="stSelectbox"] [data-baseweb="select"] { height: 26px !important; }
div[data-testid="stSelectbox"] [data-baseweb="select"] > div { height: 26px !important; padding-top: 0 !important; padding-bottom: 0 !important; }
div[data-testid="stSelectbox"] [data-baseweb="select"] span { font-size: 0.72rem !important; line-height: 26px !important; }
div[data-testid="stSelectbox"] [data-baseweb="select"] input { height: 26px !important; font-size: 0.72rem !important; }
```
