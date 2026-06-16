---
name: windows-exe-from-linux
description: Build Windows .exe files from Linux using Wine + embeddable Python + PyInstaller. Use when the user wants a Windows executable but you're on a Linux environment.
version: 1.0.0
tags: [windows, exe, wine, pyinstaller, cross-compile, packaging]
---

# Windows .exe 从 Linux 交叉编译

在 Linux 上使用 Wine + Python embeddable + PyInstaller 构建 Windows 可执行文件。

## 适用场景

- 用户在 Linux 上开发，需要交付 Windows .exe
- NAS/服务器环境无法运行完整的 Windows 虚拟机
- 需要快速打包 Python 应用为 Windows 可执行文件

## 关键约束

1. **架构必须匹配**：32 位 Python 需要 32 位 Wine prefix，64 位需要 64 位
2. **32 位方案最可靠**：64 位 Wine prefix 在 headless 环境下容易 hang
3. **embeddable Python 不含 tkinter**：如果应用需要 GUI，改用内置 http.server 做 Web 界面
4. **pip 下载用国内镜像**：阿里云镜像 `mirrors.aliyun.com` 速度稳定

## 完整流程

### Step 1: 安装 Wine + 32 位支持

```bash
dpkg --add-architecture i386 && apt-get update -qq
apt-get install -y wine wine32:i386
```

### Step 2: 下载 32 位 Python embeddable

```bash
curl -L --connect-timeout 10 --max-time 60 \
  "https://mirrors.huaweicloud.com/python/3.12.3/python-3.12.3-embed-win32.zip" \
  -o /tmp/python-embed32.zip
```

### Step 3: 解压并启用 pip

```bash
mkdir -p /opt/wine-py32 && cd /opt/wine-py32
python3 -c "import zipfile; zipfile.ZipFile('/tmp/python-embed32.zip').extractall('/opt/wine-py32')"
echo 'import site' >> python312._pth
```

### Step 4: 下载 get-pip.py（官方源）

```bash
curl -L --connect-timeout 15 --max-time 120 \
  "https://bootstrap.pypa.io/get-pip.py" -o /opt/wine-py32/get-pip.py
```

### Step 5: 用 Wine 安装 pip（使用阿里云镜像加速）

