---
name: fund-monitor-native-compose
description: Build FundMonitor as a native Kotlin + Jetpack Compose Android app with Gradle — OkHttp data layer, Room persistence, MVVM architecture, dark theme UI with LazyColumn native scrolling.
---

# FundMonitor Native Compose 构建

v2 架构：原生 Kotlin + Jetpack Compose，告别 WebView。Gradle 标准构建，OkHttp 直连东方财富，Room 持久化，StateFlow 响应式状态管理。

## 项目位置
`/opt/data/FundMonitor-claude/`

## 技术栈
| 组件 | 版本 | 用途 |
|------|------|------|
| Gradle | 8.5 | 构建系统 |
| AGP | 8.2.2 | Android Gradle Plugin |
| Kotlin | 1.9.22 | 语言 |
| Compose BOM | 2024.01.00 | UI 框架 |
| Compose Compiler | 1.5.8 | Compose → IR |
| KSP | 1.9.22-1.0.17 | Room 注解处理 |
| OkHttp | 4.12.0 | 网络（原生 Referer 注入） |
| Room | 2.6.1 | 本地持久化 |
| compileSdk / targetSdk | 34 | |
| minSdk | 26 | Android 8.0+ |
| JVM Target | 17 | |

## 构建命令
```bash
cd /opt/data/FundMonitor-claude
export ANDROID_HOME=/opt/android-sdk
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew assembleDebug      # Debug APK (~16MB)
./gradlew assembleRelease    # Release APK with R8 (~1.5MB)
```

## 构建环境
- **SDK**: `/opt/android-sdk/`（platform 34, build-tools 34/35）。环境变量 `ANDROID_HOME` 未必自动设置，每次构建前须 `export ANDROID_HOME=/opt/android-sdk`
- **Java**: `/usr/lib/jvm/java-21-openjdk-amd64`（Gradle 8.5 要求 Java 17+）
- **Gradle**: `/opt/gradle-8.5/`（已安装，生成 wrapper 用）
- **Gradle 镜像**: `maven.aliyun.com`（settings.gradle.kts 中配置）
- **Debug keystore**: `/opt/data/fund_monitor_app/android/debug.keystore`（alias: `fundmonitor`, 密码: `android`）
- **签名命令**:
```bash
/opt/android-sdk/build-tools/35.0.0/apksigner sign \
  --ks /opt/data/fund_monitor_app/android/debug.keystore \
  --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias fundmonitor \
  --out FundMonitor-v2.apk \
  app/build/outputs/apk/release/app-release-unsigned.apk
```

## 文件结构
```
FundMonitor-claude/
├── settings.gradle.kts        # 阿里云镜像 + 仓库配置
├── build.gradle.kts            # AGP 8.2.2 + Kotlin 1.9.22 + KSP
├── gradle.properties           # JVM 内存 + AndroidX
├── local.properties            # sdk.dir=/opt/android-sdk
├── app/build.gradle.kts        # Compose + OkHttp + Room + Navigation
├── app/src/main/
│   ├── AndroidManifest.xml     # INTERNET 权限 + 暗色主题
│   ├── java/com/fundmonitor/
│   │   ├── MainActivity.kt     # Compose App + Tab 导航 + BottomBar
│   │   ├── data/
│   │   │   ├── model/
│   │   │   │   ├── Fund.kt         # 基金模型（curVal/chgPct/gain 计算）
│   │   │   │   ├── Portfolio.kt    # 组合模型 + Holding
│   │   │   │   └── ApiModels.kt    # FundGzResponse + EtfPriceResponse
│   │   │   ├── network/
│   │   │   │   └── FundApi.kt      # OkHttp 三数据源
│   │   │   ├── room/
│   │   │   │   └── AppDatabase.kt  # Room DB + DAO + Entity
│   │   │   ├── PortfolioStore.kt   # 8 个预置组合 + ETF 映射
│   │   │   └── FundRepository.kt   # 核心刷新协调逻辑
│   │   ├── viewmodel/
│   │   │   └── MainViewModel.kt    # StateFlow 状态管理
│   │   └── ui/
│   │       ├── OverviewScreen.kt   # 总览页 LazyColumn
│   │       └── PortfolioScreen.kt  # 组合详情 + FundRow
│   └── res/                       # 图标 + 主题
└── app/proguard-rules.pro        # R8 混淆规则
```

