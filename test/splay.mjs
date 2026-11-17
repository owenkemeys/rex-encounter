// node test/splay.mjs [quiet|v]   T6 / T14 / T15 and the owner (2026-11-17): "we really have to fix this splaying thing when it is
// taking a wide corner fast ... its body drops low to the ground presumably to try and span the distance between wide spaced feet.
// its only for a split second during chases but its really bad for the illusion!"
// Per tick: speed, turn rate, hip height above ground and its DROP below the straight-run baseline for that speed, stance width,
// each foot's lateral / fore-aft offset from its hip, each leg's stretch, planted toe yaw, roll. EPISODE = while faster than 4 m/s:
// hip drop > 0.25 m, or stance > 1.5x standing (0.88 m), (a leg stretch > 0.97 is printed but not a trigger: the legs sit at 0.985 even in a straight run; planted legs only are counted). Scenarios: body-only wide arcs (60/90/120/180 degrees
// at two leg lengths), `drive` at full throttle with steer 0.3/0.6/1.0, the corner.mjs chase; and with the mind: a scripted runner
// weaving round the Containers (3 seeds, 60 s).
import { makeTerrain } from '../src/terrain.js';
import { Creature, DIM, PV } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
// GAIT=legacy: the gait before the 2026-11-17 fix (sim.gaitLegacy; see Creature constructor)
const mkC = (T, o) => { const c = new Creature(T, o); if (process.env.GAIT === 'legacy') c.gaitLegacy = true; return c; };
const FX = 30, FZ = -5;      // a clear (no tree within 36 m of (30, 25)) and flat (0.5 m range) patch: hip height against the feet's ground is then not the terrain's doing
const dt = 1 / 120, hyp = Math.hypot, LEGL = DIM.femur + DIM.tibia, STAND = 0.88, VQ = process.argv[2] === 'quiet', VV = process.argv[2] === 'v';
const wrap = (a) => { a %= 2 * Math.PI; return a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a; };
const LIMS = { drop: 0.25, stance: 1.5 * STAND, stretch: 0.97 };
// baseline hip height by speed: a straight run on the same ground at each pace
const BASE = []; {
  for (const pace of [2, 3.5, 5, 6.5, 8, 9.5]) {
    const T = flat(makeTerrain(7)), sim = mkC(T, { x: FX, z: FZ, yaw: 0, seed: 1 }); let hs = 0, vs = 0, n = 0;
    for (let i = 0; i < 8 * 120; i++) { sim.step(dt, { goal: { kind: 'drive', id: 1, throttle: 1, steer: 0 }, pace, burst: pace > 9 }); sim.events.length = 0; if (i > 4 * 120) { hs += sim.py.x - (sim._dbgH ? sim._dbgH.gY : sim.groundY); vs += Math.abs(sim.v); n++; } }
    BASE.push([vs / n, hs / n]);
  }
}
const base = (v) => { if (v <= BASE[0][0]) return BASE[0][1]; for (let i = 1; i < BASE.length; i++) if (v <= BASE[i][0]) { const u = (v - BASE[i - 1][0]) / (BASE[i][0] - BASE[i - 1][0]); return BASE[i - 1][1] + u * (BASE[i][1] - BASE[i - 1][1]); } return BASE[BASE.length - 1][1]; };
class Rec {
  constructor(name) { this.name = name; this.buf = []; this.eps = []; this.cur = null; this.moving = 0; this.worst = { reach: 0, drop: 0, stance: 0, stretch: 0, footOut: 0, om: 0, roll: 0, toeYaw: 0 }; this.t = 0; this.slowT = 0; }
  tick(sim, t, extra) {
    this.t = t; const v = sim.pose.v, psi = sim.psi, fx = Math.sin(psi), fz = Math.cos(psi), rx = Math.cos(psi), rz = -Math.sin(psi), spd = Math.abs(sim.v);
    const hip = [], an = [];
    for (let k = 0; k < 2; k++) { const o = (PV.LEG + k * 6) * 3; hip.push([v[o], v[o + 1], v[o + 2]]); an.push([v[o + 6], v[o + 7], v[o + 8]]); }
    let hhn = sim.py.x - (sim._dbgH ? sim._dbgH.gY : sim.groundY); this.buf.push(hhn); if (this.buf.length > 18) this.buf.shift(); const hhs = this.buf.reduce((a, b) => a + b, 0) / this.buf.length;      // 0.15 s mean: the stride's own bounce (+-0.14 m) is not a drop
    const stance = Math.abs((an[0][0] - an[1][0]) * rx + (an[0][2] - an[1][2]) * rz), hh = hhs, drop = base(spd) - hh;
    const m = { stance, drop, hh, v: spd, om: sim.om, roll: sim.pRoll.x, stretch: 0, footOut: 0, toeYaw: 0, planted: [], lat: [], fwd: [] };
    for (let k = 0; k < 2; k++) {
      const hx = an[k][0] - hip[k][0], hz = an[k][2] - hip[k][2], s = k ? -1 : 1, out = s * (hx * rx + hz * rz), fa = hx * fx + hz * fz, st = hyp(hx, an[k][1] - hip[k][1], hz) / LEGL;
      m.lat.push(out); m.fwd.push(fa); m.stretchAll = Math.max(m.stretchAll || 0, st); if (sim.feet[k].planted) m.stretch = Math.max(m.stretch, st); m.footOut = Math.max(m.footOut, out);
      const f = sim.feet[k]; m.planted.push(f.planted ? (t - f.tLand).toFixed(2) : 's');
      if (f.planted) { const o = (PV.LEG + k * 6) * 3, ty = Math.abs(wrap(Math.atan2(v[o + 12], v[o + 14]) - psi)); m.toeYaw = Math.max(m.toeYaw, ty); }
    }
    if (spd > 4) { if (sim._dbgH && sim._dbgH.yF !== undefined) this.worst.reach = Math.max(this.worst.reach, sim._dbgH.yT0 - sim._dbgH.yF);      // how far the legs' reach lowered the hips' target (after the engine's own limit)
      this.moving += dt; const W = this.worst; for (const k of ['drop', 'stance', 'stretch', 'footOut', 'toeYaw']) W[k] = Math.max(W[k], m[k]); W.om = Math.max(W.om, Math.abs(m.om)); W.roll = Math.max(W.roll, Math.abs(m.roll));
      const bad = m.drop > LIMS.drop || m.stance > LIMS.stance;
      if (bad) { if (!this.cur || t - this.cur.t1 > 0.3) { this.cur = { t0: t, t1: t, w: { drop: -9, stance: 0, stretch: 0, toeYaw: 0, om: 0, v: 0, footOut: 0, roll: 0 }, pl: m.planted.slice(), st: `${sim.feet[0].planted ? 'P' : 's'}${sim.feet[1].planted ? 'P' : 's'}`, extra }; this.eps.push(this.cur); }
        const c = this.cur; c.t1 = t; for (const k of ['drop', 'stance', 'stretch', 'toeYaw', 'footOut']) c.w[k] = Math.max(c.w[k], m[k]); c.w.om = Math.max(c.w.om, Math.abs(m.om)); c.w.v = Math.max(c.w.v, m.v); c.w.roll = Math.max(c.w.roll, Math.abs(m.roll)); c.pl = m.planted.slice(); }
    }
  }
}
const all = [];
function report(r) {
  const mins = r.moving / 60, W = r.worst;
  console.log(`${r.name.padEnd(34)} fast ${r.moving.toFixed(0).padStart(3)}s  episodes ${String(r.eps.length).padStart(2)} (${(r.eps.length / Math.max(mins, 1e-9)).toFixed(1)}/min)  worst: reach-sink ${W.reach.toFixed(2)} drop ${W.drop.toFixed(2)} stance ${W.stance.toFixed(2)} stretch ${W.stretch.toFixed(3)} footOut ${W.footOut.toFixed(2)} toeYaw ${W.toeYaw.toFixed(2)} om ${W.om.toFixed(2)} roll ${W.roll.toFixed(2)}`);
  if (!VQ) for (const e of r.eps) console.log(`    t ${e.t0.toFixed(2)} len ${(e.t1 - e.t0 + dt).toFixed(2)} s  v<=${e.w.v.toFixed(1)} om ${e.w.om.toFixed(2)} drop ${e.w.drop.toFixed(2)} stance ${e.w.stance.toFixed(2)} stretch ${e.w.stretch.toFixed(3)} toeYaw ${e.w.toeYaw.toFixed(2)} down(s) ${e.pl.join('/')} gait ${e.st}${e.extra ? ' ' + e.extra : ''}`);
  all.push(r);
}
function flat(T) { if (!process.env.REAL) T.height = () => 0; return T; }      // the synthetic scenarios run on level ground (REAL=1: the map's own 0.5 m undulation): hip height against the feet's ground is then only the legs' doing
const mkSim = (seed = 3, x = FX, z = FZ, yaw = 0) => { const T = flat(makeTerrain(7)), sim = mkC(T, { x, z, yaw, seed }); return { T, sim }; };
// 1. wide arcs: a run-up, then waypoints each turning `deg` from the last, `leg` m apart; the animal is asked to go for each in turn
for (const deg of [60, 90, 120, 180]) for (const leg of [12, 25]) for (const sgn of [1, -1]) {
  const { sim } = mkSim(3, FX - sgn * 0.9 * leg), r = new Rec(`arc ${deg} deg leg ${leg} m ${sgn > 0 ? 'R' : 'L'}`);
  let psi = 0, wp = { x: FX - sgn * 0.9 * leg, z: FZ + 30 }, t = 0, n = 0;
  for (let i = 0; i < 40 * 120; i++) { t = i * dt;
    if (hyp(sim.x - wp.x, sim.z - wp.z) < 5 && t > 3) { psi += sgn * deg * Math.PI / 180 * (n % 2 ? 1 : 1); n++; wp = { x: wp.x + Math.sin(psi) * leg, z: wp.z + Math.cos(psi) * leg }; }
    sim.step(dt, { goal: { kind: 'approach', id: 1 + n, x: wp.x, z: wp.z, stop: 0.5, quick: true }, pace: 9.5, burst: t < 3, agitation: 0.8, attention: null }); sim.events.length = 0; r.tick(sim, t, `wp${n}`); }
  report(r);
}
// 2. drive at full throttle with a held steer
for (const st of [0.3, 0.6, 1.0]) { const { sim } = mkSim(), r = new Rec(`drive full throttle steer ${st}`);
  for (let i = 0; i < 9 * 120; i++) { const t = i * dt, s = t > 4.5 && t < 7.5 ? st : 0; sim.step(dt, { goal: { kind: 'drive', id: 1, throttle: 1, steer: s }, pace: 9.5, burst: t < 3, agitation: 0.8, attention: null }); sim.events.length = 0; if (t > 4) r.tick(sim, t, `steer ${s}`); }
  report(r); }
