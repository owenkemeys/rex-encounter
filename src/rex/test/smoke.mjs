// The rex alone on flat ground, no game: the fast check a host (or anyone changing the rex) runs first. About two seconds.
//   node src/rex/test/smoke.mjs
// 1. The body by itself, driven by plain intents (walk to a point, then run): it gets there on its feet.
// 2. Body and mind together for 20 s with one person walking past: it senses them, picks behaviours, stays upright and inside
//    the fence, and every pose number is finite.
// 3. The same seed twice gives the same animal (determinism).
// 4. The terrain contract (terrain-contract.js) is complete: the rex reads no terrain name the contract does not list.
import { Creature, PV, PS } from '../body/rex.js';
import { Mind } from '../brain/mind.js';
import { flatTerrain, checkTerrain, REQUIRED, OPTIONAL } from '../terrain-contract.js';

let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };
const DT = 1 / 120;

// a terrain that notes every name the rex asks it for
const asked = new Set();
const watched = (T) => new Proxy(T, { get(o, k) { if (typeof k === 'string') asked.add(k); return o[k]; } });

ok(checkTerrain(flatTerrain()).length === 0, 'flatTerrain() meets the contract');
ok(checkTerrain({}).join(',') === [...REQUIRED, 'rect', 'bound', 'arena'].join(','), 'checkTerrain names what an empty world lacks');

// 1. the body alone
{
  const T = watched(flatTerrain()), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: 3 });
  let falls = 0, closest = 99;
  for (let i = 0; i < 30 * 120; i++) {
    const t = i * DT, intent = t < 18 ? { goal: { kind: 'reach', id: 1, x: 0, z: 30 }, pace: 2.2, attention: null } : { goal: { kind: 'reach', id: 2, x: 0, z: -20 }, pace: 8, attention: null };
    sim.step(DT, intent);
    for (const e of sim.events) if (e.type === 'footfall') falls++;
    if (t < 18) closest = Math.min(closest, Math.hypot(sim.head.pos.x, sim.head.pos.z - 30));
    sim.events.length = 0;
  }
  ok(closest < 3, `body: walks its snout to a point 30 m ahead (within ${closest.toFixed(1)} m)`);
  ok(falls > 20, `body: steps (${falls} footfalls)`);
  ok(sim.z < 0, `body: turns and runs back (z ${sim.z.toFixed(1)})`);
}

// 2. body and mind
function life(seed) {
  const T = watched(flatTerrain()), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed);
  const me = { id: 'you', x: -25, y: 1.7, z: 20, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0 };
  const behs = new Set(); let seen = false, finite = true, minHead = 99, out = 0, thoughts = 0;
  for (let i = 0; i < 20 * 120; i++) {
    const t = i * DT, px = me.x;
    me.x = -25 + 2.5 * t; me.vx = (me.x - px) / DT; me.speed = Math.abs(me.vx);
    const noises = i % 60 === 0 ? [{ x: me.x, y: 0, z: me.z, loud: 0.045, kind: 'step', you: true }] : [];
    const intent = mind.step(DT, { agents: [me], noises, light: 0.8, flash: false, wind: { x: 0, z: -3 } });
    sim.step(DT, intent); sim.events.length = 0; mind.events.length = 0;
    if (mind.beh) behs.add(mind.beh.name);
    if (mind.know.seen) seen = true;
    if (mind.voice && mind.voice.think) thoughts++;
    if (i % 12 === 0) { for (const v of sim.pose.v) if (!Number.isFinite(v)) finite = false; for (const v of sim.pose.s) if (!Number.isFinite(v)) finite = false; }
    minHead = Math.min(minHead, sim.head.pos.y - sim.groundY);
    if (Math.abs(sim.x) > 60 || Math.abs(sim.z) > 60) out++;
  }
  return { sim, mind, behs, seen, finite, minHead, out, thoughts };
}
const A = life(3);
ok(A.seen, 'mind: sees the person walking past');
ok(A.behs.size >= 2, `mind: picks behaviours (${[...A.behs].join(', ')})`);
ok(A.finite, 'pose: every number finite');
ok(A.sim.pose.v.length === PV.COUNT * 3 && A.sim.pose.s.length === PS.COUNT, 'pose: layout as exported (PV, PS)');
ok(A.minHead > 0.5, `body: stays on its feet (head at least ${A.minHead.toFixed(2)} m up)`);
ok(A.out === 0, 'body: stays inside the fence');

// 3. determinism
{
  const B = life(3), a = A.sim.pose.v, b = B.sim.pose.v; let same = a.length === b.length;
  for (let i = 0; same && i < a.length; i++) if (a[i] !== b[i]) same = false;
  ok(same && A.mind.beh.name === B.mind.beh.name, 'same seed, same animal');
}

// 4. the contract lists every name the rex read
{
  const known = new Set([...REQUIRED, ...OPTIONAL, 'rect', 'bound', 'arena', 'size', 'base', 'addBump', 'colliders', 'grazing']);
  const extra = [...asked].filter((k) => !known.has(k));
  ok(extra.length === 0, 'terrain contract: the rex read only listed names' + (extra.length ? ' (unlisted: ' + extra.join(', ') + ')' : ''));
}
console.log(fails ? `FAILED ${fails}` : 'all ok');
process.exit(fails ? 1 : 0);
