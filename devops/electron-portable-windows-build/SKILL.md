---
name: electron-portable-windows-build
description: 在 Linux（容器/NAS）上为 Windows 构建 Electron 便携版应用。当 electron-builder 在容器环境失败时（ERR_ELECTRON_BUILDER_CANNOT_EXECUTE），使用手动打包方案。
category: devops
---

# Electron 便携版 Windows 构建（Linux → Windows 交叉打包）

## 适用场景

在 Linux 容器/NAS 环境（无 systemd、无 Wine）上构建 Windows Electron 桌面应用。

## 两种路线

### 路线 A：electron-builder（优先尝试）

```bash
mkdir project && cd project
npm init -y
npm install --save-dev electron electron-builder
```

#### ⚡ 加速：如果用官方源 npm install 超时，先清缓存再换镜像

```bash
rm -rf node_modules package-lock.json
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install
# 约 23s 完成 404 packages（vs 官方源 300s 超时）
```

`package.json` 需关闭签名：

```json
{
  "build": {
    "win": {
      "target": "portable",
      "signAndEditExecutable": false,
      "sign": null
    },
    "forceCodeSigning": false
  }
}
```

**构建时也要设 ELECTRON_MIRROR**（下载 Windows Electron 二进制用）：

```bash
ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm run build:win
```

### 路线 B：手动打包（electron-builder 失败时用）

当 electron-builder 报 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`（容器 NSIS/signing 兼容性问题），但 `win-unpacked/` 目录实际已生成时，直接 zip 打包。

如果连 `win-unpacked` 都没生成，手动构造：

```bash
# 1. 下载 Windows Electron
curl -L -o electron-win.zip \
  "https://npmmirror.com/mirrors/electron/v33.4.0/electron-v33.4.0-win32-x64.zip"

# 2. 解压
unzip -q electron-win.zip -d app-portable/

# 3. 放入你的应用代码
mkdir -p app-portable/resources/app/
cp main.js package.json app-portable/resources/app/

# 4. 重命名入口
mv app-portable/electron.exe app-portable/YourApp.exe

# 5. 打包
zip -r YourApp-win64.zip app-portable/
```

## 关键注意事项

- **镜像**：`ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"` 比官方源快 10x+
- **URL 硬编码**：`main.js` 中 `loadURL()` 地址如果在 Tailscale 组网内，建议用 Tailscale IP 而非域名
- **安全配置**：`nodeIntegration: false, contextIsolation: true, sandbox: true`
- **外部链接**：用 `setWindowOpenHandler` 拦截，`shell.openExternal` 打开系统浏览器
- **版本**：Electron 33 测试通过，Windows 10/11 均兼容

## 产物结构

```
win-unpacked/
├── YourApp.exe          ← 入口
├── resources/
│   └── app.asar         ← 你的代码（electron-builder 打包）
├── chrome_100_percent.pak
├── icudtl.dat
├── locales/             ← 49 种语言包
└── *.dll                ← Chromium 依赖
```

解压后 ~270MB，zip 后 ~110MB。

## 踩坑记录

1. `app-builder-bin` 在容器环境可能无法执行，但 `win-unpacked/` 目录实际上已被 electron-builder 生成，直接 zip 即可
2. 不要用 `--win nsis` 目标（需要 NSIS），用 `--win portable` 
3. 签名相关步骤必须关闭：`signAndEditExecutable: false, forceCodeSigning: false`
