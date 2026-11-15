// Dumps the head of the skin (head space, jaw weights, tags) and the tooth sockets for test/headview.py.
import { RexSim } from '../src/sim/rex.js';
import { buildRexGeometry, BONE } from '../src/view/rexgeo.js';
import fs from 'fs';
const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 500, size: 1000, addBump() {}, bumps: [] };
const sim = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed: 1 });
const g = buildRexGeometry(sim.pose, { cell: +(process.argv[2] || 0.04) });
const keep = new Int32Array(g.position.length / 3).fill(-1), P = [], W = [], T = [];
for (let i = 0; i < keep.length; i++) {
  if (g.headPos[i * 3 + 2] < -1.4) continue;
  keep[i] = P.length / 3; P.push(g.headPos[i * 3], g.headPos[i * 3 + 1], g.headPos[i * 3 + 2]);
  let jw = 0, sk = 0; for (let c = 0; c < 4; c++) { const b = g.skinIndex[i * 4 + c], w = g.skinWeight[i * 4 + c]; if (b === BONE.JAW) jw += w; if (b === BONE.SKULL) sk += w; }
  W.push(jw, sk); T.push(g.tags[i]);
}
const F = [];
for (let t = 0; t < g.index.length; t += 3) { const a = keep[g.index[t]], b = keep[g.index[t + 1]], c = keep[g.index[t + 2]]; if (a >= 0 && b >= 0 && c >= 0) F.push(a, b, c); }
fs.writeFileSync(process.argv[3] || 'out/head.json', JSON.stringify({ P, W, T, F, teeth: g.teeth || null, eye: g.eye || null }));
console.log(g.stats, 'head verts', P.length / 3);
