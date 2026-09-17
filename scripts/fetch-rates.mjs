// Policy and market rates for /rates/: the Fed, US bank prime, Hong Kong, the
// ECB, the BoJ, Treasury yields, and one real 10-year note priced off the curve.
//
// Every number comes from its publisher, no aggregator in between:
//   Fed rate table + FOMC calendar   federalreserve.gov (HTML)
//   prime, Treasury yields           Fed H.15 full package (zip of SDMX XML)
//   HK base rate, 1-month HIBOR      HKMA open API, daily figures
//   ECB deposit facility rate        ECB data portal (CSV)
//   BoJ overnight call rate          BoJ time-series API (JSON)
//   30-year mortgage rate            Freddie Mac PMMS (CSV)
//   national savings / CD rates      FDIC national rates page (HTML)
//
// The publishers lag each other by a day or two. The Fed's table moves the day a
// decision takes effect, H.15 prints that day's prime a business day later, the
// HKMA figures land that evening. Left alone, the running month would show the
// Fed moved while prime and the HK base rate "did not". So every monthly series
// cuts its running month at the last date all the daily sources have reached;
// the "latest" block keeps each source's own newest value and date for the tiles.
//
// A source that fails keeps its series from the previous snapshot and is listed
// in `failures`; a run that would shrink the snapshot writes nothing.
//
// Run: node scripts/fetch-rates.mjs
import { writeFileSync, mkdirSync, readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = 'rates/data';
const FILE = `${OUT}/rates.json`;
const START = '2007-01';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; zeup330.github.io rates)' };
const MONTH = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// 912828ZQ6: 10-year note, 0.625% coupon, issued 2020-05-15 (TreasuryDirect auction record).
const NOTE = { from: '2020-05', maturity: '2030-05-15', coupon: 0.625 };
const TENORS = [[0.25, 'RIFLGFCM03_N.B'], [0.5, 'RIFLGFCM06_N.B'], [1, 'RIFLGFCY01_N.B'], [2, 'RIFLGFCY02_N.B'],
  [3, 'RIFLGFCY03_N.B'], [5, 'RIFLGFCY05_N.B'], [7, 'RIFLGFCY07_N.B'], [10, 'RIFLGFCY10_N.B']];

const r2 = (v) => (v == null || !isFinite(v) ? null : +v.toFixed(2));
const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const monthIndex = (name) => MONTH.indexOf(name.trim().slice(0, 3).toLowerCase());
const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// Retries server errors and timeouts only: the HKMA API answered 502 to every request for a
// stretch on the day this was written, and a monthly job that gives up keeps stale data a month.
async function get(url, ms = 30000) {
  for (let attempt = 1; ; attempt++) {
    let res = null, error = null;
    try { res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }); } catch (e) { error = e; }
    if (res && res.ok) return res;
    const retryable = error || res.status >= 500;
    if (!retryable || attempt === 3) throw error || new Error(`${url} -> HTTP ${res.status}`);
    await new Promise((resolve) => setTimeout(resolve, 5000 * 4 ** (attempt - 1)));
  }
}
const text = async (url, ms) => (await get(url, ms)).text();

// Effective-date steps of the target (upper, lower). Before December 2008 it was one number.
async function fedTable() {
  const html = await text('https://www.federalreserve.gov/monetarypolicy/openmarket.htm');
  const years = [...html.matchAll(/<h4[^>]*>(\d{4})<\/h4>/g)].map((m) => +m[1]);
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((m) => m[1]);
  if (years.length < 10 || years.length !== tables.length) throw new Error(`openmarket: ${years.length} years, ${tables.length} tables`);
  const steps = [];
  years.forEach((year, i) => {
    for (const row of tables[i].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => strip(c[1]).trim());
      if (cells.length !== 4) continue;
      const [, monthName, day] = cells[0].match(/([A-Za-z]+)\s+(\d+)/) || [];
      const levels = (cells[3].match(/\d+(\.\d+)?/g) || []).map(Number);
      if (!monthName || monthIndex(monthName) < 0 || !levels.length) throw new Error(`openmarket: cannot read row ${cells.join(' | ')}`);
      steps.push({ d: iso(year, monthIndex(monthName), +day), u: levels.at(-1), l: levels[0] });
    }
  });
  steps.sort((a, b) => (a.d < b.d ? -1 : 1));
  return steps;
}

