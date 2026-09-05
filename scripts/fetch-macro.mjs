// US macro series plus the Nasdaq 100, and the cross-tabulation between them.
//
// Everything comes from FRED's public CSV endpoint, which needs no key and no
// account: https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES_ID>
// One request per series, plain text, no rate limit worth worrying about at
// this frequency.
//
// The one methodological thing to get right: a data point for month M is
// PUBLISHED during month M+1. Bucketing month M's index return by month M's own
// payroll print would be reading the future. Every cross-tab below therefore
// explains month M's return with the data of month M-1, which is what the market
// actually knew while that month was trading.
//
// Run: node scripts/fetch-macro.mjs
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 'macro/data';

const SERIES = [
  { id: 'PAYEMS',   key: 'payems',  freq: 'm' },   // 全部非农就业，水平值（千人）
  { id: 'UNRATE',   key: 'unrate',  freq: 'm' },
  { id: 'CPIAUCSL', key: 'cpi',     freq: 'm' },   // 指数，需自行折算同比
  { id: 'CPILFESL', key: 'core',    freq: 'm' },
  { id: 'PCEPILFE', key: 'corepce', freq: 'm' },
  { id: 'FEDFUNDS', key: 'ff',      freq: 'm' },
  { id: 'ICSA',     key: 'claims',  freq: 'w' },
  { id: 'NASDAQ100', key: 'ndx',    freq: 'd' },
  { id: 'T10Y2Y',   key: 'curve',   freq: 'd' }
];

const r1 = (v) => (v == null || !isFinite(v) ? null : +v.toFixed(1));
const r2 = (v) => (v == null || !isFinite(v) ? null : +v.toFixed(2));
const r3 = (v) => (v == null || !isFinite(v) ? null : +v.toFixed(3));
const ym = (d) => d.slice(0, 7);

