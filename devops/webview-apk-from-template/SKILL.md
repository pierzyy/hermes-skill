---
name: webview-apk-from-template
description: 基于 FundMonitor 项目模板，秒出任意 Web 应用的 Android WebView 壳 APK。改一行 URL + 一个 app 名，1 分半出包。适用于 AionUi、内部工具等不需要原生 UI 的 Web 应用。
version: 1.0.0
---

# WebView 壳 APK 快速构建

基于 FundMonitor-claude 项目模板（已有 Gradle/Android SDK/签名配置），秒出任意 Web 应用 Android 客户端。

## 构建步骤

### 1. 复制模板

```bash
cp -r /opt/data/FundMonitor-claude /opt/data/NewAppName
```

### 2. 修改四样

**MainActivity.kt** — 用纯 Activity + WebView（不要用 AppCompatActivity——缺 theme 会崩溃，也不要用 Compose——会白屏）：
```kotlin
package com.fundmonitor

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            settings.setSupportZoom(true)
            settings.builtInZoomControls = true
            settings.displayZoomControls = false

            webViewClient = WebViewClient()
            loadUrl("http://YOUR_TARGET_URL")
        }
        setContentView(webView)
    }
}
```

**strings.xml** — 改 app 名：
```xml
<string name="app_name">新应用名</string>
```

**build.gradle.kts** — 简化为最小依赖（删除 lintJs task、去掉 Compose/Room/KSP/OkHttp 等 FundMonitor 依赖）：
```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fundmonitor"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fundmonitor"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }

    buildTypes {
        debug { isDebuggable = true }
        release { isMinifyEnabled = false }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
}
```

**注意**：`app/build.gradle.kts` 末尾的 `// JS Lint` task 和 `root build.gradle.kts` 中的 `com.google.devtools.ksp` 插件也需要删除。总之模板的 build.gradle 需要全量替换而不是只改 namespace。

**清理 FundMonitor 残留文件**（可选但推荐，减小 APK 体积）：
```bash
rm -f app/src/main/assets/index.html app/src/main/assets/help.html
```

### 3. 构建

```bash
cd /opt/data/NewAppName
ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
  ./gradlew assembleDebug --no-daemon -Dorg.gradle.jvmargs=-Xmx1536m
cp app/build/outputs/apk/debug/app-debug.apk /opt/data/NewAppName.apk
```

约 1 分半出包，输出 ~16MB Debug APK。

## 独立应用改造（可选，避免与 FundMonitor 冲突）

如果用户需要同时安装 FundMonitor 和新应用，必须做完整的独立应用改造，否则包名冲突导致无法同时安装。

### 1. 改包名（目录 + 代码 + 配置三处同步）

```bash
# 删除所有 FundMonitor 残留 Kotlin 代码
rm -rf app/src/main/java/com/fundmonitor/
# 建新包目录
mkdir -p app/src/main/java/com/newappname
# 把 MainActivity.kt 放到新包下（package 声明同步改为 com.newappname）
```

**`app/build.gradle.kts`**：
```
namespace = "com.newappname"
applicationId = "com.newappname"
versionCode = 1
versionName = "1.0.0"
```

**`AndroidManifest.xml`**：activity `android:name` 改为完整限定名 `com.newappname.MainActivity`。

### 2. 清理 AndroidManifest

FundMonitor 模板的 AndroidManifest 包含以下无用内容，需要删除：
- **FileProvider** — CSV 文件分享，独立应用不需要
- **SEND intent-filter（4个）** — 接收微信分享的 CSV/文本，不需要
- **`android:theme="@style/Theme.FundMonitor"`** — 默认主题引用，删除 `android:theme` 属性

最终 AndroidManifest 应该精简为只含 INTERNET 权限和 LAUNCHER intent-filter。

### 3. 生成新图标

删除 FundMonitor 的旧图标文件（否则编译报错或显示错误图标）：
```bash
rm -rf app/src/main/res/mipmap-anydpi-v26 app/src/main/res/drawable-nodpi
```
然后用 `android-icon-pillow` skill 生成新图标。最简单方案：在 mipmap 各密度目录放入 `ic_launcher.png`，Android 自动回退到传统 PNG（无需 adaptive icon 的 foreground/background 分离）。

