// node test/envelope.mjs [seconds=90]: the neck's range as play actually drives it, no rendering. Runs the arena (mind, herd,
// director) with a player standing at several places (near on the ground, high on a tower, circling behind, far, none: the
// animal left alone to feed and wander), and records the neck solver's parameters (RexSim.neckX: root pitch, root yaw,
// bend pitch mean, gradient, bend yaw mean, gradient), the skull's pitch and roll off the last vertebra, and the
// head's place relative to the chest. Prints percentiles and extremes; neckcheck's poses are taken from these.
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const SEC = +(process.argv[2] || 90), DT = 1 / 120;
const PLACES = [['near', 9, 0, 0], ['close', 4, 0, 0], ['tower', 7, 8, 0], ['tower2', 4, 6, 0], ['behind', 10, 0, 1], ['far', 35, 0, 0], ['none', 0, 0, 0]];
const rec = { rp: [], ry: [], bp: [], bg: [], by: [], byg: [], sp: [], sr: [], hy: [], hf: [], hl: [] };
const ext = {};
for (const [pl, dist, up, circ] of PLACES) for (let s = 1; s <= 3; s++) {
  const T = makeTerrain(7), sim = new RexSim(T, { x: 0, z: 0, yaw: s, seed: s }), mind = new Mind(sim, s), A = new Arena(T, sim, mind, s);
  for (let i = 0; i < SEC * 120; i++) {
    const t = i * DT, a = circ ? t * 0.35 : s * 1.3;
    const me = { id: 'you', x: sim.x + Math.sin(a) * dist, z: sim.z + Math.cos(a) * dist, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
    me.y = T.height(me.x, me.z) + 1.7 + up;
    if (!circ && dist) { me.x = Math.sin(a) * dist; me.z = Math.cos(a) * dist; me.y = T.height(me.x, me.z) + 1.7 + up; }
    A.step(DT, { agents: dist ? [me] : [], noises: [], light: 0.55, flash: false, wind: { x: 1, z: 0 } }); A.events.length = 0;
    if (i < 240 || !sim.neckX) continue;
    const X = sim.neckX, c = sim.chest, h = sim.head, e = sim.neckEnd;
    const push = (k, v) => { rec[k].push(v); const E = ext[k] || (ext[k] = { lo: [1e9], hi: [-1e9] }); if (v < E.lo[0]) E.lo = [v, pl, s, t.toFixed(1), (mind.beh && mind.beh.name) || '-']; if (v > E.hi[0]) E.hi = [v, pl, s, t.toFixed(1), (mind.beh && mind.beh.name) || '-']; };
    push('rp', X[0]); push('ry', X[1]); push('bp', X[2]); push('bg', X[3]); push('by', X[4]); push('byg', X[5]);
    // skull off the last vertebra: pitch (positive nose down, beyond the built-in entry tilt) and roll
    const ex = e.x, ey = e.y, ez = e.z, fu = h.f.x * h.u.x + 0, base = Math.atan2(0.24, 0.97);
    const dU = h.u.x * ex + h.u.y * ey + h.u.z * ez, dF = h.f.x * ex + h.f.y * ey + h.f.z * ez; void fu;
    push('sp', Math.atan2(dU, dF) - base);
    // roll: the skull's left against the neck's left (chest's l carried along)
    const lx = c.l.x, ly = c.l.y, lz = c.l.z, hl = h.u.y * h.f.z - h.u.z * h.f.y; void hl;
    push('sr', Math.asin(Math.max(-1, Math.min(1, -(h.u.x * lx + h.u.y * ly + h.u.z * lz)))));
    const dx = h.pos.x - c.p.x, dy = h.pos.y - c.p.y, dz = h.pos.z - c.p.z;
    push('hy', dy); push('hf', dx * c.f.x + dy * c.f.y + dz * c.f.z); push('hl', dx * c.l.x + dy * c.l.y + dz * c.l.z);
  }
}
const pc = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
for (const k in rec) console.log(k.padEnd(4), 'p0.5', pc(rec[k], 0.005).toFixed(2), 'p50', pc(rec[k], 0.5).toFixed(2), 'p99.5', pc(rec[k], 0.995).toFixed(2), '| min', ext[k].lo.map(String).join(' '), '| max', ext[k].hi.map(String).join(' '));