// 3. corner.mjs chase and man round the corner
for (const [lab, pace, burst] of [['corner chase', 9.5, true]]) { const T = makeTerrain(7), sim = mkC(T, { seed: 3 }); sim.reset(-21.5, 48, 0); const r = new Rec(lab);
  for (let i = 0; i < 40 * 120; i++) { const t = i * dt; if (hyp(sim.x + 46, sim.z - 77) < 5) break; sim.step(dt, { goal: { kind: 'approach', id: 1, x: -46, z: 77, stop: 0.5, quick: true }, pace, burst: burst && t < 3, agitation: 0.8, attention: null }); sim.events.length = 0; r.tick(sim, t); }
  report(r); }
{ const T = makeTerrain(7), sim = mkC(T, { seed: 3 }); sim.reset(-21.5, 47, 0); const r = new Rec('man round the corner');
  const path = [{ x: -22.5, z: 60 }, { x: -23.4, z: 75.2 }, { x: -44, z: 77 }], me = { x: -22.5, z: 60 }; let k = 1;
  for (let i = 0; i < 20 * 120; i++) { const t = i * dt, g = path[k], dx = g.x - me.x, dz = g.z - me.z, d = hyp(dx, dz), st = Math.min(d, 6.2 / 120);
    if (t > 1) { me.x += dx / (d || 1) * st; me.z += dz / (d || 1) * st; if (d < 0.05 && k < path.length - 1) k++; }
    sim.step(dt, { goal: { kind: 'approach', id: 1, x: me.x, z: me.z, stop: 0.5, quick: true }, pace: 9.5, burst: t < 3, agitation: 0.8, attention: { x: me.x, y: T.height(me.x, me.z) + 1.7, z: me.z } }); sim.events.length = 0; r.tick(sim, t); }
  report(r); }
