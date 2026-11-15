// node test/corner.mjs: a chase round a container corner (the Containers on our arena). From 26 m south-east it runs for a point
// just past the north-east corner, then on round it to a man behind; once flat out and worked up (pace 9.5, burst), once calm
// (pace 3). The man is close behind the north end, so the route bends round the north-east corner. Prints the contact events (part / surface / force), the deepest any body volume went into the container (clip.mjs'
// volumes), and the time to reach the man.
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/sim/rex.js';
import { depthAt, bodySpheres } from './clip.mjs';
for (const [lab, pace, burst] of [['chase', 9.5, true], ['calm', 3, false]]) {
  const T = makeTerrain(7), sim = new RexSim(T, { seed: 3 }); sim.reset(-21.5, 48, 0);
  const way = [{ x: -46, z: 77 }]; let w = 0, done = null; const ev = [], deep = {}; let gapMin = 9, rub = 0;      // a man close behind the north end, out of its line from the south-east: the route goes round the NE corner
  for (let i = 0; i < 40 * 120 && done === null; i++) {
    const t = i / 120, g = way[w]; if (Math.hypot(sim.x - g.x, sim.z - g.z) < 5) done = t;
    sim.step(1 / 120, { goal: { kind: 'approach', id: w + 1, x: g.x, z: g.z, stop: 0.5, quick: true }, pace, burst: burst && t < 3, agitation: burst ? 0.8 : 0, attention: null });
    if ((sim.bump || 0) > 0 || sim._hitM > 0) rub++; for (const e of sim.events) if (e.type === 'contact') ev.push(`${t.toFixed(1)}s ${e.part}/${e.surface}/${e.force}`); sim.events.length = 0;
    for (const [p, x, y, z, r] of bodySpheres(sim)) { const d = depthAt(T, x, y, z, r); if (d > (deep[p] || 0)) deep[p] = d; if (p === 'torso') for (let e = 0; e < 3; e += 0.1) if (depthAt(T, x, y, z, r + e) > 0) { gapMin = Math.min(gapMin, e); break; } }
  }
  console.log(`${lab.padEnd(6)} nav ${!!sim.nav} closest trunk-to-container ${gapMin.toFixed(1)} m, trunk touching ${(rub / 120).toFixed(2)} s; reached ${done === null ? 'NO' : done.toFixed(1) + ' s'}; deepest ${Object.entries(deep).map(([p, d]) => `${p} ${d.toFixed(2)}`).join(' ')}; contacts ${ev.length}: ${ev.slice(0, 6).join(', ')}`);
}
// The owner's tactic: a man runs (6.2 m/s) up the Containers' east side and round the NE corner, tight; it runs him down from
// 20 m behind. Gap (m) when he turns the corner, and when he is 18 m past it; how far it fell back in between; contacts.
{
  const T = makeTerrain(7), sim = new RexSim(T, { seed: 3 }); sim.reset(-21.5, 47, 0);
  const path = [{ x: -22.5, z: 60 }, { x: -23.4, z: 75.2 }, { x: -44, z: 77 }]; const me = { x: -22.5, z: 60 }; let k = 1, gapA = null, gapB = null; const ev = [];
  for (let i = 0; i < 20 * 120 && gapB === null; i++) {
    const t = i / 120, g = path[k], dx = g.x - me.x, dz = g.z - me.z, d = Math.hypot(dx, dz), st = Math.min(d, 6.2 / 120);
    if (t > 1) { me.x += dx / (d || 1) * st; me.z += dz / (d || 1) * st; if (d < 0.05 && k < path.length - 1) { k++; if (k === 2 && gapA === null) gapA = Math.hypot(sim.x - me.x, sim.z - me.z); } }
    sim.step(1 / 120, { goal: { kind: 'approach', id: 1, x: me.x, z: me.z, stop: 0.5, quick: true }, pace: 9.5, burst: t < 3, agitation: 0.8, attention: { x: me.x, y: T.height(me.x, me.z) + 1.7, z: me.z } });
    for (const e of sim.events) if (e.type === 'contact') ev.push(`${t.toFixed(1)}s ${e.part}/${e.force}`); sim.events.length = 0;
    if (k === 2 && me.x < -23.4 - 18 && gapB === null) gapB = Math.hypot(sim.x - me.x, sim.z - me.z);
  }
  console.log(`man round the corner: gap at the corner ${gapA?.toFixed(1)} m, 18 m past it ${gapB?.toFixed(1)} m (fell back ${(gapB - gapA).toFixed(1)} m = ${((gapB - gapA) / 6.2).toFixed(2)} s of his running); contacts ${ev.length}: ${ev.slice(0, 4).join(', ')}`);
}
