---
name: wechat-remote-download
description: 微信远程下片——用户在微信发「下片/找片 xxx」→ Hermes 搜 Knaben → 返回列表 → 用户选号 → 推送到 qBittorrent → 下完微信通知
category: data-science
---

# 微信远程下片

## 触发
用户在微信发消息包含「下片」「找片」「搜片」关键词。

## 完整流程

### Step 1: 搜索
```
python3 /opt/data/scripts/wechat_movie.py search "用户给的搜索词"
```
返回编号列表。

### Step 2: 用户选择
候选消息格式：
```
🔍 找到 10 个结果：
  [1] Blaze S07E29 School Bus Blaze 1080p
  [2] Blaze S07E26 Valentine Rescue 1080p
  ...
回复「下 1」「下 1,3」「全下」选片
```

### Step 3: 添加到 qBittorrent
用户回复后，解析编号，找到对应 magnet，调用：
```python
python3 -c "
from wechat_movie import add_to_qbit, search_knaben
results = search_knaben('$QUERY')
# 选中的编号
for idx in [1, 3]:
    add_to_qbit(results[idx-1]['magnet'])
"
```

### Step 4: 确认
回复「✅ 已添加 X 个任务到下载队列\n[名称列表]\n下完后会通知你」

### Step 5: 自动通知
Cron 每 10 分钟跑 `python3 /opt/data/scripts/qbit_done_notify.py`，检测到新完成则推微信。

## 搜索技巧
- 英文片名命中率远高于中文
- 加 S01/S02 搜指定季，加 1080p/720p 指定画质
- 儿童动画用英文原名 + COMPLETE 搜全集包

## qBittorrent API 直接操作

当 wechat_movie.py 不可用时，可直接用 API 操控 qBittorrent。

### 认证
```bash
SID=$(curl -s -c - -X POST "http://localhost:8888/api/v2/auth/login" \
  --data "username=admin&password=adminadmin" | grep 'SID' | awk '{print $NF}')
```
之后所有请求带 `-b "SID=$SID"`。注意必须先登录，直接 basic auth 会 403。

### 添加磁力链
```bash
curl -s -b "SID=$SID" -X POST "http://localhost:8888/api/v2/torrents/add" \
  --data-urlencode "urls=MAGNET" -d "savepath=/downloads/Folder"
```
用 `--data-urlencode` 而非 `-d`，磁力链含特殊字符。

### 查询 / 删除
```bash
# 查询
curl -s -b "SID=$SID" "http://localhost:8888/api/v2/torrents/info"

# 删除（不删文件）
curl -s -b "SID=$SID" -X POST "http://localhost:8888/api/v2/torrents/delete" \
  --data "hashes=HASH&deleteFiles=false"
```

### 状态码
- `metaDL` — 解析磁力链元数据中（RuTracker 需等 10-30s，正常）
- `downloading` — 已开始下载
- `stalledUP` / `stoppedUP` — 已完成

### 重复任务处理
返回 `Fails.` 说明种子已存在 → 先查 hash → delete → 重新 add。

## 相关文件
- 搜索/添加脚本: `/opt/data/scripts/wechat_movie.py`
- 完成通知: `/opt/data/scripts/qbit_done_notify.py`
- Cron: `qbit-complete-notify`（每10分钟）
- NAS 本地: `localhost:8888`（admin/adminadmin）
- FRP 公网: `7501` 端口穿透

## 常用下载目录
- 默认: qBittorrent 配置的下载路径
- 如需指定: `savepath="/downloads/Folder"`
