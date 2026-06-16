---
name: sector-pepb-tencent-fallback
description: 板块PE/PB数据采集（v2.0降级方案）——push2 API容器内TCP阻断后，改用腾讯jiankuang个股PE/PB取中位数聚合为板块估值。含 fetch_sector_pepb.py 脚本和 sector_fundamentals.py 集成。
version: 2.0.0
---

# 板块PE/PB采集 — 腾讯降级方案

## 背景

东财 `push2.eastmoney.com` 在绿联NAS Docker容器内被TCP层阻断（`RemoteDisconnected`），所有urllib/requests/curl/Playwright尝试均失败。云服务器(百度云BCC 106.12.90.23)也同样被东财反爬系统封锁。

## 方案原理

1. 为每个东财板块(BK代码)预定义5-8只代表个股（按流动性/市值筛选头部标的）
2. 通过腾讯财经 jiankuang API 获取每只个股的PE(TTM)/PB
   - API: `http://web.ifzq.gtimg.cn/appstock/app/stockinfo/jiankuang?code=sh{code}`
   - PE字段: `zyzb.detail.syl`
   - PB字段: `zyzb.detail.sjl`
3. 取板块内个股PE/PB的**中位数**作为板块估值
4. 过滤 PE≤0, PE>500 的异常值

## 关键文件

| 文件 | 说明 |
|------|------|
| `/opt/data/scripts/fetch_sector_pepb.py` | 独立采集脚本，可单独运行(--sector单板块/--output-db写入/--save-cache缓存) |
| `/opt/data/fund-advisor-system/src/data/sector_fundamentals.py` | 集成降级方法 `_fetch_fundamentals_local()`，`run_all()` 自动调用 |
| `SECTOR_STOCKS` 字典 | 板块→个股映射（50板块，~350个股），需季度审视更新 |

## 使用方法

```bash
# 单独测试单板块
python3 /opt/data/scripts/fetch_sector_pepb.py --sector BK0449

# 全量采集写入数据库
python3 /opt/data/scripts/fetch_sector_pepb.py --output-db

# 通过 sector_fundamentals 模块（集成调用）
cd /opt/data/fund-advisor-system && python3 src/data/sector_fundamentals.py --fundamentals-only
```

## 数据验证

运行日志示例：
```
[BK0449] fetching 8 stocks... PE=34.7 PB=3.98     # 电子
[BK0475] fetching 7 stocks... PE=7.2 PB=0.79       # 银行
[BK0477] fetching 7 stocks... PE=19.5 PB=2.42      # 白酒
Completed 50 sectors in 163.8s
Wrote 50 sectors to DB
```

## 注意事项

1. 采集需163秒（50板块×7个股/板块×0.25s延迟），建议只在日终跑一次
2. 个股映射需季度审视，退市/ST股票要替换
3. 此方案仅覆盖PE/PB，不包含ROE、营收YoY等（push2才有的数据）
4. 资金流数据(`m:90+t:3`)同步失效，暂无法替代，`sector_capital_flow` 表无数据写入
5. 腾讯jiankuang API 从NAS可直接访问（HTTP无需特殊headers），云服务器需带User-Agent

## 维护清单

- [ ] 每季度检查个股映射（退市/ST替换）
- [ ] 新建赛道时同步添加SECTOR_STOCKS条目
- [ ] 如push2恢复，可切回原始`fetch_sector_fundamentals()`方法
