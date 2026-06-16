---
name: qbittorrent-control
description: 通过 Web API 控制本地/NAS 上的 qBittorrent，支持登录、查看、暂停/恢复、删除任务
category: devops
---

# qBittorrent 远程控制

## 默认信息
- **端口**: 8888
- **账号**: admin
- **密码**: adminadmin
- **API 版本**: 2.x（v5.0.0 起部分端点名称变化）

## 流程

### 1. 登录（获取 Cookie）
```bash
curl -s -c /tmp/qbit_cookies.txt -X POST 'http://127.0.0.1:8888/api/v2/auth/login' \
  --data-urlencode 'username=admin' \
  --data-urlencode 'password=adminadmin'
# 成功返回: Ok.
```

所有后续请求必须带 `-b /tmp/qbit_cookies.txt`。

### 2. 查看所有任务
```bash
curl -s -b /tmp/qbit_cookies.txt 'http://127.0.0.1:8888/api/v2/torrents/info' | python3 -c "
import json, sys
for t in json.load(sys.stdin):
    print(f'[{t[\"state\"]}] {t[\"name\"][:60]:60s} | {int(t[\"size\"])/1e9:.1f}GB | {t[\"progress\"]*100:.0f}% | {int(t[\"dlspeed\"])/1e6:.1f}MB/s')
"
```

### 3. 暂停全部任务
```bash
HASHES=$(curl -s -b /tmp/qbit_cookies.txt 'http://127.0.0.1:8888/api/v2/torrents/info' | python3 -c "import json,sys; print('|'.join(t['hash'] for t in json.load(sys.stdin)))")
curl -s -b /tmp/qbit_cookies.txt -X POST 'http://127.0.0.1:8888/api/v2/torrents/stop' \
  --data-urlencode "hashes=$HASHES"
```

### 4. 恢复全部任务
```bash
HASHES=$(curl -s -b /tmp/qbit_cookies.txt 'http://127.0.0.1:8888/api/v2/torrents/info' | python3 -c "import json,sys; print('|'.join(t['hash'] for t in json.load(sys.stdin)))")
curl -s -b /tmp/qbit_cookies.txt -X POST 'http://127.0.0.1:8888/api/v2/torrents/resume' \
  --data-urlencode "hashes=$HASHES"
```

### 5. 暂停/恢复单个任务
```bash
# 暂停（按名称模糊匹配）
HASH=$(curl -s -b /tmp/qbit_cookies.txt 'http://127.0.0.1:8888/api/v2/torrents/info' | python3 -c "import json,sys; [print(t['hash']) for t in json.load(sys.stdin) if '关键词' in t['name']]")
curl -s -b /tmp/qbit_cookies.txt -X POST 'http://127.0.0.1:8888/api/v2/torrents/stop' --data-urlencode "hashes=$HASH"

# 恢复同理，endpoint 换成 resume
```

### 6. 删除任务
```bash
# deleteFiles=true 同时删除文件，false 仅移除任务
HASHES="hash1|hash2"
curl -s -b /tmp/qbit_cookies.txt -X POST 'http://127.0.0.1:8888/api/v2/torrents/delete' \
  --data-urlencode "hashes=$HASHES" \
  --data-urlencode "deleteFiles=false"
```

## v5.0.0 注意事项
- `torrents/pause` → **已移除**，改用 `torrents/stop`
- `torrents/resume` 仍然可用
- hashes 用 `|` 分隔，通过 `--data-urlencode` 传递
- API 版本可通过 `/api/v2/app/webapiVersion` 查询

## 状态对照
| 状态 | 含义 |
|------|------|
| stoppedUP | 已完成，已暂停做种 |
| stoppedDL | 下载中，已暂停 |
| queuedUP | 已完成，排队做种 |
| stalledDL | 下载中但无速度 |
| stalledUP | 做种中但无连接 |
| downloading | 正在下载 |
| uploading | 正在上传 |