// This year's meetings with what each one did, matched against the rate table:
// a change taking effect within three days of a meeting's last day came from it.
async function fomcYear(year, steps, today) {
  const html = await text('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm');
  const at = html.search(new RegExp(`${year} FOMC Meetings`));
  if (at < 0) throw new Error(`fomccalendars: no ${year} block`);
  const rest = html.slice(at + 20);
  const next = rest.search(/\d{4} FOMC Meetings/);
  const block = next < 0 ? rest : rest.slice(0, next);
  const meetings = [];
  for (const m of block.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([^<]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g)) {
    const months = m[1].split('/').map(monthIndex), days = (m[2].match(/\d+/g) || []).map(Number);
    if (months.some((x) => x < 0) || !days.length) throw new Error(`fomccalendars: cannot read ${m[1]} ${m[2]}`);
    const end = iso(year, months.at(-1), days.at(-1));
    const label = months.length > 1 && days.length > 1
      ? `${months[0] + 1}/${days[0]}–${months[1] + 1}/${days[1]}`
      : `${months[0] + 1}/${days.join('–')}`;
    const limit = new Date(Date.parse(end) + 3 * 864e5).toISOString().slice(0, 10);
    const i = steps.findIndex((s) => s.d >= end && s.d <= limit);
    const delta = i > 0 ? r2(steps[i].u - steps[i - 1].u) : 0;
    meetings.push({ label, end, status: end >= today ? 'upcoming' : delta > 0 ? 'hike' : delta < 0 ? 'cut' : 'hold', delta });
  }
  if (meetings.length < 4) throw new Error(`fomccalendars: only ${meetings.length} meetings for ${year}`);
  return { year, meetings };
}

