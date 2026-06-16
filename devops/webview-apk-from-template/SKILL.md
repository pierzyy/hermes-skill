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

### 布局文件 `res/layout/activity_main.xml`

**⚠️ 以下所有 widget 都不能用 tint 属性（`progressTint`/`indeterminateTint`/`backgroundTint`），也不能用 `Button` 或 `ImageButton`——这些都需要 AppCompat/Material theme，而本模板用纯 `Activity`（无 theme）以避免崩溃。**

```xml
<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#FF0D1117">

    <WebView android:id="@+id/webview"
        android:layout_width="match_parent"
        android:layout_height="match_parent" />

    <ProgressBar android:id="@+id/progress_bar"
        style="?android:attr/progressBarStyleHorizontal"
        android:layout_width="match_parent"
        android:layout_height="3dp"
        android:layout_gravity="top"
        android:max="100"
        android:visibility="gone" />

    <LinearLayout android:id="@+id/loading_overlay"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:gravity="center"
        android:orientation="vertical"
        android:background="#E60D1117">

        <ProgressBar android:id="@+id/loading_spinner"
            style="?android:attr/progressBarStyle"
            android:layout_width="48dp" android:layout_height="48dp" />

        <TextView android:id="@+id/status_text"
            android:layout_marginTop="16dp"
            android:text="正在连接..."
            android:textColor="#FF8B949E" android:textSize="14sp" />

        <TextView android:id="@+id/status_detail"
            android:layout_marginTop="8dp"
            android:textColor="#FF484F58" android:textSize="12sp" />

        <TextView android:id="@+id/btn_retry"
            android:layout_width="wrap_content" android:layout_height="wrap_content"
            android:layout_marginTop="24dp"
            android:paddingStart="32dp" android:paddingEnd="32dp" android:padding="12dp"
            android:text="重试" android:visibility="gone"
            android:textColor="#FFFFFFFF" android:textSize="14sp"
            android:background="#FF238636"
            android:clickable="true" android:focusable="true" />
    </LinearLayout>

    <TextView android:id="@+id/btn_refresh"
        android:layout_width="44dp" android:layout_height="44dp"
        android:layout_gravity="end|bottom" android:layout_margin="16dp"
        android:text="⟳" android:textColor="#FF58A6FF" android:textSize="22sp"
        android:gravity="center"
        android:background="@drawable/fab_bg"
        android:visibility="gone"
        android:clickable="true" android:focusable="true" />
</FrameLayout>
```

### FAB 背景 `res/drawable/fab_bg.xml`

```xml
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="oval">
    <solid android:color="#FF21262D" />
    <stroke android:width="1dp" android:color="#FF30363D" />
</shape>
```

### MainActivity.kt 关键逻辑

```kotlin
class MainActivity : Activity() {
    companion object {
        const val TARGET_URL = "http://YOUR_URL"
        private const val TIMEOUT_MS = 15_000L
    }

    private var isPageLoaded = false
    private val timeoutHandler = Handler(Looper.getMainLooper())

    // onCreate 中: setContentView(R.layout.activity_main) → bind views → setup WebView → reload()

    private fun reload() {
        isPageLoaded = false
        loadingOverlay.visibility = View.VISIBLE
        loadingSpinner.visibility = View.VISIBLE
        btnRefresh.visibility = View.GONE
        btnRetry.visibility = View.GONE
        progressBar.visibility = View.VISIBLE
        progressBar.progress = 0

        timeoutHandler.postDelayed({
            if (!isPageLoaded) {
                loadingSpinner.visibility = View.GONE
                statusText.text = "连接超时"
                statusDetail.text = "无法连接，请检查网络"
                btnRetry.visibility = View.VISIBLE
                progressBar.visibility = View.GONE
            }
        }, TIMEOUT_MS)

        webView.loadUrl(TARGET_URL)
    }

    // WebViewClient.onPageFinished → isPageLoaded=true, dismiss overlay, show btnRefresh
    // WebViewClient.onReceivedError → show error message, show btnRetry (only for main frame)
    // WebChromeClient.onProgressChanged → update progress bar + status text
}
```

**⚠️ 必须用 `android.app.Activity`**，不能用 `AppCompatActivity`——缺 theme 时打开即崩溃（切回桌面）。
**⚠️ 不用 `Button`/`ImageButton`**——换成 `TextView` + `clickable=true`，避免 `backgroundTint` 等需要 theme 的属性。
**⚠️ 不用 `tint` 属性**（`progressTint`/`indeterminateTint` 等）——同样需要 theme。

**完整参考实现**：`/opt/data/AionQuick/app/src/main/java/com/hermes/aionquick/MainActivity.kt`

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
