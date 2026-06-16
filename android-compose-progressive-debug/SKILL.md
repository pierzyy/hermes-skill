---
name: android-compose-progressive-debug
description: When a native Android Compose app crashes silently (black screen + immediate switch away), use incremental test APKs to isolate which dependency/layer causes the crash. Each step adds ONE new dependency. Test each step on device before proceeding.
category: software-development
---

# Android Compose Progressive Debugging

Use this when: a native Android Compose app crashes on launch with **no useful error** — just black screen, then switched to home. No logcat access. No crash dialog.

## Core Principle

If you can't see the error, **bisect your dependencies**. Build a series of APKs where each adds exactly ONE new thing. Test each on-device before building the next.

## Step Template

### Step 1: Static Compose (prove framework works)
```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(
                primary = Color(0xFF58A6FF), background = Color(0xFF0D1117), surface = Color(0xFF161B22)
            )) {
                Surface(Modifier.fillMaxSize(), color = Color(0xFF0D1117)) {
                    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center) {
                        Text("App v2", fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Text("Step 1 — Framework OK ✅", fontSize = 14.sp, color = Color(0xFF3FB950))
                    }
                }
            }
        }
    }
}
```
**What it tests**: Compose framework + Material3 + darkColorScheme exist and work.
**If this crashes**: Problem is at the Gradle/AGP/library level — wrong Compose BOM version, missing native libs, incompatible minSdk.

### Step 2: + ViewModel + collectAsStateWithLifecycle + LazyColumn
```kotlin
class Step2ViewModel : ViewModel() {
    private val _items = MutableStateFlow(listOf(
        PortfolioItem("Test A", 10, "¥1,000"),
        PortfolioItem("Test B", 8, "¥2,000"),
    ))
    val items: StateFlow<List<PortfolioItem>> = _items
}

@Composable
fun Step2Screen() {
    val vm: Step2ViewModel = viewModel()
    val items by vm.items.collectAsStateWithLifecycle()
    LazyColumn { items(items) { ... } }
}
```
**What it tests**: `viewModel()` factory + `collectAsStateWithLifecycle()` + `LazyColumn` + `StateFlow`.
**If this crashes**: Issue is in `lifecycle-viewmodel-compose` or `lifecycle-runtime-compose` — check dependency versions match Compose BOM.

### Step 3: + Room Database (AndroidViewModel)
```kotlin
class Step3ViewModel(app: Application) : AndroidViewModel(app) {
    init {
        viewModelScope.launch {
            val db = TestDatabase.getInstance(app)
            db.testDao().insertAll(testData)
            val data = db.testDao().getAll()
            _items.value = data
        }
    }
}
```
**What it tests**: `AndroidViewModel(Application)` constructor + Room `databaseBuilder` + KSP-generated DAO.
**If this crashes**: Room or KSP issue — check `ksp` plugin version matches Kotlin version. Ensure Room entities/DAO are in the APK (ProGuard/R8 rules).

### Step 4: + OkHttp networking (FOUR sub-tests)

The network test must be split into 4 separate sub-tests because different data sources behave differently on different networks/devices:

```kotlin
// ① Create OkHttpClient
val client = OkHttpClient.Builder()
    .connectTimeout(8, TimeUnit.SECONDS).readTimeout(8, TimeUnit.SECONDS).build()

// ② HTTPS to baidu (basic connectivity)
val resp1 = client.newCall(Request.Builder().url("https://www.baidu.com").build()).execute()
test1 = if (resp1.isSuccessful) "✅" else "❌"

// ③ Tiantian fundgz JSONP — MUST use a non-money-market fund!
//    Money market funds (000509/003389 etc) return 404 HTML, not JSONP.
//    Use 000001 (华夏成长混合) or any active equity fund.
val resp2 = client.newCall(Request.Builder()
    .url("https://fundgz.1234567.com.cn/js/000001.js")
    .header("Referer", "https://fund.eastmoney.com/")
    .build()).execute()
test2 = if (resp2.body?.string()?.contains("jsonpgz") == true) "✅" else "❌"

// ④ Eastmoney push2 ETF
val resp3 = client.newCall(Request.Builder()
    .url("https://push2.eastmoney.com/api/qt/stock/get?secid=105.QQQ&fields=f43,f58")
    .header("Referer", "https://quote.eastmoney.com/")
    .build()).execute()
test3 = if (resp3.isSuccessful) "✅" else "❌"
```

