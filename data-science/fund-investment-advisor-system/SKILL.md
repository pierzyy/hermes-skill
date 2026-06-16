---
name: fund-investment-advisor-system
description: 基金投资顾问系统——独立于基金日报的全新投前+投中+投后闭环系统。双循环六引擎架构。输出渠道从微信图片升级为 Streamlit APK + Web 访问。
category: data-science
---

# 基金投资顾问系统

## 💡 架构白皮书
系统的完整技术文档已保存至 `ARCHITECTURE.md`（~16KB），涵盖完整数据链、交易日全时间线、回测复盘飞轮玩法（OPC认知复利闭环）、建仓后自动接入点、关键设计决策。该文档是理解系统的首选入口。

## 定位
独立于基金日报+FundMonitor，物理隔离的新系统。覆盖：市场雷达 → 行业研判 → 基金筛选评分 → 持仓诊断 → 组合构建 → 决策建议 → 复盘沉淀。

## 项目路径
`/opt/data/fund-advisor-system/`

## 📚 核心文档
| 文档 | 说明 |
|------|------|
| **`TECHNICAL_REFERENCE.md`** | ⭐ **完整技术参考（唯一权威来源）** — 架构/时间线/数据流/引擎/DB/BUG史/运维 |
| `DESIGN.md` | 架构设计文档（v4.0 全闭环，设计哲学） |
| `THEORY_BENCHMARK.md` | 理论对标分析 + P0-P4 全部21项改进路线图 |
| `DATA_FLOW_TIMELINE.md` | 数据流与时间线（v4.4，已被 TECHNICAL_REFERENCE.md 覆盖） |
| `DATAFLOW.md` | 完整数据流（v2.0，详尽但部分内容已过时） |
| `USER_DATA_LAYER.md` | 用户数据层架构（v1.0） |
| `INTEGRATION_PLAN.md` | 全信号融合方案 |
| `P0_IMPLEMENTATION.md` | P0三模块实现文档 |
| `config.yaml` | 系统配置 |

> **2026-06-12 文档整合**: 原有8份散落文档已合并为 `TECHNICAL_REFERENCE.md`（41KB单文件权威参考）。新增内容：星环操作闭环、晚间管线链式结构、完整cron清单、star_ring_advice表结构、BUG修复史12条。

### daemon 状态机修复 + 重构 (2026-06-10)
**根因链**: config.py yaml崩溃 → data_scheduler 30线程OOM → 进程被杀 → _nav_done_today 丢失 → 无限重入 NAV_CHECK → fetch_f10_nav IPv6卡死
**修复**: 持久化完成标记、5线程、300s超时、Popen异步、15s线程超时保护(❌shutdown冻结→✅wait=False)、强制IPv4、120s子进程超时。
**状态**: ✅ 已修复并稳定运行 (PID 1404), 明天9:25自动切 INTRADAY
**拟定重构 (待执行)**: ①删除首轮subprocess调用(daily_update+data_scheduler)，15:00立即进入f10确认循环；②非星环持仓也走确认+滚动+写cache路径，131只统一对待，仅signal_pending限定星环；③data_scheduler Step3 page_size: 60→5
| 模块 | 功能 | 状态 |
|------|------|:----:|
| `black_litterman.py` | Black-Litterman 大类配置优化 + 风险预算 | ✅ P0 |
| `fama_french.py` | FF5五因子纯因子归因（MKT/SMB/HML/RMW/CMA） | ✅ P1 |
| `reflexivity.py` | Soros反身性预警（6维信号→0-100分） | ✅ P1 |
| `signal_integrator.py` | **全信号融合入口**（L1环境+L2修正+L3否决+L4配置+L5元认知） | ✅ Phase 2 |
| `sector_scorer.py` | 分组差异化评分（15组19维度专属函数） | ✅ P1 |
| `debt_cycle.py` | Dalio债务周期定位（社融/M2/信用利差） | ✅ P2 |
| `market_clock.py` | Howard Marks八阶段统一市场时钟 | ✅ P2 |
| `beta_alpha_loss.py` | β/α损失归因（回撤分解） | ✅ P2 |
| `portfolio_factor_exposure.py` | 组合级FF5因子穿透暴露 | ✅ P2 |
| `portfolio_entropy.py` | Shannon熵量化组合分散度 | ✅ P4 |
| `minsky_stability.py` | Minsky金融不稳定预警（4维信号） | ✅ P4 |
| `calendar_rebalance.py` | Swensen耶鲁模式季度窗口再平衡 | ✅ P4 |
| `competing_agents.py` | DeepMind双参数模型竞争评分 | ✅ P4 |
| `hmm_state_detection.py` | Renaissance HMM隐藏状态检测 | ✅ P4 |
| `survivorship_bias.py` | 幸存者偏差修正 | ✅ P3 |
| `circle_of_competence.py` | Peter Lynch认知圈标记 | ✅ P3 |
| `correlation.py` | 赛道相关性矩阵 | ✅ |
| `style_regression.py` | 风格回归（含BENCHMARK_MAP） | ✅ |
| `macro_quadrant.py` | 宏观四象限 | ✅ |
| `five_dimension.py` | 五维基础评分 | ✅ |
| `asset_allocation.py` | 大类资产配置 | ✅ |

