// Chinese property developers, measured by the one record that is authoritative,
// dated and machine-readable: exchange prices. There is no free public dataset of
// project locations or district-level prices, and no official downloadable list of
// bond defaults - but a listed developer's collapse is written into its own price
// history, and a halt shows up as the tape simply stopping.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

// Ownership is the axis that actually explains the spread, so it is tagged here
// rather than inferred. All of these are public facts from company filings.
const FIRMS = [
  { sym: '3333.HK',   name: '中国恒大',   own: 'private', note: '2024-01 香港高院颁令清盘' },
  { sym: '2007.HK',   name: '碧桂园',     own: 'private' },
  { sym: '1918.HK',   name: '融创中国',   own: 'private' },
  { sym: '0813.HK',   name: '世茂集团',   own: 'private' },
  { sym: '3383.HK',   name: '雅居乐',     own: 'private' },
  { sym: '0884.HK',   name: '旭辉控股',   own: 'private' },
  { sym: '1966.HK',   name: '中骏集团',   own: 'private' },
  { sym: '2777.HK',   name: '富力地产',   own: 'private' },
  { sym: '1638.HK',   name: '佳兆业',     own: 'private' },
  { sym: '1233.HK',   name: '时代中国',   own: 'private' },
  { sym: '1030.HK',   name: '新城发展',   own: 'private' },
  { sym: '0960.HK',   name: '龙湖集团',   own: 'private' },
  { sym: '3377.HK',   name: '远洋集团',   own: 'mixed'   },
  { sym: '2202.HK',   name: '万科企业',   own: 'mixed'   },
  { sym: '600606.SS', name: '绿地控股',   own: 'mixed'   },
  { sym: '000656.SZ', name: '金科股份',   own: 'private' },
  { sym: '600383.SS', name: '金地集团',   own: 'mixed'   },
  { sym: '1109.HK',   name: '华润置地',   own: 'soe'     },
  { sym: '0688.HK',   name: '中国海外发展', own: 'soe'   },
  { sym: '0123.HK',   name: '越秀地产',   own: 'soe'     },
  { sym: '600048.SS', name: '保利发展',   own: 'soe'     },
  { sym: '001979.SZ', name: '招商蛇口',   own: 'soe'     }
];

const OWN_LABEL = { private: '民营', mixed: '混合/地方国资', soe: '央企/国资' };
const START = Date.UTC(2015, 0, 1) / 1000;
const HALT_DAYS = 45;   // tape silent this long = suspended or delisted
const DAY = 86400000;

const r2 = (v) => (v == null ? null : +(+v).toFixed(3));
const r4 = (v) => (v == null ? null : +(+v).toFixed(4));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

async function history(sym) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym)
    + '?period1=' + START + '&period2=' + Math.floor(Date.now() / 1000) + '&interval=1d';
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; zeup330.github.io developers)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.chart && body.chart.error) throw new Error(body.chart.error.code || 'chart error');
  const r = body.chart.result[0];
  const ts = r.timestamp || [];
  const close = r.indicators.quote[0].close || [];
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    if (close[i] == null || close[i] <= 0) continue;
    rows.push({ t: ts[i] * 1000, c: close[i] });
  }
  if (rows.length < 200) throw new Error(`only ${rows.length} usable bars`);
  return { rows, currency: r.meta.currency };
}

const now = Date.now();
const out = { t: now, source: 'yahoo-chart', ownLabels: OWN_LABEL, firms: [] };
const failures = [];

