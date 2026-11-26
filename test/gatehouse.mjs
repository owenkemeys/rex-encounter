// Gatehouse start: the animal starts out in the paddock east of the hut, 35-60 m off, in sight of the east window; the guard's small
// sounds from the hut (src/gatesplash.js) carry out of the open window and draw it in, and it works round the hut. The player takes over
// at SPLASH s (the CCTV feed until then; arena.opening at the guard after the look-up) and becomes sensible to it.
// Reports the approach (time to come within 12 m of the hut, which of the hut's openings its snout reaches first), whether it is in the
// window's view at the cut, how soon its head is at the east window, and whether it gets him straight away. No teleport anywhere.
// Then (owner 2026-11-18: "investigating HIM, not the building") he walks across the hut to the west window and stays there
// CROSS s: how soon after he gets there its head is at the west window, the opening nearest him (test/focus.mjs: back and forth).
//   node test/gatehouse.mjs [seed|all] [secs] [splash]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { gateFidget } from '../src/gatesplash.js';
const arg = process.argv[2] || 'all', SECS = +(process.argv[3] || 30), SPLASH = +(process.argv[4] || 15), CROSS = 40, dt = 1 / 120, hyp = Math.hypot;
const seeds = arg === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8] : [+arg];
const T = makeTerrain(7), G = T.paddock.LAYOUT.spawns.gate;
const HUT = (T.structures || []).find((s) => Math.hypot(s.cx - G.guard.x, s.cz - G.guard.z) < 3 && s.openings), door = HUT.openings[0];
const OPEN = [['east window', G.window.x, G.window.z], ['door', door.x, door.z], ['west window', 2 * HUT.cx - G.window.x, G.window.z]];
const ey = T.height(G.guard.x, G.guard.z) + 1.7, WEST = { x: HUT.cx - 1.9, z: HUT.cz + 0.6 }, WW = OPEN[2];
const rows = [];
for (const seed of seeds) {
  const me = { id: 'you', x: G.guard.x, z: G.guard.z, y: ey, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0, lx: 1, ly: 0, lz: 0 };
  const sim = new Creature(T, { x: G.rex.x, z: G.rex.z, yaw: G.rex.yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  const startD = hyp(sim.x - HUT.cx, sim.z - HUT.cz);
  let arrive = null, xGot = null, inView = null, atWin = null, held = null, minTip = 99, lookT = null, cutD = null, cutSee = false, t12 = null, first = null, sawClose = null, track = [];
  const fid = gateFidget(G, T, seed);
  for (let i = 0; i < (SPLASH + SECS + CROSS) * 120; i++) {
    const t = i * dt, x = t >= SPLASH + SECS, on = t >= SPLASH && !x;
    if (x) { const dx = WEST.x - me.x, dz = WEST.z - me.z, d = hyp(dx, dz); if (d > 0.05) { const st = Math.min(1.4 * dt, d); me.x += dx / d * st; me.z += dz / d * st; me.vx = dx / d * 1.4; me.vz = dz / d * 1.4; me.speed = 1.4; } else { me.vx = me.vz = me.speed = 0; if (arrive === null) arrive = t; } }
    const h = sim.head.pos, F = sim.head.f, HL = sim.sp ? sim.sp.dims.headLen : 1.1, tip = { x: h.x + F.x * HL, z: h.z + F.z * HL };
    // in the window's view: a clear line from the guard's eye, through the east window, to its head
    const ang = Math.abs(Math.atan2(h.z - me.z, h.x - me.x) - Math.atan2(G.window.z - me.z, G.window.x - me.x)), view = ang < 0.33 && mind.los(G.window.x + 0.3, ey, G.window.z, h.x, h.y, h.z);
    if (on && lookT === null) { lookT = t; cutD = hyp(sim.x - HUT.cx, sim.z - HUT.cz); cutSee = view; A.opening({ x: me.x, z: me.z }); }
    const dHut = hyp(sim.x - HUT.cx, sim.z - HUT.cz);
    if (t12 === null && dHut < 12) t12 = t;
    if (first === null) for (const [nm, ox, oz] of OPEN) if (hyp(tip.x - ox, tip.z - oz) < 2) { first = [nm, t]; break; }
    if (i % 600 === 0) track.push(`${t.toFixed(0)}s ${dHut.toFixed(0)}m`);
    const fq = on ? null : fid.tick(sim.t, sim);
    A.step(dt, { agents: on || x ? [me] : [], noises: fq ? [fq] : [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const dw = hyp(tip.x - G.window.x, tip.z - G.window.z), dm = hyp(tip.x - me.x, tip.z - me.z);
    if (on) { if (inView === null && view) inView = t - SPLASH; minTip = Math.min(minTip, dm); if (atWin === null && dw < 1.6) atWin = t - SPLASH; }
    if (on && sawClose === null && mind.know && mind.know.seen && dm < 5) sawClose = t - SPLASH;
    if (x && arrive !== null && xGot === null && hyp(sim.head.pos.x + sim.head.f.x * HL - WW[1], sim.head.pos.z + sim.head.f.z * HL - WW[2]) < 1.8) xGot = t - arrive;
    if (!held && !A.victim('you').free) { if (!x) held = t - SPLASH; break; }
    if (arg !== 'all' && i % 120 === 0) { const b = mind.beh; console.log(`${t.toFixed(0).padStart(3)} ${mind.label} ${b ? b.name + '/' + (b.phase || '') : '-'} body ${sim.x.toFixed(1)},${sim.z.toFixed(1)} hut ${dHut.toFixed(1)} tip->win ${dw.toFixed(1)} view ${view}`); }
  }
  rows.push({ seed, inView, atWin, held, t12, first, cutD, cutSee, sawClose, cross: held === null ? xGot : undefined });
  console.log(`SEED ${seed}: starts ${startD.toFixed(0)} m from the hut; within 12 m ${t12 === null ? 'never' : t12.toFixed(1) + ' s'}; first opening ${first ? first[0] + ' at ' + first[1].toFixed(1) + ' s' : 'none'}; track ${track.join(' ')}`);
  console.log(`SEED ${seed}: at the cut (${SPLASH} s) ${cutD.toFixed(1)} m off, ${cutSee ? 'in' : 'not in'} the window view; in view ${inView === null ? 'never' : inView.toFixed(1) + ' s'} and head at the east window ${atWin === null ? 'never' : atWin.toFixed(1) + ' s'} after the cut; nearest to him ${minTip.toFixed(1)} m; seized ${held === null ? 'no' : held.toFixed(1) + ' s'}`);
  if (held === null) console.log(`SEED ${seed}: he crosses to the west window; its head there ${xGot === null ? 'not within ' + CROSS + ' s' : xGot.toFixed(1) + ' s after he gets there'}`);
}
const med = (a) => { a = a.filter((v) => v !== null).sort((x, y) => x - y); return a.length ? `${a.length}/${rows.length}, median ${a[a.length >> 1].toFixed(1)} s` : `0/${rows.length}`; };
const firsts = {}; for (const r of rows) { const k = r.first ? r.first[0] : 'none'; firsts[k] = (firsts[k] || 0) + 1; }
console.log(`TOTAL within 12 m of the hut ${med(rows.map((r) => r.t12))}; first opening ${Object.entries(firsts).map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(`TOTAL in the window view at the cut ${rows.filter((r) => r.cutSee).length}/${rows.length}; in view after the cut ${med(rows.map((r) => r.inView))}`);
console.log(`TOTAL head at the east window after the cut ${med(rows.map((r) => r.atWin))}; sees you within 5 m ${med(rows.map((r) => r.sawClose))}; seized within ${SECS} s ${rows.filter((r) => r.held !== null).length}/${rows.length}`);
{ const X = rows.filter((r) => r.cross !== undefined); console.log(`TOTAL after he crosses to the west window (the opening nearest him), its head there ${X.filter((r) => r.cross !== null).length}/${X.length}${X.some((r) => r.cross !== null) ? ', median ' + X.map((r) => r.cross).filter((v) => v !== null).sort((a, b) => a - b)[X.filter((r) => r.cross !== null).length >> 1].toFixed(1) + ' s' : ''}`); }
