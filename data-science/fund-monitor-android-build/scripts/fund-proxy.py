#!/usr/bin/env python3
"""基金数据代理 - 转发东方财富 f10/lsjz API（绕过浏览器 Referer 限制）"""
import http.server, urllib.request, ssl, json, re, sys, os

PORT = 18900
ctx = ssl._create_unverified_context()

class Proxy(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        m = re.match(r'/nav/(\d{6})', self.path)
        if m:
            code = m.group(1)
            try:
                url = f'https://api.fund.eastmoney.com/f10/lsjz?fundCode={code}&pageIndex=1&pageSize=1'
                req = urllib.request.Request(url, headers={
                    'Referer': 'https://fundf10.eastmoney.com/',
                    'User-Agent': 'Mozilla/5.0'
                })
                resp = urllib.request.urlopen(req, timeout=8, context=ctx)
                data = json.loads(resp.read().decode())
                if data.get('ErrCode') == 0:
                    nav_list = data.get('Data',{}).get('LSJZList',[])
                    if nav_list:
                        latest = nav_list[0]
                        result = {
                            'date': latest.get('FSRQ',''),
                            'dwjz': latest.get('DWJZ',''),
                            'chg_pct': float(latest.get('JZZZL',0))
                        }
                        self._json(result); return
                self._json(None)
            except Exception as e:
                self._json(None)
        else:
            self.send_response(404); self.end_headers()

    def _json(self, data):
        self.send_response(200)
        self.send_header('Content-Type','application/json')
        self.send_header('Access-Control-Allow-Origin','*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, *a): pass

if __name__ == '__main__':
    httpd = http.server.HTTPServer(('0.0.0.0',PORT), Proxy)
    print(f'Fund proxy on :{PORT}')
    httpd.serve_forever()
