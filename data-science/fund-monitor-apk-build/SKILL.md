---
name: fund-monitor-apk-build
description: 构建 FundMonitor Android APK — WebView + Kotlin + Gradle 标准构建。修改 assets/index.html 或 Kotlin 源码后一键构建。包含 OkHttp Referer 注入、三数据源并行拉取、货币基金万份收益处理。
---

# FundMonitor APK 构建（Gradle 版）

WebView + Kotlin + Compose Surface（最小化）架构。Gradle 标准构建。OkHttp 拦截器注入 Referer 头，纯前端 HTML/JS 处理所有数据逻辑。

## 项目位置
`/opt/data/FundMonitor-claude/`

## 构建命令

### Release 构建（推荐，需签名）
```bash
cd /opt/data/FundMonitor-claude
ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
  ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs=-Xmx1536m
# 输出: app/build/outputs/apk/release/app-release-unsigned.apk
```

### 签名（必须 zipalign → apksigner）
```bash
BT=/opt/android-sdk/build-tools/35.0.0
UNSIGNED=app/build/outputs/apk/release/app-release-unsigned.apk
KEYSTORE=/opt/data/fund_monitor_app/android/debug.keystore

$BT/zipalign -p -f 4 "$UNSIGNED" /tmp/FundMonitor_aligned.apk
$BT/apksigner sign --ks "$KEYSTORE" --ks-pass pass:android \
  --ks-key-alias fundmonitor --key-pass pass:android /tmp/FundMonitor_aligned.apk
$BT/apksigner verify /tmp/FundMonitor_aligned.apk   # 必须验证
cp /tmp/FundMonitor_aligned.apk /opt/data/FundMonitor.apk
```

**Keystore 关键信息**：
- 路径: `/opt/data/fund_monitor_app/android/debug.keystore`
- 别名: `fundmonitor`（不是 `androiddebugkey`）
- 密码: `android`

### 强制重编 HTML assets
Gradle 增量构建不会检测 HTML 变更。修改 `assets/index.html` 后必须：
```bash
rm -rf app/build/intermediates/assets && ./gradlew assembleRelease ...
```

**⚠️ WebView 会缓存旧 HTML**：即使 APK 重新打包了新 HTML，WebView 可能加载旧缓存。必须在 `MainActivity.kt` 的 WebView 初始化中加入：
```kotlin
clearCache(true)
settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
```
否则修改 HTML 后运行时行为不变。

### 内存限制
NAS 内存紧张（~1.5GB 可用）。Clean build 需要 `-Dorg.gradle.jvmargs=-Xmx1536m`。Clean build + R8 在 <1GB 时会 OOM。

### APK 提取恢复（从签名 APK 解出 HTML）
```bash
python3 -c "
import zipfile, os
with zipfile.ZipFile('/opt/data/FundMonitor.apk', 'r') as z:
    html = z.read('assets/index.html')
    os.makedirs('app/src/main/assets', exist_ok=True)
    with open('app/src/main/assets/index.html', 'wb') as f:
        f.write(html)
"
```

## 开发工作流（Claude Code + Git Worktree，当前标准）

```bash
# 📁 1. Claude Code 在 dev worktree 修改代码
cd /opt/data/FundMonitor-claude-dev
claude -p "修改任务描述" --model claude-sonnet-4-6 --max-turns 50

# ✅ 2. 语法测试
node /opt/data/scripts/test_fund_monitor.js --syntax

# 📝 3. 提交
cd /opt/data/FundMonitor-claude-dev
git add -A && git commit -m "描述"

# 🔀 4. 合并到 master
cd /opt/data/FundMonitor-claude
git merge dev

# 🔨 5. 从 master 构建 APK
rm -rf app/build/intermediates/assets
ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
  ./gradlew assembleDebug --no-daemon -Dorg.gradle.jvmargs=-Xmx1536m

# 📤 6. 发送
cp app/build/outputs/apk/debug/app-debug.apk /opt/data/FundMonitor.apk
```

**绝对禁止**：
- 在 master 目录直接改代码
- 跳过 commit/merge 直接从 dev 构建发 APK
- 不用 Claude Code 直接手动改代码

版本格式：`v{大版本}-{MMDD}{小写字母}-cc`，versionCode 4.0 起跳至 100。

