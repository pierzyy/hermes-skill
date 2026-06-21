---
name: hermes-workbench
description: Hermes Workbench — 统一管理面板（Streamlit），含会话管理、子Agent追踪、NAS+云端双视图、Cron/技能/进程管理。端口25610。WebUI端口25603。
version: 12.0.0
last_updated: 2026-06-19
changes: |
  v12.0.0: 流式展示最终版 — CSS column-reverse 自动滚底替代 st.components.v1.html iframe，
  每条消息 st.container(key=...) 包裹解决 DOM 复用错乱，
  实时保存 stream_data 到 session_state 确保重启不丢失，
  移除所有 JS 方案（Streamlit 过滤 script 标签）
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
- state.db: `/root/.hermes/state.db`（⚠️ 不是 `/root/.hermes/profiles/cloud/state.db`！）
- 云端需要安装 sqlite3（默认不装）
- 历史会话: 通过 `get_cloud_sessions()` / `get_cloud_messages()` SSH 拉取云端 state.db
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
if proc_info and proc_info[\"proc\"].poll() is None:       # 再检查
    st.markdown(thinking_indicator)
    time.sleep(0.5)
    st.rerun()
```

### 陷阱2：NAS/云端分支缺失 — 云端对话走NAS命令

**症状**: 用户在 Workbench 选择\"云端\"新建对话，但 Hermes 回答的还是 NAS 环境（绿联 Docker 容器），云端服务器根本没被连接。

**根因**: `pending` 和 `followup` 两处代码硬编码了 NAS 的 `HERMES_BIN` 和本地 `subprocess.Popen`，完全忽略了 `target` 字段。

**修复**: 根据 `target` 分支处理：
- `target == \"云端\"` → SSH 到云端执行 `hermes chat`
- `target == \"NAS\"` → 本地 `subprocess.Popen`

```python
if target == \"云端\":
    safe_q = query.replace(\"'\", \"'\\\\''\")
    ssh_cmd = f\"hermes chat -q '{safe_q}' -m {model} --source workbench\"
    proc = subprocess.Popen([\"ssh\", ..., f\"{CLOUD_USER}@{CLOUD_HOST}\", ssh_cmd], ...)
else:
    cmd = [HERMES_BIN, \"chat\", \"-q\", query, \"-Q\", \"-m\", model, \"--source\", \"workbench\"]
    proc = subprocess.Popen(cmd, env=env, ...)
```

### 陷阱3：全局监控读错数据库 — 云端回复去NAS读

**症状**: 多个活跃对话（NAS+云端）的回复可能串到不属于自己的对话框。

**根因**: 全局进程监控循环（第663行）对所有完成的进程统一调用 `_read_last_assistant()`，该函数只读 NAS 的 `/opt/data/state.db`。云端 Hermes 的回复存在云端的 `state.db` 里，全局循环去 NAS 读 → 读不到 → 或者读到其他 NAS 会话的回复 → 串线。

**修复**: 在 `running_procs` 中存储 `target` 字段，全局循环根据它选择读取函数：

```python
st.session_state.running_procs[sid] = {
    \"proc\": proc, \"real_sid\": resume, \"output\": \"\",
    \"target\": target  # ← 必须存储！
}

# 全局循环中：
target = pinfo.get(\"target\", \"NAS\")
if target == \"云端\":
    content = _read_last_assistant_cloud(real_sid)
else:
    content = _read_last_assistant(real_sid)
```

### 核心教训

- **任何涉及 `target` 的分支逻辑必须在三处同步**：pending 启动、followup 发送、全局监控收尾。漏一处就出 bug。
- **全局监控循环是\"收尾\"逻辑**，它不创建进程，只读取已完成进程的结果。但它必须知道进程当初是用哪个 target 启动的。
- **Streamlit 的 `st.rerun()` 是双刃剑**：它让轮询成为可能，但如果在渲染之前就 rerun，渲染代码永远不会执行。

## 🔴 陷阱4：聊天消息 DOM 复用错乱（2025-06-19 修复）

**症状**: 切换卡片时旧卡片消息残留到新卡片；思考完成后用户输入消失，只剩 Hermes 输出。

**根因**: `st.chat_message` 不支持 `key` 参数，Streamlit 按元素在脚本树中的**位置**而非唯一标识追踪 DOM 节点。切换卡片后消息数量不同时，旧 DOM 节点被错误复用；思考中只有 1 条（用户），完成后变 2 条（用户+助手），位置变化导致用户消息 DOM 被丢弃。

**修复**: 每条消息用 `st.container(key=...)` 包裹，容器 key 包含 sid + 索引，确保唯一性：

```python
# ✅ 每条消息用独立容器包裹（带唯一 key）
for i, msg in enumerate(st.session_state.chat_history.get(sid, [])):
    role = msg[\"role\"]
    content = msg[\"content\"]
    msg_key = f\"msgwrap_{sid}_{i}\"
    with st.container(key=msg_key):
        if role == \"user\":
            st.chat_message(\"user\").write(content)
        elif role == \"assistant\":
            st.chat_message(\"assistant\").markdown(content)
```

`st.container` 接受 `key` 参数，每条消息有唯一 key 后 Streamlit 按 key 而非位置追踪元素。思考中只有 `msgwrap_xxx_0`，完成后新增 `msgwrap_xxx_1`，key 稳定不冲突。

**尝试过的失败方案：**
- ❌ `st.chat_message(key=...)` — Streamlit 1.58.0 不支持
- ❌ `st.empty()` + 内部 `st.chat_message` — 子元素追踪混乱，消息数变化时旧 DOM 残留/消失

## 🔴 陷阱5：patch 工具破坏 XML 标签（2025-06-19 教训）

**症状**: 用 `patch` 工具修改包含 `<｜DSML｜tool_calls>`、`<｜DSML｜invoke>`、`<｜DSML｜parameter>` 等 XML 标签的代码时，工具会截断/破坏内容，导致文件语法错误。

**根因**: `patch` 工具内部可能对 XML 标签做预处理或转义，`<｜DSML｜...>` 格式被误解析。

**修复**: 涉及 XML 标签的代码修改，一律用 Python 脚本（`execute_code` + `write_file` 或直接文件操作），不要用 `patch` 工具。

```python
# ✅ 用 Python 脚本修改
with open(path, "r") as f:
    content = f.read()
content = content.replace(old_str, new_str)
with open(path, "w") as f:
    f.write(content)
```

## 🟢 流式展示：state.db 轮询方案（v11.1.0 → v12.0.0 最终版）

### ⚠️ 废弃方案：HermesStreamParser（stdout 解析）

之前尝试逐行解析 Hermes stdout 提取 thinking/tool_calls，**完全失败**：
- Hermes v0.10.0 带 `-Q` 标志时 stdout 几乎为空
- 去掉 `-Q` 后输出格式因模型/环境而异，不可靠
- `select.select()` 非阻塞读取在容器环境中不稳定
- 结论：**不要解析 stdout，Hermes Studio / AionUi 都是轮询 state.db**

### ✅ 正确方案：轮询 state.db 的 messages 表

Hermes 在运行过程中**增量写入** `state.db` 的 `messages` 表，该表有结构化字段：

| 字段 | 内容 |
|------|------|
| `content` | 回复文本 |
| `reasoning` | 思考过程（纯文本） |
| `tool_calls` | 工具调用（JSON 数组） |
| `role` | user / assistant / tool |

### _poll_messages() 函数

```python
def _poll_messages(sid, since_id=0):
    """从 state.db 增量读取消息（含 reasoning, tool_calls 字段）。
    返回 since_id 之后的新消息列表。"""
    if not sid or not STATE_DB.exists():
        return []
    try:
        conn = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT id, role, content, reasoning, tool_calls, timestamp
               FROM messages WHERE session_id = ? AND id > ?
               ORDER BY id""",
            (sid, since_id)
        ).fetchall()
        conn.close()
        result = []
        for r in rows:
            d = dict(r)
            if d.get("tool_calls"):
                try:
                    d["tool_calls"] = json.loads(d["tool_calls"])
                except:
                    d["tool_calls"] = []
            result.append(d)
        return result
    except:
        return []
```

### 全局监控循环（轮询模式）

```python
for cid in list(st.session_state.running_procs.keys()):
    pinfo = st.session_state.running_procs[cid]
    proc = pinfo["proc"]
    rc = proc.poll()
    real_sid = pinfo.get("real_sid")

    if rc is None:
        # 进程运行中：轮询 state.db 获取增量消息
        if real_sid:
            new_msgs = _poll_messages(real_sid, pinfo.get("last_msg_id", 0))
            if new_msgs:
                pinfo["last_msg_id"] = new_msgs[-1]["id"]
                pinfo.setdefault("stream_msgs", []).extend(new_msgs)
                # 实时保存到 stream_data，确保重启不丢失
                st.session_state.stream_data[cid] = list(pinfo["stream_msgs"])
        continue

    # 进程已结束：读最后一批消息，保存 stream_data，加入 chat_history
    ...
    # ⚠️ 关键：stream_data 必须在 del running_procs 之前保存
    st.session_state.stream_data[cid] = stream_msgs
    del st.session_state.running_procs[cid]
```

### 聊天区域展示（复古终端风格展开框 + column-reverse 自动滚底）

所有 reasoning 和 tool_calls 合并到一个展开框，深蓝底 + 蓝色等宽字体。
**自动滚底方案：用 CSS `flex-direction: column-reverse` + `overflow-y: auto`**，新内容在 DOM 中排在前面但视觉上始终在底部，不需要 JS。

```python
# 合并历史 stream_data + 当前进程的增量 stream_msgs
hist_msgs = st.session_state.stream_data.get(sid, [])
live_msgs = proc_info.get("stream_msgs", []) if proc_info else []
# 按 id 去重合并
seen_ids = {m["id"] for m in hist_msgs}
for m in live_msgs:
    if m["id"] not in seen_ids:
        hist_msgs.append(m)
        seen_ids.add(m["id"])

# 收集所有 reasoning 和 tool_calls
all_reasoning = []
all_tools = []
for sm in stream_msgs:
    r = sm.get("reasoning") or ""
    if r.strip():
        all_reasoning.append(r.strip())
    tcs = sm.get("tool_calls") or []
    for tc in tcs:
        tc_name = tc.get("function", {}).get("name", "unknown") if isinstance(tc, dict) else "unknown"
        tc_args = tc.get("function", {}).get("arguments", "{}") if isinstance(tc, dict) else "{}"
        try:
            tc_args = json.loads(tc_args) if isinstance(tc_args, str) else tc_args
        except:
            pass
        all_tools.append({"name": tc_name, "args": tc_args})

if all_reasoning or all_tools:
    is_running = bool(proc_info and proc_info["proc"].poll() is None)
    with st.expander("🖥️ Hermes 内部过程", expanded=is_running):
        lines = []
        for r in all_reasoning:
            for line in r.split("\n"):
                lines.append(f'<span class="prompt">&gt;</span> {line}')
        for t in all_tools:
            lines.append(f'<span class="tool">$ {t["name"]}</span>')
            if t["args"]:
                args_str = json.dumps(t["args"], ensure_ascii=False, indent=2)
                for aline in args_str.split("\n"):
                    lines.append(f'<span class="param">  {aline}</span>')

        # column-reverse: newest content always at visible bottom
        css_class = "term-" + sid[:8]
        terminal_html = f'''<style>
.{css_class} {{
    background: #1a1a2e; color: #4fc3f7;
    font-family: "JetBrains Mono","SF Mono","Courier New",monospace;
    font-size: 0.7rem; line-height: 1.5;
    padding: 0.6rem 0.8rem; border-radius: 6px;
    max-height: 400px; overflow-y: auto;
    display: flex; flex-direction: column-reverse;
    white-space: pre-wrap; word-break: break-all;
}}
.{css_class} .prompt {{ color: #66bb6a; }}
.{css_class} .tool {{ color: #ffa726; }}
.{css_class} .param {{ color: #90a4ae; }}
</style>
<div class="{css_class}">{"<br>".join(reversed(lines))}</div>'''
        st.markdown(terminal_html, unsafe_allow_html=True)
```

### running_procs 结构（最终版）

```python
st.session_state.running_procs[sid] = {
    "proc": proc,
    "real_sid": resume,
    "output": "",           # 仅用于首次提取 session_id
    "target": target,
    "last_msg_id": 0,       # state.db 轮询游标
    "stream_msgs": [],      # 增量消息列表
    "children": [],         # 子 Agent
    "since_ts": 0,          # 新对话首次发现 session 的时间戳
}
```

### 持久化存储

```python
# session_state 初始化
if "stream_data" not in st.session_state:
    st.session_state.stream_data = _persist.get("stream_data", {})

# save_persist — 每次 mutation 后调用
data = {
    "open_chats": st.session_state.open_chats,
    "custom_names": dict(st.session_state.custom_names),
    "real_sids": dict(st.session_state.real_sids),
    "chat_history": {k: v for k, v in st.session_state.chat_history.items()},
    "stream_data": {k: v for k, v in st.session_state.get("stream_data", {}).items()},
}
PERSIST_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))
```

### 重启恢复

```python
# 用 _poll_messages 重建 stream_data（与全局循环一致）
for cid, _, target, _ in st.session_state.open_chats:
    real_sid = st.session_state.real_sids.get(cid)
    if real_sid:
        new_msgs = _poll_messages(real_sid, 0)
        if new_msgs:
            st.session_state.stream_data[cid] = new_msgs
            # 用 _msg_id 去重加入 chat_history
```

### 关键教训

- ❌ **不要解析 stdout** — Hermes 输出格式不稳定，`-Q` 标志还会压制输出
- ✅ **轮询 state.db** — `reasoning`、`tool_calls`、`content` 都是结构化字段
- ✅ **stream_data 持久化** — 必须在 `del running_procs` 之前保存，否则数据丢失
- ✅ **用 `_msg_id` 去重** — 比内容比对更可靠，避免重启恢复和全局循环各加一次
- ✅ **合并展示** — 所有 reasoning + tool_calls 放在一个展开框中，避免多个 expander 标签冲突
- ✅ **去掉 `-Q` 标志** — 首次运行时需要 stdout 提取 session_id
- ✅ **CSS column-reverse 自动滚底** — 不需要 JS，Streamlit 不会过滤 CSS
- ✅ **每条消息用 st.container(key=...) 包裹** — 避免切换卡片时 DOM 错乱
- ✅ **实时保存 stream_data** — 全局循环中每次 poll 到新消息立即 `st.session_state.stream_data[cid] = list(pinfo["stream_msgs"])`

### 🔴 陷阱6：新对话首次轮询失败（2025-06-19 修复）

**症状**: 新建对话后 Hermes 已在运行，但终端展开框无内容，只有"正在思考..."。

**根因**: 新对话首次发送时 `real_sid=None`，全局循环跳过 `_poll_messages()` 轮询。Hermes 进程结束时才从 stdout 提取 session_id，中间所有增量消息全部丢失。

**修复（最终方案）**: 启动进程前记录 `_get_max_started_at()` 时间戳，全局循环中用 `_find_new_session_since(since_ts)` 精确发现自己的 session：

```python
# 启动进程前记录时间戳
st.session_state.running_procs[sid] = {
    ...
    "since_ts": _get_max_started_at() if not resume else 0,
}

# 全局循环中
if rc is None:
    if not real_sid:
        since_ts = pinfo.get("since_ts", 0)
        if since_ts:
            discovered = _find_new_session_since(since_ts)
            if discovered:
                real_sid = discovered
                pinfo["real_sid"] = real_sid
                st.session_state.real_sids[cid] = real_sid
    if real_sid:
        new_msgs = _poll_messages(real_sid, pinfo.get("last_msg_id", 0))
        ...

def _get_max_started_at():
    """获取 state.db 中最新的 started_at 时间戳。"""
    conn = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
    row = conn.execute("SELECT MAX(started_at) FROM sessions").fetchone()
    return row[0] if row and row[0] else 0

def _find_new_session_since(since_ts):
    """查找 started_at > since_ts 的最新 session。"""
    conn = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
    row = conn.execute(
        "SELECT id FROM sessions WHERE started_at > ? ORDER BY started_at DESC LIMIT 1",
        (since_ts,)
    ).fetchone()
    return row[0] if row else None
```

**尝试过的失败方案：**
- ❌ `_find_latest_workbench_sid()` — 可能拿到其他来源的 session，导致轮询错误会话

### 🔴 陷阱7：Workbench 重启后状态丢失（2025-06-19 修复）

**症状**: Hermes 思考过程中关掉 Workbench 再重启，活跃对话框中的用户输入、思考状态全部丢失。

**根因**: `stream_data` 未持久化到 `open_chats.json`，重启后 `session_state` 清空。

**修复（三处）：**

1. `save_persist()` 加入 `stream_data` 字段
2. `load_persist()` 默认值加入 `stream_data: {}`
3. 重启恢复用 `_poll_messages(real_sid, 0)` 重建 stream_data，用 `_msg_id` 去重

```python
# save_persist
data = {
    ...
    "stream_data": {k: v for k, v in st.session_state.get("stream_data", {}).items()},
}

# load_persist 默认值
return {"open_chats": [], ..., "stream_data": {}}

# 重启恢复
for cid, _, target, _ in st.session_state.open_chats:
    real_sid = st.session_state.real_sids.get(cid)
    if real_sid:
        new_msgs = _poll_messages(real_sid, 0)
        if new_msgs:
            st.session_state.stream_data[cid] = new_msgs
            # 用 _msg_id 去重加入 chat_history
```

⚠️ **不要检测孤儿进程** — `pgrep` 检测到的 Hermes 进程可能是其他来源的（cron、微信等），显示警告只会误导用户。

### 🔴 陷阱8：终端展开框自动滚底（2025-06-19 修复，v12.0.0 改用 column-reverse）

**症状**: 思考内容持续增长，但终端框停留在顶部，看不到最新内容。

**根因**: `st.markdown()` 内嵌 `<script>` 标签会被 Streamlit 过滤/忽略，无法用 JS 控制滚动。

**修复（最终方案 v12.0.0）**: 用 CSS `flex-direction: column-reverse` + `overflow-y: auto`。新内容在 DOM 中排在前面，但 column-reverse 让视觉上最底部的内容始终可见。不需要任何 JS。

```python
# ✅ column-reverse: 新内容排在 DOM 前面，视觉上在底部
css_class = "term-" + sid[:8]
terminal_html = f'''<style>
.{css_class} {{
    ...
    display: flex;
    flex-direction: column-reverse;
    overflow-y: auto;
    max-height: 400px;
}}
</style>
<div class="{css_class}">{"<br>".join(reversed(lines))}</div>'''
st.markdown(terminal_html, unsafe_allow_html=True)
```

**尝试过的失败方案：**
- ❌ `st.markdown("<script>...</script>")` — Streamlit 过滤 script 标签
- ❌ `st.markdown(..., unsafe_allow_html=True)` 内嵌 JS — 同样被过滤
- ❌ `st.components.v1.html()` 完整 iframe + MutationObserver — 在 expander 内每次 rerun 重建 iframe，闪烁且不稳定
- ❌ `st.empty()` + 内部 `st.chat_message` — 子元素追踪混乱，消息数变化时旧 DOM 残留/消失

## 🔵 未读提示（2025-06-18 新增）

当活跃会话的 Hermes 输出了新回复，而用户当前在看别的卡片时，该卡片标题末尾显示 🔵 标记。点击卡片切换后自动清除。

```python
# session_state 初始化
if "unread" not in st.session_state:
    st.session_state.unread = set()

# 全局循环中：非当前卡片收到新回复时标记
if st.session_state.active_sid != cid:
    st.session_state.unread.add(cid)

# 卡片渲染：追加 🔵
has_unread = cid in st.session_state.unread
unread_mark = " 🔵" if has_unread else ""
card_label = f"{icon} {display_name}{unread_mark}\n{tgt} · {mdl}"

# 点击卡片时清除
st.session_state.unread.discard(cid)
```

## 代码备份（三层体系）

Workbench 代码备份体系（与 fund-advisor-system 同模式）：

| 层 | 状态 | 详情 |
|------|------|------|
| Git 本地 | `/opt/data/workbench-streamlit/.git/` | 每次修改后 commit |
| GitHub 远程 | `pierzyy/hermes-workbench`（私有） | `main` 分支 |
| Cron 自动 | 每日 04:00 | `git add -A && commit && push` |

⚠️ 教训: 2025-06-18 开发全程没有备份——连 Git 仓库都没初始化。所有修改都是直接 patch 没有 commit。以后每次改完立刻 `git commit`。

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
