---
name: android-adaptive-icon-safe-zone
description: Generate Android adaptive icons with proper 66dp safe zone. Content outside the safe zone gets clipped by the launcher's circular/squircle mask.
version: 1.0.0
tags: [android, icon, adaptive-icon, safe-zone, vector-drawable, png]
---

# Android 自适应图标安全区

Android 自适应图标（adaptive-icon）由一个 **108dp × 108dp** 画布组成，但启动器会对图标应用圆形或圆角方形蒙版。蒙版只显示内层 **66dp × 66dp** 的区域（留 18dp 边距）。

## 核心规则

| 参数 | 值 | 说明 |
|---|---|---|
| 总画布 | 108dp | foreground + background layers |
| 安全区 | 66dp | 保证在任何蒙版下都可见 |
| 边距 | 18dp × 4 | 上下左右各 18dp 可能被裁切 |
| 前景图 | 432×432px | 108dp × 4 (xxxhdpi) |

**安全区坐标（432px 画布）**：`y: 84–348, x: 84–348`

```
┌────────────────────────────432────────────────────────────┐
│  18dp(72px)                                                 │
│  ┌───────────────────────66dp(264)───────────────────────┐  │
│  │                                                        │  │
│  │              安  全  区  (safe zone)                     │  │
│  │              所有内容必须在此范围内                        │  │
│  │                                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 常见错误

### ❌ 内容超出安全区

```python
# 错误：文字、图表、¥ 符号在安全区外
draw.text((0, 0), "FUND MONITOR", ...)         # 顶部会被裁
draw.text((SIZE-42, SIZE-42), "¥", ...)         # 底部会被裁
draw.line([(0, y), (SIZE, y)], fill=GOLD, ...)  # 左右会被裁
```

### ✅ 内容严格在安全区内

```python
SAFE_TOP = 84      # 18dp
SAFE_BOT = 348     # 108dp - 18dp
SAFE_LEFT = 84
SAFE_RIGHT = 348

# 文字居中在安全区上方
y_text = SAFE_TOP + 8  # 92
draw.text(((SIZE-tw)/2, y_text), "FUND", ...)

# 图表在安全区中下部
chart_bottom = SAFE_BOT - 18  # 330
chart_height = 90             # 240–330

# ¥ 符号在安全区右下角
draw.text((SAFE_RIGHT - 20, SAFE_BOT - 20), "¥", ...)
```

## 生成流程（Pillow）

```python
from PIL import Image, ImageDraw, ImageFont

SIZE = 432  # 108dp × 4
SAFE_TOP, SAFE_BOT = 84, 348

img = Image.new('RGBA', (SIZE, SIZE), (0,0,0,0))
draw = ImageDraw.Draw(img)

# 填满背景（Android 会自动蒙版裁剪）
draw.rounded_rectangle([0,0,SIZE,SIZE], radius=0, fill=BG_COLOR)

# 所有绘制操作坐标限制在 [SAFE_TOP..SAFE_BOT, SAFE_TOP..SAFE_BOT]

# 保存到 nodpi（自适应图标前景）
img.save('drawable-nodpi/ic_launcher_fg.png', 'PNG')
```

## 项目文件结构

```
app/src/main/res/
├── drawable/
│   ├── ic_launcher_background.xml    # 纯色背景（vector 或 color）
│   └── ic_launcher_foreground.xml    # 可选：vector 版前景
├── drawable-nodpi/
│   └── ic_launcher_fg.png           # PNG 版前景（432×432）
├── mipmap-anydpi-v26/
│   └── ic_launcher.xml              # 引用 background + foreground
└── xml/
    └── file_paths.xml               # FileProvider 路径配置
```

**mipmap-anydpi-v26/ic_launcher.xml**:
```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground>
        <bitmap android:src="@drawable/ic_launcher_fg" android:gravity="center"/>
    </foreground>
</adaptive-icon>
```

## 测试方法

生成后在不同设备/启动器上验证：
- Pixel Launcher（圆形蒙版）
- Samsung One UI（圆角方形蒙版）
- 自定义启动器

图标四角和边缘的元素不应出现在最终显示中。

## 适用场景

- 为 Android WebView / Compose 应用生成自适应图标
- 图标包含精细图形（K线图、文字等）必须保证在安全区内
- 从设计稿转代码时校验安全区
- PNG 或 vector drawable 前景均适用
