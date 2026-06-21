---
name: android-icon-pillow
description: Generate Android launcher icons (adaptive + all densities) using Pillow/Python. Dual-tone backgrounds, chart elements, text — full programmatic control.
tags: [android, icon, pillow, launcher, adaptive-icon, png, vector]
---

# Android Icon Generation with Pillow

Generate Android launcher icons programmatically using Python Pillow. Covers all density buckets (mdpi→xxxhdpi), adaptive icons (API 26+), and round variants.

## When to Use

- Custom icon for Android APK without manual design tools
- Need programmatic control over colors, layout, text
- Warm/dual-tone themes that match app interior palette

## File Structure

```
res/
├── mipmap-anydpi-v26/ic_launcher.xml          ← adaptive icon XML
├── drawable/ic_launcher_background.xml          ← adaptive bg (vector)
├── drawable/ic_launcher_foreground.xml          ← adaptive fg (vector)
├── drawable-nodpi/ic_launcher_fg.png            ← adaptive fg bitmap fallback
├── mipmap-mdpi/ic_launcher.png + _round.png     ← 48x48
├── mipmap-hdpi/ic_launcher.png + _round.png     ← 72x72
├── mipmap-xhdpi/ic_launcher.png + _round.png    ← 96x96
├── mipmap-xxhdpi/ic_launcher.png + _round.png   ← 144x144
└── mipmap-xxxhdpi/ic_launcher.png + _round.png  ← 192x192
```

## Safe Zone

Android launchers crop ~11% from each edge. **All elements must stay within 78% of icon size**, centered.

```python
margin = int(size * 0.11)       # 11% margin per side
inner_size = size - 2 * margin   # 78% usable area
inner_left = margin
inner_top = margin
```

## Adaptive Icon (API 26+)

Three files needed:

1. **`mipmap-anydpi-v26/ic_launcher.xml`** — references bg + fg drawables:
```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground>
        <bitmap android:src="@drawable/ic_launcher_fg" android:gravity="center"/>
    </foreground>
</adaptive-icon>
```

2. **`drawable/ic_launcher_background.xml`** — simple vector (dual-tone):
```xml
<vector android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#B89960" android:pathData="M0,0 L108,0 L108,48 L0,48 Z"/>
    <path android:fillColor="#1c1814" android:pathData="M0,48 L108,48 L108,108 L0,108 Z"/>
</vector>
```

3. **`drawable/ic_launcher_foreground.xml`** — vector with chart/shapes (no text — vectors can't do text easily)

4. **`drawable-nodpi/ic_launcher_fg.png`** — same PNG as xxxhdpi foreground, used as bitmap in adaptive icon

## Generation Script Template

```python
from PIL import Image, ImageDraw, ImageFont
import os

OUT = 'app/src/main/res'
SIZES = {'mipmap-mdpi': 48, 'mipmap-hdpi': 72, 'mipmap-xhdpi': 96,
         'mipmap-xxhdpi': 144, 'mipmap-xxxhdpi': 192}
ADAPTIVE = 432  # xxxhdpi foreground

def draw_icon(size, path):
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    margin = int(size * 0.11)
    # ... draw within margin to size-margin ...
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'PNG')

for density, sz in SIZES.items():
    draw_icon(sz, f'{OUT}/{density}/ic_launcher.png')
    draw_icon(sz, f'{OUT}/{density}/ic_launcher_round.png')

draw_icon(ADAPTIVE, f'{OUT}/mipmap-xxxhdpi/ic_launcher_foreground.png')
```

## Font Selection

Check available fonts on the build machine:
```bash
ls /usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc  # Chinese capable
ls /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf   # Latin only
```

Use `try/except` with fallback to `ImageFont.load_default()`.

## Pitfalls

1. **Elements near edges get cropped** — stay within 78% (11% margin each side)
2. **Text in vector drawables is impractical** — use PNG bitmap for foreground with text
3. **Round icons** use same design as square (Android auto-masks)
4. **Colors must have contrast** — test with `img.getpixel((w//2, h//8))` etc.
5. **Font size scales with icon**: `font_size = int(inner_size * 0.14)` for readable text
6. **When the generated PNG already includes the background**, skip adaptive icons entirely: delete `mipmap-anydpi-v26/ic_launcher.xml` and just place `ic_launcher.png` in mipmap density folders. Android gracefully falls back to these traditional PNGs — simpler than managing separate foreground/background layers and no need for `drawable-nodpi/ic_launcher_fg.png`. This is the preferred approach for fully programmatic icons where the background is baked into the PNG.
