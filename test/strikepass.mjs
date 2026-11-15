// node test/strikepass.mjs: a man walks past it at 1.6 m/s, OFF m to its side (crossing in front of the chest, beside the head);
// when he is level with its head the committed strike is fired at where he is then. Hit or miss, and ms to contact, per offset and
// heading of his walk (the ambush at a way out: 1.4-3 m).
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
const dt = 1 / 120, out = [];
for (const off of [1.4, 2, 3]) for (const along of [2.5, 4]) for (const dir of [1, -1]) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: 3 }), mind = new Mind(sim, 3), A = new Arena(T, sim, mind, 3); A.herd.disabled = true;
  // he walks along x at z = along (ahead of the hips), from 8 m to one side to 8 m past; off: how far his line is off the head's side
  const me = { id: 'you', x: -8 * dir, z: along, y: 0, vx: 1.6 * dir, vz: 0, speed: 1.6, crouch: false, fx: dir, fz: 0 }, W = { agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: 0 } };
  me.y = T.height(me.x, me.z) + 1.7;
  for (let i = 0; i < 240; i++) A.step(dt, W, { goal: null, pace: 1, freeze: true });
  let fired = null, hit = null;
  for (let i = 0; i < 12 * 120 && hit === null; i++) {
    me.x += 1.6 * dir * dt; me.y = T.height(me.x, me.z) + 1.7;
    A.step(dt, W, { goal: null, pace: 1, freeze: true, look: { x: me.x, y: me.y, z: me.z, lock: true } });
    // fire when he is off m from the line straight ahead of the head, on the near side, coming in
    if (fired === null && dir * me.x > -off - 0.05 && dir * me.x < -off + 0.05) { sim.gesture('strike', { x: me.x, y: me.y - 0.6, z: me.z }, { over: true }); fired = i * dt; }
    for (const e of A.events) if (e.type === 'struck') hit = (i + 1) * dt; A.events.length = 0;
    if (fired !== null && i * dt - fired > 1.2) break;
  }
  out.push(`${off} m off, ${along} m ahead, ${dir > 0 ? 'L->R' : 'R->L'}: ${hit === null ? 'MISS' : Math.round((hit - fired) * 1000) + ' ms'}`);
}
console.log(out.join('\n')); console.log(`hits ${out.filter((x) => !x.includes('MISS')).length}/${out.length}`);
