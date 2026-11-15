// Doors and shutters: shut (or bar) every leaf of the barn, hide a person inside, let the animal besiege it knowing where you are.
// Reports door events (creak, bang, thud, burst) and which leaves end open; barred leaves must hold.
//   node test/doors.mjs [shut|barred] [seed] [secs]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
const mode = process.argv[2] || 'shut', seed = +(process.argv[3] || 3), secs = +(process.argv[4] || 60);
const T = makeTerrain(7), S = T.structures.find((s) => s.key === 'barn');
const ev = [];
const gaps = [...new Set(T.doors.filter((d) => d.of === 'barn').map((d) => d.gap))];
for (const g of gaps) { const L = T.doors.filter((d) => d.gap === g); T.useDoor(L, ev); if (mode === 'barred') T.useDoor(L, ev); }
for (let i = 0; i < 400; i++) T.stepDoors(1 / 120, null, ev);
console.log(`${gaps.length} openings ${mode}: ${T.doors.filter((d) => d.of === 'barn' && d.ang === d.closedYaw).length}/${T.doors.filter((d) => d.of === 'barn').length} leaves closed; events so far ${JSON.stringify(ev.reduce((a, e) => ((a[e.type] = (a[e.type] || 0) + 1), a), {}))}`);
const sim = new Creature(T, { x: 35, z: 100 - 12, yaw: Math.PI, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
A.herd.list.length = 0; mind.ov.force = 'besiege'; mind.ov.omniscient = true;
const me = { id: 'you', x: 34, z: 74.5, y: T.height(34, 74.5) + 1.7, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
const got = {}; let minTip = 99;
for (let i = 0; i < secs * 120; i++) {
  A.step(1 / 120, { agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: -2 } });
  for (const e of A.events) if (e.src === 'door') { got[e.type] = (got[e.type] || 0) + 1; if (got[e.type] <= 3) console.log(`  ${(i / 120).toFixed(1)}s ${e.type} ${e.id}${e.burst ? ' (burst by its body)' : ''}`); }
  A.events.length = 0;
  const h = sim.head; minTip = Math.min(minTip, Math.hypot(h.pos.x + h.f.x * 1.75 - me.x, h.pos.y + h.f.y * 1.75 - me.y, h.pos.z + h.f.z * 1.75 - me.z));
}
const open = T.doors.filter((d) => d.of === 'barn' && d.state === 'open').map((d) => d.id.replace('barn.door.', ''));
console.log(`after ${secs}s: door events ${JSON.stringify(got)}; leaves open ${open.length ? open.join(' ') : 'none'}; closest snout ${minTip.toFixed(2)} m; animal at (${sim.x.toFixed(1)}, ${sim.z.toFixed(1)}) inside barn: ${T.insideStructure(sim.x, sim.z) ? 'YES' : 'no'}`);
