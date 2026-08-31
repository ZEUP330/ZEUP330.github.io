// Builds the province/city house-price index series the mortgage map reads.
//
// Source is the NBS 70-city release, mirrored and kept current by
// hugohe3/70cityprice. Two things that release does NOT contain, and that this
// script therefore cannot produce:
//
//   1. Absolute prices. NBS publishes the 70-city series as indices only, and
//      its provincial 元/㎡ figures live behind data.stats.gov.cn, which 403s
//      every request from outside mainland China. Nothing here is 元/㎡.
//   2. A continuous fixed-base level. The 定基比 column is rebased by NBS every
//      ~5 years (2010/2015/2020 = 100) and was discontinued after 2022, so
//      splicing it into one line manufactures jumps at the seams. We ignore
//      that column entirely and ship the 同比/环比 series, which are consistent
//      month to month.
import { writeFileSync, mkdirSync } from 'node:fs';

const CSV = 'https://raw.githubusercontent.com/hugohe3/70cityprice/HEAD/70cityprice.csv';

const PROVINCE = {
  11: '北京', 12: '天津', 13: '河北', 14: '山西', 15: '内蒙古',
  21: '辽宁', 22: '吉林', 23: '黑龙江',
  31: '上海', 32: '江苏', 33: '浙江', 34: '安徽', 35: '福建', 36: '江西', 37: '山东',
  41: '河南', 42: '湖北', 43: '湖南', 44: '广东', 45: '广西', 46: '海南',
  50: '重庆', 51: '四川', 52: '贵州', 53: '云南',
  61: '陕西', 62: '甘肃', 63: '青海', 64: '宁夏', 65: '新疆'
};

// Minimal CSV reader: this file is fully quoted and has no embedded newlines.
function parse(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  const head = lines[0].split(',').map((h) => h.replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const cells = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
    const row = {};
    head.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

const ym = (d) => {
  const [y, m] = d.split('/');
  return `${y}-${String(m).padStart(2, '0')}`;
};
const num = (v) => (v === '' || v == null ? null : +v);
// Index of 100 means "flat", so report the percentage change instead. Keeps the
// numbers small in JSON and is what the reader actually wants to see.
const delta = (v) => (v == null ? null : +(v - 100).toFixed(1));

const res = await fetch(CSV, { headers: { 'user-agent': 'zeup330.github.io house index' } });
if (!res.ok) throw new Error(`CSV -> HTTP ${res.status}`);
const rows = parse(await res.text());
console.log(`rows=${rows.length} cols=${Object.keys(rows[0]).join(',')}`);

const months = [...new Set(rows.map((r) => ym(r.DATE)))].sort();
const mi = new Map(months.map((m, i) => [m, i]));

const cities = new Map();
let skipped = 0;
for (const r of rows) {
  if (r.FixedBase !== '同比' && r.FixedBase !== '环比') continue; // 定基比 is unusable, see header
  const prov = PROVINCE[+r.ADCODE.slice(0, 2)];
  if (!prov) { skipped++; continue; }
  if (!cities.has(r.CITY)) {
    cities.set(r.CITY, {
      city: r.CITY, adcode: r.ADCODE, prov,
      yoy_new: Array(months.length).fill(null), yoy_2nd: Array(months.length).fill(null),
      mom_new: Array(months.length).fill(null), mom_2nd: Array(months.length).fill(null)
    });
  }
  const c = cities.get(r.CITY);
  const i = mi.get(ym(r.DATE));
  const tag = r.FixedBase === '同比' ? 'yoy' : 'mom';
  c[`${tag}_new`][i] = delta(num(r.CommodityHouseIDX));
  c[`${tag}_2nd`][i] = delta(num(r.SecondHandIDX));
}

const cityList = [...cities.values()].sort((a, b) => (a.prov + a.city).localeCompare(b.prov + b.city, 'zh'));

// Province rows keep all four series; city rows keep year-on-year only. The
// city month-on-month lines were never drawn and doubled the payload.
const cityOut = cityList.map((c) => ({
  city: c.city, adcode: c.adcode, prov: c.prov, yoy_new: c.yoy_new, yoy_2nd: c.yoy_2nd
}));

// Province value is the plain mean of its covered cities. NBS does not publish a
// provincial aggregate for this series and the cities are not weighted by stock
// or population, so this is an average of the sampled cities, not of the
// province. The page says so; the city count travels with the value.
const provinces = {};
for (const c of cityList) {
  if (!provinces[c.prov]) provinces[c.prov] = { prov: c.prov, cities: [] };
  provinces[c.prov].cities.push(c.city);
}
for (const p of Object.values(provinces)) {
  const mine = cityList.filter((c) => c.prov === p.prov);
  for (const key of ['yoy_new', 'yoy_2nd', 'mom_new', 'mom_2nd']) {
    p[key] = months.map((_, i) => {
      const vals = mine.map((c) => c[key][i]).filter((v) => v != null);
      return vals.length ? +(vals.reduce((t, v) => t + v, 0) / vals.length).toFixed(2) : null;
    });
  }
}

const latest = months[months.length - 1];
const covered = Object.keys(provinces).length;
mkdirSync('housing/data', { recursive: true });
writeFileSync('housing/data/house-index.json', JSON.stringify({
  t: Date.now(),
  source: 'NBS 70城房价指数（经 hugohe3/70cityprice 整理）',
  note: '数值为同比/环比涨跌幅（%），非元每平方米均价；官方该系列不发布绝对价格',
  latest, months, provinces, cities: cityOut
}));

console.log(`months=${months.length} ${months[0]}..${latest} cities=${cityList.length} provinces=${covered} skipped_rows=${skipped}`);
const sample = provinces['广东'];
console.log(`sample 广东 cities=${sample.cities.join('/')} latest_yoy_new=${sample.yoy_new[months.length - 1]}%`);
