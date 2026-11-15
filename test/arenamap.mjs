// Dumps the arena for test/arenamap.py (top-down map at out/arena_map.png): ground, water, where the animal can stand (nav),
// every placed thing, doors, openings, landmarks; and the reach points from test/reach.mjs if out/reach.json exists.
//   node test/arenamap.mjs && python3 test/arenamap.py out/arena_map.json out/arena_map.png
import fs from 'node:fs';
import { makeTerrain } from '../src/terrain.js';
import { Nav } from '../src/sim/nav.js';
const T = makeTerrain(7), N = new Nav(T); N._build();
const S = 0.5, R = 101, n = Math.round(2 * R / S), H = [], D = [], C = [];
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const x = -R + (i + 0.5) * S, z = R - (j + 0.5) * S; H.push(+T.height(x, z).toFixed(2)); D.push(+T.depthAt(x, z).toFixed(2)); C.push(+T.coverAt(x, z).toFixed(2)); }
const main = N._compAt(4, 8), nav = [];
for (let j = 0; j < N.n; j++) for (let i = 0; i < N.n; i++) { const k = i + N.n * j; nav.push(N.cost[k] === Infinity ? -1 : N.comp[k] === main ? 1 : 0); }
const reach = fs.existsSync('out/reach.json') ? JSON.parse(fs.readFileSync('out/reach.json')) : null;
fs.writeFileSync('out/arena_map.json', JSON.stringify({ S, R, n, H, D, C, nav: { n: N.n, R: N.R, cell: 2, v: nav }, things: T.things, doors: T.doors.map((d) => ({ hinge: d.hinge, len: d.len, ang: d.ang, state: d.state, type: d.type })),
  openings: T.structures.flatMap((s) => s.openings.map((o) => ({ ...o, up: !!o.up }))), landmarks: T.landmarks, spawn: T.paddock.LAYOUT.spawn, reach }));
console.log('wrote out/arena_map.json');