### 旧版 worktree 流程（已弃用）

```
📁 dev worktree → ✏️ 修改 index.html
🧪 node test_fund_monitor.js --syntax    # JS 语法校验（防白屏）
📝 git add + git commit -m "..."          # dev worktree 提交
🔀 cd master && git merge dev             # 合并到 master
🧪 node test_fund_monitor.js --all        # 全量 192 项测试（结果必须展开显示）
🔨 cd master && ./gradlew assembleDebug   # 从 master 构建
📤 cp APK + MEDIA 发送                    # MEDIA 必须单独一行，不跟其他文字
```

**绝对禁止**：
- 在 master 目录直接改代码
- 跳过 commit/merge 直接从 dev 构建发 APK
- 隐藏测试结果（用户要求实时看到每步输出）

### MEDIA 发送规则
`MEDIA:/path` **必须单独发送**，不跟任何其他文字。长消息里的 MEDIA 标签会被平台吞掉，用户收不到文件。

### 全量测试说明
```bash
node /opt/data/scripts/test_fund_monitor.js --all
# 输出: 192 项 (16 单元 + 8 时间线 + 27 按类型 + 8 导入导出 + 131 集成 + 2 语法)
```
测试结果必须展开显示给用户，不能折叠或省略。

### ⚠️ 版本备份（每次修改前必做）

**APK 文件每次构建都会覆盖 `/opt/data/FundMonitor.apk`，没有自动版本存档。** 回退时如果没有备份，只能从最接近的旧 APK 中提取 HTML 重建，会丢失期间的所有修改。

每次修改 HTML 或 Kotlin 源码前：
```bash
cp /opt/data/FundMonitor.apk /opt/data/FundMonitor_v3.6-MMDD[a-z].apk
```
命名格式：`FundMonitor_v{版本号}.apk`（如 `FundMonitor_v3.7-0516a.apk`）

**恢复方法**：从备份 APK 提取 HTML：
```bash
python3 -c "
import zipfile
with zipfile.ZipFile('/opt/data/FundMonitor_v3.6-0515j.apk', 'r') as z:
    html = z.read('assets/index.html')
with open('/opt/data/FundMonitor-claude/app/src/main/assets/index.html', 'wb') as f:
    f.write(html)
"
# 然后 rm -rf app/build && ./gradlew assembleDebug
```

## 技术栈
| 组件 | 说明 |
|------|------|
| Kotlin | 1.9.22 |
| Compose | 最小化使用（仅 Surface + AndroidView 包装 WebView） |
| Gradle | 8.5 + AGP 8.2.2 |
| OkHttp | 4.12（WebView shouldInterceptRequest 注入 Referer） |
| 前端 | 纯 HTML/JS（855+ 行），无框架 |

## 文件结构
```
FundMonitor-claude/
├── app/src/main/
│   ├── java/com/fundmonitor/MainActivity.kt   # Compose Surface + WebView + OkHttp 拦截器
│   └── assets/index.html                       # 全部业务逻辑（JS 单文件）
├── app/build.gradle.kts
└── build.gradle.kts
```

**注意**：`data/`, `viewmodel/`, `ui/` 目录下的 Kotlin 文件是 Compose 方案遗留代码，**当前不使用**。原因见下文 Compose 崩溃章节。

---

## 核心架构

```
MainActivity.kt (Compose Surface → AndroidView)
  └── WebView
       ├── loadUrl("file:///android_asset/index.html")
       └── shouldInterceptRequest (OkHttp 注入 Referer)
            ├── fundgz.1234567.com.cn → Referer: fund.eastmoney.com
            ├── api.fund.eastmoney.com → Referer: fundf10.eastmoney.com
            ├── push2.eastmoney.com    → Referer: quote.eastmoney.com
            └── hq.sinajs.cn           → Referer: finance.sina.com.cn

index.html (纯前端 JS)
  ├── fetchFundData(code)     → fundgz JSONP（天天基金实时估值）
  ├── fetchF10Nav(code)       → api.fund.eastmoney.com/f10/lsjz（官方净值）
  ├── fetchEastmoney(ticker)  → push2.eastmoney.com（ETF 实时价）
  ├── fetchSina(ticker)       → hq.sinajs.cn（ETF 备用）
  └── processFund()           → 三路并行 → 智能决策
```