// 4. with the mind: a scripted runner weaving round the Containers (as crashthoughtchase.mjs)
for (const seed of [1, 2, 3]) {
  const T = makeTerrain(7), sim = mkC(T, { x: -21.5, z: 47, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed), r = new Rec(`mind chase seed ${seed}`);
  A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 1;
  const v = A.victim('you'), path = [{ x: -22.5, z: 60 }, { x: -23.4, z: 75.2 }, { x: -44, z: 77 }, { x: -46, z: 56 }, { x: -24, z: 50 }, { x: -9, z: 70 }, { x: -22.5, z: 60 }];
  const me = { id: 'you', x: -22.5, z: 60, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 1, ly: 0, lz: 0 }; me.y = T.height(me.x, me.z) + 1.65; let k = 1, deaths = 0;
  for (let i = 0; i < 60 * 120; i++) { const t = i * dt;
    if (v.dead && t - v.deadT > 3) { v.respawn(-22.5, 60, T); me.x = -22.5; me.z = 60; k = 1; deaths++; }
    if (v.state === 'free') { const g = path[k], dx = g.x - me.x, dz = g.z - me.z, d = hyp(dx, dz), st = Math.min(d, 6.2 / 120); me.x += dx / (d || 1) * st; me.z += dz / (d || 1) * st; me.vx = dx / (d || 1) * 6.2; me.vz = dz / (d || 1) * 6.2; me.speed = 6.2; if (d < 0.1) k = (k + 1) % path.length; me.y = T.height(me.x, me.z) + 1.65; }
    const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl;
    A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    if (process.env.TRACE) { const [ts, a0, a1] = process.env.TRACE.split(':').map(Number); if (ts === seed && t >= a0 && t <= a1 && i % 6 === 0) console.log(`${t.toFixed(2)} gY ${sim._dbgH.gY.toFixed(2)} py ${sim.py.x.toFixed(2)} v ${sim.v.toFixed(1)} om ${sim.om.toFixed(2)} hh ${(sim.py.x - sim._dbgH.gY).toFixed(2)} yF ${(sim._dbgH.yF - sim._dbgH.gY).toFixed(2)} cap ${(sim._dbgH.cap - sim._dbgH.gY).toFixed(2)} feet ${sim.feet.map((f) => f.planted ? 'P' + (t - f.tLand).toFixed(2) : 's').join(' ')} need ${sim.feet.map((f) => (f.need ?? 0).toFixed(2) + ' r' + (f.room ?? 0).toFixed(1)).join(' | ')} lat/fwd ${[0, 1].map((k) => { const o = (PV.LEG + k * 6) * 3, vv = sim.pose.v; return ((k ? -1 : 1) * ((vv[o + 6] - vv[o]) * Math.cos(sim.psi) - (vv[o + 8] - vv[o + 2]) * Math.sin(sim.psi))).toFixed(2); }).join('/')}`); }
    const b = mind.beh; r.tick(sim, t, `${b ? b.name + '/' + (b.phase || '') : '-'} gap ${hyp(sim.x - me.x, sim.z - me.z).toFixed(1)}`); }
  report(r);
}
const tot = all.reduce((a, r) => (a.n += r.eps.length, a.m += r.moving, a.d = Math.max(a.d, r.worst.drop), a.r = Math.max(a.r, r.worst.reach), a.s = Math.max(a.s, r.worst.stance), a.x = Math.max(a.x, r.worst.stretch), a.dn += r.eps.filter((e) => e.w.drop > LIMS.drop).length, a), { n: 0, m: 0, d: 0, s: 0, x: 0, dn: 0, r: 0 });
console.log(`TOTAL episodes ${tot.n} in ${(tot.m / 60).toFixed(1)} min fast; with hip drop > ${LIMS.drop}: ${tot.dn}; worst drop ${tot.d.toFixed(2)} m (the legs' own part, reach-sink: ${tot.r.toFixed(2)} m), stance ${tot.s.toFixed(2)} m, stretch ${tot.x.toFixed(3)}`);
console.log('baseline hip height by speed: ' + BASE.map(([v, h]) => `${v.toFixed(1)}:${h.toFixed(2)}`).join(' '));
