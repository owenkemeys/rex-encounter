// The animal's focus on you inside the gatehouse hut (owner 2026-11-18: "investigating HIM, not the building"). The gatehouse start
// as in gatehouse.mjs, then the player walks between the hut's east and west sides every `every` seconds. Reports: the share of
// time its head is at the opening nearest the player (of the time its head is at any opening), how long after he crosses it takes
// to get its head to the new nearest opening, and the new focus thoughts per minute, by kind.
//   node test/focus.mjs [seed|all] [secs] [every] [--log]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { gateFidget } from '../src/gatesplash.js';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), LOG = process.argv.includes('--log');
const arg = args[0] || 'all', SECS = +(args[1] || 180), EVERY = +(args[2] || 20), SPLASH = 15, dt = 1 / 120, hyp = Math.hypot;
const seeds = arg === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8] : [+arg];
const T = makeTerrain(7), G = T.paddock.LAYOUT.spawns.gate;
const HUT = (T.structures || []).find((s) => hyp(s.cx - G.guard.x, s.cz - G.guard.z) < 3 && s.openings), door = HUT.openings[0];
const OPEN = [['east', G.window.x, G.window.z], ['door', door.x, door.z], ['west', 2 * HUT.cx - G.window.x, G.window.z]];
const SIDES = [{ x: HUT.cx + 1.9, z: HUT.cz + 0.6 }, { x: HUT.cx - 1.9, z: HUT.cz + 0.6 }];      // standing by the east window, by the west window
const NEW = ['focusIn', 'focusMoved', 'focusShort', 'focusOther', 'focusQuiet', 'reachBump'];
const ey = T.height(G.guard.x, G.guard.z) + 1.7, all = { dec: [], at: 0, right: 0, sw: [], th: {}, mins: 0, nsw: 0, miss: 0 };
for (const seed of seeds) {
  const me = { id: 'you', x: G.guard.x, z: G.guard.z, y: ey, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0, lx: 1, ly: 0, lz: 0 };
  const sim = new Creature(T, { x: G.rex.x, z: G.rex.z, yaw: G.rex.yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  const fid = gateFidget(G, T, seed);
  let held_ = null, side = 0, goal = null, crossT = null, at = 0, right = 0, seenTh = 0, th = {}, held = false; const sw = [], dec = [];
  for (let i = 0; i < (SPLASH + SECS) * 120; i++) {
    const t = i * dt, on = t >= SPLASH;
    if (on && i === SPLASH * 120) { A.opening({ x: me.x, z: me.z }); }
    // the player: every EVERY s after the cut, walk (1.4 m/s) to the other side
    if (on && (t - SPLASH) > 8 && Math.floor((t - SPLASH - 8) / EVERY) + 1 !== (goal ? goal.n : 0)) { side = Math.floor((t - SPLASH - 8) / EVERY) % 2 === 0 ? 1 : 0; goal = { ...SIDES[side], n: Math.floor((t - SPLASH - 8) / EVERY) + 1, t0: t }; crossT = null; }
    if (goal) { const dx = goal.x - me.x, dz = goal.z - me.z, d = hyp(dx, dz); if (d > 0.05) { const s = Math.min(1.4 * dt, d); me.x += dx / d * s; me.z += dz / d * s; me.vx = dx / d * 1.4; me.vz = dz / d * 1.4; me.speed = 1.4; } else { me.vx = me.vz = me.speed = 0; if (crossT === null) crossT = t; } }
    const fq = on ? null : fid.tick(sim.t, sim);
    A.step(dt, { agents: on ? [me] : [], noises: fq ? [fq] : [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    if (!A.victim('you').free) { held = t - SPLASH; break; }
    if (!on) continue;
    const h = sim.head.pos, F = sim.head.f, HL = sim.sp ? sim.sp.dims.headLen : 1.1, tip = { x: h.x + F.x * HL, z: h.z + F.z * HL };
    let atO = null; for (const [nm, ox, oz] of OPEN) if (hyp(tip.x - ox, tip.z - oz) < 1.8) atO = nm;
    let near = null, nd = 1e9; for (const [nm, ox, oz] of OPEN) { const d = hyp(me.x - ox, me.z - oz); if (d < nd) { nd = d; near = nm; } }
    if (atO) { at += dt; if (atO === near) right += dt; }
    if (goal && !goal.dec && mind.fev && mind.fev.otherK === 'switch' && mind.fev.otherT > mind.t - 0.01 && t > goal.t0) { goal.dec = true; dec.push(t - goal.t0); }
    if (crossT !== null && goal && !goal.got && atO === near) { goal.got = true; sw.push(t - crossT); }
    if (crossT !== null && goal && !goal.got && t - crossT > EVERY - 9) { goal.got = true; all.miss++; }
    const st = mind.voice.stream; while (seenTh < st.length && st.length && st[st.length - 1] !== st[seenTh - 1]) { const e = st[seenTh]; if (!e) break; seenTh++; const k = (e.key || '').split(':')[0]; if (NEW.includes(k)) th[k] = (th[k] || 0) + 1; if (LOG) console.log(`${(t - SPLASH).toFixed(1).padStart(6)} [${e.key}] ${e.text}`); }
    if (seenTh > st.length) seenTh = st.length;
    if (LOG && mind.beh && mind.beh.name !== held_) { const c = mind.ctx || {}; console.log(`   -> ${(t - SPLASH).toFixed(1)} ${mind.beh.name} reason ${mind.beh.reason} encl ${c.enclosed ? c.enclosed.id : null} walled ${c.walled} seen ${!!mind.know.seen} you ${me.x.toFixed(1)},${me.z.toFixed(1)}`); held_ = mind.beh.name; }
    if (LOG && i % 240 === 0) { const b = mind.beh; console.log(`${(t - SPLASH).toFixed(0).padStart(4)} ${b ? b.name + '/' + (b.phase || '') + '/' + (b.sub || '') : '-'} rex ${sim.x.toFixed(1)},${sim.z.toFixed(1)} tip at ${atO || '-'} you ${near} seen ${!!mind.know.seen}`); }
  }
  const mins = SECS / 60; all.at += at; all.right += right; all.sw.push(...sw); all.dec.push(...dec); all.mins += mins; all.nsw += sw.length; for (const k in th) all.th[k] = (all.th[k] || 0) + th[k];
  console.log(`SEED ${seed}: head at an opening ${at.toFixed(0)} s, at the one nearest you ${(100 * right / Math.max(at, 1e-6)).toFixed(0)}%; switches ${sw.map((v) => v.toFixed(1)).join(' ')}; thoughts ${JSON.stringify(th)}${held ? '; SEIZED at ' + held.toFixed(0) + ' s' : ''}`);
}
const s = all.sw.sort((a, b) => a - b);
console.log(`TOTAL head at the opening nearest you ${(100 * all.right / Math.max(all.at, 1e-6)).toFixed(0)}% of ${all.at.toFixed(0)} s at openings; switch after a crossing: ${s.length} done (median ${s.length ? s[s.length >> 1].toFixed(1) : '-'} s), ${all.miss} not within the stay`);
{ const d = all.dec.sort((a, b) => a - b); console.log(`TOTAL decides to go round to the other opening: ${d.length} times, median ${d.length ? d[d.length >> 1].toFixed(1) : '-'} s after he starts across`); }
console.log(`TOTAL new thoughts per minute ${(Object.values(all.th).reduce((a, b) => a + b, 0) / all.mins).toFixed(2)}: ${Object.entries(all.th).map(([k, v]) => `${k} ${(v / all.mins).toFixed(2)}`).join(', ')}`);
