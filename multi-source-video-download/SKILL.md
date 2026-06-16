---
name: multi-source-video-download
description: 多源视频/动画下载策略——BT(Knaben)→网盘(4K盘搜)→B站(yt-dlp)三级搜索，含 B站 yt-dlp 格式选择和命名避坑。
category: media
---

# 多源视频下载策略

当用户要下载视频/动画时，按三级策略搜索，优先级：BT → 网盘 → B站。

## 第一级：BT 搜索（Knaben）

```bash
curl -sL --max-time 20 -A "Mozilla/5.0" \
  "https://knaben.eu/search/URL_ENCODED_QUERY"
```

- 用英文名 + 季号（如 `Peppa Pig Season 6`）
- 找 `COMPLETE` / `S01-S04` / `Season X Complete` 等完整季包
- 新季（近年出的）通常只有散集，没有完整包
- **版权严的内容**（如 Peppa Pig）BT 覆盖率极低

### Knaben 限速

搜索间隔至少 5-10 秒，否则 `Connection reset by peer`。同一搜索不要重复请求，缓存首次结果。

## 第二级：网盘搜索

### 4K盘搜 (4kpan.vip)
```
https://www.4kpan.vip/?q=关键词
```
SPA 网站，需要浏览器工具。搜索后等 3-5 秒加载结果。版权内容通常无索引。

### 搜盘王 (sou.ollvm.cn)
```
https://sou.ollvm.cn/21232f?kw=关键词
```
同样 SPA，从 NAS 可能不可达（DNS 解析失败）。

## 第三级：B站（yt-dlp）

**B站是动画资源最全的渠道**，尤其中文区。

### 搜索
```
https://search.bilibili.com/all?keyword=关键词
```
- 用中文名搜索（如"小猪佩奇第6季英文版"）
- 找用户上传的合集视频（比官方番剧好下）
- 官方番剧通常需要大会员

### ⚠️ yt-dlp 关键避坑

**1. 格式选择**
```bash
# ❌ 错误：B站免费用户没有合并格式
-f "best[height<=480]"

# ✅ 正确：分开选视频流+音频流
-f "bestvideo[height<=480]+bestaudio/best"
```

**2. 免费最高画质**
- 免费：638×360 / 852×480
- 720p/1080p 需要 B站大会员 + cookies

**3. 播放列表命名**
```bash
# ❌ 错误：固定文件名 → 全部覆盖，只剩最后一个
-o "S10.%(ext)s"

# ✅ 正确：含播放列表序号
-o "S10/%(playlist_index)03d.%(ext)s"
```

**4. 完整命令**
```bash
yt-dlp --no-check-certificate \
  -f "bestvideo[height<=480]+bestaudio/best" \
  -o "/path/S01-S09/%(playlist_index)03d.%(ext)s" \
  "https://www.bilibili.com/video/BV1Fbx8zKExv/"
```

## 实际案例：Peppa Pig 全集

| 来源 | 结果 |
|------|------|
| BT Knaben | S01-S05 有包（慢）、S06 散集、S07-S11 无 |
| 4K盘搜 | 无（版权内容） |
| 搜盘王 | 不可达 |
| Rutracker | 无 |
| **B站** | ✅ S01-S12 全齐！2.3GB |

结论：对于热门动画，B站是最可靠的源，BT/网盘是备选。

## ⚠️ 常见陷阱

### B站 "百度网盘下载" 标题陷阱
很多 B站视频标题含「百度网盘下载」「网盘分享」但实际是**引流预览**，描述里没有真实链接。验证方法：
```bash
curl -sL -A "Mozilla/5.0" \
  "https://api.bilibili.com/x/web-interface/view?bvid=BVxxxxxx" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['desc'])"
```
如果 desc 不含 `pan.baidu.com` 或 `链接`，则是假资源，直接跳过。

### RuTracker "Dub + Original" 双音轨
RuTracker 标记 `Dub + Original` 的资源**含英语原声音轨**，不是纯俄语。用户可能误以为只有俄语——播放时切音轨即可（VLC: 音频→音轨2，MX Player: 音符图标）。`Original + Sub (Eng)` 还带英文字幕，对学英语的孩子更友好。

## 第四级：国内视频平台（爱奇艺/腾讯/优酷）

**⚠️ 爱奇艺不可下载！** 使用 Widevine DRM 加密，yt-dlp 提取器已失效，lux/you-get 均无法解密。即使下载到也是 `.qsv` 加密格式，仅爱奇艺客户端能播放。

其他国内平台（腾讯视频、优酷）类似，均有 DRM 保护。不要浪费时间尝试——直接告诉用户不可行。

### 爱奇艺可作为「存在确认」
如果用户在爱奇艺上找到资源，说明该内容有正版引进。可以此作为线索去 BT/网盘搜对应的英文资源名。

## 实际案例

### Rubble & Crew（汪汪队之小砾与工程家族）
| 来源 | 结果 |
|------|------|
| Knaben BT | ✅ RuTracker S1-S3 1080p（Dub+Original 双音轨） |
| 4K盘搜 | ❌ 无 |
| B站 | ⚠️ 预览视频标题含"百度网盘下载"但描述无链接（引流） |
| 爱奇艺 | ⚠️ 有英文版 S1-S2，但 **DRM 无法下载** |

### Peppa Pig 全集
| 来源 | 结果 |
|------|------|
| BT Knaben | S01-S05 有包（慢）、S06 散集、S07-S11 无 |
| 4K盘搜 | 无（版权内容） |
| 搜盘王 | 不可达 |
| Rutracker | 无 |
| **B站** | ✅ S01-S12 全齐！2.3GB |

结论：对于热门动画，B站是最可靠的源，BT/网盘是备选。爱奇艺只能看不能下。

## BT vs B站 画质取舍

- B站免费最高 480p（852×480），快速稳定
- BT 可下 720p/1080p，但速度慢（做种少）
- 策略：B站先下快速可用版，BT 后台挂高清备份
