// Single-command realism scorecard.  node test/score.mjs [--quick] [--save-baseline]
// Deterministic, in-process, imports only from src/. Every section is isolated: an exception becomes a FAIL line.
import fs from 'node:fs';
import { Nav } from '../src/sim/nav.js';
import { makeTerrain } from '../src/terrain.js';
import { Creature, IDX, PV, SPINE_N } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { limitMeter } from './limits.mjs';

const QUICK = process.argv.includes('--quick'), SAVE = process.argv.includes('--save-baseline');
const SEEDS = QUICK ? [3] : [3, 5, 8];
const K = QUICK ? 0.25 : 1;               // duration scale for long runs
const dt = 1 / 120;
const metrics = [];
const M = (name, value, warn, fail, dir = 'low', unit = '', extra = {}) => metrics.push({ name, value: Number.isFinite(value) ? +(+value).toPrecision(5) : value, warn, fail, dir, unit, ...extra });
const status = (m) => {
  if (!Number.isFinite(m.value)) return 'FAIL';
  if (m.dir === 'low') return m.value <= m.warn ? 'PASS' : m.value <= m.fail ? 'WARN' : 'FAIL';
  return m.value >= m.warn ? 'PASS' : m.value >= m.fail ? 'WARN' : 'FAIL';
};
const ONLY = process.env.SECTION || null;
const section = (name, fn) => { if (ONLY && name !== ONLY) return; const t0 = performance.now(); try { fn(); } catch (e) { metrics.push({ name: `${name} (section crashed: ${String(e && e.message || e).slice(0, 80)})`, value: NaN, warn: 0, fail: 0, dir: 'low', unit: '', crashed: true }); } if (process.env.TIMES) console.error(name, ((performance.now() - t0) / 1000).toFixed(1) + 's'); };
const pct = (arr, p) => { if (!arr.length) return 0; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

const newPerson = (x, z) => ({ id: 'you', x, z, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 });
const worldOf = (T, agents, o = {}) => ({ agents, noises: o.noises || [], light: o.light ?? 0.9, flash: false, wind: o.wind || { x: 0, z: -3 } });

// ------------------------------------------------------------------ 1. motion quality
const goal = (x, z, id = 1) => ({ kind: 'reach', id, x, z });
const DRIVES = {
  walk_2_2: [20, () => ({ goal: { kind: 'drive', throttle: 1, steer: 0 }, pace: 2.2, attention: null })],
  jog_weave: [20, (t) => ({ goal: { kind: 'drive', throttle: t < 16 ? 1 : 0, steer: Math.sin(t * 0.7) * 0.8 }, pace: 4.5, attention: null })],
  sprint_12: [20, (t) => ({ goal: { kind: 'drive', throttle: t < 12 ? 1 : 0, steer: t > 6 && t < 9 ? 0.6 : 0 }, pace: 12, attention: null })],
  stalk: [30, () => ({ goal: goal(5, 38), pace: 2.2, stalk: true, attention: { x: 5, y: 2, z: 44 } })],
  start_stop: [30, (t) => ({ goal: { kind: 'drive', throttle: Math.floor(t / 3) % 2 === 0 ? 1 : 0, steer: 0 }, pace: 3.5, attention: null })],
  turn_in_place: [30, (t) => ({ goal: null, pace: 2, attention: { x: Math.sin(Math.floor(t / 5) * 2.4) * 20, y: 2, z: Math.cos(Math.floor(t / 5) * 2.4) * 20 } })],
};
function motionRun(script, secs, seed) {
  const T = makeTerrain(7), sim = new Creature(T, T.bound ? { x: +(process.env.MX ?? 20), z: +(process.env.MZ ?? -45), yaw: +(process.env.MY ?? -0.6), seed } : { seed }); sim.over = 0;      // the arena: from the south field north-west over the Lawn (the longest open run; MX MZ MY override)
  const tracked = []; for (let j = 0; j < SPINE_N; j++) tracked.push(j); tracked.push(PV.HEAD_P);
  for (let k = 0; k < 2; k++) for (let o = 0; o < 4; o++) tracked.push(PV.LEG + k * 6 + o);
  const nT = tracked.length; let p1 = null, p2 = null; const accs = []; let accMax = 0, slide = 0, over = 0, pen = 0, nan = false;
  const lastFoot = [null, null];
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt; sim.step(dt, script(t, sim)); sim.events.length = 0;
    const v = sim.pose.v; const cur = new Float64Array(nT * 3);
    for (let q = 0; q < nT; q++) { const o = tracked[q] * 3; cur[q * 3] = v[o]; cur[q * 3 + 1] = v[o + 1]; cur[q * 3 + 2] = v[o + 2]; if (!(cur[q * 3] + cur[q * 3 + 1] + cur[q * 3 + 2] === cur[q * 3] + cur[q * 3 + 1] + cur[q * 3 + 2])) nan = true; }
    if (p2 && t > 0.5) for (let q = 0; q < nT; q++) { const o = q * 3; const a = Math.hypot(cur[o] - 2 * p1[o] + p2[o], cur[o + 1] - 2 * p1[o + 1] + p2[o + 1], cur[o + 2] - 2 * p1[o + 2] + p2[o + 2]) / (dt * dt); accs.push(a); if (a > accMax) accMax = a; }
    p2 = p1; p1 = cur;
    for (let k = 0; k < 2; k++) { const f = sim.feet[k]; if (f.planted && lastFoot[k] && Math.hypot(f.pos.x - lastFoot[k][0], f.pos.z - lastFoot[k][1]) > 0.02) slide++; lastFoot[k] = f.planted ? [f.pos.x, f.pos.z] : null; }
    if (sim.over > over) over = sim.over; sim.over = 0;
    for (let k = 0; k < 2; k++) { const o = (PV.LEG + k * 6) * 3; for (const off of [1, 2, 3]) { const y = v[o + off * 3 + 1] - T.height(v[o + off * 3], v[o + off * 3 + 2]); if (-y > pen) pen = -y; } }
  }
  return { accMax, accs, slide, over, pen, nan };
}
section('motion', () => {
  const agg = { max: 0, p99: [], slide: 0, over: 0, pen: 0, nan: false }; const per = {};
  for (const [name, [secs0, script]] of Object.entries(DRIVES)) {
    for (const seed of SEEDS) {
      const secs = Math.max(10, secs0 * (QUICK ? 0.6 : 1));
      let r; try { r = motionRun(script, secs, seed); } catch (e) { M(`motion ${name} s${seed} crashed: ${e.message.slice(0, 60)}`, NaN, 0, 0); continue; }
      const p99 = pct(r.accs, 0.99);
      agg.max = Math.max(agg.max, r.accMax); agg.p99.push(p99); agg.slide += r.slide; agg.over = Math.max(agg.over, r.over); agg.pen = Math.max(agg.pen, r.pen); agg.nan ||= r.nan;
      per[name] = Math.max(per[name] || 0, r.accMax);
    }
  }
  const worst = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
  M('motion.joint_acc_max (m/s2)', agg.max, 1200, 3000, 'low', 'm/s2', { note: worst ? `worst drive ${worst[0]}` : '' });
  M('motion.joint_acc_p99_mean (m/s2)', agg.p99.reduce((a, b) => a + b, 0) / (agg.p99.length || 1), 60, 150, 'low', 'm/s2');
  M('motion.foot_slide_ticks (>2cm/tick)', agg.slide, 5, 100, 'low', 'ticks');
  M('motion.leg_overextension_max (m)', agg.over, 0.04, 0.08, 'low', 'm');
  M('motion.foot_below_ground_max (m)', agg.pen, 0.01, 0.03, 'low', 'm');
  M('motion.nan_in_pose', agg.nan ? 1 : 0, 0, 0, 'low');
});

