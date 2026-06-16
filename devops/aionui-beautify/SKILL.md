---
name: aionui-beautify
description: 对 AionUi Web 界面进行非侵入式美化——创建独立 CSS 覆层，注入 index.html，不修改任何原始文件。适用于 AionUi 版本 v2.1.2+
category: devops
---

# AionUi 界面美化

## 原则

**不修改 AionUi 原始文件**（JS/CSS/HTML 中已有的内容），仅通过追加一个独立 CSS 文件实现美化。随时删除 `<link>` 即可回滚。

## 前置知识

- AionUi 前端：React + Arco Design + UnoCSS
- 静态文件路径：`/opt/data/aionui-web-standalone/static/`
- 主 CSS：`assets/index-CVFERzCE.css`（v2.1.2 的 hash，版本更新后会变）
- 主题系统：`data-theme="light|dark"` on `<html>`，`arco-theme` on `<body>`
- CSS 变量：`--aou-1` ~ `--aou-10`，`--bg-*`，`--text-*`，`--brand`，`--primary` 等

## 步骤

### 1. 创建美化 CSS

路径：`/opt/data/aionui-web-standalone/static/assets/aionui-beautify.css`

覆盖内容包括：
- 全局字体渲染优化（`-webkit-font-smoothing: antialiased`）
- 自定义滚动条（圆角、半透明、暗色模式适配）
- 侧边栏（渐变背景、阴影、分隔线）
- 标题栏（毛玻璃效果）
- 按钮（圆角、阴影、hover 上移效果）
- 输入框（圆角、focus ring）
- 卡片（圆角、hover 上浮 + 阴影）
- 侧边栏列表项（圆角、hover/active 状态）
- 会话记录分节标题（大写、字间距）
- 模态框（大圆角、深阴影）
- 下拉菜单、Tab、代码块、标签、折叠面板等组件
- 全局背景微量径向渐变（增加深度感）
- `prefers-reduced-motion` 支持

### 2. 注入 index.html

在 `</head>` 之前、最后一行 `<link rel="stylesheet">` 之后追加：

```html
<link rel="stylesheet" href="./assets/aionui-beautify.css">
```

### 3. ⚠️ 重启 AionUi（必须！但 agent 不许自己执行！）

AionUi 内嵌服务器在启动时缓存 `index.html` 到内存，修改静态文件后**必须重启进程**才能生效。

**🔥 致命规则：agent 禁止在 AionUi 对话中执行 `pkill aionui-web`！**

原因：AionUi 对话内的 agent 通过 AionUi 的 ACP 协议运行。`pkill aionui-web` 会杀死 AionUi 进程 → agent 自身也随 ACP 连接断开而终止 → 用户看到"正在处理中"卡死，最后一条回复永远发不出去。

**正确做法**：
- 改完 index.html 后，**告诉用户**"已修改完成，需要重启 AionUi。请在微信里告诉 Hermes：'帮我重启 AionUi'""
- 用户在微信/其他平台让 Hermes 执行重启——微信渠道的 agent 不依赖 AionUi 进程，可以安全执行 `pkill`

**保底方案**（AionUi 已有 2 分钟保活 cron）：
- agent 改完 index.html 后直接回复"修改完成，AionUi 将在 2 分钟内自动重启生效"
- 保活 cron（`ac6a4189f35a`）检测到进程不存在时会自动拉起

```bash
# 只有微信渠道的 Hermes 才能安全执行此命令：
pkill aionui-web
sleep 2
export PATH="/opt/hermes/.venv/bin:$PATH"
nohup /opt/data/aionui-web-standalone/aionui-web start --remote --port 25808 > /tmp/aionui.log 2>&1 &
sleep 3
ss -tlnp | grep 25808  # 验证重启成功
```

### 4. 验证

```bash
# 检查 CSS 是否可访问
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:25808/assets/aionui-beautify.css
# 预期：200

# 浏览器 console 检查
document.querySelector('link[href*="aionui-beautify"]')
# 非 null 即加载成功
```