## 核心数据流
```
User Action → MainViewModel.refresh()
  → FundRepository.refreshAll()
    → FundApi.fetchFundGz(code)       } 并行
    → FundApi.fetchEtfPrice(ticker)   } 并行
    → FundApi.fetchSinaEtf(ticker)    } 并行
  → 数据合并（EM fundgz 优先 → ETF 代理 → 兜底）
  → Room 持久化
  → StateFlow 更新 → Compose 自动重组
```

## ⚠️ Compose 致命兼容性问题 → WebView 回退

**2026-05-08 实测结论**：用户的 Android 设备上，Compose 复杂布局（Scaffold、多子节点 Column/Box、状态变化触发重组）会导致**黑屏后闪退**（无 ANR 弹窗，直接切回桌面），但以下组件单独均正常：
- 纯静态 Compose 文字 ✅
- LazyColumn + ViewModel ✅
- Room 读写 ✅
- OkHttp 网络 ✅
- WebView + AndroidView ✅

**根因不明**（无法获取 adb logcat），但已通过渐进式隔离测试锁定：**Compose 多子节点 + 状态变化 = 崩溃**。

**最终方案**：纯 Compose 放弃，改用 **WebView 加载单页 HTML**（`Compose Surface` + `AndroidView(WebView)` — 只有一个 Compose 子节点，不触发崩溃）。WebView 通过 `shouldInterceptRequest` + OkHttp 原生注入 Referer 头访问东方财富 API。HTML/JS 在 WebView 中 CORS 不受限，所有 `fetch()` 直接可用。

**结论**：此设备 Compose 不可用于多组件 UI，WebView + HTML 是 100% 可靠的逃逸方案。

## 基金处理逻辑（FundRepository.refreshFund — Compose 原生版）
**数据源优先级（2026-05-08 确认）**：
1. **东方财富 f10/lsjz**（官方净值，最高优先级）→ 不可用时降级
2. **天天基金 fundgz**（实时估值，备用）→ 不可用时降级
3. **ETF 代理**（QQQ/SPY/AGG 等，最后兜底）

**特殊处理**：
1. **货币基金**（003389/000509/009790/004939）→ 跳过所有 API，直接显示 "💰 货币基金"
2. **已确认基金**（todayConfirmed）→ 跳过，source="✅ 已确认"
3. **QDII 无 fundgz 基金**（007360/002400 等）→ 优先 f10/lsjz，不可用则 ETF 代理

## Fund.curVal 计算逻辑

三条路径，按优先级 fall-through：

```
1. 已确认（净值变化）：amount × new_dwjz / old_dwjz  → 需 prev != newD 才走；相等则跳过
2. 盘中估值：          amount × gsz / dwjz            → 需 gsz 和 dwjz 都有值
3. ETF/JZZZL 代理：    amount × (1 + chgPct / 100)    → 兜底路径
默认：                amount                            → 全失败时 = 持有金额
```

### ⚠️ curVal 常见陷阱（2026-05-18 实战修正）

**陷阱 1：路径 1 在 prevDwjz == dwjz 时返回 amount**
- 当 Room DB 中有旧数据且 `prevDwjz` 恰好等于当前 `dwjz` 时，路径 1 匹配成功返回 `amount × dwjz / dwjz = amount`，但收益=0。
- **修复**：路径 1 加条件 `prev != newD`，相等时跳过→路径 3 用 JZZZL 计算。
- 代码：`if (confirmed && prev != null && newD != null && prev > 0 && prev != newD)`

**陷阱 2：确认时 savePrevNav 覆盖旧值**
- `db.portfolioDao().savePrevNav(fund.toPrevNav())` 在确认路径执行，把当日净值写入 prevNav
- 下次刷新时 `prevDwjz` 从 Room 读取→等于当日净值→路径 1 计算 `amount × same / same = amount`
- **修复**：确认路径**不保存** prevNav；由未确认刷新时自然更新（此时 dwjz 是前一日净值）

