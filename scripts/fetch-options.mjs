// Screens US equity/ETF option chains for wheel-strategy candidates using
// Cboe's public delayed-quote feed, and writes the small derived artifacts the
// page reads. All the filtering and ranking happens here (in the runner) so the
// committed JSON stays a few hundred KB instead of the ~35MB of raw chains.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Edit this list to change what gets screened. Order is preserved on the page.
const SYMBOLS = [
  { s: 'AAPL', g: 'mag7' }, { s: 'MSFT', g: 'mag7' }, { s: 'GOOGL', g: 'mag7' },
  { s: 'AMZN', g: 'mag7' }, { s: 'NVDA', g: 'mag7' }, { s: 'META', g: 'mag7' },
  { s: 'TSLA', g: 'mag7' },
  { s: 'SPY', g: 'index' }, { s: 'QQQ', g: 'index' }, { s: 'IWM', g: 'index' },
  { s: 'DIA', g: 'index' },
  { s: 'XLK', g: 'sector' }, { s: 'XLF', g: 'sector' }, { s: 'XLE', g: 'sector' },
  { s: 'XLV', g: 'sector' }, { s: 'SMH', g: 'sector' }, { s: 'XBI', g: 'sector' },
  { s: 'TQQQ', g: 'lev' }, { s: 'SQQQ', g: 'lev' }, { s: 'SOXL', g: 'lev' },
  { s: 'TNA', g: 'lev' }, { s: 'SPXL', g: 'lev' }
];

const FEED = 'https://cdn.cboe.com/api/global/delayed_quotes/options';
const HISTORY_CAP = 500;

// Wheel screening bands. Puts are the entry leg (cash-secured), calls the exit
// leg after assignment; both are sold OTM, so the delta bands are mirrored.
const DTE = [5, 70];
const PUT_DELTA = [-0.35, -0.10];
const CALL_DELTA = [0.10, 0.35];
const MIN_BID = 0.05;
// Open interest OR traded volume: a strike can be freshly listed and busy, or
// old and heavily held, and either one means someone is quoting it.
const MIN_OI = 25;
// Liquidity gate has to be absolute-or-relative. This feed is delayed and often
// captured with the market closed, when asks on cheap ETF options go stale and
// wide (XLV puts quoted 0.10 x 4.95 on a Sunday). A pure percentage gate throws
// away perfectly liquid names for that reason alone, so a few cents wide is
// allowed regardless of the percentage.
const MAX_SPREAD_ABS = 0.1;
const MAX_SPREAD_PCT = 0.3;
const TOP_PUTS = 8;
const TOP_CALLS = 5;

const MONEYNESS = [];
for (let m = 0.8; m <= 1.2001; m += 0.025) MONEYNESS.push(+m.toFixed(4));

const r2 = (v) => (v == null ? null : +(+v).toFixed(2));
const r4 = (v) => (v == null ? null : +(+v).toFixed(4));

// AAPL260831C00205000 -> root, 2026-08-31, C, 205
function parseOcc(code) {
  const m = /^([A-Z0-9]+?)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(code);
  if (!m) return null;
  // US options settle at the close; 20:00 UTC is 16:00 ET during EDT and is
  // close enough for a DTE used only to annualise a premium.
  return {
    expiryMs: Date.UTC(2000 + +m[2], +m[3] - 1, +m[4], 20),
    expiry: `20${m[2]}-${m[3]}-${m[4]}`,
    type: m[5],
    strike: +m[6] / 1000
  };
}

async function chain(symbol) {
  const res = await fetch(`${FEED}/${symbol}.json`, {
    headers: { 'user-agent': 'zeup330.github.io wheel screener' }
  });
  if (!res.ok) throw new Error(`${symbol} -> HTTP ${res.status}`);
  return res.json();
}

function interp(points, x) {
  if (points.length < 2 || x < points[0][0] || x > points[points.length - 1][0]) return null;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    if (x <= x1) return x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
  }
  return null;
}

