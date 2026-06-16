---
name: mv-canvas
description: Create spatial diagrams with free-positioned nodes using JSON Canvas format. Best for mind maps, knowledge graphs, concept maps, planning boards, and spatial brainstorming.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "JSON", "mindmap", "knowledge-graph"]
    related_skills: ["mv-mindmap", "mv-infographic"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-canvas")`. Output spatial diagrams as JSON Canvas in ` ```canvas ` code blocks.

# JSON Canvas Diagram Generator

**Quick Start:** Define nodes with positions (x, y) and dimensions → Add edges between nodes → Set colors and labels → Wrap in ` ```canvas ` fence.

## Canvas Format

```json
{
  "nodes": [
    {
      "id": "node1",
      "type": "text",
      "x": 0, "y": 0,
      "width": 250, "height": 60,
      "color": "1",
      "text": "**Central Topic**\nDescription here"
    }
  ],
  "edges": [
    {
      "id": "edge1",
      "fromNode": "node1",
      "toNode": "node2",
      "fromSide": "right",
      "toSide": "left",
      "label": "relates to"
    }
  ]
}
```

## Node Types

| Type | Behavior |
|------|----------|
| `text` | Rich text with Markdown |
| `file` | Embedded file reference |
| `link` | External URL |
| `group` | Container for child nodes |

## Color Palette

| Color ID | Appearance | Best For |
|----------|------------|----------|
| `"1"` | Red | Critical / Urgent |
| `"2"` | Orange | Warning / Attention |
| `"3"` | Yellow | Highlight / Feature |
| `"4"` | Green | Success / Done |
| `"5"` | Cyan | Info / Neutral |
| `"6"` | Purple | Creative / Meta |

## Positioning Tips

- Default spacing: 300px horizontal, 100px vertical
- Center the main concept at (0, 0)
- Branch right for positive, left for negative
- Use groups to cluster related nodes
- Keep width 200-400px for readability

## Output Format

````markdown
```canvas
{
  "nodes": [...],
  "edges": [...]
}
```
````