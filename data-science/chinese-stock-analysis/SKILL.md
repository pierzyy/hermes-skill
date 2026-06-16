---
name: chinese-stock-analysis
description: Analyze Chinese A-share stocks (沪深/科创板/创业板) using public APIs — fetch real-time quotes, historical data, fund flows, financial reports, and announcements from East Money (东方财富) and related sources. Works without a browser.
tags: [china, stocks, eastmoney, finance, analysis, a-shares]
---

# Chinese A-Share Stock Analysis

Use this skill when you need to analyze a Chinese stock (A-shares: 60xxxx, 00xxxx, 30xxxx, 688xxx). It covers fetching real-time prices, fund flows, capital events (增发/定增/H股), financial metrics, and shareholder activity.

## Core API Endpoints (East Money)

### 1. Real-time Quote & Fund Flow

```python
import urllib.request, json, ssl
ctx = ssl._create_unverified_context()
headers = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/'}

# secid format: 1.6xxxxx for Shanghai, 0.xxxxxx for Shenzhen
secid = "1.688521"  # for 688521 (科创板上海)
url = f'https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fields=f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f55,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171,f108,f115,f292'
req = urllib.request.Request(url, headers=headers)
resp = urllib.request.urlopen(req, timeout=10, context=ctx)
data = json.loads(resp.read()).get('data', {})
```

**Key field mappings:**
| Field | Meaning | Unit |
|-------|---------|------|
| f43 | Current price | cents (divide by 100) |
| f44 | Day high | cents |
| f45 | Day low | cents |
| f60 | Previous close | cents |
| f55 | Change % | decimal (multiply by 100 for %) |
| f47 | Volume | lots (手) |
| f48 | Turnover | yuan |
| f116 | Total market cap | yuan |
| f117 | Float market cap | yuan |
| f162 | Main force net flow (主力净流入) | yuan (negative=outflow) |
| f167 | Super-large order net flow (超大单) | yuan |
| f169 | Large order net flow (大单) | yuan |
| f170 | Medium order net flow (中单) | yuan |
| f171 | Small order net flow (小单) | yuan |

### 2. Historical K-line Data

```python
# klt=101 for weekly, klt=102 for monthly, klt=103 for quarterly
# fqt=1 for forward-adjusted (前复权), fqt=2 for backward-adjusted, fqt=0 for unadjusted
url = f'https://push2.eastmoney.com/api/qt/stock/kline/get?secid={secid}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&lmt=20&fqt=1'
```

**Note:** The East Money kline endpoint may return `rc=102` (no data) for some stocks, especially on ex-dividend/ex-rights dates. When this happens, use the **Tencent Finance API** as a reliable fallback:

```python
# FALLBACK: Tencent Finance API (web.ifzq.gtimg.cn) — more reliable for K-line data
# Key differences from East Money:
#   - Uses 'sh' prefix instead of secid (e.g., 'sh688521')
#   - Returns data as string arrays: [date, open, close, high, low, volume]
#   - Prices already in yuan (no /100 needed)
#   - Volume is raw share count (not 手), divide by 10000 for 万手
#   - fqkline endpoint always returns 前复权 (forward-adjusted)
#   - No fqt parameter needed; use 'qfq' suffix for 前复权

# Daily K-line (last 60 days, 前复权)
url = f'http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh{code},day,,,60,qfq'

# Weekly K-line (last 20 weeks)
url = f'http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh{code},week,,,20,qfq'

# Monthly K-line (last 12 months)
url = f'http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh{code},month,,,12,qfq'

# Response format:
# {"code":0,"msg":"","data":{"sh688521":{"day":[["2026-01-28","228.630","221.000","231.350","215.200","21913453.000"],...]}}}
# Each entry: [date, open, close, high, low, volume_in_shares]

# Real-time quote (also from Tencent)
url = f'http://web.sqt.gtimg.cn/q=sh{code}'
# Returns: v_sh688521="1~芯原股份~688521~280.88~234.07~260.00~40905185~..."
# Fields: name~code~current~prev_close~open~volume~...

# IMPORTANT: Use the 'sh' prefix for ALL Shanghai stocks (including 688xxx)
# For Shenzhen stocks, use 'sz' prefix
def get_tencent_prefix(code):
    if code.startswith('6'):
        return 'sh'
    return 'sz'
```

**Known issues with Tencent API:**
- No back-adjusted (后复权) option — only 前复权 (qfq) is supported
- Volume is in raw shares, not 手 (lots). Divide by 10000 for 万手
- The `kline` endpoint (web.sqt.gtimg.cn) is unreliable; prefer `fqkline` endpoint

### 3. Company Announcements

```python
# Get recent announcements
url = f'https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=100&page_index=1&ann_type=A&stock_list=688521&f_node=0&s_node=0'
# Response has list items with art_code (e.g., "AN202602261820060489") and title

# Get detail of a specific announcement
detail_url = f'https://np-anotice-stock.eastmoney.com/api/security/ann/detail?art_code={art_code}'
```

