---
name: fund-portfolio-report-png
description: 生成基金组合持仓分析长图（PNG）——6卡片/行网格布局、暖色暗色主题、大类-子类-基金三级层次，用 PIL 直接绘制
---

# 基金组合分析报告 PNG 生成

与 `fund-portfolio-analysis` skill 配合使用：先加载分析 skill 完成 CSV 分类聚合，后用 PIL 渲染为长图 PNG。

## 与 fund-portfolio-card 的区别

- `fund-portfolio-card`：单组合日常快照（当日涨跌），HTML → 浏览器截图
- `fund-portfolio-report-png`：全量持仓分析报告（9大类+细分+所有基金），PIL 直接绘制

## 运行环境

- **必须通过 `terminal` 运行**，`execute_code` sandbox 无 PIL
- 写 `.py` 文件到 `/opt/data/gen_report.py`，`python3 /opt/data/gen_report.py`
- Pillow 已在系统 Python 中：`/usr/bin/python3`

## 字体

Noto Sans CJK（系统自带，支持中文，线条细、几何感强）：

```python
FN = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
FB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
```

字号：标题 22、日期 14、大类 19、子类 14、卡片名称 10、卡片代码 9、卡片金额 12（粗体）。

## 配色（暖色暗色主题）

```python
BG          = '#1c1814'  # 深咖啡
CARD_BG     = '#262017'  # 卡片底色
CARD_BORDER = '#3b3224'  # 卡片边框
TEXT_IVORY  = '#ede4d3'  # 象牙白主文字
TEXT_WARM   = '#b8a88c'  # 暖灰次要文字
TEXT_MUTED  = '#8a7d68'  # 弱化文字（卡片代码）
CAT_BG      = '#8B3A3A'  # 大类标题底色（暖红）
CAT_TEXT    = '#f5e6d0'  # 大类标题文字（奶白）
CAT_INFO    = '#e8d0b0'  # 大类数值文字
SUB_ACCENT  = '#B89960'  # 子类左侧强调竖线（琥珀金）
SUB_LABEL   = '#e8dcc8'  # 子类名称
SUB_VALUE   = '#b8a88c'  # 子类数值
SEP         = '#2a231d'  # 子类标题下分隔线
SKY_BLUE    = '#5BA0D0'  # 卡片金额（天蓝）
```

## 布局参数

| 参数 | 值 |
|---|---|
| 画布宽度 | **1120px**（6张卡片刚好排满）|
| 左右边距 | 36px |
| 每行卡片 | 6张 |
| 卡片间距 | 12px |
| 卡片圆角 | 10px |
| 卡片高度 | 52px |

## 三级层次结构

### Level 1: 大类标题
- 暖红圆角背景条（#8B3A3A），高 36px，圆角 8
- 左对齐：`大类名   ¥总金额   占比%   只数`
- 文字奶白 #f5e6d0，数值浅黄 #e8d0b0

### Level 2: 子类标题（需要细分的6大类）
- 左侧 4px 金色竖线 #B89960
- 文字：`子类名   金额   占比%`
- 名称象牙白 #e8dcc8，数值暖灰 #b8a88c
- 下方 1px 分隔线 #2a231d
- 不细分的大类（货币/养老金/黄金商品）跳过此层

### Level 3: 基金卡片
- 圆角矩形（圆角 10），间距 12px，6张/行
- **上行**：基金名称（象牙白，10px，居中偏左）
- **下行**：金额（天蓝 #5BA0D0，12px 粗体，左对齐）
- **右下角**：基金代码（弱化灰 9px）

## 卡片绘制函数

```python
def card_grid(funds, y_start):
    y = y_start
    for i, (code, name, amt) in enumerate(funds):
        col = i % 6; row = i // 6
        cx = PX + col * (CARD_W + GAP)
        cy = y + row * (CARD_H + GAP)
        
        draw.rounded_rectangle([(cx,cy),(cx+CARD_W,cy+CARD_H)], radius=10, fill=CARD_BG, outline=CARD_BORDER)
        # 上行：名称
        draw.text((cx+10, cy+7), trunc(name, F_CARD, CARD_W-20, draw), fill=TEXT_IVORY, font=F_CARD)
        # 下行：金额
        draw.text((cx+10, cy+29), fmt(amt), fill=SKY_BLUE, font=F_AMT)
        # 右下角：代码
        code_w = draw.textlength(code, font=F_CARD_CODE)
        draw.text((cx+CARD_W-10-code_w, cy+CARD_H-15), code, fill=TEXT_MUTED, font=F_CARD_CODE)
    
    rows = (len(funds) + 5) // 6
    return y + rows * (CARD_H + GAP)
```

## 金额格式

```python
def fmt(n):
    return f'{n:,.2f}'.replace(',', '')  # 56823.16（无¥无千分位）
```

## 生成流程

1. **两遍扫描**：第一遍计算高度 H，第二遍渲染
2. 分类逻辑直接复用 `fund-portfolio-analysis` 的 `classify()`
3. 大类按固定顺序排列：A股权益 → 货币 → 港股 → 国内债券 → 美股 → 海外其他 → 养老金 → 海外债券 → 黄金/商品
4. 标题居中，日期 2026年5月22日

## 注意事项

1. 图片长（4000-5200px），微信查看正常
2. 名称过长用 `trunc()` 截断加 `…`，用 `draw.textlength()` 精确测量
3. 半透明蒙层方案（v5）视觉效果差，已弃用
4. 子类内卡片不满一行仍占一整行（不跨子类合并），空白留白属于设计意图
5. 分类规则与 `fund-portfolio-analysis` 保持同步——修改分类时两个 skill 需同时更新
