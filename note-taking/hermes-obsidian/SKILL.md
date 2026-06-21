---
name: hermes-obsidian
description: Hermes 与 Obsidian Vault 协同方案 — 两个 Hermes 实例（云机+NAS）通过共享 Git 仓库同步知识、项目状态、决策日志和任务队列。
---

# Hermes-Obsidian 协同方案

## 架构

```
云机 Hermes A ──git push/pull──▶ GitHub ◀──git push/pull── NAS Hermes B
                                        (pierzyy/obsidian-vault)
```

- **主副本在 NAS**：`/opt/data/obsidian-vault/`（持久化存储）
- **云机副本**：`/opt/obsidian-vault/`（通过 git 同步）
- **同步方式**：Git（HTTPS，凭据已配置）

## Vault 目录结构

```
obsidian-vault/
├── 00-Meta/              # 元信息（两个 Hermes 启动必读）
│   ├── Context.md        # 全局上下文、当前焦点
│   ├── Environment.md    # 环境变量、端口、服务清单
│   ├── Hermes-Roles.md   # 两个 Hermes 的分工约定
│   └── Conventions.md    # 用户偏好、命名规范
├── Projects/             # 项目仪表盘
│   ├── FundAdvisor.md
│   ├── FundMonitor.md
│   ├── AionUi.md
│   └── Homepage.md
├── Journal/              # 日志
│   ├── Decisions.md      # 决策日志
│   └── YYYY-MM-DD.md     # 每日会话摘要
├── Tasks/                # 任务队列
│   ├── Pending.md        # 待办
│   └── Done.md           # 已完成
├── Snippets/             # 代码片段
├── Templates/            # Obsidian 模板
└── Scripts/              # Hermes 可调用的辅助脚本
```

## Hermes 启动流程

每次 Hermes 启动时，按顺序执行：

```bash
# 1. 同步最新 vault 状态
cd /opt/data/obsidian-vault && git pull

# 2. 读 Context.md → 了解全局上下文
# 3. 读 Environment.md → 环境配置
# 4. 读 Hermes-Roles.md → 分工确认
# 5. 读 Projects/ 相关项目笔记 → 项目状态
```

## Hermes 操作规范

### 读 vault

```bash
VAULT=/opt/data/obsidian-vault  # NAS
# VAULT=/opt/obsidian-vault     # 云机

# 读上下文
cat "$VAULT/00-Meta/Context.md"

# 读项目状态
cat "$VAULT/Projects/FundAdvisor.md"

# 搜索笔记
grep -rli "关键词" "$VAULT" --include="*.md"
```

### 写 vault

```bash
VAULT=/opt/data/obsidian-vault

# 1. 先 pull 确保最新
cd "$VAULT" && git pull

# 2. 写文件
cat > "$VAULT/Projects/xxx.md" << 'EOF'
...
EOF

# 3. 提交并推送
cd "$VAULT" && git add -A && git commit -m "[hermes-b] 更新了什么" && git push
```

### 更新 Context.md（当焦点变化时）

```bash
cd /opt/data/obsidian-vault && git pull
# 编辑 00-Meta/Context.md 中的 updated 和当前焦点
git add -A && git commit -m "[hermes-b] 更新上下文" && git push
```

### 追加决策日志

```bash
cat >> /opt/data/obsidian-vault/Journal/Decisions.md << 'EOF'

## YYYY-MM-DD: 决策标题
- 决策: ...
- 理由: ...
- 替代方案: ...
EOF
cd /opt/data/obsidian-vault && git add -A && git commit -m "[hermes-b] 记录决策: xxx" && git push
```

### 更新任务队列

```bash
# 任务完成后从 Pending 移到 Done
# 编辑 Tasks/Pending.md 和 Tasks/Done.md
cd /opt/data/obsidian-vault && git add -A && git commit -m "[hermes-b] 任务更新: xxx" && git push
```

### 生成会话摘要

会话结束时，追加当日摘要到 Journal/：

```bash
cat >> /opt/data/obsidian-vault/Journal/2026-06-20.md << 'EOF'
---
hermes: hermes-b (NAS)
---

# 2026-06-20 会话摘要

## 做了什么
- ...

## 关键决策
- ...

## 待办
- ...
EOF
cd /opt/data/obsidian-vault && git add -A && git commit -m "[hermes-b] 会话摘要 2026-06-20" && git push
```

## 提交规范

- commit message 格式：`[hermes-a|hermes-b] 做了什么`
- 每次写 vault 后必须 git push
- 不 commit 二进制文件（图片等）

## 冲突处理

如果 git pull 出现冲突：

```bash
# 查看冲突文件
git status

# 手动解决冲突（保留双方内容，用 >>> <<< 标记）
# 解决后：
git add -A && git commit -m "[hermes-b] 解决冲突" && git push
```

## 分工

| 职责 | Hermes A (云机) | Hermes B (NAS) |
|------|:---:|:---:|
| 微信交互 | ✅ 主入口 | - |
| Cron 定时任务 | - | ✅ 主 |
| 基金日报流水线 | - | ✅ |
| APK 构建 | - | ✅ |
| 重计算任务 | ✅ | - |
| 文件存储 | - | ✅ |
| 本地服务保活 | - | ✅ |
| FRP 客户端 | - | ✅ |
| 微信图片/文件发送 | ✅ | - |
