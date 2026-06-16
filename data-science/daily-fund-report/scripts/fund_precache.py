#!/usr/bin/env python3
"""
基金日报预采缓存 — 每天 13:45 自动执行
拉取基金状态、大盘指数、汇率商品，写入 /tmp/fund_cache_*.json
14:00 日报检测到新鲜缓存则跳过对应步骤的爬取，直接读取。

部署: cron 45 13 * * 1-5 (Hermes job 7d9d7bad5c7b)
缓存 TTL: 30 分钟
并发: 15 workers (东方财富限流下限)
"""
import json, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.request import Request, urlopen

CACHE_DIR = "/tmp"
CSV_PATH = "/opt/data/cache/daily_fund_report.csv"
CACHE_TTL = 1800  # 30分钟有效期
MAX_WORKERS = 15  # 并发数

# ── 提取基金代码 ──
def get_fund_codes():
    """从最新 CSV 提取所有基金代码"""
    if not os.path.exists(CSV_PATH):
        return [
            "020256","022385","001304","161725","005928","588090","515630","501092",
            "008591","007531","012323","001180","012708","022680","021598","501205",
            "012348","012349","006105","007474","008356","021051","021053","516020",
            "501303","161831","513100","513050","159941","164824","270023","270042",
            "003718","486001","486002","000834","002891","000071","018807","001668",
        ]
    
    codes = set()
    try:
        with open(CSV_PATH) as f:
            for line in f:
                if line.startswith('#'):
                    continue
                parts = line.strip().split(',')
                if len(parts) >= 4 and parts[2].isdigit() and len(parts[2]) == 6:
                    codes.add(parts[2])
    except:
        pass
    return sorted(codes)

# ── 基金状态 ──
def check_one_fund(code):
    """检查单只基金状态"""
    try:
        req = Request(
            f"http://fund.eastmoney.com/{code}.html",
            headers={"User-Agent": "Mozilla/5.0"}
        )
        resp = urlopen(req, timeout=8)
        html = resp.read().decode('gb2312', errors='ignore')
        
        buy_status = re.search(r'fundBuyStatus\s*=\s*"(\d+)"', html)
        dt_status = re.search(r'fundDtStatus\s*=\s*"(true|false)"', html)
        name_match = re.search(r'<title>([^(]+)\((\d+)\)', html)
        name = name_match.group(1).strip() if name_match else code
        
        limit = ""
        limit_match = re.search(r'(单日累计购买上限)[^)]*\)', html)
        if limit_match:
            limit = re.sub(r'<[^>]*>', '', limit_match.group(0))
        
        return {
            "code": code,
            "name": name,
            "fundBuyStatus": buy_status.group(1) if buy_status else "?",
            "fundDtStatus": dt_status.group(1) if dt_status else "?",
            "limit": limit,
            "checked_at": datetime.now().isoformat(),
        }
    except Exception as e:
        return {"code": code, "name": code, "fundBuyStatus": "?", "fundDtStatus": "?", 
                "limit": "", "checked_at": datetime.now().isoformat(), "error": str(e)[:80]}

def precache_fund_status():
    """批量预采基金状态"""
    codes = get_fund_codes()
    print(f"📊 预采基金状态: {len(codes)} 只基金")
    
    results = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(check_one_fund, c): c for c in codes}
        for i, f in enumerate(as_completed(futures)):
            r = f.result()
            results.append(r)
            if (i + 1) % 20 == 0:
                print(f"  ... {i+1}/{len(codes)}")
    
    out = {
        "source": "eastmoney_fund_status",
        "cached_at": datetime.now().isoformat(),
        "total": len(results),
        "funds": sorted(results, key=lambda x: x["code"]),
    }
    
    abnormal = [f for f in results if f["fundBuyStatus"] not in ("1",)]
    print(f"  ✅ 完成: {len(results)} 只, 异常 {len(abnormal)} 只")
    
    path = f"{CACHE_DIR}/fund_cache_status.json"
    json.dump(out, open(path, "w"), ensure_ascii=False, indent=2)
    return path