**⚠️ Critical**: Sub-test ③ MUST use a non-money-market fund code. If you use `000509` (广发钱袋子, a money market fund), the Tiantian fundgz API returns **404 HTML page** instead of JSONP data. This is NOT a bug — it's because Tiantian doesn't provide real-time NAV estimates for money market funds. The real `FundRepository` skips these via `MONETARY_FUNDS` check before making the request.

**What it tests**: OkHttp in Android context with cleartext/referer headers, across 4 different data sources.
**If this crashes**: OkHttp may be stripped by R8, or network security config issue, or wrong fund code in sub-③.

### East Money API Reference (for data-layer debugging)

| API | URL | Referer | Returns |
|-----|-----|---------|---------|
| **f10/lsjz** (official NAV) | `https://api.fund.eastmoney.com/f10/lsjz?callback=j&fundCode={code}&pageIndex=1&pageSize=1` | `https://fundf10.eastmoney.com/` | JSONP `j({...})`, FSRQ=date, DWJZ=NAV, JZZZL=growth% |
| **push2 ETF** (real-time) | `https://push2.eastmoney.com/api/qt/stock/get?secid=105.{ticker}&fields=f43,f58,f170` | `https://quote.eastmoney.com/` | JSON, f43=price*1000, f170=chg%*100 |
| **Tiantian fundgz** | `https://fundgz.1234567.com.cn/js/{code}.js` | `https://fund.eastmoney.com/` | JSONP `jsonpgz({...})` |
| **Sina ETF** (backup) | `https://hq.sinajs.cn/list=gb_{ticker}` | `https://finance.sina.com.cn/` | var + CSV |

**f10/lsjz is the gold standard** for fund NAV accuracy — it provides the official settled NAV updated in the evening. f10 should be the PRIMARY data source with fundgz as fallback for intraday estimates. QDII funds show T+1 FSRQ dates (one day behind domestic).

### Step 5a: Full Data Layer + Minimal UI (critical isolation step)
**BEFORE building the full app UI**, verify the complete data pipeline works with the simplest possible rendering:
```kotlin
// Same ViewModel as the full app (Room + OkHttp + FundRepository + all portfolios)
// But UI is just Text/Column+Scroll — NO Scaffold, NO TabBar, NO nested LazyColumn
Column(Modifier.verticalScroll(rememberScrollState())) {
    Text(status)  // shows step-by-step: ① Room init → ② Repository → ③ Load → ④ Refresh → ⑤ Done
    portfolios.forEach { pf -> Text("${pf.emoji} ${pf.name}: ${pf.totalAmount}") }
}
```
Use numbered status updates (`①②③④⑤`) so the user can report the exact step where it hangs.
**What it tests**: The full data pipeline (Room + OkHttp + all network calls + data processing) with no complex Compose rendering.
**If this WORKS but the full app still black-screens**: The issue is in the complex Compose UI tree (Scaffold + TopBar + horizontalScroll + BottomBar + nested LazyColumn). Iterate on the UI by re-adding components one at a time.
**If this FAILS**: The issue is in the data layer — check Room schema, KSP generation, OkHttp timeouts, etc.

### Step 5: Full App (Scaffold + All Screens)
Only build this after Step 5a passes. The full app combines all verified components: Scaffold with TopBar (horizontalScroll tabs) + BottomBar + OverviewScreen (LazyColumn) + PortfolioScreen (LazyColumn + FundRow).

