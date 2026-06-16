---
name: fund-monitor-regression-test
description: FundMonitor regression test harness and git worktree development workflow. Run before every APK build.
tags: [fund-monitor, regression-test, webview, git-worktree]
---

# Fund Monitor Regression Test & Workflow

## Test Harness

Location: `/opt/data/scripts/test_fund_monitor.js`
API fetchers: `/opt/data/scripts/test_fund_monitor_real.js`

```bash
node /opt/data/scripts/test_fund_monitor.js --unit           # 16 cases, simulated, <1s
node /opt/data/scripts/test_fund_monitor.js --syntax         # HTML/JS syntax check (vm.Script parse)
node /opt/data/scripts/test_fund_monitor.js --timeline       # 8 domestic fund lifecycle scenarios
node /opt/data/scripts/test_fund_monitor.js --pertype        # 27 per-type timeline (7 types × 4 scenes)
node /opt/data/scripts/test_fund_monitor.js --integration    # 131 funds (all 8 portfolios), real API, ~3min
node /opt/data/scripts/test_fund_monitor.js --import-export  # 8 cases, CSV/merge/replace/round-trip
node /opt/data/scripts/test_fund_monitor.js --fullweek       # 3 funds × 22 timepoints = 66 assertions
node /opt/data/scripts/test_fund_monitor.js --fullweek-all   # 104 funds × 22 timepoints = 2288 assertions
node /opt/data/scripts/test_fund_monitor.js --all            # all 2431+ cases (~3s unit, ~3min full incl integrations)
```

**CRITICAL**: The test contains a `processFund` function that must mirror `index.html`. Every time you change `processFund` in `index.html`, update `processFund` in the test file too.

**Same rule applies to ALL mock functions**, not just `processFund`. The following test functions must exactly mirror their production counterparts:
- `mockLoadPortfolios` ← `loadPortfolios` (all three recovery branches, QDII/FOF跨日, navDateMap, confirmedNavs反推)
- `mockDoRefresh` ← `doRefresh` (fundGzToday预拉取, confirmedChgPct回退链, source_detail with navDateMap)
- `mockIsMarketHours` ← `isMarketHours`
- `parseCSV` / `parseCSVLine` ← index.html import/export functions

**Test-production mirroring is the #1 defense against false negatives.** The 2431+ test suite passes even when production is broken if the mock functions take different code paths than production. After every production code change, audit all mock functions for divergence.

**Same rule applies to import/export functions**: `parseCSV`, `parseCSVLine`, `parseOldFormat`, and the merge/replace logic in the test must mirror `index.html`. When you change any import/export function in `index.html`, update the test copies too.

**Every new bug gets a test case** — no exceptions. Each debugging session should end with at least one new test added to prevent regression. This applies to ALL functionality, not just `processFund`.

## CSV Import Scenario Test (v4.0-0527c+)

`--csvimport` mode covers the \"fresh install → import CSV → refresh\" path that has been the root cause of multiple QDII display bugs. This path is distinct from `loadPortfolios` because `doImport` has its own todayConfirmed recovery logic that must mirror `loadPortfolios`.

The test simulates:
1. A QDII fund confirmed Monday evening, with h[2] rolled, h[4]=Monday, h[5]=0, h[6]=Friday
2. CSV import on Tuesday 09:30
3. QDII three-layer recovery: `h[4]('Monday') >= qThr('Monday')` → enters `todayConfirmed` ✅
4. `confirmedChgPct=0` (rolled) → fast-path returns `chgPct=null` → falls back to `processFund`
5. `processFund` → ETF data → correct chgPct ≠ 0 ✅

**Key insight**: Testing only the steady-state (confirm → hold → confirm) cycle misses the CSV import edge case where h[5]=0 on a confirmed fund. The CSV import path is the only way to reproduce this in production.

## Git Worktree Setup

```
/opt/data/FundMonitor-claude      (master) ← stable, build APK from here
/opt/data/FundMonitor-claude-dev  (dev)    ← edit index.html here
```

Init (one-time):
```bash
cd /opt/data/FundMonitor-claude
git init && git add .gitignore app/src app/build.gradle.kts build.gradle.kts gradlew settings.gradle.kts ...
git commit -m "initial"
git branch dev
git worktree add /opt/data/FundMonitor-claude-dev dev
```