### 4. Fund Flow Data (主力资金流向)

**⚠️ CRITICAL: The `push2.eastmoney.com` fflow endpoint returns `null` (rc=100). Use `push2his.eastmoney.com` instead:**

```python
# CORRECT endpoint for historical fund flow
url = f'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?secid={secid}&fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54,f55,f56&lmt=30'
headers = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.eastmoney.com/'}
req = urllib.request.Request(url, headers=headers)
resp = urllib.request.urlopen(req, timeout=10, context=ctx)
data = json.loads(resp.read())
klines = data.get('data', {}).get('klines', [])

# Each kline string: "date,main_flow,small_flow,medium_flow,large_flow,super_large_flow"
# All values in yuan (元). Divide by 1e8 for 亿元.
for k in klines:
    parts = k.split(',')
    main_flow_yi = float(parts[1]) / 1e8  # 主力净流入(亿元)
    super_large_yi = float(parts[5]) / 1e8  # 超大单净流入(亿元)
```

**Key analysis pattern:** Compare 15-day vs 30-day main force flow:
- 30-day positive + 15-day negative = smart money started distributing
- 超大单 positive + 大单/中单 negative = "边拉边出" (distribution rally, bearish)
- Single-day 超大单 > +10亿 with 大单/中单 heavy outflow = likely pump for dumping

### 5. Financial Data — Tencent Jiankuang API (RECOMMENDED)

**The best source for financial metrics is Tencent's jiankuang API** — returns EPS, revenue, net profit, BVPS, ROE, debt ratio, etc. in a single call:

```python
url = f'http://web.ifzq.gtimg.cn/appstock/app/stockinfo/jiankuang?code=sh{code}'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
resp = urllib.request.urlopen(req, timeout=10, context=ctx)
data = json.loads(resp.read())

# Key fields in data['data']:
zyzb = data['data'].get('zyzb', {})  # 主要财务指标
# zyzb['detail'] = {
#   'date': '2026一季报',
#   'mgsy': '-0.65元',        # 每股收益
#   'jlr': '-3.41亿元',       # 净利润
#   'jlrzzl': '-54.69%',      # 净利润增长率
#   'yyzsr': '8.36亿元',      # 营业收入
#   'zsrzzl': '114.47%',      # 收入增长率
#   'mgjzc': '5.98元',        # 每股净资产
#   'sy': '6.29亿元',         # 所有者权益
#   'jzc': '31.47亿元',       # 净资产
#   'sy_jzc': '19.99%',       # ROE
#   'jzcsyl': '-10.38%',       # 净资产收益率
#   'zcfzl': '59.74%',        # 资产负债率
#   'syl': '-234.66',         # PE(TTM)
#   'sjl': '48.34'            # P/B(TTM)
# }
```

**Also returns revenue breakdown by product/region/sector** in `data['data']['zysr']`.

### 6. F10 Business Analysis (经营评述)

For narrative-level detail (revenue breakdown, order book, strategy), use:
```python
url = f'https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax?code=SH{code}'
```
Returns `zyfw` (business scope), `zygcfx` (revenue composition with GM%), and `jyps` (经营评述 — detailed annual review with revenue by product, orders, pipeline, etc.). The `jyps[0]['BUSINESS_REVIEW']` field contains the full management discussion.

### 7. East Money F10 Datacenter — NOT Reliable

