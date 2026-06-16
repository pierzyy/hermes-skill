---
name: fundmonitor-rendering-bug-patterns
description: Common rendering bugs in FundMonitor JS/CSS and their fixes — source_detail regex, sign loss, CSS double-box, map persistence, worktree discipline.
tags: [fund, rendering, bug, css, regex, persistence]
---

# FundMonitor Rendering Bug Patterns

Lessons from v3.8-0520 series debugging.

## 1. Worktree Discipline
**Always edit in dev** (`/opt/data/FundMonitor-claude-dev/`), not master. Verify with `git status`. If accidentally edit master, `cp` to dev, commit dev, then merge.

## 2. APK Copy After Build
`assembleDebug` does NOT auto-copy. Must run:
```bash
cp app/build/outputs/apk/debug/app-debug.apk /opt/data/FundMonitor.apk
```
Verify with: `unzip -o /opt/data/FundMonitor.apk assets/index.html -d /tmp && grep "CHANGE" /tmp/assets/index.html`

## 3. Source_detail Regex: Space Bug
`formatSourceDetail` regex `/(净值|估值|万份)([\d.]+)/` fails if space between label and number. Fix:
- Regex: `/(净值|估值|万份)\s*([\d.]+)/`
- Source_detail strings: NEVER `'净值 '+dwjz`, always `'净值'+dwjz`

## 4. Sign Loss: Math.abs + Empty String
`(x>=0?'+':'')+Math.abs(x)` loses sign when x<0. Fix: `(x>=0?'+':'-')+Math.abs(x)`

## 5. Runtime Map Persistence
Any global map used in processFund fast paths must be saved to localStorage AND restored on init:
- Save: `localStorage.setItem('key', JSON.stringify(map))`
- Load in init: `Object.assign(map, JSON.parse(raw))`
- Clear in CLEANUP_VERSION
- Restore from portfolio h[N] in loadPortfolios for backward compat

## 6. CSS Double-Box (Transparent Box Model)
When base class has `display:inline-block; padding; border-radius` WITHOUT `background`, and child class HAS `background`: the transparent padding area shows parent background → looks like two nested boxes. Fix: move box-model props to each child class.

## 7. Patch Tool Escaping
Patch tool can double-escape HTML quotes. Verify: `grep -c 'class=\\\\"' file` should be 0. Fix with Python if needed: `text.replace("\\\\\"", "\\")`