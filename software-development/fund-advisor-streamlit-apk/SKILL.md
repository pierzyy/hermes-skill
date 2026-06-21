---
name: fund-advisor-streamlit-apk
description: 基金投顾系统 Streamlit 移动端 + APK 全链路部署。Streamlit 在 NAS:8501 → FastAPI 反向代理(含WebSocket)在 25600 → FRP 公网映射。APK 用 apktool 解包模板修改构建，区别于 Gradle 项目。
version: 1.0.0
---

# 基金投顾系统 Streamlit + APK 部署

## 架构

```
手机 APK / 浏览器
  → http://106.12.90.23:25601/advisor/
  → FRP (fundadvisor 隧道, TCP, remotePort=25601→localIP=127.0.0.1:8501)
  → NAS 端口 8501 → Streamlit (:8501)
```

> **已废弃**：旧的 FastAPI 反向代理（25600→8501）不再用于 Streamlit。FRP 直连 Streamlit 8501 端口，路径 `/advisor/` 由 Streamlit 自身 `server.baseUrlPath` 处理。

## 组件

| 组件 | 位置 | 端口 |
|------|------|------|
| Streamlit 应用 | `/opt/data/fund-advisor/src/streamlit_app.py` | 8501 |
| 组合管理数据库 | `/opt/data/fund-advisor/user-portfolio.db` | - |
| 主数据库 | `/opt/data/fund-advisor/fund_advisor.db` | - |
| APK 文件 | `/opt/data/fund-advisor-system/FundAdvisorView.apk` | - |
| FRP 配置 | `/opt/data/frp/frpc.toml` (fundadvisor 隧道) | 25601→8501 |

> **注意**：组合管理已从 FastAPI iframe 嵌入切换为 Streamlit 原生实现，直连 `user-portfolio.db`。不再需要 FastAPI 反向代理（25600 仅用于日报 API）。

## 启动

> ⚠️ **必须用后台模式**：Streamlit 是常驻服务器，用 `terminal(background=true)` 启动否则会话阻塞卡死。

### Streamlit
```bash
cd /opt/data/fund-advisor-system
.venv/bin/streamlit run streamlit_app.py \
  --server.port=8501 --server.address=0.0.0.0 \
  --server.baseUrlPath=/advisor \
  --browser.gatherUsageStats=false
```

> `server.baseUrlPath=/advisor` 使 Streamlit 内部路径全部以 `/advisor/` 为前缀，与 FRP 公网路径一致。

## 反向代理配置（server.py）

在 `/opt/data/daily_report/server.py` 中需要配置两块：

### 1. HTTP 代理（路径重写 + HTML 注入）
```python
STREAMLIT_BASE = "http://127.0.0.1:8501"

@app.api_route("/advisor", methods=["GET", "HEAD"])
@app.api_route("/advisor/{path:path}", methods=["GET", "HEAD", "POST", "PUT"])
async def proxy_advisor(path: str = "", request: Request = None):
    target = f"{STREAMLIT_BASE}/{path}" if path else f"{STREAMLIT_BASE}/"
    # 转发 query params
    query = str(request.query_params)
    if query: target += f"?{query}"
    # 转发 headers
    headers = dict(request.headers)
    headers.pop("host", None)
    try:
        body = await request.body() if request.method in ("POST", "PUT") else None
        resp = http_requests.request(
            method=request.method, url=target, headers=headers,
            data=body, stream=True, timeout=60,
        )
        content_type = resp.headers.get("content-type", "")
        # 重写 HTML 中的 _stcore 路径
        if "text/html" in content_type:
            html = resp.content
            html = html.replace(b'"/_stcore/', b'"/advisor/_stcore/')
            html = html.replace(b'="./', b'="/advisor/')
            return HTMLResponse(html, status_code=resp.status_code)
        return StreamingResponse(
            resp.iter_content(chunk_size=8192),
            status_code=resp.status_code, media_type=content_type,
        )
    except Exception as e:
        return HTMLResponse(f"<html>...502...</html>", status_code=502)
```

