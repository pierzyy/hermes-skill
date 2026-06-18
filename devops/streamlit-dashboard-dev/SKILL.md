---
name: streamlit-dashboard-dev
description: 在绿联NAS Hermes容器中开发和部署Streamlit仪表盘——布局模式、性能优化、后台启动、保活配置
---

# Streamlit Dashboard Dev

在 Hermes 容器环境中开发 Streamlit 应用的完整模式。

## 关键认知

### Streamlit 重渲染机制
Streamlit 每次**任何交互**（点击按钮、展开器、输入文字、切标签页）都会**从头到尾重跑整个脚本**。这意味着：
- 所有全局作用域的代码每次交互都执行
- 如果全局有 SSH 连接、`ps aux`、文件扫描等耗时操作，每次点击都会卡
- 解决方案：`@st.cache_data(ttl=N)` 缓存所有耗时函数

### 浏览器点击超时
`browser_click` 工具超时 30 秒。如果 Streamlit 页面渲染耗时超过 30 秒（如加载 50 个会话的完整消息），工具会超时。**这不代表页面有问题**，真实浏览器没有此限制。

## 项目结构

```
/opt/data/<project>/
├── .venv/              # Python venv（容器重启后需重建）
├── app.py              # 主应用
└── ...
```

## 部署流程

### 1. 创建 venv 并安装依赖
```bash
cd /opt/data/<project>
python3 -m venv .venv
.venv/bin/pip install streamlit requests
```

### 2. 后台启动（必须用 background=true）
```bash
cd /opt/data/<project> && .venv/bin/streamlit run app.py \
  --server.port <PORT> --server.address 0.0.0.0 --server.headless true
```
⚠️ **严禁前台启动**——否则 tool call 永久阻塞等退出信号，agent 卡死。

### 3. 保活 Cron
```bash
# /etc/cron.d/<project>_keepalive
*/5 * * * * root pgrep -f "streamlit.*<PORT>" >/dev/null || (cd /opt/data/<project> && .venv/bin/streamlit run app.py --server.port <PORT> --server.address 0.0.0.0 --server.headless true > /dev/null 2>&1 &)
```

### 4. 重启流程
```bash
kill $(ps aux | grep "streamlit.*<PORT>" | grep -v grep | awk '{print $2}')
sleep 2
# 然后后台启动
```

## 性能优化模式

### 缓存所有耗时函数
```python
@st.cache_data(ttl=5)   # 数据库查询：5秒
def get_sessions(): ...

@st.cache_data(ttl=30)  # SSH/文件扫描：30秒
def cloud_available(): ...

@st.cache_data(ttl=30)
def get_skills(): ...

@st.cache_data(ttl=5)
def get_processes(): ...
```

### 避免全局作用域耗时操作
```python
# ❌ 错误：全局执行
co = cloud_available()  # 每次交互都 SSH

# ✅ 正确：函数内缓存
@st.cache_data(ttl=30)
def cloud_available(): ...
```

## 布局模式

### AionUi 风格（侧边栏 + 主区域）
```python
st.set_page_config(layout="wide", initial_sidebar_state="expanded")

with st.sidebar:
    # 新建对话、会话卡片列表
    
# 主区域
# 对话界面 / 管理面板
```

### 顶栏导航
```python
nav_cols = st.columns([1, 1, 1, 1, 8])
for i, (label, key) in enumerate(nav_items):
    with nav_cols[i]:
        if st.button(label, key=f"nav_{key}"):
            st.session_state.nav_tab = key
```

### Session State 管理
```python
if "active_sid" not in st.session_state:
    st.session_state.active_sid = None
if "open_chats" not in st.session_state:
    st.session_state.open_chats = []
```

## 干净输出过滤

过滤 Hermes 系统内部信息，只展示用户可见内容：

```python
def clean_output(content):
    """过滤系统内部信息"""
    if not content: return ""
    content = re.sub(r'^\[.*?\]\s*', '', content, count=1)
    content = re.sub(r'\[CONTEXT COMPACTION.*?(?=\n\n|\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'## Available Skills.*?(?=\n\n|\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'═══════════.*?═══════════', '', content, flags=re.DOTALL)
    content = re.sub(r'## Skills \(mandatory\).*?(?=\n\n##|\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'<available_skills>.*?</available_skills>', '', content, flags=re.DOTALL)
    content = re.sub(r'\n{3,}', '\n\n', content)
    return content.strip()
```