## 回滚

```bash
# 只需删除 index.html 中的 <link> 行，然后重启
# 或直接：
rm /opt/data/aionui-web-standalone/static/assets/aionui-beautify.css
# 重启 AionUi
```

## 踩坑

1. **修改 index.html 后必须重启 AionUi**：内嵌 Go 服务器在启动时将静态文件读入内存，后续请求从内存缓存返回，不读磁盘。只改文件不重启 = 不生效。
2. **不要修改 Arco CSS 文件**：文件名含 content hash（如 `index-CVFERzCE.css`），AionUi 版本更新后 hash 会变，修改会被覆盖。
3. **CSS 选择器优先级**：美化 CSS 放在原有 `<link>` 之后，可利用加载顺序覆盖同优先级规则。对 Arco 的 `!important` 规则需加 `!important` 对抗。
4. **不要从源码构建**：AionUi 是预编译二进制，`static/` 目录是纯静态文件，直接修改即可。
5. **⚠️ 双变量系统 + 双来源陷阱**：AionUi 的文字颜色由**两套变量、两个来源**控制：
   - **Arco Design 变量**：`--color-text-1/2/3/4`、`--color-neutral-1~10`（来自 vendor-arco CSS 和 index CSS 的 `[data-color-scheme]` 块）
   - **AionUi 自有变量**：`--text-primary`、`--text-secondary`（来自**两处**——index.html 内联 `<style>` 的 `:root` 块，以及 index-CVFERzCE.css 的 `:root, [data-color-scheme=default]` 块）
   美化 CSS 必须**同时覆盖两套变量**，否则会出现"设了 `--color-text-1` 但文字还是黑色"的问题。
6. **`data-color-scheme` 值不固定**：页面实际使用的 `data-color-scheme` 可能为 `dark`（生产）或 `default`（无 localStorage 时）。美化 CSS 的选择器必须**同时匹配 `dark` 和 `default`**，不能假设只有一个值。

7. **🔥 `!important` 必须覆盖所有 CSS 变量，不只文字/Arco 类**：AionUi 原始 CSS（`index-CVFERzCE.css`）中有两条关键规则定义全部变量：
   - 规则 1135：`:root, [data-color-scheme="default"]`（特异度 0,2,0）
   - 规则 1136：`[data-color-scheme="default"][data-theme="dark"]`（特异度 0,2,0）
   
   React 动态将 `<html data-color-scheme="dark">` 改为 `data-color-scheme="default"`，使规则 1136 匹配。其特异度（0,2,0）高于 beautify.css 的 `:root`（0,1,0）和 `html[data-theme=dark]`（0,1,1）。
   
   **致命后果**：如果 beautify.css SECTION 1 的变量没有 `!important`，原始 CSS 的 `--aou-6: #a1aacb`、`--bg-base: #0e0e0e` 会覆盖美化色值，用户完全感觉不到变化。
   
   **修复**：beautify.css 中**所有**变量定义——`--aou-*`、`--bg-*`、`--primary`、`--success`、`--warning`、`--danger`、`--info`、`--brand*`、`--border*`、`--message*`、`--workspace*` 等——都必须加 `!important`。命令：
   ```bash
   sed -i '/!important/!{/^[[:space:]]*--[a-zA-Z0-9-]\+:/s/;[[:space:]]*$/ !important;/}' aionui-beautify.css
   ```

8. **`body[arco-theme]` 是最可靠的覆盖层级**：AionUi CSS 在 `body` 级别通过 `body[arco-theme=dark]` 和 `body[arco-theme=light]` 重新声明变量。美化 CSS 必须在 `body[arco-theme=dark], body[arco-theme=light]` 上同时用 `!important` 声明所有变量，作为最后一道防线。

9. **`* { color: inherit }` 全局规则**：AionUi 的主 CSS 第一行有 `*{color:inherit}`，意味着任何祖先元素的暗色文字会传播到所有后代。仅修改变量不够——还必须确保根元素（`html`、`body`、`#root`）有明确的亮色 `color`。

