---
name: mv-infocard
description: Create editorial-style information cards using HTML/CSS in Markdown. Best for knowledge summaries, data highlights, event announcements, and single-topic content cards with magazine-quality typography.
version: 1.0.0
author: Markdown Viewer, imported by Hermes
license: MIT
dependencies: []
metadata:
  source: https://github.com/markdown-viewer/skills
  hermes:
    tags: ["cards", "HTML", "CSS", "typography", "editorial"]
    related_skills: ["mv-infographic", "mv-architecture"]
---

> **Hermes Usage:** Load with `skill_view(name="mv-infocard")`. Output info cards as embedded HTML in Markdown (NEVER in code blocks).

# Infocard Generator

**Quick Start:** Analyze content (density × structure × mood) → Auto-sense tone for color palette → Pick a layout skeleton → Embed HTML directly in Markdown with `<style scoped>`.

## Critical Rules

### Rule 1: Direct HTML Embedding
**IMPORTANT**: Write info cards as direct HTML in Markdown. **NEVER** use code blocks (` ```html `). The HTML should be embedded directly in the document without any fencing.

### Rule 2: No Empty Lines in HTML Structure
**CRITICAL**: Do NOT add any empty lines within the HTML info card structure. Keep the entire HTML block continuous to prevent parsing errors.

### Rule 3: Content Analysis Before Layout
**REQUIRED**: Analyze content along three dimensions before designing:

**Density** (determines breathing rhythm):

| Density | Content Volume | Visual Treatment |
|---------|---------------|-----------------|
| Low | ≤ 50 words core | "Big-character" composition. One oversized element dominates. Generous whitespace. |
| Medium | 50–200 words | Hero + supporting panels. 2–3 main blocks with clear hierarchy. |
| High | 200+ words | Asymmetric multi-column grids. Primary/secondary/supporting blocks. Never equal-weight tiles. |

**Structure** (determines layout geometry):

| Structure | Signal | Layout Pattern |
|-----------|--------|---------------|
| Single point | One core concept | One anchor element dominates, rest recedes |
| Contrast | A vs B, old vs new | Split panel, two poles |
| Hierarchy | Layers build on each other | Stacked modules, pyramid |
| Flow | Sequential steps | Vertical cascade, numbered items |
| Radial | Core + derivatives | Hub with surrounding panels |
| Parallel | Multiple equal concepts | Asymmetric grid (never equal columns) |

**Mood** (determines color temperature):

| Mood | Visual Feel |
|------|------------|
| Reflective | More whitespace, serif-heavy, lower contrast |
| Sharp | Strong contrast, bold type, vivid accent |
| Warm | Earth tones, rounded feel, gentle rhythm |
| Technical | Monospace accents, grid-like density |

### Rule 4: Tone Sensing
**REQUIRED**: Auto-select color palette based on content topic. Scan content keywords and match the closest tone:

| Content Tone | Background | Accent | Trigger Keywords |
|---|---|---|---|
| Philosophical | `#FAF8F4` | `#7C6853` | cognition, thinking, meaning, philosophy, essence |
| Technical | `#F5F7FA` | `#3D5A80` | architecture, algorithm, system, API, code |
| Literary | `#FBF9F1` | `#6B4E3D` | story, narrative, writing, poetry, character |
| Scientific | `#F4F8F6` | `#2D6A4F` | experiment, data, research, paper, discovery |
| Business | `#F4F3F0` | `#2D6A4F` | market, strategy, growth, finance, investment |
| Creative | `#F6F3F2` | `#B8432F` | design, art, aesthetics, inspiration, creation |
| Default | `#FAFAF8` | `#4A4A4A` | When no clear match — prefer default over wrong match |

When a style template is explicitly chosen, its colors take precedence over tone sensing.

### Rule 5: Title Protection
If the user provides a title explicitly, use it as-is for the main headline. Do NOT silently rewrite the user's title.

### Rule 6: Typography Hierarchy
- Hero title: `32px–48px`, weight 700–900, tight letter-spacing (`-0.02em`)
- Subtitle / summary: `16px–20px`, weight 400–500
- Body text: `14px–16px`, weight 400, line-height `1.6–1.7`
- Meta / tags / captions: `11px–13px`, weight 500–700, uppercase with letter-spacing
- Body text color: never pure black — use `#1a1a1a`, `#333`, or `#4a4a4a`

### Rule 7: Visual Weight Distribution
At least one module should feel visually heavier than the others. Avoid making every panel use the exact same treatment.

## Example: Technical Info Card

```html
<div style="max-width:720px;margin:32px auto;font-family:Georgia,serif">
<style scoped>
.infocard{background:#F5F7FA;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
.infocard-hero{padding:40px 48px 24px;text-align:center}
.infocard-hero h1{font-size:36px;font-weight:800;color:#1a1a1a;letter-spacing:-0.02em;margin:0 0 8px}
.infocard-hero .subtitle{font-size:16px;color:#64748b;line-height:1.6;max-width:480px;margin:0 auto}
.infocard-divider{width:48px;height:4px;background:#3D5A80;border-radius:2px;margin:24px auto 32px}
.infocard-body{padding:0 48px 40px;display:grid;grid-template-columns:1fr 1fr;gap:24px}
</style>
<div class="infocard">
<div class="infocard-hero">
<h1>Microservices Architecture</h1>
<p class="subtitle">A design approach where applications are built as independent, loosely coupled services that communicate over lightweight protocols.</p>
</div>
<div class="infocard-divider"></div>
<div class="infocard-body">
<div style="font-size:14px;color:#334155;line-height:1.7">
<strong style="color:#3D5A80">Key Principles</strong>
<p style="margin:8px 0 0">• Independent deployability<br>• Organized around business capabilities<br>• Decentralized data management<br>• Design for failure</p>
</div>
<div style="font-size:14px;color:#334155;line-height:1.7">
<strong style="color:#3D5A80">Common Patterns</strong>
<p style="margin:8px 0 0">• API Gateway<br>• Service Discovery<br>• Circuit Breaker<br>• Event Sourcing</p>
</div>
</div>
</div>
</div>
```

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Empty lines in HTML | Remove all blank lines inside the card `<div>` |
| Wrong fence | NEVER use ` ```html ` — embed directly |
| Flat hierarchy | Ensure one element dominates visually |
| Wrong tone | Re-scan content keywords for correct palette |