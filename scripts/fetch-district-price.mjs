// District-level house prices - the finest granularity that is actually
// retrievable, after checking every source that claims to have it.
//
// What was tried and rejected:
//   - 国家统计局: 70-city INDEX only, no district, no level. data.stats.gov.cn
//     403s every request. The yearbook's provincial tables are .jpg scans
//     (html/C06-08.jpg), so provincial income is not machine-readable either.
//   - 安居客: richest page (all districts + 12 months of city history) but the
//     58.com antibot fires on the SECOND request from an IP. Unusable for a
//     multi-city crawl.
//   - 中国房价行情 creprice.cn: bounces to authcode.cityre.cn for IP
//     verification, and its pages are JS shells with no data in the HTML.
//   - 链家/贝壳: captcha on the first request.
//
// 房天下 fangjia.fang.com serves plain HTML with no bot check, and was
// verified to serve the same data to a non-China IP - which matters because
// this runs on a US GitHub Actions runner, not from a mainland address.
//
// Each city page carries the city average plus its TOP TEN districts by price.
// Beijing has 16 districts; the other six are linked but carry no price, so
// this dataset is top-10-per-city and the page says so rather than implying
// full coverage.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const UA = { headers: {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9' } };

const BASE = 'https://fangjia.fang.com';
const SEED = '/bj/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(BASE + path, { ...UA, signal: AbortSignal.timeout(25000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      if (/antibot|verifycode|滑动验证/i.test(html)) throw new Error('antibot');
      return html;
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(3000 * (i + 1));
    }
  }
}

const CN_MONTH = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };

// The page names the month in Chinese but never the year. A reading later than
// the current month can only be last year's - otherwise a January run reading
// "十二月" would date it twelve months into the future.
function stamp(cnMonth, now) {
  const m = CN_MONTH[cnMonth];
  if (!m) return null;
  const y = m > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear();
  return `${y}-${String(m).padStart(2, '0')}`;
}

// --- city roster, scraped once from the seed page -------------------------
const seed = await get(SEED);
const roster = new Map(
  [...seed.matchAll(/<a[^>]*href="\/(\w+)\/"[^>]*>([\s\S]{0,26}?)<\/a>/g)]
    .map((m) => [m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ''), m[1]])
    .filter(([name, slug]) => /^[一-龥]{2,8}$/.test(name) && /^[a-z]{2,12}$/.test(slug))
);
// A page never links to itself, so the seed city is absent from the roster it
// produces. Beijing went missing from the whole dataset that way.
const seedName = /<div class="house_name_info">[\s\S]{0,240}?<span>\s*([一-龥]{2,10})\s*<\/span>/
  .exec(seed.replace(/\s+/g, ' '));
