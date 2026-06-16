#!/usr/bin/env python3
"""基金状态巡检 — 报告生成脚本
输入: Step 2b 生成的 /tmp/fund_check_xxx/results.txt
输出: 格式化的 Markdown 报告 + JSON 汇总
"""
import csv
import json
import sys
from collections import defaultdict

CSV_PATH = "/opt/data/cache/daily_fund_report.csv"
RESULTS_PATH = sys.argv[1] if len(sys.argv) > 1 else "/tmp/fund_check_xxx/results.txt"
ADVISORY_COMBOS = ["指数生财", "简慢", "全天候", "海外全球", "长赢150", "稳稳财进"]

def main():
    # Load fund names and combo mapping
    code_to_name = {}
    code_to_combos = defaultdict(set)
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if i < 3: continue
            if len(row) < 4: continue
            combo, code, name = row[0].strip(), row[2].strip(), row[3].strip()
            if not code or not code.isdigit(): continue
            code_to_name[code] = name
            code_to_combos[code].add(combo)

    # Load status results
    results = []
    with open(RESULTS_PATH, "r") as f:
        for line in f:
            line = line.strip()
            if not line: continue
            parts = line.split("|")
            if len(parts) < 5: continue
            code, bs, dt, sale, lim_raw = parts[0], parts[1], parts[2], parts[3], parts[4]
            limit = float(lim_raw) if lim_raw and lim_raw != "FETCH_FAIL" else None
            name = code_to_name.get(code, "?")
            combos = ", ".join(sorted(code_to_combos.get(code, set())))

            # Severity classify
            if bs in ("2", "3", "0", "6"):
                severity = "🔴"
                label = {"2": "暂停申购", "3": "封闭期", "0": "未开通", "6": "暂停申购"}.get(bs, f"未知({bs})")
            elif bs == "4":
                if limit and limit <= 10:
                    severity, label = "🔴", "限大额≤10元"
                elif limit and limit <= 100:
                    severity, label = "🟠", "限大额≤100元"
                else:
                    severity, label = "🟡", "限大额"
            elif bs == "1":
                if limit is None:
                    severity, label = "🟢", "开放申购"
                elif limit <= 10:
                    severity, label = "🔴", f"实质关闭(限{limit:.0f}元)"
                elif limit <= 100:
                    severity, label = "🟠", f"QDII极度紧张(限{limit:.0f}元)"
                elif limit <= 5000:
                    severity, label = "🟡", f"严重受限(限{limit:.0f}元)"
                elif limit <= 100000:
                    severity, label = "🟡", f"中度受限(限{limit:.0f}元)"
                else:
                    severity, label = "🟢", "开放申购"
            else:
                severity, label = "❓", f"未知({bs})"

            results.append({
                "code": code, "name": name, "combos": combos,
                "buy_status": bs, "dt_status": dt, "limit": limit,
                "severity": severity, "label": label,
            })

    # Sort by severity
    def sev_rank(r):
        s = r["severity"]
        if "🔴" in s: return 0
        if "🟠" in s: return 1
        if "🟡" in s: return 2
        return 3
    results.sort(key=lambda r: (sev_rank(r), r["limit"] or 999999, r["code"]))

    red = [r for r in results if "🔴" in r["severity"]]
    orange = [r for r in results if "🟠" in r["severity"]]
    yellow = [r for r in results if "🟡" in r["severity"]]
    green = [r for r in results if "🟢" in r["severity"]]

    # Report
    print("=" * 80)
    print("## 基金状态巡检（2026-05-27）")
    print("=" * 80)

    for title, items in [
        ("🔴 暂停申购/限大额/实质关闭", red),
        ("🟠 QDII额度极度紧张（≤100元/日）", orange),
        ("🟡 不同程度限额", yellow),
    ]:
        print(f"\n### {title}")
        if not items:
            print("✅ 无")
            continue
        print(f"| 代码 | 名称 | 申购状态 | 单日限额 | 定投 | 涉及组合 |")
        print(f"|------|------|----------|----------|------|----------|")
        for r in items:
            lim_s = f"{r['limit']:.0f}元" if r["limit"] else "-"
            dt_s = "✅" if r["dt_status"] == "true" else "❌"
            print(f"| {r['code']} | {r['name'][:25]} | {r['label']} | {lim_s} | {dt_s} | {r['combos']} |")

    print(f"\n### 🟢 正常 — {len(green)} 只基金")

    # Summary
    print("\n---")
    print("### 📊 汇总")
    print(f"| 🔴 暂停/关闭 | {len(red)} |")
    print(f"| 🟠 QDII极度紧张 | {len(orange)} |")
    print(f"| 🟡 不同程度限额 | {len(yellow)} |")
    print(f"| 🟢 正常 | {len(green)} |")
    print(f"| **总计** | **{len(results)}** |")
    print(f"异常总数：**{len(red)+len(orange)+len(yellow)}** / {len(results)}")

    # Per combo
    print("\n---\n### 📦 投顾组合整体状态")
    for combo in ADVISORY_COMBOS:
        funds = [r for r in results if combo in r["combos"]]
        if not funds: continue
        r_ct = sum(1 for r in funds if "🔴" in r["severity"])
        o_ct = sum(1 for r in funds if "🟠" in r["severity"])
        y_ct = sum(1 for r in funds if "🟡" in r["severity"])
        g_ct = sum(1 for r in funds if "🟢" in r["severity"])
        issues = []
        if r_ct: issues.append(f"🔴{r_ct}")
        if o_ct: issues.append(f"🟠{o_ct}")
        if y_ct: issues.append(f"🟡{y_ct}")
        status = f"⚠️ {' '.join(issues)}" if issues else "✅ 全部正常"
        print(f"| **{combo}** | {len(funds)}只 | {status} | {g_ct}只正常 |")

if __name__ == "__main__":
    main()
