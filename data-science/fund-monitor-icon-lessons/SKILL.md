---
name: fund-monitor-icon-lessons
description: FundMonitor 自适应图标设计经验教训 — 尺寸、安全区、构建流程
version: 1.0.0
tags: [fund, monitor, icon, adaptive, android, pitfalls]
---

# FundMonitor 图标设计经验教训

## 最终参数（v3.8-0521m）

```
尺寸: 432×432 RGBA PNG
位置: drawable-nodpi/ic_launcher_fg.png
安全区: margin=115px（各边），内容仅用中心 202×202 区域（约占 47%）
文字: DejaVuSans-Bold 28px
背景: drawable/ic_launcher_background.xml，纯色 #0A0A0E
配色: 深黑底(#0A0A0E) + 银白文字(#DCDCE4) + 香槟金(#C8A96E)
```

## 关键教训

### 1. 安全区陷阱
❌ **理论 66dp 安全区（84px margin）不够！**
- Android 文档说 adaptive icon 安全区是 66dp（432×432 前景图中为 264×264）
- **实际测试**：圆形/圆角方形/水滴形启动器蒙版比理论值更激进
- 84px margin（264×264 内区）的内容仍会被裁切
- ✅ **115px margin（202×202 内区）才真正安全**

### 2. 用 PNG 不要用 Vector XML
- ❌ Vector XML 不支持文本（只能画 path）
- ✅ PNG via PIL 可以自由绘制文本+图形
- 放在 `drawable-nodpi/` 避免密度缩放

### 3. 构建系统
- ❌ 旧 aapt2 脚本（86KB APK，功能不全）
- ✅ Gradle 项目 `/opt/data/FundMonitor-claude-dev/`（16MB APK）

## 帮助文档

- ❌ Modal 弹窗（JS 拼接 HTML）→ 内容消失/只显示标题
- ❌ 外部浏览器（content:// URI + text/html）→ 显示纯代码
- ✅ WebView.loadUrl("file:///android_asset/help.html") → 唯一可靠方案
- help.html 放 assets/，顶部加「← 返回」按钮（history.back()）

## 工作流程

```
📁 dev worktree 改代码
→ ✅ JS 语法校验（node --check）
→ 📝 git commit
→ 🔀 git merge dev → master
→ 🔨 master ./gradlew assembleDebug
→ 📤 cp + MEDIA 发送
```
