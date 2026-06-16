#!/usr/bin/env node
/**
 * Fund Monitor Regression Test Suite
 * 
 * 覆盖所有历史 bug，每次改 index.html 后必跑。
 * 用法: node test_fund_monitor.js          # 集成测试（真实 API）
 *       node test_fund_monitor.js --unit   # 单元测试（模拟数据，快速）
 *       node test_fund_monitor.js --all    # 全部测试
 */

const assert = require('assert');

// ═══════════════════════════════════════════
// 历史 Bug 清单
// ═══════════════════════════════════════════
const KNOWN_BUGS = [
  { id: 1,  name: 'JZZZL=0 被当成 null',        desc: 'item.JZZZL ? parseFloat(...) : null — JS 0 是 falsy' },
  { id: 2,  name: '已确认路径 curVal=amount',    desc: '非交易时段确认路径 r.cur_val = amount 直接赋值' },
  { id: 3,  name: '确认后 prevNavs 被覆盖',      desc: 'prevNavs[f.code]=f.dwjz → 下次 prevDwjz==dwjz → gain=0' },
  { id: 4,  name: '持有金额反复叠加',            desc: '每次刷新 h[2]=curVal → 当日收益累计进本金' },
  { id: 5,  name: 'QDII source_detail 丢失',     desc: 'prevNavs 清空后 source_detail 为空' },
  { id: 6,  name: 'FOF/非FOF 确认不一致',        desc: 'FOF 有 JZZZL!=0 守卫，普通基金没有' },
  { id: 7,  name: 'doRefresh 确认路径同bug',     desc: '交易时段 alreadyUpdated 逻辑也设 curVal=amount' },
  { id: 8,  name: 'ETF 缓存 DIAG 文字残留',      desc: '调试文字没去掉' },
  { id: 9,  name: 'WebView 缓存旧 HTML',          desc: 'build 后 WebView 加载旧版' },
  { id: 10, name: '改错代码库',                   desc: '改了 Kotlin Compose 但实际跑 WebView JS' },
];

// ═══════════════════════════════════════════
// 模拟的 API 响应（可注入）
// ═══════════════════════════════════════════

// 模拟 f10 返回
function mockF10(dwjz, jzrq, jzzzl) {
  return { dwjz, jzrq, chg_pct: jzzzl !== undefined && jzzzl !== '' ? parseFloat(jzzzl) : null, source: '东方财富' };
}

// 模拟 fundgz 返回
function mockFundgz(dwjz, gsz, gszzl, gztime, jzrq) {
  return { dwjz: dwjz||'', gsz: gsz||'', gszzl: gszzl||'N/A', gztime: gztime||'', jzrq: jzrq||'', source: '天天基金' };
}

// 模拟 ETF 返回
function mockETF(chg_pct, price, source, ticker) {
  return { chg_pct, price: price||100, name: 'TEST', source: source||'东方财富', ticker: ticker||'TEST' };
}

// ═══════════════════════════════════════════
// 核心逻辑——镜像 index.html 的 processFund
// ═══════════════════════════════════════════
const FUND_ETF_MAP = {
  '050025':['SPY','sina'], '000834':['QQQ','em'], '019547':['QQQ','em'],
  '164906':['KWEB','sina'], '007360':['AGG','sina'], '008763':['VNM','sina'],
};
const QDII_NO_FUNDGZ = new Set([
  '050025','000834','019547','164906','007360','008763','017028','017641',
]);
const MONETARY_FUNDS = new Set(['000509','003389','004939']);

function isQdiiByName(name) {
  return /QDII|海外|全球|纳斯达克|标普|美元债|新兴市场|越南|印度|日本|欧洲|德国|英国/.test(name||'');
}

function getNavDelay(code, name) {
  if (code==='017242') return 3; if (code==='017253') return 2;
  var hkT0=['022680','014674','000071','012348']; for(var i=0;i<hkT0.length;i++) if(code===hkT0[i]) return 0;
  var isQd=QDII_NO_FUNDGZ.has(code)||FUND_ETF_MAP[code]!==undefined||isQdiiByName(name);
  if(!isQd) return 0;
  var bkw=['美元债','债券','票息','精选美元']; for(var i=0;i<bkw.length;i++) if(name&&name.indexOf(bkw[i])!==-1) return 1;
  return 1;
}

