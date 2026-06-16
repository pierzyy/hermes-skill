---
name: chinese-macro-daily
description: 获取中国宏观经济的每日关键指标和政策动态，包括央行货币政策、PMI、CPI、社会融资、汇率、北向资金等，用于投资决策的宏观背景参考。
category: data-science
---

# 中国宏观经济日报

## 数据来源优先级（2026-05-26 更新验证）

### 已验证可用 ✅
1. **新浪 hq.sinajs.cn API** — A股指数 `sh000001,sz399001,sh000300,sz399006`、港股 `hkHSI,hkHSTECH`、美股 `int_nasdaq,int_sp500`、商品 `hf_CL/hf_GC/hf_SI`、外汇 `fx_susdcny(在岸)/fx_susdcnh(离岸)`、美元指数 `DINIW`（⚠️ 注意：是 `DINIW` 不是 `hf_DINIW`）
2. **东方财富行情页** — `quote.eastmoney.com/zs000300.html` 页面 title 和 global header 含实时A股点位（比Sina更及时），市场总貌表格含沪市/深市平均PE
3. **东方财富证券聚焦页** — `finance.eastmoney.com/a/czqyw.html` ✅ 可获取当日新闻、行业动向
4. **CNBC quotes** — `cnbc.com/quotes/CN10Y`（中国10Y ✅）、`US10Y`（美10Y ✅）、`US2Y`（美2Y ✅）、`.VIX`（波动率 ✅）
5. **东方财富 push2 API** — `secid=1.000300` 可获取沪深300实时点位/成交额/总市值/流通市值，但 PE 字段（f162/f167/f115）返回 `-`（指数产品不提供PE）。f169/f170 需除以100才是真实涨跌额/涨跌幅
6. **新浪股指期货 nf_ 前缀** — `nf_IF0(沪深300)/nf_IC0(中证500)/nf_IH0(上证50)` ✅ 可获取实时点位、成交量、持仓量，计算基差
7. **天天基金 fundgz API** — `fundgz.1234567.com.cn/js/{code}.js` ✅ 提供ETF盘中估算净值和昨日净值，支持6只以上宽基ETF实时估值

### 已验证失效 ❌
- **东方财富数据中心** 全部报表API（`RPT_ECONOMY_CPI/PMI/LPR/MLF/SHIBOR`、`RPT_INDEX_PE/DETAIL/VALUATION/DAILY`、`RPT_MARGIN_*`、`RPT_MUTUAL_STOCKTRADE_*`、`RPTA_MAC_CAPITAL_FLOW_*`）— 返回「报表配置不存在」（2026年东财API大改版，所有RPT_报表不可用）
- **东方财富 K线 API** `push2his.eastmoney.com` 的 `133.USDCNH` — 返回 `rc=102, data=null`（已改用 Sina `fx_susdcnh` 替代）
- **东方财富 北向资金 kamt.kline API** — 盘中返回 net=0.00（仅交易时段不可用，收盘后可获取日频净流向；替代方案：浏览器访问 `data.eastmoney.com/hsgt` 获取南向实时 + 北向盘后）
- **东方财富 CFFEX 股指期货** `push2.eastmoney.com secid=8.IF00/IC00/IH00` — 返回 `rc=100, data=null`（已改用 Sina `nf_IF0/nf_IC0/nf_IH0` 替代）
- **新浪** `CIF0/IF0/IC0/IH0` — 返回空（⚠️ 必须用 `nf_` 前缀：`nf_IF0/nf_IC0/nf_IH0`）
- **新浪** `int_vix` / `sz_bond_10y` / `sz_shibor_*` / `hf_DINIW` — 全部返回空
- **Investing.com** — Cloudflare 拦截
- **Yahoo Finance** `^VIX` — 返回空
- **两融数据** — 所有东方财富/巨潮API均失效，暂无可用实时替代源
- **信用利差** — 中债登API不可用，AAA企业债-国债利差需从Wind或Bloomberg获取

### 沪深300 PE 获取策略（重要）
PE 字段无法从任何 API 直接获取。**替代方案**：
1. 浏览器访问东方财富行情页 → 获取「市场总貌」表格中的 **沪市平均PE** 和 **深市平均PE**（上一个交易日数据）
2. 按沪市PE × 0.80~0.85 估算 CSI300 PE（沪深300 PE 通常为沪市平均PE的80-85%）
3. 例如：沪市PE=16.97 → CSI300 PE ≈ 13.6~14.4x