// ------------------------------------------------------------------ 2. collision
const PART = (j) => (j <= IDX.TAIL_BASE ? 'tail' : j <= IDX.CHEST ? 'trunk' : j < IDX.HEAD ? 'neck' : 'head');
const RAD = (j) => (j <= 12 ? 0.15 + 0.6 * (j / 12) : j <= 18 ? 1.05 : 0.55);
function collisionRun(structKind, seed, secs) {
  const piv = /^tail_pivot/.test(structKind || ''); const weave = structKind === 'rock_weave'; const T = makeTerrain(7), S = structKind && !weave && !piv ? T.structures.find((s) => s.kind === structKind) : null;
  let ax, az, me;
  const up = S && S.kind === 'tower';
  if (S) {      // 32 m out from a way in, on open ground the animal can stand on (the arena's structures stand near fences, water, the bluff)
    const NV = new Nav(T); let O = S.openings[0], nl = Math.hypot(O.nx, O.nz); ax = O.x + O.nx / nl * 32; az = O.z + O.nz / nl * 32;
    found: for (const d of [32, 26, 20, 38]) for (const O1 of S.openings) { const l1 = Math.hypot(O1.nx, O1.nz), x = O1.x + O1.nx / l1 * d, z = O1.z + O1.nz / l1 * d; if (NV.costAt(x, z) < 1.3 && !(T.depthAt(x, z) > 0)) { ax = x; az = z; break found; } }
    me = newPerson(S.hide ? S.hide.x : S.cx, S.hide ? S.hide.z : S.cz); me.crouch = S.kind === 'culvert';
  }
  else { ax = 0; az = 0; me = newPerson(0, 30); if (weave) me.x = 0, me.z = -60; }
  const stops = weave ? (T.obstacles.some((o) => !o.kind) ? T.obstacles.filter((o) => !o.kind) : T.obstacles.filter((o) => o.kind === 'tree')).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 6).flatMap((o) => [0, 2.1, 4.2].map((a) => ({ x: o.x + Math.sin(a) * (o.r + 1.6), z: o.z + Math.cos(a) * (o.r + 1.6) }))) : null;
  let pr = null; if (piv) { const rocks = (T.colliders.some((c) => c.kind === 'rock') ? T.colliders.filter((c) => c.kind === 'rock' && c.r > 1.2) : T.colliders.filter((c) => c.kind === 'wall' && !c.seg && c.r > 0.9 && c.x > 78.5)).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)); pr = rocks[+structKind.split(':')[1]]; const u = Math.hypot(pr.x, pr.z) || 1; ax = pr.x + pr.x / u * (pr.r + 3.2); az = pr.z + pr.z / u * (pr.r + 3.2); me.x = pr.x + pr.x / u * 40; me.z = pr.z + pr.z / u * 40; }
  const yaw = piv ? Math.atan2(pr.x, pr.z) + Math.PI : S ? Math.atan2(S.cx - ax, S.cz - az) : 0.4;
  const sim = new Creature(T, { x: ax, z: az, yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed); A.herd.list.length = 0;
  const ticks = { tail: 0, trunk: 0, neck: 0, head: 0 }, byKind = {}, worst = { tail: 0, trunk: 0, neck: 0, head: 0 }; let nan = false;
  const cols = T.colliders, near = [], LM = limitMeter();
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt;
    me.y = (up ? S.base + S.h : T.height(me.x, me.z)) + (me.crouch ? 0.9 : 1.7);
    const noises = S && (Math.abs(t - 3) < 0.004 || Math.abs(t - 50) < 0.004) ? [{ x: me.x, y: me.y, z: me.z, loud: 0.6, kind: 'shout' }] : [];
    const ov = piv ? { goal: null, pace: 2, attention: { x: sim.x + Math.sin(sim.psi + (Math.floor(t / 4) % 2 ? 1.6 : -1.6)) * 25, y: 2, z: sim.z + Math.cos(sim.psi + (Math.floor(t / 4) % 2 ? 1.6 : -1.6)) * 25 } } : weave ? { goal: goal(stops[Math.min(stops.length - 1, Math.floor(t / (secs / stops.length)))].x, stops[Math.min(stops.length - 1, Math.floor(t / (secs / stops.length)))].z, 7), pace: 3, attention: null } : null;
    A.step(dt, worldOf(T, [me], { noises, wind: { x: 0, z: -2 } }), ov); A.events.length = 0;
    const h = sim.head; const pts = [];
    if (i % 60 === 0) { near.length = 0; for (const c of cols) if (Math.hypot(c.x - sim.x, c.z - sim.z) < c.r + 16) near.push(c); }
    for (let j = 0; j < SPINE_N; j++) { const p = sim.spine[j].p; pts.push([p.x, p.y, p.z, RAD(j), PART(j)]); }
    for (let k = 0, HL = sim.species.dims.headLen; k <= 4; k++) { const u = k / 4 * HL;      // the species' head length (was a fixed 1.75 m)
      pts.push([h.pos.x + h.f.x * u, h.pos.y + h.f.y * u - 0.15, h.pos.z + h.f.z * u, 0.4 - 0.2 * k / 4, 'head']); }
    const hit = new Set();
    for (const [x, y, z, r, part] of pts) {
      if (!(x + y + z === x + y + z)) nan = true;
      for (const c of near) { const d = Math.hypot(x - c.x, z - c.z); if (d > c.r + 2) continue; const pen = c.r + r * 0.8 - d; if (pen > 0.05 && y - r * 0.5 < c.top && (c.bot === undefined || y + r * 0.5 > c.bot)) { hit.add(part + '|' + c.kind); if (pen > worst[part]) worst[part] = pen; } }
    }
    const parts = new Set(); for (const k of hit) { const [p, kd] = k.split('|'); parts.add(p); byKind[kd] = byKind[kd] || { tail: 0, trunk: 0, neck: 0, head: 0 }; byKind[kd][p]++; }
    for (const p of parts) ticks[p]++;
    LM.add(sim, T);
  }
  return { ticks, worst, byKind, nan, LM };
}
section('collision', () => {
  const T0 = makeTerrain(7); const kinds = [...T0.structures.map((s) => s.kind), null, 'rock_weave', 'tail_pivot:0', 'tail_pivot:1', 'tail_pivot:2'];
  const tot = { tail: 0, trunk: 0, neck: 0, head: 0 }, worst = { tail: 0, trunk: 0, neck: 0, head: 0 }, byKind = {}; let nan = false, runs = 0; const LIMS = { neck: 0, leg: 0, legWorst: 0, by: {}, legBy: {}, segDev: 0, pathDev: 0 };
  for (const kind of kinds) for (const seed of [3]) {
    const secs = QUICK ? 20 : kind === 'rock_weave' ? 90 : /^tail_pivot/.test(kind || '') ? 24 : 60;
    try {
      const r = collisionRun(kind, seed, secs); runs++;
      for (const p of Object.keys(tot)) { tot[p] += r.ticks[p]; worst[p] = Math.max(worst[p], r.worst[p]); }
      for (const [kd, o] of Object.entries(r.byKind)) { byKind[kd] = byKind[kd] || { tail: 0, trunk: 0, neck: 0, head: 0 }; for (const p of Object.keys(o)) byKind[kd][p] += o[p]; }
      nan ||= r.nan;
      LIMS.neck += r.LM.neckBad; LIMS.leg += r.LM.legTicks; LIMS.legWorst = Math.max(LIMS.legWorst, r.LM.legWorst); LIMS.segDev = Math.max(LIMS.segDev, r.LM.segDev); LIMS.pathDev = Math.max(LIMS.pathDev, r.LM.pathDev);
      for (const [k, v] of Object.entries(r.LM.by)) LIMS.by[k] = (LIMS.by[k] || 0) + v; for (const [k, v] of Object.entries(r.LM.legBy)) LIMS.legBy[(kind || 'open') + ':' + k] = (LIMS.legBy[(kind || 'open') + ':' + k] || 0) + v;
    } catch (e) { M(`collision ${kind || 'open'} s${seed} crashed: ${String(e.message).slice(0, 60)}`, NaN, 0, 0); }
  }
  // Per-run tick budgets scale with runs executed. Thresholds: pass if essentially none.
  const lim = (n) => [n * runs / 10, n * runs];
  for (const [p, w, f] of [['head', 5, 50], ['neck', 5, 50], ['trunk', 10, 100], ['tail', 20, 200]]) M(`collision.${p}_in_collider_ticks`, tot[p], w * runs / 10, f * runs / 10, 'low', 'ticks', { byKind: Object.fromEntries(Object.entries(byKind).map(([k, o]) => [k, o[p]])) });
  for (const p of ['head', 'neck', 'trunk', 'tail']) M(`collision.${p}_worst_depth (m)`, worst[p], 0.1, 0.3, 'low', 'm');
  M('collision.nan_in_body', nan ? 1 : 0, 0, 0, 'low');
  // anatomical limits of neck and skull (test/limits.mjs) and legs inside solid things, over the same runs
  M('limits.neck_skull_violation_ticks', LIMS.neck, 0, 20 * runs / 10, 'low', 'ticks', { by: LIMS.by });
  M('limits.neck_bone_length_dev_max (frac)', LIMS.segDev, 0.02, 0.1, 'low', 'frac');
  M('limits.neck_path_length_dev_max (frac)', LIMS.pathDev, 0.02, 0.1, 'low', 'frac');
  M('collision.leg_in_collider_ticks', LIMS.leg, 5 * runs / 10, 50 * runs / 10, 'low', 'ticks', { by: LIMS.legBy });
  M('collision.leg_worst_depth (m)', LIMS.legWorst, 0.1, 0.3, 'low', 'm');
});