10. **诊断方法**：用浏览器 console 检查变量实际值：
   ```js
   // 检查 CSS 变量
   getComputedStyle(document.body).getPropertyValue('--text-primary')
   getComputedStyle(document.body).getPropertyValue('--color-text-1')
   // 查深色文字元素
   Array.from(document.querySelectorAll('*')).filter(el => {
     const m = getComputedStyle(el).color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
     return m && +m[1] < 80 && +m[2] < 80 && +m[3] < 80 && el.textContent.trim().length > 2
       && !['HTML','HEAD','TITLE','STYLE','SCRIPT','OPTION'].includes(el.tagName);
   }).slice(0, 5)
   // 检查毛玻璃是否生效（bg 必须是 rgba 不是 rgb）
   var s = document.querySelector('aside.arco-layout-sider');
   s && console.log(getComputedStyle(s).backgroundColor.includes('rgba'), getComputedStyle(s).backdropFilter);
   // 列出匹配某选择器的所有 CSS 规则及优先级
   var el = document.querySelector('aside.arco-layout-sider');
   for (var sheet of document.styleSheets) {
     try { for (var rule of sheet.cssRules) {
       if (rule.selectorText && el.matches(rule.selectorText) && rule.style.background)
         console.log(rule.selectorText, rule.style.background, rule.style.getPropertyPriority('background'));
     }} catch(e) {}
   }
   // 检查哪个规则设置了特定 CSS 变量
   for(var s of document.styleSheets) {
     try { for(var r of s.cssRules) {
       if(r.cssText && (r.cssText.includes('--bg-base') || r.cssText.includes('--aou-6'))) {
         console.log(s.href?.split('/').pop()||'inline', r.cssText.substring(0,150));
       }
     }} catch(e) {}
   }
   ```

11. **🔥 `read_file` 内容污染（行号写入文件）陷阱**：`read_file` 的输出格式为 `LINE_NUM|CONTENT`。如果用 `read_file` 读取后直接 `write_file` 写回，**行号 `" 21|  --aou-1:..."` 会被写入文件内容**，破坏语法。
    - ❌ 错误做法：`read_file` → 逐行处理 → `write_file`
    - ✅ 正确做法：`terminal("cat /path/file")` 获取原始内容，在 Python 中处理，然后 `write_file` 写回
    - 也需注意：`read_file` 默认只读 500 行，大型 CSS 文件可能被截断

12. **CSS 文件修改不需要重启 AionUi**：静态资源（`/assets/*.css`）由内嵌 Go 服务器直接 serve 文件系统，不缓存。只有修改 `index.html` 需要重启。

13. **🔥 Service Worker 缓存旧 HTML（根因：PRECACHE_URLS）**：AionUi 的 `sw.js` 在 `install` 事件中会 `cache.addAll(PRECACHE_URLS)`，而 `PRECACHE_URLS` **包含了 `index.html`**。即使 navigation 走 `networkFirst` 策略，`install` 阶段的预缓存已经把旧 HTML 写入了缓存，导致第一次加载（以及 SW 未更新时的后续加载）拿到的都是旧版——所有文件修改不可见。
    
    **诊断**：`navigator.serviceWorker.controller` 非 null 即 SW 活跃。
    
    **修复（服务器端，适用于 Android WebView/App 用户无法操作 DevTools 时）**：
    - **升级 sw.js 版本**：改 `CACHE_NAME`（如 `v2` → `v3`），SW 检测到文件变化会重新安装，新 `activate` 事件会删除旧缓存
    - **去掉 index.html 预缓存**：从 `PRECACHE_URLS` 数组中移除 `OFFLINE_PAGE_URL`
    - **关键样式内联兜底**：在 index.html 的 `<style>` 块中内联所有**配色变量**（不只是毛玻璃）。即使 SW 缓存的 HTML 版本旧、或 beautify.css 加载失败，核心视觉变化（底色、文字色）也能生效
    - **用户操作**：完全关闭浏览器标签/APP后重新打开，触发 SW 更新

