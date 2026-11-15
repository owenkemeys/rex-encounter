// node test/bamboo.mjs [--v]: the bamboo screen (stems ~2.2 m apart: a man slips between, the animal's trunk does not). Scripted
// runs: (1) a drive straight into the stand from the east at 3 m/s and on through it (how far it gets in 20 s, time stood still,
// mean speed inside, brush events); (2) a reach goal inside the stand from 15 m out (does it get there); and the sim's cost per tick
// inside the stand against open ground.
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/sim/rex.js';
const V = process.argv.includes('--v');
const run = (lab, x0, z0, yaw, intentFn, secs) => {
  const T = makeTerrain(7), sim = new RexSim(T, { seed: 3 }); sim.reset(x0, z0, yaw);
  let still = 0, inT = 0, inD = 0, ev = 0, evs = [], px = sim.x, pz = sim.z, tIn = 0, tOpen = 0, nIn = 0, nOpen = 0;
  for (let i = 0; i < secs * 120; i++) {
    const t = i / 120, a = performance.now(); sim.step(1 / 120, intentFn(t, sim)); const c = performance.now() - a;
    const inside = sim.x > -99 && sim.x < -85 && sim.z > -6 && sim.z < 93;
    if (inside) { tIn += c; nIn++; } else { tOpen += c; nOpen++; }
    const d = Math.hypot(sim.x - px, sim.z - pz); px = sim.x; pz = sim.z;
    if (d < 0.4 / 120) still += 1 / 120; if (inside) { inT += 1 / 120; inD += d; }
    for (const e of sim.events) if (e.type === 'contact') { ev++; if (evs.length < 6) evs.push(`${t.toFixed(1)} ${e.part}/${e.surface}/${e.force}`); } sim.events.length = 0;
  }
  console.log(`${lab.padEnd(22)} end (${sim.x.toFixed(1)},${sim.z.toFixed(1)}) stood still ${still.toFixed(1)} s, in the stand ${inT.toFixed(1)} s at ${(inD / Math.max(inT, 1e-3)).toFixed(2)} m/s, contacts ${ev}${V ? ': ' + evs.join(', ') : ''}; sim ms/tick in the stand ${(tIn / Math.max(nIn, 1)).toFixed(3)}, open ${(tOpen / Math.max(nOpen, 1)).toFixed(3)}`);
  return sim;
};
run('drive west at 3 m/s', -78, 60, -Math.PI / 2, () => ({ goal: { kind: 'drive', throttle: 1, steer: 0 }, pace: 3 }), 20);
run('drive west, worked up', -78, 60, -Math.PI / 2, () => ({ goal: { kind: 'drive', throttle: 1, steer: 0 }, pace: 6, agitation: 0.9 }), 20);
run('reach a point inside', -76, 80, -Math.PI / 2, () => ({ goal: { kind: 'reach', id: 1, x: -90, z: 80.4 }, pace: 2.2 }), 25);