// The whole H.15 release as one zip. Holidays carry OBS_VALUE="-9999" (status ND)
// and must not be read as a rate - the first version of this page did exactly that.
async function h15() {
  const res = await get('https://www.federalreserve.gov/datadownload/Output.aspx?rel=H15&filetype=zip', 120000);
  const dir = mkdtempSync(join(tmpdir(), 'h15-'));
  try {
    writeFileSync(join(dir, 'h15.zip'), Buffer.from(await res.arrayBuffer()));
    const xml = execFileSync('unzip', ['-p', join(dir, 'h15.zip'), 'H15_data.xml'], { maxBuffer: 400 * 1024 * 1024 }).toString();
    const series = (name) => {
      const at = xml.indexOf(`SERIES_NAME="${name}"`);
      if (at < 0) throw new Error(`H.15: no series ${name}`);
      const body = xml.slice(at, xml.indexOf('</kf:Series>', at));
      const obs = [];
      for (const m of body.matchAll(/OBS_STATUS="([A-Z]+)" OBS_VALUE="([-\d.]+)" TIME_PERIOD="([\d-]+)"/g)) {
        if (m[1] === 'A' && m[2] !== '-9999') obs.push([m[3], +m[2]]);
      }
      if (obs.length < 1000) throw new Error(`H.15: ${name} has only ${obs.length} observations`);
      return obs;
    };
    return {
      prime: series('RIFSPBLP_N.B'), y3m: series('RIFLGFCM03_N.B'), y2: series('RIFLGFCY02_N.B'),
      y10: series('RIFLGFCY10_N.B'), y30: series('RIFLGFCY30_N.B'),
      curve: TENORS.map(([t, name]) => [t, series(name)])
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function hkma() {
  const base = 'https://api.hkma.gov.hk/public/market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity'
    + '?pagesize=1000&sortby=end_of_date&sortorder=asc&fields=end_of_date,disc_win_base_rate,hibor_fixing_1m';
  const records = [];
  for (let offset = 0; offset < 50000; offset += 1000) {
    const body = await (await get(`${base}&offset=${offset}`)).json();
    if (!body.header || !body.header.success) throw new Error(`HKMA: ${body.header ? body.header.err_msg : 'no header'}`);
    records.push(...body.result.records);
    if (body.result.records.length < 1000) break;
  }
  const pick = (field) => records.filter((r) => r[field] != null).map((r) => [r.end_of_date, +r[field]]);
  const out = { hkBase: pick('disc_win_base_rate'), hibor: pick('hibor_fixing_1m') };
  if (out.hkBase.length < 3000) throw new Error(`HKMA: only ${out.hkBase.length} base-rate days`);
  return out;
}

async function ecb() {
  const csv = await text('https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?startPeriod=2006-01-01&format=csvdata');
  const [head, ...rows] = csv.trim().split(/\r?\n/);
  const cols = head.split(',');
  const di = cols.indexOf('TIME_PERIOD'), vi = cols.indexOf('OBS_VALUE');
  if (di < 0 || vi < 0) throw new Error('ECB: unexpected CSV header');
  const obs = rows.map((r) => r.split(',')).filter((c) => c[vi] !== '').map((c) => [c[di], +c[vi]]);
  if (obs.length < 3000) throw new Error(`ECB: only ${obs.length} days`);
  return obs;
}

async function boj() {
  const body = await (await get('https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=FM01&code=STRDCLUCON&startDate=200601')).json();
  const values = body.RESULTSET && body.RESULTSET[0] && body.RESULTSET[0].VALUES;
  if (!values) throw new Error(`BoJ: ${body.MESSAGE || 'no values'}`);
  const obs = [];
  values.SURVEY_DATES.forEach((d, i) => {
    const s = String(d), v = values.VALUES[i];
    if (v != null) obs.push([`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, +v]);
  });
  if (obs.length < 3000) throw new Error(`BoJ: only ${obs.length} days`);
  return obs;
}

async function pmms() {
  const csv = await text('https://www.freddiemac.com/pmms/docs/PMMS_history.csv');
  const obs = [];
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const [date, rate] = line.split(',');
    const [m, d, y] = date.split('/');
    if (rate && y) obs.push([`${y}-${pad(+m)}-${pad(+d)}`, +rate]);
  }
  obs.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (obs.length < 1000) throw new Error(`PMMS: only ${obs.length} weeks`);
  return obs;
}

// Published every third Monday from the prior month-end's data.
async function fdic() {
  const t = strip(await text('https://www.fdic.gov/national-rates-and-rate-caps'));
  const asOf = t.match(/Monthly Rate Cap Information as of ([A-Za-z]+) (\d{1,2}), (\d{4})/);
  const savings = t.match(/\bSavings (\d+\.\d+)/);
  const cd12 = t.match(/\b12 month CD (\d+\.\d+)/);
  if (!asOf || !savings || !cd12) throw new Error('FDIC: rate table not found');
  const m = monthIndex(asOf[1]), y = +asOf[3];
  const prior = m === 0 ? `${y - 1}-12` : `${y}-${pad(m)}`;
  return { asOf: iso(y, m, +asOf[2]), dataMonth: prior, savings: +savings[1], cd12: +cd12[1] };
}

// Last value on or before each month's end; the running month stops at `cutoff`.
function monthEnds(obs, months, cutoff) {
  let i = 0, last = null;
  return months.map((m, k) => {
    const limit = k === months.length - 1 ? cutoff : `${m}-31`;
    while (i < obs.length && obs[i][0] <= limit) last = obs[i++][1];
    return r2(last);
  });
}

// Clean price per 100 face, semiannual coupons on the maturity day of month.
function cleanPrice(settle, maturity, coupon, yieldPct) {
  const S = Date.parse(settle), mat = new Date(`${maturity}T00:00:00Z`);
  const dates = [mat.getTime()];
  for (let k = 1; dates.at(-1) > S; k++) {
    dates.push(Date.UTC(mat.getUTCFullYear(), mat.getUTCMonth() - 6 * k, mat.getUTCDate()));
  }
  const L = dates.at(-1), future = dates.filter((t) => t > S).sort((a, b) => a - b);
  const N = future[0], n = future.length, w = (N - S) / (N - L), r = yieldPct / 200;
  let dirty = 100 / (1 + r) ** (w + n - 1);
  for (let k = 0; k < n; k++) dirty += (coupon / 2) / (1 + r) ** (w + k);
  return dirty - (coupon / 2) * (S - L) / (N - L);
}

// The note's month-end price, reading its yield off that day's curve at the remaining maturity.
function notePath(curve, months, cutoff) {
  const byDate = new Map();
  for (const [t, obs] of curve) for (const [d, v] of obs) {
    if (d >= `${NOTE.from}-01`) (byDate.get(d) || byDate.set(d, new Map()).get(d)).set(t, v);
  }
  const full = [...byDate.keys()].filter((d) => byDate.get(d).size === curve.length).sort();
  let j = -1, lastDate = null;
  const prices = months.map((m, k) => {
    if (m < NOTE.from) return null;
    const limit = k === months.length - 1 ? cutoff : `${m}-31`;
    while (j + 1 < full.length && full[j + 1] <= limit) j++;
    if (j < 0 || full[j] >= NOTE.maturity) return null;
    lastDate = full[j];
    const pts = [...byDate.get(full[j])].sort((a, b) => a[0] - b[0]);
    const tau = (Date.parse(NOTE.maturity) - Date.parse(full[j])) / (365.25 * 864e5);
    let y = pts.at(-1)[1];
    if (tau <= pts[0][0]) y = pts[0][1];
    else for (let i = 1; i < pts.length; i++) {
      if (tau <= pts[i][0]) { y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * (tau - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]); break; }
    }
    return r2(cleanPrice(full[j], NOTE.maturity, NOTE.coupon, y));
  });
  const last = prices.filter((v) => v != null).at(-1);
  if (last == null) return { prices, projection: null };
  // Hold to maturity at today's implied yield: bisection, price falls as yield rises.
  let lo = -1, hi = 15;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (cleanPrice(lastDate, NOTE.maturity, NOTE.coupon, mid) > last) lo = mid; else hi = mid;
  }
  const y = (lo + hi) / 2, v = [];
  for (let d = new Date(`${lastDate.slice(0, 7)}-01T00:00:00Z`); ; ) {
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const end = new Date(d.getTime() - 864e5).toISOString().slice(0, 10);
    if (end >= NOTE.maturity) { v.push([NOTE.maturity.slice(0, 7), 100]); break; }
    if (end > lastDate) v.push([end.slice(0, 7), r2(cleanPrice(end, NOTE.maturity, NOTE.coupon, y))]);
  }
  return { prices, projection: { y: +y.toFixed(3), from: lastDate, v } };
}

const newest = (obs) => ({ d: obs.at(-1)[0], v: obs.at(-1)[1] });
function sinceChange(obs) {
  for (let i = obs.length - 1; i > 0; i--) {
    if (obs[i][1] !== obs[i - 1][1]) return { since: obs[i][0], delta: r2(obs[i][1] - obs[i - 1][1]) };
  }
  return { since: null, delta: null };
}
function yearAgo(obs) {
  const target = new Date(Date.parse(obs.at(-1)[0]) - 365 * 864e5).toISOString().slice(0, 10);
  let v = null;
  for (const [d, x] of obs) { if (d > target) break; v = x; }
  return v;
}

async function main() {
  const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
  const failures = [];
  const attempt = async (name, fn) => {
    try { return await fn(); } catch (e) { failures.push(`${name}: ${e.message}`); return null; }
  };
  const today = new Date().toISOString().slice(0, 10);

  const steps = await attempt('fed table', fedTable);
  const [bank, hk, ecbObs, bojObs, mortgage, deposits] = await Promise.all([
    attempt('H.15', h15), attempt('HKMA', hkma), attempt('ECB', ecb), attempt('BoJ', boj),
    attempt('PMMS', pmms), attempt('FDIC', fdic)
  ]);
  const fomc = steps ? await attempt('FOMC calendar', () => fomcYear(+today.slice(0, 4), steps, today)) : null;

  const daily = [bank && bank.prime, bank && bank.y10, hk && hk.hkBase, ecbObs, bojObs].filter(Boolean);
  if (!daily.length) throw new Error(`every daily source failed: ${failures.join(' | ')}`);
  const cutoff = daily.map((o) => o.at(-1)[0]).sort()[0];
  const months = [];
  for (let d = new Date(`${START}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= cutoff.slice(0, 7);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d.toISOString().slice(0, 7));

  const fresh = {
    fedU: steps && steps.map((s) => [s.d, s.u]), fedL: steps && steps.map((s) => [s.d, s.l]),
    prime: bank && bank.prime, y3m: bank && bank.y3m, y2: bank && bank.y2, y10: bank && bank.y10, y30: bank && bank.y30,
    m30: mortgage, hkBase: hk && hk.hkBase, hibor: hk && hk.hibor, ecb: ecbObs, boj: bojObs
  };
  const s = {};
  for (const [key, obs] of Object.entries(fresh)) {
    if (obs) { s[key] = monthEnds(obs, months, cutoff); continue; }
    if (!prev || !prev.s[key]) throw new Error(`${key} failed and there is no previous snapshot to keep`);
    const old = new Map(prev.months.map((m, i) => [m, prev.s[key][i]]));
    s[key] = months.map((m) => (old.has(m) ? old.get(m) : null));
  }
  let projection = prev ? prev.zq6proj : null;
  if (bank) {
    const path = notePath(bank.curve, months, cutoff);
    s.zq6 = path.prices;
    projection = path.projection;
  } else {
    const old = new Map(prev.months.map((m, i) => [m, prev.s.zq6[i]]));
    s.zq6 = months.map((m) => (old.has(m) ? old.get(m) : null));
  }

  const keepOld = (key, value) => (value != null ? value : prev ? prev[key] : null);
  const latest = prev && prev.latest ? { ...prev.latest } : {};
  if (steps) {
    const a = steps.at(-1), b = steps.at(-2);
    latest.fed = { since: a.d, u: a.u, l: a.l, delta: r2(a.u - b.u) };
  }
  for (const key of ['prime', 'hkBase', 'ecb']) if (fresh[key]) latest[key] = { ...newest(fresh[key]), ...sinceChange(fresh[key]) };
  for (const key of ['hibor', 'y3m', 'y2', 'm30']) if (fresh[key]) latest[key] = newest(fresh[key]);
  for (const key of ['y10', 'y30', 'boj']) if (fresh[key]) latest[key] = { ...newest(fresh[key]), yearAgo: yearAgo(fresh[key]) };

  // Never publish a snapshot with less history than the one it replaces.
  if (prev) {
    const count = (a) => a.filter((v) => v != null).length;
    if (months.length < prev.months.length) throw new Error(`months shrank ${prev.months.length} -> ${months.length}`);
    for (const key of Object.keys(prev.s)) {
      if (s[key] && count(s[key]) < count(prev.s[key])) throw new Error(`${key} lost history: ${count(prev.s[key])} -> ${count(s[key])}`);
    }
  }

  mkdirSync(OUT, { recursive: true });
  writeFileSync(FILE, JSON.stringify({
    fetched: Date.now(), asOf: cutoff, failures, months, s, zq6proj: projection,
    // Keep the step in force when the series starts, so the first move in range has a size.
    fedEvents: steps ? steps.filter((x, i) => x.d >= `${START}-01` || (steps[i + 1] && steps[i + 1].d >= `${START}-01`)) : prev.fedEvents,
    fomc: keepOld('fomc', fomc), fdic: keepOld('fdic', deposits), latest
  }));
  writeFileSync(`${OUT}/status.json`, JSON.stringify({
    t: Date.now(), asOf: cutoff, series: Object.keys(s).length, failures: failures.length
  }));
  console.log(`wrote ${FILE}  asOf=${cutoff}  months=${months.length}  failures=${failures.length}`);
  if (failures.length) console.error('partial:', failures.join(' | '));
}

main().catch((e) => { console.error(e); process.exit(1); });
