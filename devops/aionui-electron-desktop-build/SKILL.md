---
name: aionui-electron-desktop-build
description: 构建 AionUi Electron 桌面端（Windows 便携版 exe），含本地代理架构、静态资源打包、electron-builder 在 NAS 容器环境的兼容性问题与解决方案
category: devops
---

# AionUi Electron Desktop 构建指南

为 AionUi WebUI 构建 Windows Electron 桌面端应用。

## 架构（v1.1.1 代理模式）

不等同于简单 WebView 壳。采用**本地 HTTP 代理**架构：

- 静态资源（index.html + assets + PWA）本地缓存，启动即加载
- API 路径（`/api/`、`/login`、`/logout`、`/ws`）走 `http-proxy` 代理到 NAS 上的 AionUi
- WebSocket 连接也走代理（`server.on('upgrade')`）
- 优点：静态资源离线加载快，只有 API 请求走 Tailscale 网络

## 项目位置

- 源码：`/opt/data/aionui-electron/`
- 构建产物：`/opt/data/aionui-electron/dist/AionUi-{version}.exe`

## 构建流程

### 1. 更新静态资源

每次 AionUi 版本升级后，需要同步静态文件：

```bash
cp -r /opt/data/aionui-web-standalone/static /opt/data/aionui-electron/
```

### 2. 确认 Tailscale 地址

编辑 `main.js`，确认 `REMOTE_TARGET` 是当前 NAS 的 Tailscale IP：

```js
const REMOTE_TARGET = 'http://100.107.124.78:25808';
```

### 3. 构建

```bash
cd /opt/data/aionui-electron && rm -rf dist
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm run build:win
```

## ⚠️ 关键配置要点

### 静态资源路径（v1.1.1 修复）

`extraResources` 将 `static/` 目录复制到 `resources/static/`（asar 外部），代码中用 `process.resourcesPath` 引用：

```js
const STATIC_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'static')
  : '/opt/data/aionui-web-standalone/static';
```

package.json 配置：
```json
"extraResources": [{ "from": "static", "to": "static" }],
"files": ["main.js", "package.json", "node_modules/**/*"]
```

**常见错误**：`static/` 没打入 asar → 应用启动后白屏。

### electron-builder 在容器环境的兼容性

此 NAS 是 Linux 容器环境（无 systemd、无 Wine），构建 Windows 目标时：

1. **签名步骤必跳**：设置 `"signAndEditExecutable": false` 和 `"forceCodeSigning": false`
2. **NSIS 打包失败属正常**：`app-builder` 二进制在此环境偶发 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`。windows-unpacked 生成成功即表示构建正确，跳过 NSIS 打包不影响便携版
3. **Electron 下载走镜像**：`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"` 否则超时
4. **dependencies 需手动声明**：如 `http-proxy` 必须写在 dependencies 而非 devDependencies

### 版本号

每次构建递增 patch 版本（如 1.1.0 → 1.1.1），便于区分。

## 验证清单

构建完成后验证：

```bash
# 检查静态资源是否打入
ls /opt/data/aionui-electron/dist/win-unpacked/resources/static/

# 检查 main.js 中地址
cd dist && npx asar extract-file win-unpacked/resources/app.asar main.js
grep REMOTE_TARGET main.js

# 检查文件大小
ls -lh dist/AionUi-*.exe
```

## 依赖

- Node.js v20+
- npm（npmmirror 镜像加速）
- `/opt/data/aionui-web-standalone/static/`（AionUi 前端静态文件）