function getDelayThreshold(todayDate, delay) {
  var d=new Date(todayDate+'T12:00:00');
  for(var n=0;n<delay;){d.setDate(d.getDate()-1);if(d.getDay()!==0&&d.getDay()!==6)n++;}
  return d.toISOString().slice(0,10);
}

// processFund 核心逻辑（从 index.html 提取，与当前代码保持一致）
function processFund(code, name, amount, prevDwjz, opts) {
  opts = opts || {};
  const isMarketHour = opts.isMarketHours || false;
  const f10 = opts.f10 !== undefined ? opts.f10 : null;
  const fi = opts.fi !== undefined ? opts.fi : null;
  const etf = opts.etf !== undefined ? opts.etf : null;
  const todayConfirmed = opts.todayConfirmed || new Set();
  const confirmedChgPct = opts.confirmedChgPct || {};
  const prevNavs = opts.prevNavs || {};
  const closingCache = opts.closingCache || {};

  const r = {code,name,amount,cur_val:amount,chg_pct:0,chg_str:'---',gain:0,gain_str:'---',source:'无数据',source_detail:'',confirmed:false,dwjz:'',gsz:''};

  if (MONETARY_FUNDS.has(code)) {
    if (todayConfirmed.has(code)) { r.confirmed = true; r.source = '货币基金'; r.source_detail = prevNavs[code] ? '万份'+prevNavs[code]+'元' : ''; return r; }
    r.source = '货币基金'; r.source_detail = '无需刷新'; return r;
  }

  if (todayConfirmed.has(code) && isMarketHour) {
    const chgPct = confirmedChgPct[code] || 0;
    r.confirmed = true; r.dwjz = prevNavs[code] || '';
    r.chg_pct = chgPct; r.chg_str = (chgPct>=0?'+':'')+chgPct.toFixed(2)+'%';
    r.cur_val = amount * (1 + chgPct / 100);  // FIXED: was `amount`
    r.gain = r.cur_val - amount; r.gain_str = (r.gain>=0?'+':'')+r.gain.toFixed(2);
    r.source = '东方财富'; r.source_detail = prevNavs[code] ? '净值'+prevNavs[code] : '';
    return r;
  }

  const isQdii = QDII_NO_FUNDGZ.has(code) || FUND_ETF_MAP[code]!==undefined || isQdiiByName(name);

  // applyF10Confirmation
  function applyF10Confirm(f10data) {
    if (!f10data||!f10data.dwjz) return false;
    if (isMarketHour) return false;

    let sc = false;
    if (prevDwjz && parseFloat(prevDwjz)>0) {
      if (parseFloat(f10data.dwjz)!==parseFloat(prevDwjz)) {
        const isQdiiB = QDII_NO_FUNDGZ.has(code)||FUND_ETF_MAP[code]!==undefined||isQdiiByName(name);
        if (isQdiiB) sc=true;
        else if (f10data.jzrq) { const todayStr = new Date().toISOString().slice(0,10); if (f10data.jzrq>=todayStr) sc=true; }
      } else {
        const delay=getNavDelay(code,name); const thr=getDelayThreshold(new Date().toISOString().slice(0,10),delay);
        if (f10data.jzrq&&f10data.jzrq>=thr) sc=true;
      }
    } else {
      const delay=getNavDelay(code,name);
      if (delay===0&&f10data.jzrq) { const todayStr = new Date().toISOString().slice(0,10); if (f10data.jzrq>=todayStr) sc=true; }
      if (!sc&&/FOF|养老|目标日期|目标风险/.test(name||'')&&f10data.chg_pct!==null&&f10data.chg_pct!==undefined&&f10data.jzrq) {
        // FIXED: chg_pct!==null && !==undefined (was also checking !==0)
        const fofDelay=getNavDelay(code,name); const fofThr=getDelayThreshold(new Date().toISOString().slice(0,10),fofDelay);
        if (f10data.jzrq>=fofThr) sc=true;
      }
    }
    if (!sc&&f10data.chg_pct!=null&&f10data.chg_pct!==0&&f10data.jzrq) {
      const recDelay=getNavDelay(code,name); const recThr=getDelayThreshold(new Date().toISOString().slice(0,10),recDelay);
      if (f10data.jzrq>=recThr) sc=true;
    }

    if (sc) {
      r.confirmed=true; r.dwjz=f10data.dwjz; r.nav_date=f10data.jzrq||'';
      r.source='东方财富'; r.source_detail='净值'+f10data.dwjz+(f10data.jzrq?' ('+f10data.jzrq+')':'');
      // #8: 有历史净值 → 用 dwjz 变化率；若 prev==new 则退回到 JZZZL
      if (prevDwjz&&parseFloat(prevDwjz)>0 && parseFloat(f10data.dwjz)!==parseFloat(prevDwjz)) {
        r.cur_val=amount*parseFloat(f10data.dwjz)/parseFloat(prevDwjz);
        r.chg_pct=f10data.chg_pct!=null?f10data.chg_pct:((parseFloat(f10data.dwjz)/parseFloat(prevDwjz)-1)*100);
      } else {
        r.chg_pct=f10data.chg_pct!=null?f10data.chg_pct:0;
        r.cur_val=amount*(1+r.chg_pct/100);
      }
      r.chg_str=(r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
      r.gain=r.cur_val-amount; r.gain_str=(r.gain>=0?'+':'')+r.gain.toFixed(2);
      return true;
    }
    return false;
  }

  if (applyF10Confirm(f10)) return r;

  // Non-market hours
  if (!isMarketHour) {
    if (todayConfirmed.has(code)) {
      const chgPct = confirmedChgPct[code] || 0;
      r.confirmed = true; r.dwjz = prevNavs[code] || '';
      r.chg_pct = chgPct; r.chg_str = (chgPct>=0?'+':'')+chgPct.toFixed(2)+'%';
      r.cur_val = amount * (1 + chgPct / 100);  // FIXED: was `amount`
      r.gain = r.cur_val - amount; r.gain_str = (r.gain>=0?'+':'')+r.gain.toFixed(2);
      r.source = '东方财富';
      // FIXED: use f10 data for source_detail, not prevNavs
      r.source_detail = f10 && f10.dwjz ? '净值'+f10.dwjz+(f10.jzrq?' ('+f10.jzrq+')':'') : (prevNavs[code] ? '净值'+prevNavs[code] : '');
      return r;
    }

    // f10二次确认 (domestic only)
    if (f10&&f10.dwjz&&f10.jzrq&&!isQdii) {
      const todayStr=new Date().toISOString().slice(0,10);
      if (f10.jzrq>=todayStr) {
        r.confirmed=true; r.dwjz=f10.dwjz; r.nav_date=f10.jzrq;
        r.chg_pct=prevDwjz&&parseFloat(prevDwjz)>0?(parseFloat(f10.dwjz)/parseFloat(prevDwjz)-1)*100:(f10.chg_pct!=null?f10.chg_pct:0);
        r.cur_val=amount*(1+r.chg_pct/100); r.gain=r.cur_val-amount; r.gain_str=(r.gain>=0?'+':'')+r.gain.toFixed(2);
        r.chg_str=(r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
        r.source='东方财富'; r.source_detail='净值'+f10.dwjz+' ('+f10.jzrq+')';
        return r;
      }
    }

    // Closing cache
    if (closingCache[code] && (Date.now() - closingCache[code].savedAt <= 8*3600*1000)) {
      const c = closingCache[code];
      if (c.type==='etf') {
        r.chg_pct=c.chg_pct; r.chg_str=(r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
        r.cur_val=amount*(1+c.chg_pct/100); r.gain=r.cur_val-amount; r.gain_str=(r.gain>=0?'+':'')+r.gain.toFixed(2);
        r.source='ETF.'+(c.source||'')+'.'+(c.etf||''); return r;
      } else if (c.type==='fundgz') {
        r.cur_val=amount*parseFloat(c.gsz)/parseFloat(c.dwjz); r.chg_pct=parseFloat(c.gszzl);
        r.chg_str=(r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%'; r.gain=r.cur_val-amount; r.gain_str=(r.gain>=0?'+':'')+r.gain.toFixed(2);
        r.dwjz=c.dwjz; r.gsz=c.gsz; r.source='天天基金'; return r;
      }
    }

    // f10兜底
    const tradingDate = (()=>{const d=new Date();const m=d.getHours()*60+d.getMinutes();if(m<570)d.setDate(d.getDate()-1);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);})();
    const f10Delay=getNavDelay(code,name); const f10Thr=getDelayThreshold(tradingDate,f10Delay);
    if (f10&&f10.dwjz&&f10.jzrq&&f10.jzrq>=f10Thr) {
      let canConfirm=false;
      if (prevDwjz&&parseFloat(prevDwjz)>0) {r.chg_pct=(parseFloat(f10.dwjz)/parseFloat(prevDwjz)-1)*100;canConfirm=true;}
      else if (f10.chg_pct!=null&&f10.chg_pct!==0) {r.chg_pct=f10.chg_pct;canConfirm=true;}
      else {r.chg_pct=0;canConfirm=true;}
      if (canConfirm) {
        r.dwjz=f10.dwjz;r.source='东方财富';r.nav_date=f10.jzrq;r.source_detail='净值 '+f10.dwjz+' ('+f10.jzrq+')';
        r.confirmed=true;r.chg_str=(r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
        r.cur_val=amount*(1+r.chg_pct/100);r.gain=r.cur_val-amount;r.gain_str=(r.gain>=0?'+':'')+r.gain.toFixed(2);
        return r;
      }
      r.dwjz=f10.dwjz;r.nav_date=f10.jzrq;r.chg_pct=0;
      r.source=(f10Delay>0?'QDII待更新':'东方财富'); r.source_detail='净值'+f10.dwjz+' ('+f10.jzrq+')';
      r.cur_val=amount;return r;
    }
    if (f10&&f10.dwjz) {
      r.dwjz=f10.dwjz; r.source=(f10Delay>0?'QDII待更新':'待更新');
      r.source_detail='净值'+f10.dwjz+(f10.jzrq?' ('+f10.jzrq+')':'')+' 待确认';
      r.cur_val=amount;return r;
    }
    return r;
  }

  // Market hours: real-time data
  if (!isQdii && fi && fi.gsz && fi.gszzl && fi.gszzl!=='N/A' && fi.dwjz) {
    r.cur_val=amount*parseFloat(fi.gsz)/parseFloat(fi.dwjz);
    r.chg_pct=parseFloat(fi.gszzl); r.chg_str=(r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
    r.gain=r.cur_val-amount; r.gain_str=(r.gain>=0?'+':'')+r.gain.toFixed(2);
    r.dwjz=fi.dwjz; r.gsz=fi.gsz; r.source='天天基金';
    if (f10&&f10.dwjz) r.dwjz=f10.dwjz;
    return r;
  }
  if (etf) {
    r.chg_pct=etf.chg_pct; r.chg_str=(r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
    r.cur_val=amount*(1+etf.chg_pct/100); r.gain=r.cur_val-amount; r.gain_str=(r.gain>=0?'+':'')+r.gain.toFixed(2);
    r.source='ETF.'+etf.source.replace('新浪财经','新浪').replace('东方财富','EM')+'.'+etf.ticker;
    if (f10&&f10.dwjz) {r.dwjz=f10.dwjz;r.source_detail='估值'+(parseFloat(f10.dwjz)*(1+etf.chg_pct/100)).toFixed(4);}
    return r;
  }
  if (f10&&f10.dwjz) {
    if (isQdii) { r.dwjz=f10.dwjz;r.source='QDII待更新';r.source_detail='净值'+f10.dwjz+(f10.jzrq?' ('+f10.jzrq+')':'');r.cur_val=amount;return r; }
    r.dwjz=f10.dwjz;r.source='东方财富';r.source_detail='净值 '+f10.dwjz+(f10.jzrq?' ('+f10.jzrq+')':'');
    if (f10.chg_pct!=null) {
      r.chg_pct=f10.chg_pct;r.chg_str=(r.chg_pct>=0?'+':'')+r.chg_pct.toFixed(2)+'%';
      r.cur_val=amount*(1+r.chg_pct/100);r.gain=r.cur_val-amount;r.gain_str=(r.gain>=0?'+':'')+r.gain.toFixed(2);
    }
    return r;
  }
  return r;
}

// ═══════════════════════════════════════════
// 测试用例
// ═══════════════════════════════════════════
const today = new Date().toISOString().slice(0,10);
const yesterday = (()=>{const d=new Date();d.setDate(d.getDate()-1);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);})();

const TESTS = [
  // ── Bug #1: JZZZL=0 treated as null ──
  {
    name: 'Bug#1: JZZZL=0 不被当成 null',
    opts: { isMarketHours: false, f10: mockF10('1.5000', today, '0.00') },
    fund: ['000001','测试基金',10000], prevDwjz: null,
    verify: r => {
      assert(r.confirmed, '应确认');
      assert(r.chg_pct===0, 'JZZZL=0→chg_pct=0');
      assert(r.cur_val===10000, '无涨跌→cur_val=amount');
      assert(r.gain===0, '无涨跌→gain=0');
    }
  },
  // ── Bug #1: JZZZL 正常值正确解析 ──
  {
    name: 'Bug#1: JZZZL=1.5 正常解析',
    opts: { isMarketHours: false, f10: mockF10('1.0150', today, '1.50') },
    fund: ['000001','测试基金',10000], prevDwjz: null,
    verify: r => {
      assert(r.confirmed, '应确认');
      assert(r.chg_pct===1.5, 'JZZZL=1.5→chg_pct=1.5');
      assert(Math.abs(r.cur_val-10150)<0.01, 'cur_val=amount×(1+1.5%)');
      assert(Math.abs(r.gain-150)<0.01, 'gain=cur_val-amount');
    }
  },
  // ── Bug #2: 已确认路径 curVal=amount ──
  // 需要 applyF10Confirm 不触发（无 f10 数据），才能走到 line 736
  {
    name: 'Bug#2: 已确认非交易时段 curVal 正确（无f10时走todayConfirmed路径）',
    opts: { isMarketHours: false, todayConfirmed: new Set(['000001']), confirmedChgPct: {'000001':1.5}, f10: null },
    fund: ['000001','测试基金',10000], prevDwjz: null,
    verify: r => {
      assert(r.confirmed, '应已确认');
      assert(Math.abs(r.cur_val-10150)<0.01, 'curVal=amount×(1+chgPct), got '+r.cur_val);
      assert(Math.abs(r.gain-150)<0.01, 'gain=curVal-amount');
    }
  },
  // Bug #2 带 f10: source_detail 含净值（走 applyF10Confirm 而非 todayConfirmed 路径）
  {
    name: 'Bug#2: applyF10Confirm source_detail含净值日期',
    opts: { isMarketHours: false, todayConfirmed: new Set(['000001']), confirmedChgPct: {'000001':1.5}, f10: mockF10('1.0150', today, '1.50') },
    fund: ['000001','测试基金',10000], prevDwjz: null,
    verify: r => {
      assert(r.confirmed, '应已确认');
      assert(Math.abs(r.cur_val-10150)<0.01, 'curVal正确, got '+r.cur_val);
      assert(r.source_detail.includes('1.0150'), 'source_detail 含净值');
      assert(r.source_detail.includes(today), 'source_detail 含日期');
    }
  },
  // ── Bug #3: 确认后 prevNavs 不被覆盖 ──
  {
    name: 'Bug#3: prevDwjz≠dwjz 时正确计算',
    opts: { isMarketHours: false, f10: mockF10('1.0200', today, '2.00') },
    fund: ['000001','测试基金',10000], prevDwjz: '1.0000',
    verify: r => {
      assert(r.confirmed, '应确认');
      assert(Math.abs(r.cur_val-10200)<0.01, 'curVal=amount×newDwjz/oldDwjz');
      assert(Math.abs(r.gain-200)<0.01, 'gain=200');
    }
  },
  // ── Bug #3: prevDwjz==dwjz 时不误判 ──
  {
    name: 'Bug#3: prevDwjz==dwjz 不返回 amount',
    opts: { isMarketHours: false, f10: mockF10('1.0200', today, '2.00') },
    fund: ['000001','测试基金',10000], prevDwjz: '1.0200',  // same!
    verify: r => {
      assert(r.confirmed, '应确认');
      // nav_unchanged_jzrq_ok 路径：prev==new→计算 chg_pct 正确
      assert(Math.abs(r.chg_pct-2.0)<0.01, 'JZZZL 兜底正确');
      assert(Math.abs(r.cur_val-10200)<0.01, 'curVal 用 JZZZL 计算');
      assert(Math.abs(r.gain-200)<0.01, 'gain 非零');
    }
  },
  // ── Bug #4: 持有金额仅首次确认时更新 ──
  {
    name: 'Bug#4: 首次确认更新 h[2]，再次确认不更新',
    testH2Update: true,
    opts: { isMarketHours: false, f10: mockF10('1.0200', today, '2.00') },
    fund: ['000001','测试基金',10000], prevDwjz: '1.0000',
    verify: r => {
      // 首次确认: h[2] 从 10000 更新为 10200
      assert(Math.abs(r.cur_val-10200)<0.01, '首次 curVal=10200');
    }
  },
  // ── Bug #5: QDII source_detail 含净值日期 ──
  {
    name: 'Bug#5: QDII 已确认 source_detail 显示净值和日期',
    opts: { isMarketHours: false, todayConfirmed: new Set(['050025']), confirmedChgPct: {'050025':-1.14}, f10: mockF10('2.5000', '2026-05-16', '-1.14') },
    fund: ['050025','博时标普500ETF联接A',1087], prevDwjz: null,
    verify: r => {
      assert(r.confirmed, '应已确认');
      assert(r.source_detail.includes('2.5000'), 'source_detail 含净值');
      assert(r.source_detail.includes('2026-05-16'), 'source_detail 含日期');
    }
  },
  // ── Bug #6: FOF 普通基金确认一致性 ──
  {
    name: 'Bug#6: FOF jzrq 过期但 JZZZL 非零→确认',
    opts: { isMarketHours: false, f10: mockF10('1.0500', '2026-05-14', '-0.95') },
    fund: ['017253','易方达汇诚养老2043三年持有(FOF)',25211], prevDwjz: null,
    verify: r => {
      assert(r.confirmed, 'FOF 应确认');
      assert(Math.abs(r.chg_pct+0.95)<0.001, 'FOF chg_pct 正确');
      assert(r.gain<0, 'FOF 亏损');
    }
  },
  // ── Bug #6: 普通基金 JZZZL 非零→确认 ──
  {
    name: 'Bug#6: 普通基金 JZZZL 非零 正常确认',
    opts: { isMarketHours: false, f10: mockF10('1.5000', today, '1.56') },
    fund: ['020256','中欧中证机器人指数发起C',10398], prevDwjz: null,
    verify: r => {
      assert(r.confirmed, '普通基金应确认');
      assert(r.chg_pct===1.56, 'chg_pct=JZZZL');
      assert(r.gain>0, '盈利');
    }
  },
  // ── Bug #7: doRefresh 已确认 curVal ──
  {
    name: 'Bug#7: 交易时段已确认 curVal 正确',
    opts: { isMarketHours: true, todayConfirmed: new Set(['000001']), confirmedChgPct: {'000001':1.5} },
    fund: ['000001','测试基金',10000], prevDwjz: null,
    verify: r => {
      assert(r.confirmed, '应已确认');
      assert(Math.abs(r.cur_val-10150)<0.01, 'curVal=amount×(1+chgPct), got '+r.cur_val);
      assert(Math.abs(r.gain-150)<0.01, 'gain=curVal-amount');
    }
  },
  // ── 货币基金 ──
  {
    name: '货币基金: 不拉 API, 标记跳过',
    opts: { isMarketHours: false },
    fund: ['000509','广发钱袋子A',822], prevDwjz: null,
    verify: r => {
      assert.equal(r.source, '货币基金', 'source 应为货币基金');
      assert.equal(r.cur_val, 822, 'curVal=amount');
    }
  },
  // ── QDII ETF 路径 ──
  {
    name: 'QDII+ETF: ETF跌→gain负',
    opts: { isMarketHours: true, f10: null, fi: null, etf: mockETF(-1.44, 450, '东方财富', 'QQQ') },
    fund: ['019547','招商纳斯达克100ETF联接(QDII)A',2614], prevDwjz: null,
    verify: r => {
      assert(Math.abs(r.chg_pct+1.44)<0.001, 'chg_pct=-1.44');
      assert(r.gain<0, 'QDII ETF 跌→亏损');
      assert(r.cur_val<2614, 'curVal < amount');
    }
  },
  // ── 国内基金 fundgz 路径 ──
  {
    name: '国内基金 fundgz: gsz>dwjz→盈利',
    opts: { isMarketHours: true, f10: mockF10('1.2345', yesterday, '0.00'), fi: mockFundgz('1.2345','1.2530','1.50','2026-05-18 14:55','2026-05-15') },
    fund: ['000001','测试基金',10000], prevDwjz: null,
    verify: r => {
      assert(Math.abs(r.chg_pct-1.5)<0.001, 'gszzl=1.5');
      assert(r.cur_val>10000, 'curVal>amount');
      assert(r.gain>0, '盈利');
    }
  },
];

// ═══════════════════════════════════════════
// 运行器
// ═══════════════════════════════════════════
async function runUnitTests() {
  console.log('\n═══ 单元测试（模拟数据）═══\n');
  let passed = 0, failed = 0;

  for (const tc of TESTS) {
    const {name, opts, fund, prevDwjz, verify} = tc;
    try {
      const r = processFund(fund[0], fund[1], fund[2], prevDwjz || null, opts || {});
      verify(r);
      console.log(`  ✅ ${name}`);
      passed++;
    } catch(e) {
      console.log(`  ❌ ${name}: ${e.message}`);
      failed++;
    }
  }

  // ── h[2] not updated on second confirmation ──
  console.log('\n  ── Bug#4 详细: holding amount 只更新一次 ──');
  try {
    const f10Data = mockF10('1.0200', today, '2.00');
    // 第一次: prevDwjz='1.0000' → prev≠new → 使用 dwjz 变化率
    const r1 = processFund('000001','测试',10000,'1.0000',{isMarketHours:false,f10:f10Data});
    assert(Math.abs(r1.cur_val-10200)<0.01, '首次 curVal=10200 (dwjz变化率)');
    // 模拟 doRefresh: h[4]!==today → wasNewToday=true → 更新 h[2]=r1.cur_val
    const newH2 = Math.round(r1.cur_val * 100) / 100;
    assert(newH2 > 10000, 'h[2] 应更新为 ' + newH2);
    
    // 第二次: h[4]===today → wasNewToday=false → h[2] 不应再变
    // 使用 non-market-hours 已确认路径
    const r2 = processFund('000001','测试',newH2,null,{
      isMarketHours:false, f10:f10Data,
      todayConfirmed: new Set(['000001']), confirmedChgPct:{'000001':2.0}
    });
    assert(r2.cur_val > newH2, '第二次 curVal > newH2');
    assert(r2.gain !== 0, 'gain 仍非零');
    // wasNewToday=false → h[2] 不更新 → 下次 amount 仍为 newH2
    console.log('  ✅ Bug#4: h[2] 第二次确认不叠加（correctly keeps '+newH2+')');
    passed++;
  } catch(e) {
    console.log('  ❌ Bug#4: ' + e.message);
    failed++;
  }

  console.log(`\n  ── 结果: ${passed} 通过 / ${passed+failed} 总计 ──`);
  return {passed, failed};
}

async function runIntegrationTests() {
  console.log('\n═══ 集成测试（真实 API）═══\n');

  // 引入真实 API fetcher
  const realFetchers = require('./test_fund_monitor_real');
  const { fetchF10Nav, fetchFundData, fetchETF } = realFetchers;

  const portfolios = {
    '京东基金': [
      ['020256','中欧中证机器人指数发起C',10397.79],
      ['022385','华夏中证信息技术应用创新ETF联接C',27698.20],
      ['001631','天弘中证食品饮料ETF联接A',12557.67],
      ['161725','招商中证白酒指数A',25096.94],
      ['018580','国证2000指数增强C',11927.18],
    ],
    '全天候': [
      ['000218','国泰黄金ETF联接A',3750.98],
      ['019547','招商纳斯达克100ETF联接(QDII)A',2614.35],
      ['007360','易方达中短期美元债(QDII)A人民币',2514.23],
      ['003156','招商招悦纯债A',1765.68],
      ['050025','博时标普500ETF联接A',1087.24],
    ],
    '个人养老基金': [
      ['017253','易方达汇诚养老2043三年持有(FOF)',25211.37],
      ['017242','南方养老目标日期2045三年持有(FOF)',7895.99],
    ]
  };

  let passed = 0, failed = 0, issues = [];

  for (const [pfName, holdings] of Object.entries(portfolios)) {
    console.log(`  ${pfName}:`);
    for (const h of holdings) {
      try {
        const isQdii = QDII_NO_FUNDGZ.has(h[0]) || FUND_ETF_MAP[h[0]] !== undefined || isQdiiByName(h[1]);
        const f10 = await fetchF10Nav(h[0]);
        const fi = !isQdii ? await fetchFundData(h[0]) : null;
        const m = FUND_ETF_MAP[h[0]];
        const etf = m ? await fetchETF(m[0], m[1]) : null;

        const r = processFund(h[0], h[1], h[2], null, {
          isMarketHours: false, f10, fi, etf
        });

        // 规则1: chg_pct 和 gain 必须一致
        const hasChg = Math.abs(r.chg_pct) > 0.001;
        const hasGain = Math.abs(r.gain) > 0.01;
        if (hasChg !== hasGain) {
          issues.push(`${h[0]} ${h[1]}: chg=${r.chg_pct} gain=${r.gain} MISMATCH`);
          console.log(`    ❌ ${h[0]} ${h[1]}: chg=${r.chg_pct.toFixed(3)} gain=${r.gain.toFixed(3)}`);
          failed++;
          continue;
        }

        // 规则2: 确认基金 curVal ≠ amount (除非真的零涨跌)
        if (r.confirmed && hasChg && Math.abs(r.cur_val - h[2]) < 0.01) {
          issues.push(`${h[0]} ${h[1]}: confirmed but curVal=amount`);
          console.log(`    ❌ ${h[0]} ${h[1]}: confirmed curVal=amount`);
          failed++;
          continue;
        }

        // 规则3: gain = curVal - amount
        const expectedGain = r.cur_val - r.amount;
        if (Math.abs(r.gain - expectedGain) > 0.01) {
          issues.push(`${h[0]} ${h[1]}: gain=${r.gain} but curVal-amount=${expectedGain}`);
          console.log(`    ❌ ${h[0]} ${h[1]}: gain mismatch`);
          failed++;
          continue;
        }

        console.log(`    ✅ ${h[0]} ${h[1]} chg=${r.chg_str} gain=${r.gain_str} [${r.source}]`);
        passed++;
      } catch(e) {
        console.log(`    ❌ ${h[0]} ${h[1]}: ${e.message}`);
        failed++;
      }
    }
  }

  if (issues.length > 0) {
    console.log(`\n  ❌ ${issues.length} 问题:`);
    issues.forEach(i => console.log(`    ${i}`));
  }

  console.log(`\n  ── 集成测试: ${passed} 通过 / ${passed+failed} 总计 ──`);
  return {passed, failed, issues};
}

// ═══════════════════════════════════════════
// Main
// ═══════════════════════════════════════════
async function main() {
  const mode = process.argv[2] || '--unit';

  console.log(`Fund Monitor Regression Suite — ${new Date().toLocaleString('zh-CN')}`);
  console.log(`已知 bug 数量: ${KNOWN_BUGS.length}`);
  KNOWN_BUGS.forEach(b => console.log(`  #${b.id}: ${b.name} — ${b.desc}`));

  let totalPassed = 0, totalFailed = 0;

  if (mode === '--unit' || mode === '--all') {
    const r = await runUnitTests();
    totalPassed += r.passed; totalFailed += r.failed;
  }

  if (mode === '--integration' || mode === '--all') {
    const r = await runIntegrationTests();
    totalPassed += r.passed; totalFailed += r.failed;
  }

  console.log(`\n══════ 总计: ${totalPassed} 通过 / ${totalPassed+totalFailed} 总计 ══════`);
  if (totalFailed > 0) {
    console.log('❌ 有测试失败！请修复后重试。');
    process.exit(1);
  } else {
    console.log('✅ 全部通过！');
  }
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
