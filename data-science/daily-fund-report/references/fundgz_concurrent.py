#!/usr/bin/env python3
"""Concurrent fundgz query for daily fund report Step 4.
Query 104 funds via fundgz.1234567.com.cn API using ThreadPoolExecutor.
Produces /tmp/fund_report_step4.json with per-fund estimates and category summaries.
"""

import json
import urllib.request
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict
import sys

PORTFOLIO_JSON = '/tmp/portfolio_data.json'
OUTPUT_JSON = '/tmp/fund_report_step4.json'
MAX_WORKERS = 15
TIMEOUT = 8

def query_fund(code):
    """Query single fund from fundgz API. Returns (code, dict)."""
    try:
        url = f'https://fundgz.1234567.com.cn/js/{code}.js'
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=TIMEOUT)
        content = resp.read().decode('utf-8')
        m = re.search(r'jsonpgz\(({.*?})\)', content)
        if m:
            d = json.loads(m.group(1))
            return code, {
                'name': d.get('name', ''),
                'gsz': d.get('gsz', ''),
                'gszzl': d.get('gszzl', ''),
                'gztime': d.get('gztime', ''),
            }
        return code, {'error': 'no_jsonp', 'raw': content[:80]}
    except Exception as e:
        return code, {'error': str(e)[:80]}


def main():
    with open(PORTFOLIO_JSON, 'r') as f:
        port = json.load(f)

    codes = [f['code'] for f in port['funds']]
    print(f"Querying {len(codes)} funds with {MAX_WORKERS} concurrent workers...", flush=True)

    results = {}
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(query_fund, code): code for code in codes}
        done = 0
        for future in as_completed(futures):
            code, result = future.result()
            results[code] = result
            done += 1
            if done % 20 == 0:
                sys.stdout.write(f'\r  {done}/{len(codes)}')
                sys.stdout.flush()

    success = sum(1 for v in results.values() if 'gszzl' in v)
    print(f'\nDone! {success}/{len(codes)} funds with live data')

    # Category-level weighted changes
    cat_summary = defaultdict(lambda: {'total': 0, 'count': 0, 'weighted_chg': 0})
    for f in port['funds']:
        cat = f['cat']
        code = f['code']
        amt = f['amount']
        cat_summary[cat]['total'] += amt
        if code in results and 'gszzl' in results[code]:
            try:
                chg = float(results[code]['gszzl'])
                cat_summary[cat]['weighted_chg'] += chg * amt
                cat_summary[cat]['count'] += 1
            except ValueError:
                pass

    print("\n=== Category weighted changes ===")
    for cat, info in sorted(cat_summary.items(), key=lambda x: x[1]['total'], reverse=True):
        if info['count'] > 0 and info['total'] > 0:
            wchg = info['weighted_chg'] / info['total']
            print(f"  {cat}: {info['count']} funds, weighted: {wchg:+.2f}%, total: ¥{info['total']:,.0f}")

    # Save results
    output = {
        'funds': results,
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'cat_summary': {
            k: {**v, 'weighted_chg': round(v['weighted_chg'] / v['total'], 3) if v['total'] > 0 else 0}
            for k, v in cat_summary.items()
        },
    }
    with open(OUTPUT_JSON, 'w') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"\nSaved to {OUTPUT_JSON}")


if __name__ == '__main__':
    main()