## WebView 关键配置（MainActivity.kt）

```kotlin
settings.javaScriptEnabled = true
settings.domStorageEnabled = true
settings.allowFileAccess = true
settings.allowFileAccessFromFileURLs = true          // ⚠️ 必须：file:// 下允许跨域 fetch()
settings.allowUniversalAccessFromFileURLs = true     // ⚠️ 必须：通用跨域访问
settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW  // ⚠️ 必须：HTTPS 混合内容
```

**缺失这三个配置 → fetch() 被 CORS 阻塞 → ETF/Sina API 全部失败。**

## OkHttp Referer 注入（MainActivity.kt）

浏览器 `fetch()` 禁止设置自定义 `Referer` 头，但东方财富 f10/lsjz API 必须有 `Referer: fundf10.eastmoney.com`。解决方案：WebView 的 `shouldInterceptRequest` 用 OkHttp 代理请求并在服务端注入 Referer。

```kotlin
val refererMap = mapOf(
    "fundgz.1234567.com.cn" to "https://fund.eastmoney.com/",
    "push2.eastmoney.com" to "https://quote.eastmoney.com/",
    "api.fund.eastmoney.com" to "https://fundf10.eastmoney.com/",
    "hq.sinajs.cn" to "https://finance.sina.com.cn/"
)
```

**只有 refererMap 中的 host 会被拦截**。其他 host 走 WebView 默认网络栈。

---

## 数据源优先级与并行拉取

### 最终确认的优先级（用户指定）
```
① 东方财富 f10/lsjz（官方净值，用于确认 NAV 变化）
② 天天基金 fundgz（实时估值，用于国内基金盘中展示）
③ ETF 代理（QQQ/SPY/AGG/EMB/BNDX 等，用于 QDII 盘中展示）
```

### 关键设计：三路并行，不是串行降级

**错误做法（已被纠正）**：串行 try f10 → try fundgz → try ETF。问题：f10 总是成功（返回 T+1 净值），导致 ETF 永远不被调用。

**正确做法**：
```javascript
const [f10, fi, etf] = await Promise.all([
    fetchF10Nav(code),
    skipFundgz ? Promise.resolve(null) : fetchFundData(code),
    getETFEstimate(code)
]);
// 三者并行拉取 → 统一决策
```

### 决策逻辑
```
Step A: f10 检测到 NAV 变化 → ✅ 已确认（使用 f10 数据）
Step B: NAV 未变化/首次加载：
  ① 国内基金 → fundgz 实时估值
  ② QDII/无 fundgz → ETF 实时盘中价
  ③ 仅 f10 可用 → 东方财富 T+1 净值（如天弘越南 008763）
```

---

## 货币基金处理

### 问题
- fundgz 对货币基金返回 404
- f10/lsjz 返回的 DWJZ 不是净值，而是**万份收益**（元/万份）

### 实测数据
```
000509 广发钱袋子A: f10 DWJZ=0.3386（万份收益），JZZZL=0.00
```

### 处理方式
```javascript
if (MONETARY_FUNDS.has(code)) {
    const mf10 = await fetchF10Nav(code);
    const wanfen = parseFloat(mf10.dwjz);        // 万份收益
    r.gain = wanfen * amount / 10000;             // 日收益
    r.chg_str = '+¥' + gain.toFixed(2);          // 绝对金额展示
    r.source = '货币基金';
    r.source_detail = '万份' + wanfen.toFixed(4) + '元';
}
```

货币基金 NAV 恒为 1.0000，持有金额不变，每日收益从万份收益计算。

### 已知货币基金代码
```
003389 招商招益宝货币B
000509 广发钱袋子A
009790 国寿安保增金宝货币B
004939 中欧滚钱宝货币C
```

---

## QDII ETF 代理实测结果

| ETF | 东方财富 push2 | 新浪 hq.sinajs | 首选 |
|-----|:---:|:---:|:---:|
| QQQ | ✅ | ✅ | EM |
| SPY | ❌ | ✅ | Sina |
| AGG | ❌ | ✅ | Sina |
| EMB | ✅ | ✅ | EM |
| BNDX | ✅ | ✅ | EM |
| VGK | — | ✅ | Sina |
| EWJ | — | ✅ | Sina |
| VT | — | ✅ | Sina |
| IWF | — | ✅ | Sina |
| XLY/XLV/XBI/GLD | — | ✅ | Sina |

