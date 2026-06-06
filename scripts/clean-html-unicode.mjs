// HTML-safe unicode cleanup. Replaces common non-ASCII chars with HTML
// entities so the source file is pure ASCII but renders identically in
// browsers. Run via:
//   node scripts/clean-html-unicode.mjs <dir>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const map = {
  '\u2014': '&mdash;',
  '\u2013': '&ndash;',
  '\u2192': '&rarr;',
  '\u2190': '&larr;',
  '\u2191': '&uarr;',
  '\u2193': '&darr;',
  '\u2018': '&lsquo;',
  '\u2019': '&rsquo;',
  '\u201C': '&ldquo;',
  '\u201D': '&rdquo;',
  '\u2026': '&hellip;',
  '\u2022': '&bull;',
  '\u00B7': '&middot;',
  '\u00A0': '&nbsp;',
  '\u2713': '&#10003;',
  '\u2717': '&#10007;',
  '\u2605': '&#9733;',
  '\u2606': '&#9734;',
  '\u26A0\uFE0F': '&#9888;',
  '\u26A0': '&#9888;',
  '\u26A1': '&#9889;',  // lightning bolt
  '\u2500': '&mdash;',
  '\u2501': '&mdash;',
  '\u2502': '|',
  '\u2503': '|',
  '\u2550': '=',
  '\u2551': '|',
};

const root = process.argv[2] || 'src/views';

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (['.html', '.mjs'].includes(extname(e.name))) out.push(p);
  }
  return out;
}

const files = walk(root);
let total = 0;
for (const f of files) {
  let s = readFileSync(f, 'utf8');
  const before = s;
  for (const [k, v] of Object.entries(map)) {
    s = s.split(k).join(v);
  }
  if (s !== before) {
    writeFileSync(f, s, 'utf8');
    console.log('  modified:', relative(process.cwd(), f));
    total++;
  }
}
console.log('Files changed:', total);
