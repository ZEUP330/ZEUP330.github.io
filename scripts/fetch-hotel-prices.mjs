// Reads live room prices for the Changsha trip dates off Trip.com.
//
// This one needs a real browser. The detail pages ship a JS shell - a plain
// fetch of the HTML contains zero price strings - and the room inventory only
// arrives over XHR after the page boots. So: Playwright, headless Chromium.
//
// It is deliberately fail-soft. A blocked or restyled page yields ok:false for
// that hotel and the page says the price is stale rather than showing an old
// number as if it were current.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const CHECK_IN = '2026-09-04';
const CHECK_OUT = '2026-09-06';
const NIGHTS = 2;
const CNY_PER_USD = 7.15;
const HISTORY_CAP = 720; // 30 days at hourly

const HOTELS = [
  { id: '116989879', key: 'luxury', name: '五一广场异国印象·奢酒店' },
  { id: '112342483', key: 'xi', name: 'Xi Hotel（五一广场 IFS）' },
  { id: '92349369', key: 'fungee', name: 'FUNGEE（黄兴广场站）' },
  { id: '117841238', key: 'hampton', name: 'Hampton by Hilton 五一广场' },
  { id: '1250258', key: 'exotic', name: 'IFS 国金中心·异国印象酒店' },
  { id: '916436', key: 'atour', name: '亚朵酒店（长沙 IFS）' }
];

const url = (id) =>
  `https://us.trip.com/hotels/detail/?cityId=206&hotelId=${id}` +
  `&checkIn=${CHECK_IN}&checkOut=${CHECK_OUT}&adult=1&children=0`;

// Runs inside the page. Keyed on the "Total price:" string because the room
// rows carry no stable class names - anything class-based breaks on their next
// restyle, and this at least breaks loudly.
function scrape() {
  const t = document.body.innerText.replace(/\s+/g, ' ');
  const num = (m) => (m ? +m[1].replace(/,/g, '') : null);
  return {
    total: num(t.match(/Total price:\s*\$\s?([0-9,]+)/)),
    night: num(t.match(/\$\s?([0-9,]+)\s*(?:\$\s?[0-9,]+\s*)?Total price/)),
    was: num(t.match(/\$\s?([0-9,]+)\s*\$\s?[0-9,]+\s*Total price/)),
    room: (t.match(/([A-Z][A-Za-z()'’ ·|-]{4,60}?(?:Room|Suite))\s*\|/) || [])[1] || null,
    bed: (t.match(/(\d+ (?:king|queen|single|double|twin) bed[s]?)/i) || [])[1] || null,
    breakfast: /breakfast/i.test(t),
    freeCancel: /free cancellation/i.test(t),
    roomsLeft: num(t.match(/Only (\d+) left/)),
    soldOut: /sold out|no rooms available/i.test(t),
    sawPriceUi: /Total price:/.test(t)
  };
}

const now = Date.now();
const out = {
  t: now, checkIn: CHECK_IN, checkOut: CHECK_OUT, nights: NIGHTS,
  rate: CNY_PER_USD, source: 'trip.com', hotels: {}, failures: []
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  locale: 'en-US',
  viewport: { width: 1400, height: 1000 },
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
             '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
});

for (const h of HOTELS) {
  const page = await ctx.newPage();
  try {
    await page.goto(url(h.id), { waitUntil: 'domcontentloaded', timeout: 60000 });
    // The price block is the last thing to arrive; wait for it specifically
    // rather than networkidle, which this site never reaches.
    await page.waitForFunction(
      () => /Total price:|Sold out|No rooms available/i.test(document.body.innerText),
      null, { timeout: 45000 }
    );
    await page.waitForTimeout(1500);
    const r = await page.evaluate(scrape);
    if (!r.sawPriceUi && !r.soldOut) throw new Error('no price UI rendered');

    const totalCny = r.total == null ? null : Math.round(r.total * CNY_PER_USD);
    out.hotels[h.key] = {
      id: h.id, name: h.name, ok: true, soldOut: r.soldOut,
      totalUsd: r.total, nightUsd: r.night, wasUsd: r.was,
      totalCny, nightCny: totalCny == null ? null : Math.round(totalCny / NIGHTS),
      room: r.room, bed: r.bed, breakfast: r.breakfast,
      freeCancel: r.freeCancel, roomsLeft: r.roomsLeft
    };
    console.log(
      `${h.key.padEnd(8)} total=$${r.total} night=$${r.night} ` +
      `room=${r.room || '-'} left=${r.roomsLeft ?? '-'} soldOut=${r.soldOut}`
    );
  } catch (err) {
    // Say what the page actually was. A timeout alone cannot distinguish "slow"
    // from "bot wall" from "redirected to another site", and those need
    // different fixes.
    let diag = {};
    try {
      diag = await page.evaluate(() => ({
        url: location.href,
        title: document.title,
        head: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
        len: document.body.innerText.length
      }));
    } catch { /* page already gone */ }
    out.hotels[h.key] = { id: h.id, name: h.name, ok: false, error: String(err.message || err).slice(0, 120) };
    out.failures.push(`${h.key}: ${String(err.message || err).slice(0, 80)}`);
    console.log(`${h.key.padEnd(8)} FAILED ${err.message}`);
    console.log(`         url=${diag.url || '?'}`);
    console.log(`         title=${diag.title || '?'}`);
    console.log(`         len=${diag.len} text="${diag.head || ''}"`);
  } finally {
    await page.close();
  }
}
await browser.close();

const ok = Object.values(out.hotels).filter((h) => h.ok).length;
// Never overwrite a good snapshot with a total wipe: if every hotel failed the
// site is blocking us, and last hour's prices with an honest timestamp beat an
// empty page.
if (!ok) {
  console.log(`\n0/${HOTELS.length} succeeded - keeping the previous snapshot`);
  process.exit(0);
}

mkdirSync('changsha/data', { recursive: true });
writeFileSync('changsha/data/prices.json', JSON.stringify(out));

let history = [];
try { history = JSON.parse(readFileSync('changsha/data/price-history.json', 'utf8')); } catch { /* first run */ }
history.push({
  t: now,
  p: Object.fromEntries(
    Object.entries(out.hotels).filter(([, v]) => v.ok && v.totalCny != null).map(([k, v]) => [k, v.totalCny])
  )
});
writeFileSync('changsha/data/price-history.json', JSON.stringify(history.slice(-HISTORY_CAP)));

console.log(`\n${ok}/${HOTELS.length} hotels, ${out.failures.length} failed, history=${history.length}`);