### 引擎层 (`src/engines/`)
| 模块 | 功能 | 状态 |
|------|------|:----:|
| `decision_matrix.py` | Phase 3a 决策矩阵 + Trigger Point | ✅ |
| `portfolio_builder.py` | Phase 3b 组合构建 + 触及式再平衡 | ✅ |
| `review_engine.py` | Phase 4 复盘引擎（L1/L2/L3） | ✅ |
| `signal_pusher.py` | Phase 6 信号推送 | ✅ |
| `market_radar.py` | Phase 1 市场雷达 | ✅ |
| `position_doctor.py` | Phase 2a 持仓诊断 | ✅ |
| `decision_psychology.py` | Kahneman决策心理学 + 后见之明防御 | ✅ P2 |
| `bayesian_updater.py` | 信号源贝叶斯在线更新 | ✅ P3 |
| `adaptive_market.py` | Andrew Lo适应性市场检测（5策略排名+权重调整） | ✅ P3 |

### 数据层 (`src/data/`)
| 模块 | 功能 | 状态 |
|------|------|:----:|
| `fund_list.py` | 全市场基金列表采集 (fundcode_search.js) | ✅ |
| `fund_nav.py` | 基金净值历史采集 (lsjz API) | ✅ |
| `fund_detail.py` | 基金经理/规模/申购状态 | ✅ |
| `market_indices.py` | A股指数行情 (Sina) | ✅ |
| `money_flow.py` | 北向/南向资金 + ETF资金流 | ✅ |
| `sentiment.py` | 涨跌家数/融资余额 | ✅ |
| `etf_scale.py` | **🆕 ETF份额数据** (腾讯 qt.gtimg.cn) | ✅ B7 |
| `fetcher.py` | HTTP 请求基础设施 (fetch_with_retry) | ✅ |
| `margin_data.py` | **🆕 两融余额** (东财 datacenter-web) | ✅ B1 |
| `billboard_data.py` | **🆕 龙虎榜** (东财) | ✅ B2 |
| `blocktrade_data.py` | **🆕 大宗交易** (东财) | ✅ B3 |
| `futures_data.py` | **🆕 股指期货基差** (Sina nf_IF0) | ✅ B4 |
| `supply_data.py` | **🆕 IPO+限售股解禁日历** (东财) | ✅ B5 |
| `macro_data.py` | **🆕 全球宏观快照** (WallStreetCN) | ✅ B6 |
| `fund_discovery.py` | **🆕 周频基金发现** (新发/清盘/改名) | ✅ C2 |
| `freshness.py` | **🆕 数据新鲜度巡检** (8张核心表) | ✅ C3 |
| `data_scheduler.py` | **🆕 统一调度器** (4步顺序+错误隔离) | ✅ C1 |

### 核心脚本 (`scripts/`)
> ⚠️ 2026-06-11 起, 晚间数据管线已合并为21:00单脚本链式执行。旧cron (22:15 P6推送 + 22:30星环建议) 已暂停。详情见 `TECHNICAL_REFERENCE.md`。

