// Guards the two things that actually break as pages accumulate: a new page
// that never got linked from the homepage, and a link pointing at something
// that is not there. Both are silent - the page just sits unreachable, or the
// link 404s only when someone clicks it.
//
// Run: node scripts/check-site.mjs
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];
const note = (msg) => problems.push(msg);

const skip = new Set(['.git', '.github', 'assets', 'scripts', 'node_modules']);
const pages = readdirSync('.')
  .filter((f) => !skip.has(f) && !f.startsWith('.'))
  .filter((f) => { try { return statSync(f).isDirectory(); } catch { return false; } })
  .filter((f) => existsSync(join(f, 'index.html')));

const home = readFileSync('index.html', 'utf8');
const linkedFromHome = new Set(
  [...home.matchAll(/href="\.\/([^"/]+)\/"/g)].map((m) => m[1])
);

for (const p of pages) {
  if (!linkedFromHome.has(p)) note(`page not linked from the homepage: /${p}/`);
}
for (const l of linkedFromHome) {
  if (!pages.includes(l)) note(`homepage links to a page that does not exist: /${l}/`);
}

// Every relative href across the site must resolve to a real file. External
// links are left alone - checking those needs the network and would make this
// fail for reasons that have nothing to do with the repo.
const htmlFiles = ['index.html', ...pages.map((p) => join(p, 'index.html'))];
for (const file of htmlFiles) {
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const href = m[1];
    if (/^(https?:|data:|mailto:|#|\/\/)/.test(href)) continue;
    // Pages build links in JS, so the same regex also catches fragments of
    // string concatenation like href="' + url + '". Those are code, not markup.
    if (/['"`+${}]|\s/.test(href)) continue;
    const clean = href.split(/[?#]/)[0];
    if (!clean) continue;
    const target = clean.startsWith('/') ? clean.slice(1) : join(dir, clean);
    const candidates = clean.endsWith('/') || !clean.includes('.')
      ? [join(target, 'index.html'), target]
      : [target];
    if (!candidates.some((c) => existsSync(c))) note(`${file}: dead link ${href}`);
  }
}

// A page that ships a data/ directory is fed by a workflow. If the workflow is
// missing the data silently freezes at whatever was last committed.
const workflows = existsSync('.github/workflows')
  ? readdirSync('.github/workflows').map((f) => readFileSync(join('.github/workflows', f), 'utf8')).join('\n')
  : '';
for (const p of pages) {
  if (!existsSync(join(p, 'data'))) continue;
  if (!workflows.includes(`${p}/data`)) note(`/${p}/ has data but no workflow commits ${p}/data`);
}

console.log(`${pages.length} pages: ${pages.join(', ')}`);
console.log(`${htmlFiles.length} html files checked`);

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log('\nall pages linked, all internal links resolve, all data dirs have a workflow');
