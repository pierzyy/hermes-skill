---
name: fund-advisor-backup-strategy
description: 基金投顾系统三层代码备份体系 — Git本地 + GitHub远程 + tar兜底。含分支策略、自动推送cron、恢复步骤。触发词：代码备份、恢复代码、git回滚、重启后备份恢复。
---

# 基金投顾系统 — 三层代码备份体系

## 架构

```
第1层: Git 本地 (每修改 commit)
第2层: GitHub 远程 (每日 04:00 自动 push)
第3层: tar 本地 (每日 02:00 打包, 7天+4周保留)
```

## 项目信息

| 项目 | 值 |
|------|-----|
| 路径 | `/opt/data/fund-advisor-system/` |
| GitHub | `pierzyy/fund-advisor-system` (私有) |
| 基线 Tag | `pre-streamlit-rewrite` |
| 当前分支 | `rewrite/streamlit-v2` (重写分支) |
| 生产分支 | `main` |

## 分支策略

```
main ──────────● pre-streamlit-rewrite ← 生产状态（随时可回滚）
               │
               └── rewrite/streamlit-v2 ← 重写分支
```

## 恢复步骤

### 场景 A：重写出问题，回滚到 main
```bash
cd /opt/data/fund-advisor-system
git checkout main
# 重启 Streamlit 即可恢复旧版
```

### 场景 B：容器重启丢失代码（代码在持久化存储不会丢）
```bash
# 代码在 /opt/data/ 下，持久化不会丢
# 只需恢复 crond 自动备份任务
bash /opt/data/hermes-custom/start_crond.sh
```

### 场景 C：NAS 物理损坏，从 GitHub 恢复
```bash
git clone git@github.com:pierzyy/fund-advisor-system.git /opt/data/fund-advisor-system
git checkout <branch>
# 补充 config.yaml、.venv 等（这些在 GitHub 外）
```

### 场景 D：GitHub 不可用，从 tar 恢复
```bash
ls /opt/data/fund-advisor-system/data/backups/
# 找到最近的 tar.gz → tar xzf 恢复
```

## 自动备份 Cron 任务

容器重启后需重新创建：

```bash
# 每日 02:00 tar 打包备份
cronjob create \
  name="fund-advisor-tar-backup" \
  schedule="0 2 * * *" \
  prompt="cd /opt/data && tar --exclude='.venv' --exclude='*.db' --exclude='.git' -czf /opt/data/fund-advisor-system/data/backups/fund-advisor-$(date +%Y%m%d).tar.gz fund-advisor-system/"

# 每日 04:00 Git push
cronjob create \
  name="fund-advisor-git-push" \
  schedule="0 4 * * *" \
  prompt="cd /opt/data/fund-advisor-system && git add -A && git commit -m 'auto: daily backup $(date +%Y%m%d)' && git push origin HEAD"
```

## 日常修改流程

```
cp 文件 文件_backup_$(date +%Y%m%d_%H%M%S)
→ 排查根因（browser/console/vision）
→ 修改代码（patch/write_file）
→ 语法验证（python -c compile）
→ git commit
→ 验证效果
```

## 注意事项

- `.venv/` 和 `*.db` 在 tar 中排除（太大且可重建）
- `config.yaml` 和 keystore 不在 Git 中（敏感信息），需手动备份
- tar 保留策略：7天日备份 + 4周周备份（脚本：`scripts/rotate_backups.py`）
- 每次修改前必须 `git status` 确认在正确分支上
