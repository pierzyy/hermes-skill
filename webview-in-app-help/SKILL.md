---
name: webview-in-app-help
description: Embed help/documentation in Android WebView apps. Use Array.join() to build HTML strings directly in JS — hidden divs and script templates proved unreliable across WebView versions.
version: 2.0.0
tags: [webview, help, documentation, modal, android, array-join]
---

# WebView 内嵌帮助文档

在 Android WebView 中展示帮助/文档弹窗时，**不要依赖 DOM 隐藏元素或 template 标签**。WebView 在不同 Android 版本/厂商实现中行为不一致。最可靠的方式：**用 `Array.join()` 在 JS 中直接构建 HTML 字符串**。

## 为什么其他方案不可靠

| 方式 | 实测结果 |
|---|---|
| `'...' + '...' +` 拼接 | 长字符串中换行/注释/转义符容易断裂 |
| 隐藏 `<div>` + `innerHTML` | 某 WebView 中 `display:none` 导致 `innerHTML` 返回空 |
| `<script type="text/template">` + `textContent` | 某 WebView 中 `textContent` 也返回空 |
| 模板字面量 `` `...` `` | API 26+ 支持但部分厂商定制 WebView 行为不定 |

## ✅ 正确做法：Array.join()

```javascript
function showHelp() {
  var h = [
    '<div style="max-height:60vh;overflow-y:auto;font-size:13px;line-height:1.8">',
    '<h3 style="color:#D4935C">标题</h3>',
    '<p>帮助内容 — 可以直接写 HTML，无需转义引号</p>',
    '<table>...任意复杂 HTML...</table>',
    '</div>'
  ].join('\n');
  showModal('帮助', h, function(){});
  document.getElementById('modalOkBtn').style.display = 'none';
}
```

## 关键细节

- **每行用单引号包裹**，用 `,` 分隔，最后 `.join('\n')` 拼接
- 内部 HTML 属性用**双引号**（`style="..."`），与 JS 单引号不冲突
- 不需要转义 `"` — 单引号字符串内部的双引号是合法的
- **不能**在数组元素间加 `//` 注释（会打断表达式）
- **不需要**外部 DOM 元素、template 标签、或任何 HTML 依赖 — 纯 JS
- 这个方案在**所有** Android WebView 版本上测试通过

## 语法校验兼容

如果语法校验器会提取 `<script>` 块编译，确保跳过非 JS 类型：

```javascript
var typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
if (typeMatch && !/javascript|module/i.test(typeMatch[1])) continue;
```

但如果帮助 HTML 直接放在 JS 内（不用 template 标签），则无需特殊处理。

## ✅ 更可靠的方案：独立 HTML 资产文件 + WebView 导航

当帮助文档内容较多（表格、列表等）且 modal 多次尝试均失败时，**最可靠的方案是创建独立的 HTML 资产文件，用 WebView 直接导航过去**：

```java
// AndroidBridge.kt — 添加 JS 接口
@JavascriptInterface
fun openHelp() {
    activity.runOnUiThread {
        webView.loadUrl("file:///android_asset/help.html")
    }
}
```

```javascript
// index.html — 前端调用
function showHelp() {
  AndroidBridge.openHelp();
}
```

```html
<!-- help.html — 独立 HTML 文件，放在 assets/ 目录 -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>/* 任意复杂 CSS */</style>
</head>
<body>
  <a href="javascript:history.back()">← 返回</a>
  <h1>帮助文档</h1>
  <!-- 任意复杂 HTML 内容 -->
</body>
</html>
```

**为什么比 modal 更可靠：**
- 完全独立 HTML 文件，不受主页面 JS 状态影响
- 无需拼接字符串、无需 array.join、无需 DOM 模板
- 浏览器级别的 HTML/CSS/JS 支持，无 WebView 兼容性问题
- `history.back()` 导航回主页面，用户无感

## ⚠️ 不要用外部浏览器

```kotlin
// ❌ 不可靠 — content:// URI 的 text/html 在外部浏览器中显示为纯代码
val intent = Intent(Intent.ACTION_VIEW).apply {
    setDataAndType(uri, "text/html")
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
}
activity.startActivity(intent)
```

Android 系统浏览器不一定能渲染 content:// URI 的 HTML 文件，常见表现为"纯代码"显示。

## 适用场景

- **简单帮助**（几段文字）：modal + Array.join() 即可
- **复杂帮助**（表格/列表/多章节）：独立 HTML 资产文件 + WebView 导航
- 帮助文档、使用指南、更新日志
- 任何需要在 modal 中展示的长 HTML 内容
- Android WebView API 26+ 全兼容
- 也适用于 PWA / 浏览器环境（同样可靠）
