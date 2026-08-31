// Data behind the "pursued economy" page: Richard Koo's third stage, where an
// economy that has been caught up with stops finding attractive returns at home.
//
// Everything here is World Bank open data - no key, no scraping, and reachable
// from a runner. The framework is Koo's and is contested; this script only
// gathers the series that make his claims checkable, it does not score anyone.
import { writeFileSync, mkdirSync } from 'node:fs';

const API = 'https://api.worldbank.org/v2';
const FROM = 1980;
const TO = new Date().getUTCFullYear();

// ISO3 -> the label used on the page.
const COUNTRIES = {
  JPN: '日本', DEU: '德国', USA: '美国', KOR: '韩国',
  CHN: '中国', GBR: '英国', IND: '印度'
};

const INDICATORS = {
  gdp: 'NY.GDP.MKTP.CD',        // 名义 GDP，现价美元 - 用来比较体量与超越年份
  pcap: 'NY.GDP.PCAP.KD',       // 人均 GDP，2015 年不变价美元 - 发展阶段
  savings: 'NY.GNS.ICTR.ZS',    // 总储蓄占 GDP
  invest: 'NE.GDI.TOTL.ZS',     // 资本形成总额占 GDP
  fdiOut: 'BM.KLT.DINV.WD.GD.ZS' // 对外直接投资净流出占 GDP
};

// Who is being pursued, and by whom. Koo's point is about the one in front, so
// the page is organised around the leader.
const PAIRS = [
  { leader: 'USA', chaser: 'CHN', metric: 'gdp' },
  { leader: 'JPN', chaser: 'CHN', metric: 'gdp' },
  { leader: 'JPN', chaser: 'DEU', metric: 'gdp' },
  { leader: 'GBR', chaser: 'IND', metric: 'gdp' },
  { leader: 'DEU', chaser: 'IND', metric: 'gdp' },
  { leader: 'JPN', chaser: 'KOR', metric: 'pcap' }
];

async function series(code) {
  const url = `${API}/country/${Object.keys(COUNTRIES).join(';')}/indicator/${code}`
    + `?format=json&per_page=20000&date=${FROM}:${TO}`;
  const res = await fetch(url, { headers: { 'user-agent': 'zeup330.github.io catchup' } });
  if (!res.ok) throw new Error(`${code} -> HTTP ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body) || !body[1]) throw new Error(`${code} -> empty payload`);
  const out = {};
  for (const r of body[1]) {
    if (r.value == null) continue;
    (out[r.countryiso3code] ||= {})[+r.date] = r.value;
  }
  return { rows: out, updated: body[0].lastupdated };
}

const years = [];
for (let y = FROM; y <= TO; y++) years.push(y);

const data = {};
let updated = null;
for (const [key, code] of Object.entries(INDICATORS)) {
  const { rows, updated: u } = await series(code);
  data[key] = rows;
  updated = updated || u;
  const n = Object.values(rows).reduce((t, o) => t + Object.keys(o).length, 0);
  console.log(`${key.padEnd(8)} ${code.padEnd(24)} points=${n} countries=${Object.keys(rows).length}`);
  await new Promise((r) => setTimeout(r, 300));
}

const at = (key, iso, y) => {
  const v = data[key]?.[iso]?.[y];
  return v == null ? null : v;
};
const round = (v, d) => (v == null ? null : +v.toFixed(d));

// Where the chaser's line crosses the leader's. Reported only when both series
// are present on both sides of the crossing, so a gap in the data cannot be
// mistaken for an overtake.
function crossover(leader, chaser, metric) {
  let prev = null;
  for (const y of years) {
    const l = at(metric, leader, y), c = at(metric, chaser, y);
    if (l == null || c == null) { prev = null; continue; }
    const ahead = c > l;
    if (prev !== null && prev === false && ahead) return y;
    prev = ahead;
  }
  return null;
}

const countries = Object.fromEntries(Object.entries(COUNTRIES).map(([iso, name]) => [iso, {
  iso, name,
  gdp: years.map((y) => round(at('gdp', iso, y), 0)),
  pcap: years.map((y) => round(at('pcap', iso, y), 0)),
  savings: years.map((y) => round(at('savings', iso, y), 2)),
  invest: years.map((y) => round(at('invest', iso, y), 2)),
  fdiOut: years.map((y) => round(at('fdiOut', iso, y), 3)),
  // The signature Koo describes: savings stay high while domestic investment
  // falls away, so the surplus has to leave the country or be absorbed by the
  // government. Positive means saving more than the economy invests at home.
  gap: years.map((y) => {
    const s = at('savings', iso, y), i = at('invest', iso, y);
    return s == null || i == null ? null : +(s - i).toFixed(2);
  })
}]));

const pairs = PAIRS.map((p) => ({
  ...p,
  leaderName: COUNTRIES[p.leader],
  chaserName: COUNTRIES[p.chaser],
  crossed: crossover(p.leader, p.chaser, p.metric),
  // Chaser as a share of the leader; 100 means parity.
  ratio: years.map((y) => {
    const l = at(p.metric, p.leader, y), c = at(p.metric, p.chaser, y);
    return l == null || c == null || l === 0 ? null : +((c / l) * 100).toFixed(1);
  })
}));

mkdirSync('catchup/data', { recursive: true });
writeFileSync('catchup/data/catchup.json', JSON.stringify({
  t: Date.now(), source: 'World Bank Open Data', updated,
  years, countries, pairs
}));

console.log(`\nyears ${FROM}..${TO}`);
for (const p of pairs) {
  console.log(`  ${p.chaserName} 追 ${p.leaderName} (${p.metric}): 交叉年 ${p.crossed || '尚未'} `
    + `最新比值 ${[...p.ratio].reverse().find((v) => v != null)}%`);
}