## Development Flow

```
1. Edit /opt/data/FundMonitor-claude-dev/app/src/main/assets/index.html
2. Update test's processFund if logic changed (test harness MUST mirror index.html)
3. node test_fund_monitor.js --unit       # fast: 16 unit tests
4. node test_fund_monitor.js --all        # full: 190 tests (~3min)
5. node test_fund_monitor.js --integration  # verify against 131 real funds
6. cd /opt/data/FundMonitor-claude-dev && git commit
7. cd /opt/data/FundMonitor-claude && git merge dev
8. ./gradlew clean assembleDebug
```

**MUST pass 192/192 before sending APK to user.** Any partial failure requires investigation and fix.

## Full-Week-All Simulation (v3.8-0527+)

`--fullweek-all` extends the 3-fund `--fullweek` to cover all 104 unique funds from `portfolios.json`. It auto-includes in `--all`.

**4-phase pipeline:**
1. **Load**: Reads 8 portfolios (131 entries) → deduplicates by code → 104 unique funds
2. **Classify**: Uses `MONETARY_FUNDS`, `FUND_ETF_MAP`, `QDII_NO_FUNDGZ`, `isQdiiByName`, `getNavDelay` from index.html to assign `navDelay`, `hasFundgz`, `hasETF`, `type` per fund
3. **Generate**: Seeded random (seed=42) produces 5-day deterministic chgPct+NAV per fund
4. **Simulate**: 22 timepoints × 104 funds = 2288 processFund calls with per-fund f10/fi/etf

**Key design: per-fund simulation**

The shared `mockDoRefresh()` (single f10/fi/etf for all funds) is NOT used. Instead, each fund gets its own `buildF10All()`, `buildFiAll()`, `buildEtfAll()` and calls `processFund()` directly. This is the only way to simulate heterogeneous fund types (different navDelay, hasFundgz, ETF mappings) in one loop.

**Assertions per fund per timepoint:**
| Assertion | What | Detail |
|-----------|------|--------|
| A2: h[5] zeroing | Post-roll h[5] must be 0 | `lastRolledDate[code] === td` |
| A3: curVal ≠ cost | Confirmed + chgPct≠0 → curVal ≠ h[3] | **Use cost (h[3]), NOT h[2]** — h[2] already rolled to equal curVal |
| A4: no day-roll | Market hours must not roll h[2] | `lastRolledDate[code] !== td` |
| Type: domestic | Day1 20:00 confirmed, Day2 07:45 persistent | delay=0 |
| Type: QDII | Day2 20:00 confirmed | delay=1 |
| Type: FOF | Day3 20:00 confirmed (delay=2 only) | **NOT delay=3** — 017242 confirms Day4 |
| Type: monetary | source must be "货币基金" | Special path, no f10 |
| Day7 cross-weekend | All non-monetary stay confirmed | h[4] must be Friday 05-29 |

**Assertion pitfalls fixed:**
- **curVal ≠ h[2] is wrong after roll**: `h[2]` gets updated to `curVal` during rolling, so comparing `cv != h2New` always fails at the confirmation timepoint. Compare against **cost** (`holdings[fi7][3]`) instead.
- **delay=3 ≠ delay=2**: 017242 (navDelay=3) should NOT be asserted as confirmed at Day3 20:00. Only `dly === 2` (017253) confirms then. 017242 confirms Day4.

**Monetary fund handling**: Monetary funds don't go through f10 confirmation. In simulation, they're marked with `h[4]=td` when `fundResult.confirmed` (set via todayConfirmed from mockLoadPortfolios), but their h[2] never rolls via f10 pipeline.

Integration test loads from the user's actual portfolio CSV export, stored at:
```
/opt/data/FundMonitor-claude-dev/test_data/portfolios.json
/opt/data/FundMonitor-claude-dev/test_data/portfolios_full.csv
```

**Update process** when user exports new CSV:
1. User shares CSV via WeChat → saved to `/opt/data/cache/documents/`
2. Parse with `csv.DictReader`, skip `#` comment lines
3. Convert to `portfolios.json`: `{ "组合名": [["code","name",amount], ...] }`
4. Save both JSON and CSV to `test_data/` directory
5. Run `node test_fund_monitor.js --integration` to verify all 131 funds pass