**AGG 和 SPY 只能走新浪**，东方财富不返回数据。

### API 端点
- 东方财富: `https://push2.eastmoney.com/api/qt/stock/get?secid=105.{TICKER}&fields=f43,f57,f58,f169,f170`
- 新浪: `https://hq.sinajs.cn/list=gb_{ticker}`
- f43/1000 = 最新价，f170/100 = 涨跌幅%

---

## 数据源标签系统

CSS 彩色小标签，在来源列展示。source_detail 拆分为估值/日期独立底纹：

| 标签 | CSS 类 | 颜色 | 来源 |
|------|--------|------|------|
| 天天基金 | badge-tt | 琥珀金底 | fundgz |
| 东方财富 | badge-em | 暖琥珀底 | f10/lsjz |
| 新浪 | badge-sina | 紫灰底 | Sina ETF |
| ETF代理 | badge-etf | 暖铜底 | ETF 实时价 |
| 已确认 | badge-confirmed | 鼠尾草绿底 | NAV 确认 |
| 货币 | badge-money | 暖灰底 | 货币基金 |
| **估值数据** | badge-val | 青绿底 `var(--cyan)` | 净值/估值数字 |
| **日期时间** | badge-date | 紫灰底 `var(--purple)` | 净值日期/时间 |

### source_detail 格式化
`formatSourceDetail(detail)` 自动解析 `净值1.3573 (2026-05-19)` → 
`[净值1.3573]` 青绿底 + `[2026-05-19]` 紫灰底，分色清晰可读。

### 表格列宽
数据源列 `width:140px`，`white-space:nowrap`（不换行，表格拉宽显示完整）。¥ 符号已移除。

---

## Compose UI 崩溃历史（重要教训）

**问题**：设备上 Compose 多子节点 + 状态变化触发兼容性 bug → 黑屏 + 切走。

**隔离测试过程**：
1. 纯静态 Compose 文字 → ✅ 正常
2. ViewModel + LazyColumn（8 个组合名）→ ✅ 正常
3. Room 简单单表读写 → ✅ 正常
4. OkHttp 四段测试（客户端/HTTPS/JSONP/ETF）→ ✅ 全部通过
5. 完整数据层 + 简单 UI 滚动文字（5a）→ ✅ 正常
6. 5a + Scaffold 顶栏底栏 → ❌ 黑屏
7. Scaffold 去掉改用纯 Column + Box → ❌ 仍黑屏

**结论**：Compose 多组件布局在用户设备上不稳定。**永远不要恢复纯 Compose 方案**。

**当前方案**：Compose Surface（单子节点）→ AndroidView → WebView。这是唯一验证过稳定的架构。

---

## 加载进度指示

刷新时顶部显示渐变色进度条 + 文字：
```html
<div class="loading-bar"><div class="fill" style="width:0%"></div></div>
<div class="loading-text"></div>
```
CSS 动画：`@keyframes loadingSlide` 渐变滑动，`transition: width .3s`

## 实时 UI 渲染（renderPortfolio 必须遍历 holdings）

**关键 bug 修复**：新增基金不立即显示是因为 `renderPortfolio` 遍历的是 `r.funds`（上次刷新结果），新基金在 `holdings` 里但不在 `funds` 里。

**修复**：遍历 `d.holdings`，通过 `fundsByCode` 字典查找结果，未找到的显示"加载中..."占位：

```javascript
const fundsByCode = {};
(r.funds || []).forEach(f => { fundsByCode[f.code] = f; });
d.holdings.forEach((h, i) => {
    const f = fundsByCode[h[0]] || { source:'加载中', chg_str:'...' };
});
```

## Promise 回调顺序 Bug（CRITICAL）

```javascript
// ❌ 错误 — .then() 按完成顺序执行，funds 数组乱序
const funds = [];
const promises = holdings.map(h => processFund(...).then(r => { funds.push(h[0]); }));
await Promise.allSettled(promises);

// ✅ 正确 — settled.map((s,i)=>...) 保留下标对应 holdins[i]
const promises = holdings.map(h => processFund(h[0], h[1], h[2], ...));
const settled = await Promise.allSettled(promises);
const list = settled.map((s, i) => { /* i 与 holdings[i] 严格对应 */ });
```

