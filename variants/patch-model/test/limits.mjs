// Anatomical-limit and leg-in-collider measures, shared by score.mjs, siege.mjs and the standalone runner.
//   node test/limits.mjs [secs]   runs the scenes that used to break them (looking behind itself, the pen, every structure)
// Neck/skull limits (rad): the skull may turn at most YAW_MAX off the chest's heading (horizontal), at most SKULL_MAX off the
// line of the last neck segment, a neck joint may bend at most BEND_MAX, and the neck leaves the shoulders within ROOT_MAX of
// the chest's forward-up axis. Feet: knee, shin, ankle, metatarsus and toes against every collider's footprint below its top.
import { IDX, PV, DIM } from '../src/sim/rex.js';
export const LIM = { YAW_MAX: 1.68, SKULL_MAX: 1.2, BEND_MAX: 0.62, ROOT_MAX: 1.25, ROLL_MAX: 0.45 };
const ang = (ax, ay, az, bx, by, bz) => { const l = Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz) || 1; return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by + az * bz) / l))); };
export function neckTick(sim) {
  const sp = sim.spine, c = sim.chest, h = sim.head, out = { yaw: 0, skull: 0, bend: 0, root: 0, roll: 0 };
  // skull heading vs chest heading, in the horizontal plane
  const hf = Math.hypot(h.f.x, h.f.z), cf = Math.hypot(c.f.x, c.f.z);
  if (hf > 0.2 && cf > 0.2) out.yaw = ang(h.f.x, 0, h.f.z, c.f.x, 0, c.f.z);
  const a = sp[IDX.HEAD].p, b = sp[IDX.HEAD - 1].p;
  out.skull = ang(a.x - b.x, a.y - b.y, a.z - b.z, h.f.x, h.f.y, h.f.z);
  for (let j = IDX.NECK0; j < IDX.HEAD; j++) { const p0 = sp[j - 1].p, p1 = sp[j].p, p2 = sp[j + 1].p; out.bend = Math.max(out.bend, ang(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z, p2.x - p1.x, p2.y - p1.y, p2.z - p1.z)); }
  const r0 = sp[IDX.CHEST].p, r1 = sp[IDX.NECK0 + 1].p, ax = c.f.x * 0.72 + c.u.x * 0.69, ay = c.f.y * 0.72 + c.u.y * 0.69, az = c.f.z * 0.72 + c.u.z * 0.69;
  out.root = ang(r1.x - r0.x, r1.y - r0.y, r1.z - r0.z, ax, ay, az);
  out.roll = Math.abs(Math.asin(Math.max(-1, Math.min(1, h.l.y))));
  out.bad = (out.yaw > LIM.YAW_MAX) + (out.skull > LIM.SKULL_MAX) + (out.bend > LIM.BEND_MAX) + (out.root > LIM.ROOT_MAX) + (out.roll > LIM.ROLL_MAX);
  return out;
}
/** Neck bone lengths: worst relative deviation of any chest-to-skull segment from its rest length (neckLen / neckN), and of
 *  the whole path along the vertebrae from neckLen. Bones do not change length; a straight-line chest-to-head check misses it. */
