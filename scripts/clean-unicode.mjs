// One-shot ASCII cleanup for CLI source. Run via:
//   node scripts/clean-unicode.mjs <dir>
// Walks the given directory and replaces common non-ASCII unicode chars with
// safe ASCII equivalents so Windows terminals never render them as mojibake.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const map = {
  '\u2014': '--',     // em-dash
  '\u2013': '-',      // en-dash
  '\u2192': '->',     // right arrow
  '\u2190': '<-',
  '\u2191': '^',
  '\u2193': 'v',
  '\u2018': "'",
  '\u2019': "'",
  '\u201C': '"',
  '\u201D': '"',
  '\u2026': '...',
  '\u2022': '*',
  '\u00B7': '*',
  '\u2713': '[OK]',
  '\u2717': '[X]',
  '\u2705': '[OK]',
  '\u274C': '[X]',
  '\u26A0\uFE0F': '[!]',
  '\u26A0': '[!]',
  '\u2699\uFE0F': '[*]',
  '\u2699': '[*]',
  '\u26A1': '!',
  '\uD83D\uDFE2': '*',
  '\u26AB': '-',
  '\uD83D\uDCE8': '>',
  '\u2601\uFE0F': '~',
  '\u2601': '~',
  '\uD83D\uDD34': '!',
  '\uD83D\uDD0C': '*',
  '\uD83D\uDCDA': '*',
  '\uD83D\uDE80': '*',
  '\u23F3': '~',
  '\u2728': '*',
  '\u2B50': '*',
  '\u2605': '*',
  '\u2606': '*',
  '\u26A0\uFE0F': '[!]',
  '\u26A0': '[!]',
  '\u2699\uFE0F': '[*]',
  '\u2699': '[*]',
  '\u26A1': '!',
  '\uD83D\uDFE2': '*',
  '\u26AB': '-',
  '\uD83D\uDCE8': '>',
  '\u2601\uFE0F': '~',
  '\u2601': '~',
  '\uD83D\uDD34': '!',
  '\uD83D\uDD0C': '*',
  '\uD83D\uDCDA': '*',
  '\uD83D\uDE80': '*',
  '\u23F3': '~',
  '\u2728': '*',
  '\u2B50': '*',
  '\u2605': '*',
  '\u2606': '*',
  '\uD83D\uDEE0\uFE0F': '*',
  '\uD83D\uDEE0': '*',
  '\uD83D\uDD78\uFE0F': '*',  // spider web
  '\uD83D\uDD78': '*',
  '\u2764\uFE0F': '<3',
  '\u2764': '<3',
  '\uFE0F': '',  // variation selector-16 (orphaned)
  '\u2500': '-',
  '\u2501': '-',
  '\u2502': '|',
  '\u2503': '|',
  '\u2504': '-',
  '\u2505': '-',
  '\u2506': '|',
  '\u2507': '|',
  '\u2508': '-',
  '\u2509': '-',
  '\u250A': '|',
  '\u250B': '|',
  '\u250C': '+',
  '\u2510': '+',
  '\u2514': '+',
  '\u2518': '+',
  '\u251C': '+',
  '\u2524': '+',
  '\u252C': '+',
  '\u2534': '+',
  '\u253C': '+',
  '\u2550': '=',
  '\u2551': '|',
  '\u25BC': 'v',
  '\u25B2': '^',
  '\u25C0': '<',
  '\u25B6': '>',
};

const root = process.argv[2] || 'cli';

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'cdk.out' || e.name === 'workdir' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else {
      const ext = extname(e.name);
      if (['.js', '.mjs', '.md'].includes(ext)) out.push(p);
    }
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
