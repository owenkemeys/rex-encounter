// The one-way rule: src/rex imports nothing from the game. Every import in src/rex/** must stay inside src/rex or be three.js
// (the skin draws with three/webgpu; the body uses three's Vector3 maths). The game imports the rex, never the other way round.
//   node src/rex/test/oneway.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const REX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED_PACKAGES = new Set(['three', 'three/webgpu', 'three/tsl']);
const NODE_BUILTIN = /^node:/;      // tests only
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.m?js$/.test(e.name) ? [path.join(d, e.name)] : []));
const PATTERNS = [/^\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/gms, /^\s*import\s*['"]([^'"]+)['"]/gm, /\bimport\(\s*['"]([^'"]+)['"]/g, /\brequire\(\s*['"]([^'"]+)['"]/g];
const bad = []; let n = 0;
for (const f of walk(REX)) {
  const src = fs.readFileSync(f, 'utf8'), isTest = f.includes(path.sep + 'test' + path.sep);
  for (const re of PATTERNS) for (const m of src.matchAll(re)) {
    const spec = m[1]; n++;
    if (spec.startsWith('.')) { const to = path.resolve(path.dirname(f), spec.replace(/\?.*$/, '')); if (!to.startsWith(REX + path.sep)) bad.push(`${path.relative(REX, f)} imports ${spec} (outside src/rex)`); }
    else if (!ALLOWED_PACKAGES.has(spec) && !(isTest && NODE_BUILTIN.test(spec))) bad.push(`${path.relative(REX, f)} imports ${spec} (not three.js)`);
  }
}
for (const b of bad) console.log('FAIL ' + b);
console.log(bad.length ? `FAILED: ${bad.length} import(s) reach out of src/rex` : `ok   all ${n} imports in src/rex stay inside it or are three.js`);
process.exit(bad.length ? 1 : 0);
