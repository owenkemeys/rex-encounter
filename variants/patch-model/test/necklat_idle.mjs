// node test/necklat_idle.mjs: idle (no intent), 60 s x 4 seeds; whenever the head is within 10 deg of straight ahead (place and
// facing), the neck's sideways bulge: each joint's lateral distance from the chord neck-base -> head. Reports the max.
import { RexSim, IDX } from '../src/sim/rex.js';
const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 1e4, size: 1e4, addBump() {}, bumps: [] };
let worst = 0, n = 0, all = 0;
for (const seed of [1, 2, 3, 4]) {
  const sim = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed });
  for (let i = 0; i < 120 * 60; i++) {
    sim.step(1 / 120, {}); if (i < 240 || i % 12) continue;
    const c = sim.chest, h = sim.head, fl = Math.hypot(c.f.x, c.f.z), b = sim.nb, ax = h.pos.x - b.x, az = h.pos.z - b.z, al = Math.hypot(ax, az), hl = Math.hypot(h.f.x, h.f.z);
    const sp = Math.abs(c.f.x * az - c.f.z * ax) / (fl * al), sf = Math.abs(c.f.x * h.f.z - c.f.z * h.f.x) / (fl * hl);
    const lat = (p) => (p.x - c.p.x) * c.l.x + (p.y - c.p.y) * c.l.y + (p.z - c.p.z) * c.l.z, l0 = lat(b), l1 = lat(h.pos);
    let m = 0; for (let k = 0; k < 7; k++) m = Math.max(m, Math.abs(lat(sim.spine[IDX.NECK0 + k].p) - (l0 + (l1 - l0) * (k + 1) / 7)));
    all = Math.max(all, m);
    if (Math.max(sp, sf) < Math.sin(10 * Math.PI / 180)) { n++; worst = Math.max(worst, m); }
  }
}
console.log(`idle, head within 10 deg of ahead: ${n} samples, max sideways bulge ${(worst * 100).toFixed(1)} cm; any idle pose: ${(all * 100).toFixed(1)} cm`);
