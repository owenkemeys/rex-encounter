// The owner's window playtest: a hungry rex outside the Warehouse, a person standing still just inside a window (x -50.3, z 60.6).
// Does the head go through, how near does the snout get, how long does it stand back?   node test/window.mjs [seed] [secs]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
const seed = +(process.argv[2] || 1), SECS = +(process.argv[3] || 60), dt = 1 / 120, hyp = Math.hypot;
const T = makeTerrain(7), S = T.structures.find((s) => s.kind === 'warehouse');
const inFoot = (x, z) => { const dx = x - S.cx, dz = z - S.cz, c = Math.cos(S.yaw || 0), s = Math.sin(S.yaw || 0); return Math.abs(dx * c - dz * s) < S.hw && Math.abs(dx * s + dz * c) < S.hd; };
const me = { id: 'you', x: -50.3, z: 60.6, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 1, ly: 0, lz: 0 }; me.y = T.height(me.x, me.z) + 1.65;
const sx = -50.5, sz = 45, sim = new Creature(T, { x: sx, z: sz, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 0.9;
let inT = 0, minD = 99, back = 0, first = null, within = 0, snapT = 0;
for (let i = 0; i < SECS * 120; i++) {
  const t = i * dt; const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl;
  A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
  const h = sim.head.pos, F = sim.head.f, HL = sim.sp ? sim.sp.dims.headLen : 1.1, tip = { x: h.x + F.x * HL, y: h.y + F.y * HL, z: h.z + F.z * HL }, dS = hyp(tip.x - me.x, tip.y - me.y, tip.z - me.z), inside = inFoot(tip.x, tip.z);
  if (inside) { inT += dt; if (first === null) first = t; } if (dS < minD) minD = dS;
  if (t > 5 && hyp(sim.x - me.x, sim.z - me.z) > 3.5) back += dt;
  if (i % 120 === 0) { const b = mind.beh; console.log(`${t.toFixed(0).padStart(3)} ${b ? b.name + '/' + (b.sub || b.phase || '') + '/' + (b.phase || '') : '-'} body ${sim.x.toFixed(1)},${sim.z.toFixed(1)} psi ${sim.psi.toFixed(2)} snout(head.pos) ${h.x.toFixed(1)},${h.y.toFixed(1)},${h.z.toFixed(1)} tip ${tip.x.toFixed(1)},${tip.y.toFixed(1)},${tip.z.toFixed(1)} dTip ${dS.toFixed(1)} inside ${inside ? 1 : 0} dBody ${hyp(sim.x - me.x, sim.z - me.z).toFixed(1)} victim ${A.victim('you').free ? 'free' : 'HELD'}`); }
}
console.log(`SUMMARY seed ${seed}: snout TIP inside footprint ${inT.toFixed(1)} s (first at ${first === null ? 'never' : first.toFixed(1) + ' s'}); min tip-person (eye height) ${minD.toFixed(2)} m; body >3.5 m from person for ${back.toFixed(1)} s of ${SECS - 5}; person ${A.victim('you').free ? 'untouched' : 'held/killed'}`);
