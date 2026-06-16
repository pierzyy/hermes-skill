---
name: ugreen-nas-share-transfer
description: 从绿联NAS分享链接直接转存文件到本地，支持密码验证和文件夹递归下载
category: devops
---

# 绿联NAS分享链接转存

## 触发条件
需要从 UGREEN NAS 分享链接（`ugnas-xxx.cn44.ug.link/filemgr/share-download/?id=...`）下载文件到本地时使用。

## 流程

### 1. 获取分享内容列表
先验证提取码，获取文件/文件夹列表：

```bash
curl -s -c /tmp/ug_cookies.txt -X POST '{BASE}/ugreen/v1/filemgr/externalVerifySharePassword' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Content-Type: application/json' \
  -H 'X-Specify-Language: en-US' \
  -H 'UG-Agent: PC/WEB' \
  -H 'Origin: {BASE}' \
  -H 'Referer: {BASE}/filemgr/share-download/?id={SHARE_ID}' \
  --data-raw '{"share_id":"{SHARE_ID}","password":"{PASSWORD}","no_count":false}'
```

响应中的 `data.file_info[].path` 和 `data.file_info[].name` 是文件路径和名称。

### 2. 创建下载任务
用第一步获取的 cookie 文件，提交要下载的路径列表：

```bash
curl -s -b /tmp/ug_cookies.txt -X POST '{BASE}/ugreen/v1/filemgr/addPathsByShareId' \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'Content-Type: application/json' \
  -H 'X-Specify-Language: en-US' \
  -H 'UG-Agent: PC/WEB' \
  -H 'Origin: {BASE}' \
  -H 'Referer: {BASE}/filemgr/share-download/?id={SHARE_ID}' \
  --data-raw '{"paths":["{PATH1}","{PATH2}"],"share_id":"{SHARE_ID}"}'
```

响应中的 `data.result` 即为 `TASK_ID`。

### 3. 下载文件
```bash
curl -L -o "{OUTPUT_FILE}" \
  -b /tmp/ug_cookies.txt \
  -H 'Accept: application/json, text/plain, */*' \
  -H 'X-Specify-Language: en-US' \
  -H 'UG-Agent: PC/WEB' \
  -H 'Origin: {BASE}' \
  -H 'Referer: {BASE}/filemgr/share-download/?id={SHARE_ID}' \
  "{BASE}/ugreen/v1/filemgr/shareDownloadFile?coding=true&share_id={SHARE_ID}&password={PASSWORD}&task_id={TASK_ID}"
```

## 关键 Headers（缺一不可）
- `Accept: application/json, text/plain, */*` — **必须包含 text/plain 和 */***
- `UG-Agent: PC/WEB` — 绿联要求的自定义 UA
- `Origin` 和 `Referer` — 服务端会校验
- Cookie 必须从第一步获取并复用（`-c` 写入 / `-b` 读取）

## 注意事项
- JSON body 不要有多余空格，中文路径直接写 UTF-8
- 大文件使用 `background=true` + `notify_on_complete=true`
- 文件夹会被自动打包成 ZIP 下载
- task_id 是单次有效的，重复使用会 404
