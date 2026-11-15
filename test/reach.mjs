// Reach table: for every refuge of the arena (paddock.js `refuges`), what fraction of its floor the animal's jaws can reach from
// some opening (a snout pose the real planner finds - nav senseSpots - with the tip within BITE m of a person's torso, the body
// standing on ground it can walk to from the Lawn). Also writes out/reach.json (the points) for the map.
//   node test/reach.mjs [refuge name substring] [grid step m, default 1.5]
import fs from 'node:fs';
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Nav, senseSpots } from '../src/sim/nav.js';
const only = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2] : null, STEP = +(process.argv[3] || 1.5), BITE = 1.0;
const T = makeTerrain(7), N = new Nav(T); N._build();
const model = new Creature(T, { x: 4, z: 8, seed: 3 }).selfModel(), from = { x: 4, z: 8 };
const rows = [], dump = [];
for (const R of T.paddock.refuges) {
  if (only && !R.name.includes(only)) continue;
  const t0 = Date.now(), pts = [];
  const step = R.fn ? Math.max(STEP, 2.5) : STEP;
  if (R.pts) pts.push(...R.pts.map(([x, z]) => [x, z]));
  else if (R.onlyGaps) for (const x of R.onlyGaps) for (let z = R.rect[1] + 0.5; z < R.rect[3]; z += 1) pts.push([x, z]);
  else for (let x = R.rect[0] + step / 2; x < R.rect[2]; x += step) for (let z = R.rect[1] + step / 2; z < R.rect[3]; z += step) pts.push([x, z]);
  let n = 0, hit = 0;
  for (const [x, z] of pts) {
    if (R.fn && !R.fn(x, z)) continue;
    if (R.ledge && T.placeName(x, z) !== 'the ledge') continue;
    if (R.onlyGaps && !R.onlyGaps.some((gx) => Math.abs(x - gx) < 0.6)) continue;
    const g = R.y ?? T.height(x, z);
    if (!R.up) { const p = { x, z }; T.pushOut(p, 0.4, g, g + 1.6, 1); if (Math.hypot(p.x - x, p.z - z) > 1e-3) continue; if (T.depthAt(x, z) > 0.3) continue; }
    if (!R.up && R.of !== 'jungle' && R.of !== 'bamboo' && R.of !== 'bluff') { const S = T.insideStructure(x, z, g + 1); if (!S || S.key !== R.of) continue; }
    n++;
    const P = { x, y: g + 1.0, z }, sp = senseSpots(T, model, P, from, { nav: N, max: 1, maxDist: BITE, budget: 80000 });
    const ok = sp.some((s) => s.kind === 'nose' && s.dist <= BITE);
    if (ok) hit++; dump.push([R.name, +x.toFixed(2), +z.toFixed(2), ok ? 1 : 0]);
  }
  // blind approaches: openings the animal's head can arrive at (stance 6-10 m out, head 4 m up) unseen from the refuge's hide spot
  const S = T.structures.find((q) => q.key === R.of); let blind = '';
  if (S && S.openings.length && S.hide) {
    const ey = (R.y ?? T.height(S.hide.x, S.hide.z)) + 1.6; let nb = 0;
    for (const O of S.openings) { const l = Math.hypot(O.nx, O.nz) || 1; let seen = false; for (const d of [6, 8, 10]) { const x = O.x + O.nx / l * d, z = O.z + O.nz / l * d; if (T.segClear(S.hide.x, ey, S.hide.z, x, T.height(x, z) + 4, z, 0)) seen = true; } if (!seen) nb++; }
    blind = `${nb}/${S.openings.length}`;
  }
  rows.push({ name: R.name, n, frac: n ? hit / n : 0, blind, secs: (Date.now() - t0) / 1000 });
  console.log(`${R.name.padEnd(16)} floor points ${String(n).padStart(4)}  jaws reach ${(100 * (n ? hit / n : 0)).toFixed(0).padStart(3)}%   blind approaches ${(rows[rows.length - 1].blind || '-').padEnd(5)} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
fs.writeFileSync('out/reach.json', JSON.stringify({ rows, pts: dump }));
