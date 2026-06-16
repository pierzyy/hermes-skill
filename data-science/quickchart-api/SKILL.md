---
name: quickchart-api
description: >
  当 matplotlib 不可用时，使用 quickchart.io API 生成图表图片
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [chart, graph, image, api, visualization]
    category: data-science
---

# 在线图表生成 (quickchart.io)

当 matplotlib 不可用时，使用 quickchart.io API 生成图表图片。

## 适用场景
- 服务器环境无法安装 Python 图形库
- 需要快速生成折线图、饼图、柱状图
- 想要静态图片而非交互式图表

## 使用方法

```python
import urllib.request
import urllib.parse
import json

# 准备图表数据
data = {
    "type": "line",  # line, bar, pie, doughnut
    "data": {
        "labels": ["周一", "周二", "周三"],
        "datasets": [{
            "label": "收盘价",
            "data": [251.39, 233.06, 250.95],
            "borderColor": "rgb(255, 99, 132)",
            "backgroundColor": "rgba(255, 99, 132, 0.5)",
            "tension": 0.3
        }]
    },
    "options": {
        "plugins": {
            "title": {"display": True, "text": "图表标题"}
        }
    }
}

# 生成图片
json_str = json.dumps(data)
encoded = urllib.parse.quote(json_str)
url = f"https://quickchart.io/chart?bkg=white&c={encoded}"

save_path = '/opt/data/cron/output/chart.png'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req, timeout=15) as response:
    with open(save_path, 'wb') as f:
        f.write(response.read())
```

## 注意事项
- 免费API，基本够用
- 支持 line, bar, pie, doughnut 等图表类型