// Doors and shutters: shut every leaf of the barn, hide a person inside, let the animal besiege it knowing where you are.
// Reports door events (creak, bang, thud, burst) and which leaves end open. Every door opens outward: pressed from outside it
// holds (it cannot pull it open), from inside it gives; checked first on the Gatehouse door (exit 1 if not).
//   node test/doors.mjs [seed] [secs]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const seed = +(process.argv[2] || 3), secs = +(process.argv[3] || 60);
for (const side of [-1, 1]) {      // -1 outside the Gatehouse's south door, 1 inside: its head pressing on the shut leaf for 3 s
  const H = makeTerrain(7), d = H.doors.find((x) => x.id === 'gatehouse.door.S'), mx = d.hinge[0] + Math.sin(d.closedYaw) * d.len / 2, mz = d.hinge[1] + Math.cos(d.closedYaw) * d.len / 2;
  const sim = { head: { pos: { x: mx, y: d.y0 + 1.5, z: mz + side * 2.2 }, f: { x: 0, y: 0, z: -side } }, spine: { 18: { p: { x: mx, y: -50, z: mz } } } };
  for (let i = 0; i < 360; i++) H.stepDoors(1 / 120, sim, null);
  const ok = d.state === (side < 0 ? 'closed' : 'open'); console.log(`Gatehouse door pressed from ${side < 0 ? 'outside: holds' : 'inside: gives'}: ${ok ? 'ok' : 'FAIL (' + d.state + ')'}`); if (!ok) process.exitCode = 1;
}
const T = makeTerrain(7), S = T.structures.find((s) => s.key === 'barn');
const ev = [];
const gaps = [...new Set(T.doors.filter((d) => d.of === 'barn').map((d) => d.gap))];
for (const g of gaps) { const L = T.doors.filter((d) => d.gap === g); T.useDoor(L, ev); }
for (let i = 0; i < 400; i++) T.stepDoors(1 / 120, null, ev);
console.log(`${gaps.length} openings shut: ${T.doors.filter((d) => d.of === 'barn' && d.ang === d.closedYaw).length}/${T.doors.filter((d) => d.of === 'barn').length} leaves closed; events so far ${JSON.stringify(ev.reduce((a, e) => ((a[e.type] = (a[e.type] || 0) + 1), a), {}))}`);
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
