// Search Commons for a page's lead photo and print candidates with the exact
// 960px thumb URL, license and author. Run by hand when a page needs an image;
// nothing in the site depends on it at runtime.
//
//   node scripts/find-photo.mjs "changsha skyline" [count]
const q = process.argv[2];
const n = Number(process.argv[3] || 8);
if (!q) { console.error('usage: node scripts/find-photo.mjs "<search>" [count]'); process.exit(1); }

const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
  action: 'query', format: 'json', generator: 'search', gsrsearch: `filetype:bitmap ${q}`,
  gsrnamespace: '6', gsrlimit: String(n), prop: 'imageinfo',
  iiprop: 'url|size|extmetadata', iiurlwidth: '960',
});

const r = await fetch(url, { headers: { 'user-agent': 'zeup330.github.io photo picker' } });
const j = await r.json();
const pages = Object.values(j.query?.pages || {});
if (!pages.length) { console.log('no hits'); process.exit(0); }

for (const p of pages) {
  const i = p.imageinfo?.[0];
  // Below 960px wide the API hands back the original instead of a 960px thumb,
  // and the page's frame would be upscaling it. Uniform resolution or nothing.
  if (!i || i.width < 960) continue;
  const m = i.extmetadata || {};
  const strip = (s) => (s ? String(s).replace(/<[^>]+>/g, '').trim().slice(0, 60) : '?');
  console.log([
    p.title.replace(/^File:/, ''),
    `${i.width}x${i.height}`,
    strip(m.LicenseShortName?.value),
    strip(m.Artist?.value),
  ].join(' | '));
  console.log('  thumb: ' + i.thumburl.split('?')[0]);
  console.log('  page:  ' + i.descriptionurl);
}
