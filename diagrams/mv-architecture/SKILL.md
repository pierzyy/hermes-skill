---
name: mv-architecture
description: Create layered system architecture diagrams using HTML/CSS that directly embed in Markdown. Best for system layers, microservices architecture, and enterprise application topology with 13 layout × 12 style combinations.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["diagrams", "HTML", "layered", "system-design"]
    related_skills: ["mv-uml", "mv-graphviz", "mv-cloud"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-architecture")`. Output architecture diagrams as embedded HTML in Markdown (NOT in code blocks).

# Layered Architecture Diagram Generator

**Quick Start:** Define system layers → Map components to each layer → Choose layout style → Embed HTML directly in Markdown with `<style scoped>`. **NEVER use code blocks** — HTML must be embedded directly.

## Critical Rules

### Rule 1: Direct HTML Embedding
Write architecture diagrams as direct HTML in Markdown. **NEVER** wrap in ` ```html ` code blocks.

### Rule 2: No Empty Lines in HTML Structure
Keep the entire HTML block continuous — no blank lines within the structure.

### Rule 3: Layer Color Convention

| Layer | Color | Typical Components |
|-------|-------|-------------------|
| Presentation | Blue (#E3F2FD) | Web UI, Mobile App, API Gateway |
| Application | Green (#E8F5E9) | Services, Controllers, Business Logic |
| Domain | Yellow (#FFF8E1) | Models, Entities, Aggregates |
| Infrastructure | Purple (#F3E5F5) | Database, Message Queue, Cache |
| External | Grey (#F5F5F5) | Third-party APIs, SaaS, Cloud Services |

### Rule 4: Layout Grid
Components are arranged in a CSS Grid:
- `grid-template-columns`: 2-4 columns depending on layer width
- Each component is a card with border-left color accent
- Layer headers span full width with background color

### Rule 5: Component Card Structure
```html
<div class="component">
  <div class="comp-name">Service Name</div>
  <div class="comp-tech">Technology</div>
  <div class="comp-desc">Brief description</div>
</div>
```

## Example: Microservices Architecture

```html
<div class="architecture" style="max-width:900px;font-family:system-ui,sans-serif;font-size:13px">
<style scoped>
.architecture h3{margin:0;padding:8px 12px;border-radius:6px 6px 0 0;font-size:14px}
.architecture .layer{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;padding:8px}
.architecture .component{background:#fff;border-radius:8px;padding:12px;border:1px solid #e2e8f0;border-left:4px solid}
.architecture .comp-name{font-weight:600;margin-bottom:4px}
.architecture .comp-tech{color:#64748b;font-size:11px}
</style>
<div style="background:#E3F2FD;border-radius:8px;margin-bottom:12px">
<h3 style="background:#BBDEFB">🔵 Presentation Layer</h3>
<div class="layer">
<div class="component" style="border-left-color:#2196F3">
<div class="comp-name">Web App</div><div class="comp-tech">React + TypeScript</div></div>
<div class="component" style="border-left-color:#2196F3">
<div class="comp-name">Mobile App</div><div class="comp-tech">React Native</div></div>
<div class="component" style="border-left-color:#2196F3">
<div class="comp-name">API Gateway</div><div class="comp-tech">Kong</div></div>
</div></div>
<div style="background:#E8F5E9;border-radius:8px;margin-bottom:12px">
<h3 style="background:#C8E6C9">🟢 Application Layer</h3>
<div class="layer">
<div class="component" style="border-left-color:#4CAF50">
<div class="comp-name">User Service</div><div class="comp-tech">Go</div></div>
<div class="component" style="border-left-color:#4CAF50">
<div class="comp-name">Order Service</div><div class="comp-tech">Java Spring</div></div>
</div></div>
</div>
```

## 13 Layout × 12 Style Combinations

| Layout | Best For |
|--------|----------|
| Vertical Stack | Monolith decomposition |
| Horizontal Flow | Request/response pipelines |
| Grid Top-Down | Layered architecture |
| Grid Left-Right | Data flow diagrams |
| Hub & Spoke | Central service with satellites |

| Style | Visual Feel |
|-------|-------------|
| Clean | Minimal, high whitespace |
| Card | Elevated cards with shadows |
| Outline | Border-only, no fills |
| Gradient | Color gradients on headers |
| Dark | Dark background theme |