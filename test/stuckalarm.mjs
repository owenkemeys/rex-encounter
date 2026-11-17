// node test/stuckalarm.mjs : the stuck-animal alarm (src/telemetry.js stuckStep) on synthetic sequences.
import { makeStuck, stuckStep } from '../src/telemetry.js';
const run = (secs, f) => { const st = makeStuck(), hits = []; for (let t = 0; t <= secs + 1e-9; t += 0.5) { const x = { t, v: 0, hunger: 1, thT: null, beh: 'pause', px: 41.4, pz: 56.5, alive: true, excused: false, ...f(t) }; const n = stuckStep(st, x); if (n) hits.push([t, n]); } return hits; };
const cases = [
  ['a T13 freeze fires at 20 s and 50 s', () => run(60, () => ({})), (h) => h.length === 2 && h[0][0] === 20 && h[1][0] === 50 && h[1][1] === 2],
  ['b feeding (excused) never', () => run(60, () => ({ excused: true })), (h) => h.length === 0],
  ['c thinking every 8 s never', () => run(60, (t) => ({ thT: Math.floor(t / 8) })), (h) => h.length === 0],
  ['d still 15 s then walks never', () => run(60, (t) => (t < 15 ? {} : { v: 1.5, px: 41.4 + (t - 15) * 1.5 })), (h) => h.length === 0],
  ['e hunger 0.3 never', () => run(60, () => ({ hunger: 0.3 })), (h) => h.length === 0],
  ['f dead player never', () => run(60, () => ({ alive: false })), (h) => h.length === 0],
  ['g capped at 10 per session', () => run(1000, () => ({})), (h) => h.length === 10],
  ['h re-arms after a thought', () => run(60, (t) => ({ thT: t >= 30 ? 1 : null })), (h) => h.length === 2 && h[0][0] === 20 && h[1][0] === 50 && h[1][1] === 1],
];
let bad = 0;
for (const [name, f, ok] of cases) { const h = f(), p = ok(h); if (!p) bad++; console.log(p ? 'pass' : 'FAIL', name, JSON.stringify(h)); }
process.exit(bad ? 1 : 0);