**陷阱 3：已确认快速跳过路径创建空 Fund**
- `todayConfirmed.contains(code)` 快速路径直接返回只有 code/name/amount 的空 Fund
- 无 dwjz/gsz/prevDwjz → curVal 三条路径全失败 → 收益=0
- **修复**：移除快速路径，始终走 `refreshFund()` 完整流程（API 重取成本可忽略）

**陷阱 4：prevDwjz 回退值用官方净值**
- `prev?.dwjz ?: official.dwjz` — 无历史数据时把当日净值当"前值"，导致路径 1 同值
- **修复**：`prev?.dwjz ?: ""` — 无历史数据时留空，让路径 1 跳过，走路径 3 (JZZZL)

**陷阱 5：JZZZL 带 % 号导致 toDoubleOrNull() 失败**
- 东方财富 f10 接口的 JZZZL 字段格式为 `"-2.46"`（实测无 %），但为安全起见与 `chgPct` 保持一致
- **修复**：`gszzl.replace("%", "").toDoubleOrNull()`

### Compose 版首次运行与 Room 冷启动

Compose 改为 Room 持久化后，首次运行 prevNav 表为空 → 所有已确认基金的 `prevDwjz` 都取不到历史数据。上述陷阱 1-4 联合作用导致**所有基金当日盈亏显示 ¥0 但涨跌幅正常**。修复后的正确行为：无历史数据时路径 1 自动跳过，路径 3 用 JZZZL 计算收益。

## 依赖版本兼容性表
| Kotlin | Compose Compiler | AGP | Gradle |
|--------|-----------------|-----|--------|
| 1.9.22 | 1.5.8           | 8.2.x | 8.5   |
| 2.0.0  | 1.6.x           | 8.3+  | 8.6+  |

不要混用 Kotlin 2.0 和 Compose Compiler 1.5.x。

## 常见坑
- **Gradle 首次构建超时**：阿里云镜像虽快但第一次仍需下载 ~500MB 依赖。后台运行 `background=true`。
- **Gradle daemon OOM**：daemon 长时间运行后（尤其多次 R8 构建）可能 OOM 崩溃，报 `Gradle build daemon disappeared unexpectedly`。解决：`pkill -f GradleDaemon` 后重新构建，或用 `--no-daemon`（慢但稳定）。Release 构建建议 `--no-daemon`。
- **Compose Compiler 版本不匹配**：Kotlin 1.9.22 必须配 Compose Compiler 1.5.8，否则编译失败。
- **Room KSP**：必须用 KSP 而非 kapt（AGP 8.x 不支持 kapt 的某些特性）。
- **APK 签名**：debug.keystore alias 是 `fundmonitor` 不是 `androiddebugkey`。
- **ETF 涨跌幅为 0**：`gszzl.toDoubleOrNull()` 正确返回 0.0，不像 JS 的 `if (chg_pct)` 会跳过。
- **Fund.curVal**：已确认基金的 curVal 需要 prevDwjz 字段，不能仅靠 gsz/dwjz 计算。
- **天天基金 fundgz + 货币基金**：货币基金（如 `000509` 广发钱袋子、`003389` 招商招益宝）的 fundgz JSONP 接口返回 **404 HTML 页面**（不是 JSONP）。这不是 bug，是天天基金 API 本身不给货币基金提供估值数据。`FundRepository.refreshFund()` 通过 `MONETARY_FUNDS` 集合在请求前就跳过了，所以完整版不会遇到。但如果用货币基金代码测试网络层（Step 4），会误报失败。

### 🔴 闪退修复（致命坑）