async function csv(id) {
  const url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + encodeURIComponent(id);
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; zeup330.github.io macro)' }
  });
  if (!res.ok) throw new Error(`${id} -> HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  // FRED renamed the date column from DATE to observation_date; take column 0
  // by position rather than by name so either header works.
  const head = lines.shift();
  if (!head || !head.includes(',')) throw new Error(`${id} -> unexpected header: ${head}`);
  const rows = [];
  for (const line of lines) {
    const [d, raw] = line.split(',');
    if (!d) continue;
    const v = parseFloat(raw);
    if (!isFinite(v)) continue;              // FRED writes "." for a gap
    rows.push({ d, v });
  }
  if (rows.length < 24) throw new Error(`${id} -> only ${rows.length} rows`);
  return rows;
}

// Year-on-year percent change of an index series, aligned on month.
function yoy(rows) {
  const byMonth = new Map(rows.map((r) => [ym(r.d), r.v]));
  const out = [];
  for (const r of rows) {
    const m = ym(r.d);
    const prev = byMonth.get(`${+m.slice(0, 4) - 1}-${m.slice(5)}`);
    if (prev == null) continue;
    out.push({ d: m, v: r2((r.v / prev - 1) * 100) });
  }
  return out;
}

// Month-end close of a daily series, and the return that month.
function monthly(rows) {
  const last = new Map();
  for (const r of rows) last.set(ym(r.d), r.v);
  const months = [...last.keys()].sort();
  const out = [];
  for (let i = 0; i < months.length; i++) {
    const c = last.get(months[i]);
    const p = i ? last.get(months[i - 1]) : null;
    out.push({ d: months[i], c: r2(c), ret: p ? r3((c / p - 1) * 100) : null });
  }
  return out;
}

function trailingMean(arr, i, n) {
  if (i < n) return null;
  let s = 0;
  for (let k = i - n; k < i; k++) s += arr[k].v;
  return s / n;
}

// mean / median / share positive / dispersion for one bucket of monthly returns
function describe(label, rets) {
  if (!rets.length) return { k: label, n: 0 };
  const s = [...rets].sort((a, b) => a - b);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const med = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  const win = rets.filter((r) => r > 0).length / rets.length * 100;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length);
  return { k: label, n: rets.length, mean: r2(mean), med: r2(med), win: r1(win), sd: r2(sd) };
}

async function main() {
  const raw = {};
  const failures = [];
  for (const s of SERIES) {
    try {
      raw[s.key] = await csv(s.id);
      console.log(`${s.id}: ${raw[s.key].length} rows, last ${raw[s.key].at(-1).d}`);
    } catch (e) {
      failures.push(`${s.id}: ${e.message}`);
      console.error(`FAILED ${s.id}: ${e.message}`);
    }
  }
  // Payrolls and the index are the page's spine; without them there is nothing
  // to show and overwriting the last good snapshot would be worse than failing.
  for (const need of ['payems', 'ndx']) {
    if (!raw[need]) throw new Error(`missing required series (${need}); refusing to write a partial snapshot`);
  }

  // ---- derive ------------------------------------------------------------
  // Payrolls are published as a level; the number everyone quotes is the change.
  const payrolls = [];
  for (let i = 1; i < raw.payems.length; i++) {
    payrolls.push({ d: ym(raw.payems[i].d), v: r1(raw.payems[i].v - raw.payems[i - 1].v) });
  }

  const claims = (raw.claims || []).map((r, i, a) => ({
    d: r.d,
    v: Math.round(r.v),
    ma4: i >= 3 ? Math.round((a[i].v + a[i - 1].v + a[i - 2].v + a[i - 3].v) / 4) : null
  }));

  const ndx = monthly(raw.ndx);
  const series = {
    payrolls,
    unrate: (raw.unrate || []).map((r) => ({ d: ym(r.d), v: r.v })),
    cpi: yoy(raw.cpi || []),
    core: yoy(raw.core || []),
    corepce: yoy(raw.corepce || []),
    ff: (raw.ff || []).map((r) => ({ d: ym(r.d), v: r.v })),
    claims,
    ndx,
    curve: (raw.curve || []).map((r) => ({ d: r.d, v: r.v }))
  };

  // Sahm rule: 3-month average unemployment minus its low over the prior 12
  // months. At +0.50 the US has, historically, already been in recession.
  const sahm = [];
  const u = series.unrate;
  for (let i = 2; i < u.length; i++) {
    const ma3 = (u[i].v + u[i - 1].v + u[i - 2].v) / 3;
    if (i < 14) continue;
    let lo = Infinity;
    for (let k = i - 11; k <= i; k++) {
      const m = (u[k].v + u[k - 1].v + u[k - 2].v) / 3;
      if (m < lo) lo = m;
    }
    sahm.push({ d: u[i].d, v: r2(ma3 - lo) });
  }
  series.sahm = sahm;

  // ---- cross-tabulation, with the release lag respected ------------------
  const at = (arr, m) => {
    const hit = arr.find((r) => r.d === m);
    return hit ? hit.v : null;
  };
  const prevMonth = (m) => {
    const [y, mo] = m.split('-').map(Number);
    return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
  };

  const jobsBuckets = { strong: [], weak: [] };
  const inflBuckets = { up: [], down: [] };
  const policyBuckets = { hike: [], hold: [], cut: [] };
  const quad = { su: [], sd: [], wu: [], wd: [] };
  const rows = [];

  for (const m of ndx) {
    if (m.ret == null) continue;
    const known = prevMonth(m.d);          // the last data the market had
    const pv = at(payrolls, known);
    const cv = at(series.core, known);
    const cvPrev = at(series.core, prevMonth(known));
    const ffv = at(series.ff, known);
    const ff3 = at(series.ff, prevMonth(prevMonth(prevMonth(known))));

    // "strong" is measured against the trailing year of payroll prints, so the
    // bar moves with the cycle instead of being a fixed number of jobs.
    const idx = payrolls.findIndex((r) => r.d === known);
    const base = idx > 12 ? trailingMean(payrolls, idx, 12) : null;

    let jobs = null, infl = null, policy = null;
    if (pv != null && base != null) jobs = pv >= base ? 'strong' : 'weak';
    if (cv != null && cvPrev != null) infl = cv > cvPrev ? 'up' : 'down';
    if (ffv != null && ff3 != null) {
      policy = ffv - ff3 > 0.125 ? 'hike' : (ffv - ff3 < -0.125 ? 'cut' : 'hold');
    }

    if (jobs) jobsBuckets[jobs].push(m.ret);
    if (infl) inflBuckets[infl].push(m.ret);
    if (policy) policyBuckets[policy].push(m.ret);
    if (jobs && infl) quad[(jobs === 'strong' ? 's' : 'w') + (infl === 'up' ? 'u' : 'd')].push(m.ret);
    rows.push({ d: m.d, ret: m.ret, jobs, infl, policy });
  }

  const stats = {
    span: rows.length ? { from: rows[0].d, to: rows.at(-1).d, n: rows.length } : null,
    jobs: [
      describe('非农强于近一年均值', jobsBuckets.strong),
      describe('非农弱于近一年均值', jobsBuckets.weak)
    ],
    infl: [
      describe('核心 CPI 同比在加速', inflBuckets.up),
      describe('核心 CPI 同比在回落', inflBuckets.down)
    ],
    policy: [
      describe('三个月内政策利率在升', policyBuckets.hike),
      describe('三个月内基本持平', policyBuckets.hold),
      describe('三个月内政策利率在降', policyBuckets.cut)
    ],
    quad: [
      describe('就业强 · 通胀升', quad.su),
      describe('就业强 · 通胀落', quad.sd),
      describe('就业弱 · 通胀升', quad.wu),
      describe('就业弱 · 通胀落', quad.wd)
    ],
    all: describe('全部月份', rows.map((r) => r.ret))
  };

  const lastOf = (a) => (a && a.length ? a.at(-1) : null);
  const latest = {
    payrolls: lastOf(payrolls),
    unrate: lastOf(series.unrate),
    core: lastOf(series.core),
    cpi: lastOf(series.cpi),
    corepce: lastOf(series.corepce),
    ff: lastOf(series.ff),
    claims: lastOf(claims),
    curve: lastOf(series.curve),
    sahm: lastOf(sahm),
    ndx: lastOf(ndx),
    ndxPeak: ndx.reduce((p, r) => (r.c > p ? r.c : p), 0)
  };

  // Trim the long dailies; the page plots months, and 25 years is plenty.
  const cut = (a, n) => (a.length > n ? a.slice(-n) : a);
  series.payrolls = cut(series.payrolls, 360);
  series.unrate = cut(series.unrate, 360);
  series.cpi = cut(series.cpi, 360);
  series.core = cut(series.core, 360);
  series.corepce = cut(series.corepce, 360);
  series.ff = cut(series.ff, 360);
  series.sahm = cut(series.sahm, 360);
  series.ndx = cut(series.ndx, 360);
  series.claims = cut(series.claims, 260);
  series.curve = cut(series.curve, 1300);

  mkdirSync(OUT, { recursive: true });
  const asOf = latest.payrolls ? latest.payrolls.d : null;
  writeFileSync(`${OUT}/macro.json`, JSON.stringify({
    asOf, fetched: Date.now(), failures, latest, stats, series
  }));
  // Sidecar for the shared status bar: a few dozen bytes instead of the whole file.
  writeFileSync(`${OUT}/status.json`, JSON.stringify({
    t: Date.now(), asOf, series: SERIES.length - failures.length, failures: failures.length
  }));

  console.log(`wrote ${OUT}/macro.json  asOf=${asOf}  months=${stats.span ? stats.span.n : 0}  failures=${failures.length}`);
  if (failures.length) console.error('partial:', failures.join(' | '));
}

main().catch((e) => { console.error(e); process.exit(1); });