14. **🪟 CSS 选择器与 DOM 实际类名不匹配**：AionUi 的 React 组件使用**自建 BEM 类名**，不是 Arco Design 原生类名。beautify.css 假设 `.arco-card` 匹配登录卡片，但实际 DOM 是 `.login-page__card`。**必须先打开浏览器 Inspect 实际 DOM 类名再写 CSS**。
    | 假设的 Arco 类名 | 实际 DOM 类名 |
    |---|---|
    | `.arco-card` | `.login-page__card` |
    | `.arco-form-item-label` | `.login-page__label` |
    | `.arco-layout-sider` | `.layout-sider`（部分匹配） |

15. **🪟 毛玻璃被自己打败**：在「通用文本强制亮色」块中写 `html[data-color-scheme=dark] .arco-layout-sider { background: solid-color !important }`（特异性 0,1,1）会覆盖单独的 `.layout-sider { background: rgba(...) !important }`（特异性 0,1,0）。两种 `!important` 同级时，**特异性高的胜出**。修复：毛玻璃规则必须用匹配或更高的特异性（如 `html[data-color-scheme=dark] .arco-layout-sider`），且从通用文本块中移除 sidebar/titlebar 选择器。

16. **毛玻璃需要全透明链路**：指定 sidebar 自身为 `rgba` 还不够，其子元素 `.arco-layout-sider-children` 也必须设为 `background: transparent !important`，否则子元素的不透明背景会挡住 blur 效果。

17. **🪟 背景不透明度决定 blur 可见度**：`backdrop-filter: blur()` 的效果取决于元素背景透过多少内容。背景 `rgba(33,36,47,0.82)`（82% 不透明）几乎看不到 blur——只有 18% 的背景透过来。**有效毛玻璃需要 45-55% 不透明度**：
    - 侧边栏：`0.82` → `0.50`
    - 标题栏：`0.72` → `0.45`
    - 登录卡：`0.80` → `0.50`
    - 过低（<0.30）文字难以阅读；过高（>0.70）blur 看不见

18. **UnoCSS `!bg-2` 含 `!important`**：AionUi 用 UnoCSS 生成类似 `.\\!bg-2 { background-color: var(--bg-2) !important }` 的规则。与自定义 CSS 同特异性时，按加载顺序决定胜负——beautify.css 加载在最后，通常胜出。

19. **🔥 内联 `<style>` 兜底变量也必须加 `!important`**：index.html 的 `<style>` 块（inline 兜底）通过 `:root, html[data-theme=dark]...` 声明变量，但该选择器同样会被原始 CSS 的 `[data-color-scheme="default"][data-theme="dark"]`（特异度 0,2,0）覆盖。所以 inline style 中的**所有变量也必须加 `!important`**，不能只加 beautify.css 中的。
    
    正确做法：内联 `<style>` 块必须包含：
    - **全部暗色/浅色 CSS 变量**（`--aou-*`、`--bg-*`、`--text-*`、`--color-*`、Arco 的 `--color-bg/fill/border-*`）**全部加 `!important`**
    - **`body[arco-theme=dark/light]` 最后防线**（pitfall #8）
    - **`html[data-color-scheme] body, #root` 文字/背景强制**
    - 然后才是毛玻璃规则（登录卡、侧边栏、标题栏）
    
    加 `!important` 命令（在 index.html 上执行）：
    ```python
    import re
    var_pattern = r'--[a-zA-Z0-9-]+:\s*[^;!}]+;'
    content = re.sub(var_pattern, lambda m: m.group(0).rstrip().rstrip(';') + ' !important;' if '!important' not in m.group(0) else m.group(0), content)
    ```

