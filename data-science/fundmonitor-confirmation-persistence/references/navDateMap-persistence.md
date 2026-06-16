# navDateMap — NAV Date Persistence (v3.8-0520z+)

## Problem

`navDateMap: {code: nav_date}` is a runtime global tracking the NAV publication date (jzrq from f10).
It MUST be persisted to localStorage alongside `prevNavs` because:

- The `todayConfirmed` fast path (line 725) skips ALL API calls entirely
- `source_detail` needs both NAV value AND NAV date for confirmed funds
- Without persistence, app restart → navDateMap empty → confirmed fund `source_detail` shows only NAV without date, or in worst case no NAV at all

## Implementation (5 locations)

### 1. Save — `savePortfolios()` and `doRefresh()`
```js
try { localStorage.setItem('fm_nav_dates', JSON.stringify(navDateMap)); } catch(e) {}
```

### 2. Load — `loadPrevNavs()`
```js
try {
  const raw = localStorage.getItem('fm_nav_dates');
  if (raw) Object.assign(navDateMap, JSON.parse(raw));
} catch(e) {}
```

### 3. Restore from h[6] — `loadPortfolios()` (cross-session)
```js
if (h[6]) navDateMap[h[0]] = h[6];
```

### 4. Clear — CLEANUP_VERSION block
```js
try { localStorage.removeItem('fm_nav_dates'); } catch(e) {}
```

### 5. Populate — f10 confirmation (3 paths)
```js
navDateMap[code] = f10data.jzrq || '';
```

## formatSourceDetail Regex MUST allow whitespace

```js
// WRONG — fails on "净值 1.2345" (space between label and value)
var valMatch = detail.match(/(净值|估值|万份)([\d.]+)/);

// CORRECT — \s* tolerates optional whitespace
var valMatch = detail.match(/(净值|估值|万份)\s*([\d.]+)/);
```

Without `\s*`, any accidental space in `source_detail` silently breaks NAV extraction.

## source_detail format consistency

All `source_detail` assignments should use: `'净值'+dwjz+' ('+jzrq+')'`
NOT: `'净值 '+dwjz+' ('+jzrq+')'` (extra space after 净值)

Example of correct output: `净值1.2345 (2026-05-19)`