| 脚本 | 功能 | 调用方式 |
|------|------|---------|
| **`evening_pipeline.py`** | ⭐ 21:00 统一管线 (数据→信号→星环, 链式中断) | cron 8dc9a8158220 |
| `data_scheduler.py` | 数据调度4步 (温度/7源/NAV/新鲜度) | evening_pipeline Step1 |
| `daily_data_refresh.py` | 7大数据源批量刷新 | data_scheduler Step2 |
| `daily_update.py` | 市场温度 → market_snapshot | data_scheduler Step1 |
| `run_signal_push.py` | P6信号推送 | evening_pipeline Step2 |
| `generate_star_ring_advice.py` | 星环操作建议 (写 star_ring_advice 表) | evening_pipeline Step3 |
| `run_sector_radar.py` | 行业雷达 74行业 | cron d9e9ea721ff2 (15:10) |
| `fetch_intraday_data.py` | 盘中指数快照 | cron 2157147e957a (10:00/14:00) |
| `fetch_today_nav.py` | NAV兜底拉取 | cron 135e03d691bf (23:00) |
| `update_nav_weekly.py` | NAV全量刷新 (19,322只) | cron b08565aa134a (周日03:00) |

## 访问方式
手机 APK (FundAdvisorView)：`http://106.12.90.23:25601`（FRP→Streamlit :8501）
SPA 管理页面：`http://106.12.90.23:25602`（FRP→portfolio_api :8502）
日报/报告：`http://106.12.90.23:25600`（FRP→daily_report server :25600）
PC 浏览器：同上

### 数据自动化架构 (v4.4 — 2026-06-12 管线重构+星环建议)

> ⭐ **完整时间线见 `TECHNICAL_REFERENCE.md` [第3节 交易日时间线]**

两层物理隔离数据库：
- **用户数据层** `user-portfolio.db` — 7张业务表，131条持仓，9个组合
- **分析引擎层** `fund_advisor.db` — 49张表，2900万+净值历史

核心变更 (2026-06-11):
- 所有持仓 (131只) 统一走 f10 确认+金额滚动，不再分星环/非星环
- daemon 只做净值确认，分析层刷新由 cron 独立负责，两层解耦
- 晚间管线单脚本链式执行 (21:00), 取代旧22:00/22:15/22:30三段式
- generate_star_ring_advice.py 写 star_ring_advice 表
- Streamlit 星环管理页新增「💡 操作建议」展开区

## 数据源全景

### FRP 端口映射

云服务器 `106.12.90.23:7000` (token: `frp_nas_2026`)

| 隧道名 | 本地端口 | 公网端口 | 服务 |
|--------|---------|---------|------|
| `fundapi` | 8502 | **25602** | Portfolio API SPA |
| `fundadvisor` | 8501 | **25601** | Streamlit投顾面板 |
| `dailyreport` | 25600 | 25600 | 日报服务 + Streamlit反向代理 |

### 数据采集层
| 来源 | 数据 | API | 可靠性 |
|------|------|-----|:--:|
| 东方财富 (datacenter-web) | 两融/龙虎榜/大宗/IPO/解禁 | REST JSON | ⭐⭐⭐⭐ |
| 东方财富 (fund API) | 基金列表/净值/详情/经理/规模 | JS/JSOP/HTML | ⭐⭐⭐⭐ |
| 新浪财经 (Sina) | 指数行情/期货基差 | hq.sinajs.cn | ⭐⭐⭐⭐⭐ |
| 华尔街见闻 (WallStreetCN) | 全球宏观/国债/SHIBOR/汇率 | REST JSON | ⭐⭐⭐⭐ |
| 腾讯证券 (qt.gtimg.cn) | ETF份额/规模 (63只) | REST plaintext | ⭐⭐⭐⭐⭐ |
| CNBC | VIX/美债收益 | HTML scraper | ⭐⭐⭐ |

## 引擎架构
```
数据采集层 → 分析层 → 展示层 → 决策层 → 反馈层
    │            │         │         │         │
    │  ┌─────────┘         │         │         │
    │  │ 市场雷达   ├──────→ 评分层  ├──────→ 决策层
    │  │ 行业研判   │       21模块    │     6引擎
    │  │ 五维评分   │    signal_int  │   decision
    │  └───────────┘      五层融合    │   portfolio
    │                               │   review
    └─ cron自动刷新 ────────────────→ 反馈层
       (15:30/16:30/周日)
```

## 数据库表结构（24张表）

