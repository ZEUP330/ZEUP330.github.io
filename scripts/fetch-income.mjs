// Income versus house prices, at the finest granularity the public data allows.
//
// What is deliberately NOT here, because it is not publicly retrievable:
//   - district-level wages: no machine-readable source exists at all
//   - city-level wages: only in each city's own statistical communiqué, ~70
//     separate sites, mostly unreachable from a US runner
//   - provincial wages: the yearbook prints them as JPEGs and the provincial
//     query API 403s every request from outside the mainland
//
// The spine is the annual 国民经济和社会发展统计公报: one document per year,
// each carrying urban disposable income in actual yuan. That beats the
// quarterly releases this script used to crawl - the archive there only went
// back two years, and heavy crawling of it drew an anti-bot interstitial.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const UA = { headers: { 'user-agent': 'Mozilla/5.0 (compatible; zeup330.github.io income)' } };
const GAZETTE = 'https://www.stats.gov.cn/sj/tjgb/ndtjgb/qgndtjgb/';

// The bureau answers heavy crawling with a JavaScript interstitial served as
// HTTP 200. Left undetected it looks like an empty page, and the run reports
// "no releases parsed" as if the layout had changed.
const isChallenge = (html) => /Please enable JavaScript/i.test(html) || html.length < 4000;

async function get(url) {
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  if (isChallenge(html)) throw new Error('anti-bot challenge page');
  return html;
}

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s|　/g, '');

// --- 1. urban disposable income, actual yuan, one year per gazette ---------
// Rows already fetched on an earlier run. These are annual finals and are only
// revised at a census, so a blocked run should keep publishing what it has
// rather than throwing the dataset away.
let prevRows = [];
try {
  prevRows = JSON.parse(readFileSync('income/data/income.json', 'utf8')).incomeRows || [];
} catch { /* first run */ }

const index = await get(GAZETTE);
const pages = new Map();
for (const m of index.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,80}?)<\/a>/g)) {
  const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  const year = /^(\d{4})年$/.exec(text);
  // The archive lists each year three times (image, headline, date).
  if (year && !pages.has(year[1])) pages.set(year[1], new URL(m[1], GAZETTE).href);
}
console.log(`gazette archive: ${pages.size} years ${[...pages.keys()].sort()[0]}..${[...pages.keys()].sort().pop()}`);

// Footnote markers sit between the label and the figure in some years
// ("城镇居民人均可支配收入[34]28844元"), which is why the bracket is optional
// rather than the number following the label directly.
const FIG = (label) => new RegExp(label + '(?:\\[\\d+\\])?([\\d,]+)元');

