// node test/gazelead.mjs: does the head lead to where the animal is going? (TODO T1). Two runs with attention: null and no look
// (as the crash tests): the Corner crash scenario, and open ground (to a point 40 m away at 90 degrees to the start heading).
// Prints every 0.2 s body heading, velocity heading, head forward yaw, bearing head->goal, head yaw offset off the body axis.
// Summary: first time head within 0.35 rad of the goal bearing vs body heading; share of turning time the head offset leans into the turn.
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/sim/rex.js';
const W = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const SC = {
  corner: { rex: [-21.5, 48, 0], pace: 9.5, to: [-46, 77] },
  open: { rex: [60, -60, 0], pace: 9.5, to: [100, -60] },
};
const quiet = process.argv.includes('q');
for (const [key, C] of Object.entries(SC)) {
  const T = makeTerrain(7), sim = new RexSim(T, { seed: 3 });
  sim.reset(C.rex[0], C.rex[1], C.rex[2]); sim.events.length = 0;
  let tH = null, tB = null, turnT = 0, same = 0, prevPsi = sim.psi, tEnd = 8;
  if (!quiet) console.log(`--- ${key}  (t, body psi, vel heading, head f yaw, bearing head->goal, head-body offset), rad`);
  for (let i = 0; i < 8 * 120; i++) {
    const t = i / 120;
    sim.step(1 / 120, { goal: { kind: 'approach', id: 1, x: C.to[0], z: C.to[1], stop: 0.5, quick: true }, pace: C.pace, burst: false, agitation: 0, attention: null });
    sim.events.length = 0;
    const H = sim.head, hy = Math.atan2(H.f.x, H.f.z), gb = Math.atan2(C.to[0] - H.pos.x, C.to[1] - H.pos.z), by = sim.psi;
    const vy = Math.atan2(sim.vx ?? 0, sim.vz ?? 0), off = W(hy - by), rate = W(sim.psi - prevPsi) * 120; prevPsi = sim.psi;
    if (tH === null && Math.abs(W(hy - gb)) < 0.35) tH = t;
    if (tB === null && Math.abs(W(by - gb)) < 0.35) tB = t;
    if (Math.abs(rate) > 0.15 && sim.v > 3) { turnT++; if (Math.sign(off) === Math.sign(rate)) same++; }
    if (!quiet && i % 24 === 0) console.log(`${t.toFixed(1)}  body ${by.toFixed(2)}  vel ${vy.toFixed(2)}  head ${hy.toFixed(2)}  goalBrg ${gb.toFixed(2)}  off ${off.toFixed(2)}  v ${sim.v.toFixed(1)}  att ${sim.att.kind}`);
    if (Math.hypot(sim.x - C.to[0], sim.z - C.to[1]) < 3) { tEnd = t; break; }
  }
  console.log(`${key}: head within 0.35 rad of goal bearing at ${tH === null ? 'never' : tH.toFixed(2) + ' s'}; body at ${tB === null ? 'never' : tB.toFixed(2) + ' s'}; lead ${tH !== null && tB !== null ? (tB - tH).toFixed(2) + ' s' : 'n/a'}; head offset leans into the turn ${turnT ? (100 * same / turnT).toFixed(0) : 'n/a'}% of ${(turnT / 120).toFixed(1)} s turning; ended ${tEnd.toFixed(1)} s`);
}
