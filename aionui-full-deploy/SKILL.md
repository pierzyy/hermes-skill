---
name: aionui-full-deploy
description: AionUi 全链路部署——从 NAS 安装、FRP 内网穿透（云服务器+NAT）、到 Electron 桌面端 + Android 客户端构建。覆盖百度云 BCC/任意 VPS 的完整流程。
category: devops
---

# AionUi 全链路部署

从零搭建完整的 AionUi 公网访问体系：NAS 服务端 → FRP 穿透 → 桌面/手机客户端。

## 架构图

```
手机/PC 客户端 ──→ 公网 106.12.90.23:25808 ──→ 云服务器 frps ──→ NAS frpc ──→ AionUi:25808
```

## 第一步：NAS 安装 AionUi

参见 `aionui-nas-deploy` 技能。核心步骤：

```bash
# 下载预编译二进制（GitHub 国内镜像）
curl -L --max-time 600 -o /tmp/aionui-web.tar.gz \
  "https://gh.ddlc.top/https://github.com/iOfficeAI/AionUi/releases/download/v2.1.2/aionui-web-2.1.2-linux-x86_64.tar.gz"
tar xzf /tmp/aionui-web.tar.gz -C /tmp/
cp -r /tmp/aionui-web /opt/data/aionui-web-standalone

# 启动（PATH 含 Hermes）
export PATH="/opt/hermes/.venv/bin:$PATH"
/opt/data/aionui-web-standalone/aionui-web start --remote --port 25808
```

验证：`curl http://127.0.0.1:25808/` 返回 200。

### ⚠️ 安装踩坑

| 坑 | 现象 | 解决 |
|----|------|------|
| 只复制二进制，没复制目录 | `static dir not found` | **必须 `cp -r` 整个目录**（含 `static/` 和 `bundled-aioncore/`） |
| 忘了 `--remote` | 只能 127.0.0.1 访问 | 加 `--remote` 绑定 0.0.0.0 |
| 没把 Hermes 加入 PATH | AionUi 检测不到 Hermes Agent | 启动前 `export PATH="/opt/hermes/.venv/bin:$PATH"` |
| GitHub 直连下载 | 超时 / 5KB/s | 用镜像 `gh.ddlc.top`（~470KB/s） |
| `pgrep -f aionui-web` 保活 | 永远误报存活，挂了不重启 | 用 `ss -tlnp | grep -q 25808` 端口检测 |
| 从源码构建 | pnpm/bun 耗时长，最后仍需 aioncore 二进制 | 直接用预编译 tarball |
| 容器环境 `tailscale up` 阻塞 | Hermes 300s 超时 | 用 `background=true`，用户慢慢认证 |
| userspace-networking | 本机 Tailscale IP 无法回环访问自身服务 | 用 `tailscale serve` 或 FRP 替代 |

保活用端口检测：
```bash
# cron 每分钟：
ss -tlnp | grep -q 25808 || (
  export PATH="/opt/hermes/.venv/bin:$PATH"
  nohup /opt/data/aionui-web-standalone/aionui-web start --remote --port 25808 &
)
```

## 第二步：FRP 云服务器（服务端）

### 2.1 云服务器选型

- 百度云 BCC：2核2G / 40G / 1M 带宽，最便宜配置即可
- 操作系统：Debian 12（稳定版，非 13 testing）
- 安全组入站规则：`7000` TCP（FRP）+ `25808` TCP（AionUi 代理），源 IP `0.0.0.0/0`

### 2.2 安装 frps

```bash
# SSH 登录云服务器后
cd /opt
curl -L -o frp.tar.gz https://gh.ddlc.top/https://github.com/fatedier/frp/releases/download/v0.69.0/frp_0.69.0_linux_amd64.tar.gz
tar xzf frp.tar.gz
mv frp_0.69.0_linux_amd64/frps /usr/local/bin/
chmod +x /usr/local/bin/frps

# 写入配置 /etc/frps.toml
bindPort = 7000
auth.token = "your_token_here"
EOF
```

### 2.3 systemd 保活

写入 `/etc/systemd/system/frps.service`：
```
[Unit]
Description=FRP Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/frps -c /etc/frps.toml
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now frps
```

### 2.4 防火墙

安全组放行后通常不需要额外操作。验证：
```bash
ss -tlnp | grep 7000
```

## 第三步：NAS FRP 客户端

### 3.1 安装 frpc

```bash
cd /opt/data
curl -L -o frp.tar.gz https://gh.ddlc.top/https://github.com/fatedier/frp/releases/download/v0.69.0/frp_0.69.0_linux_amd64.tar.gz
tar xzf frp.tar.gz
mv frp_0.69.0_linux_amd64/frpc /opt/data/frp/
chmod +x /opt/data/frp/frpc
```

