// Real (inflation-adjusted) residential property prices for China, Japan and
// Korea, from the BIS series republished by FRED. Real rather than nominal on
// purpose: Japan's story spans 70 years and two very different inflation
// regimes, and a nominal series would flatter the recovery.
//
// FRED's graph CSV endpoint needs no API key, which is why it is used instead
// of the BIS site's own stats API.
import { writeFileSync, mkdirSync } from 'node:fs';

const SERIES = [
  { key: 'cn', name: '中国', real: 'QCNR628BIS', nom: 'QCNN628BIS' },
  { key: 'jp', name: '日本', real: 'QJPR628BIS', nom: 'QJPN628BIS' },
  { key: 'kr', name: '韩国', real: 'QKRR628BIS', nom: 'QKRN628BIS' }
];

async function fred(id) {
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, {
    headers: { 'user-agent': 'zeup330.github.io house price comparison' }
  });
  if (!res.ok) throw new Error(`${id} -> HTTP ${res.status}`);
  const rows = (await res.text()).trim().split(/\r?\n/).slice(1);
  return rows
    .map((line) => line.split(','))
    .filter((c) => c.length >= 2 && /^\d{4}-/.test(c[0]) && c[1] !== '.' && c[1] !== '')
    .map((c) => ({ d: c[0], v: +(+c[1]).toFixed(2) }));
}

const out = { t: Date.now(), base: '2010 = 100', source: 'BIS residential property prices via FRED', countries: [] };

for (const s of SERIES) {
  const real = await fred(s.real);
  const nom = await fred(s.nom).catch(() => []);
  const nomBy = new Map(nom.map((r) => [r.d, r.v]));

  let peak = real[0];
  for (const r of real) if (r.v > peak.v) peak = r;
  const last = real[real.length - 1];

  // Quarters from each country's own peak, so three bubbles that burst thirty
  // years apart can be laid over one another. Only from the peak onward - the
  // run-up is a different question and putting both on one axis muddles them.
  const iPeak = real.indexOf(peak);
  const since = real.slice(iPeak).map((r, i) => ({
    q: i,                       // quarters after the peak
    y: +(i / 4).toFixed(2),     // years after the peak
    dd: +((r.v / peak.v - 1) * 100).toFixed(2),
    d: r.d
  }));

  // How far it had fallen at the point China has now reached, and the worst it
  // ever got - the two numbers the page compares.
  out.countries.push({
    key: s.key, name: s.name,
    series: real.map((r) => ({ d: r.d, v: r.v, n: nomBy.get(r.d) ?? null })),
    from: real[0].d, to: last.d,
    peak: { d: peak.d, v: peak.v },
    last: { d: last.d, v: last.v, dd: +((last.v / peak.v - 1) * 100).toFixed(2) },
    trough: since.reduce((a, b) => (b.dd < a.dd ? b : a), since[0]),
    since,
    quartersSincePeak: since.length - 1
  });
  console.log(`${s.name} ${real.length} obs ${real[0].d}..${last.d} · 峰 ${peak.v}@${peak.d}`
    + ` · 今 ${last.v} (${((last.v / peak.v - 1) * 100).toFixed(1)}%)`);
  await new Promise((r) => setTimeout(r, 300));
}

const cn = out.countries.find((c) => c.key === 'cn');
for (const c of out.countries) {
  if (c.key === 'cn') continue;
  const at = c.since.find((p) => p.q >= cn.quartersSincePeak);
  c.atChinasAge = at ? { y: at.y, dd: at.dd, d: at.d } : null;
  console.log(`  ${c.name} 在中国当前的时点（峰后 ${(cn.quartersSincePeak / 4).toFixed(1)} 年）: `
    + (at ? `${at.dd}% (${at.d})` : '无数据'));
}

mkdirSync('mortgage/data', { recursive: true });
writeFileSync('mortgage/data/cnjpkr.json', JSON.stringify(out));
writeFileSync('mortgage/data/status.json', JSON.stringify({ t: out.t, latest: cn.last.d }));
console.log(`\nwritten · china is ${(cn.quartersSincePeak / 4).toFixed(1)} years past its peak`);
