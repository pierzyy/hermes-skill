---
name: obsidian-distill
description: 将当前对话的精华内容沉淀为结构化 Markdown 笔记，写入 Obsidian 投递箱（inbox）。用户触发词：「把刚才的对话沉淀到 Obsidian」「保存到 Obsidian」「沉淀到笔记」
---

# Obsidian 对话沉淀工作流

## 触发条件

当用户说以下任意一句时，执行本工作流：
- 「把刚才的对话沉淀到 Obsidian」
- 「保存到 Obsidian」
- 「沉淀到笔记」
- 「把这段内容存到 Obsidian」
- 「distill to obsidian」

## 目标

将当前对话的精华内容整理为结构化 Markdown 笔记，写入 Obsidian 投递箱。

**投递箱路径确定规则（按优先级）：**
1. 环境变量 `OBSIDIAN_VAULT_PATH` — 如果设置了就用它
2. 默认路径：云机为 `/root/obsidian-inbox/`，NAS 为 `~/obsidian-inbox/`
3. 使用 `echo ${OBSIDIAN_VAULT_PATH:-/root/obsidian-inbox}` 来获取

> 在云机上路径是 `/root/obsidian-inbox/`
> 在 NAS 上路径是 `$HOME/obsidian-inbox/`（通常是 `/home/user/obsidian-inbox/`）

## 步骤

### 1. 读取当前对话历史

使用 `session_search()` 工具获取当前会话的内容：
- 不传参数调用 `session_search()` 浏览最近会话
- 或者直接用 `session_search(query="...")` 搜索当前话题的关键词

### 2. 整理与提炼

从对话中提取以下结构：

```
# 笔记标题（概括核心主题）

## 核心结论
- 最关键的 1-3 个结论
- 一句话总结

## 背景与问题
- 为什么开始这个对话
- 要解决什么问题

## 可复用的方法
- 具体步骤、命令、代码片段
- 可复用的工作流

## 我的启发
- 个人感悟和洞察
- 与已有知识的连接

## 后续行动
- 下一步要做什么
- 待办事项

## 相关来源
- 提到的链接、工具、参考资料
```

### 3. 生成标签

在笔记顶部添加 YAML frontmatter，包含标签：
```yaml
---
tags: [tag1, tag2, tag3]
created: YYYY-MM-DD
source: hermes-conversation
---
```

标签从内容中自动提取，例如：`python`, `devops`, `docker`, `ai`, `obsidian` 等。

### 4. 写入投递箱

将笔记写入投递箱目录。路径按以下规则确定：

```bash
INBOX="${OBSIDIAN_VAULT_PATH:-$HOME/obsidian-inbox}"
```

- 文件名：用中文拼音或英文，如 `docker-compose-setup.md`
- 按内容分类放入子目录：
  - `$INBOX/` — 通用知识
  - `$INBOX/projects/` — 项目相关
  - `$INBOX/daily/` — 日报/总结

使用 `write_file()` 工具写入文件。

### 5. 确认结果

告知用户笔记已写入，包括：
- 文件名和路径
- 标签
- 简要内容预览

## 注意事项

- **不要保存原始聊天记录** — 只保存整理后的精华
- **去掉无意义的填充词和重复内容**
- **每条笔记独立成文件**，不要追加到已有文件
- **文件名要有意义**，方便 Obsidian 内搜索和 [[双向链接]]
- 如果对话涉及多个主题，可以拆成多篇笔记
- 笔记风格：简洁、结构化、可执行