### Step 5c: WebView Fallback (if ALL Compose multi-child layouts fail)
If both Scaffold (Step 5) and Box overlay fail, Compose multi-child rendering is fundamentally incompatible with the device. Build a **WebView-based APK** instead: single `AndroidView` wrapping WebView, all UI in `assets/index.html`, OkHttp interceptor for Referer injection. See ULTIMATE FALLBACK section for the full `MainActivity.kt` template. This pattern has proven reliable on problematic Chinese OEM devices.

## Common Pitfalls Found via This Method

| Symptom | Likely Cause |
|---------|-------------|
| Step 1 crashes | Wrong Compose BOM / AGP version mismatch |
| Step 2 crashes | `collectAsStateWithLifecycle` needs `lifecycle-runtime-compose` ≥ 2.7.0 |
| Step 3 shows "init" but never completes | Room DB created on UI thread → ANR. Always `viewModelScope.launch` |
| Step 3 crashes on `AndroidViewModel` | Constructor stripped by R8 — add `-keepclassmembers` rule |
| Step 4 works in debug, crashes in release | R8 removed OkHttp ServiceLoader files — add OkHttp ProGuard rules |
| Step 4 sub-③ fails on some fund codes | Used money market fund code (e.g. `000509`) — Tiantian API returns 404 for these. Use `000001` instead. |
| App switches away immediately, no crash dialog | `enableEdgeToEdge()` may crash on some devices (especially Chinese OEM ROMs). Remove it; use Scaffold `padding` for insets. |
| Release build hangs or daemon OOM | Gradle daemon leaks memory across R8 builds. Run `pkill -f GradleDaemon` before release build, or use `--no-daemon`.
| Step 5a works, 5b (with top+content+bottom layout) black-screens | This is the `weight(1f)` pitfall (see below). Switch to Box overlay. |
| **Step 5a + 5b BOTH black-screen (even Box overlay)** | Compose multi-child rendering incompatible with device GPU driver or Android framework. **Abandon Compose UI — switch to WebView + HTML** (see ULTIMATE FALLBACK below). |
| Money market fund (000509) returns 404 from fundgz | Tiantian fundgz API doesn't provide JSONP for money market funds. This is correct behavior — the real app skips them via `MONETARY_FUNDS` check. Always use `000001` (华夏成长混合) for testing fundgz. |

### Critical Pitfall: Column weight(1f) + StateFlow = Silent Crash

When using a three-part layout (top bar + scrollable content + bottom bar) inside a `Column` with `weight(1f)` on the content, AND the content observes ViewModel `StateFlow` that changes during initial composition, the Compose measurement pass can crash silently — producing "black screen + app switched away" with NO crash dialog.

```kotlin
// ❌ BROKEN — weight(1f) + state change = measurement conflict
Column(Modifier.fillMaxSize()) {
    Box { /* top bar */ }
    Column(Modifier.weight(1f).verticalScroll(...)) {
        // state change from ViewModel during this measurement pass
        val items by vm.items.collectAsStateWithLifecycle()
        items.forEach { Text(it) }
    }
    Box { /* bottom bar */ }
}

// ✅ TRY FIRST — Box overlay avoids weight entirely
Box(Modifier.fillMaxSize()) {
    Column(Modifier.fillMaxSize()
        .padding(top = 48.dp, bottom = 48.dp)
        .verticalScroll(rememberScrollState())) {
        val items by vm.items.collectAsStateWithLifecycle()
        items.forEach { Text(it) }
    }
    Box(Modifier.align(Alignment.TopCenter)) { /* top bar */ }
    Box(Modifier.align(Alignment.BottomCenter)) { /* bottom bar */ }
}
```

**Root cause**: `weight(1f)` triggers a two-pass measurement in Column. If ViewModel StateFlow changes value during the measurement pass (e.g., `isLoading` goes from `true` to `false`), the recomposition and remeasurement collide, causing the Compose runtime to silently abandon the composition tree.

**Fix**: Always use `Box` overlay for three-part layouts where content observes mutable state. Pre-set top/bottom bar heights as fixed `dp` values in content `padding`.

### ⚠️ ULTIMATE FALLBACK: When Box Overlay Also Fails → WebView + HTML

