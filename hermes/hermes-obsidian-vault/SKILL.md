---
name: hermes-obsidian-vault
description: Hermes Agent 与 Obsidian Vault 的交互规范——启动加载、读写笔记、Git 同步、双实例协同
---

# Hermes Obsidian Vault 交互规范

## Vault 位置

- **NAS**: `/opt/data/obsidian-vault/`
- **云机**: `/opt/obsidian-vault/`（待确认）
- **远程**: `https://github.com/pierzyy/obsidian-vault.git`（SSH: `git@github.com:pierzyy/obsidian-vault.git`）

## Skills 位置（独立仓库）

- **NAS**: `/opt/data/skills/`
- **云机**: `/opt/data/skills/`
- **远程**: `git@github.com:pierzyy/hermes-skill.git`
- Skills 与 Vault 分离管理——两个独立 Git 仓库、独立 cron

### Skills 同步机制

采用 inotify daemon 模式，完全替代 cron。详见 Vault 文档 `Projects/HermesSync.md`。

```bash
# NAS: /opt/data/scripts/skill_sync.sh（watchdog 保活）
# NAS: /opt/data/scripts/vault_sync.sh（watchdog 保活）
# 云机: /opt/scripts/skill_sync.sh（@reboot cron 自启）
# 云机: /opt/scripts/vault_sync.sh（@reboot cron 自启）

# 行为：
# - 本地文件变更 → inotify 即时感知 → git push（0 延迟）
# - 远程有更新 → inotifywait -t 120 超时 → git pull（≤120s）
# - 零 cron，零 token 消耗
```

## 启动流程（每次 Hermes 启动时执行）

```bash
VAULT="/opt/data/obsidian-vault"

# 0. 修复 SSH 密钥（NAS 环境 GIT_SSH_COMMAND 可能被全局禁用 pubkey）
export GIT_SSH_COMMAND='ssh -i /root/.ssh/github_hermes -o StrictHostKeyChecking=accept-new'

# 1. 同步最新状态
cd "$VAULT" && git pull --ff-only

# 2. 加载全局上下文（注入当前 session）
cat "$VAULT/00-Meta/Context.md"

# 3. 确认角色
cat "$VAULT/00-Meta/Hermes-Roles.md"

# 4. 检查任务队列
cat "$VAULT/Tasks/Pending.md"
```

## 读操作

```bash
VAULT="/opt/data/obsidian-vault"

# 读项目状态
cat "$VAULT/Projects/ProjectName.md"

# 读决策日志
cat "$VAULT/Journal/Decisions.md"

# 读当日日志
cat "$VAULT/Journal/$(date +%Y-%m-%d).md" 2>/dev/null || echo "今日无日志"

# 搜索 vault 内容
grep -rli "关键词" "$VAULT" --include="*.md"
```

## 写操作

```bash
VAULT="/opt/data/obsidian-vault"

# 写之前先同步
cd "$VAULT" && git pull --ff-only

# 追加决策日志
echo "
## $(date +%Y-%m-%d)

| 项目 | 内容 |
|------|------|
| **决策** | 决策内容 |
| **理由** | 理由 |
| **替代方案** | 替代方案 |
" >> "$VAULT/Journal/Decisions.md"

# 更新项目状态
# 直接编辑 Projects/xxx.md

# 写会话摘要
cat >> "$VAULT/Journal/$(date +%Y-%m-%d).md" << 'EOF'

## 会话摘要

- 要点1
- 要点2

## 参与 Hermes

NAS Hermes / 云机 Hermes
EOF

# 提交并推送
cd "$VAULT" && git add -A && git commit -m "update: 简要描述" && git push
```

## 重要决策 → 必须写 Journal/Decisions.md

以下情况必须记录决策：
1. 技术方案选型（框架、API、数据源）
2. 架构变更
3. 用户明确指定的偏好
4. 两个 Hermes 需要知道的信息

## 双实例协同规则

### 写 vault 的时机

| 场景 | 操作 | 频率 |
|------|------|------|
| 每次对话开始 | git pull + 读 Context.md | 每次 |
| 每次对话结束 | 写会话摘要 + git push | 每次 |
| 做出重要决策 | 追加 Decisions.md | 发生时 |
| 项目状态变更 | 更新 Projects/xxx.md | 发生时 |
| 跨 Hermes 任务 | 写 Tasks/Pending.md | 发生时 |

### 冲突处理

如果 git push 失败（远程有更新）：
```bash
cd "$VAULT" && git pull --no-edit && git push
```

如果仍有冲突：
```bash
cd "$VAULT" && git pull --no-commit
# 手动解决冲突（保留双方内容，加注释标记）
git add -A && git commit -m "merge: 解决冲突" && git push
```

### 避免死循环

- 两个 Hermes 不要同时写同一个文件（除非是 Decisions.md 追加）
- 会话摘要标注哪个 Hermes 写的
- Tasks/Pending.md 的任务完成后标记完成并删除

## 目录结构

```
obsidian-vault/
├── 00-Meta/
│   ├── Context.md          # 全局上下文（启动必读）
│   ├── Environment.md      # 环境配置
│   ├── Conventions.md      # 用户偏好
│   └── Hermes-Roles.md     # 双实例分工
├── Projects/
│   ├── FundAdvisor.md
│   ├── FundMonitor.md
│   ├── AionUi.md
│   └── Homepage.md
├── Journal/
│   ├── Decisions.md        # 决策日志
│   └── YYYY-MM-DD.md       # 会话摘要
├── Tasks/
│   └── Pending.md          # 任务队列
├── Snippets/               # 代码片段
└── Templates/              # Obsidian 模板
```