20. **🌑 暗色主题下 blur 天然不可见**：`backdrop-filter: blur()` 在暗色主题上效果极弱——深色叠深色，模糊后几乎无视觉变化。这是物理光学原理，不是 CSS bug。浅色主题下白卡叠白底，blur 扩散后才明显。**暗色主题的毛玻璃必须靠渐变 + 内阴影模拟**：
    - 用 `linear-gradient(135deg, rgba(40,44,58,0.65), rgba(28,31,40,0.50))` 创建亮度变化
    - 用 `box-shadow: 0 1px 0 rgba(255,255,255,0.06) inset` 模拟玻璃边缘高光
    - 渐变方向：侧边栏/标题栏用 `180deg`（垂直），卡片用 `135deg`（对角）
    - 保留 `backdrop-filter` 不动——iOS/Safari/桌面 Chrome 上仍然生效，Android/不支持的环境靠渐变兜底

21. **🔥 `data-preview` 属性不可用——React 从不设置**：不要尝试用 `attr(data-*)` 实现对话预览。AionUi 的 React 组件从不设置 `data-preview`，`/api/conversations` 不返回 `last_message`。诊断：`grep -r 'data-preview' /opt/.../assets/*.js` → 无结果即不可用。

22. **🔥 agent 禁止自己重启 AionUi**：在 AionUi 对话中执行 `pkill aionui-web` 会杀死自己的 ACP 连接，导致回复卡死、永不到达。改完 index.html 后告诉用户"已修改，请在微信让 Hermes 重启 AionUi"，或等待 2 分钟保活 cron 自动拉起。只有微信渠道的 Hermes agent 可以安全执行重启命令。

24. **🔥 对话卡片 `line-height` 对齐陷阱**：React 组件在对话卡片中使用 `h-24px` + `lh-24px` 作为名称容器的 UnoCSS 类（固定在 24px 高度 + 24px 行高）。如果 beautify.css 在 `.chat-history__item-name` 上设置 `line-height: 44px`，则：
    - 文本的实际行高（44px）远大于容器高度（24px），文本**垂直溢出——视觉上偏下被切**
    - 22x22px 的图标容器用 `align-items: center` 完美居中的同时，文字却在下方被裁剪
    
    **正确做法**：使用 `line-height: inherit`，让 React 的原生 `lh-24px`（24px 行高）生效，配合父容器的 flex `align-items: center` 实现完全居中：
    ```css
    .chat-history__item {
      height: 36px !important;          /* 略高于原始 34px */
      align-items: center !important;   /* 垂直居中 */
      gap: 8px !important;              /* 图标和文字间距 */
    }
    .chat-history__item-name {
      line-height: inherit !important;  /* 使用 React 原生 lh-24px */
    }
    ```

25. **🎨 图标符号美化技巧**：AionUi 对话卡片的图标是 `Av` 组件（outline 16px SVG 图标）放在 `span.size-22px.flex.items-center.justify-center` 容器中。美化方法：
    ```css
    /* Apple Blue 圆底 */
    .chat-history__item .size-22px {
      border-radius: 6px !important;
      background: rgba(0,122,255,0.10) !important;
    }
    /* SVG 图标着色 + 柔化 */
    .chat-history__item .size-22px svg {
      color: var(--aou-6, #007aff) !important;
      opacity: 0.85;
    }
    ```
    注意：UnoCSS 转义类名（如 `[&_svg]:size-16` → `.\\[\\&_svg\\]\\:size-16`）在外部 CSS 中可能失效，优先使用原生 CSS 选择器如 `.size-22px svg`。

26. **🔍 JS minified 诊断法**：在不启动浏览器的情况下验证 DOM 结构，搜索 minified React JS 文件中的类名和渲染模式：
    ```bash
    # 查看组件实际渲染的 JSX 结构
    grep -oP '.{0,300}chat-history__item.{0,300}' index-*.js
    # 列出所有相关类名
    grep -oP 'chat-history__item[a-z_-]*' index-*.js | sort -u
    # 检查某个属性（如 data-preview）是否在 JS 中使用
    grep -r 'data-preview' assets/*.js
    # 搜索 conversation 对象的属性访问模式
    grep -oP '(t|e|n)\\.(name|id|last_message|created_at)' index-*.js | sort | uniq -c | sort -rn
    ```

