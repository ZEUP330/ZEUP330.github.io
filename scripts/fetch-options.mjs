// Pulls the BTC option chain from Deribit's public API and writes the two
// artifacts the page reads. Everything derived here rather than in the browser,
// so the committed JSON stays small and the page needs no API key or CORS proxy.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const CURRENCY = process.env.CURRENCY || 'BTC';
const API = 'https://www.deribit.com/api/v2/public';
const MONEYNESS = [];
for (let m = 0.6; m <= 1.601; m += 0.05) MONEYNESS.push(+m.toFixed(2));
const HISTORY_CAP = 2000;

async function api(path) {
  const res = await fetch(`${API}/${path}`, { headers: { 'user-agent': 'zeup330.github.io options snapshot' } });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${path} -> ${JSON.stringify(body.error)}`);
  return body.result;
}

// BTC-26SEP26-120000-C
function parseName(name) {
  const [, expiry, strike, type] = name.split('-');
  return { expiry, strike: +strike, type };
}

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
function expiryMs(expiry) {
  const m = /^(\d{1,2})([A-Z]{3})(\d{2})$/.exec(expiry);
  if (!m) return NaN;
  // Deribit options expire 08:00 UTC.
  return Date.UTC(2000 + +m[3], MONTHS[m[2]], +m[1], 8);
}

// Linear interpolation over sorted [x, y] pairs; no extrapolation.
function interp(points, x) {
  if (points.length < 2 || x < points[0][0] || x > points[points.length - 1][0]) return null;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return null;
}

const now = Date.now();
const [summary, index] = await Promise.all([
  api(`get_book_summary_by_currency?currency=${CURRENCY}&kind=option`),
  api(`get_index_price?index_name=${CURRENCY.toLowerCase()}_usd`)
]);
console.log(`fetched ${summary.length} instruments; sample keys: ${Object.keys(summary[0]).join(',')}`);

const byExpiry = new Map();
for (const row of summary) {
  const { expiry, strike, type } = parseName(row.instrument_name);
  if (!byExpiry.has(expiry)) byExpiry.set(expiry, { expiry, ts: expiryMs(expiry), fwd: 0, strikes: new Map() });
  const e = byExpiry.get(expiry);
  if (row.underlying_price) e.fwd = row.underlying_price;
  if (!e.strikes.has(strike)) e.strikes.set(strike, {});
  e.strikes.get(strike)[type] = {
    iv: row.mark_iv ?? null,
    mark: row.mark_price ?? null,
    oi: row.open_interest ?? 0,
    vol: row.volume ?? 0,
    bid: row.bid_price ?? null,
    ask: row.ask_price ?? null
  };
}

const expiries = [...byExpiry.values()]
  .filter((e) => Number.isFinite(e.ts) && e.ts > now && e.fwd > 0)
  .sort((a, b) => a.ts - b.ts)
  .map((e) => {
    const k = [...e.strikes.keys()].sort((a, b) => a - b);
    const pick = (t, f) => k.map((s) => (e.strikes.get(s)[t] ? f(e.strikes.get(s)[t]) : null));
    return {
      expiry: e.expiry,
      ts: e.ts,
      days: +((e.ts - now) / 86400000).toFixed(2),
      fwd: +e.fwd.toFixed(2),
      k,
      civ: pick('C', (o) => o.iv), piv: pick('P', (o) => o.iv),
      coi: pick('C', (o) => o.oi), poi: pick('P', (o) => o.oi),
      cmk: pick('C', (o) => o.mark), pmk: pick('P', (o) => o.mark),
      cvol: pick('C', (o) => o.vol), pvol: pick('P', (o) => o.vol)
    };
  });

if (!expiries.length) throw new Error('no live expiries parsed — API shape may have changed');

// OTM convention: puts below the forward, calls above it. That is the side with
// real quotes, so the smile is built from the liquid wing on each strike.
const surface = expiries.map((e) => {
  const pts = e.k
    .map((s, i) => {
      const iv = s < e.fwd ? e.piv[i] ?? e.civ[i] : e.civ[i] ?? e.piv[i];
      return iv ? [s / e.fwd, iv] : null;
    })
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);
  return { days: e.days, expiry: e.expiry, iv: MONEYNESS.map((m) => interp(pts, m)) };
});

const atm = (e) => {
  const i = e.k.reduce((best, s, idx) => (Math.abs(s - e.fwd) < Math.abs(e.k[best] - e.fwd) ? idx : best), 0);
  const c = e.civ[i], p = e.piv[i];
  return c && p ? (c + p) / 2 : c || p || null;
};
const near30 = expiries.reduce((best, e) => (Math.abs(e.days - 30) < Math.abs(best.days - 30) ? e : best), expiries[0]);
const sum = (a) => a.reduce((t, v) => t + (v || 0), 0);
const callOI = sum(expiries.flatMap((e) => e.coi));
const putOI = sum(expiries.flatMap((e) => e.poi));

mkdirSync('options/data', { recursive: true });
writeFileSync('options/data/options.json', JSON.stringify({
  t: now, currency: CURRENCY, index: index.index_price,
  moneyness: MONEYNESS, expiries, surface
}));

let history = [];
try { history = JSON.parse(readFileSync('options/data/history.json', 'utf8')); } catch { /* first run */ }
history.push({
  t: now,
  index: +index.index_price.toFixed(2),
  atm_iv: atm(near30) ? +atm(near30).toFixed(2) : null,
  atm_days: near30.days,
  call_oi: Math.round(callOI),
  put_oi: Math.round(putOI),
  pcr: callOI ? +(putOI / callOI).toFixed(3) : null
});
writeFileSync('options/data/history.json', JSON.stringify(history.slice(-HISTORY_CAP)));

console.log(`index=${index.index_price} expiries=${expiries.length} atm30=${atm(near30)} pcr=${(putOI / callOI).toFixed(3)} history=${history.length}`);