| 表 | 行数 | 说明 |
|----|------|------|
| funds | 26,979 | 全市场基金列表 |
| fund_nav | 29,538,486 | 基金净值历史（已去重 + UNIQUE约束） |
| fund_sector_map | 30,920 | 赛道→基金映射（100%覆盖） |
| fund_details | 101 | 持仓基金详情（经理/规模已补全） |
| market_snapshot | ✅ 1+ | 每日市场温度快照 (cron 15:30) |
| margin_snapshot | **🆕 502** | 两融余额日频 (cron 16:30) |
| billboard_daily | **🆕 426** | 龙虎榜日频 |
| block_trade | **🆕 232** | 大宗交易日频 |
| futures_basis | **🆕 3** | 股指期货基差日频 (IF/IC/IH) |
| macro_snapshot | **🆕 1** | 全球宏观快照 (中美德日国债/SHIBOR/汇率) |
| supply_calendar | **🆕 6,090** | IPO+解禁日历 |
| etf_scale_snapshot | **🆕 55** | ETF份额数据 (腾讯qt, 63只ETF) |
| sector_scores | 72 | 赛道评分（含分组） |
| sector_correlation | 2,485 | 71×71相关系数矩阵 |
| factor_attribution | 16,194 | FF5纯因子归因 |
| sector_factor_attribution | — | 赛道级因子归因 |
| reflexivity_snapshots | 71 | 反身性快照 |
| reflexivity_alerts | — | 反身性预警历史 |
| debt_cycle_snapshots | — | 债务周期快照 |
| market_clock_snapshots | — | 市场时钟快照 |
| portfolio_drawdown_attribution | 83 | β/α损失归因 |
| portfolio_factor_exposure_snapshots | — | 组合因子暴露 |
| portfolio_entropy_snapshots | — | 组合熵快照 |
| minsky_snapshots | — | Minsky预警快照 |
| calendar_rebalance_snapshots | — | 日历再平衡快照 |
| competing_agent_snapshots | — | 竞争Agent快照 |
| hmm_state_snapshots | — | HMM状态快照 |
| hmm_daily_states | — | HMM日度状态 |
| operations_log | 72 | 操作建议（含Trigger Point） |
| portfolio_plan | — | 组合构建计划 |
| decision_snapshots | 142 | L1决策快照 |
| asset_allocation | — | 大类配置 |
| macro_quadrant | — | 宏观四象限 |
| decisions_outcomes | — | L2（需30天滞后） |
| factor_performance | — | L2因子归因 |
| anti_patterns | — | L3反模式 |
| strategy_effectiveness_snapshots | — | 适应市场策略排名 |
| circle_of_competence | 27 | 认知圈标记 |
| survivorship_bias_snapshots | — | 幸存者偏差修正 |
| scoring_weights_config | — | 评分权重配置 |
| signal_accuracy_tracker | — | 信号精度追踪 |

## 开发状态 (2026-06-10 v4.3 — cron重构方案已达成一致，待执行)

- **cron重构 (2026-06-10拟定)**：取消08:50/11:30简报、取消15:30 daily_update独立cron、data_scheduler 16:30→22:00、信号推送17:00→22:15、新增22:30星环建议+23:00 NAV兜底。全部持仓统一走f10确认+金额滚动（131只统一对待，仅signal限定星环）。daemon首轮删除subprocess调用，15:00立即进入确认循环。

```
✅ Phase 0~6 全部完成       ✅ P0 BL+风险预算+Kelly
✅ P1 FF5归因+反身性+分组    ✅ P2 债务周期+时钟+归因+穿透+心理学
✅ P3 贝叶斯+幸存者+认知圈+适应性  ✅ P4 熵+Minsky+日历+竞争Agent+HMM
✅ SignalIntegrator 五层融合  ✅ Bayesian Tracker 21信号源
✅ L4 仓位限制+再平衡+策略适应 ✅ 全21项接入决策管线
✅ Phase A 数据库修地基      ✅ Phase B 7项新数据源接入
✅ Phase C 自动化调度         ✅ 39张表 + 每日cron自动刷新
✅ B7 ETF份额 (腾讯qt)       ✅ 13个专属API源全集成
✅ 用户数据层 (user-portfolio.db) ✅ 7表131持仓9组合
✅ portfolio_daemon 三状态机  ✅ daemon bug修复 (持久化+超时+异步+IPv6保护)
✅ portfolio_api FastAPI+SPA ✅ 15端点 + 内联3Tab页面
✅ Streamlit :8501 → FRP 25601 ✅ FundAdvisorView APK
Git: master, 9+ 次提交
```