function screen(raw, now) {
  const spot = raw.data.current_price || raw.data.close;
  if (!spot) throw new Error('no spot price');

  const rows = [];
  for (const o of raw.data.options) {
    const p = parseOcc(o.option);
    if (!p) continue;
    const dte = (p.expiryMs - now) / 86400000;
    if (dte < 0.5) continue;
    const mid = (o.bid + o.ask) / 2;
    rows.push({
      ...p, dte,
      bid: o.bid, ask: o.ask, mid,
      spread: mid > 0 ? (o.ask - o.bid) / mid : Infinity,
      iv: o.iv, delta: o.delta, theta: o.theta,
      oi: o.open_interest, vol: o.volume
    });
  }

  const liquid = (r) =>
    r.bid >= MIN_BID &&
    (r.oi >= MIN_OI || r.vol >= MIN_OI) &&
    (r.ask - r.bid <= MAX_SPREAD_ABS || r.spread <= MAX_SPREAD_PCT) &&
    r.dte >= DTE[0] && r.dte <= DTE[1];

  // Cash-secured put: premium is return on the strike you must keep in cash.
  const puts = rows
    .filter((r) => r.type === 'P' && liquid(r) && r.delta >= PUT_DELTA[0] && r.delta <= PUT_DELTA[1])
    .map((r) => ({
      ...r,
      yield: (r.bid / r.strike) * (365 / r.dte),
      cushion: (spot - r.strike) / spot,
      breakeven: r.strike - r.bid
    }))
    .sort((a, b) => b.yield - a.yield);

  // Covered call: premium is return on shares already held, so measure it
  // against spot rather than the strike.
  const calls = rows
    .filter((r) => r.type === 'C' && liquid(r) && r.delta >= CALL_DELTA[0] && r.delta <= CALL_DELTA[1])
    .map((r) => ({
      ...r,
      yield: (r.bid / spot) * (365 / r.dte),
      upside: (r.strike - spot) / spot
    }))
    .sort((a, b) => b.yield - a.yield);

  const trim = (r) => ({
    e: r.expiry, dte: +r.dte.toFixed(1), k: r.strike,
    bid: r2(r.bid), ask: r2(r.ask), iv: r4(r.iv), d: r4(r.delta),
    th: r4(r.theta), oi: Math.round(r.oi), vol: Math.round(r.vol),
    sp: r4(r.spread), y: r4(r.yield),
    cu: r.cushion == null ? null : r4(r.cushion),
    up: r.upside == null ? null : r4(r.upside),
    be: r.breakeven == null ? null : r2(r.breakeven)
  });

  // Surface over the standard expiries, OTM side of each strike.
  const byExpiry = new Map();
  for (const r of rows) {
    if (r.dte < 3 || r.dte > 400 || !r.iv) continue;
    if (!byExpiry.has(r.expiry)) byExpiry.set(r.expiry, []);
    byExpiry.get(r.expiry).push(r);
  }
  const expiries = [...byExpiry.entries()]
    .map(([expiry, list]) => ({ expiry, dte: list[0].dte, list }))
    .filter((e) => e.list.length >= 12)
    .sort((a, b) => a.dte - b.dte)
    .slice(0, 8);

  const surface = expiries.map((e) => {
    const pts = e.list
      .filter((r) => (r.strike < spot ? r.type === 'P' : r.type === 'C'))
      .map((r) => [r.strike / spot, r.iv])
      .sort((a, b) => a[0] - b[0]);
    return { dte: +e.dte.toFixed(1), iv: MONEYNESS.map((m) => r4(interp(pts, m))) };
  });

  // Smile detail for the two nearest expiries only, trimmed to the strikes a
  // wheel seller would actually look at.
  const smile = expiries.slice(0, 2).map((e) => {
    const ks = [...new Set(e.list.map((r) => r.strike))]
      .filter((k) => k >= spot * 0.75 && k <= spot * 1.25)
      .sort((a, b) => a - b);
    const find = (k, t) => e.list.find((r) => r.strike === k && r.type === t);
    return {
      e: e.expiry, dte: +e.dte.toFixed(1), k: ks,
      civ: ks.map((k) => r4(find(k, 'C')?.iv)),
      piv: ks.map((k) => r4(find(k, 'P')?.iv))
    };
  });

  const putOI = rows.filter((r) => r.type === 'P').reduce((t, r) => t + r.oi, 0);
  const callOI = rows.filter((r) => r.type === 'C').reduce((t, r) => t + r.oi, 0);
  const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

  return {
    spot: r2(spot),
    iv30: r4(raw.data.iv30),
    change: r4(raw.data.price_change_percent),
    contracts: rows.length,
    put_oi: Math.round(putOI),
    call_oi: Math.round(callOI),
    pcr: callOI ? r4(putOI / callOI) : null,
    med_spread: r4(med(puts.map((p) => p.spread))),
    puts: puts.slice(0, TOP_PUTS).map(trim),
    calls: calls.slice(0, TOP_CALLS).map(trim),
    moneyness: MONEYNESS,
    surface,
    smile
  };
}

const now = Date.now();
const out = { t: now, source: 'cboe-delayed', symbols: {} };
const failures = [];

for (const { s, g } of SYMBOLS) {
  try {
    const raw = await chain(s);
    const screened = screen(raw, now);
    out.symbols[s] = { symbol: s, group: g, feed_time: raw.timestamp, ...screened };
    console.log(
      `${s.padEnd(6)} spot=${String(screened.spot).padStart(8)} iv30=${screened.iv30}` +
      ` puts=${screened.puts.length} calls=${screened.calls.length}` +
      ` best_yield=${screened.puts[0] ? (screened.puts[0].y * 100).toFixed(1) + '%' : '-'}`
    );
  } catch (err) {
    failures.push(`${s}: ${err.message}`);
    console.log(`${s.padEnd(6)} FAILED ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 250));
}

const got = Object.keys(out.symbols).length;
if (!got) throw new Error(`every symbol failed: ${failures.join('; ')}`);
out.failures = failures;

mkdirSync('options/data', { recursive: true });
writeFileSync('options/data/options.json', JSON.stringify(out));

let history = [];
try { history = JSON.parse(readFileSync('options/data/history.json', 'utf8')); } catch { /* first run */ }
history.push({
  t: now,
  s: Object.fromEntries(Object.entries(out.symbols).map(([s, v]) => [
    s, { p: v.spot, iv: v.iv30, y: v.puts[0] ? v.puts[0].y : null }
  ]))
});
writeFileSync('options/data/history.json', JSON.stringify(history.slice(-HISTORY_CAP)));

console.log(`\n${got}/${SYMBOLS.length} symbols, ${failures.length} failed, history=${history.length}`);