for (const f of FIRMS) {
  try {
    const { rows, currency } = await history(f.sym);
    let peak = -Infinity, peakT = null;
    const dd = rows.map((r) => {
      if (r.c > peak) { peak = r.c; peakT = r.t; }
      return { t: r.t, c: r.c, dd: r.c / peak - 1 };
    });
    const last = dd[dd.length - 1];
    const halted = now - last.t > HALT_DAYS * DAY;

    // First day the price closed below each line, measured from the all-time peak.
    const cross = {};
    for (const L of [0.5, 0.9, 0.99]) {
      const hit = dd.find((p) => p.dd <= -L);
      cross[L] = hit ? iso(hit.t) : null;
    }

    // Monthly path indexed to the peak, so firms at very different price levels
    // can be drawn on one chart.
    const monthly = [];
    let lastKey = '';
    for (const p of dd) {
      const key = iso(p.t).slice(0, 7);
      if (key !== lastKey) { monthly.push(p); lastKey = key; }
    }
    if (monthly[monthly.length - 1] !== last) monthly.push(last);

    out.firms.push({
      sym: f.sym, name: f.name, own: f.own, note: f.note || null, currency,
      peak: r2(peak), peakDate: iso(peakT),
      last: r2(last.c), lastDate: iso(last.t), dd: r4(last.dd),
      halted, haltedDays: halted ? Math.round((now - last.t) / DAY) : null,
      cross,
      path: { d: monthly.map((p) => iso(p.t)), v: monthly.map((p) => r4(p.dd)) }
    });
    console.log(`${f.sym.padEnd(10)} ${f.name.padEnd(12)} dd=${(last.dd * 100).toFixed(1).padStart(6)}%`
      + ` peak=${iso(peakT)} last=${iso(last.t)}${halted ? ' HALTED/DELISTED' : ''}`);
  } catch (err) {
    failures.push(`${f.sym} ${f.name}: ${err.message}`);
    console.log(`${f.sym.padEnd(10)} ${f.name.padEnd(12)} FAILED ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 250));
}

if (!out.firms.length) throw new Error(`every firm failed: ${failures.join('; ')}`);
out.failures = failures;
out.firms.sort((a, b) => a.dd - b.dd);

// Median drawdown per ownership class - the spread between them is the finding.
out.byOwn = Object.keys(OWN_LABEL).map((k) => {
  const v = out.firms.filter((f) => f.own === k).map((f) => f.dd).sort((a, b) => a - b);
  return { own: k, n: v.length, median: v.length ? r4(v[Math.floor(v.length / 2)]) : null };
});

// Where the collapse landed, from the other authoritative series already in the
// repo. The statistics bureau publishes year-on-year percentage change, not
// price levels, so chain it back into an index: idx[t] = idx[t-12] * (1+yoy/100).
// The first twelve months are seeded flat at 100, which makes 2006 the base year
// and leaves that first year's shape unknown - it is far behind every peak here,
// so it does not touch the drawdowns.
try {
  const h = JSON.parse(readFileSync('housing/data/house-index.json', 'utf8'));
  const months = h.months;
  const cities = h.cities.map((c) => {
    const yoy = c.yoy_new;
    const idx = [];
    for (let i = 0; i < yoy.length; i++) {
      if (i < 12) { idx.push(100); continue; }
      const prev = idx[i - 12];
      idx.push(yoy[i] == null || prev == null ? null : prev * (1 + yoy[i] / 100));
    }
    let peak = -Infinity, peakI = 0;
    idx.forEach((v, i) => { if (v != null && v > peak) { peak = v; peakI = i; } });
    const last = idx[idx.length - 1];
    return {
      city: c.city, prov: c.prov, adcode: c.adcode,
      peakMonth: months[peakI], peakIdx: r2(peak),
      lastIdx: r2(last), dd: r4(last / peak - 1),
      monthsSincePeak: idx.length - 1 - peakI
    };
  }).sort((a, b) => a.dd - b.dd);

  out.cities = cities;
  out.cityMeta = { months: months.length, from: months[0], to: months[months.length - 1], series: '新建商品住宅' };
  console.log(`\ncities: ${cities.length} · worst ${cities[0].city} ${(cities[0].dd * 100).toFixed(1)}%`
    + ` · best ${cities[cities.length - 1].city} ${(cities[cities.length - 1].dd * 100).toFixed(1)}%`);
} catch (err) {
  console.log(`\ncity index skipped: ${err.message}`);
}

mkdirSync('developers/data', { recursive: true });
writeFileSync('developers/data/developers.json', JSON.stringify(out));
writeFileSync('developers/data/status.json', JSON.stringify({
  t: now, firms: out.firms.length, failures: failures.length,
  halted: out.firms.filter((f) => f.halted).length
}));

console.log(`\n${out.firms.length}/${FIRMS.length} firms, ${failures.length} failed, `
  + `${out.firms.filter((f) => f.halted).length} halted/delisted`);