**影响**：乱序导致 `renderPortfolio` 中 `d.holdings[i]` 取到错误的基金，名称和金额对调。

## 每日净值刷新（确认后更新持有金额）

```javascript
if (f.confirmed) {
    const h = portfolioData[k].holdings.find(h => h[0] === f.code);
    if (h && Math.abs(h[2] - f.cur_val) > 0.005) {
        h[2] = f.cur_val;  // 更新持有金额为最新市值
        portfolioChanged = true;
    }
}
if (portfolioChanged) savePortfolios(portfolioData);
```

## QDII 陈旧净值规则

QDII 基金 f10/lsjz 净值晚 1-2 天。无实时源的 QDII 不在盘中采用陈旧净值：

```javascript
const isQdiiNoRealtime = QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code] !== undefined;
if (isQdiiNoRealtime) { r.source = 'QDII待更新'; r.cur_val = amount; }
```

### ⚠️ 编辑陷阱

- **patch 工具对 HTML 内 JS 模板字符串不可靠**：`\\\"` 等转义符会被反复叠加导致语法错误→白屏。多文件编辑用 `terminal python3 /tmp/script.py`。
- **read_file 默认 500 行截断**：大文件（index.html ~2200 行）必须用 `offset` + `limit` 或 `write_file` 全量读写。
- **语法校验已集成进 --all**：`vm.Script` 直接编译 HTML 内 `<script>` 块，转义错误在构建前拦截。

## 当前配色：暖色系（用户偏好 v3.8-0520i+）

```css
:root {
  --bg: #1c1814;                              /* 深咖啡底色 */
  --card: rgba(210,190,160,0.06);             /* 奶茶米色卡片 */
  --cardBorder: rgba(210,190,160,0.10);
  --fg: rgba(255,248,238,0.92);               /* 象牙白文字 */
  --gray: rgba(210,190,160,0.55);             /* 暖灰 */
  --red: #E07B5A;    --green: #8DA870;        /* 陶土红涨 / 鼠尾草绿跌 */
  --blue: #B89960;   --yellow: #D4A540;       /* 琥珀金强调 / 暖琥珀 */
  --purple: #A08070; --orange: #D4935C;       /* 紫灰 / 暖铜 */
  --cyan: #80A898;                             /* 青绿 */
}
```
表格用 `border-collapse:separate` + 暖色分隔线代替斑马纹。排序按钮活跃态琥珀金。

## App 图标

5 根柱状图（红跌绿涨）+ 绿色上箭头。Pillow 生成 5 种密度 PNG。colors.xml 背景 `#1C1C1E`。

## 个人版/发行版双版本

| 版本 | DEFAULT_PORTFOLIOS | 文件 |
|------|-------------------|------|
| Personal | 8组合/150+基金 | FundMonitor-Personal.apk |
| Public | 1示例组合 | FundMonitor-Public.apk |

## 构建缓存恢复

```bash
cp app/build/intermediates/assets/debug/index.html app/src/main/assets/index.html
```

## 修改要点

- HTML 修改：直接编辑 `app/src/main/assets/index.html`，然后强制删除 intermediates + `./gradlew assembleRelease`
- **绝对不要用 sed 编辑 HTML**：复杂转义极易损坏文件。使用 `patch` 工具或 Python `write_file`。
- Kotlin 修改：编辑 `MainActivity.kt`，然后重新构建
- **不要**修改 `data/`, `viewmodel/`, `ui/` 下的文件（Compose 遗留，不使用）
- 交付：`MEDIA:/opt/data/FundMonitor.apk`（不压缩不加密）
- 文件损坏恢复：从签名 APK 用 Python zipfile 解出 `assets/index.html`

## 确认逻辑关键 Bug（prevDwjz 死锁）

```javascript
// ❌ 旧：首次加载 prevDwjz=null → null && ... → 永不确认
if (prevDwjz && parseFloat(f10data.dwjz) !== parseFloat(prevDwjz)) { confirm(); }

// ✅ 新：首次加载按 jzrq 日期判断
if (!prevDwjz) {
    if (f10data.jzrq >= yesterdayStr) shouldConfirm = true;  // 净值日期是近期
} else {
    if (parseFloat(f10data.dwjz) !== parseFloat(prevDwjz)) shouldConfirm = true;
}
```

