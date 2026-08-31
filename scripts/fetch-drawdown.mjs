// Daily drawdown tracker for the three US headline indices. Pulls full daily
// history from Yahoo's chart endpoint, then derives the underwater curve, every
// drawdown episode deeper than 10%, and what the index actually did in the years
// after each threshold was first crossed. Raw history is ~4.5MB across the three;
// only the derived ~100KB is committed.
import { writeFileSync, mkdirSync } from 'node:fs';

const INDICES = [
  { id: 'spx',  sym: '^GSPC', name: '标普 500',    short: 'S&P 500' },
  { id: 'dji',  sym: '^DJI',  name: '道琼斯工业',  short: 'Dow' },
  { id: 'ixic', sym: '^IXIC', name: '纳斯达克综合', short: 'Nasdaq' }
];

// Levels the page marks. These are reference lines, not signals.
const LEVELS = [0.10, 0.20, 0.30];
const RECENT_DAYS = 500;
const DAY = 86400000;

const r2 = (v) => (v == null ? null : +(+v).toFixed(2));
const r4 = (v) => (v == null ? null : +(+v).toFixed(4));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

async function history(sym) {
  const url = 'https://query1.finance.yahoo.com/v8/finance/chart/'
    + encodeURIComponent(sym) + '?period1=0&period2=' + Math.floor(Date.now() / 1000) + '&interval=1d';
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; zeup330.github.io drawdown)' } });
  if (!res.ok) throw new Error(`${sym} -> HTTP ${res.status}`);
  const body = await res.json();
  if (body.chart && body.chart.error) throw new Error(`${sym} -> ${JSON.stringify(body.chart.error)}`);
  const r = body.chart.result[0];
  const ts = r.timestamp || [];
  const close = r.indicators.quote[0].close || [];
  const rows = [];
  for (let i = 0; i < ts.length; i++) {
    if (close[i] == null) continue;          // holidays and bad prints
    rows.push({ t: ts[i] * 1000, c: close[i] });
  }
  if (rows.length < 500) throw new Error(`${sym} -> only ${rows.length} rows, looks like a downgraded interval`);
  return rows;
}

// Running peak to date; drawdown is how far below that peak the close sits.
function underwater(rows) {
  let peak = -Infinity, peakT = null;
  return rows.map((r) => {
    if (r.c > peak) { peak = r.c; peakT = r.t; }
    return { t: r.t, c: r.c, peak, peakT, dd: r.c / peak - 1 };
  });
}

// An episode runs from the peak that started it to the day a new high is made.
// One still under water has no end and no recovery time.
function episodes(uw) {
  const out = [];
  let cur = null;
  for (const p of uw) {
    if (p.dd < 0) {
      if (!cur) cur = { peakT: p.peakT, peak: p.peak, troughT: p.t, trough: p.dd, troughC: p.c, cross: {} };
      if (p.dd < cur.trough) { cur.trough = p.dd; cur.troughT = p.t; cur.troughC = p.c; }
      for (const L of LEVELS) {
        if (p.dd <= -L && cur.cross[L] == null) cur.cross[L] = p.t;
      }
    } else if (cur) {
      cur.endT = p.t;
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);                     // still under water today
  return out;
}

// Close on or after a date, so "one year later" survives weekends and holidays.
function closeAtOrAfter(rows, ms) {
  let lo = 0, hi = rows.length - 1, ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].t >= ms) { ans = rows[mid]; hi = mid - 1; } else { lo = mid + 1; }
  }
  return ans;
}

function forward(rows, fromT, years) {
  const a = closeAtOrAfter(rows, fromT);
  const b = closeAtOrAfter(rows, fromT + years * 365.25 * DAY);
  if (!a || !b || b.t === a.t) return null;
  // Not yet enough history for this horizon, rather than a truncated number.
  if (b.t < fromT + years * 365.25 * DAY - 10 * DAY) return null;
  return b.c / a.c - 1;
}

function sample(uw, everyNth) {
  const out = [];
  for (let i = 0; i < uw.length; i += everyNth) out.push(uw[i]);
  if (out[out.length - 1] !== uw[uw.length - 1]) out.push(uw[uw.length - 1]);
  return out;
}

