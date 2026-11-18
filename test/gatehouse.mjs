// Gatehouse start (step 1): the guard stands at the monitor inside the Gatehouse; the animal sniffs about outside unaware for
// SPLASH s (the CCTV splash), then the player looks up (arena.opening at the guard: the chair scrape and a step) and becomes
// sensible to it. Does its head come to the east window, how soon, and does it get him straight away?
//   node test/gatehouse.mjs [seed|all] [secs] [splash]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
const arg = process.argv[2] || 'all', SECS = +(process.argv[3] || 30), SPLASH = +(process.argv[4] || 6), dt = 1 / 120, hyp = Math.hypot;
const seeds = arg === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8] : [+arg];
const T = makeTerrain(7), G = T.paddock.LAYOUT.spawns.gate;
const rows = [];
for (const seed of seeds) {
  const me = { id: 'you', x: G.guard.x, z: G.guard.z, y: T.height(G.guard.x, G.guard.z) + 1.7, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0, lx: 1, ly: 0, lz: 0 };
  const sim = new Creature(T, { x: G.rex.x, z: G.rex.z, yaw: G.rex.yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  let inView = null, atWin = null, held = null, minTip = 99, minWin = 99, lookT = null;
  for (let i = 0; i < (SPLASH + SECS) * 120; i++) {
    const t = i * dt, on = t >= SPLASH;
    if (on && lookT === null) { lookT = t; if (hyp(sim.x - G.window.x, sim.z - G.window.z) > 10) { const t0 = sim.t; sim.reset(G.near.x, G.near.z, Math.atan2(G.window.x - G.near.x, G.window.z - G.near.z)); sim.t = t0; } A.opening({ x: me.x, z: me.z }); }
    A.step(dt, { agents: on ? [me] : [], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const h = sim.head.pos, F = sim.head.f, HL = sim.sp ? sim.sp.dims.headLen : 1.1, tip = { x: h.x + F.x * HL, z: h.z + F.z * HL };
    const dw = hyp(tip.x - G.window.x, tip.z - G.window.z), dm = hyp(tip.x - me.x, tip.z - me.z);
    if (on) { const hx = h.x - me.x, hz = h.z - me.z, ang = Math.abs(Math.atan2(hz, hx) - Math.atan2(G.window.z - me.z, G.window.x - me.x)); if (inView === null && ang < 0.33 && hyp(hx, hz) < 10) inView = t - SPLASH; minWin = Math.min(minWin, dw); minTip = Math.min(minTip, dm); if (atWin === null && dw < 1.6) atWin = t - SPLASH; }
    if (!held && !A.victim('you').free) { held = t - SPLASH; break; }
    if (arg !== 'all' && i % 120 === 0) { const b = mind.beh; console.log(`${(t - SPLASH).toFixed(0).padStart(3)} ${mind.label} ${b ? b.name + '/' + (b.phase || '') : '-'} body ${sim.x.toFixed(1)},${sim.z.toFixed(1)} tip->win ${dw.toFixed(1)} tip->you ${dm.toFixed(1)} seen ${!!(mind.ctx && mind.ctx.seen)}`); }
  }
  rows.push({ seed, inView, atWin, held, minWin, minTip });
  console.log(`SEED ${seed}: head in the window view within 10 m ${inView === null ? 'never' : inView.toFixed(1) + ' s'}; head at the window ${atWin === null ? 'never' : atWin.toFixed(1) + ' s'} after the look-up; nearest ${minWin.toFixed(1)} m; nearest to him ${minTip.toFixed(1)} m; seized ${held === null ? 'no' : held.toFixed(1) + ' s'}`);
}
const ok = rows.filter((r) => r.atWin !== null).map((r) => r.atWin).sort((a, b) => a - b);
const iv = rows.filter((r) => r.inView !== null).map((r) => r.inView).sort((a, b) => a - b);
console.log(`TOTAL head in the window view ${iv.length}/${rows.length}, median ${iv.length ? iv[iv.length >> 1].toFixed(1) : '-'} s`);
console.log(`TOTAL at the window ${ok.length}/${rows.length}, median ${ok.length ? ok[ok.length >> 1].toFixed(1) : '-'} s; seized within ${SECS} s ${rows.filter((r) => r.held !== null).length}/${rows.length}`);
