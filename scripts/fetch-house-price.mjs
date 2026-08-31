// Real average selling prices in yuan per square metre, derived the way the
// statistics bureau itself defines them: 新建商品房销售额 / 新建商品房销售面积.
//
// Why this and not something finer: NBS publishes per-province 元/㎡ only through
// data.stats.gov.cn, which 403s every request from outside the mainland, and the
// yearbook prints its tables as JPEGs. The monthly press releases on
// www.stats.gov.cn are reachable and carry the sales tables for the country and
// the four official regions, so that is the finest real price granularity
// available here. A province is coloured by its region, not by itself, and the
// page says so.
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = 'https://www.stats.gov.cn/sj/zxfb/';
const MAX_PAGES = 40;          // release list pages to walk back through
const TITLE = /全国房地产市场基本情况/;

// Straight from the 附注 of the release itself, so the split always matches the
// numbers rather than some other definition of "east".
const REGION = {
  东部: ['北京', '天津', '河北', '上海', '江苏', '浙江', '福建', '山东', '广东', '海南'],
  中部: ['山西', '安徽', '江西', '河南', '湖北', '湖南'],
  西部: ['内蒙古', '广西', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'],
  东北: ['辽宁', '吉林', '黑龙江']
};

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; zeup330.github.io house price)' };

async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.text();
}

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;| |　/g, '').trim();

function tables(html) {
  return (html.match(/<table[\s\S]*?<\/table>/gi) || []).map((t) =>
    (t.match(/<tr[\s\S]*?<\/tr>/gi) || [])
      .map((r) => (r.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(strip).filter(Boolean))
      .filter((r) => r.length)
  );
}

// 1—7月份 / 1-2月份 / 全年. Never guess: an unparsed title used to fall through
// to "whole year", which silently produced two different 2025年全年 rows and
// dropped the real 1—6月 one.
function periodOf(html) {
  const t = strip(html.match(/<title>[\s\S]*?<\/title>/i)?.[0] || '');
  const m = /(\d{4})年\s*1\s*[—\-–~至]\s*(\d{1,2})\s*月份/.exec(t);
  if (m) {
    const through = +m[2];
    return { year: +m[1], through, label: through === 12 ? `${m[1]}年全年` : `${m[1]}年1—${through}月` };
  }
  // 上半年 is January through June, not a whole year. The old loose fallback
  // read it as an annual figure, which is how two different 2025年全年 rows
  // appeared while the real 1—6月 one went missing.
  const half = /(\d{4})年上半年/.exec(t);
  if (half) return { year: +half[1], through: 6, label: `${half[1]}年1—6月` };
  // The annual release is titled plainly, e.g. 「2025年全国房地产市场基本情况」.
  const whole = /(\d{4})年(全年|1[—\-–~至]12月|全国房地产)/.exec(t);
  if (whole) return { year: +whole[1], through: 12, label: `${whole[1]}年全年` };
  console.log(`  unparsed title: ${JSON.stringify(t)}`);
  return null;
}

// The sales table has 销售面积 (万平方米) and 销售额 (亿元) per region. Both are
// cumulative year-to-date, which is what makes the ratio a clean average price.
function salesRows(html) {
  for (const rows of tables(html)) {
    const head = rows.slice(0, 3).flat().join('');
    if (!/销售面积/.test(head) || !/销售额/.test(head)) continue;
    const out = {};
    for (const r of rows) {
      const name = r[0].replace(/地区$|总计$/, '');
      if (!/^(全国|东部|中部|西部|东北)$/.test(name)) continue;
      const nums = r.slice(1).map((x) => +x.replace(/,/g, '')).filter((x) => Number.isFinite(x));
      // [面积, 面积同比, 金额, 金额同比]
      if (nums.length < 3) continue;
      const area = nums[0], amount = nums[2];
      if (!(area > 0) || !(amount > 0)) continue;
      // 亿元 / 万平方米 -> 元/平方米
      out[name] = Math.round((amount / area) * 1e4);
    }
    if (Object.keys(out).length >= 4) return out;
  }
  return null;
}

let misses = 0;
const seen = new Set();
const records = [];

for (let page = 0; page < MAX_PAGES; page++) {
  const listUrl = page === 0 ? BASE : `${BASE}index_${page}.html`;
  let list;
  // Listing pages 404 intermittently; one bad page should not truncate the
  // whole history, so allow a few misses before giving up.
  try {
    list = await get(listUrl);
    misses = 0;
  } catch (err) {
    // Log it: a silent catch here once hid the fact that the site was rate
    // limiting and made an empty result look like a layout change.
    console.log(`  list page ${page} failed: ${err.message}`);
    if (++misses >= 4) break;
    await new Promise((r) => setTimeout(r, 3000));
    continue;
  }
  await new Promise((r) => setTimeout(r, 800));

  const links = [...list.matchAll(/href=["']([^"']+\.html)["'][^>]*>\s*([^<]{4,80}?)\s*</g)]
    .filter(([, , title]) => TITLE.test(title))
    .map(([, href]) => new URL(href, listUrl).href);

  for (const url of new Set(links)) {
    if (seen.has(url)) continue;
    seen.add(url);
    try {
      const html = await get(url);
      const period = periodOf(html);
      const prices = salesRows(html);
      if (!period || !prices) { console.log(`skip ${url} (period=${!!period} prices=${!!prices})`); continue; }
      // The listing pages repeat entries, so the same period arrives more than
      // once; keep the first and move on rather than emitting duplicate points.
      const key = `${period.year}-${period.through}`;
      if (records.some((r) => `${r.year}-${r.through}` === key)) continue;
      records.push({ ...period, url, prices });
      console.log(`${period.label.padEnd(14)} 全国 ${prices['全国']} 东部 ${prices['东部']} 中部 ${prices['中部']} 西部 ${prices['西部']} 东北 ${prices['东北']}`);
    } catch (err) {
      console.log(`fail ${url}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

if (!records.length) throw new Error('no releases parsed - the page layout probably changed');

records.sort((a, b) => (a.year - b.year) || (a.through - b.through));
const latest = records[records.length - 1];

mkdirSync('housing/data', { recursive: true });
writeFileSync('housing/data/house-price.json', JSON.stringify({
  t: Date.now(),
  source: '国家统计局月度《全国房地产市场基本情况》',
  method: '新建商品房销售额 ÷ 新建商品房销售面积，年初至当月累计口径',
  caveat: '全国与四大区口径，无分省数据；仅新建商品房，不含二手房',
  region: REGION,
  latest: latest.label,
  records: records.map((r) => ({ y: r.year, m: r.through, label: r.label, p: r.prices, url: r.url }))
}));

console.log(`\n${records.length} releases, ${records[0].label} .. ${latest.label}`);