## 获取内容
- **货币政策**：LPR、MLF操作、逆回购、降准动态
- **通胀**：CPI、PPI 最新值及趋势
- **景气度**：官方PMI、财新PMI
- **流动性**：社融、M2、北向资金净流向
- **🆕 南向资金**：港股通每日净流入/流出、前5大净买入/卖出个股（对港股组合直接相关）
- **🆕 信用利差**：AAA/AA 级中债企业债收益率 vs 国债利差（走阔→企业融资恶化→领先股市1-2周）
- **🆕 ETF 申赎**：主要宽基 ETF（沪深300/科创50/恒生科技等）每日份额变化、净申赎额（散户/机构行为领先指标）
- **🆕 股指期货基差**：IF/IC/IH 当月合约基差（升水=乐观，贴水=悲观，比现货更及时）
- **🆕 两融数据**：融资余额（杠杆情绪最灵敏指标）、融券余额、融资买入/偿还比
- **🆕 IPO 节奏**：证监会本周批文数量+募资总额，加速=抽血信号，放缓=政策呵护
- **🆕 限售股解禁**：未来一周解禁市值>100亿的重点标的、行业分布（压制相关行业）
- **汇率**：在岸/离岸人民币、美元指数
- **政策**：国务院常务会议、政治局会议、中央经济工作会议定调
- **国际市场**：美联储动态、美债收益率
- **地缘政治**（每日必查）：
  - 中美关系：关税、科技制裁、出口管制最新动态
  - 中东局势：伊朗/以色列、红海/霍尔木兹海峡航运安全
  - 俄乌局势：战况、制裁、能源供应影响
  - 台海/南海：军事动态、外交声明
  - 供应链：关键航道（苏伊士/巴拿马/马六甲）状态
  - 重大国际会议/协议（G7/G20/BRICS/APEC）

## 常用 API 命令速查

```bash
### 行情数据 ###

# A股指数（实时）
curl -s "https://hq.sinajs.cn/list=sh000001,sz399001,sh000300,sz399006" -H "Referer: https://finance.sina.com.cn"

# 上证50 & 中证500（基差计算需要）
curl -s "https://hq.sinajs.cn/list=sh000016,sh000905" -H "Referer: https://finance.sina.com.cn"

# 港股
curl -s "https://hq.sinajs.cn/list=hkHSI,hkHSTECH" -H "Referer: https://finance.sina.com.cn"

# 美股（前日收盘）
curl -s "https://hq.sinajs.cn/list=int_nasdaq,int_sp500" -H "Referer: https://finance.sina.com.cn"

# 商品
curl -s "https://hq.sinajs.cn/list=hf_CL,hf_GC,hf_SI" -H "Referer: https://finance.sina.com.cn"

# 外汇（在岸/离岸/美元指数）
curl -s "https://hq.sinajs.cn/list=fx_susdcny,fx_susdcnh,DINIW" -H "Referer: https://finance.sina.com.cn"

### 股指期货基差（✅ nf_ 前缀可用） ###
# ⚠️ CIF0/IF0/IC0/IH0 全部返回空，必须用 nf_ 前缀
# Sina nf_ 期货格式: 最新价,最高价,最低价,今开,成交量,成交额,持仓量,...
curl -s "https://hq.sinajs.cn/list=nf_IF0,nf_IC0,nf_IH0" -H "Referer: https://finance.sina.com.cn"
# 返回示例: nf_IF0="4898.000,4928.400,4837.600,4860.400,71550,349490590.000,130123.000,..."
# 基差 = 期货价格 - 现货价格（负值=贴水=偏空）

### 债券 & VIX（CNBC） ###
# ⚠️ 注意 CNBC 需要 User-Agent，否则可能返回空
# 简化 grep 模式（比完整 JSON 解析更可靠）
for sym in CN10Y US10Y US2Y .VIX; do
  curl -sL -H "User-Agent: Mozilla/5.0" "https://www.cnbc.com/quotes/$sym" 2>/dev/null | grep -oP '"last"[^,]*'
done
# CN10Y 返回: "last":"1.738%"
# .VIX 返回: "last":"17.01"

### 沪深300实时（Eastmoney push2） ###
curl -s "https://push2.eastmoney.com/api/qt/stock/get?secid=1.000300&fields=f43,f44,f45,f46,f48,f57,f58,f60,f116,f117,f169,f170"
# f43=最新价/100, f44=最高/100, f45=最低/100, f46=今开/100
# f48=成交额, f60=昨收/100, f169=涨跌额/100, f170=涨跌幅/100
# f116=总市值, f117=流通市值

### ETF 实时估值（天天基金 fundgz API） ###
# 格式: jsonpgz({"fundcode":"510300","name":"基金名称","jzrq":"2026-05-26","dwjz":"净值","gsz":"估算净值","gszzl":"估算涨跌%","gztime":"更新时间"})
# 常用宽基ETF:
curl -s "https://fundgz.1234567.com.cn/js/510300.js"  # 沪深300ETF华泰柏瑞
curl -s "https://fundgz.1234567.com.cn/js/510050.js"  # 上证50ETF华夏
curl -s "https://fundgz.1234567.com.cn/js/510500.js"  # 中证500ETF南方
curl -s "https://fundgz.1234567.com.cn/js/159915.js"  # 创业板ETF易方达
curl -s "https://fundgz.1234567.com.cn/js/588000.js"  # 科创50ETF华夏
curl -s "https://fundgz.1234567.com.cn/js/513180.js"  # 恒生科技ETF华夏
# ⚠️ 该API仅提供盘中估值和昨日净值，不含份额/申赎数据（份额需收盘后从基金公司获取）

### 南北向资金（盘中） ###
# ⚠️ kamt.kline API 盘中返回 net=0.00（仅交易时段内可用），kamt/get 提供实时余额
# 浏览器页面 data.eastmoney.com/hsgt 可实时获取南向资金（北向盘后更新）
# 南向数据：港股通(沪)+港股通(深) 净买额/买入额/卖出额

# 浏览器获取PE：访问 quote.eastmoney.com/zs000300.html → 提取"市场总貌"表格
```