The `datacenter.eastmoney.com` API is **finicky** — many table names return "报表配置不存在" or 400 errors. **Prefer Tencent jiankuang API (#5) for financial data.** The `RPT_LICO_FN_CPD` table with only `SECUCODE` column works (to check data exists) but is rarely useful.

## Identifying Stock Exchange Code

```python
# Shanghai stocks (60xxxx, 688xxx): prefix "1."
# Shenzhen stocks (00xxxx, 30xxxx): prefix "0."
# Beijing stocks (8xxxxx): prefix "0."
def get_secid(code):
    if code.startswith('6'):
        return f"1.{code}"
    else:
        return f"0.{code}"
```

## Analyzing Capital Events

Key events to look for in announcements (use skill to filter):
- **H-share listing (H股上市)**: major dilution risk for A-shares
- **Private placement (定增/增发)**: search for "募集资金", "非公开发行"
- **Shareholder reduction (股东减持)**: search for "减持", "权益变动"
- **Stock incentives (股权激励)**: "限制性股票"
- **Performance reports (业绩)**: "业绩快报", "业绩预告"

## Multi-Event Analytical Framework

When the user asks for **forward-looking price prediction** (not just data retrieval), use this framework to synthesize multiple data sources:

### Key Capital Events to Correlate

| Event | Signal Type | Impact |
|-------|-------------|--------|
| **定增/增发 (Private Placement)** | Future dilution + lockup expiry | 6-month lockup → post-lockup selling pressure |
| **H股上市 (H-share listing)** | Dilution + valuation arbitrage | A-share tends to decline toward H-share discount |
| **股东减持公告 (Shareholder reduction)** | Supply pressure | Frequency > quantity: monthly touching of 1%/5% triggers is bearish |
| **大单资金流向 (Main force flow)** | Short-term strength/weakness | Day-changes matter less; trend of consecutive outflows matters more. Compare 15d vs 30d trends. |
| **今日行情 (Today's price action)** | Often misleading in isolation | Big up days + large turnover + negative main force flow = "边拉边出" (distribution rally) |
| **超大单 vs 大单/中单 divergence** | Critical reversal signal | 超大单 +10亿+ 流入 + 大单/中单 大额流出 → 拉高出货, strong bearish signal |

### Analysis Recipe

```text
Step 1: Identify ALL capital events → timeline them (定增日期/解禁日/H股/减持节奏)
Step 2: Check post-lockup behavior → is there active selling? (减持公告频率)
Step 3: Check today's price action → is it a distribution rally? (up % vs main force flow)
Step 4: Synthesize → multiple dilution events + active selling + distribution = strong bearish
Step 5: Give clear price targets with time horizons (1m/3m/6m)
```

### Presenting Results Clearly

The user specifically asks for **no ambiguity** — provide:
- Specific price targets (e.g., "看跌至130~180元")
- Categorized time horizons (1个月/3个月/6个月)
- A clear "buy/sell/hold" recommendation if prices reach certain levels
- Actionable advice for holders vs. non-holders

## Pitfalls to Avoid

1. **除权除息 days**: Stock prices can show weird values on ex-dividend/ex-rights dates. The f55 (change %) field may show -64% due to price recalibration. Check f60 (previous close) vs f43 (current price) to detect this.
2. **API rate limits**: East Money APIs may return empty responses if hit too frequently. Add 1-2 second delays between calls.
3. **SSL issues**: Always use `ssl._create_unverified_context()` — East Money uses self-signed certs on some endpoints.
4. **Field name changes**: The `urllib.request` approach may fail with `RemoteDisconnected` for some endpoints; retry with different `Referer` headers.
5. **公告详情API → UNRELIABLE**: Most art_codes return empty content or JSON parse errors. The detail endpoint (`np-anotice-stock.eastmoney.com/api/security/ann/detail`) is not fully open for the majority of announcement types. Use the list API (announcement titles+dates) for event tracking, and get financial data from Tencent jiankuang (#5) or F10 Business Analysis (#6) instead of scraping announcement content.
12. **图表生成**: In sandboxed environments without matplotlib, QuickChart.io may be blocked (400 errors both GET and POST). Fall back to text-based analysis or ascii charts. Do NOT spend time debugging chart generation — proceed with analysis without charts.
13. **除权除息日 f56 异常**: `f56` (涨跌额) 在除权除息日可能返回 0.0。只信任 `f43` (现价) 和 `f60` (前收盘)，手工计算涨跌幅。
6. **Price units**: Prices are in **cents** (分), not yuan. Always divide by 100.
7. **Volume units**: Volume is in **lots** (手 = 100 shares).
9. **除权除息日K线不可用**: East Money 的 K线 API (push2.eastmoney.com) 在除权除息日可能返回 `rc=102`，数据完全不可用。应切换到腾讯API (`web.ifzq.gtimg.cn`) 作为降级方案。
10. **腾讯API前缀规则**: 上海股票(包括60/688开头)用 `sh` 前缀，深圳股票(00/30开头)用 `sz` 前缀。
11. **腾讯API数据格式**: 返回的价格已经是"元"单位(不需÷100)，成交量是原始股数(不需×100)。

## Script Template

```python
import urllib.request, json, ssl
ctx = ssl._create_unverified_context()
headers = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://quote.eastmoney.com/'}

code = "688521"  # target stock code
secid = f"1.{code}" if code.startswith('6') else f"0.{code}"

# 1. Get real-time data
url = f'https://push2.eastmoney.com/api/qt/stock/get?secid={secid}&fields=f43,f44,f45,f46,f47,f48,f55,f57,f58,f60,f116,f117,f162'
req = urllib.request.Request(url, headers=headers)
resp = urllib.request.urlopen(req, timeout=10, context=ctx)
data = json.loads(resp.read()).get('data', {})

price = data.get('f43', 0) / 100
prev_close = data.get('f60', 0) / 100
change_pct = data.get('f55', 0) * 100 if data.get('f55') else 0
market_cap = data.get('f116', 0) / 1e8
main_flow = data.get('f162', 0) / 10000

# 2. Get recent announcements
ann_url = f'https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=50&page_index=1&ann_type=A&stock_list={code}&f_node=0&s_node=0'
req2 = urllib.request.Request(ann_url, headers=headers)
resp2 = urllib.request.urlopen(req2, timeout=10, context=ctx)
ann_data = json.loads(resp2.read())

for item in ann_data.get('data',{}).get('list',[]):
    title = item.get('title','')
    date = item.get('notice_date','')
    # Filter for key events
    if any(k in title for k in ['减持','增发','定增','募集','H股','业绩快报','业绩预告']):
        print(f"{date} | {title}")
```