const now = Date.now();
const out = { t: now, source: 'yahoo-chart', levels: LEVELS, indices: {} };
const failures = [];

for (const ix of INDICES) {
  try {
    const rows = await history(ix.sym);
    const uw = underwater(rows);
    const last = uw[uw.length - 1];
    const eps = episodes(uw);

    const deep = eps.filter((e) => e.trough <= -0.10).map((e) => ({
      from: iso(e.peakT), trough: iso(e.troughT), to: e.endT ? iso(e.endT) : null,
      depth: r4(e.trough),
      toTroughDays: Math.round((e.troughT - e.peakT) / DAY),
      recoverDays: e.endT ? Math.round((e.endT - e.troughT) / DAY) : null,
      ongoing: !e.endT
    }));

    // What the index did after it first crossed each level, per episode. This is
    // the historical record for those levels, not a prediction about the next one.
    const after = {};
    for (const L of LEVELS) {
      const hits = eps.filter((e) => e.cross[L]).map((e) => ({
        date: iso(e.cross[L]),
        r1: r4(forward(rows, e.cross[L], 1)),
        r3: r4(forward(rows, e.cross[L], 3)),
        r5: r4(forward(rows, e.cross[L], 5)),
        deeperAfter: r4(e.trough)
      }));
      const med = (key) => {
        const v = hits.map((h) => h[key]).filter((x) => x != null).sort((a, b) => a - b);
        return v.length ? r4(v[Math.floor(v.length / 2)]) : null;
      };
      const pos = (key) => {
        const v = hits.map((h) => h[key]).filter((x) => x != null);
        return v.length ? r4(v.filter((x) => x > 0).length / v.length) : null;
      };
      after[L] = {
        count: hits.length, hits,
        med1: med('r1'), med3: med('r3'), med5: med('r5'),
        pos1: pos('r1'), pos3: pos('r3'), pos5: pos('r5'),
        // How much further it fell after first touching the level.
        medExtra: (function () {
          const v = hits.map((h) => h.deeperAfter + L).filter((x) => x != null).sort((a, b) => a - b);
          return v.length ? r4(v[Math.floor(v.length / 2)]) : null;
        })()
      };
    }

    const weekly = sample(uw, 5);
    const recent = uw.slice(-RECENT_DAYS);
    // The long series only feeds the underwater chart, so it carries no closes;
    // that alone is most of the payload across three indices.
    const pack = (a, withClose) => Object.assign(
      { d: a.map((p) => iso(p.t)), v: a.map((p) => r4(p.dd)) },
      withClose ? { c: a.map((p) => r2(p.c)) } : null
    );

    out.indices[ix.id] = {
      id: ix.id, sym: ix.sym, name: ix.name, short: ix.short,
      first: iso(rows[0].t), days: rows.length,
      cur: {
        date: iso(last.t), close: r2(last.c), peak: r2(last.peak), peakDate: iso(last.peakT),
        dd: r4(last.dd), daysSincePeak: Math.round((last.t - last.peakT) / DAY)
      },
      maxDD: r4(Math.min.apply(null, uw.map((p) => p.dd))),
      weekly: pack(weekly, false), recent: pack(recent, true),
      episodes: deep, after
    };
    console.log(`${ix.sym.padEnd(6)} rows=${rows.length} last=${iso(last.t)} dd=${(last.dd * 100).toFixed(2)}%`
      + ` peak=${iso(last.peakT)} episodes>=10%=${deep.length}`);
  } catch (err) {
    failures.push(`${ix.sym}: ${err.message}`);
    console.log(`${ix.sym.padEnd(6)} FAILED ${err.message}`);
  }
}

const got = Object.keys(out.indices).length;
if (!got) throw new Error(`every index failed: ${failures.join('; ')}`);
out.failures = failures;

mkdirSync('drawdown/data', { recursive: true });
writeFileSync('drawdown/data/drawdown.json', JSON.stringify(out));
writeFileSync('drawdown/data/status.json', JSON.stringify({
  t: now, indices: got, failures: failures.length,
  asOf: Object.values(out.indices)[0].cur.date
}));

console.log(`\n${got}/${INDICES.length} indices, ${failures.length} failed`);
