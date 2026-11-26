// Mind-driven scenes for the film renderer: node test/mdump.mjs <scene> <from> <secs> <out.json> [seed]
// scenes: feed (meat nearby), flare, shed (person in the shed), tower, hunt (hungry, herd near), hit (stones thrown at it),
//         grab (hungry, a person close who fights when caught), swipe (stones from right behind it, after warnings)
import { makeTerrain } from '../src/terrain.js';
import { Creature, PV, SPINE_N } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { Nav } from '../src/rex/body/nav.js';
import fs from 'fs';
const [,, scene = 'feed', from = '0', secs = '6', out = 'out/d.json', seed = '3'] = process.argv;
const T = makeTerrain(7); let sim, me = null;
const siegeAt = (kind, crouch) => {
  const s = T.structures.find((q) => q.kind === kind), NV = new Nav(T); let ax = 0, az = 0;
  found: for (const d of [32, 26, 20, 14]) for (const O of s.openings) { const n = Math.hypot(O.nx, O.nz), x = O.x + O.nx / n * d, z = O.z + O.nz / n * d; if (NV.costAt(x, z) < 1.3 && [0, 1, 2, 3, 4, 5, 6, 7].every((k) => Math.abs(T.height(x + Math.sin(k) * 6, z + Math.cos(k) * 6) - T.height(x, z)) < 1.5)) { ax = x; az = z; break found; } }
  sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(s.cx - ax, s.cz - az), seed: +seed }); me = { id: 'you', x: s.cx, z: s.cz, y: 0, vx: 0, vz: 0, speed: 0, crouch, fx: 0, fz: 1 };
  return (A, M) => { A.herd.disabled = true; if (process.env.FORCE) { M.ov.force = 'besiege'; M.ov.omniscient = true; } };
};
const S = (k) => T.structures.find((s) => s.kind === k);
const setup = {
  feed: () => { sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed: +seed }); return (A, M) => { M.hunger = 0.9; A.things.place('meat', sim.x + Math.sin(sim.psi) * 14, sim.z + Math.cos(sim.psi) * 14); }; },
  flare: () => { sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed: +seed }); return (A) => { A.things.place('flare', sim.x + Math.sin(sim.psi) * 16, sim.z + Math.cos(sim.psi) * 16); }; },
  hunt: () => { sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed: +seed }); return (A, M) => { M.hunger = 1; M.ov.hold.hunger = 1; const hx = sim.x + Math.sin(sim.psi) * 45, hz = sim.z + Math.cos(sim.psi) * 45; A.herd.home = { x: hx, z: hz }; A.herd.list.forEach((p, i) => { p.x = hx + (i % 3) * 3 - 3; p.z = hz + Math.floor(i / 3) * 3 - 3; }); }; },
  shed: () => { const s = S('shed'), O = s.openings[0], n = Math.hypot(O.nx, O.nz); sim = new Creature(T, { x: O.x + O.nx / n * 26, z: O.z + O.nz / n * 26, yaw: Math.atan2(-O.nx, -O.nz), seed: +seed }); me = { id: 'you', x: s.cx, z: s.cz, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 }; return (A) => { A.herd.disabled = true; }; },
  // a person hiding in the pen or the pipe (crouched), and the animal set to work at it (FORCE=1: besieging from the start)
  pen: () => siegeAt('pen', false), culvert: () => siegeAt('culvert', true), shedf: () => siegeAt('shed', false),
  tower: () => { const s = S('tower'); sim = new Creature(T, { x: s.cx + 25, z: s.cz, yaw: -Math.PI / 2, seed: +seed }); me = { id: 'you', x: s.cx, z: s.cz, y: 0, up: s, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 }; return (A) => { A.herd.disabled = true; }; },
  // a hungry animal and a person close by who fights when caught: the seize, lift, shake and toss/drop
  grab: () => { sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: +seed }); me = { id: 'you', x: 2, z: 10, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, fight: true }; return (A, M) => { A.herd.disabled = true; M.hunger = 0.97; M.ov.hold.hunger = 0.97; }; },
  // stones from behind it at close range: the tail swipe
  swipe: () => { sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: +seed }); me = { id: 'you', x: 0.5, z: -6, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1, fight: true, stones: 5, behind: true }; return (A, M) => { A.herd.disabled = true; M.grudge = 0.7; M.warnedT = 0; }; },
  // any behaviour forced (BEH=watch|circle|appraise|guard|idle), a person standing in the open
  beh: () => { sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: +seed }); const b = process.env.BEH || 'watch'; if (b !== 'idle') me = { id: 'you', x: 3, z: 15, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 }; return (A, M) => { A.herd.disabled = true; A.herd.list.length = 0; M.ov.force = b; M.ov.omniscient = b !== 'idle'; }; },
  hit: () => { sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed: +seed }); me = { id: 'you', x: sim.x + Math.sin(sim.psi + 2) * 18, z: sim.z + Math.cos(sim.psi + 2) * 18, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 }; return (A) => { A.herd.disabled = true; }; },
}[scene]();
const mind = new Mind(sim, +seed), A = new Arena(T, sim, mind, +seed); setup(A, mind);
const dt = 1 / 120, frames = [], F = +from * 120, N = F + +secs * 120;
for (let i = 0; i < N; i++) {
  const t = i * dt;
  if (me) me.y = (me.up ? me.up.base + me.up.h : T.height(me.x, me.z)) + (me.crouch ? 0.9 : 1.7);
  if (scene === 'hit' && i % (120 * 5) === 600) A.things.throw('stone', me.x, me.y, me.z, sim.x, sim.z, 'you', sim.py.x + 0.4);
  if (me && me.stones && A.victim('you').free && i % (120 * me.stones) === 240) A.things.throw('stone', me.x, me.y, me.z, sim.x, sim.z, 'you', sim.py.x + 0.4);
  if (me && me.fight && !A.victim('you').free && i % 20 === 0) A.struggle('you', 1);
  if (me && me.fight && A.victim('you').free && A.victim('you').handled) { me.x = A.victim('you').x; me.z = A.victim('you').z; }
  if (me && me.behind && A.victim('you').free) { const tx = sim.x - Math.sin(sim.psi) * 6.5, tz = sim.z - Math.cos(sim.psi) * 6.5, dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz); if (d > 0.3) { me.x += dx / d * Math.min(d, 3 / 120); me.z += dz / d * Math.min(d, 3 / 120); } }
  const noises = me && Math.abs(t - 2) < 0.004 ? [{ x: me.x, y: me.y, z: me.z, loud: 0.6, kind: 'shout' }] : [];
  A.step(dt, { agents: me ? [me] : [], noises, light: 0.9, flash: false, wind: { x: 0, z: -2 } });
  A.events.length = 0;
  if (i >= F) { const v = sim.pose.v; frames.push({ t: +((i - F) * dt).toFixed(4), x: sim.x, z: sim.z, psi: sim.psi, gy: sim.groundY, v: sim.v, p: Array.from(v.subarray(0, SPINE_N * 3), (n) => +n.toFixed(3)), h: [...v.subarray(PV.HEAD_P * 3, PV.HEAD_P * 3 + 9)].map((n) => +n.toFixed(3)), l: [...v.subarray(PV.LEG * 3, PV.LEG * 3 + 36)].map((n) => +n.toFixed(3)), a: [...v.subarray(PV.ARM * 3, PV.ARM * 3 + 18)].map((n) => +n.toFixed(3)), jaw: +sim.pose.s[0].toFixed(3), pl: [sim.feet[0].planted ? 1 : 0, sim.feet[1].planted ? 1 : 0], fix: [sim.fix.x, sim.fix.y, sim.fix.z].map((n) => +n.toFixed(2)), you: [A.victim('you').x, A.victim('you').y, A.victim('you').z].map((n) => +(+n).toFixed(2)), ys: A.victim('you').state, mode: mind.label + (mind.beh && mind.beh.phase ? '/' + mind.beh.phase : '') + (mind.beh && mind.beh.sub ? '/' + mind.beh.sub : ''), gl: [-8, -6, -4, -2, 0, 2, 4, 6, 8, 10].map((d) => +T.height(sim.x + Math.sin(sim.psi) * d, sim.z + Math.cos(sim.psi) * d).toFixed(3)) }); }
}
// the solid things near where it was (footprint, bottom, top), so the film can draw them
const cx = frames.reduce((q, f) => q + f.x, 0) / frames.length, cz = frames.reduce((q, f) => q + f.z, 0) / frames.length;
const cols = T.colliders.filter((c) => Math.hypot(c.x - cx, c.z - cz) < 22).map((c) => [+c.x.toFixed(2), +c.z.toFixed(2), +c.r.toFixed(2), c.bot === undefined ? null : +c.bot.toFixed(2), +c.top.toFixed(2)]);
fs.writeFileSync(out, JSON.stringify({ name: scene, IDX: { TAIL_BASE: 12, PELVIS: 13, CHEST: 18 }, cols, frames }));
