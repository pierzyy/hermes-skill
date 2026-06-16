---
name: import-external-skills
description: 批量从外部 Agent Skills 仓库（如 markdown-viewer/skills）导入技能到 Hermes。自动处理格式转换、YAML frontmatter 适配和分类。
version: 1.0.0
author: Hermes
license: MIT
dependencies: []
metadata:
  hermes:
    tags: [skills, import, conversion, batch]
---

# 批量导入外部 Agent Skills

从遵循 [Agent Skills](https://agentskills.io/) 格式的 GitHub 仓库批量导入技能到 Hermes。

## 前置条件

- 外部 skill 的 SKILL.md 包含标准 YAML frontmatter（name, description, metadata）
- repo 结构：每个子目录 = 一个 skill，内含 SKILL.md
- 目标 Hermes category 已确定

## 导入流程

### Step 1: 克隆源码
```bash
cd /tmp && rm -rf {repo_name} && git clone --depth 1 {repo_url} {repo_name}
```

### Step 2: 发现技能
```python
import os
repo = '/tmp/{repo_name}'
dirs = [d for d in os.listdir(repo) 
        if os.path.isdir(os.path.join(repo, d)) and d != '.git']
```

### Step 3: 批量转换格式

每个 SKILL.md 需要做以下转换：

**YAML frontmatter 适配：**

原始格式 → Hermes 格式：

```yaml
# 原始
name: original-name
description: ...
metadata:
  author: ...

# Hermes（添加必要字段 + mv- 前缀）
name: mv-{original-name}
description: {original}
version: 1.0.0
author: {original author}, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: {repo_url}
  hermes:
    tags: {根据内容推断}
    related_skills: {关联技能名}
```

**内容适配：**
- 在正文开头添加 `> **Hermes Usage:** Load with skill_view(name="mv-xxx")...`
- 保留原始 Critical Rules、Pitfalls、Examples 章节
- 如果原始技能依赖特定渲染器（如 Markdown Viewer 浏览器扩展），在 usage note 中注明

**命名规则：**
- 添加 `mv-` 前缀避免和 Hermes 已有技能冲突
- related_skills 中也用 `mv-` 前缀

### Step 4: 批量创建

使用 `skill_manage(action='create')` 逐个创建。建议分批（每批 3-4 个）避免单轮调用数过多：

```python
# 伪代码
for name in skill_names:
    content = read_and_convert(name)
    skill_manage(action='create', name=f'mv-{name}', 
                 category=category, content=content)
```

### Step 5: 验证

```python
skills_list(category=category)  # 应该看到全部 N 个技能
```

## 已知的陷阱

### 1. 描述提取失败
`read_file` 在 `execute_code` 中可能返回缓存结果。解决方案：用 `terminal(cat file)` 替代 `read_file()`。

```python
# ❌ 可能在 execute_code 中不工作
content = read_file(path)['content']

# ✅ 可靠
result = terminal(f'cat {path}')
content = result['output']
```

### 2. 前端 YAML 解析
原始 frontmatter 可能有多行 description、嵌套 metadata。正则要处理：
```python
fm_match = re.match(r'^---\s*\n(.*?)\n---', text, re.DOTALL)
if fm_match:
    # 逐行解析 description（而非用 yaml.safe_load 整体解析）
    for line in fm_match.group(1).split('\n'):
        if line.startswith('description:'):
            desc = line.split(':', 1)[1].strip()
```

### 3. 技能太大
某些原始技能 > 20KB（如 infocard ~23KB）。Hermes skill_manage 有大小限制。解决方案：
- 精简示例代码
- 将详细参考移至 references/ 文件
- 保留核心 Rules + Pitfalls + 最小示例

## 案例：导入 markdown-viewer/skills（15 个技能）

| 注意点 | 处理方式 |
|--------|---------|
| category | 统一归入 `diagrams` |
| 命名 | 全部加 `mv-` 前缀 |
| tags | 按引擎分类：PlantUML→diagrams+PlantUML，Vega→charts+Vega-Lite，HTML→HTML+CSS |
| related_skills | 互相引用时用 `mv-` 前缀 |
| 精简 | 示例从原始保留 1-2 个，删除冗余的 stencil 列表 |