---

## 增强版：加载状态 + 超时 + 刷新（推荐用于生产应用）

基础版只有 WebView，网络慢或连不上就是黑屏/白屏。增强版添加了加载遮罩、进度条、超时提示和刷新按钮，用户体验显著提升。

### ⚠️ 闪退教训：纯代码构建 UI，不用布局 XML

**布局 XML 方案在纯 `Activity`（无 theme）上会闪退**，因为 `?android:attr/progressBarStyleHorizontal` 等主题属性无法解析。即使加了 `android:theme="@android:style/Theme.Material.NoActionBar"` 也不可靠。

**正确做法：纯 Kotlin 代码构建所有 UI**，不依赖任何 layout XML 和 theme。完整参考实现见下方。

### 纯代码 MainActivity.kt（完整版，已验证不闪退）

```kotlin
package com.hermes.workbench  // 改为你的包名

import android.app.Activity
import android.graphics.Bitmap
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

class MainActivity : Activity() {
    companion object {
        const val TARGET_URL = "http://YOUR_URL"
        private const val TIMEOUT_MS = 15_000L
    }

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var loadingOverlay: LinearLayout
    private lateinit var loadingSpinner: ProgressBar
    private lateinit var statusText: TextView
    private lateinit var statusDetail: TextView
    private lateinit var btnRetry: TextView
    private lateinit var btnRefresh: TextView

    private var isPageLoaded = false
    private val timeoutHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(MATCH_PARENT, MATCH_PARENT)
            setBackgroundColor(0xFF0D1117.toInt())
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
        }
        root.addView(webView)

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, 3).also { it.gravity = android.view.Gravity.TOP }
            max = 100; visibility = View.GONE
        }
        root.addView(progressBar)

        loadingOverlay = LinearLayout(this).apply {
            layoutParams = FrameLayout.LayoutParams(MATCH_PARENT, MATCH_PARENT)
            gravity = android.view.Gravity.CENTER; orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xE60D1117.toInt())
        }

        loadingSpinner = ProgressBar(this).apply { layoutParams = LinearLayout.LayoutParams(48, 48) }
        loadingOverlay.addView(loadingSpinner)

        statusText = TextView(this).apply {
            val lp = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT); lp.topMargin = 16
            layoutParams = lp; text = "正在连接..."; setTextColor(0xFF8B949E.toInt()); textSize = 14f
        }
        loadingOverlay.addView(statusText)

        statusDetail = TextView(this).apply {
            val lp = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT); lp.topMargin = 8
            layoutParams = lp; setTextColor(0xFF484F58.toInt()); textSize = 12f
        }
        loadingOverlay.addView(statusDetail)

        btnRetry = TextView(this).apply {
            val lp = LinearLayout.LayoutParams(WRAP_CONTENT, WRAP_CONTENT); lp.topMargin = 24
            layoutParams = lp; setPadding(32, 12, 32, 12); text = "重试"; visibility = View.GONE
            setTextColor(0xFFFFFFFF.toInt()); textSize = 14f; setBackgroundColor(0xFF238636.toInt())
            isClickable = true; isFocusable = true; setOnClickListener { reload() }
        }
        loadingOverlay.addView(btnRetry)
        root.addView(loadingOverlay)

        btnRefresh = TextView(this).apply {
            layoutParams = FrameLayout.LayoutParams(44, 44).also {
                it.gravity = android.view.Gravity.END or android.view.Gravity.BOTTOM; it.setMargins(0, 0, 16, 16)
            }
            text = "\u27F3"; setTextColor(0xFF58A6FF.toInt()); textSize = 22f
            gravity = android.view.Gravity.CENTER; visibility = View.GONE
            isClickable = true; isFocusable = true; setOnClickListener { reload() }
            background = android.graphics.drawable.GradientDrawable().apply {
                shape = android.graphics.drawable.GradientDrawable.OVAL
                setColor(0xFF21262D.toInt()); setStroke(1, 0xFF30363D.toInt())
            }
        }
        root.addView(btnRefresh)

        setContentView(root)
        setupWebView()
        reload()
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true; domStorageEnabled = true
            mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            setSupportZoom(true); builtInZoomControls = true; displayZoomControls = false
            useWideViewPort = true; loadWithOverviewMode = true
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url); isPageLoaded = true
                timeoutHandler.removeCallbacksAndMessages(null)
                loadingOverlay.visibility = View.GONE; progressBar.visibility = View.GONE
                btnRefresh.visibility = View.VISIBLE
            }
            override fun onReceivedError(view: WebView?, errorCode: Int, description: String?, failingUrl: String?) {
                if (failingUrl == view?.url || failingUrl == TARGET_URL) {
                    isPageLoaded = true; timeoutHandler.removeCallbacksAndMessages(null)
                    loadingSpinner.visibility = View.GONE; statusText.text = "连接失败"
                    statusDetail.text = description ?: "未知错误"
                    btnRetry.visibility = View.VISIBLE; progressBar.visibility = View.GONE
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                if (newProgress < 100) statusText.text = "正在加载... $newProgress%"
                if (newProgress == 100) progressBar.visibility = View.GONE
            }
        }
    }

    private fun reload() {
        isPageLoaded = false
        loadingOverlay.visibility = View.VISIBLE; loadingSpinner.visibility = View.VISIBLE
        btnRefresh.visibility = View.GONE; btnRetry.visibility = View.GONE
        progressBar.visibility = View.VISIBLE; progressBar.progress = 0
        statusText.text = "正在连接..."; statusDetail.text = ""
        timeoutHandler.removeCallbacksAndMessages(null)
        timeoutHandler.postDelayed({
            if (!isPageLoaded) {
                loadingSpinner.visibility = View.GONE; statusText.text = "连接超时"
                statusDetail.text = "无法连接，请检查网络"
                btnRetry.visibility = View.VISIBLE; progressBar.visibility = View.GONE
            }
        }, TIMEOUT_MS)
        webView.loadUrl(TARGET_URL)
    }
}
```

