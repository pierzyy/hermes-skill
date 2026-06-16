---
name: fund-report-pipeline-v2
description: 基金日报 Pro+Flash 分解管线。v3.0 废弃微信图片，纯数据库输出。启用后用 cron prompt 执行脚本即可。
category: data-science
---

# 基金日报分解管线 v3.0

## 架构（2026-06-06 v3.0：废弃微信图片 → 纯数据库输出）

```
Cron 14:05 触发
  └─▶ agent 执行 python3 fund_report_pipeline.py --from-fm --no-render
        ├─ Phase 0: Pro (deepseek-v4-pro) → 规划 (15s)
        ├─ Phase 1: Python 并行HTTP → 数据采集 (37s)
        ├─ Phase 1.5: Python 预评分 → 行业基线 (0.02s, 零LLM)
        ├─ Phase 1.6: Python 基金级技术评分 (零LLM)
        ├─ Phase 1.7: Python 基金级风险评分 (零LLM)
        ├─ Phase 2a: Pro → 行业研判 (基于基线±2分调整)
        ├─ Phase 2b: Pro → 操作建议 + 完整日报JSON
        ├─ 📤 save_to_db() → POST /api/reports → SQLite (0.5s)
        └─ ⏭️ Phase 3: 跳过（--no-render）
```

**总耗时: ~2min30s**（vs 旧版含图片渲染 ~4min45s, 节省 ~47%）

**输出方式**：
- 数据库：FastAPI+SQLite → `/api/reports` → APK(`/`) / PC网页(`/history`, `/analysis`)
- 微信图片：**已废弃**（2026-06-06），不再生成 PNG 或发送 MEDIA

## 脚本位置
`/opt/data/scripts/fund_report_pipeline.py`
`/opt/data/scripts/fund_industry_prescore.py`  ← Phase 1.5 预评分模块

## CLI 用法
```bash
# 生产模式（仅写数据库，不渲染图片）
python3 /opt/data/scripts/fund_report_pipeline.py --from-fm --no-render

# 手动模式（含图片渲染，调试用）
python3 /opt/data/scripts/fund_report_pipeline.py --csv /path/to.csv --output /tmp/report.png
```

## Cron 配置
job_id: 54c111fb8b40
- model: deepseek-v4-flash
- provider: opencode-go
- prompt: "运行 pipeline --no-render，成功→[SILENT]，失败→报告错误"
- 已废弃 MEDIA 图片发送

## 预采缓存
job_id: 7d9d7bad5c7b (13:30)
- 脚本: `/opt/data/scripts/fund_precache.py`
- 缓存文件: `/tmp/fund_cache_status.json`, `/tmp/fund_cache_market.json`, `/tmp/fund_cache_north.json`
- TTL: 30分钟（Phase 1 读取时检测 freshness）

## 数据库 API（25600端口）
- `POST /api/reports` — 写入日报（管线 `save_to_db()` 自动调用）
- `GET /api/reports/latest` — 获取最新日报 JSON
- `GET /api/reports/history` — 获取历史列表
- 服务: `/opt/data/daily_report/server.py` (FastAPI+SQLite)
- FRP隧道: `106.12.90.23:25600`

## 重试机制（2026-06-04 新增）
- `_fetch_with_retry()` — 通用重试工具，requests 版（pipeline）和 urllib 版（precache）
- 所有 HTTP 采集函数：**最多重试 2 次**，间隔 3s/6s（递增）
- 重试覆盖：基金状态检查、fundgz 实时估值、Sina 大盘指数、Sina 汇率
- precache 的 Sina 批量失败后有个体回退逻辑作为额外容错

## 未采集到标注（2026-06-04 新增）
- Phase 1 跟踪：`status_failed`、`indices_failed`/`fx_failed`
- Phase 2 上下文传入 `fetch_errors` 字段
- Flash 模型被要求在 `alerts` 中添加 `⚠️ 数据采集异常` 条目

## 已知陷阱
1. Flash 有时返回空内容（opencode-go 路由不稳）→ call_llm 已有空内容重试
2. Phase 2a 失败时自动用 baseline 兜底评分（无需人工干预）
3. Phase 2b 使用 portfolio_funds 而非自行编造基金列表
4. Phase 1 基金巡检已改为全部基金并发（不限30只），用 ThreadPoolExecutor 并行化
5. Phase 2a/2b 超时各 120s（比旧 180s 更严格），失败自动降级

## Phase 1.5: Python 预评分（2026-06-04）

### 设计目标
用纯 Python 计算（零 LLM token）为 38 个行业提供定量基线分数，解决 Phase 2 LLM 一次处理太多行业导致评分压缩的问题。

### 五个评分维度
| 维度 | 权重 | 数据来源 | 说明 |
|------|------|---------|------|
| 指数动量 | 30% | Sina 大盘指数 | 行业对应指数的涨跌 → 0-10 映射 |
| 持仓加权涨跌 | 30% | fundgz 实时估值 | 按持有金额加权平均涨跌幅 |
| 估值分位 | 20% | 预采缓存 PE/PB | 目前用默认 5.0（待预采采集PE数据后启用） |
| 北向资金 | 10% | 东方财富北向 | 净流入→偏多, 净流出→偏空 |
| 用户配置偏向 | 10% | CSV 持仓 | 超配→扣分, 合理→6分 |

### 行业→指数映射
22 个行业有直接指数映射（A股14 + 港股6 + 商品2），16 个靠 fundgz 持仓数据驱动。

### LLM 交互方式
基线分数通过 `baseline_scores` 字段传入 Phase 2 context。LLM 不再是「从零打分」，而是「审查基线 → ±2 分微调」，引导它引用数据维度做理由而非泛化套话。

## Phase 2 两步走（2026-06-04 v2.1）

### 问题
v2.0 的 Phase 2 用单次 Pro 调用同时做行业研判 + 操作建议 + JSON 组装，导致注意力稀释、评分压缩、理由泛化。

### 方案
```
Phase 2a: 行业研判 (Pro)
  专注 38 行业评分 → 输入基线 + 市场数据 → 输出 score/tag/reason 数组
  兜底: 如果 API 失败，直接用 baseline 的 auto_tag

Phase 2b: 操作建议 (Pro)  
  专注操作建议 + JSON 组装 → 输入 Phase 2a 评分 + 持仓数据
  不重新评分，只基于已有评分做组合级和基金级操作
```

### 改进点
- Phase 2a prompt 精简到 ~250 字（vs 旧 ~800 字），认知负荷大幅降低
- Phase 2b 不再需要「同时担心评分和操作」，只专注后者
- 每步独立超时 120s（vs 旧 180s），失败隔离更好
- industries 评分在 2a→2b 之间不丢失（兜底机制）
