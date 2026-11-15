// node test/fidget.mjs [--secs 60] [--seeds 3,5,8] [--v]: a standing animal lifts a foot only for a reason. Counts lift-offs after
// which, over the next 1.5 s, the hips moved < 0.25 m and the heading turned < 0.12 rad ("fidget steps": the owner's "one leg
// lifting off the floor repeatedly for no good reason"), in scripted standing intents (listen: frozen, eyes jumping round a
// point 14.5 m off; prowl hold: frozen low with the approach goal kept, 36.7 m) and in mind-driven runs with a still person at
// 14.5 m and 36.7 m. --v prints each fidget with what was asked of the body at the lift.
import { makeTerrain } from '../src/terrain.js';
import { RexSim, Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { makeRng } from '../src/math.js';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const secs = +arg('--secs', 60), seeds = arg('--seeds', '3,5,8').split(',').map(Number), V = process.argv.includes('--v'), dt = 1 / 120;
const wr = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// watch one sim: call after each step (before its events are cleared)
export function fidgetWatch(sim) {
  const W = { lifts: [], n: 0, fid: 0, list: [] };
  W.tick = (t, tag = '', evs = sim.events) => {
    for (const e of evs) if (e.type === 'liftoff') {
      const f = sim.feet[e.foot === 0 ? 0 : 1];
      W.lifts.push({ t, x: sim.x, z: sim.z, psi: sim.psi, v: sim.v, tag, foot: e.foot, need: +(f.need ?? 0).toFixed(2), omT: +(sim.omT ?? 0).toFixed(3), om: +(sim.om ?? 0).toFixed(3), vReq: +(sim.vReq ?? sim.vT ?? 0).toFixed(2), frz: sim.freeze, stand: Math.abs(sim.v) < 0.3 });
      W.n++;
    }
    while (W.lifts.length && t - W.lifts[0].t > 1.5) {
      const L = W.lifts.shift(), d = Math.hypot(sim.x - L.x, sim.z - L.z), y = Math.abs(wr(sim.psi - L.psi));
      if (L.stand && d < 0.25 && y < 0.12) { W.fid++; const pr = W.list.filter((q) => L.t - q.t < 3.5).length; if (pr) W.rep = (W.rep || 0) + 1; W.list.push({ ...L, d: +d.toFixed(2), dy: +y.toFixed(3), rep: pr > 0 }); }
    }
  };
  return W;
}
function scripted(name, seed, fn) {
  const T = makeTerrain(7), sim = new RexSim(T, { seed }), W = fidgetWatch(sim), R = makeRng(seed * 7 + 1);
  const S = { next: 0, jx: 0, jz: 0 };
  for (let i = 0; i < secs * 120; i++) { const t = i * dt; sim.step(dt, fn(t, sim, S, R, T)); W.tick(t, name); sim.events.length = 0; }
  return W;
}
const ahead = (sim, d) => ({ x: Math.sin(0) * d, z: Math.cos(0) * d });
const SCR = {
  // the mind's listen: frozen, alert, breath held, eyes on a point that jumps by up to 4 m every ~1.4 s (14.5 m off)
  listen: (t, sim, S, R, T) => { S.next -= dt; if (S.next < 0) { S.next = 1.4 * Math.exp(0.5 * (R() * 2 - 1)); S.jx = R.range(-4, 4); S.jz = R.range(-4, 4); }
    const p = ahead(sim, 14.5); return { goal: null, freeze: true, alert: 1, breathHold: 1, noIdle: true, look: { x: p.x + S.jx, y: T.height(p.x, p.z) + 1.7, z: p.z + S.jz, lock: true }, attention: { x: p.x, y: T.height(p.x, p.z) + 1.7, z: p.z } }; },
  // the same with what it heard off to the side (b.at at `side` rad off its first heading): the mind faces it only past 1.2 rad
  ...Object.fromEntries([0.9, 1.1, 1.3, 1.7].map((side) => ['listen' + side, (t, sim, S, R, T) => { S.next -= dt; if (S.next < 0) { S.next = 1.4 * Math.exp(0.5 * (R() * 2 - 1)); S.jx = R.range(-4, 4); S.jz = R.range(-4, 4); }
    const p = { x: Math.sin(side) * 14.5, z: Math.cos(side) * 14.5 }, y = T.height(p.x, p.z) + 1.7, far = Math.abs(wr(Math.atan2(p.x - sim.x, p.z - sim.z) - sim.psi)) > 1.2;
    return { goal: far ? { kind: 'face', x: p.x, z: p.z } : null, quickTurn: far, freeze: !far, alert: 1, breathHold: 1, noIdle: true, look: { x: p.x + S.jx, y: y + 0.5, z: p.z + S.jz, lock: true } }; }])),
  // prowl, watched at 36.7 m: frozen low with the approach goal kept (I.freeze = hold), eyes locked on him
  prowlhold: (t, sim, S, R, T) => { const p = ahead(sim, 36.7), y = T.height(p.x, p.z) + 1.7; return { goal: { kind: 'approach', id: 1, x: p.x, z: p.z, stop: 0.5, quick: true }, pace: 1.5, stalk: true, freeze: true, breathHold: 0.9, alert: 0.3, quickTurn: true, look: { x: p.x, y, z: p.z, lock: true }, attention: { x: p.x, y, z: p.z } }; },
  // prowl hold, the person shifting a little (a still player sways and steps): the face goal at the edge of its rush range
  prowlface: (t, sim, S, R, T) => { const p = { x: 3 * Math.sin(t * 0.21), z: 20 }, y = T.height(p.x, p.z) + 1.7, rel = wr(Math.atan2(p.x - sim.x, p.z - sim.z) - sim.psi); return { goal: { kind: 'face', x: p.x, z: p.z }, freeze: Math.abs(rel) < 0.3, stalk: true, breathHold: 0.9, look: { x: p.x, y, z: p.z, lock: true }, attention: { x: p.x, y, z: p.z } }; },
};
function minded(D0, seed, watch = true) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed), W = fidgetWatch(sim);
  A.herd.disabled = true;
  const me = { id: 'you', x: Math.sin(0.4) * D0, y: 0, z: Math.cos(0.4) * D0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 }, beh = {};
  for (let i = 0; i < secs * 120; i++) {
    me.y = T.height(me.x, me.z) + 1.7; const dd = Math.hypot(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / dd * (watch ? 1 : -1); me.fz = (sim.z - me.z) / dd * (watch ? 1 : -1);
    A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
    const bn = mind.beh ? mind.beh.name + '/' + (mind.beh.phase || '') : '-'; beh[bn] = (beh[bn] || 0) + 1;
    W.tick(i * dt, bn, A.events); A.events.length = 0; sim.events.length = 0;
  }
  W.beh = beh; return W;
}
// play-like: herd on, a person who walks about, runs, hides behind the nearest solid and comes out again (k6 came after he hid)
function played(seed, kind) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed), W = fidgetWatch(sim);
  const me = { id: 'you', x: 8, y: 0, z: 30, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 }, beh = {};
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z;
    if (kind === 'wander') { me.x = 8 + Math.sin(t * 0.05) * 25; me.z = 30 + Math.cos(t * 0.04) * 12; }
    if (kind === 'runs') { const ph = Math.floor(t / 20) % 3; if (ph === 1) { const d = Math.hypot(me.x - sim.x, me.z - sim.z) || 1; me.x += (me.x - sim.x) / d * 5 * dt; me.z += (me.z - sim.z) / d * 5 * dt; } }
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = Math.hypot(me.vx, me.vz);
    const dd = Math.hypot(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / dd; me.fz = (sim.z - me.z) / dd;
    A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
    const bn = mind.beh ? mind.beh.name + '/' + (mind.beh.phase || '') : '-'; beh[bn] = (beh[bn] || 0) + 1;
    W.tick(t, bn, A.events); A.events.length = 0;
  }
  W.beh = beh; return W;
}
if (process.argv[1].endsWith('fidget.mjs')) {
  let tot = 0, rep = 0;
  const show = (lab, W) => { tot += W.fid; rep += W.rep || 0; console.log(`${lab.padEnd(34)} lift-offs ${String(W.n).padStart(3)}  fidget ${String(W.fid).padStart(3)} repeated ${String(W.rep || 0).padStart(2)}` + (W.beh ? '   ' + Object.entries(W.beh).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(v / 120).toFixed(0)}s`).join(', ') : ''));
    if (V) for (const L of W.list) console.log(`     t=${L.t.toFixed(2)} ${L.tag} foot${L.foot} need ${L.need} omT ${L.omT} om ${L.om} vReq ${L.vReq} frz ${L.frz} moved ${L.d} m / ${L.dy} rad${L.rep ? '  REPEAT' : ''}`); };
  for (const seed of seeds) for (const k of Object.keys(SCR)) show(`${k} seed ${seed}`, scripted(k, seed, SCR[k]));
  for (const seed of seeds) for (const D0 of [14.5, 36.7]) show(`mind ${D0} m seed ${seed}`, minded(D0, seed));
  for (const seed of seeds) for (const k of ['wander', 'runs']) show(`play ${k} seed ${seed}`, played(seed, k));
  console.log(`TOTAL fidget steps ${tot}, repeated (another within 3.5 s) ${rep}`);
}
