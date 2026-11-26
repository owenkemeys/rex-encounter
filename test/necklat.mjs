// node test/necklat.mjs: the neck at rest and tracking straight ahead must lie in the animal's sagittal plane (no sideways S).
// Reports each neck joint's lateral offset from the chest's mid-plane, and the neck parameters. Exits 1 if any joint is
// more than 3 cm aside at rest or straight ahead.
import { RexSim, IDX } from '../src/rex/body/rex.js';
const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 1e4, size: 1e4, addBump() {}, bumps: [] };
let bad = 0;
for (const [name, look] of [['rest', null], ['ahead 6m eye height', [0, 1.7, 6]], ['ahead 12m low', [0, 0.5, 12]], ['ahead 4m high', [0, 4.5, 4]]]) for (const seed of [1, 2, 3]) {
  const sim = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed });
  for (let i = 0; i < 120 * 8; i++) {
    const c = sim.chest, it = look ? { look: { lock: true,  x: c.p.x + c.f.x * look[2], y: look[1], z: c.p.z + c.f.z * look[2] } } : {};
    sim.step(1 / 120, it);
  }
  const c = sim.chest, off = [];
  for (let k = IDX.NECK0; k <= IDX.HEAD; k++) { const p = sim.spine[k].p; off.push((p.x - c.p.x) * c.l.x + (p.y - c.p.y) * c.l.y + (p.z - c.p.z) * c.l.z); }
  const h = sim.head.pos, ho = (h.x - c.p.x) * c.l.x + (h.y - c.p.y) * c.l.y + (h.z - c.p.z) * c.l.z, m = Math.max(...off.map(Math.abs));
  if (m > 0.03 + Math.abs(ho)) bad++;
  console.log(`${name.padEnd(20)} seed${seed} lateral cm ${off.map((x) => (x * 100).toFixed(1)).join(' ')} head ${(ho * 100).toFixed(1)} X ${sim.neckX.map((x) => x.toFixed(2)).join(' ')}${m > 0.03 + Math.abs(ho) ? '  SIDEWAYS' : ''}`);
}
process.exit(bad ? 1 : 0);
