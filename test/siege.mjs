// A person hides in each structure; print how the animal works the openings.
// node test/siege.mjs [kind|all|novel] <seed> <secs>; FORCE=1 makes it besiege from the start, knowing where you are (the capability alone).
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { limitMeter } from './limits.mjs';
import { Nav } from '../src/sim/nav.js';
import { novel } from './novel.mjs';
const only = process.argv[2], seed = +(process.argv[3] || 3), secs = +(process.argv[4] || 120);
const T0 = makeTerrain(7);
const kinds = [...T0.structures.map((s) => s.kind), ...Object.keys(novel)];
for (const kind of kinds) {
  if (only && only !== 'all' && only !== kind && !(only === 'novel' && novel[kind])) continue;
  const T = makeTerrain(7), S = novel[kind] ? novel[kind](T) : T.structures.find((s) => s.kind === kind);
  // start 20-32 m out from a way in, on easy open ground (the paddock has crags and water)
  const NV = new Nav(T); let ax = 0, az = 0, O = S.openings[0];
  found: for (const d of [32, 26, 20, 38]) for (const O1 of S.openings) { const nl = Math.hypot(O1.nx, O1.nz), x = O1.x + O1.nx / nl * d, z = O1.z + O1.nz / nl * d; if (NV.costAt(x, z) < 1.3 && !(T.depthAt && T.depthAt(x, z) > 0) && [0, 1, 2, 3, 4, 5, 6, 7].every((k) => Math.abs(T.height(x + Math.sin(k) * 6, z + Math.cos(k) * 6) - T.height(x, z)) < 1.5)) { ax = x; az = z; O = O1; break found; } }
  const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(S.cx - ax, S.cz - az), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0;
  if (process.env.FORCE) { mind.ov.force = 'besiege'; mind.ov.omniscient = true; }      // the capability alone: it knows where you are and works at it
  const up = S.kind === 'tower';
  const HID = process.env.HIDE ? process.env.HIDE.split(',').map(Number) : null;      // HIDE=x,z puts you somewhere else inside
  const me = { id: 'you', x: HID ? HID[0] : S.hide ? S.hide.x : S.cx, z: HID ? HID[1] : S.hide ? S.hide.z : S.cz, y: 0, vx: 0, vz: 0, speed: 0, crouch: S.kind === 'culvert' || !!S.crouch, fx: 0, fz: 1 };
  const LM = limitMeter(); let deepest = -9, eyeTicks = 0, eyeFirst = -1, snoutIn = 0;
  // how far inside: signed distance of a point into the structure's footprint (positive inside), under its roof if it has one
  const depthIn = (x, y, z) => { const dx = x - S.cx, dz = z - S.cz, lx = dx * Math.cos(S.yaw) - dz * Math.sin(S.yaw), lz = dx * Math.sin(S.yaw) + dz * Math.cos(S.yaw); return Math.min(S.hw - Math.abs(lx), S.hd - Math.abs(lz)) - (S.roof && y > S.roof.y ? 9 : 0); };
  console.log(`\n== ${S.kind} (inside: ${!!T.insideStructure(me.x, me.z, up ? S.base + S.h + 1.7 : null)})`);
  let lab = '', neckMax = 0, stepMax = 0, prevH = null, minTip = 99, stuck = 0, inWall = 0, worst = [0, '', 0], byBeh = {};
  for (let i = 0; i < secs * 120; i++) {
    const t = i / 120; me.y = (up ? S.base + S.h : T.height(me.x, me.z)) + (me.crouch ? 0.9 : 1.7);
    const noises = Math.abs(t - 3) < 0.004 || Math.abs(t - 50) < 0.004 ? [{ x: me.x, y: me.y, z: me.z, loud: 0.6, kind: 'shout' }] : [];
    A.step(1 / 120, { agents: [me], noises, light: 0.9, flash: false, wind: { x: 0, z: -2 } });
    A.events.length = 0;
    { const hp = sim.head.pos, d = Math.hypot(hp.x - sim.spine[18].p.x, hp.y - sim.spine[18].p.y, hp.z - sim.spine[18].p.z); neckMax = Math.max(neckMax, d); if (prevH) stepMax = Math.max(stepMax, Math.hypot(hp.x - prevH[0], hp.y - prevH[1], hp.z - prevH[2])); prevH = [hp.x, hp.y, hp.z]; }
    const h = sim.head, HL = sim.species.dims.headLen, tip = Math.hypot(h.pos.x + h.f.x * HL - me.x, h.pos.y + h.f.y * HL - me.y, h.pos.z + h.f.z * HL - me.z); minTip = Math.min(minTip, tip);      // HL: the species' head length (was a fixed 1.75 m)
    // every body part against every wall: spine joints with their radii, the head along its length
    const R = (j) => (j <= 12 ? 0.15 + 0.6 * (j / 12) : j <= 18 ? 1.05 : 0.55);
    const pts = sim.spine.map((sp, j) => [sp.p.x, sp.p.y, sp.p.z, R(j), 'spine' + j]);
    for (let k = 0; k <= 4; k++) { const u = k / 4 * HL; pts.push([h.pos.x + h.f.x * u, h.pos.y + h.f.y * u - 0.15, h.pos.z + h.f.z * u, 0.4 - 0.2 * k / 4, 'head']); }
    for (const [x, y, z, r, nm] of pts) for (const o of T.near(x, z, r + 1)) { if (o.kind !== 'wall' && !o.novel) continue; const d = Math.hypot(x - o.x, z - o.z), top = o.top; const pen = o.r + r * 0.8 - d; if (pen > 0.05 && y - r * 0.5 < top && (o.bot === undefined || y + r * 0.5 > o.bot)) { inWall++; const bk = mind.label + (mind.beh && mind.beh.sub ? '/' + mind.beh.sub : '') + ':' + nm; byBeh[bk] = (byBeh[bk] || 0) + 1; if (pen > worst[0]) worst = [pen, nm, t]; if (process.env.DBG && pen > 0.6 && Math.random() < 0.02) console.log('   dbg', t.toFixed(2), nm, 'pen', pen.toFixed(2), 'y', y.toFixed(2), 'top', top.toFixed(2), 'press', sim.headPress.toFixed(2), 'oR', o.r, 'gapNear', (sim.gapNear || 0).toFixed(2), 'v', sim.v.toFixed(2)); } }
    LM.add(sim, T);
    { const tip = [h.pos.x + h.f.x * HL, h.pos.y + h.f.y * HL, h.pos.z + h.f.z * HL], dIn = depthIn(...tip); deepest = Math.max(deepest, dIn); if (dIn > 0) snoutIn++;
      let sees = false; for (const sd of [1, -1]) { const ex = h.pos.x + h.f.x * 0.42 + h.l.x * sd * 0.55 + h.u.x * 0.4, ey = h.pos.y + h.f.y * 0.42 + h.l.y * sd * 0.55 + h.u.y * 0.4, ez = h.pos.z + h.f.z * 0.42 + h.l.z * sd * 0.55 + h.u.z * 0.4;
        const vx = me.x - ex, vy = me.y - ey, vz = me.z - ez, vl = Math.hypot(vx, vy, vz), ox = h.f.x * 0.8 + h.l.x * sd * 0.6, oy = h.f.y * 0.8 + h.l.y * sd * 0.6, oz = h.f.z * 0.8 + h.l.z * sd * 0.6;      // the eye looks forward and out
        if ((vx * ox + vy * oy + vz * oz) / vl > Math.cos(1.25) && T.segClear(ex, ey, ez, me.x, me.y, me.z, 0.02)) sees = true; }
      if (sees && Math.hypot(me.x - h.pos.x, me.z - h.pos.z) < 6) { eyeTicks++; if (eyeFirst < 0) eyeFirst = t; } }
    const L = mind.label + (mind.beh && mind.beh.phase ? '/' + mind.beh.phase + (mind.beh.k !== undefined ? '#' + mind.beh.k : '') : '');
    if (L !== lab) { lab = L; console.log(`${t.toFixed(1).padStart(6)}s ${L.padEnd(20)} seen=${mind.know.seen ? 'Y' : 'n'} d=${Math.hypot(me.x - sim.x, me.z - sim.z).toFixed(1)} tip=${tip.toFixed(1)} | ${mind.thought}`); }
  }
  console.log(`   closest snout to you ${minTip.toFixed(2)} m, body-part-in-wall ticks ${inWall}, worst ${worst[0].toFixed(2)} m (${worst[1]} at ${worst[2].toFixed(1)}s) by behaviour ${JSON.stringify(byBeh)}`);
  console.log(`   snout deepest inside ${deepest.toFixed(2)} m (ticks inside ${snoutIn}), eye within 6 m with line of sight to you ${eyeTicks} ticks (${(eyeTicks / 120).toFixed(1)} s, first at ${eyeFirst.toFixed(1)} s)`);
  console.log(`   ${LM.summary()}`);
  console.log(`   chest-to-head max ${neckMax.toFixed(2)} m, head step max ${(stepMax * 100).toFixed(1)} cm/tick (head speed max ${(stepMax * 120).toFixed(1)} m/s)`);
}
