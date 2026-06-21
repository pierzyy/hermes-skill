---
name: finishing-a-development-branch
title: 完成开发分支 — 结构化收尾流程
description: 实现完成、所有测试通过后使用。验证测试 → 检测环境 → 展示选项（本地合并/创建PR/保持现状/丢弃）→ 执行选择 → 清理。
tags: [git, workflow, branch-management, finishing]
---

# 完成开发分支

## 流程

### 步骤 1：验证测试

```bash
pytest / npm test / cargo test / go test ./...
```

**如果测试失败：** 停止。不要继续到步骤 2。

**如果测试通过：** 继续步骤 2。

### 步骤 2：检测环境

确定工作区状态（普通仓库 vs git worktree），决定展示哪种菜单和清理方式。

### 步骤 3：展示选项

```
实现已完成。你想怎么做？

1. 在本地合并回 main
2. 推送并创建 Pull Request
3. 保持分支现状（我稍后处理）
4. 丢弃这项工作

选哪个？
```

### 步骤 4：执行选择

#### 选项 1：本地合并
```bash
git checkout main
git pull
git merge <feature-branch>
# 验证测试
git branch -d <feature-branch>
```

#### 选项 2：推送并创建 PR
```bash
git push -u origin <feature-branch>
gh pr create --title "<title>" --body "## 摘要\n变更要点\n## 测试计划"
```
**不要清理 worktree** — 用户 PR 迭代时还需要它。

#### 选项 3：保持现状
报告："保留分支 <name>。工作树保留在 <path>。"

#### 选项 4：丢弃
**先确认：** 要求输入 'discard' 确认，然后强制删除分支。

### 步骤 5：清理工作区

只对选项 1 和 4 执行。选项 2 和 3 始终保留 worktree。

## 快速参考

| 选项 | 合并 | 推送 | 保留工作树 | 清理分支 |
|------|------|------|-----------|---------|
| 1. 本地合并 | ✓ | - | - | ✓ |
| 2. 创建 PR | - | ✓ | ✓ | - |
| 3. 保持现状 | - | - | ✓ | - |
| 4. 丢弃 | - | - | - | ✓（强制） |

## 红线

- ❌ 测试失败时继续
- ❌ 不确认就删除工作成果
- ❌ 未经明确请求就强制推送
- ❌ 在 worktree 内部跑 `git worktree remove`
- ✅ 始终在提供选项前验证测试
- ✅ 选项 4 要求输入确认