if (seedName) roster.set(seedName[1], SEED.replace(/\//g, ''));
const cities = [...roster.entries()].map(([name, slug]) => ({ name, slug }));
const cityNames = new Set(roster.keys());
console.log(`city roster: ${cities.length}`);
if (cities.length < 50) throw new Error(`city roster looks broken (${cities.length})`);

// --- parse one city page ---------------------------------------------------
const NUM = (s) => +String(s).replace(/,/g, '');

function parseCity(html, city, now) {
  const flat = html.replace(/\s+/g, ' ');

  // A city whose page is missing 302s to a bounce URL that lands on the default
  // city's page, served as HTTP 200. Without this check the crawl attributed
  // Shenzhen's numbers to whichever city it had asked for - which is how
  // Beijing disappeared from the dataset and Putian came out ranked first.
  const who = /<div class="house_name_info">[\s\S]{0,240}?<span>\s*([一-龥]{2,10})\s*<\/span>/.exec(flat);
  if (!who) return { mismatch: '?' };
  if (who[1] !== city.name) return { mismatch: who[1] };

  // 八月二手房参考均价 54431 元/平  比上月下跌0.61%  比去年同期下跌3.18%
  // Both change figures are optional: Shanghai ships the list items empty
  // (<li>比上月</li>), and requiring them dropped the country's second city.
  const sh = /([一二三四五六七八九十]{1,2})月二手房参考均价<i><\/i><\/li><li class="title_num"><span>\s*([\d,]+)<\/span>元\/平\s*<\/li><li>比上月(?:(上涨|下跌)([\d.]+)%)?<\/li>(?:<li>比去年同期(?:(上涨|下跌)([\d.]+)%)?<\/li>)?/.exec(flat);
  const nb = /([一二三四五六七八九十]{1,2})月新房参考均价<i><\/i><\/li><li class="title_num"><span>\s*([\d,]+)<\/span>元\/平/.exec(flat);
  if (!sh) return null;

  const sign = (dir, v) => (dir === '下跌' ? -v : v);
  const out = {
    name: city.name, slug: city.slug,
    period: stamp(sh[1], now),
    price: NUM(sh[2]),
    mom: sh[3] ? sign(sh[3], +sh[4]) : null,
    yoy: sh[5] ? sign(sh[5], +sh[6]) : null,
    newPrice: nb ? NUM(nb[2]) : null,
    districts: []
  };

  // <a href="/bj/a03/">西城</a><span class="pm-price">108737元/平</span> ...
  // <span class="f12 pm-rate"> 0.62% <i style="color: #0da46d;...">
  // Green (#0da46d) is the site's down colour; the arrow glyph itself is not
  // in the text, so the colour is the only sign carrier.
  const dre = /<a href="\/(\w+)\/(a[\w]+)\/"[^>]*>([^<]+)<\/a><span class="pm-price">([\d,.]+)元\/平<\/span>[\s\S]{0,240}?pm-rate">\s*([\d.]+)%\s*<i style="color: ?#(\w{6})/g;
  for (const m of flat.matchAll(dre)) {
    if (m[1] !== city.slug) continue;   // "深圳周边" rows link to other cities
    const dname = m[3].trim();
    // Shenzhen's ranking lists Dongguan among its "districts" under a Shenzhen
    // area code, so the slug check alone does not catch it. A district that is
    // itself a city on the roster is a neighbouring city, not a district.
    if (cityNames.has(dname)) continue;
    const price = NUM(m[4]);
    // Districts with no reading are published as 0, which turned the
    // cheapest-district figure into zero and every spread ratio into Infinity.
    if (!(price > 800)) continue;
    out.districts.push({
      name: dname, code: m[2],
      price,
      mom: m[6].toLowerCase() === '0da46d' ? -(+m[5]) : +m[5]
    });
  }
  return out;
}

// --- carry forward ---------------------------------------------------------
//每次运行只是一张快照：页面没有历史，历史只能靠一次次跑攒出来。
let prev = { cities: [], history: {} };
try { prev = JSON.parse(readFileSync('district/data/district-price.json', 'utf8')); } catch { /* first run */ }
const history = prev.history || {};

const now = new Date();
const rows = [];
const failures = [];
for (const city of cities) {
  try {
    const html = await get(`/${city.slug}/`);
    const row = parseCity(html, city, now);
    if (!row) { failures.push(`${city.name}: no price block`); continue; }
    if (row.mismatch) { failures.push(`${city.name}: 页面回落到 ${row.mismatch}`); continue; }
    rows.push(row);
    console.log(`${row.name.padEnd(8)} ${String(row.price).padStart(7)} 元/平  ${row.districts.length} 区`);
  } catch (err) {
    failures.push(`${city.name}: ${err.message}`);
    console.log(`FAIL ${city.name}: ${err.message}`);
  }
  await sleep(1200);
}

// A city that fails this run keeps its last reading rather than vanishing from
// the map, flagged so the page can grey it out.
const fresh = new Set(rows.map((r) => r.slug));
for (const old of prev.cities || []) {
  if (!fresh.has(old.slug)) rows.push({ ...old, stale: true });
}
rows.sort((a, b) => b.price - a.price);

// 房天下's listing data has occasional bad cities. A multiple-of-the-median
// test does not work here: the median across 200 mostly-small cities is under
// 7,000, so it flagged Beijing, Shanghai, Shenzhen and Guangzhou - which are
// legitimately seven or eight times the median - alongside the one real error.
// So this is a hand-verified list, not a heuristic.
const KNOWN_BAD = {
  莆田: '房天下挂牌均价 67,350 元/平，约为其他来源的五倍；其区级数字同样偏高，无法用内部一致性检出'
};
for (const r of rows) if (KNOWN_BAD[r.name]) r.suspect = KNOWN_BAD[r.name];
const suspects = rows.filter((r) => r.suspect);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const median = med(rows.map((r) => r.price));

// Append this month's reading to each city's series, keyed by period so a
// re-run inside the same month overwrites rather than duplicating.
for (const r of rows) {
  if (r.stale || !r.period) continue;
  const s = history[r.slug] || (history[r.slug] = []);
  const at = s.findIndex((x) => x.d === r.period);
  const point = { d: r.period, p: r.price };
  if (at >= 0) s[at] = point; else s.push(point);
  s.sort((a, b) => a.d.localeCompare(b.d));
}

const districtCount = rows.reduce((n, r) => n + r.districts.length, 0);
mkdirSync('district/data', { recursive: true });
const out = {
  t: Date.now(),
  source: '房天下 fangjia.fang.com，二手房参考均价（挂牌房源计算，非成交备案价）',
  note: '每个城市仅公布房价最高的 10 个区县，非全部区县',
  period: rows.find((r) => r.period)?.period || null,
  cities: rows, history, failures, median
};
writeFileSync('district/data/district-price.json', JSON.stringify(out));
writeFileSync('district/data/status.json', JSON.stringify({
  t: out.t, latest: `${rows.length} 城 ${districtCount} 区`
}));

console.log(`\ncities: ${rows.length} (fresh ${fresh.size}, carried ${rows.length - fresh.size})`);
console.log(`districts: ${districtCount}`);
console.log(`period: ${out.period}  median ${median} 元/平`);
if (suspects.length) console.log(`suspect: ${suspects.map((r) => r.name + " " + r.price).join(", ")}`);
if (failures.length) console.log(`failures: ${failures.length}\n  ${failures.slice(0, 12).join('\n  ')}`);
