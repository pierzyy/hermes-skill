---
name: website-migration-diagnosis
description: 诊断爬虫/监控脚本突然失效的原因——系统性地判断是网站迁移、接口变更还是临时故障。从端口探测到旧路径存活度检查，最后确定新入口。
version: 1.0.0
---

# 网站迁移/改版诊断

当爬虫/监控脚本突然失效时（如 HTTP 404、图片拉不到、验证码无法识别），系统性地判断是否网站已迁移或改版。

## 诊断步骤

### 1. 确认症状范围

直接复现失败场景，看具体错误：

```bash
# 手动执行脚本，看完整输出
python3 /path/to/script.py
```

常见错误类型：
- `cannot identify image file` → 验证码图片拉不到（路径变了或接口移了）
- `Connection refused` / `timeout` → 服务器本身挂了
- `404` → 路径被删或迁移
- 返回空 HTML 但状态码 200 → 可能需要 Cookie/Session，或页面已改版

### 2. 探测目标服务器存活

```python
import socket
for port in [80, 443, 8080, 8443]:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(5)
    try:
        s.connect(('目标IP', port))
        print(f'{port}: OPEN')
    except Exception as e:
        print(f'{port}: {e}')
    finally:
        s.close()
```

### 3. 扫描旧路径存活度

```bash
for path in /old/path /old/path/page.jsp /old/path/api /; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 8 "http://IP:PORT$path")
  echo "$path => $code"
done
```

关注：
- **404** → 路径被删/迁移
- **200但内容为空或巨变** → 页面改版
- **000** → 连接失败/域名无法解析
- **301/302** → 有重定向，可能指向新站点

### 4. 检查根路径响应内容

```bash
curl -s --max-time 10 'http://IP:PORT/' | head -50
```

根路径内容往往暗示站点现状：
- 显示新品牌名 → 网站已升级
- 空白 → 可能是内网应用，或需要特定 Host Header
- 跳转到别处 → 域名迁移

### 5. 浏览器辅助验证

对于 SPA 或需要 JS 渲染的页面，用 `browser_navigate` 确认：
- `browser_console` 查看 `document.body.innerText` 获取渲染后内容
- 对比状态码和实际渲染结果（有时状态码 200 但内容为空）

### 6. 搜索新入口

如发现网站品牌/名称变更（如"额度流转→车信盟"），浏览器尝试导航至品牌相关域名：
- 常用域名模式：`www.品牌名.cn`、`品牌名.sh.cn`、`品牌名.gov.cn`
- 或尝试 DNS 查询确认域名是否存活

### 7. 结论判定

| 现象 | 判定 | 行动 |
|------|------|------|
| 全路径 404 + 根目录新内容 | **网站已迁移/改版** | 通知用户，等新地址 |
| 500/503/超时 | **服务器故障** | 重试+等待恢复 |
| 部分路径 404，其他正常 | **局部接口变更** | 找新接口路径 |
| 不通但 DNS 正常 | **IP/域名变更** | 查 DNS 记录 |

## 陷阱

- **不要只测一个端口**——有些站点同时开 80 和 8080，但一个正常一个废弃
- **不要只看状态码**——200 但空 body 也是异常
- **不要忽略 HTTP vs HTTPS**——有些站只支持 HTTPS
- **IP 端口通不代表服务可用**——可能只是个反向代理/防火墙在响应
