---
name: mv-mindmap
description: Create hierarchical mind maps using PlantUML @startmindmap syntax. Best for brainstorming trees, study outlines, decision maps, and topic decomposition with directional branches and rich text formatting.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "PlantUML", "mindmap", "brainstorming"]
    related_skills: ["mv-canvas", "mv-infographic"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-mindmap")`. Output mind maps as PlantUML `@startmindmap` code blocks.

# Mind Map Generator

**Quick Start:** Define central topic → Add branches with `*` (right) or `*_` (left) → Nest sub-branches with additional `*` → Apply colors and formatting → Wrap in ` ```plantuml ` fence.

## Syntax Quick Reference

| Symbol | Direction | Example |
|--------|-----------|---------|
| `*` | Right side (default) | `* Branch A` |
| `*_` | Left side | `*_ Branch B` |
| `**` | Sub-branch right | `** Sub-topic` |
| `**_` | Sub-branch left | `**_ Sub-topic` |
| `***` | Deep sub-branch | `*** Detail` |

## Formatting

```
* <size:20><b>Bold Title</b></size>
* <color:red>Red branch</color>
* <s>Strikethrough</s>
* :emoji: Text
* <&icon-name> Text with icon
```

## Example: Technology Stack Mind Map

```plantuml
@startmindmap
* Technology Stack
** Frontend
*** React
*** Vue.js
*** Svelte
** Backend
*** Node.js
*** Python
**** Django
**** FastAPI
*** Go
** Infrastructure
*** Docker
*** Kubernetes
*** Terraform
**_ Legacy Systems
***_ Java EE
***_ PHP
@endmindmap
```

## Directional Control

```plantuml
@startmindmap
*[#Orange] Central Idea
right side
**[#LightGreen] Category A
*** Item 1
*** Item 2
left side
**[#LightBlue] Category B
*** Item 3
*** Item 4
@endmindmap
```

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| One-sided map | Mix `*` and `*_` for balanced layout |
| Deep nesting unreadable | Max 4-5 levels |
| Colors not showing | Use hex codes: `*[#FF6600]` |