On **some Chinese OEM devices** (especially those with customized Android frameworks), ALL Compose multi-child layouts can silently crash — even the Box overlay approach fails. The root cause appears to be a Compose runtime incompatibility with the device's OpenGL/Vulkan driver or Android Framework customization that manifests when ANY multi-child layout observes mutable state.

**If Step 5 works (pure Compose text) but Step 5a (full data + simple scrolling text) works AND Step 5b (data + ANY multi-child layout: Scaffold/Box/Column) black-screens — abandon Compose rendering and switch to WebView:**

```kotlin
// ✅ RELIABLE FALLBACK — WebView with OkHttp interceptor for Referer injection
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            // Minimal Compose — just one AndroidView wrapping WebView
            MaterialTheme(colorScheme = darkColorScheme(background = Color(0xFF0D1117))) {
                Surface(Modifier.fillMaxSize(), color = Color(0xFF0D1117)) {
                    AndroidView(
                        factory = { ctx ->
                            WebView(ctx).apply {
                                settings.javaScriptEnabled = true
                                settings.domStorageEnabled = true
                                settings.allowFileAccess = true
                                setBackgroundColor(0xFF0D1117.toInt())

                                // OkHttp interceptor: injects Referer header for APIs that require it
                                // (f10/lsjz, eastmoney push2, sinajs) — browsers forbid fetch() from setting Referer
                                val okClient = OkHttpClient.Builder()
                                    .connectTimeout(10, TimeUnit.SECONDS)
                                    .readTimeout(10, TimeUnit.SECONDS).build()

                                webViewClient = object : WebViewClient() {
                                    override fun shouldInterceptRequest(view: WebView?, req: WebResourceRequest): WebResourceResponse? {
                                        val refererMap = mapOf(
                                            "fundgz.1234567.com.cn" to "https://fund.eastmoney.com/",
                                            "push2.eastmoney.com" to "https://quote.eastmoney.com/",
                                            "api.fund.eastmoney.com" to "https://fundf10.eastmoney.com/",
                                            "hq.sinajs.cn" to "https://finance.sina.com.cn/"
                                        )
                                        val referer = refererMap[req.url.host] ?: return null
                                        return try {
                                            val okReq = Request.Builder().url(req.url.toString())
                                                .addHeader("Referer", referer)
                                                .addHeader("User-Agent", "Mozilla/5.0").build()
                                            val resp = okClient.newCall(okReq).execute()
                                            val mime = resp.header("Content-Type", "text/plain") ?: "text/plain"
                                            WebResourceResponse(mime.split(";")[0].trim(), "UTF-8", resp.body?.byteStream()
                                                ?: ByteArrayInputStream(ByteArray(0)))
                                        } catch (_: Exception) { null }
                                    }
                                }
                                loadUrl("file:///android_asset/index.html")
                            }
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                }
            }
        }
    }
}
```

**Why this works**: Compose renders exactly ONE node (the `AndroidView`), avoiding the multi-child measurement conflict entirely. All UI logic lives in `assets/index.html` (plain HTML/CSS/JS). The OkHttp interceptor handles Referer injection for APIs that would otherwise be blocked by browser CORS policies.

**Trade-off**: Lose native Compose UI polish, but gain 100% reliability. The HTML/CSS can still achieve a polished mobile UI with proper styling.

## Kotlin Gotchas Encountered

- `init { if (x) return }` — **not allowed** in Kotlin `init` blocks. Use `if/else` instead.
- `try { SomeComposable() } catch` — **not allowed** in Compose. Wrap at `setContent` level instead.
- `darkColorScheme(partial colors)` — valid; missing slots get defaults from Material3.

## Delivery

Build all steps, rename each APK (`step1.apk`, `step2.apk`, ...), zip with password `123456` for WeChat delivery. Send with test plan text file.

## Related Skills

- `fund-monitor-native-compose`: Full FundMonitor native Compose app
- `chinese-fund-portfolio-monitor`: Fund data sources and mappings
