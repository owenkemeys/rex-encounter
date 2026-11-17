// node test/gaitdemo.mjs   the five gait demos of the debug tools (src/gaitdemo.js), headless, in both gaits (3 seeds each): episodes,
// worst hip drop under the straight-run height, worst stance. The old gait should be clearly worse in at least three of the five.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { GAIT_DEMOS, GaitMeter } from '../src/gaitdemo.js';
const dt = 1 / 120;
export function runDemo(key, legacy, seed = 3, rows = []) {
  const D = GAIT_DEMOS[key], T = makeTerrain(7), sim = new Creature(T, { x: D.start[0], z: D.start[1], yaw: D.start[2], seed }), M = new GaitMeter(), st = {};
  sim.gaitLegacy = legacy; let at = null;
  for (let i = 0; i < D.dur * 120; i++) { const t = i * dt; sim.step(dt, D.intent(t, sim, st)); sim.events.length = 0; M.tick(sim, t); if (i % 12 === 0) rows.push([t, sim.x - D.start[0], sim.z - D.start[1], sim.v]); }
  M.clear = 1e9; for (const r of rows || []) for (const o of T.obstacles) M.clear = Math.min(M.clear, Math.hypot(r[1] + D.start[0] - o.x, r[2] + D.start[1] - o.z) - (o.r || 0));
  return M;
}
if (process.argv[1].endsWith('gaitdemo.mjs')) {
  let worse = 0; const f = (x) => x.toFixed(2);
  for (const key of Object.keys(GAIT_DEMOS)) {
    const R = { old: [], cur: [] };
    for (const seed of [1, 2, 3]) for (const [k, lg] of [['old', true], ['cur', false]]) R[k].push(runDemo(key, lg, seed));
    const sum = (a) => ({ ep: a.reduce((x, m) => x + m.episodes, 0), dr: Math.max(...a.map((m) => m.anyDrop)), st: Math.max(...a.map((m) => m.anyStance)), cl: Math.min(...a.map((m) => m.clear)) });
    const o = sum(R.old), c = sum(R.cur), bad = o.ep > c.ep || o.dr > c.dr + 0.1 || o.st > c.st + 0.3; if (Math.min(o.cl, c.cl) < 8) { console.log('FAIL: the path passes within 8 m of a solid'); process.exit(1); }; if (bad) worse++;
    console.log(`${key.padEnd(8)} old: episodes ${o.ep} drop ${f(o.dr)} stance ${f(o.st)}   current: episodes ${c.ep} drop ${f(c.dr)} stance ${f(c.st)}   (episodes: sum, drop/stance: worst at any speed, 3 seeds)  ${bad ? 'old worse' : ''}`);
  }
  console.log(`old gait clearly worse in ${worse} of ${Object.keys(GAIT_DEMOS).length}`); if (worse < 3) { console.log('FAIL'); process.exit(1); }
}
