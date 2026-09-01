// Provincial urban disposable income, in actual yuan, from each province's own
// 国民经济和社会发展统计公报.
//
// Why this route and not an API:
//   - data.stats.gov.cn/easyquery.htm (the 分省年度数据 query API) returns 403
//     to every request from outside the mainland. The host's index page answers
//     200, so it is a deliberate block on the query endpoint, not an outage.
//   - 中国统计年鉴's provincial tables are scanned images (html/C06-08.jpg),
//     so there is nothing to parse there.
//
// Every province publishes the same sentence - 城镇居民人均可支配收入XXXXX元 -
// so only the link discovery differs per site, and that is generic: find links
// whose text looks like "YYYY年...国民经济和社会发展统计公报", follow, parse.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const UA = { headers: {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'zh-CN,zh;q=0.9' } };

// Provincial statistics bureaus. Hosts are stable; a dead one is reported
// rather than silently dropping the province.
const PROVINCES = [
  ['北京', 'https://tjj.beijing.gov.cn/'],   ['天津', 'https://stats.tj.gov.cn/'],
  ['河北', 'http://tjj.hebei.gov.cn/'],      ['山西', 'http://tjj.shanxi.gov.cn/'],
  ['内蒙古', 'https://tj.nmg.gov.cn/'],      ['辽宁', 'http://tjj.ln.gov.cn/'],
  ['吉林', 'http://tjj.jl.gov.cn/'],         ['黑龙江', 'http://tjj.hlj.gov.cn/'],
  ['上海', 'https://tjj.sh.gov.cn/'],        ['江苏', 'http://tj.jiangsu.gov.cn/'],
  ['浙江', 'http://tjj.zj.gov.cn/'],         ['安徽', 'http://tjj.ah.gov.cn/'],
  ['福建', 'http://tjj.fujian.gov.cn/'],     ['江西', 'http://tjj.jiangxi.gov.cn/'],
  ['山东', 'http://tjj.shandong.gov.cn/'],   ['河南', 'https://tjj.henan.gov.cn/'],
  ['湖北', 'http://tjj.hubei.gov.cn/'],      ['湖南', 'http://tjj.hunan.gov.cn/'],
  ['广东', 'http://stats.gd.gov.cn/'],       ['广西', 'http://tjj.gxzf.gov.cn/'],
  ['海南', 'https://stats.hainan.gov.cn/'],  ['重庆', 'https://tjj.cq.gov.cn/'],
  ['四川', 'http://tjj.sc.gov.cn/'],         ['贵州', 'http://stjj.guizhou.gov.cn/'],
  ['云南', 'http://stats.yn.gov.cn/'],       ['西藏', 'http://tjj.xizang.gov.cn/'],
  ['陕西', 'http://tjj.shaanxi.gov.cn/'],    ['甘肃', 'http://tjj.gansu.gov.cn/'],
  ['青海', 'http://tjj.qinghai.gov.cn/'],    ['宁夏', 'https://nxtj.nx.gov.cn/'],
  ['新疆', 'http://tjj.xinjiang.gov.cn/'],
];

// Archive pages that homepage crawling cannot reach - the link is rendered by
// script, or sits behind a menu that only appears on hover. Looked up by hand
// once; they are channel IDs and do not move.
const ARCHIVES = {
  江苏: ['http://tj.jiangsu.gov.cn/col/col85666/index.html'],
  四川: ['https://tjj.sc.gov.cn/scstjj/c112126/list.shtml'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Many of these sites are still GB2312. Sniffing the decoded text for the
// replacement character is more reliable than trusting the Content-Type, which
// several of them get wrong.
async function get(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...UA, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      let html = new TextDecoder('utf-8').decode(buf);
      if (/�/.test(html.slice(0, 4000))) html = new TextDecoder('gb18030').decode(buf);
      return { html, url: res.url };
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(2500);
    }
  }
}

const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s|　/g, '');
// Several bureaus (Sichuan, Hunan) put the 统计公报 entry in an icon menu: the
// anchor wraps an <img> and carries no text at all, so a text-only extractor
// drops the one link worth following. Fall back to the anchor's title and to
// the image's alt/title.
const links = (html, base) => [...html.matchAll(/<a([^>]*)href=["']([^"'#]+)["']([^>]*)>([\s\S]{0,160}?)<\/a>/g)]
  .map((m) => {
    let abs = null;
    try { abs = new URL(m[2], base).href; } catch { /* mailto:, javascript: */ }
    const attrs = m[1] + m[3] + m[4];
    const inner = m[4].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    const attr = [...attrs.matchAll(/(?:title|alt)=["']([^"']{1,40})["']/g)].map((x) => x[1]).join('');
    return { href: abs, text: inner || attr.replace(/\s+/g, '') };
  })
  .filter((l) => l.href && l.text);

const GAZETTE = /(\d{4})年.{0,12}国民经济和社会发展统计公报/;
// Footnote markers sit between the label and the figure in some years.
const FIG = (label) => new RegExp(label + '(?:\\[\\d+\\])?([\\d,]+(?:\\.\\d+)?)元');

let prev = [];
try { prev = JSON.parse(readFileSync('district/data/province-income.json', 'utf8')).rows || []; } catch { /* first run */ }
const have = new Set(prev.map((r) => `${r.province}-${r.year}`));

