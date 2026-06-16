#!/usr/bin/env python3
"""公募基金组合实时监控脚本
每小时拉取组合内所有基金的实时估值，计算总市值和涨跌幅
使用示例: python3 monitor.py
"""

import urllib.request
import json
import ssl
import re
from datetime import datetime

# ====== 组合持仓 (修改此处) ======
# (基金名称, 代码, 持有金额)
PORTFOLIO = [
    # 示例: ("国泰黄金ETF联接A", "000218", 3702.29),
]

# ====== 拉取估值 ======
ctx = ssl._create_unverified_context()
headers = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/'}

total_amount = 0
total_est = 0
est_count = 0
detail_lines = []

for name, code, amount in PORTFOLIO:
    total_amount += amount
    gsz = None
    dwjz = None
    gszzl = "N/A"
    
    try:
        url = f'https://fundgz.1234567.com.cn/js/{code}.js'
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=5, context=ctx)
        data = resp.read().decode('utf-8', errors='ignore')
        match = re.search(r'jsonpgz\((.*)\)', data)
        if match:
            info = json.loads(match.group(1))
            dwjz = info.get('dwjz', '')
            gsz = info.get('gsz', '')
            gszzl = info.get('gszzl', 'N/A')
    except Exception:
        pass
    
    if gsz and dwjz:
        try:
            cur_val = amount * float(gsz) / float(dwjz)
            chg_pct = float(gszzl)
        except (ValueError, TypeError):
            cur_val = amount
            chg_pct = 0.0
        est_count += 1
    else:
        cur_val = amount
        chg_pct = 0.0
    
    total_est += cur_val
    chg_str = f"{chg_pct:+.2f}%" if gszzl != 'N/A' else ' --- '
    detail_lines.append(f"  {code} {name[:16]:16s} ¥{amount:>5.0f} → ¥{cur_val:>6.0f} ({chg_str})")

# ====== 输出报告 ======
now = datetime.now().strftime('%Y-%m-%d %H:%M')
overall_chg = (total_est - total_amount) / total_amount * 100 if total_amount > 0 else 0

print(f"📊 组合监控 | {now}")
print(f"{'='*50}")
print(f"总投入:    ¥{total_amount:,.2f}")
print(f"估算市值:  ¥{total_est:,.2f}")
print(f"估算涨跌:  {overall_chg:+.2f}%")
print(f"实时估值:  {est_count}/{len(PORTFOLIO)} 个基金可用")
print()
for line in detail_lines:
    print(line)