**R8 混淆导致闪退**：Release build 必须用完整 ProGuard 规则，否则 App 启动即崩：
1. **OkHttp ServiceLoader**：R8 会删除 `META-INF/services` 文件，须 `-keep` 所有 `okhttp3.**` 和 `okio.**`，且保留 ServiceLoader 引用的类
2. **Room KSP 生成类**：`AppDatabase_Impl`、DAO 实现类会被 R8 改名/删除，必须显式 `-keep`
3. **ViewModel 构造器**：`AndroidViewModel(Application)` 构造器会被 R8「优化」掉，必须 `-keepclassmembers` 保留
4. **最佳实践**：用 `-keep class com.fundmonitor.** { *; }` 全面保护自己代码（代价是 APK 从 1.5MB → 6.8MB，但避免崩溃）

**enableEdgeToEdge() 崩溃**：`ComponentActivity.enableEdgeToEdge()` 在部分国产手机/旧 Android 版本上会导致启动崩溃。**直接删除该调用**，用 Scaffold 自带的 `padding` 处理系统栏即可。

完整可用的 `proguard-rules.pro` 参见项目文件。Release build 耗时约 5 分钟（R8 分析全量代码）。

### Kotlin/Compose 编译坑

| 错误 | 正确写法 |
|------|---------|
| `init { if (x) return }` — `'return' is not allowed here` | `init { if (x) { ... } else { viewModelScope.launch { ... } } }` |
| `try { Composable() } catch(e) {}` — `Try catch is not supported around composable function invocations` | 不能在 Composable 调用外包 try-catch；把异常处理放在 ViewModel/init 中，用 StateFlow 传递错误状态给 UI |
| `OverviewScreen(ports, results) { fn(it) }` — trailing lambda 被误解析 | 必须用命名参数：`OverviewScreen(ports, results, onPortfolioClick = { fn(it) })` |
| `ViewModel(application) init` 中未捕获异常 → 静默崩溃 | 每个初始化步骤包 try-catch，失败时 set `_error.value` |

### 🔬 渐进式 5 步隔离调试法（最高效定位手段）

当完整 App 启动崩溃但 `adb logcat` 无效/不可用时，构建 5 个递进 Mini-APK，每步只在上一版上加一个组件。让用户逐个安装，找到第一个崩的：

| Step | 内容 | 验证目标 |
|------|------|---------|
| 1 | 纯静态 Compose 文字（无 ViewModel/Room/OkHttp） | Compose 框架本身 |
| 2 | Step1 + ViewModel + collectAsStateWithLifecycle + LazyColumn 硬编码数据 | ViewModel 集成 |
| 3 | Step2 + Room 数据库实际读写（单表，不涉及网络） | Room 初始化 |
| 4 | Step3 + OkHttp 分项测试（OkHttpClient/HTTPS/Tiantian/Eastmoney 各一次） | 网络层 |
| 5 | 完整 App（全部组件合并） | 完整集成 |

**方法**：
1. 从 Step 1 开始装，找到第一个崩的
2. 崩在哪一步 = 该步新增的组件有问题
3. 每步只改一个 `MainActivity.kt`，依赖不变（同一 `build.gradle.kts`）。用不同文件名保存 APK（`FundMonitor-step1.apk` ...）

**Step 4 关键细节**：网络测试必须用**非货币基金代码**（如 `000001` 华夏成长混合）。货币基金（`000509` 广发钱袋子）天天基金 fundgz API 返回 404，这是正确行为不是 bug。真实 `FundRepository` 中通过 `MONETARY_FUNDS` 集合在请求前就跳过了。

### 调试：「打开即消失」无崩溃但 UI 不可见

**现象**：App 启动后显示空白/黑屏然后被切回桌面，后台未退出（无 ANR 对话框）。

**根因**：通常是 ViewModel `init` 中 Room DB 或网络初始化抛异常，被静默吞掉，导致 StateFlow 永远不更新，UI 停在初始空白状态。

#### 🔥 最有效定位方法：分步日志 + 错误屏幕

在 ViewModel init 中给每一步加 `Log.i("FundMonitor", "Step N: ...")`，失败时把完整错误信息通过 `_error` StateFlow 显示在屏幕上（不用 Toast，Toast 一闪而过看不见）：

