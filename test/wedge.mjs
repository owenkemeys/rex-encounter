// The lane between the Warehouse (east wall x -44) and the Containers (west face x -35): the animal used to stand wedged
// crosswise in it for minutes. Drops it in or at the mouth of the lane, lures it through with the player out of reach the
// other side, and fails if it ever stays put (hips never more than 1 m from where they were 12 s before) inside the lane while it wants to go somewhere (a
// route or a drive asked of the body most of that time, not standing to listen or look).
//   node test/wedge.mjs [seeds=8]   (VERBOSE=1 to trace)
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const N = +(process.argv[2] || 8), S0 = +(process.env.SEED0 || 1), V = !!process.env.VERBOSE, dt = 1 / 120, hyp = Math.hypot;
const T = makeTerrain(7);
const inLane = (x, z) => x > -44 && x < -35 && z > 61 && z < 75;      // between the two buildings (Warehouse x -64..-44, Containers -35..-25, both z 61..75)
// [rex x, z, yaw, player x, z, limit s]: in the lane facing along it with the player behind it (it has to turn round in there:
// how it got wedged in play), or walking in from either end; it must never stand stuck (limit 0). Started across or askew in
// the lane (a pose it should not get into now, nose and tail both against walls) it must work itself free within 30 s.
const CASES = [
  [-39.5, 68, 0, -39.5, 50, 0], [-39.5, 68, Math.PI, -39.5, 86, 0], [-39.5, 56, 0, -39.5, 84, 0], [-39.5, 80, Math.PI, -39.5, 52, 0],
  [-39.5, 68, Math.PI / 2, -39.5, 50, 30], [-39.5, 68, -Math.PI / 2, -39.5, 86, 30], [-39.5, 66, 0.8, -46, 52, 30], [-39.5, 70, 2.4, -33, 84, 30],
];
let worst = 0, fails = 0;
for (let seed = S0; seed < S0 + N; seed++) for (const [cx, rx, rz, yaw, px, pz, lim] of CASES.map((c, i) => [i, ...c])) {
  const sim = new Creature(T, { x: rx, z: rz, yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 1;
  const me = { id: 'you', x: px, z: pz, y: T.height(px, pz) + 1.65, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1, lx: 0, ly: 0, lz: 1 };
  const v = A.victim('you'); v.x = me.x; v.z = me.z; v.y = me.y;
  let I = null; { const o = mind.step.bind(mind); mind.step = (d, w) => (I = o(d, w)); }
  const hist = []; let pinned = 0, maxPin = 0, inT = 0;
  for (let i = 0; i < 60 * 120; i++) {
    const t = i * dt;
    if (v.dead) break;
    A.step(dt, { agents: [me], noises: i % 240 === 0 ? [{ x: me.x, z: me.z, loud: 0.8, kind: 'shout' }] : [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    if (i % 12) continue;
    const want = !!(I && I.goal && I.goal.kind !== 'face' && !I.freeze && (sim.move || sim.reach || sim.drive));
    hist.push([t, sim.x, sim.z, want]); while (hist.length && hist[0][0] < t - 12) hist.shift();
    const lane = inLane(sim.x, sim.z); if (lane) inT += 0.1;
    if (t > 12 && lane && hist.every((h) => hyp(h[1] - hist[0][1], h[2] - hist[0][2]) < 1) && hist.filter((h) => h[3]).length > 0.8 * hist.length) { pinned += 0.1; maxPin = Math.max(maxPin, pinned); if (V) console.log("pin", t.toFixed(1), sim.x.toFixed(2), sim.z.toFixed(2), hist[0][0].toFixed(1), hist[0][1].toFixed(2), hist[0][2].toFixed(2)); } else pinned = 0;
    if (V && i % 240 === 0) console.log(seed, cx, t.toFixed(0), sim.x.toFixed(1), sim.z.toFixed(1), sim.psi.toFixed(2), mind.beh && mind.beh.name, mind.beh && mind.beh.phase);
  }
  worst = Math.max(worst, maxPin);
  const stuckS = maxPin > 0 ? maxPin + 12 : 0, bad = stuckS > lim; if (bad) fails++;
  console.log(`seed ${seed} case ${cx}: in lane ${inT.toFixed(0)} s, stuck in lane ${stuckS.toFixed(0)} s (limit ${lim}), ended x${sim.x.toFixed(1)} z${sim.z.toFixed(1)}${v.dead ? ' (caught you)' : ''}${bad ? '  STUCK' : ''}`);
}
console.log(`\n${fails} stuck runs of ${N * CASES.length}${fails ? ' FAIL' : ' PASS'}`);
process.exit(fails ? 1 : 0);