export function neckSeg(sim) {
  const sp = sim.spine, L = DIM.neckLen / DIM.neckN; let seg = 0, tot = 0;
  for (let j = IDX.NECK0; j <= IDX.HEAD; j++) { const d = sp[j].p.distanceTo(sp[j - 1].p); tot += d; seg = Math.max(seg, Math.abs(d - L) / L); }
  return { seg, path: Math.abs(tot - DIM.neckLen) / DIM.neckLen };
}
/** Deepest leg part inside a collider this tick (m, 0 if none), and which part. */
export function legTick(sim, T) {
  const v = sim.pose.v; let worst = 0, part = '', kind = '';
  for (let k = 0; k < 2; k++) {
    const o = (PV.LEG + k * 6) * 3, P = (q) => [v[o + q * 3], v[o + q * 3 + 1], v[o + q * 3 + 2]];
    const knee = P(1), ank = P(2), mtp = P(3), tf = P(4), toe = [mtp[0] + tf[0] * DIM.toe, mtp[1] + tf[1] * DIM.toe, mtp[2] + tf[2] * DIM.toe];
    const pts = [[knee, 0.28, 'knee'], [ank, 0.2, 'ankle'], [mtp, 0.2, 'foot'], [toe, 0.12, 'toe']];
    for (let u = 0.25; u < 1; u += 0.25) { pts.push([[knee[0] + (ank[0] - knee[0]) * u, knee[1] + (ank[1] - knee[1]) * u, knee[2] + (ank[2] - knee[2]) * u], 0.22, 'shin']); pts.push([[ank[0] + (mtp[0] - ank[0]) * u, ank[1] + (mtp[1] - ank[1]) * u, ank[2] + (mtp[2] - ank[2]) * u], 0.17, 'meta']); }
    for (const [p, r, nm] of pts) for (const c of T.near(p[0], p[2], r + 0.2)) {
      if (p[1] - r * 0.5 > c.top) continue;
      const pen = c.r + r * 0.8 - Math.hypot(p[0] - c.x, p[2] - c.z);
      if (pen > 0.05 && pen > worst) { worst = pen; part = nm; kind = c.kind; }
    }
  }
  return { pen: worst, part, kind };
}
/** Accumulator: call add(sim, T) every tick, then summary(). */
export function limitMeter() {
  const m = { ticks: 0, neckBad: 0, worst: { yaw: 0, skull: 0, bend: 0, root: 0, roll: 0 }, by: {}, legTicks: 0, legWorst: 0, legBy: {}, segDev: 0, pathDev: 0 };
  m.add = (sim, T, tag = '') => {
    m.ticks++;
    const n = neckTick(sim); if (n.bad) { m.neckBad++; for (const k of ['yaw', 'skull', 'bend', 'root', 'roll']) if (n[k] > LIM[k.toUpperCase() + '_MAX']) m.by[k] = (m.by[k] || 0) + 1; }
    for (const k of Object.keys(m.worst)) m.worst[k] = Math.max(m.worst[k], n[k]);
    { const s = neckSeg(sim); m.segDev = Math.max(m.segDev, s.seg); m.pathDev = Math.max(m.pathDev, s.path); }
    if (T) { const L = legTick(sim, T); if (L.pen > 0) { m.legTicks++; m.legWorst = Math.max(m.legWorst, L.pen); const key = L.part + '|' + L.kind + (tag ? '|' + tag : ''); m.legBy[key] = (m.legBy[key] || 0) + 1; } }
  };
  m.summary = () => `neck/skull limit ticks ${m.neckBad}/${m.ticks} ${JSON.stringify(m.by)} worst ${Object.entries(m.worst).map(([k, x]) => k + '=' + x.toFixed(2)).join(' ')} | neck bone length dev ${(m.segDev * 100).toFixed(1)}% (path ${(m.pathDev * 100).toFixed(1)}%) | leg-in-collider ticks ${m.legTicks}, worst ${m.legWorst.toFixed(2)} m ${JSON.stringify(m.legBy)}`;
  return m;
}

/** Posture audit: per behaviour, the neck as a chain (bone length, joint bends, root, skull-on-neck) and the carriage (skull
 *  pitch, occiput height above the neck root, whether the occiput is the neck's high point). Resting range for a JP-style rex
 *  carriage: skull pitch -0.35..+0.2 rad, occiput 0.4..1.3 m above the neck root and not below the highest vertebra. */