**CSV format**: `# FundMonitor Data Export\n# 2026-05-20 02:25:51\n组合,Emoji,代码,名称,持有金额,持仓成本`
**Key parsing detail**: CSV has comment headers at top (lines starting with `#`). Skip them before feeding to csv parser.

**Fallback**: If `portfolios.json` not found, integration test falls back to 12 hardcoded funds across 3 portfolios. This keeps tests working in CI or after clean checkout.

## h[2] Rolling Rules (v4.0-0527c-cc+)

When h[2] absorbs confirmed gains at market close:

**Do NOT zero:**
- `h[5]` — the confirmed chgPct. h[2] absorbing gains ≠ forgetting how much it gained. h[5] is read by `loadPortfolios` to restore `confirmedChgPct`, and by the fast-path to compute curVal.
- `confirmedChgPct[f.code]` — same reason. This is the fast-path's fallback data source for funds without fundgz (QDII).

**DO zero:**
- Nothing. The `lastRolledDate[code] = today` alone prevents double-rolling. The lock is sufficient.

**Bug history**: v4.0-0527a/b both zeroed `h[5]` and/or `confirmedChgPct` during roll, which caused QDII funds to show 0% after fresh install → CSV import because the confirmed gain data was destroyed.

| # | Name | Symptom | Fix Location |
|---|------|---------|-------------|
| 1 | JZZZL=0→null | gain=0 | `parseF10Response`: `!== undefined && !== ''` |
| 2 | curVal=amount | gain=0 | non-market-hours confirmed path |
| 3 | prevNavs overwrite | gain=0 next refresh | don't save on confirmation |
| 4 | h[2] compounding | amount grows | only on `wasNewToday` |
| 5 | QDII source_detail | no NAV/date | use f10 from parallel fetch |
| 6 | FOF vs non-FOF | inconsistent | `chg_pct !== null && !== undefined` |
| 7 | doRefresh market path | curVal=amount | unified formula |
| 8 | applyF10Confirm prev==new | confirmed gain=0 | fallback to JZZZL |
| 9 | isMarketHours guard | confirmed lost pre-market | remove `&& isMarketHours()` from guards |
| 10 | Date-dependent mock data | tests rot next day | use `getDelayThreshold(today,N)` |
| 11 | QDII 0% after import+refresh | v4.0-0527b-cc triple-bug | see layered-bug section below |

## Layered Bug #11: QDII 0% after import+refresh (v4.0-0527a→0527b)

### Symptom
QDII funds confirmed the previous evening show 0% chgPct and 0 gain after fresh install → CSV import → refresh. Data sources show correctly, just the computed numbers are zero.

### Root Cause: Three bugs working together

| Layer | Bug | Location | Effect |
|-------|-----|----------|--------|
| **L1** (symptom) | Fast path read `fundGzToday` only | doRefresh L2202 | QDII has no fundgz → falls to `0` |
| **L2** (neutralizer) | `qRef = h[6] \|\| h[4]` — h[6] (NAV date) prioritized over h[4] (confirm date) | loadPortfolios L1224, doImport L1697 | QDII never recovers `todayConfirmed` because h[6] is always T-2 for delay=1 QDII |
| **L3** (second neutralizer) | `confirmedChgPct[f.code] = 0` during h[2] roll | h[2]滚动 L2300 | Even if L2 fixed, fallback source is zero |

**Why v4.0-0527a failed**: Fixed L1 only. L2 blocked QDII from entering `todayConfirmed` entirely, so the L1 fix's fast-path never executed. QDII fell through to `processFund` → `isMarketHours()` blocked confirmation → 0%.

### The Fix (v4.0-0527b)
- **L2**: `qRef = h[4]` — use confirmation date, not NAV date. h[4] is "when was this last confirmed", which is the correct indicator for whether confirmation is still valid.
- **L3**: Remove `confirmedChgPct[f.code] = 0` from h[2] roll. h[2] absorbing gains ≠ forgetting how much it gained. h[5]=0 is for "don't roll again today", confirmedChgPct is for "fast-path curVal calculation".
- **L1** already fixed in 0527a: `fundGzToday → confirmedChgPct → 0` fallback chain.