## CSS 暗色主题

```python
st.markdown("""
<style>
    .stApp { background: #080b10; }
    .stApp > header { display: none; }
    /* 背景网格 */
    .stApp::before {
        content:''; position:fixed; inset:0; pointer-events:none; z-index:0;
        background-image:
            radial-gradient(ellipse 60% 30% at 50% 0%, rgba(34,211,238,0.03), transparent),
            repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, transparent 1px, transparent 40px);
    }
    /* 侧边栏 */
    section[data-testid="stSidebar"] {
        background: #0d1119 !important;
        border-right: 1px solid rgba(255,255,255,0.06) !important;
    }
    /* 按钮 */
    .stButton > button {
        background: #111827 !important; color: #e2e8f0 !important;
        border: 1px solid rgba(255,255,255,0.06) !important;
    }
    .stButton > button:hover {
        border-color: rgba(34,211,238,0.3) !important;
    }
    /* 强调色: #22d3ee (cyan) */
</style>
""", unsafe_allow_html=True)
```

## 云端 Hermes 路径差异

本地和云端的 hermes 路径可能不同：
- 本地 NAS：`/opt/hermes/.venv/bin/hermes`
- 云端 BCC：`/usr/local/bin/hermes`（通过 `which hermes` 确认）
- 云端可能未配置 API Key，需同步 config.yaml

## 数据库删除会话

从 state.db 删除会话需要同时删 messages 和 sessions 两表：

```python
def delete_session(sid):
    conn = sqlite3.connect(str(STATE_DB))
    conn.execute("DELETE FROM messages WHERE session_id = ?", (sid,))
    conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))
    conn.commit()
    conn.close()
    st.cache_data.clear()
```

两种删除模式：
- 侧边栏活跃卡片 ✕：仅从 session_state 移除，不删数据库
- 历史会话 🗑️：调用 delete_session() 删除数据库记录

| 问题 | 原因 | 解决 |
|------|------|------|
| 页面黑屏 | 全局耗时操作阻塞渲染 | `@st.cache_data` 缓存 |
| 端口绑定失败 | 端口被占用 | `ss -tlnp` 检查后 kill |
| 容器重启后丢失 | overlay 目录 | 代码放 `/opt/data/` |
| venv 丢失 | overlay | 重建 venv |
| browser_click 超时 | 渲染 >30s | 真实浏览器无此限制 |
| 顶栏遮挡内容 | Streamlit header 占位 | `.block-container { padding-top: calc(60px + 0.8rem) !important; }` |

## 完整 clean_output 过滤规则

过滤 Hermes 系统内部信息，只保留用户可见的思考过程和最终回复：

```python
def clean_output(content):
    if not content: return ""
    content = re.sub(r'\x1b\[[0-9;]*m', '', content)  # ANSI
    content = re.sub(r'^\[.*?\]\s*', '', content, count=1)  # 模型标签
    content = re.sub(r'\[CONTEXT COMPACTION.*?(?=\n\n##|\n\n\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'## Available Skills.*?(?=\n\n##|\n\n\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'## Current Session Context.*?(?=\n\n##|\n\n\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'\[Assistant Rules\].*?(?=\n\n##|\n\n\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'## Skills \(mandatory\).*?(?=\n\n##|\n\n[^#\n]|\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'═══════════\nMEMORY.*?(?=\n\n##|\n\nUSER|\n\n[^#\n]|\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'═══════════\nUSER PROFILE.*?(?=\n\n##|\n\n[^#\n]|\Z)', '', content, flags=re.DOTALL)
    content = re.sub(r'<available_skills>.*?</available_skills>', '', content, flags=re.DOTALL)
    content = re.sub(r'<function_calls>.*?</function_calls>', '', content, flags=re.DOTALL)
    content = re.sub(r'<invoke name="[^"]*">.*?</invoke>', '', content, flags=re.DOTALL)
    content = re.sub(r'^Query:.*?\n', '', content)
    content = re.sub(r'Initializing agent\.\.\..*?\n', '', content)
    content = re.sub(r'^\s*⚠.*?tirith.*?\n', '', content)
    content = re.sub(r'^\s*─\s*⚕\s*Hermes\s*─+.*$', '', content, flags=re.MULTILINE)
    content = re.sub(r'^─{3,}\s*$', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s*─{3,}\s*$', '', content, flags=re.MULTILINE)
    content = re.sub(r'^Resume the session.*?\n', '', content, flags=re.MULTILINE)
    content = re.sub(r'^Session:.*?\n', '', content, flags=re.MULTILINE)
    content = re.sub(r'^[─═]{5,}\s*$', '', content, flags=re.MULTILINE)
    content = re.sub(r'^\s+', '', content)
    content = re.sub(r'\n{3,}', '\n\n', content)
    return content.strip()
```