货币基金同理：必须复制 todayConfirmed 检查和 jzrq 判断到货币基金分支（因为它 early return 跳过了通用确认逻辑）。

## 持有金额精度

确认写入 `h[2] = Math.round(f.cur_val * 100) / 100`。编辑保存同理。所有 `toLocaleString` 改为 `toFixed(2)` 去掉千分位。

## 跨重启确认持久化（v3.7+）

### 问题

`prevNavs` 和 `todayConfirmed` 存储在 JS 内存中。Android 杀 WebView 进程后全部丢失 → 重启后没有历史净值做比较 → 所有基金确认失败 → fundgz 周末/非交易时段返回 `gszzl=0.00` → 涨跌显示为 0。

### 方案

三件套持久化到 localStorage：

```javascript
// 1. 数据结构
let prevNavs = {};           // code → dwjz（前一日净值）
let todayConfirmed = new Set(); // 今日已确认基金代码
let confirmedSnapshots = {}; // code → {amount, cur_val, chg_pct, chg_str, gain, gain_str, ...}
let lastConfirmedDate = '';  // 上次确认的日历日期

// 2. 保存（doRefresh 末尾调用）
function saveState() {
  localStorage.setItem('fm_prevNavs', JSON.stringify(prevNavs));
  localStorage.setItem('fm_todayConfirmed', JSON.stringify([...todayConfirmed]));
  localStorage.setItem('fm_lastConfirmedDate', lastConfirmedDate);
  localStorage.setItem('fm_confirmedSnapshots', JSON.stringify(confirmedSnapshots));
}

// 3. 恢复（应用启动时调用 loadState()）
function loadState() {
  const dow = new Date().getDay();
  const isTradeDay = dow >= 1 && dow <= 5;
  // 仅在交易日切换时清空（周末保留周五确认状态）
  if (lastConfirmedDate !== today && isTradeDay) {
    todayConfirmed = new Set();
    confirmedSnapshots = {};
  } else {
    // 同日或周末 → 从 localStorage 恢复
    todayConfirmed = new Set(JSON.parse(localStorage.fm_todayConfirmed));
    confirmedSnapshots = JSON.parse(localStorage.fm_confirmedSnapshots);
  }
  lastConfirmedDate = today;
}

// 4. 在 doRefresh 中使用快照恢复已确认基金
for (const h of allHoldings) {
  if (todayConfirmed.has(h[0])) {
    const snap = confirmedSnapshots[h[0]];
    if (snap) confirmedFunds.push({...snap, confirmed: true});
  }
}
```

### 关键设计决策

- **周末保留确认**：`isTradeDay` 检查确保周五确认数据保留到周一开盘
- **完整快照**：不仅保存 NAV，还保存 `cur_val`, `chg_pct`, `gain` 等展示数据
- **快照优先于内存**：重启后 `confirmedSnapshots` 有数据，优先使用它而非空的 `prevResults`

## Bug #11: h[2] 滚动逻辑（v4.0-0522f-cc 终版：lastRolledDate 持久化 map）

### 四项滚动需求（用户指定）
1. 交易日当天收盘后**第一次确认**→滚动 h[2] = f.cur_val，写入持久化并标记"今日已滚"
2. h[2] **锁定到下一个交易日收盘**：已滚过的基金不重复滚
3. **手动编辑不影响滚动判断**：编辑前已滚→不再滚；编辑前未滚→确认后仍可滚一次
4. **导入 CSV**：新基金（未确认）默认需滚一次；已确认基金不滚，h[2] 已是滚动后金额

### 废弃 rolledCodes，改用 lastRolledDate

`rolledCodes`（Set）的致命缺陷：交易日切换即清空，无法锁到次日收盘。早上打开 app 可能误判重滚。

**新方案**：持久化 `lastRolledDate` map（`{code: "2026-05-21"}`），每个基金记录上次滚动交易日。