```kotlin
init {
    viewModelScope.launch {
        try {
            Log.i("FundMonitor", "Step 1: Room DB...")
            val db = AppDatabase.getInstance(app)  // 可能崩
            Log.i("FundMonitor", "Step 1: OK")

            Log.i("FundMonitor", "Step 2: Repository...")
            val repo = FundRepository(db)
            Log.i("FundMonitor", "Step 2: OK")

            Log.i("FundMonitor", "Step 3: 加载默认组合...")
            repo.init()
            Log.i("FundMonitor", "Step 3: OK, ${repo.portfolios.value.size} 个")

            _isInitializing.value = false
        } catch (e: Exception) {
            _isInitializing.value = false
            _error.value = "${e.message}\n原因: ${e.cause?.message ?: ""}"
        }
    }
}
```

UI 端显示错误：
```kotlin
if (error != null) {
    Text("❌ 初始化失败", ...)
    Text(error ?: "", fontFamily = FontFamily.Monospace, ...)  // 等宽字体显示异常
    Text("请截图发给开发者", ...)
}
```

#### 隔离方法：诊断 Mini-APK

当完整 App 启动闪退但定位不到具体组件时，构建一个**最小可运行 APK**（只含 Compose UI 框架，去掉 Room/ViewModel/OkHttp/所有业务逻辑），验证基础框架是否正常：

```kotlin
// 诊断版 MainActivity — 纯静态 Compose，零依赖业务组件
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            FundMonitorTheme {
                Surface(color = Color(0xFF0D1117)) {
                    Column(Modifier.padding(32.dp)) {
                        Text("📈 FundMonitor v2", color = Color(0xFF3FB950), fontSize = 24.sp)
                        Text("诊断模式 — Compose 框架正常", color = Color(0xFF8B949E))
                    }
                }
            }
        }
    }
}
```

**流程**：
1. 先发诊断版（无业务逻辑，仅 Compose 框架）→ 确认 Compose 本身不崩
2. 再发完整版（带 Loading/Error 状态）→ 看是否卡在 spinner 或显示红色错误
3. 如果完整版崩但诊断版正常 → 问题在 ViewModel init（Room/网络）
4. 如果诊断版也崩 → 问题在更底层（设备兼容性/签名/系统 WebView）

**重要**：诊断版必须在 `app/build.gradle.kts` 中去掉 `FundApp` Application 类引用（`android:name=".FundApp"`），否则 Application.onCreate 的异常捕获可能干扰测试。同时 `debug { isMinifyEnabled = false }` 确保无 R8 干扰。

#### 诊断基础设施（已加入完整版代码）：
1. **全局异常捕获**：`FundApp.kt` extends `Application`，`Thread.setDefaultUncaughtExceptionHandler` 写崩溃日志到 `/data/data/com.fundmonitor/files/crash.log`
2. **Loading/Error 状态**：ViewModel 新增 `isInitializing: StateFlow<Boolean>` 和 `error: StateFlow<String?>`，UI 根据这两个状态显示 spinner 或红色错误信息
3. **ViewModel init try-catch**：所有初始化逻辑包裹 try-catch，失败时 `_error.value = "失败: ${e.message}"` + Toast 提示
4. **Log 埋点**：`Log.i("FundMonitor", ...)` 关键步骤，`adb logcat -s FundMonitor` 可实时查看

> ⚠️ Kotlin `init {}` 块中不能用 `return` 关键字（编译错误：'return' is not allowed here）。用 `if-else` 分支替代。

**调试流程**：
```bash
# 1. 抓崩溃日志
adb shell cat /data/data/com.fundmonitor/files/crash.log
# 2. 实时看日志
adb logcat -s FundMonitor
# 3. 如果 Release 版崩但 Debug 版不崩 → R8 规则问题
```

### Gradlew 生成
不要手动写 `gradlew` 脚本！DEFAULT_JVM_OPTS 引号格式、wrapper jar 内容都容易出错。正确方式：
```bash
cd /opt/data/FundMonitor-claude
/opt/gradle-8.5/bin/gradle wrapper --gradle-version 8.5
```
首次 gradle 可能需要 ~30s 启动 daemon。

### 交付
微信发送 APK 须加密压缩：`zip -j -P 123456 output.zip input.apk`（微信拦截未加密的 .apk）