// ------------------------------------------------------------------ 3. behaviour health
const STILL = new Set(['pause', 'listen', 'stare', 'ambush', 'feed', 'besiege', 'watch']);
function behRun(kind, seed, secs, opt = {}) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  if (opt.hunger) mind.hunger = opt.hunger;
  opt.setup && opt.setup(A, sim);
  const me = newPerson(sim.x + Math.sin(sim.psi + 2.6) * 24, sim.z + Math.cos(sim.psi + 2.6) * 24);
  const used = new Set(), time = {}; let cur = null, curT = 0, longest = 0, longestName = '', still = 0, maxStuck = 0, nan = false, tn = 0;
  const lat = opt.noiseAt != null ? { t0: opt.noiseAt, done: null, src: null } : null;
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt; me.y = T.height(me.x, me.z) + 1.7;
    const noises = [];
    if (lat && !lat.src && t >= lat.t0) { const f = sim.head.f; const a = Math.atan2(f.x, f.z) + Math.PI / 2; lat.src = { x: sim.x + Math.sin(a) * 40, y: T.height(sim.x, sim.z) + 2, z: sim.z + Math.cos(a) * 40 }; noises.push({ ...lat.src, loud: 0.6, kind: 'shout' }); lat.tInj = t; }
    const I = A.step(dt, worldOf(T, opt.person === false ? [] : [me], { noises, light: opt.light, wind: opt.wind })); A.events.length = 0;
    const nm = mind.beh ? mind.beh.name : 'none';
    used.add(nm); time[nm] = (time[nm] || 0) + dt;
    if (nm !== cur) { cur = nm; curT = 0; } curT += dt; if (curT > longest) { longest = curT; longestName = nm; }
    const commanded = I && I.goal && (I.goal.kind === 'reach' || I.goal.kind === 'move' || I.goal.kind === 'drive' || I.goal.x !== undefined);
    if (commanded && !STILL.has(nm) && Math.abs(sim.v) < 0.05) { still += dt; if (still > maxStuck) maxStuck = still; } else still = 0;
    if (!(sim.x + sim.z + sim.head.f.x === sim.x + sim.z + sim.head.f.x)) nan = true;
    for (let j = 0; j < sim.pose.v.length; j += 7) { const q = sim.pose.v[j]; if (q !== q) { nan = true; break; } }
    if (lat && lat.src && lat.done == null) { const f = sim.head.f, dx = lat.src.x - sim.head.pos.x, dy = lat.src.y - sim.head.pos.y, dz = lat.src.z - sim.head.pos.z, dl = Math.hypot(dx, dy, dz); const ang = Math.acos(Math.max(-1, Math.min(1, (f.x * dx + f.y * dy + f.z * dz) / dl))); if (ang < 30 * Math.PI / 180) lat.done = t - lat.tInj; }
  }
  return { used: used.size, names: [...used], longest, longestName, maxStuck, nan, latency: lat ? (lat.done ?? (secs - lat.t0)) : null, time };
}
section('behaviour', () => {
  const scen = {
    open_field: { secs: 50 },
    meat_upwind: { secs: 50, hunger: 0.7, wind: { x: -3, z: -0.8 }, setup: (A, s) => A.things.place('meat', s.x + 70, s.z + 20), person: false },
    flare: { secs: 40, light: 0.55, setup: (A, s) => A.things.throw('flare', s.x + 30, 3, s.z + 30, s.x + Math.sin(s.psi) * 22, s.z + Math.cos(s.psi) * 22), person: false },
    hungry_herd: { secs: 60, hunger: 0.9, setup: (A, s) => { A.herd.home = { x: s.x + 50, z: s.z + 10 }; for (const p of A.herd.list) { p.x = s.x + 50 + (p.x - A.herd.list[0].x); p.z = s.z + 10 + (p.z - A.herd.list[0].z); } }, person: false },
  };
  const allUsed = {}, longest = { v: 0, n: '' }; let stuck = 0, nan = false; const perScen = {};
  for (const [name, S] of Object.entries(scen)) for (const seed of SEEDS) {
    try { const r = behRun(name, seed, Math.round(S.secs * (QUICK ? 0.3 : 1)), S); r.names.forEach((n) => (allUsed[n] = 1)); perScen[name] = (perScen[name] || 0) + r.used / SEEDS.length; if (r.longest > longest.v) { longest.v = r.longest; longest.n = `${name}/${r.longestName}`; } stuck = Math.max(stuck, r.maxStuck); nan ||= r.nan; }
    catch (e) { M(`behaviour ${name} s${seed} crashed: ${String(e.message).slice(0, 60)}`, NaN, 0, 0); }
  }
  M('behaviour.distinct_used (total)', Object.keys(allUsed).length, QUICK ? 8 : 12, QUICK ? 5 : 8, 'high', '', { names: Object.keys(allUsed), perScenarioMean: perScen });
  M('behaviour.longest_single_s', longest.v, 90, 140, 'low', 's', { note: longest.n });
  M('behaviour.max_stuck_s (goal but v<0.05)', stuck, 3, 8, 'low', 's');
  M('behaviour.nan_in_pose', nan ? 1 : 0, 0, 0, 'low');
  const lats = [];
  for (const seed of SEEDS) { try { const r = behRun('noise', seed, 20, { noiseAt: 8, person: false }); lats.push(r.latency); } catch (e) { M(`behaviour noise s${seed} crashed: ${String(e.message).slice(0, 60)}`, NaN, 0, 0); } }
  if (lats.length) { M('behaviour.noise_reaction_latency_mean (s)', lats.reduce((a, b) => a + b, 0) / lats.length, 2, 5, 'low', 's', { all: lats }); M('behaviour.noise_reaction_latency_max (s)', Math.max(...lats), 4, 8, 'low', 's'); }
});