```javascript
// 初始化 + 持久化（localStorage key: fm_last_rolled_date）
const lastRolledDate = {};
function loadLastRolledDate() {
  try { Object.assign(lastRolledDate, JSON.parse(localStorage.fm_last_rolled_date||'{}')); } catch(e) {}
}
function saveLastRolledDate() {
  try { localStorage.fm_last_rolled_date = JSON.stringify(lastRolledDate); } catch(e) {}
}

// 快速路径：curVal 始终正确计算
const curVal = h[2] * (1 + chgPct / 100);

// 确认后滚动：lastRolledDate[code] !== today 保证锁到次日收盘
if (isAfterMarketClose() && lastRolledDate[f.code] !== today && Math.abs(h[2] - f.cur_val) > 0.005) {
    h[2] = Math.round(f.cur_val * 100) / 100;
    lastRolledDate[f.code] = today;  // 持久化锁定
    portfolioChanged = true;
}
```

### 滚动锁时间线验证

| 时间 | 事件 | lastRolledDate | today | 滚？ |
|------|------|----------------|-------|------|
| 周四 15:05 | 首次确认+收盘 | 空 | 周四 | ✅ 滚 |
| 周四 15:30 | 二次刷新 | 周四 | 周四 | ❌ 锁住 |
| 周五 7:23 | 早盘刷新 | 周四 | 周四(9:30前) | ❌ 锁住 |
| 周五 15:05 | 收盘刷新 | 周四 | **周五** | ✅ 滚 |
| 周五 15:30 | 二次刷新 | 周五 | 周五 | ❌ 锁住 |

### 手动编辑与滚动正交

编辑 h[2] 不改变 `lastRolledDate`——两个独立的维度：
- 编辑前 `lastRolledDate[code]`=周四 → 今天已是周四 → 不滚
- 编辑前 `lastRolledDate[code]`=空 → 周四收盘后 → 滚一次

### CSV 导入处理

- h[4]（确认日期）≠ today → `lastRolledDate[code] = h[4]`（标记已滚，锁定）
- h[4] = today → 不设置（允许今日收盘后滚）
- 导出 CSV 时优先使用 `lastRolledDate[code]` 而非 h[4]

0. **毛玻璃效果不显示（backdrop-filter 陷阱）** → Android WebView **完全不支持** `backdrop-filter: blur()`（即使是 `-webkit-` 前缀也无效）。若卡片背景透明度太低（rgba 0.04-0.06），没有 blur 扩散时肉眼不可见。解决方案：用**渐变背景 + 内阴影**模拟毛玻璃的光线漫反射质感——`background: linear-gradient(135deg, rgba(225,205,175,0.10), rgba(225,205,175,0.05))` + `box-shadow: 0 1px 0 rgba(255,248,238,0.03) inset, 0 4px 14px rgba(0,0,0,0.12)`。渐变从高→低透明度模拟磨砂表面光扩散，inset 顶部高光模拟玻璃边缘反光，外阴影增加深度层。**保留 `backdrop-filter` 不动**——在 iOS/Safari 上仍然生效。**必须覆盖所有卡片类型**（topbar/summary/total-card/ov-card），因为 ov-card 有独立的覆盖声明，改共享规则时会漏掉。

1. **ETF 标签不显示** → 检查来源列宽度（≥150px）、WebView CORS 设置
2. **QDII 债券无数据** → 检查 AGG 走新浪（非东方财富）
3. **货币基金无收益** → 检查 MONETARY_FUNDS 包含该代码、f10/lsjz 返回有效 DWJZ
4. **基金全部无数据** → 检查 WebView `shouldInterceptRequest` 是否正常拦截
5. **黑屏** → 不要用 Compose 多组件，当前 WebView 方案最稳定
6. **零点后确认归零** → prevNavs/todayConfirmed 丢失，检查 localStorage 持久化是否生效
7. **patch 工具损坏 HTML** → 转义字符 `\\n` 被双重转义时，用 Python `execute_code` 直接写文件修复
8. **CLEANUP_VERSION 未 bump** → 旧 APK 持久化了 `fm_cleanup_v`，新 APK 不 bump → CLEANUP 不执行 → 修改无效。每次改 CLEANUP 块内代码必须 bump 版本号
9. **已切换 Claude Code 开发** → 当前标准流程见 `fundmonitor-claude-workflow` skill
