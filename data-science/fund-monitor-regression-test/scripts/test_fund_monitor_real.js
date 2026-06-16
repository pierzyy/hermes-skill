/**
 * Real API fetchers for integration tests
 */
const HDR = {'User-Agent':'Mozilla/5.0'};

async function fetchF10Nav(code) {
  const url = `https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=1&callback=jQuery341`;
  try {
    const resp = await fetch(url, {headers:{...HDR,'Referer':'https://fundf10.eastmoney.com/'},signal:AbortSignal.timeout(8000)});
    const text = await resp.text();
    const m = text.match(/jQuery\d*\((.*)\)/);
    if (!m) return null;
    const data = JSON.parse(m[1]);
    if (data?.Data?.LSJZList?.length) {
      const item = data.Data.LSJZList[0];
      return {
        dwjz: item.DWJZ,
        jzrq: item.FSRQ,
        chg_pct: item.JZZZL !== undefined && item.JZZZL !== '' ? parseFloat(item.JZZZL) : null,
        source: '东方财富'
      };
    }
  } catch(e) {}
  return null;
}

async function fetchFundData(code) {
  try {
    const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    const resp = await fetch(url, {headers:{...HDR,'Referer':'https://fund.eastmoney.com/'},signal:AbortSignal.timeout(8000)});
    const text = await resp.text();
    const m = text.match(/jsonpgz\((.*)\)/);
    if (m) {
      const d = JSON.parse(m[1]);
      return {dwjz:d.dwjz||'',gsz:d.gsz||'',gszzl:d.gszzl||'N/A',gztime:d.gztime||'',jzrq:d.jzrq||'',source:'天天基金'};
    }
  } catch(e) {}
  return null;
}

async function fetchETF(ticker, pref) {
  const etfs = [];
  if (pref==='em') {
    try {
      const u = `https://push2.eastmoney.com/api/qt/stock/get?secid=105.${ticker}&fields=f43,f57,f58,f169,f170`;
      const r = await fetch(u,{headers:{...HDR,'Referer':'https://quote.eastmoney.com/'},signal:AbortSignal.timeout(8000)});
      const d = await r.json();
      if (d?.data?.f43) etfs.push({chg_pct:d.data.f170/100,price:d.data.f43/1000,name:d.data.f58,source:'东方财富',ticker});
    } catch(e) {}
  }
  try {
    const u = `https://hq.sinajs.cn/list=gb_${ticker.toLowerCase()}`;
    const r = await fetch(u,{headers:{...HDR,'Referer':'https://finance.sina.com.cn/'},signal:AbortSignal.timeout(8000)});
    const t = await r.text();
    const m = t.match(/"([^"]*)"/);
    if (m) {
      const p = m[1].split(',');
      if (p.length>=3 && p[1]) etfs.push({chg_pct:parseFloat(p[2]),price:parseFloat(p[1]),name:p[0],source:'新浪财经',ticker});
    }
  } catch(e) {}
  return etfs[0] || null;
}

module.exports = { fetchF10Nav, fetchFundData, fetchETF };