### 2. WebSocket 代理（Streamlit 实时通信必需）
```python
from fastapi import WebSocket, WebSocketDisconnect
import asyncio
import websockets as ws_lib

@app.websocket("/advisor/_stcore/{path:path}")
async def ws_proxy_advisor(websocket: WebSocket, path: str):
    raw_protos = websocket.headers.get("sec-websocket-protocol", "")
    subprotocols = [s.strip() for s in raw_protos.split(",") if s.strip()]
    target_ws_url = f"ws://127.0.0.1:8501/_stcore/{path}"
    try:
        async with ws_lib.connect(target_ws_url, subprotocols=subprotocols or None) as target_ws:
            negotiated = target_ws.subprotocol
            if negotiated:
                await websocket.accept(subprotocol=negotiated)
            else:
                await websocket.accept()
            # 双向转发
            async def to_client():
                async for msg in target_ws:
                    if isinstance(msg, bytes):
                        await websocket.send_bytes(msg)
                    else:
                        await websocket.send_text(msg)
            async def to_server():
                while True:
                    msg = await websocket.receive()
                    if msg.get("type") == "websocket.disconnect":
                        break
                    if msg.get("type") == "websocket.send":
                        data = msg.get("bytes", msg.get("text", ""))
                        if isinstance(data, bytes):
                            await target_ws.send(data)
                        else:
                            await target_ws.send(data)
            await asyncio.gather(to_client(), to_server())
    except Exception as e:
        try:
            await websocket.close(code=1011)
        except:
            pass
```

## APK 构建（apktool 方式）

Fund Advisor APK 用 apktool 解包 → 修改 → 重打包方式构建，而非 Gradle 编译。

### 构建步骤

1. **解包模板**：apktool d 一个已有 WebView 壳 APK
2. **改 AndroidManifest.xml**：
   - package → `com.hermes.fundadvisor`
   - android:icon → `@mipmap/ic_launcher`
   - 添加 INTERNET 权限 + `usesCleartextTraffic="true"`
   - 移除无用 activity/service
3. **改 MainActivity**（纯 Activity，非 AppCompatActivity）：
   ```kotlin
   // smali/com/hermes/fundadvisor/MainActivity.smali
   // URL: http://106.12.90.23:25600/advisor
   // WebView 配置：jsEnabled, domStorage, mixedContent
   // 无 XML layout，直接 setContentView(webView)
   ```
4. **替换图标**：在 res/mipmap-* 目录放入 ic_launcher.png（各密度对应 48/72/96/144/192px）
5. **重打包**：
   ```bash
   java -jar /path/to/apktool.jar b FundAdvisor/ -o FundAdvisorView.apk
   ```
6. **对齐 + 签名**：
   ```bash
   zipalign -p 4 FundAdvisorView.apk FundAdvisorView.aligned.apk
   apksigner sign --ks /path/to/keystore --ks-pass pass:android \
     --ks-key-alias alias_name FundAdvisorView.aligned.apk
   ```

### 关键坑点

- **不要用 AppCompatActivity**：纯 `android.app.Activity`，否则缺 theme 崩溃
- **图标必须全密度覆盖**：mdpi/48, hdpi/72, xhdpi/96, xxhdpi/144, xxxhdpi/192
- **签名用 v1 + v2 scheme**：apksigner 默认全签
- **包名不要冲突**：com.hermes.fundadvisor 与 FundMonitor 的 com.fundmonitor 无冲突
- **URL 末尾不要加斜杠**：loadUrl("http://xxx/advisor") — 不能是 "/advisor/"
- **APK 约 1.5MB**（纯壳，无 html/js 资源）

## 数据文件