## 主题设计参考

### 设计系统来源

美化 CSS 的设计理念来自以下参考系统：

| 系统 | 核心特征 | 适用场景 |
|------|----------|----------|
| **Linear** | 近黑底 `#08090a`、半透明白边框、亮度堆叠、indigo 强调 | 极简暗色 UI 标杆 |
| **VoltAgent** | 碳黑底 `#050507`、翡翠绿 `#00d992`、暖灰边框 `#3d3a39` | 开发者终端风格 |
| **Claude** | 羊皮纸暖底 `#f5f4ed`、陶土暖红 `#c96442`、衬线标题 | 温暖文字风格（不适合暗色） |
| **Superhuman** | 纯白底 + 紫渐变 hero、暖奶油按钮 | 精品极简（不适合暗色） |

### 设计铁律（暗色主题）

- **亮度堆叠**：底层最暗 → 面板 → 卡片 → hover → 边框，每层升 1-2% 白色透明度
- **半透明白边框**：用 `rgba(255,255,255,0.06)` ~ `0.12`，不用纯色边框（纯色在暗底上太重）
- **单一强调色**：只用一个色彩作为能量来源，其他全部暖灰/蓝灰
- **暖灰防冷淡**：纯蓝灰暗色会像医院，加一点暖调（如 VoltAgent 的 `#3d3a39` 替代纯 `#333`）
- **`!important` 三重奏**：`:root` → `html[data-color-scheme]` → `body[arco-theme]` 三层级加 `!important`

### 内置主题（当前）

#### Apple Design v5.2（当前使用）

macOS Ventura 风格——Apple Blue 强调，暗色 #1c1c1e 底色。
- 对话卡片：36px 紧凑高度，Apple Blue 圆底图标（6px 圆角 + `rgba(0,122,255,0.10)` 背景），`line-height: inherit` 原生垂直居中

| 变量 | 值 | 用途 |
|------|------|------|
| `--bg-base` | `#1c1c1e` | 页面底色（macOS 暗色） |
| `--aou-1` | `#2c2c2e` | 面板 |
| `--aou-6` | `#007aff` | Apple Blue 强调 |
| `--aou-10` | `#f5f5f7` | 主文字 |
| `--text-primary` | `#f5f5f7` | 一级文字 |
| `--primary` | `#007aff` | 主按钮 |
| `--success` | `#30d158` | Apple 绿 |
| `--warning` | `#ff9f0a` | Apple 橙 |
| `--danger` | `#ff453a` | Apple 红 |

#### 晨空 Morning Sky v4.0（上一版）

柔和蓝灰底 + 天空蓝点缀。

| 变量 | 值 |
|------|------|
| `--bg-base` | `#1b1e28` |
| `--aou-6` | `#5eafd4` |
| `--aou-10` / `--text-primary` | `#e8ebf0` |
| `--primary` | `#5eafd4` |

#### 暗色翡翠 Dark Emerald v3.0（再上一版）

极暗黑底 + 翠绿强调。

| 变量 | 值 |
|------|------|
| `--bg-base` | `#08090a` |
| `--aou-6` | `#10b981` |
| `--aou-10` / `--text-primary` | `#f2f2f2` |

### 主题切换方法

#### Apple Design ↔ Morning Sky

1. 所有 `#1c1c1e` → `#1b1e28`，`#2c2c2e` → `#21242f` 等逐层对应
2. `#007aff` → `#5eafd4`，`rgba(0,122,255,x)` → `rgba(94,175,212,x)`
3. 功能色：`#30d158`→`#5eb89c`，`#ff9f0a`→`#d4a35e`，`#ff453a`→`#d4686a`
4. 文字：`#f5f5f7`→`#e8ebf0`，`rgba(255,255,255,0.72)`→`#c4c9d5`

#### Dark Emerald → Apple Design

1. `#08090a` → `#1c1c1e`，`#0f1011` → `#2c2c2e`
2. `#10b981` → `#007aff`
3. `#f2f2f2` → `#f5f5f7`