## 已知问题
- Phase 4 L2/L3 需30天滞后数据（2026-07-08后可验证）
- 两融余额数据 API T+1延迟发布，非代码问题
- 所有已知BUG已修复（详见 `TECHNICAL_REFERENCE.md` 第12节）

## 相关技能
- `fund-advisor-streamlit-apk` — APK 构建 + Streamlit 代理部署
- `decomposition-pipeline` — 复杂任务 Pro→Flash 分解执行

## 开发规则
- Python only, numpy only（无pandas）
- 零LLM计算用纯Python脚本
- 主session内MEDIUM+任务一律delegate_task走子agent

## 理论对标（已全部实现）
系统完成与 9 位传奇投资人、18+ 经典理论、7 项先进技术思想的全面对标，P0-P4 共 21 项改进路线图全部闭环。

### P0-P4 完成一览

| 优先级 | 关键改进项 | 对标思想 | 状态 |
|:-----:|-----------|---------|:----:|
| **P0** | Black-Litterman 权重优化 | Markowitz + Swensen | ✅ |
| **P0** | 风险预算（Risk Budgeting） | Bridgewater All-Weather | ✅ |
| **P0** | Kelly 仓位建议 | Kelly + Graham | ✅ |
| **P1** | Fama-French 纯因子归因 | Fama + AQR | ✅ |
| **P1** | 反身性预警 | Soros | ✅ |
| **P1** | 分组差异化评分 | Peter Lynch | ✅ |
| **P2** | 债务周期定位 | Dalio | ✅ |
| **P2** | 统一市场时钟 | Howard Marks | ✅ |
| **P2** | β/α 损失归因 | Oaktree | ✅ |
| **P2** | 持仓因子穿透 | AQR | ✅ |
| **P2** | 决策心理学 + 后见之明防御 | Kahneman | ✅ |
| **P3** | 贝叶斯在线更新 | Renaissance | ✅ |
| **P3** | 幸存者偏差修正 | Elton/Gruber | ✅ |
| **P3** | 认知圈标记 | Peter Lynch | ✅ |
| **P3** | 适应性市场检测 | Andrew Lo | ✅ |
| **P4** | 组合熵度量 | Shannon | ✅ |
| **P4** | Minsky 稳定性预警 | Minsky | ✅ |
| **P4** | 日历再平衡 | Swensen | ✅ |
| **P4** | 竞争型 Agent | DeepMind | ✅ |
| **P4** | HMM 隐马尔可夫状态检测 | Renaissance | ✅ |

## 场外基金改造 (2026-06-12) + 🐛 2026-06-12 晚间修复

**铁律**: 系统只输出场外基金(OTC)建议，任何 ETF/场内基金代码(5xxx, 159xxx)不应出现在 `star_ring_advice` 中。集中度预警不再读老8组合的JSON。

### 修复: fund_tags.py — 消费电子关键词被 a_电子 拦截
旧: `a_消费电子` 的 `excl_keywords: ["电子"]` 导致所有含"电子"的基金(含"消费电子")被排除自身类别
新: `a_电子` 加 `excl_keywords: ["消费电子"]`, `a_消费电子` 移除 `excl_keywords`
结果: 27只消费电子基金从 `a_电子` 重映射到 `a_消费电子`, 另清理了2条 `ap_欧洲STOXX` 错误映射

### 补充: sector_data.py — 低空经济+纺织服饰 加ETF源
5个赛道(低空经济/纺织服饰/商贸零售/美容护理/轻工制造)全库0基金匹配，其中低空经济(159332)和纺织服饰(516750)有活跃ETF可追踪行情，已加入sector_data.py。其余3个(商贸零售/美容护理/轻工制造)无任何ETF，保留`none`标记。

这些赛道有行情数据但无场外基金 → `get_best_otc_fund()` 返回 None → `else: continue` 跳过，不会产生操作建议。