| 文件 | 说明 |
|------|------|
| `fund_advisor.db` | SQLite 主数据库（6.9MB，含 funds, fund_details, market_snapshot 等表） |
| `user-portfolio.db` | 组合管理数据库，直连 Streamlit 组合管理页 |
| `position_diagnosis.json` | 持仓诊断结果（52 条） |
| `sector_baseline.json` | 行业基线评分（74 行业） |
| `sector_data.json` | 行业数据 |
| `sector_radar_summary.json` | 行业雷达摘要 |
| `fund_ranking.json` | 基金排名数据 |

## 组合管理（Streamlit 原生）

组合管理页不再通过 iframe 嵌入 FastAPI，改为 Streamlit 原生实现，直连 `user-portfolio.db`。
核心函数从 `portfolio_api.py` 移植到 `streamlit_app.py`：

| 函数 | 说明 |
|------|------|
| `pad_fund_code()` | 基金代码补全（6位） |
| `fetch_fundgz()` | 天天基金实时估值（场外基金） |
| `fetch_f10_nav()` | 东方财富净值拉取（强制 IPv4，15s 超时） |
| `search_funds()` | 基金搜索（从 fund_advisor.db 匹配代码/名称） |
| `refresh_portfolio_nav()` | ThreadPoolExecutor 并发批量刷新净值（支持进度回调） |

组合管理页面功能：全局汇总卡片、组合详情指标、可编辑持仓表格（st.data_editor）、添加/删除基金、编辑持仓金额/成本、净值实时刷新（带进度条）。

## Phase 2b 评分引擎新架构

**方向转变**：从"评基金好坏"→"赛道内工具评分"。引擎2不对基金本身打分，而是在引擎1选出的赛道内，评估基金作为该赛道投资工具的质量。

### 三层架构

**Layer 0**：全市场赛道索引（一次性建库 + 每周增量）
- fund_tags.py Layer A 名称匹配（已有）
- style_regression.py Layer B 净值回归验证（新建）
- 输出表 `fund_sector_map`: code | sector_id | match_method | beta | r_squared

**Layer 1**：赛道内工具评分（引擎2核心）
- 四维评分：纯度(35%) + 跟踪质量(25%) + 可投资性(25%) + 运营健康(15%)
- 同一个基金可以出现在多个赛道，不同赛道内得分不同
- 以 ETF 在所属赛道天然高分，主动基金看实际β暴露

**Layer 2**：引擎对接
- 引擎1输出"当前看好赛道列表"→引擎2自动对列表做评分→返回赛道内排名

### 实施顺序
- Day 1: style_regression.py（风格回归引擎）
- Day 2: build_sector_index.py（全市场赛道索引）
- Day 3: sector_scorer.py（赛道评分引擎）
- Day 4: 对接引擎1联调

## 常见问题

### Python 3.13 PEG 解析器 f-string 引号冲突
- **现象**：修改 streamlit_app.py 后 Streamlit 启动报 Script compilation error，compile() 报错行号与实际根因不符（cascade 错误）
- **根因**：f-string 内嵌套三引号 f-string 时，转义 `\"\"\"` 被 PEG 视为普通字符而非关闭符，导致 f-string 永不关闭
- **修复**：把嵌套的 `f"""...f\"\"\"...\"\"\"..."""` 改为变量分离写法或用不同引号组合
- **验证命令**：`python3.13 -c "compile(open('/opt/data/fund-advisor/streamlit_app.py').read(), 's', 'exec')"` — 编译通过后再重启 Streamlit

## 验证

```bash
# 语法检查（修改代码后必做）
cd /opt/data/fund-advisor
python3.13 -c "compile(open('src/streamlit_app.py').read(), 's', 'exec')"

# 测试 Streamlit 本地
curl http://127.0.0.1:8501/advisor/ && echo " Streamlit OK"

# 测试外部访问（通过 FRP）
curl http://106.12.90.23:25601/advisor/ | head -5

# 测试 JS 资源加载
curl -s -o /dev/null -w "%{http_code}" http://106.12.90.23:25601/advisor/static/js/index.*.js

# 测试 WebSocket
curl -s -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  "http://106.12.90.23:25601/advisor/_stcore/health"
```
