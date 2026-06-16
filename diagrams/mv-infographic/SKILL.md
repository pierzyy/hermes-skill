---
name: mv-infographic
description: Create template-based infographics with space-separated key-value YAML syntax and 70+ pre-designed templates. Best for KPI dashboards, timelines, roadmaps, SWOT analysis, funnel charts, org trees, and comparison cards.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["charts", "YAML", "templates", "KPI", "dashboards"]
    related_skills: ["mv-vega", "mv-infocard", "mv-canvas"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-infographic")`. Output infographics as YAML in ` ```infographic ` code blocks.

# Infographic Generator

**Quick Start:** Choose template from 70+ options → Fill YAML key-value pairs → Configure colors and layout → Wrap in ` ```infographic ` fence.

## YAML Syntax

```yaml
template: kpi-dashboard
title: Q4 Performance
metrics:
  - label: Revenue
    value: $2.4M
    change: +12%
  - label: Users
    value: 48.5K
    change: +8%
  - label: Churn
    value: 2.1%
    change: -0.5%
colors:
  primary: "#3B82F6"
  accent: "#F59E0B"
```

## Template Categories (70+ templates)

| Category | Templates |
|----------|-----------|
| KPI & Metrics | `kpi-dashboard`, `metric-cards`, `progress-bars`, `gauges` |
| Timeline | `timeline-horizontal`, `timeline-vertical`, `roadmap`, `milestones` |
| Comparison | `swot`, `comparison-table`, `pros-cons`, `before-after` |
| Process | `funnel`, `pipeline`, `workflow`, `steps`, `numbered-list` |
| Hierarchy | `org-chart`, `tree`, `pyramid`, `mind-map` |
| Data Story | `fact-sheet`, `stat-highlight`, `quote-card`, `callout` |

## Example: KPI Dashboard

````markdown
```infographic
template: kpi-dashboard
title: Monthly Analytics
metrics:
  - label: Active Users
    value: "12,847"
    change: "+14.2%"
    icon: users
  - label: Revenue
    value: "$84,320"
    change: "+8.7%"
    icon: dollar
  - label: Conversion
    value: "3.24%"
    change: "+0.8%"
    icon: trending-up
  - label: Bounce Rate
    value: "42.1%"
    change: "-2.3%"
    icon: activity
colors:
  primary: "#10B981"
  background: "#F8FAFC"
```
````

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Template not found | Use exact template name from list |
| Values not showing | Ensure key names match template spec |
| Layout broken | Check YAML indentation (2 spaces) |
| Colors ignored | Use hex with # prefix |
| Icons missing | Use icon names from template docs |