### P2六面整合(2026-06-12): 新闻+政策面集成
新增 `src/data/sector_news.py` — 东财搜索API+词典法NLP情感打分(正负面词库~40条), 写入 `sector_news_sentiment` 表;
同步生成政策面评价(基于国债收益率走势推断货币政策松紧), 写入 `sector_policy` 表。
集成进 `data_scheduler.py` Step2F。
SignalIntegrator L2扩展至17维: +16新闻情感累积(3日窗口) +17政策方向(松紧×强度)。

### 信用面+市场结构(2026-06-12)
新增 `src/data/credit_data.py`—东财债券曲线→`sector_credit`, 利差>150bp→L3 OVERRIDE/>300bp→L3 VETO。
新增 `src/data/market_structure.py`—基于基本面数据派生HHI+MA200proxy→L4配置层联动(弱势→收紧仓位, HHI>0.3→加快再平衡)。
集成进 `data_scheduler.py` Step2G+2H, 共计11步。
新增 `src/data/global_macro.py` — Sina VIX/DXY/道指/纳指/标普/恒生采集, 写入 `macro_global` 表。
新增 `scripts/fetch_sentiment.py` — Sina全市场涨停跌停+已有融资买入占比, 写入 `sector_market_sentiment` 表。
集成进 `data_scheduler.py` Step2D+2E。
SignalIntegrator L2扩展至15维: +14 VIX恐慌指数 +15 市场情绪(涨跌比/融资买入)。
新增 `src/data/sector_fundamentals.py` — 东财 push2 板块行情(t:2)和资金流(t:3)采集。
建表 `sector_fundamentals`(PE/PB/ROE/营收/净利/毛利率/换手率/量比/涨跌家数)、`sector_capital_flow`(主力/超大单/大单净占比)、`sector_valuation`(ERP=1/PE-CN10Y)。
集成进 `data_scheduler.py` Step2B(原Step3-5后移一步)。
SignalIntegrator L2扩展至13维: +12基本面偏离(PE z-score+利润增速+ROE) +13主力资金方向(超大单+主力净占比)。

### 修复: signal_pusher.py — 集中度预警数据源从老组合改为星环
旧: `position_diagnosis.json`（含8个老组合101只基金）→ 集中度预警来自老数据
新: `user-portfolio.db holdings WHERE portfolio_id=9 AND amount>0` → 实时计算星环组合集中度

持仓重叠预警对整个星环组合无意义（单一托管组合），已移除。

### 修复: decision_matrix.py — 不再加载废弃的 position_diagnosis.json
旧: 加载 position_diagnosis.json（含101只老基金数据）→ 虽未被引用，但存在污染风险
新: 直接设置为空字典 `{"diagnoses": []}`
- `get_best_etf()` → `get_best_otc_fund()`: WHERE从 `LIKE '5%' OR '1%'` 改为 `NOT (LIKE '5%' OR LIKE '159%')`, 并LEFT JOIN过滤`closed`申购状态
- 强制场外覆盖：无论operations_log中是否有代码，都优先查场外替代
- 9个缺失赛道补了7个（INSERT 7条），2个无场外标记为不可投
- 申购状态巡检: `src/data/fund_purchase.py`，每天16:30 cron刷新星环组合+待执行建议的申购状态
- 申购状态表: `fund_purchase_status(code, status, daily_limit, fund_type)`
- 费率评分: `src/data/fund_fees.py`，从天天基金f10页面爬管理费/托管费/销售服务费，get_best_otc_fund()中加权评分(score×0.7 + fee_efficiency×0.3)
- 盘中复核改为OTC版: 不检查单ETF触发价，改为监测4大指数极端波动(±3%→🔴 ±2%→🟢)

## 完整数据链（数据→星环决策→回测飞轮）

### 数据→决策链路
```
实时数据(17源)→表(49张)→行业雷达(74行业)→五层信号融合(L1-L5)
→决策矩阵(9情景)→operations_log→星环操作建议(资产配置过滤器+BL/GMO)
→star_ring_advice表→Streamlit展示→用户确认建仓
```

### 回测复盘飞轮（OPC认知复利闭环）
```
每日L1快照(decision_snapshots)→月度L2结果回归(win/loss+因子归因)
→季度L3反模式检测(anti_patterns+cognition_patches)
→贝叶斯信号源更新(bayesian_updater,21源精度追踪)
→SignalIntegrator权重/阈值更新→下一轮决策精度提升
```
飞轮转速 = 认知补丁数/总决策数 × 100%
