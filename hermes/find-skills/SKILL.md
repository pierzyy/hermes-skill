---
name: find-skills
description: Search available skills by keyword and auto-view matching results. Handles fuzzy matching and partial queries.
tags: [hermes, skills, search, discovery]
---

# Find Skills

Use this skill when you need to find a specific skill by name, category, or keyword description. It performs a two-stage search: first fuzzy-match by skill name, then by description keywords.

## Usage

### Quick Search (one shot)

When the user says "find skill for X" or "有没有做X的技能":

```python
from hermes_tools import terminal

# Step 1: Get all skills
result = terminal('cat /opt/data/skills/skills_index.json 2>/dev/null || echo "{}"')
# If index doesn't exist, use skills_list tool

# Step 2: Search by name (partial match)
# matching skill names containing keyword

# Step 3: Search by description (keyword in descriptions)
```

### Detailed Search Workflow

```python
# 1. List all skills using the skills_list tool
# 2. Filter by category if category is known
# 3. Fuzzy match: check skill name first, then description
# 4. For the best match(es), load with skill_view()
```

### Helper: Category Mapping

| Category | Description |
|----------|-------------|
| autonomous-ai-agents | AI coding agents (Claude Code, Codex, OpenCode) |
| creative | Art, design, video, music generation |
| data-science | Stock analysis, demographics, Jupyter, charts |
| devops | Webhook subscriptions |
| email | Email management via himalaya |
| gaming | Minecraft, Pokemon |
| github | Code review, PRs, issues, repos |
| leisure | Find nearby places via OpenStreetMap |
| mcp | MCP client tools |
| media | YouTube, GIFs, music, audio |
| mlops | Model training, inference, fine-tuning |
| note-taking | Obsidian |
| productivity | Google Workspace, Linear, Notion, PDF, PPT |
| red-teaming | Jailbreak/red-team tools |
| research | ArXiv, blog monitoring, knowledge base |
| search | Chinese cloud drive search |
| smart-home | Philips Hue |
| social-media | X/Twitter |
| software-development | Planning, debugging, TDD, code review |

## Pitfalls

1. `skills_list` only returns name + description — need `skill_view` for full content
2. Category names are lowercase with hyphens
3. Some skills have names that differ from their display name (e.g. "evaluating-llms-harness" vs "lm-evaluation-harness")
4. Skills in plugins may use qualified names like "plugin:skill-name"