### Debugging Methodology
When a fix appears correct in isolation but doesn't work in production:
1. **Trace the full data pipeline** end-to-end: CSV export → import → loadPortfolios → todayConfirmed recovery → doRefresh → fast path → render
2. **Identify all conditions** that must be met for the fix's codepath to execute. If any upstream condition fails, the fix is dead code.
3. **Don't stop at the first fix**. Verify that the fixed codepath is actually being reached (not bypassed by upstream guards).

## Time-Simulation Testing (v3.8-0520a+)

The test harness supports time-travel simulation to verify confirmation persistence across sessions:

**Mock functions in test harness:**
- `mockGetTradingDate(dateStr, hour, minute)` — simulates `getTradingDate()` at arbitrary times
- `mockIsMarketHours(dateStr, hour, minute)` — simulates market hours check
- `mockLoadPortfolios(holdings, tradingDate, hour, minute)` — simulates h[4] → todayConfirmed restoration
- `mockDoRefresh(holdings, tc, ccp, prevNavs, closingCache, opts)` — simulates full doRefresh pipeline

**Critical pitfall — UTC offset trap:** When constructing dates for time simulation, NEVER use midnight (`T00:01:00`) with `.toISOString()`. `.toISOString()` returns UTC, which can cross calendar day boundaries relative to local time. Use noon (`T12:00:00`) for date construction and local-time formatting (`getFullYear/getMonth/getDate`) instead.

**Per-type timeline test** covers all 7 fund types (mapping to all 130 funds):
| Type | delay | Code Example | Confirm Day |
|------|-------|-------------|-------------|
| 国内基金 | 0 | 000218 国泰黄金 | Day1 evening |
| QDII股票 | 1 | 050025 博时标普500 | Day2 evening (T+1) |
| QDII债券 | 1 | 007360 易方达美元债 | Day2 evening |
| 港股同区 | 0 | 022680 华泰恒生科技 | Day1 evening |
| FOF | 2 | 017253 易方达养老2043 | Day3 evening (T+2) |
| FOF | 3 | 017242 南方养老2045 | Day4 evening (T+3) |
| 货币基金 | - | 000509 广发钱袋子 | Day1 (special path) |

Each type tested through: Day1 open → close → f10 publish → confirmed → next-day 09:22 persistence.

**Test mock dates must use dynamic computation:** When a test mock depends on date-threshold comparison (e.g., `getDelayThreshold(today, N)`), NEVER hardcode dates like `'2026-05-16'`. Use `getDelayThreshold(today, N)` to compute the jzrq dynamically. Otherwise tests rot a day later when calendar advances.

## todayConfirmed Guard: isMarketHours() Removal (P0 fix v3.8-0520a)

**Bug**: `&& isMarketHours()` on the todayConfirmed fast path (both `doRefresh` line 1947 and `processFund` line 663) caused confirmed funds in non-market hours to go through full processFund pipeline → API fetches → applyF10Confirmation → closingCache → could be overwritten by cached data.

**Fix**: Remove `&& isMarketHours()` from both guards. Confirmed funds ALWAYS take the fast path (any hour). The non-market guard at line 867 becomes a safety net (dead code for confirmed funds, still catches edge cases).

**Why the old design was wrong**: The comment said "非交易时段：跳过，等 f10 新净值发布再确认" — but the secondary guard at line 867 was also using confirmedChgPct (not new f10 data), so the design was never implemented correctly. The extra API calls and potential interference only caused bugs.

**Verification**: Bug#5.5 test specifically asserts that non-market todayConfirmed guard returns correct curVal/gain/source.

## File Format Decision

The import/export data format went through three iterations — this is recorded so future format changes avoid repeating the same dead ends:

| Iteration | Format | Verdict |
|-----------|--------|---------|
| v1 | Custom `$PORTFOLIO$` markers + pipe-delimited | ❌ Cryptic markers, hard to maintain |
| v2 | TOML | ❌ No mobile editor support (can't edit .toml on phone) |
| v3 | **CSV** (current) | ✅ Works everywhere: Excel/WPS on mobile, any text editor on PC |

CSV format: `组合,Emoji,代码,名称,持有金额,持仓成本` — each fund is one row, grouped by portfolio name column.

## Import/Export Test Suite (8 cases)

```bash
node /opt/data/scripts/test_fund_monitor.js --import-export
```

| # | Test | What it verifies |
|---|------|-----------------|
| 1 | CSV基本解析 | 1组合2基金, code/amount/emoji correct |
| 2 | CSV多组合 | Multi-portfolio grouping + order preserved |
| 3 | CSV跳过注释 | `#` comment lines and blank lines ignored |
| 4 | CSV引号字段 | `"name,with,commas"` parsed correctly |
| 5 | 覆盖模式 | Existing fund: update amount; absent fund: added; untouched fund: preserved |
| 6 | 替换模式 | All old data discarded, only new data remains |
| 7 | 旧格式兼容 | `$PORTFOLIO$` format still parseable |
| 8 | round-trip | Export → import → data identical |

- **NEVER edit master directly**: All code changes go through the dev worktree. Editing master bypasses the workflow and requires backfill commits. When making code changes, always `cd /opt/data/FundMonitor-claude-dev` first and annotate with "在 dev worktree 操作". The worktree is the safety net for rollback — don't break it.
- **`mockLoadPortfolios` MUST mirror production `loadPortfolios` exactly**: The test's mock must replicate all three restore branches (h[4]==today → 9:30前 → QDII跨日恢复) and set navDateMap/confirmedNavs. A simplified mock that passes all tests can still miss production bugs — the QDII 0% bug was caused by `mockLoadPortfolios` lacking the QDII cross-day restore branch entirely. 2431/2431 tests passed while the production bug was active. If production has a branch, the mock must too.
- **Test CSV import path**: Bugs often surface when stale persisted data (from old app versions) is imported into fresh installs. Test "新装 → CSV导入 → 刷新" for all fund types, especially QDII/FOF with delayed NAV.
- **Input minimalization**: Only API mock data (f10/fundgz/ETF) + cost are external inputs. h[4], h[5], h[6], confirmedChgPct, prevNavs, todayConfirmed, closingCache, lastRolledDate, confirmedNavs — ALL must be derived by simulation, never hand-crafted. Hand-crafting bypasses the code paths that need testing.
- **WebView `onPageFinished` for shared data**: When receiving external data (e.g. WeChat file share via `Intent.EXTRA_STREAM`), do NOT call `evaluateJavascript` in the WebView factory or `setSharedText()` before `loadUrl()`. The JS function (`onSharedTextReceived`) doesn't exist yet. Instead: store the data → `loadUrl` → in `WebViewClient.onPageFinished`, call `evaluateJavascript` to trigger the callback. Pattern:
  ```kotlin
  webViewClient = object : WebViewClient() {
      override fun onPageFinished(view: WebView?, url: String?) {
          super.onPageFinished(view, url)
          if (sharedText != null) {
              view?.evaluateJavascript("if(typeof onSharedTextReceived==='function') onSharedTextReceived()", null)
          }
      }
  }
  ```
- **dev worktree lacks `local.properties`**: After `git worktree add`, copy it from master: `cp /opt/data/FundMonitor-claude/local.properties /opt/data/FundMonitor-claude-dev/`
- **WebView blank screen debugging**: When the app shows only the loading spinner after code changes, the JS is throwing silently. Add a try-catch around the render call in `init()` to surface errors in the UI. Then search for duplicate variable declarations (`grep "const loading"` etc.). Test JS in Node with mocked DOM globals using the snippet in `fund-monitor-apk-build-test` skill.
- **Test mock dates must be date-independent**: When a test case depends on date-threshold comparison (e.g. `getDelayThreshold(today,N)`), NEVER hardcode dates like `'2026-05-15'` in mock data. Use `getDelayThreshold(today, N)` or `today` directly. Hardcoded dates go stale and cause tests to fail a day later when thresholds shift.
- **Time-simulation dates use noon `T12:00:00`**: `.toISOString()` returns UTC — midnight times cause cross-day offsets. Always construct simulated dates at noon and format with `getFullYear()/getMonth()/getDate()` for local time.
- **Sync test `processFund` with index.html**: When you change `processFund` logic (applyF10Confirmation, guards, f10兜底), update the mirror in `test_fund_monitor.js` too. The test uses `opts.nowDateStr` and `opts.tradingDate` params to inject simulated time instead of `new Date()`.
- **CLEANUP_VERSION must bump** when fixing logic that interacts with persisted state. Stale localStorage (h[4], h[5], prevNavs, closingCache) can bypass all code fixes.
- **WebView caches old HTML**: `clean assembleDebug` every time; MainActivity has `clearCache(true)`.
- **The app IS a WebView**, not Compose. Edit `app/src/main/assets/index.html`, not Kotlin files.
- **JS truthy traps**: `0` is falsy, `""` is falsy. Use explicit checks.
- **Float comparison**: use `Math.abs(a-b) < 0.01` not `===`.
- **⚠️ Patch tool escaping trap**: When editing JS template literals containing escaped quotes (e.g., `'<div class=\"card\">'`), the `patch` tool may silently add extra backslashes with each edit, producing `\\\\\"` instead of `\"`. After using `patch` on HTML with JS strings, verify with `node -e "new Function(script)"` for syntax errors. If ESLint/pre-build fails with parsing errors, use `sed` to strip excess escapes or rewrite the affected section with `write_file`. The JS `new Function()` check is the ground truth — if it passes, the code is valid.

- **`--syntax` HTML/JS validation (v3.8-0520b+)**: The test suite now includes `runHtmlSyntaxCheck()` which parses the actual `index.html` file (not the test copy), extracts `<script>` blocks, and compiles them with `vm.Script` to catch syntax errors. This was added after v3.8-0520b shipped with broken JS (`\\\"` escaping issue) that passed all 190 tests but caused a blank-screen APK. Mode: `--syntax` standalone or included in `--all`.

- **CRITICAL: Never use `execute_code` with `read_file` for full-file edits**. `read_file` defaults to 500 lines and will silently truncate files. For multi-patch HTML edits, write a Python script to `/tmp/` and run it with `terminal python3 /tmp/script.py`. The script should read/write the full file with `open().read()` / `open().write()`.

- **Preferred HTML editing approach**: For 3+ CSS/JS changes to `index.html`, use a single Python script (terminal) over the `patch` tool. This avoids escaping issues, handles the full file, and can do cross-cutting replaces (e.g., global `rgba(255,255,255,...)` → warm palette). Only use `patch` for single, simple CSS rule changes.
- **Skip lintJs on quote-heavy changes**: UI changes with many HTML-in-JS template strings may trigger ESLint false positives. Build with `./gradlew assembleDebug -x lintJs` to bypass. Always verify JS syntax with `node -e "new Function(...)"` first.

## Warm Milk-Tea Theme (v3.8-0520i)

Full color palette for the warm-tone redesign. All 44 instances of `rgba(255,255,255,...)` were replaced with `rgba(225,205,175,...)` for a warm ivory tint.

| Role | CSS Variable | Value | Notes |
|------|-------------|-------|-------|
| Background | `--bg` | `#1c1814` | Deep espresso brown |
| Card surface | `--card` | `rgba(210,190,160,0.06)` | Milk tea tint |
| Card border | `--cardBorder` | `rgba(210,190,160,0.10)` | Warm border |
| Text | `--fg` | `rgba(255,248,238,0.92)` | Warm ivory |
| Gray text | `--gray` | `rgba(210,190,160,0.55)` | Beige-gray |
| Gain (涨) | `--red` | `#E07B5A` | Terracotta warm red |
| Loss (跌) | `--green` | `#8DA870` | Sage warm green |
| Accent | `--blue` | `#B89960` | Amber gold |
| Yellow | `--yellow` | `#D4A540` | Warm amber |
| Purple | `--purple` | `#A08070` | Mauve |
| Orange | `--orange` | `#D4935C` | Copper |
| Cyan | `--cyan` | `#80A898` | Teal-green |
| Table stripe | (hardcoded) | `rgba(200,175,140,0.25)` | Milk tea even rows |
| Confirmed row | (hardcoded) | `rgba(141,168,112,0.12)` | Sage tint |
| Modal borders | (hardcoded) | `#2a2420` | Warm dark (replaced #1e2530) |
