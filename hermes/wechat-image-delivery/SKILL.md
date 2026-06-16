---
name: wechat-image-delivery
description: WeChat 微信图片/媒体文件发送——使用 send_message + MEDIA 标签通过 CDN 上传并显示在聊天中
version: 2.0.0
author: Hermes Agent
metadata:
  hermes:
    tags: [wechat, weixin, media, image, cdn]
    category: hermes
---

# WeChat 微信图片/媒体文件发送

## ⚠️ 正确方式（已验证）

**不要在普通回复中直接写 MEDIA: 标签**——在微信上会显示为纯文本。

**必须使用 `send_message` 工具**：

```python
send_message(
    target="weixin:o9cq800ue_q1sSQnHyrbHPdADwK4@im.wechat",
    message="MEDIA:/path/to/file.png"
)
```

先用 `send_message(action='list')` 查看可用的 weixin target。

**混合文字和图片**：
```python
send_message(
    target="weixin:...",
    message="这是组合快照：\nMEDIA:/path/to/chart.png"
)
```

支持的文件类型：`.jpg/.jpeg/.png/.webp/.gif`、音频、视频、APK、其他附件。

---

## 🆘 兜底方案：send_weixin_direct（send_message 不可用时）

当 `send_message` 工具未加载（如 WebUI 会话）时，直接调用 weixin adapter 的 `send_weixin_direct`：

```bash
cd /opt/hermes && .venv/bin/python3 /tmp/send_weixin.py
```

脚本模板（`/tmp/send_weixin.py`）：
```python
import asyncio, os, sys
sys.path.insert(0, '/opt/hermes')

# ⚠️ 必须从 .env 加载，不能用 /proc/1/environ（Docker 环境快照可能过期）
with open('/opt/data/.env') as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ[k] = v

os.environ.setdefault('WEIXIN_ACCOUNT_ID', 'b3ecb1999e3d@im.bot')
os.environ.setdefault('WEIXIN_BASE_URL', 'https://ilinkai.weixin.qq.com')
os.environ.setdefault('WEIXIN_CDN_BASE_URL', 'https://novac2c.cdn.weixin.qq.com/c2c')

from gateway.platforms.weixin import send_weixin_direct

async def main():
    extra = {
        'account_id': os.environ['WEIXIN_ACCOUNT_ID'],
        'base_url': os.environ['WEIXIN_BASE_URL'],
        'cdn_base_url': os.environ['WEIXIN_CDN_BASE_URL'],
    }
    result = await send_weixin_direct(
        extra=extra,
        token=os.environ.get('WEIXIN_TOKEN'),
        chat_id='o9cq800ue_q1sSQnHyrbHPdADwK4@im.wechat',
        message='文字说明（可选）',
        media_files=[('/path/to/image.png', False)],
    )
    print(result)

asyncio.run(main())
```

⚠️ chat_id 必须是完整格式 `xxx@im.wechat`，从 `/proc/1/environ` 的 `WEIXIN_HOME_CHANNEL` 获取。

---

## 发送前检查

weixin.py 的 `send_image_file` 补丁重启后可能丢失，先验证：

```bash
grep "image_path.*Optional" /opt/hermes/gateway/platforms/weixin.py
```

如果没找到，打补丁：

```python
patch(path='/opt/hermes/gateway/platforms/weixin.py',
    old_string='path: str,\n        caption: str = "",\n        reply_to: Optional[str] = None,',
    new_string='path: str = "",\n        caption: str = "",\n        image_path: Optional[str] = None,\n        reply_to: Optional[str] = None,')
```

补丁后重启：Docker 中 `kill -9 1`（restart policy 自动重启）。

---

## 🖼️ 截图中文乱码

浏览器截图中文方块 → 安装中文字体：

```bash
apt-get install -y fonts-noto-cjk fonts-wqy-microhei fonts-wqy-zenhei
```

HTML 字体回退：`font-family: 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', 'PingFang SC', sans-serif`

---

## 🧠 DeepSeek 截图

DeepSeek V4 Pro 不支持图片，`browser_vision` 报错 `unknown variant image_url`。但**截图已被捕获**——错误响应中的 `screenshot_path` 就是有效路径。直接用 `send_message` + `MEDIA:<path>` 发送。

---

## 历史修复

根因：`WeixinAdapter.send_image_file()` 参数名是 `path`，但 base.py 调用时传 `image_path=`，关键字不匹配 → TypeError → MEDIA 标签静默丢失。

修复：给 `send_image_file` 添加 `image_path: Optional[str] = None` 参数做 fallback (`actual_path = image_path or path`)。