```bash
cd /opt/wine-py32
export DISPLAY=:0 XDG_RUNTIME_DIR=/tmp
WINEPREFIX=/root/.wine wine python.exe get-pip.py --no-warn-script-location \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

### Step 6: 安装 PyInstaller（从阿里云镜像，国内网络环境必需）

```bash
WINEPREFIX=/root/.wine wine python.exe -m pip install pyinstaller \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
```

### Step 7: 拷贝应用文件并编译

```bash
cp /path/to/your/*.py /opt/wine-py32/
WINEPREFIX=/root/.wine wine python.exe -m PyInstaller \
  --onefile --console --name "应用名" --clean main.py
```

产物在 `/opt/wine-py32/dist/应用名.exe`

### Step 8: 验证

```python
# 检查是否为有效 PE 文件
with open('应用名.exe', 'rb') as f:
    assert f.read(2) == b'MZ'
    f.seek(60)
    pe_offset = int.from_bytes(f.read(4), 'little')
    f.seek(pe_offset)
    assert f.read(4) == b'PE\x00\x00'
```

## GUI 应用方案

embeddable Python 不含 tkinter。两种方案可选：

### 方案一（推荐）：PyQt5 原生 GUI

**优点**：真正的原生 Windows 桌面应用，标签页、表格、按钮全部可用，用户体验最好。
**缺点**：exe 体积约 30MB（PyQt5 约 25MB）

```bash
# 在 Wine Python 中安装 PyQt5
WINEPREFIX=/root/.wine wine python.exe -m pip install PyQt5 \
  -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com

# 编译时添加 hidden imports（必需！）
WINEPREFIX=/root/.wine wine python.exe -m PyInstaller \
  --onefile --windowed --name "AppName" \
  --hidden-import PyQt5 \
  --hidden-import PyQt5.QtCore \
  --hidden-import PyQt5.QtWidgets \
  --hidden-import PyQt5.QtGui \
  --clean main.py
```

**关键点**：
- 必须用 `--windowed`（不是 `--console`），否则会弹出命令行窗口
- `--hidden-import` 四个 PyQt5 子模块缺一不可
- `sip` 模块的 WARNING 可忽略，不影响运行
- 构建 PyQt5 应用时 PyInstaller 会自动收集 Qt DLL

### 方案二：Web 界面 + 内置 HTTP 服务器

**优点**：exe 仅 ~7MB，纯标准库无外部依赖。
**缺点**：浏览器标签页 JS 可能不稳定；不是原生桌面体验。

- 使用 `http.server` 提供 HTML 界面
- 用 `webbrowser.open()` 自动打开浏览器
- CSS 花括号在 Python `.format()` 中必须双写转义（见下方陷阱）

## 交付与分发

### 微信发送 .exe（防误杀）

微信会拦截直接发送的 .exe 文件。两种方式：

**方式一：加密 7z（防检测最有效）**
```bash
apt-get install -y p7zip-full
7z a -p123456 -mhe=on 应用名.7z 应用名.exe
```
用户用 WinRAR 或 7-Zip 解压，密码告知用户。但加密 7z 可能保留 Unix 权限位导致 Windows 上出现权限问题。

**方式二：标准 zip（无权限问题，推荐）**
```bash
python3 -c "
import zipfile
with zipfile.ZipFile('AppName.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    zf.write('AppName.exe')
"
```
Python 的 zipfile 模块创建的 zip 不带 Unix 权限标记，Windows 上解压后无权限异常。
如果微信仍拦截 .zip 中的 .exe，可先加密 7z 打包 zip：
```bash
7z a -p123456 -mhe=on AppName.7z AppName.zip
```

### 文件权限问题

Linux 上编译的 exe（chmod 755/777）通过 7z 或 tar 传输到 Windows 后可能出现"管理员也无法访问"的权限错误。原因：
- 7z 保留了 Unix 权限位 → Windows 解析为无效 ACL
- 文件安全描述符损坏

**修复**：
1. 优先用 Python `zipfile` 打包（不保留 Unix 权限）
2. 文件名用纯 ASCII（避免中文路径导致的编码权限问题）
3. 如仍有问题，让用户在 Windows 上右键 → 属性 → 解除锁定

### HTML 模板中的 CSS 花括号陷阱

当 HTML/CSS 模板使用 Python `.format()` 渲染时，CSS 的花括号 `{margin:0}` 会被当作 format 占位符，导致 `KeyError`。

**错误写法：**
```python
HTML = '<style>body{background:#000}</style><div>{content}</div>'
HTML.format(content='hello')  # KeyError: 'background'!
```

**正确写法：** CSS 花括号必须双写转义（`format()` 会还原为单个）：
```python
CSS = 'body{{background:#000}}'
HTML = f'<style>{CSS}</style><div>{{content}}</div>'
HTML.format(content='hello')
```

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `Bad EXE format` | 64 位 Python 在 32 位 Wine prefix | 用 32 位 embeddable |
| `could not load kernel32.dll` | Wine prefix 状态异常 | 重建 prefix：`WINEPREFIX=/root/.wine wineboot -u` |
| `WINEARCH set to win64 but is a 32-bit installation` | 之前设过 64 位环境变量 | `unset WINEARCH` 后再操作 32 位 prefix |
| pip 下载超时 | 网络连 PyPI 慢 | 用 `-i https://mirrors.aliyun.com/pypi/simple/` |
| `pip install tkinter` 失败 | embeddable 无 tkinter，tkinter 不能 pip 安装 | 改用 PyQt5 原生 GUI 方案 |
| 64 位 Wine prefix 创建 hang | headless 环境问题 | 只用 32 位方案；如必须 64 位，加 `timeout` |
| exe 在 Windows 上"无读取权限" | 7z 保留了 Unix 权限位 | 用 Python zipfile 打包，ASCII 文件名 |
| PyQt5 exe 启动闪退 | 缺少 hidden import | 确保添加 PyQt5/QtCore/QtWidgets/QtGui 四个 |
