---
name: fund-report-image
description: 生成基金投顾日报的图片版本（PNG长图），替代纯文字报告。通过 JSON 数据 → HTML 渲染器 → 浏览器全页截图 输出 Dark Blue 暗色主题的完整长图。支持持仓全景、36子行业分组进度条、8组合操作建议卡片、金额打码。
version: 2.0.0
author: Hermes
license: MIT
dependencies: []
metadata:
  hermes:
    tags: [fund, report, image, PNG, HTML, screenshot]
    related_skills: [daily-fund-report, fund-portfolio-analysis, fund-sector-outlook]
---

# 基金投顾日报 — 图片版生成器 v2.0

## 触发时机
- 用户要求"出图"、"图片版报告"、"不要文字版"
- cron 14:00 日报任务改用图片输出时
- 需要打码版发给别人看时

## 架构

```
JSON 数据
  ↓
/opt/data/scripts/render_fund_report.py  ← HTML 渲染器
  ↓
/tmp/fund_report_*.html                   ← 自包含 HTML (Dark Blue)
  ↓
browser_navigate(file://...) + browser_vision()  ← 浏览器全页截图
  ↓
PNG 长图 → MEDIA: 发送
```

## 关键教训 & 踩过的坑

### 1. 渲染方式选择
- ❌ **PIL 直接绘制**：中文字体在 NAS 环境找不到 → 乱码。试过指定路径仍不可靠。
- ✅ **浏览器截图**：中文完美渲染，CSS Grid/Flexbox 排版效果好
- `browser_vision()` 截图是 **全页高度**（= `document.body.scrollHeight`），不需要多次截屏拼接。已验证：页面 2868px 高，一次截图完整捕获。

### 2. mv-* 作图技能的限制
从 `markdown-viewer/skills` 导入的 15 个技能（mv-vega, mv-infocard, mv-mindmap 等）输出的是 **Markdown 代码块**，需要 Markdown Viewer 浏览器插件渲染。**它们本身不生成 PNG**，不能直接用于"出图"。
→ 日报的 CSS/设计参考了 mv-infocard 的暗色主题风格 + mv-architecture 的分层布局思路，但用的是**独立 HTML + 浏览器直接截图**，不依赖任何外部渲染器。

### 3. HTML 渲染器 `/opt/data/scripts/render_fund_report.py`
- Python 函数式：`render(data: dict) → HTML string`
- 输入 JSON 路径，输出自包含 HTML
- 金额字段处理：用 `fmt_amount()` 统一处理 `int`（格式化为 ¥1,234）和 `str`（打码直接输出）
- 总资产也走 `fmt_amount()`，避免直接 f-string 格式化导致打码版崩溃

### 4. Dark Blue 配色方案（用户选定的风格）
```
背景:        #0d1117    卡片:   #161b22    边框:     #30363d
文字:        #e6edf3    次要:   #8b949e    强调色:   #58a6ff
涨/增持/买入: #7ee787    跌/减持/卖出: #f85149  中性/持有: #d2991d
A股权益:      #f0883e    债券:   #bc8cff    黄金:     #d2991d
header渐变色: #1a2332 → #0d2137    header底线: #1f6feb
alert背景:    #1a1514    PlanB背景: #1a1514   bar背景:  #21262d
```

### 5. 图片版 vs 文字版内容差异
| 板块 | 图片版 v2.0 | 文字版 |
|------|------------|--------|
| 行业研判 | **36子行业全显示**，按🟢🟡🔴分组进度条 | 仅🟢🔴展开 + 🟡合并一行 |
| 操作建议 | **8个组合全列**（含持有不动的+理由） | 仅列出有操作的 |
| 基金级操作 | 每只基金独立行 + 独立理由 | 合并描述 |
| 组合标注 | 左侧色条：🟢买入 / 🔴卖出 / 🔵持有 | 无 |

### 6. 行业研判分组逻辑
```python
# 按 score 降序排列
industries_data.sort(key=lambda x: x['score'], reverse=True)
# 分组
buy_list  = [i for i in industries_data if '增持' in i['tag']]
hold_list = [i for i in industries_data if '持有' in i['tag']]
sell_list = [i for i in industries_data if '减持' in i['tag']]
# 每组带标题和计数：🟢 增持 (1)  /  🟡 持有 (29)  /  🔴 减持 (6)
```
进度条颜色按 score：≥3.5 绿色 / ≥3.0 黄色 / <3.0 红色

### 7. 金额打码（分享用）
将 JSON 中所有金额字段替换为 `"****"`，百分比替换为 `"**%"`，基金代码保留。渲染器自动检测 `isinstance(amt, str)` 跳过格式化。理由文本中的金额用正则 `¥[\d,]+→¥***` 统一替换。

## JSON 数据格式

```json
{
  "date": "2026-05-26", "day": "周二",
  "total_assets": 782668,
  "macro_signal": "🟡 中性偏积极",
  "macro_summary": "PMI维持扩张...",
  "asset_allocation": [
    {"name": "A股权益", "amount": 298764, "pct": 38.2, "status": "⚠️超配"}
  ],
  "macro": [
    {"key": "制造PMI", "val": "50.3 →"},
    {"key": "CPI", "val": "1.2% ↑", "is_up": true},
    {"key": "非制造PMI", "val": "49.4 ↓", "is_down": true}
  ],
  "industries": [
    {"name": "恒生科技", "score": 4.0, "tag": "🟢增持"},
    {"name": "A股消费", "score": 2.8, "tag": "🔴减持"}
  ],
  "alerts": [{"title": "022680 限购1万/日", "detail": "大额加仓当分日操作"}],
  "portfolio_status": [
    {
      "name": "指数生财", "type": "buy", "action": "加仓",
      "amount": "+¥3,000",
      "reason": "港股科技🟢 + 仓位偏低",
      "funds": []
    },
    {
      "name": "京东基金", "type": "sell", "action": "基金级调仓",
      "amount": "-¥5,300",
      "reason": "消费🔴+医疗🔴行业承压",
      "funds": [
        {"code": "001631", "name": "天弘食品饮料", "action": "减持", "amount": "¥1,200", "reason": "消费数据疲弱"}
      ]
    },
    {
      "name": "全天候", "type": "hold", "action": "持有不动",
      "amount": "", "reason": "全天候策略自带再平衡"
    }
  ],
  "planb": "条件1 | 条件2 | 条件3"
}
```

**`type` 字段**：`buy`（绿色左边框+📈） / `sell`（红色左边框+🛒） / `hold` 或 `neutral`（蓝色左边框+⏸️）

**`funds` 字段**：仅京东基金有，其他组合为空数组

## 使用步骤

### 生成图片
```bash
# 1. 生成 JSON 数据（来自 daily-fund-report 各 Step）
json_path = '/tmp/fund_report_data.json'

# 2. 渲染 HTML
python3 /opt/data/scripts/render_fund_report.py /tmp/fund_report_data.json /tmp/report.html

# 3. 浏览器截图
browser_navigate(file:///tmp/report.html)
browser_vision()  # 截图 → /opt/data/cache/screenshots/browser_screenshot_*.png

# 4. 发送
MEDIA:/path/to/screenshot.png
```

### 打码版
在 Step 1 后用 Python 脚本处理 JSON：
```python
import json, re
def mask_amounts(obj):
    # 递归替换 amount/total_assets 为 "****"
    # 递归替换 reason/detail 中的 ¥数字 为 ¥***
    ...
```
然后走同样的渲染+截图流程。