const incomeRows = [];
for (const [year, url] of [...pages.entries()].sort()) {
  // Already have it and the gazette never changes once published.
  if (prevRows.some((r) => r.year === +year) && !process.env.REFETCH) continue;
  try {
    const text = strip(await get(url));
    const urban = FIG('城镇居民人均可支配收入').exec(text);
    const all = FIG('全国居民人均可支配收入').exec(text);
    const rural = FIG('农村居民人均可支配收入').exec(text);
    if (!urban) { console.log(`${year}: 城镇收入 not found`); continue; }
    incomeRows.push({
      year: +year,
      urban: +urban[1].replace(/,/g, ''),
      all: all ? +all[1].replace(/,/g, '') : null,
      rural: rural ? +rural[1].replace(/,/g, '') : null,
      url
    });
    console.log(`${year}: 城镇 ${urban[1]} 元`);
  } catch (err) {
    console.log(`fail ${year}: ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, 700));
}

const byYear = new Map(prevRows.map((r) => [r.year, r]));
for (const r of incomeRows) byYear.set(r.year, r);
const merged = [...byYear.values()].sort((a, b) => a.year - b.year);
if (!merged.length) throw new Error('no gazettes parsed and nothing cached');
if (!incomeRows.length) console.log(`fetched 0 new; carrying ${merged.length} forward`);

// --- 2. real series, for the index-versus-level comparison ------------------
// Constant local currency: no inflation, no exchange rate. Per-capita GDP is a
// proxy for income, not income itself - households do not receive GDP - but it
// is the only real per-head series that runs the whole period, and the page
// says so.
async function worldBank(indicator) {
  const url = `https://api.worldbank.org/v2/country/CHN/indicator/${indicator}?format=json&per_page=200`;
  const res = await fetch(url, UA);
  if (!res.ok) throw new Error(`${indicator} -> HTTP ${res.status}`);
  const body = await res.json();
  return body[1].filter((r) => r.value != null).map((r) => ({ y: +r.date, v: r.value }))
    .sort((a, b) => a.y - b.y);
}
const pcapReal = await worldBank('NY.GDP.PCAP.KN');

// BIS real residential property prices, already fetched for the three-country
// page. Reused rather than re-downloaded so the two pages cannot disagree.
const bis = JSON.parse(readFileSync('mortgage/data/cnjpkr.json', 'utf8'));
const cn = bis.countries.find((c) => c.key === 'cn');
const priceByYear = new Map();
for (const r of cn.series) {
  const y = +r.d.slice(0, 4);
  if (!priceByYear.has(y)) priceByYear.set(y, []);
  priceByYear.get(y).push(r.v);
}
const priceAnnual = [...priceByYear.entries()]
  .map(([y, vs]) => ({ y, v: +(vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(2) }))
  .sort((a, b) => a.y - b.y);

// --- 3. actual price levels, yuan per square metre -------------------------
const hp = JSON.parse(readFileSync('housing/data/house-price.json', 'utf8'));
const priceLevels = hp.records.filter((r) => r.m === 12)
  .map((r) => ({ year: r.y, label: r.label, national: r.p['全国'], regions: r.p }));

// --- 4. affordability ------------------------------------------------------
// Same assumptions as the story page, so the two cannot drift apart.
const A = { down: 0.30, rate: 3.5, years: 30, dsr: 0.50, area: 100, earners: 2 };
const pay = (loan, ratePct = A.rate) => {
  const i = (ratePct / 100) / 12, n = A.years * 12;
  return loan * i / (1 - Math.pow(1 + i, -n));
};
// Largest price whose monthly payment stays inside the DSR cap.
const ceilingFor = (householdMonthly, ratePct = A.rate) => {
  const i = (ratePct / 100) / 12, n = A.years * 12;
  return householdMonthly * A.dsr * (1 - Math.pow(1 + i, -n)) / i / (1 - A.down);
};

// Every year gets a ceiling, because that only needs income. The price columns
// stay null for years the level series does not cover rather than being
// back-filled from an index - the whole point of the page is that the index and
// the level disagree.
const affordability = merged.map((inc) => {
  const lvl = priceLevels.find((p) => p.year === inc.year);
  const householdYear = inc.urban * A.earners;
  const flat = lvl ? lvl.national * A.area : null;
  return {
    year: inc.year,
    urbanIncome: inc.urban,
    householdYear,
    ceiling: Math.round(ceilingFor(householdYear / 12)),
    pricePerSqm: lvl ? lvl.national : null,
    flatPrice: flat ? Math.round(flat) : null,
    ratio: flat ? +(flat / householdYear).toFixed(2) : null,
    monthlyPay: flat ? Math.round(pay(flat * (1 - A.down))) : null,
    payShare: flat ? +(pay(flat * (1 - A.down)) / (householdYear / 12)).toFixed(3) : null
  };
});

mkdirSync('income/data', { recursive: true });
const out = {
  t: Date.now(),
  assumptions: A,
  sources: {
    incomeActual: '国家统计局《国民经济和社会发展统计公报》年度，城镇居民人均可支配收入',
    incomeProxy: 'World Bank NY.GDP.PCAP.KN (constant LCU)',
    realPrice: 'BIS real residential property prices via FRED, 2010 = 100',
    priceActual: '国家统计局月度《全国房地产市场基本情况》，销售额÷销售面积'
  },
  incomeRows: merged, pcapReal, priceAnnual, priceLevels, affordability
};
writeFileSync('income/data/income.json', JSON.stringify(out));
writeFileSync('income/data/status.json', JSON.stringify({
  t: out.t, latest: String(merged[merged.length - 1].year)
}));

console.log(`\nincome years: ${merged.length} (${merged[0].year}..${merged[merged.length - 1].year})`);
const withPrice = affordability.filter((a) => a.ratio != null);
console.log(`years with an actual price level: ${withPrice.length}`);
affordability.forEach((a) => console.log(
  `  ${a.year}: 城镇人均 ${a.urbanIncome} · 撑得起 ${(a.ceiling / 1e4).toFixed(0)}万`
  + (a.ratio ? ` · ${a.pricePerSqm} 元/㎡ · 100㎡ = ${(a.flatPrice / 1e4).toFixed(0)}万 · 房价收入比 ${a.ratio}` : '')));
