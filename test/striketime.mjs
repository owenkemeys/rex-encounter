// node test/striketime.mjs: the committed strike's timing against range (peril.mjs' timing block, alone): from a standing start, the
// first motion of the head to the jaws reaching the person; and the neck while it strikes (gap between head and neck end, bends).
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const dt = 1 / 120, hyp = Math.hypot, timing = [];
const side = +(process.argv[2] || 0);      // the person this many m off to the side as well
for (const D of [3, 4, 5, 6, 7, 9]) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: 3 }), mind = new Mind(sim, 3), A = new Arena(T, sim, mind, 3); A.herd.disabled = true;
  const me = { id: 'you', x: side, z: D, y: T.height(side, D) + 1.7, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 }, W = { agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: 0 } };
  for (let i = 0; i < 240; i++) A.step(dt, W, { goal: null, pace: 1 });
  const inReach = hyp(me.x, me.z) <= mind.peril.reach();
  if (inReach) sim.gesture('strike', { x: me.x, y: me.y - 0.6, z: me.z }, { over: true }); const h0 = sim.head.pos.clone(); let moved = null, hit = null, gap = 0;
  for (let i = 0; i < 180 && hit === null; i++) { A.step(dt, W, inReach ? { goal: null, pace: 1, look: { x: me.x, y: me.y, z: me.z, lock: true } } : { goal: { kind: 'approach', id: 1, x: me.x, z: me.z, stop: 2, quick: true }, pace: 10.5, burst: true }); gap = Math.max(gap, sim.neckGap); if (moved === null && sim.head.pos.distanceTo(h0) > 0.03) moved = i * dt; if (!inReach && !(sim.act && sim.act.kind === 'strike') && hyp(sim.x - me.x, sim.z - me.z) <= mind.peril.reach()) sim.gesture('strike', { x: me.x, y: me.y - 0.6, z: me.z }, { over: true }); for (const e of A.events) if (e.type === 'struck') hit = (i + 1) * dt; A.events.length = 0; }
  timing.push({ D, inReach, ms: hit === null ? null : Math.round((hit - (moved ?? 0)) * 1000), gap });
}
console.log(`strike${side ? ' (' + side + ' m aside)' : ''}, first motion to contact: ${timing.map((x) => `${x.D} m ${x.ms === null ? 'miss' : x.ms + ' ms'}${x.inReach ? '' : ' (rush)'} gap ${x.gap.toFixed(2)}`).join(', ')}`);
