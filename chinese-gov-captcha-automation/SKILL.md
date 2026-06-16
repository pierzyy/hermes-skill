---
name: chinese-gov-captcha-automation
description: 自动化处理中文政府网站的验证码+表单查询 — 适用于 60×38 小尺寸验证码的 OCR 投票法、隐藏表单字段发现、状态监控 cron 模式。
category: data-science
---

# 中文政府网站验证码 + 表单自动化

## 适用场景
中文政府网站通常有：小尺寸验证码（60×38 左右）、隐藏表单字段、表单重载（错误时无提示）。

## OCR 投票法（核心）

60×38 的小尺寸验证码对 Tesseract 不可靠。使用多参数投票：

```python
from collections import Counter
results = Counter()
for psm in [6, 7, 8, 10, 13]:        # 多种 PSM 模式
    for th in [120, 130, 140, 150, 160]:  # 多种阈值
        g = img.convert('L')
        g6 = g.resize((w*6, h*6), Image.LANCZOS)
        g6 = g6.filter(ImageFilter.SHARPEN).filter(ImageFilter.SHARPEN)
        b = g6.point(lambda x: 0 if x < th else 255)
        b = ImageOps.expand(b, border=30, fill=255)
        t = pytesseract.image_to_string(b, config=f'--psm {psm} -c tessedit_char_whitelist=0123456789').strip()
        if len(t) == 4:  # 只接受 4 位结果
            results[t] += 1
captcha = results.most_common(1)[0][0]
```

关键：6x 放大 + 双重锐化 + 多 PSM × 多阈值投票 → 大幅提高准确率。

## 隐藏表单字段

很多中文政府表单的提交按钮不是 `type=submit`，而是 `type=button` + `onclick`。必须：
1. 找到 JS 函数 → 确认所有必填字段
2. 检查 hidden input（如 `<input type="hidden" name="begin_qry" value="">`）
3. 服务端可能要求 `name="开始查询的字段"` = `"true"` 才处理

```javascript
// 浏览器中查看表单提交函数
formSubmitFunction.toString()
```

## 表单提交模板

```python
s = requests.Session()  # 必须用 session 保持 cookie
s.get(form_url, timeout=10)
r2 = s.get(captcha_url, timeout=10)
# OCR 验证码...
r3 = s.post(form_url, data={
    'hidden_action_field': 'true',  # ← 关键！
    'field1': 'value1',
    'check_code': captcha
}, timeout=10)
```

## 状态监控模式

```python
STATE_FILE = '/path/to/state.json'

# 读取上次状态
prev = json.load(open(STATE_FILE)).get('status')

# 查询当前状态
status, text = query_status()

# 保存
json.dump({'status': status, 'time': now}, open(STATE_FILE, 'w'))

# 状态变化时通知
if status != prev and status == 'PASSED':
    print('NOTIFY: 状态已变更')
```

配合 cron 每小时查询，状态变化时触发通知，通过后自动删除任务。

## 网站迁移/下线诊断\n\n政府网站经常升级迁移，监控突然失效时的系统性排查流程：\n\n### 1. 端口连通性检测\n```python\nimport socket\nfor port in [80, 443, 8080]:\n    s = socket.socket()\n    s.settimeout(5)\n    s.connect(('target_ip', port))\n    s.close()\n```\n\n### 2. HTTP 状态码探测\n所有可能的路径都要测，不仅限于已知路径：\n```bash\nfor path in / /oldpath /newpath /api /login /query; do\n  curl -s -o /dev/null -w '%{http_code}' --connect-timeout 5 \"http://ip:port$path\"\ndone\n```\n关键：不等于 404 的路径就是线索。302 ≠ 404，值得跟进。\n\n### 3. 分析当前存活页面的内容\n浏览器渲染后再检查：\n```javascript\n// 在浏览器 console 执行\ndocument.body.innerText  // 获取可见文本（自动解码乱码）\ndocument.documentElement.outerHTML  // 原始 HTML\n```\n注意编码：政府站经常用 GB2312，curl 后需 `iconv -f gb2312 -t utf-8`。\n\n### 4. 识别 SPA 单页应用\n政府新站很多是 SPA（单页面应用）。特征：\n- 导航点击是 `$(...).animate({scrollTop: ...})` 而不是页面跳转\n- 没有独立 URL 对应各栏目（如 `#公共服务` 只是锚点）\n- 页面底部出现 **"Android / iOS"** 和 **"扫码关注"** → 核心功能已迁移到 App/小程序\n\n### 5. 源码挖掘隐藏链接\n```bash\ncurl -s page_url | iconv -f gb2312 -t utf-8 | grep -iE '额度|凭证|查询|transfer|quota'\n```\n首页上的大图可能隐藏着详情页链接（`artid=N` 参数），通过 `detail.jsp?artid=N&colid=M` 查看。\n\n### 6. 结论判断\n| 现象 | 结论 |\n|------|------|\n| 全路径 404 | 系统已下线 |\n| 欢迎页/公司介绍页 | 网站展示型，功能不在网页 |\n| "扫码关注" + Android/iOS 图标 | 功能迁移到 App/小程序 |\n| 原 IP 只剩静态页面 | 后端服务已停（8080 端口死，80 端口活着但只是静态页）|\n\n## 常见陷阱

| 陷阱 | 现象 | 修复 |
|------|------|------|
| 隐藏字段未设 | 表单提交后原样重载 | 检查 onclick 函数设置的所有字段 |
| Cookie 丢失 | 验证码总是错误 | 使用 `requests.Session()` |
| 验证码过期 | 第二次提交失败 | 每次重新 GET 页面获取新验证码 |
| PSM 单一 | OCR 50% 失败 | 多 PSM × 多阈值投票 |
