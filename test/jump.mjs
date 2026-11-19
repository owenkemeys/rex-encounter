// The on-foot jump (src/jump.js) and the spawn table (paddock.js LAYOUT.spawns, pickRespawn). node test/jump.mjs
import * as J from '../src/jump.js';
import { makeTerrain } from '../src/terrain.js';
import { LAYOUT, pickRespawn } from '../src/paddock.js';
let fails = 0;
const check = (n, ok, i = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${n}${i ? '  (' + i + ')' : ''}`); if (!ok) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const DT = 1 / 120;
function fly(speed) {
  const s = J.newJump(); J.takeoff(s, speed, 0); let apex = 0, t = 0, x = 0, land = null;
  while (s.air && t < 3) { land = J.stepJump(s, DT); apex = Math.max(apex, s.h); t += DT; x += s.vx * DT; }
  return { s, apex, t, x, land };
}
{ const a = fly(0); check('standing apex about 0.5 m', near(a.apex, 0.5, 0.01), a.apex.toFixed(3)); check('standing air time about 0.65 s', near(a.t, 0.64, 0.02), a.t.toFixed(3) + ' s'); check('lands with cooldown 0.35 s', near(a.s.cool, 0.35, 1e-9)); check('standing jump goes nowhere', a.x === 0); }
{ const a = fly(6.2); check('running apex about 0.7 m', near(a.apex, 0.7, 0.01), a.apex.toFixed(3)); check('running air time (0.76 s)', near(a.t, 0.755, 0.03), a.t.toFixed(3) + ' s'); check('forward momentum carried', near(a.x, 6.2 * a.t, 0.01), a.x.toFixed(2) + ' m'); }
{ const a = fly(2.6); check('walking apex stays 0.5 m', near(a.apex, 0.5, 0.01)); }
{ const s = J.newJump(); J.takeoff(s, 0, 0); while (s.air) J.stepJump(s, DT);
  check('no take-off during cooldown', J.takeoff(s, 0, 0) === false);
  let t = 0; while (s.cool > 0) { J.stepJump(s, DT); t += DT; }
  check('cooldown ends after 0.35 s', near(t, 0.35, 0.01), t.toFixed(3));
  check('take-off allowed after it', J.takeoff(s, 0, 0) === true);
  check('no double jump in the air', J.takeoff(s, 0, 0) === false);
  const c = J.newJump(); check('refused when not allowed (crouched, tower, wading...)', J.takeoff(c, 0, 0, false) === false && !c.air); }
{ const s = J.newJump(); J.takeoff(s, 6, 0); for (let i = 0; i < 30; i++) J.steer(s, 0, 6, DT); check('almost no air control', s.vx > 5.5 && s.vz < 0.7, `vx ${s.vx.toFixed(2)} vz ${s.vz.toFixed(2)} after 0.25 s of full opposite steering`); }
check('feet never count above 0.45 m for collision', J.CLEAR_MAX < 0.5 && J.apexFor(6.2) > J.CLEAR_MAX);
// spawn table
const T = makeTerrain(7), SP = LAYOUT.spawns, F = SP.first, eyeY = (x, z) => T.height(x, z) + 1.7;
const d = Math.hypot(F.you.x - F.rex.x, F.you.z - F.rex.z), hy = T.height(F.rex.x, F.rex.z) + 2.4;
check('first spawn: animal 20 to 30 m off (2026-11-18: it starts close enough to read and come; arena.opening keeps it within 24 m)', d >= 20 && d <= 30, d.toFixed(1) + ' m');
check('first spawn: animal in view', T.segClear(F.you.x, eyeY(F.you.x, F.you.z), F.you.z, F.rex.x, hy, F.rex.z, 0.1));
const coverD = (x, z) => Math.min(...T.structures.map((s) => Math.hypot(Math.max(Math.abs(x - s.cx) - s.hw, 0), Math.max(Math.abs(z - s.cz) - s.hd, 0))));
for (const [n, p] of [['first', F.you], ...SP.respawn.map((r) => [r.name, r])]) {
  const g = T.height(p.x, p.z), push = T.pushOut({ x: p.x, z: p.z }, 0.6, g, g + 2, 3), c = coverD(p.x, p.z);
  check(`${n}: in the open, 12 to 18 m from cover`, Math.hypot(push[0], push[1]) < 1e-6 && c >= 12 && c <= 18, c.toFixed(1) + ' m');
}
check('first spawn: animal 8 s at a walk (2 m/s) cannot reach you', d - 8 * 2.2 > 5);
// respawn: for animal positions around the arena the pick is 40 m+ away, or null (then the old rule)
let picked = 0, none = 0, minD = 1e9;
for (let x = -90; x <= 90; x += 15) for (let z = -90; z <= 90; z += 15) { const p = pickRespawn(T, SP.respawn, x, z, T.height(x, z) + 2.4); if (!p) { none++; continue; } picked++; minD = Math.min(minD, p.d); }
check('respawn pick is always 40 m+ from the animal', minD >= 40, `${picked} picks, ${none} fall back, min ${minD.toFixed(1)} m`);
const p0 = pickRespawn(T, SP.respawn, F.rex.x, F.rex.z, hy); check('respawn from the opening position', !!p0 && p0.d >= 40, p0 ? `${p0.name} ${p0.d.toFixed(0)} m, seen ${p0.seen}` : 'none');
console.log(fails ? `${fails} FAILED` : 'all jump and spawn checks passed'); process.exit(fails ? 1 : 0);