### 3.2 配置 /opt/data/frp/frpc.toml

```toml
serverAddr = "你的云服务器公网IP"
serverPort = 7000
auth.token = "your_token_here"

[[proxies]]
name = "aionui"
type = "tcp"
localIP = "127.0.0.1"
localPort = 25808
remotePort = 25808
```

### 3.3 启动 + cron 保活

```bash
/opt/data/frp/frpc -c /opt/data/frp/frpc.toml > /tmp/frpc.log 2>&1 &
```

cron 每5分钟：`ps aux | grep 'frpc -c' | grep -v grep` 检测进程，挂了就重启。

### 3.4 验证

```bash
# 7000 控制端口
timeout 3 bash -c 'echo > /dev/tcp/公网IP/7000' && echo "✅"
# 25808 代理端口
timeout 3 bash -c 'echo > /dev/tcp/公网IP/25808' && echo "✅"
# HTTP
curl -s -o /dev/null -w '%{http_code}' http://公网IP:25808/
# 预期：200
```

## 第四步：Windows 桌面端

### 4.1 项目位置

`/opt/data/aionui-electron/`

### 4.2 修改地址

编辑 `main.js` 第 8 行：

```js
const REMOTE_TARGET = 'http://你的公网IP:25808';
```

### 4.3 构建

```bash
cd /opt/data/aionui-electron
npx electron-builder --win portable --config
# 输出: dist/AionUi-1.1.1.exe (~76MB)
```

无签名证书时自动跳过，不影响使用。

## 第五步：Android 客户端

### ⚠️ 关键教训

| ❌ 错误做法 | ✅ 正确做法 |
|------------|-----------|
| 用 `AppCompatActivity` 但没设 theme | 用 `Activity`（不需要 theme） |
| 用 Compose 多组件 | 纯 Activity + WebView |
| 从 FundMonitor 复制（含 Compose/Room/16MB） | 最小化依赖（1.5MB） |
| `android:theme="@style/..."` | 不设 theme |
| 遗留 drawable/themes/xml | 只保留 mipmap 图标 + strings.xml |

### 5.2 最小项目结构

```
app/src/main/
├── java/com/aionui/MainActivity.kt
├── res/
│   ├── values/strings.xml
│   ├── mipmap-mdpi/ic_launcher.png
│   ├── mipmap-hdpi/ic_launcher.png
│   ├── mipmap-xhdpi/ic_launcher.png
│   ├── mipmap-xxhdpi/ic_launcher.png
│   └── mipmap-xxxhdpi/ic_launcher.png
└── AndroidManifest.xml
```

### 5.3 MainActivity.kt

```kotlin
package com.aionui

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
            loadUrl("http://你的公网IP:25808")
        }
        setContentView(webView)
    }
}
```

**必须用 `android.app.Activity`**，不是 `AppCompatActivity`。

### 5.4 app/build.gradle.kts

仅依赖 `core-ktx`，不用 Compose/Room/appcompat/KSP：

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.aionui"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.aionui"
        minSdk = 26; targetSdk = 34
        versionCode = 1; versionName = "1.0.0"
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

### 5.5 project/build.gradle.kts

```kotlin
plugins {
    id("com.android.application") version "8.2.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
}
```

### 5.6 构建

```bash
cd /opt/data/AionUiNative
ANDROID_HOME=/opt/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
  ./gradlew assembleDebug --no-daemon -Dorg.gradle.jvmargs=-Xmx1536m

cp app/build/outputs/apk/debug/app-debug.apk /opt/data/AionUi.apk
# 产物应 ~1.5MB，>10MB 说明有 Compose/Room 残留
```

### 5.7 构建后验证

```bash
/opt/android-sdk/build-tools/35.0.0/aapt dump badging /opt/data/AionUi.apk | grep -E "package:|launchable"
# 预期：package: name='com.aionui' / launchable-activity: com.aionui.MainActivity
```

### 5.8 白屏/崩溃排查

1. APK >10MB → 有 Compose/Room 残留 → 清理 rebuild
2. 包名不是 `com.aionui` → 冲突安装失败
3. 用了 `AppCompatActivity` 但没 theme → 启动即崩溃
4. 手机 WebView 过旧 → 应用商店更新 "Android System WebView"

## 部署检查清单

- [ ] AionUi NAS 端运行（`ss -tlnp | grep 25808`）
- [ ] 云服务器 frps systemd 运行
- [ ] 云服务器安全组 7000+25808 TCP 放行
- [ ] NAS frpc 运行 + cron 保活
- [ ] `curl http://公网IP:25808/` → 200
- [ ] 桌面端 Electron IP 正确
- [ ] Android APK <2MB + 包名 com.aionui
- [ ] 手机浏览器先验 `http://公网IP:25808` 可访问