const rows = [];
const failures = [];

for (const [province, home] of PROVINCES) {
  try {
    const { html, url } = await get(home);
    const all = links(html, url);
    let found = all.filter((l) => GAZETTE.test(l.text));

    // Homepages surface at most the newest one or two. The year archive is
    // found by href as well as by link text, because several sites label the
    // section with an image or a generic word like 数据发布.
    const seenArch = new Set();
    // Rank matters: the cap below used to cut the real 统计公报 link because a
    // dozen generic 数据发布 nav items sorted ahead of it. Jiangsu's archive
    // (col/col85666, labelled exactly 统计公报) was lost that way.
    const rank = (l) => (/统计公报/.test(l.text) ? 0 : /tjgb|gongbao/i.test(l.href) ? 1 : 2);
    const archives = all
      .filter((l) => /tjgb|gongbao|tjxx|sjfb/i.test(l.href) || /统计公报|统计数据|数据发布/.test(l.text))
      .filter((l) => !GAZETTE.test(l.text))
      .filter((l) => { const k = l.href.replace(/[?#].*$/, ''); return seenArch.has(k) ? false : seenArch.add(k); })
      .sort((a, b) => rank(a) - rank(b));

    // Hand-looked-up archives go first, then the paths these CMSes
    // conventionally use, in case the homepage links to none of them.
    archives.unshift(...(ARCHIVES[province] || []).map((href) => ({ href, text: 'override' })));
    for (const p of ['tjgb/', 'tjsj/tjgb/', 'sjfb/tjgb/', 'tjxx/tjgb/']) {
      try { archives.push({ href: new URL(p, url).href, text: p }); } catch { /* bad base */ }
    }

    for (const a of archives.slice(0, 10)) {
      if (found.length >= 12) break;
      try {
        const sub = await get(a.href, 1);
        const subLinks = links(sub.html, sub.url);
        found = found.concat(subLinks.filter((l) => GAZETTE.test(l.text)));
        // One level of pagination: archives list ~10 per page, and a province
        // with twenty years of 公报 keeps the older ones on page 2 and 3.
        for (const pg of subLinks.filter((l) => /index_[123]\.html?$/.test(l.href)).slice(0, 3)) {
          try {
            const p = await get(pg.href, 1);
            found = found.concat(links(p.html, p.url).filter((l) => GAZETTE.test(l.text)));
          } catch { /* pagination is optional */ }
          await sleep(700);
        }
      } catch { /* archive shape varies; the homepage hits still count */ }
      await sleep(800);
    }

    const uniq = [...new Map(found.map((l) => [GAZETTE.exec(l.text)[1], l])).entries()]
      .sort((a, b) => b[0].localeCompare(a[0]));
    let got = 0;
    for (const [year, link] of uniq) {
      if (have.has(`${province}-${year}`)) continue;   // published once, never revised
      try {
        const art = await get(link.href);
        const text = strip(art.html);
        // Some provinces (Guangdong) render the 公报 body with JavaScript, so
        // the HTML arrives with a headline and nothing else. Worth naming in
        // the failure list - it looks identical to a parse bug otherwise.
        if (text.length < 800) { failures.push(`${province} ${year}: 正文由脚本注入，HTML 内只有 ${text.length} 字`); continue; }
        const urban = FIG('城镇居民人均可支配收入').exec(text)
          || FIG('城镇常住居民人均可支配收入').exec(text);
        const resident = FIG('全体居民人均可支配收入').exec(text) || FIG('居民人均可支配收入').exec(text);
        if (!urban) continue;
        rows.push({
          province, year: +year,
          urban: +urban[1].replace(/,/g, ''),
          all: resident ? +resident[1].replace(/,/g, '') : null,
          url: link.href
        });
        got++;
      } catch { /* one bad article should not lose the province */ }
      await sleep(800);
    }
    console.log(`${province.padEnd(4)} 公报 ${String(uniq.length).padStart(2)} 篇, 新解析 ${got}`);
  } catch (err) {
    failures.push(`${province}: ${err.message}`);
    console.log(`${province.padEnd(4)} FAIL ${err.message}`);
  }
  await sleep(1000);
}

const byKey = new Map(prev.map((r) => [`${r.province}-${r.year}`, r]));
for (const r of rows) byKey.set(`${r.province}-${r.year}`, r);
const merged = [...byKey.values()].sort((a, b) => a.province.localeCompare(b.province) || a.year - b.year);

mkdirSync('district/data', { recursive: true });
writeFileSync('district/data/province-income.json', JSON.stringify({
  t: Date.now(),
  source: '各省统计局《国民经济和社会发展统计公报》，城镇居民人均可支配收入',
  rows: merged, failures
}));

const provinces = new Set(merged.map((r) => r.province));
console.log(`\nrows: ${merged.length} (new ${rows.length}) across ${provinces.size} provinces`);
const latest = Math.max(...merged.map((r) => r.year));
console.log(`latest year ${latest}:`);
merged.filter((r) => r.year === latest).sort((a, b) => b.urban - a.urban)
  .forEach((r) => console.log(`  ${r.province.padEnd(4)} ${String(r.urban).padStart(7)} 元`));
if (failures.length) console.log(`\nfailures: ${failures.length}\n  ${failures.join('\n  ')}`);