## 输出格式
1. 一句话宏观总评（偏多/中性/偏空）
2. 关键指标一览表
3. **🆕 本周关键数据日历**（哪天发布CPI/PPI/PMI/LPR/MLF/FOMC/非农等，提前标注冲击预期）
4. **🆕 全球央行政策路径对比**（Fed/ECB/BOJ/PBOC 四方政策方向：收紧/中性/宽松，是背离还是共振）
5. **🆕 股债性价比 ERP**（沪深300 市盈率倒数 - 10年期国债收益率，历史分位数，当前该重股还是重债）
6. 对各大类资产（A股/港股/债券/黄金）的宏观影响判断

## 跨市场联动分析（重要）
- **中美利差**（中国10Y - 美国10Y）→ 影响北向资金、人民币汇率
- **美元指数 DXY** → 影响黄金、QDII净值、新兴市场
- **美债收益率**（2Y/10Y）→ 成长股/科技股估值锚
- **人民币汇率**（在岸/离岸）→ 港股、QDII人民币份额收益
- **VIX 恐慌指数** → 全球风险偏好标尺
- **国际油价 WTI** → 通胀预期、商品类基金
- **恒生指数/恒生科技期货夜盘** → 港股次日开盘方向

## 本周关键数据日历（每日更新）
每次报告列未来5个交易日即将发布的关键数据，标注冲击等级：
| 日期 | 时间 | 数据/事件 | 市场预期 | 冲击 |
|------|------|----------|---------|------|
| MM-DD | 09:30 | 中国X月CPI | X.X% | ⚡⚡⚡ |
数据源：东方财富财经日历、Investing.com、金十数据

## 全球央行政策路径对比
四方央行（Fed/ECB/BOJ/PBOC）当前政策立场对比：
- **立场**：鹰派（加息/缩表）→ 中性 → 鸽派（降息/扩表）
- **方向**：四方共振（同向）→ 风险偏好一致；背离（一方宽松一方收紧）→ 汇率波动加剧
- **对资产影响**：
  - Fed 鹰 + PBOC 鸽 → 中美利差走阔 → A股承压、北向流出
  - Fed 鸽 + PBOC 鸽 → 共振宽松 → 利好全球风险资产
  - BOJ 加息 → 日元套利交易平仓 → 全球流动性收缩

## 股债性价比 ERP（Equity Risk Premium）
- **公式**：ERP = (1 / 沪深300 PE) - 中国10年期国债收益率
- **历史分位数**：当前 ERP 在近5年什么位置
- **判断规则**：
  - ERP > 80%分位 → 股票极度便宜，重仓权益 🟢
  - ERP 50-80%分位 → 股票合理偏低，标配权益 🟡
  - ERP 20-50%分位 → 股票合理偏高，减配权益 🔴
  - ERP < 20%分位 → 股票极度昂贵，清仓权益 ⚪
- **动态**：ERP 最近一周是走阔还是收窄？趋势判断
