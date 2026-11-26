// A torch in its eyes, per eye: you stand front-left, ahead, or front-right of its head and shine the lamp at it from 3 s to 13 s.
// Reports each eye's dazzle and acuity, whether it still sees you, its certainty about where you are over time, the behaviour
// mix, blind snaps, and the lids (squint pose) against the eyes. node test/dazzle.mjs [seed]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const seed = +(process.argv[2] || 3);
let fail = 0;
for (const [name, side] of [['none', null], ['left', 1], ['ahead', 0], ['right', -1]]) {
  const T = makeTerrain(7), sx = 0, sz = -40;
  const sim = new Creature(T, { x: sx, z: sz, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0; A.herd.disabled = true;
  for (let i = 0; i < 120; i++) { A.step(1 / 120, { agents: [], noises: [], light: 0.5, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0; }
  // place the person relative to the head: 9 m out, 50 degrees to the l side (side 1), ahead (0) or the other side (-1)
  const h = sim.head, ang = (side ?? 0) * 0.87, fx = h.f.x, fz = h.f.z, fl = Math.hypot(fx, fz), lx = h.l.x, lz = h.l.z, ll = Math.hypot(lx, lz);
  const me = { id: 'you', x: h.pos.x + (fx / fl * Math.cos(ang) + lx / ll * Math.sin(ang)) * 9, z: h.pos.z + (fz / fl * Math.cos(ang) + lz / ll * Math.sin(ang)) * 9, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1, torch: false, lx: 0, ly: 0, lz: 1 };
  const W = { L: [], R: [], acL: [], acR: [], seen: [0, 0, 0], cert: [], sq: [], beh: {} };
  let snaps0 = 0, glareThought = 0, lidMismatch = 0;
  for (let i = 0; i < 25 * 120; i++) {
    const t = i / 120, on = side !== null && t > 3 && t < 13;
    me.y = T.height(me.x, me.z) + 1.7;
    const hp = sim.head.pos, E = mind._eyePos(side === null || side === 0 ? 1 : side), tx = side === 0 ? hp.x : E.x, ty = side === 0 ? hp.y + 0.4 : E.y, tz = side === 0 ? hp.z : E.z;
    const dx = tx - me.x, dy = ty - me.y, dz = tz - me.z, dl = Math.hypot(dx, dy, dz); me.torch = on; me.lx = dx / dl; me.ly = dy / dl; me.lz = dz / dl;      // the beam tracks the eye
    A.step(1 / 120, { agents: [me], noises: [], light: 0.5, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const DZ = mind.dazzle || { 1: 0, [-1]: 0 }, ac = mind.eyeAcuity(me.x, me.y, me.z), per = mind.lastAcuity;
    const ph = t < 3 ? 0 : t < 13 ? 1 : 2;
    if (i % 12 === 0) { W.L.push(DZ[1]); W.R.push(DZ[-1]); W.acL.push(per[1]); W.acR.push(per[-1]); W.cert.push([t, mind.sum.cert]); W.sq.push(sim.squint); }
    if (mind.know.seen && mind.know.via === 'sight') W.seen[ph] += 1 / 120;
    const L = mind.label || '-'; if (on) W.beh[L] = (W.beh[L] || 0) + 1 / 120;
    // lids and eyes agree: an eye the sim calls dazzled shows a squint (pose), and a squint the pose shows reduces the sim's sight
    if (Math.max(DZ[1], DZ[-1]) > 0.8 && sim.squint < 0.3 && t > 4) lidMismatch++;
    void ac;
  }
  for (const th of mind.voice.stream || []) if (th.kind === 'feel' && /bright|light|eye/.test(th.text)) glareThought++;
  snaps0 = mind.blindSnaps || 0;
  const mean = (arr, a, b) => { const s = arr.slice(a, b); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0; };
  const k0 = 30, k1 = 100;      // samples (10 per s): 3-10 s while lit
  const certAt = (tt) => (W.cert.find(([t]) => t >= tt) || [0, 0])[1].toFixed(2);
  console.log(`${name.padEnd(6)} dazzle L ${mean(W.L, k0, k1).toFixed(2)} R ${mean(W.R, k0, k1).toFixed(2)} | acuity L ${mean(W.acL, k0, k1).toFixed(2)} R ${mean(W.acR, k0, k1).toFixed(2)} (before ${mean(W.acL, 0, 25).toFixed(2)}/${mean(W.acR, 0, 25).toFixed(2)}, 2 s after ${mean(W.acL, 150, 155).toFixed(2)}/${mean(W.acR, 150, 155).toFixed(2)}) | seen by sight before/lit/after ${W.seen.map((v) => v.toFixed(1)).join('/')} s | cert @2 ${certAt(2)} @8 ${certAt(8)} @12 ${certAt(12)} @16 ${certAt(16)} @24 ${certAt(24)} | squint lit ${mean(W.sq, k0, k1).toFixed(2)} | lid mismatch ${lidMismatch} | blind snaps ${snaps0} | glare thoughts ${glareThought} | while lit ${Object.entries(W.beh).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([k, v]) => k + ' ' + v.toFixed(0) + 's').join(', ')}`);
  // the first second and a half of the beam, before the head moves: only the eye turned to it
  console.log(`       first 1.5 s lit: dazzle L ${mean(W.L, 35, 48).toFixed(2)} R ${mean(W.R, 35, 48).toFixed(2)}`);
  if (name === 'left' && !(mean(W.L, 35, 48) > 0.5)) fail++;      // (a wide beam takes the other eye too when that eye faces it)
  if (name === 'right' && !(mean(W.R, 35, 48) > 0.5 && mean(W.L, 35, 48) < 0.3)) fail++;
  if (name === 'ahead' && !(mean(W.L, k0, k1) > 0.5 && mean(W.R, k0, k1) > 0.5 && W.seen[1] < 5)) fail++;
  if (lidMismatch > 30) fail++;
}
if (fail) { console.log(`FAIL ${fail}`); process.exitCode = 1; } else console.log('OK');
