// node test/clip.mjs [--seeds 3,5] [--secs 120] [--only 0,2] [--v]: body parts inside solid things (owner: "nose clipped through
// the wall"). A person hides inside each structure (the Loft at the owner's spot); the animal starts ~25 m out from the way in
// nearest him. Each tick, spheres along snout, skull, lower jaw, neck, torso, tail and feet are tested against the world's own
// collision query (terrain.near: columns and wall runs with top/bottom), and per part x structure the ticks with any sphere more
// than 2 cm inside and the deepest are counted. Uses only the world's query: no names.
import { makeTerrain } from '../src/terrain.js';
import { Creature, IDX, DIM } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const seeds = arg('--seeds', '3,5').split(',').map(Number), secs = +arg('--secs', 120), only = arg('--only', '') ? arg('--only').split(',').map(Number) : null, V = process.argv.includes('--v');
const dt = 1 / 120;
// depth of a sphere inside any solid near it (m; 0 outside)
export function depthAt(T, x, y, z, rad) {
  let best = 0; const L = T.near ? T.near(x, z, rad + 0.6) : [];
  for (const c of L) {
    if (y - rad > c.top || (c.bot !== undefined && y + rad < c.bot)) continue;
    let qx = c.x, qz = c.z; const sg = c.seg;
    if (sg) { const ex = sg.bx - sg.ax, ez = sg.bz - sg.az, l2 = ex * ex + ez * ez, u = l2 > 0 ? Math.max(0, Math.min(1, ((x - sg.ax) * ex + (z - sg.az) * ez) / l2)) : 0; qx = sg.ax + ex * u; qz = sg.az + ez * u; }
    const p = c.r + rad - Math.hypot(x - qx, z - qz); if (p <= 0) continue;
    const vy = Math.min(c.top - (y - rad), c.bot !== undefined ? (y + rad) - c.bot : 9);      // how far it would have to go up (or down) to be out
    best = Math.max(best, Math.min(p, vy));
  }
  return best;
}
// the body's test volumes, as [part, x, y, z, r]
export function bodySpheres(sim) {
  const out = [], h = sim.head, P = sim.spine[IDX.HEAD].p, f = h.f, u = h.u, HL = DIM.headLen;
  for (let k = 0; k <= 5; k++) { const s = k / 5 * HL; out.push([k >= 3 ? 'snout' : 'skull', P.x + f.x * s, P.y + f.y * s - 0.12, P.z + f.z * s, 0.5 + (0.2 - 0.5) * k / 5]); }
  // lower jaw: hinged near the back of the skull, below it, swung down by the gape
  { const j = sim.jaw || 0, c = Math.cos(j), sn = Math.sin(j), dx = f.x * c - u.x * sn, dy = f.y * c - u.y * sn, dz = f.z * c - u.z * sn, J = [P.x + f.x * 0.3 - u.x * 0.3, P.y + f.y * 0.3 - u.y * 0.3, P.z + f.z * 0.3 - u.z * 0.3];
    for (let k = 1; k <= 4; k++) { const s = k / 4 * (HL - 0.35); out.push(['jaw', J[0] + dx * s, J[1] + dy * s, J[2] + dz * s, 0.2 - 0.06 * k / 4]); } }
  for (let k = IDX.NECK0; k < IDX.HEAD; k++) { const p = sim.spine[k].p; out.push(['neck', p.x, p.y, p.z, 0.55 - 0.15 * (k - IDX.NECK0) / 6]); }
  for (let k = IDX.PELVIS; k <= IDX.CHEST; k++) { const p = sim.spine[k].p; out.push(['torso', p.x, p.y - 0.2, p.z, 0.85]); }
  for (let k = 0; k < sim.tail.length; k++) { const p = sim.tail[k].p, n = sim.tail.length; out.push(['tail', p.x, p.y, p.z, 0.62 + (0.14 - 0.62) * k / n]); }
  for (const ft of sim.feet) out.push(['foot', ft.pos.x, ft.pos.y + 0.2, ft.pos.z, 0.3]);
  return out;
}
function run(si, seed) {
  const T = makeTerrain(7), S = T.structures[si];
  const me = { id: 'you', x: S.hide ? S.hide.x : S.cx, z: S.hide ? S.hide.z : S.cz, y: 0, vx: 0, vz: 0, speed: 0, crouch: S.kind === 'culvert' || !!S.crouch, fx: 0, fz: 1 };
  if (si === 0) { me.x = 46.2; me.z = 68.5; }      // the owner's spot in the Loft (ground floor)
  let O = S.openings[0], bd = 1e9; for (const O1 of S.openings) { const d = Math.hypot(O1.x - me.x, O1.z - me.z); if (d < bd && O1.y < 2.5) { bd = d; O = O1; } }
  const nl = Math.hypot(O.nx, O.nz) || 1; let ax = O.x + O.nx / nl * 25, az = O.z + O.nz / nl * 25;
  if (depthAt(T, ax, T.height(ax, az) + 1, az, 3) > 0) { ax = O.x + O.nx / nl * 18; az = O.z + O.nz / nl * 18; }
  const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(O.x - ax, O.z - az), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0;
  const R = {}, beh = {};
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt; me.y = T.height(me.x, me.z) + (me.crouch ? 0.9 : 1.7);
    A.step(dt, { agents: [me], noises: Math.abs(t - 3) < 0.004 ? [{ x: me.x, y: me.y, z: me.z, loud: 0.6, kind: 'shout' }] : [], light: 0.9, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const bn = mind.beh ? mind.beh.name + '/' + (mind.beh.phase || '') : '-'; beh[bn] = (beh[bn] || 0) + 1;
    const per = {};
    for (const [p, x, y, z, r] of bodySpheres(sim)) { const d = depthAt(T, x, y, z, r); if (d > (per[p] || 0)) per[p] = d; }
    for (const [p, d] of Object.entries(per)) { const E = R[p] || (R[p] = { n: 0, max: 0, t: 0, b: '' }); if (d > 0.02) E.n++; if (d > E.max) { E.max = d; E.t = t; E.b = bn; } }
  }
  return { R, beh, name: S.name };
}
if (process.argv[1].endsWith('clip.mjs')) {
  const parts = ['snout', 'skull', 'jaw', 'neck', 'torso', 'tail', 'foot'], tot = {};
  const T0 = makeTerrain(7);
  for (let si = 0; si < T0.structures.length; si++) {
    if (only && !only.includes(si)) continue;
    for (const seed of seeds) {
      const { R, beh, name } = run(si, seed);
      console.log(`${(name + ' s' + seed).padEnd(26)} ` + parts.map((p) => { const E = R[p] || { n: 0, max: 0 }; const Q = tot[p] || (tot[p] = { n: 0, max: 0 }); Q.n += E.n; Q.max = Math.max(Q.max, E.max); return `${p} ${E.n}/${E.max.toFixed(2)}`; }).join('  '));
      if (V) { console.log('     ' + Object.entries(beh).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k} ${(v / 120).toFixed(0)}s`).join(', ')); for (const p of parts) if (R[p] && R[p].max > 0.05) console.log(`     ${p} deepest ${R[p].max.toFixed(2)} at t=${R[p].t.toFixed(1)} ${R[p].b}`); }
    }
  }
  console.log('TOTAL ticks>2cm/deepest m: ' + parts.map((p) => `${p} ${tot[p].n}/${tot[p].max.toFixed(2)}`).join('  '));
}
