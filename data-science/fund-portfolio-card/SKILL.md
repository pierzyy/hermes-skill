---
name: fund-portfolio-card
description: 生成基金组合的暗色主题卡片式报告图片（PNG），包含持仓卡片矩阵 + 研判与操作建议。支持 2x 高分辨率输出。使用 PIL + Noto Sans CJK 字体。
category: data-science
---

# 基金组合报告卡片图片生成

## 设计规格

### 尺寸
- 宽度 2240px（1120×2），高度自适应
- 144 DPI 输出，保证文字清晰
- 6 张基金卡片/行，间隙 12px（已×2）

### 配色（暖色暗色主题）
```
BG           #1c1814  深咖啡底色
CARD_BG      #262017  卡片焦糖色
CARD_BORDER  #3b3224  卡片边框
TEXT_IVORY   #ede4d3  主文字象牙白
TEXT_WARM    #b8a88c  辅助文字暖灰
TEXT_MUTED   #8a7d68  代码/次要文字
CAT_BG       #8B3A3A  大类标题暖红底
CAT_TEXT     #f5e6d0  大类文字
SUB_ACCENT   #B89960  子类金色强调线
SKY_BLUE     #5BA0D0  金额天蓝色
GREEN_COLOR  #8DA870  增持/正面
AMBER        #C8A050  持有/中性
RED_COLOR    #C06050  减持/警告
SECTION_BG   #221d17  研判区域底纹
```

### 字体
- Noto Sans CJK Regular/Bold（/usr/share/fonts/opentype/noto/）
- 标题 44px，大类 38px，子类 28px，卡片名称 20px，金额 24px

### 卡片布局
- 6 列，圆角 20px
- 上行：基金名称（截断+省略号）
- 下行左：金额（天蓝色，无¥无千分位）
- 下行右：代码（灰色小字）

### 大类标题
- 暖红底圆角条，文字居中
- 格式：`大类名  ¥总额  ％占比  X只`

### 子类标题
- 左侧金色竖线强调
- 上方细分隔线
- 格式：`子类名  金额  ％占比`

## 报告区域（底部）

位于所有持仓卡片之后，深色底纹圆角框包裹：

1. **宏观** — 2-3 行要点
2. **行业研判** — 三列表格：行业·子类 | 评级 | 研判
   - 绿色 🟢增持 / 金色 🟡持有 / 红色 🔴减持
3. **操作建议** — 每行：🟢🟡🔴 代码 名称 金额 理由
4. **风险提示** — 金色文字列出

## 脚本位置
`/opt/data/gen_daily_report.py`

## 依赖
- Python 3 + PIL/Pillow（需 --break-system-packages 安装）
- Noto Sans CJK 字体（系统自带）
- CSV 输入来自 FundMonitor 导出

## 常见问题
- 中文乱码 → 确保使用 NotoSansCJK 而非 DejaVu/WQY 字体
- 文字模糊 → 使用 2x 分辨率 + 144 DPI
- 金额格式化 → `f'{n:,.2f}'.replace(',', '')` 去掉千分位
- 名称过长 → `draw.textlength` 测量后截断加「…」
- PIL 无 `rounded_rectangle`（旧版）→ 升级至 Pillow 12+
- 半透明叠加 → 先画 overlay RGBA 图，再用 `alpha_composite` 合成

## 设计迭代教训
- 不要在半透明蒙层上放文字（v5 失败）
- 大类/子类标题和基金列表之间不要混入分析文字（v1 失败）
- 研判部分统一放底部独立区域，用三列表格而非内联注释
- 符号统一用 emoji（🟢🟡🔴）配合颜色，不要混用文字和符号
- 文字间距适度，不要太紧凑导致阅读困难