## 毛玻璃卡片样式

```css
.glass-card {
    background: rgba(17, 24, 39, 0.7) !important;
    backdrop-filter: blur(12px) !important;
    -webkit-backdrop-filter: blur(12px) !important;
    border: 1px solid rgba(255,255,255,0.08) !important;
    border-radius: 10px !important;
    padding: 0.5rem 0.7rem !important;
}
.glass-card.active {
    border-color: #22d3ee !important;
    background: rgba(34,211,238,0.08) !important;
}
```

## 会话卡片删除功能

每个卡片右侧放 ✕ 按钮，点击后从 `st.session_state.open_chats` 移除：

```python
col_card, col_del = st.columns([5, 1])
with col_card:
    # 卡片内容 + 查看按钮
with col_del:
    if st.button("✕", key=f"del_{cid}"):
        to_remove = cid

if to_remove:
    st.session_state.open_chats = [c for c in open_chats if c[0] != to_remove]
    st.session_state.chat_history.pop(to_remove, None)
    st.rerun()
```

## 对话历史持久化

使用 `st.session_state.chat_history` 字典存储活跃会话的对话记录：

```python
if "chat_history" not in st.session_state:
    st.session_state.chat_history = {}  # sid -> [{"role":"user/assistant","content":"..."}]

# 发送消息时
st.session_state.chat_history[sid].append({"role": "user", "content": query})
# Hermes 回复后
st.session_state.chat_history[sid].append({"role": "assistant", "content": cleaned})
```

## 云端 Hermes 路径差异

本地和云端的 hermes 路径可能不同，不要硬编码：
- 本地 NAS：`/opt/hermes/.venv/bin/hermes`
- 云端 BCC：`/usr/local/bin/hermes`（通过 `which hermes` 确认）
- 云端可能未配置 API Key，需同步 config.yaml

## 紧凑下拉框 CSS

Streamlit 默认下拉框很占空间，紧凑化：

```css
div[data-testid="stSelectbox"] label { display: none !important; }
div[data-testid="stSelectbox"] > div { min-height: 26px !important; }
div[data-testid="stSelectbox"] > div > div { min-height: 26px !important; padding: 0 4px !important; }
div[data-testid="stSelectbox"] > div > div > div { min-height: 26px !important; padding: 0 4px !important; font-size: 0.72rem !important; }
div[data-testid="stSelectbox"] [data-baseweb="select"] { min-height: 26px !important; }
li[role="option"] { font-size: 0.72rem !important; padding: 2px 6px !important; }
div[data-testid="column"] { gap: 3px !important; }
div[data-testid="column"] > div { padding: 0 !important; }
```

## NAS/云端 Radio 切换

在历史会话、技能、Cron 页面顶部加横向 radio 切换 NAS/云端视图：

```python
scope = st.radio("范围", ["全部", "NAS", "云端"], horizontal=True, key="scope", label_visibility="collapsed")

if scope in ("全部", "NAS"):
    # 本地数据
if scope in ("全部", "云端") and cloud_available():
    # 云端 SSH 查询
```

## Cron 任务简介提取

crontab 行格式为 `分 时 日 月 周 命令`，提取命令部分作为简介：

```python
parts = name.split()
if len(parts) > 5:
    desc = ' '.join(parts[5:])[:80]  # 跳过 cron 表达式
else:
    desc = name[:80]
```

## 自定义 APK 图标生成（PIL）

用 PIL 绘制自定义图标，无需外部素材：

```python
from PIL import Image, ImageDraw
img = Image.new('RGBA', (512, 512), (0,0,0,0))
draw = ImageDraw.Draw(img)
# 绘制形状、文字
# 生成各密度版本
sizes = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
for density, size in sizes.items():
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(f"ic_launcher_{density}.png")
```