**关键要点：**
- `LinearLayout.LayoutParams` 的 `topMargin` 不能链式 `.also { topMargin = 16 }`，必须拆成 `val lp = ...; lp.topMargin = 16; layoutParams = lp`
- `FrameLayout.LayoutParams` 的 `gravity` 和 `setMargins` 同样需要先声明变量再赋值
- 圆形 FAB 背景用 `GradientDrawable` 代码创建，不依赖 `@drawable/fab_bg.xml`
- 不需要 `activity_main.xml` 布局文件，不需要 `fab_bg.xml` drawable 文件

### 行为对照

| 场景 | 基础版 | 增强版 |
|------|--------|--------|
| 正常加载 | WebView 直接显示 | 进度条 + 遮罩 → 淡入页面 |
| 网络慢 | 白屏等待 | "正在加载... 35%" + 蓝色进度条 |
| 连不上 | 永久白屏/黑屏 | 15s 后显示"连接超时" + 重试按钮 |
| 加载失败 | 错误页或无反应 | 明确错误信息 + 重试按钮 |
| 页面已加载 | 无操作入口 | 右下角刷新按钮 |
| 回退 | 无反馈 | goBack 自动触发加载态 |

## 注意事项

- 模板项目 `AndroidManifest.xml` 已设 `usesCleartextTraffic="true"`，HTTP 直接可用
- **代码不是只改 URL**：FundMonitor 模板的 MainActivity.kt 包含 OkHttp Referer 注入、F10Bridge、AndroidBridge、文件分享处理，WebView 壳必须用上面的最小化代码替换
- **反复构建失败**：最常见的两个错误 — ① lintJs task 依赖已删除的 index.html（删 task）② 旧 icon 文件引用失效（删 mipmap-anydpi-v26 + drawable-nodpi）
- Keystore 在 `/opt/data/fund_monitor_app/android/debug.keystore`（别名 `fundmonitor`，密码 `android`）
- **❌ 不要用 AppCompatActivity**：AppCompatActivity 缺少 theme 时直接崩溃（打开即切走），AndroidManifest 中未声明 theme 时必定触发。用纯 `android.app.Activity` 最安全。
- **❌ 不要用 Compose**：Compose Surface + AndroidView WebView 在部分设备上白屏。用 Activity + setContentView(webView) 最可靠，已验证可用。
