// Dumps the paddock's layers for test/map.py (top-down map at out/map.png). node test/mapdump.mjs [seed] [out/map.json]
import fs from 'node:fs';
import { makeTerrain } from '../src/terrain.js';
import { Nav } from '../src/rex/body/nav.js';
const seed = +(process.argv[2] || 7), out = process.argv[3] || 'out/map.json';
const T = makeTerrain(seed), N = new Nav(T); N._build();
const S = 0.5, R = 112, n = Math.round(2 * R / S);
const H = [], D = [], C = [], W = [], Sf = [];
const SURF = { water: 0, mud: 1, marsh: 2, gravel: 3, rock: 4, forest: 5, track: 6, grass: 7 };
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
  const x = -R + (i + 0.5) * S, z = R - (j + 0.5) * S;     // north up
  H.push(+T.height(x, z).toFixed(2)); D.push(+T.depthAt(x, z).toFixed(2)); C.push(+T.coverAt(x, z).toFixed(2)); W.push(+T.coverHeight(x, z).toFixed(1)); Sf.push(SURF[T.surfaceAt(x, z)]);
}
// the main region: the one the animal's usual haunts (meadow) belong to
const main = N._compAt(0, 10);
const nav = []; for (let j = 0; j < N.n; j++) for (let i = 0; i < N.n; i++) { const k = i + N.n * j; nav.push(N.cost[k] === Infinity ? -1 : N.comp[k] === main ? 1 : 0); }
fs.writeFileSync(out, JSON.stringify({ seed, S, R, n, H, D, C, W, Sf, nav: { n: N.n, R: N.R, cell: 2, v: nav }, arena: T.arena,
  obstacles: T.obstacles.map((o) => [o.x, o.z, o.r, o.kind || 'rock']), colliders: T.colliders.filter((c) => c.kind === 'rock' || c.kind === 'cycad').map((c) => [c.x, c.z, c.r]),
  logs: T.logs.map((L) => [L.x, L.z, L.cx, L.cz, L.half, L.r, L.bridge ? 1 : 0]), structures: T.structures.map((s) => ({ kind: s.kind, walls: s.walls, cx: s.cx, cz: s.cz })),
  landmarks: T.landmarks, grass: T.grass }));
console.log('wrote', out);
