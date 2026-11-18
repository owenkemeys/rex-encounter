// Gatehouse start (step 1): the guard stands at the monitor inside the Gatehouse; the animal sniffs about outside unaware for
// SPLASH s (the CCTV splash), then the player looks up (arena.opening at the guard: the chair scrape and a step) and becomes
// sensible to it. Does it stay round the hut during the splash (the guard's small sounds, src/gatesplash.js), does its head come to the
// east window, how soon, and does it get him straight away? No teleport at the cut: it is wherever the splash left it.
//   node test/gatehouse.mjs [seed|all] [secs] [splash]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { gateFidget } from '../src/gatesplash.js';
const arg = process.argv[2] || 'all', SECS = +(process.argv[3] || 30), SPLASH = +(process.argv[4] || 12), dt = 1 / 120, hyp = Math.hypot;
const seeds = arg === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8] : [+arg];
const T = makeTerrain(7), G = T.paddock.LAYOUT.spawns.gate;
const rows = [];
for (const seed of seeds) {
  const me = { id: 'you', x: G.guard.x, z: G.guard.z, y: T.height(G.guard.x, G.guard.z) + 1.7, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0, lx: 1, ly: 0, lz: 0 };
  const sim = new Creature(T, { x: G.rex.x, z: G.rex.z, yaw: G.rex.yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  let inView = null, atWin = null, held = null, minTip = 99, minWin = 99, lookT = null, nearN = 0, splN = 0, cutD = null, sawClose = null;
  const fid = gateFidget(G, T, seed);
  for (let i = 0; i < (SPLASH + SECS) * 120; i++) {
    const t = i * dt, on = t >= SPLASH;
    if (on && lookT === null) { lookT = t; cutD = hyp(sim.x - G.guard.x, sim.z - G.guard.z); A.opening({ x: me.x, z: me.z }); }
    if (!on && i % 12 === 0) { splN++; if (hyp(sim.x - G.guard.x, sim.z - G.guard.z) < 12) nearN++; }
    const fq = on ? null : fid.tick(sim.t, sim);
    A.step(dt, { agents: on ? [me] : [], noises: fq ? [fq] : [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const h = sim.head.pos, F = sim.head.f, HL = sim.sp ? sim.sp.dims.headLen : 1.1, tip = { x: h.x + F.x * HL, z: h.z + F.z * HL };
    const dw = hyp(tip.x - G.window.x, tip.z - G.window.z), dm = hyp(tip.x - me.x, tip.z - me.z);
    if (on) { const hx = h.x - me.x, hz = h.z - me.z, ang = Math.abs(Math.atan2(hz, hx) - Math.atan2(G.window.z - me.z, G.window.x - me.x)); if (inView === null && ang < 0.33 && hyp(hx, hz) < 10) inView = t - SPLASH; minWin = Math.min(minWin, dw); minTip = Math.min(minTip, dm); if (atWin === null && dw < 1.6) atWin = t - SPLASH; }
    if (on && sawClose === null && mind.know && mind.know.seen && dm < 5) sawClose = t - SPLASH;      // it has you in sight with its snout within 5 m, at any opening
    if (!held && !A.victim('you').free) { held = t - SPLASH; break; }
    if (arg !== 'all' && i % 120 === 0) { const b = mind.beh; console.log(`${(t - SPLASH).toFixed(0).padStart(3)} ${mind.label} ${b ? b.name + '/' + (b.phase || '') : '-'} body ${sim.x.toFixed(1)},${sim.z.toFixed(1)} tip->win ${dw.toFixed(1)} tip->you ${dm.toFixed(1)} seen ${!!(mind.ctx && mind.ctx.seen)}`); }
  }
  rows.push({ seed, inView, atWin, held, minWin, minTip, near: nearN / Math.max(1, splN), cutD, sawClose });
  console.log(`SEED ${seed}: splash ${SPLASH} s within 12 m of the guard ${(100 * nearN / Math.max(1, splN)).toFixed(0)}% of the time, ${cutD.toFixed(1)} m off at the cut; has you in sight with its snout within 5 m ${sawClose === null ? 'never' : sawClose.toFixed(1) + ' s'} after the cut`);
  console.log(`SEED ${seed}: head in the window view within 10 m ${inView === null ? 'never' : inView.toFixed(1) + ' s'}; head at the window ${atWin === null ? 'never' : atWin.toFixed(1) + ' s'} after the look-up; nearest ${minWin.toFixed(1)} m; nearest to him ${minTip.toFixed(1)} m; seized ${held === null ? 'no' : held.toFixed(1) + ' s'}`);
}
const ok = rows.filter((r) => r.atWin !== null).map((r) => r.atWin).sort((a, b) => a - b);
const iv = rows.filter((r) => r.inView !== null).map((r) => r.inView).sort((a, b) => a - b);
console.log(`TOTAL head in the window view ${iv.length}/${rows.length}, median ${iv.length ? iv[iv.length >> 1].toFixed(1) : '-'} s`);
{ const sc = rows.filter((r) => r.sawClose !== null).map((r) => r.sawClose).sort((a, b) => a - b); console.log(`TOTAL sees you from within 5 m (any opening) ${sc.length}/${rows.length}, median ${sc.length ? sc[sc.length >> 1].toFixed(1) : '-'} s after the cut`); }
console.log(`TOTAL splash near the hut ${(100 * rows.reduce((a, r) => a + r.near, 0) / rows.length).toFixed(0)}%; at the cut median ${rows.map((r) => r.cutD).sort((a, b) => a - b)[rows.length >> 1].toFixed(1)} m from the guard`);
console.log(`TOTAL at the window ${ok.length}/${rows.length}, median ${ok.length ? ok[ok.length >> 1].toFixed(1) : '-'} s; seized within ${SECS} s ${rows.filter((r) => r.held !== null).length}/${rows.length}`);