// ------------------------------------------------------------------ 4. performance
let perfLine = null;
section('perf', () => {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed: 3 }), mind = new Mind(sim, 3), A = new Arena(T, sim, mind, 3);
  const me = newPerson(10, 25); const secs = Math.round(60 * (QUICK ? 0.33 : 1)); const n = secs * 120;
  for (let i = 0; i < 240; i++) A.step(dt, worldOf(T, [me])); A.events.length = 0;   // warm up JIT
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { me.y = T.height(me.x, me.z) + 1.7; A.step(dt, worldOf(T, [me])); A.events.length = 0; }
  const ms = (performance.now() - t0) / n;
  M('perf.ms_per_arena_step', ms, 0.15, 0.4, 'low', 'ms', { timing: true });
});

// ------------------------------------------------------------------ report
const base = fs.existsSync('out/score_baseline.json') ? JSON.parse(fs.readFileSync('out/score_baseline.json', 'utf8')) : null;
const bmap = base ? Object.fromEntries(base.metrics.map((m) => [m.name, m])) : {};
const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3)) : 'ERR');
let np = 0, nw = 0, nf = 0, nreg = 0;
const lines = [`Dino Hunter realism scorecard${QUICK ? ' (quick)' : ''}  seeds ${SEEDS.join(',')}`];
const w = Math.max(...metrics.map((m) => m.name.length));
for (const m of metrics) {
  m.status = status(m); if (m.status === 'PASS') np++; else if (m.status === 'WARN') nw++; else nf++;
  let d = '';
  const b = bmap[m.name];
  if (b && Number.isFinite(b.value) && Number.isFinite(m.value)) {
    const diff = m.value - b.value; const worse = m.dir === 'low' ? diff : -diff; const tol = m.timing ? 0.4 : 0.15;
    const reg = worse > 0 && (Math.abs(b.value) < 1e-9 ? worse > 1e-9 : worse / Math.abs(b.value) > tol);
    m.baseline = b.value; m.regression = reg; if (reg) nreg++;
    d = `  d=${diff >= 0 ? '+' : ''}${fmt(diff)}${reg ? '  REGRESSION' : ''}`;
  }
  const thr = m.crashed ? '-' : `${m.dir === 'low' ? '<=' : '>='}${m.warn}/${m.fail}`;
  lines.push(`${m.name.padEnd(w)}  ${fmt(m.value).padStart(8)}  ${thr.padEnd(14)} ${m.status}${d}${m.note ? '  [' + m.note + ']' : ''}`);
}
lines.push(`SCORE: ${np}/${metrics.length} pass, ${nw} warn, ${nf} fail${base ? `, ${nreg} regressions vs baseline` : ''}`);
// timing lines are the only non-deterministic output
console.log(lines.join('\n'));
fs.mkdirSync('out', { recursive: true });
const result = { quick: QUICK, seeds: SEEDS, summary: { pass: np, warn: nw, fail: nf, total: metrics.length, regressions: nreg }, metrics };
fs.writeFileSync('out/score.json', JSON.stringify(result, null, 1));
if (SAVE) { fs.writeFileSync('out/score_baseline.json', JSON.stringify(result, null, 1)); console.log('baseline saved to out/score_baseline.json'); }
