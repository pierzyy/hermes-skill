---
name: fund-report-image-render
description: ⚠️ 已废弃 — 基金投顾日报图片渲染管线。v3.0起日报仅写数据库，不再生成PNG图片发送微信。保留此技能供调试/手动渲染参考。
version: 1.0.0
category: data-science
status: deprecated
---

# 基金日报图片渲染管线 ⚠️ 已废弃

> **2026-06-06 起废弃**。日报现在通过数据库（FastAPI+SQLite, 端口25600）输出，
> 用户通过 FundMonitor APK 或 PC 网页查看。不再生成 PNG 图片发送微信。

如需手动生成日报图片（调试用），使用不带 `--no-render` 参数运行管线：
```bash
python3 /opt/data/scripts/fund_report_pipeline.py --csv /path/to.csv --output /tmp/report.png
```

## 原始设计（供参考）

### 数据格式（JSON）
写入 `/tmp/fund_report_live.json`

### 渲染步骤
1. `python3 /opt/data/scripts/render_fund_report.py /tmp/fund_report_live.json /tmp/fund_report_live.html`
2. `python3 /opt/data/scripts/render_html.py /tmp/fund_report_live.html /tmp/fund_report_final.png`

### 设计规范（Dark Blue 风格）
| 元素 | 颜色 |
|---|---|
| 背景 | `#0d1117` |
| 卡片 | `#161b22` |
| 文字 | `#e6edf3` |
| 强调 | `#58a6ff` |
| 涨/增持 | `#7ee787` |
| 跌/减持 | `#f85149` |

### 相关文件
- 渲染脚本: `/opt/data/scripts/render_fund_report.py`（同时被 server.py 引用用于 web 渲染）
- HTML→PNG: `/opt/data/scripts/render_html.py`
- 测试数据: `/tmp/fund_report_data.json`