export const REST = { pitchLo: -0.35, pitchHi: 0.2, occLo: 0.4, occHi: 1.3 };
// predatory sizing-up is head-low by design (README): skull still level, but carried at shoulder height
export const REST_BY = { appraise: { ...REST, occLo: -0.5, occHi: 0.8 } };
export function postureMeter() {
  const by = {};
  const add = (sim, beh) => {
    const sp = sim.spine, h = sim.head, n = neckTick(sim), s = neckSeg(sim), B = by[beh] || (by[beh] = { n: 0, seg: 0, path: 0, bend: 0, skull: 0, root: 0, pitch: [], occ: [], below: 0 });
    B.n++; B.seg = Math.max(B.seg, s.seg); B.path = Math.max(B.path, s.path); B.bend = Math.max(B.bend, n.bend); B.skull = Math.max(B.skull, n.skull); B.root = Math.max(B.root, n.root);
    B.pitch.push(Math.asin(Math.max(-1, Math.min(1, h.f.y)))); B.occ.push(sp[IDX.HEAD].p.y - sp[IDX.CHEST].p.y);
    let top = -1e9; for (let j = IDX.NECK0; j < IDX.HEAD; j++) top = Math.max(top, sp[j].p.y);
    if (sp[IDX.HEAD].p.y < top - 0.05) B.below++;
  };
  const q = (a, f) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(f * b.length))]; };
  const rows = () => Object.entries(by).map(([k, B]) => {
    const Q = REST_BY[k] || REST, inR = B.pitch.filter((p, i) => p >= Q.pitchLo && p <= Q.pitchHi && B.occ[i] >= Q.occLo && B.occ[i] <= Q.occHi).length / B.n;
    return { beh: k, n: B.n, seg: B.seg, path: B.path, bend: B.bend, skull: B.skull, root: B.root, p10: q(B.pitch, 0.1), p50: q(B.pitch, 0.5), p90: q(B.pitch, 0.9), o10: q(B.occ, 0.1), o50: q(B.occ, 0.5), o90: q(B.occ, 0.9), below: B.below / B.n, rest: inR };
  });
  const report = () => rows().map((r) => `  ${r.beh.padEnd(10)} n=${String(r.n).padStart(5)} bone ${(r.seg * 100).toFixed(1)}% path ${(r.path * 100).toFixed(1)}% bend ${r.bend.toFixed(2)} skull ${r.skull.toFixed(2)} root ${r.root.toFixed(2)} | pitch p10/50/90 ${r.p10.toFixed(2)}/${r.p50.toFixed(2)}/${r.p90.toFixed(2)} occ ${r.o10.toFixed(2)}/${r.o50.toFixed(2)}/${r.o90.toFixed(2)} occ-below-neck ${(r.below * 100).toFixed(0)}% in-rest ${(r.rest * 100).toFixed(0)}%`).join('\n');
  return { add, rows, report, by };
}
/** Runs each behaviour forced (a person standing in the open, or hiding in the shed for besiege) and audits the posture. */
export async function postureAudit(secs = 30, seeds = [3], behs = ['idle', 'watch', 'circle', 'appraise', 'guard', 'besiege']) {
  const { makeTerrain } = await import('../src/terrain.js');
  const { Creature } = await import('../src/sim/rex.js');
  const { Mind } = await import('../src/sim/mind.js');
  const { Arena } = await import('../src/sim/arena.js');
  const PM = postureMeter(), fails = [];
  for (const seed of seeds) for (const beh of behs) {
    const T = makeTerrain(7); let sim, me;
    if (beh === 'besiege') {
      const s = T.structures.find((q) => q.kind === 'shed'), O = s.openings[0], n = Math.hypot(O.nx, O.nz);
      sim = new Creature(T, { x: O.x + O.nx / n * 20, z: O.z + O.nz / n * 20, yaw: Math.atan2(-O.nx, -O.nz), seed }); me = { id: 'you', x: s.cx, z: s.cz, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
    } else { sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }); me = { id: 'you', x: 3, z: 15, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 }; }
    const mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed); A.herd.disabled = true; A.herd.list.length = 0;
    mind.ov.force = beh; mind.ov.omniscient = beh !== 'idle';
    if (beh === 'idle') mind.ov.notice.you = false;
    for (let i = 0; i < secs * 120; i++) {
      me.y = T.height(me.x, me.z) + 1.7;
      A.step(1 / 120, { agents: beh === 'idle' ? [] : [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
      if (i > 240) PM.add(sim, beh);
    }
  }
  for (const r of PM.rows()) {
    if (r.seg > 0.01 || r.path > 0.01) fails.push(`${r.beh}: bone length dev ${(r.seg * 100).toFixed(1)}%`);
    if (r.bend > LIM.BEND_MAX || r.skull > LIM.SKULL_MAX || r.root > LIM.ROOT_MAX) fails.push(`${r.beh}: joint limit`);
    const Q = REST_BY[r.beh] || REST;
    if (r.p50 < Q.pitchLo || r.p50 > Q.pitchHi) fails.push(`${r.beh}: median skull pitch ${r.p50.toFixed(2)} outside rest`);
    if (r.o50 < Q.occLo || r.o50 > Q.occHi) fails.push(`${r.beh}: median occiput ${r.o50.toFixed(2)} outside rest`);
    if (r.p90 > 0.45) fails.push(`${r.beh}: snout up (p90 pitch ${r.p90.toFixed(2)})`);
  }
  return { report: PM.report(), fails };
}

if (process.argv[1] && process.argv[1].endsWith('limits.mjs')) {
  if (process.argv[2] === 'audit') { const r = await postureAudit(+(process.argv[3] || 30)); console.log('posture audit (occ = occiput height above chest joint, m; pitch = skull, rad)\n' + r.report); console.log(r.fails.length ? 'AUDIT FAIL\n  ' + r.fails.join('\n  ') : 'AUDIT PASS'); process.exit(0); }
  const { makeTerrain } = await import('../src/terrain.js');
  const { Creature } = await import('../src/sim/rex.js');
  const { Mind } = await import('../src/sim/mind.js');
  const { Arena } = await import('../src/sim/arena.js');
  const secs = +(process.argv[2] || 40), dt = 1 / 120;
  // 1. looking behind itself: a subject circling it, jumping behind it, a voice from right behind
  for (const seed of [3, 5, 8]) {
    const T = makeTerrain(7), sim = new Creature(T, { seed }), m = limitMeter();
    for (let i = 0; i < secs * 120; i++) {
      const t = i * dt, a = sim.psi + Math.PI + (Math.floor(t / 4) % 2 ? 0.5 : -0.5) + Math.sin(t * 0.9) * 0.4;
      const tgt = Math.floor(t / 4) % 3 === 2 ? { x: Math.sin(t * 1.3) * 10, y: 2, z: Math.cos(t * 1.3) * 10 } : { x: sim.x + Math.sin(a) * 12, y: T.height(sim.x, sim.z) + 2, z: sim.z + Math.cos(a) * 12 };
      sim.step(dt, { goal: null, pace: 2, attention: tgt, look: { ...tgt, lock: true } }); sim.events.length = 0; m.add(sim, T);
    }
    console.log(`behind s${seed}: ${m.summary()}`);
  }
  // 2. mind-driven: a person who keeps walking round behind it
  for (const seed of [3, 5, 8]) {
    const T = makeTerrain(7), sim = new Creature(T, { seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed), m = limitMeter(); A.herd.list.length = 0;
    const me = { id: 'you', x: 0, z: -9, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
    for (let i = 0; i < secs * 120; i++) {
      const t = i * dt, tx = sim.x - Math.sin(sim.psi) * 9, tz = sim.z - Math.cos(sim.psi) * 9, dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
      if (d > 0.3) { me.x += dx / d * Math.min(d, 3.2 * dt); me.z += dz / d * Math.min(d, 3.2 * dt); }
      me.y = T.height(me.x, me.z) + 1.7;
      A.step(dt, { agents: [me], noises: i % 900 === 300 ? [{ x: me.x, y: me.y, z: me.z, loud: 0.5, kind: 'shout' }] : [], light: 0.9, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0; m.add(sim, T);
    }
    console.log(`mind-behind s${seed}: ${m.summary()}`);
  }
}