# ── 大盘指数 + 汇率 + 商品 ──
def precache_market_data():
    """拉取 Sina 行情数据"""
    print("📈 预采行情数据...")
    
    symbols = [
        "sh000001", "sz399001", "sz399006", "sh000300",
        "sh000688", "sz399005", "sh000016",
        "fx_susdcny", "fx_sghkdcnh",
        "hf_CL", "hf_GC", "hf_SI",
        "int_hangseng", "int_hstech",
    ]
    
    result = {}
    try:
        url = f"http://hq.sinajs.cn/list={','.join(symbols)}"
        req = Request(url, headers={
            "User-Agent": "Mozilla/5.0",
            "Referer": "https://finance.sina.com.cn",
        })
        resp = urlopen(req, timeout=10)
        text = resp.read().decode('gb2312', errors='ignore')
        
        lines = text.strip().split('\n')
        for line in lines:
            match = re.search(r'hq_str_(\w+)="(.+)"', line)
            if match:
                symbol = match.group(1)
                data = match.group(2).split(',')
                result[symbol] = {
                    "name": data[0] if data else "?",
                    "raw": data,
                    "fetched_at": datetime.now().isoformat(),
                }
    except Exception as e:
        print(f"  ❌ Sina batch failed: {e}")
        for sym in symbols:
            try:
                url = f"http://hq.sinajs.cn/list={sym}"
                req = Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.sina.com.cn"})
                resp = urlopen(req, timeout=5)
                t = resp.read().decode('gb2312', errors='ignore')
                match = re.search(r'="(.+)"', t)
                if match:
                    result[sym] = {"name": sym, "raw": match.group(1).split(','), "fetched_at": datetime.now().isoformat()}
            except Exception as e2:
                result[sym] = {"name": sym, "raw": [], "error": str(e2)[:60], "fetched_at": datetime.now().isoformat()}
    
    out = {
        "source": "sina_market",
        "cached_at": datetime.now().isoformat(),
        "indices": {k: v for k, v in result.items()}
    }
    
    path = f"{CACHE_DIR}/fund_cache_market.json"
    json.dump(out, open(path, "w"), ensure_ascii=False, indent=2)
    print(f"  ✅ 完成: {len(result)} 项")
    return path

# ── 北向资金 ──
def precache_north_flow():
    """拉取北向资金（东方财富）"""
    print("💰 预采北向资金...")
    try:
        url = "http://push2.eastmoney.com/api/qt/kamt.kline/get"
        params = "?fields1=f1,f2,f3,f4&fields2=f51,f52,f53,f54&klt=1&lmt=5"
        req = Request(url + params, headers={"User-Agent": "Mozilla/5.0"})
        resp = urlopen(req, timeout=8)
        data = json.loads(resp.read())
        
        out = {
            "source": "eastmoney_north_flow",
            "cached_at": datetime.now().isoformat(),
            "data": data,
        }
        path = f"{CACHE_DIR}/fund_cache_north.json"
        json.dump(out, open(path, "w"), ensure_ascii=False, indent=2)
        print(f"  ✅ 北向资金已缓存")
        return path
    except Exception as e:
        print(f"  ⚠️ 北向资金失败: {e}")
        return None

def main():
    print(f"🕐 基金日报预采开始 {datetime.now().strftime('%H:%M:%S')}")
    t0 = time.time()
    precache_fund_status()
    precache_market_data()
    precache_north_flow()
    elapsed = time.time() - t0
    print(f"✅ 预采完成，耗时 {elapsed:.0f}s")
    print(f"   缓存文件: {CACHE_DIR}/fund_cache_*.json")
    print(f"   有效期至: {(datetime.now().timestamp() + CACHE_TTL):.0f} (TTL={CACHE_TTL}s)")

if __name__ == "__main__":
    main()
