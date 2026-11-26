// node test/lunge.mjs [quiet]   (T6 / T12: "weird lunge pose", "splaying pose whilst pursuing")
// Scenarios with the mind attached (a: the owner's T12 geometry, b: a runner who cuts sideways, c: side-steps at 4 m), seeds 1-6, 40 s,
// plus the body's own strike / snap / seize driven directly. Every tick: the review checks (subset) and measures of splay.
// Splay measures (body frame: fwd = (sin psi, cos psi), right = (cos psi, -sin psi); foot 0 is the right foot):
//   stance   lateral gap of the two ankles (standing track is 2*0.44 = 0.88 m; flag > 1.25 m (a normal stand is 0.9-1.05), or < 0.15 m = crossed/scissored)
//   footOut  an ankle's lateral distance from its OWN hip socket (standing ~0.1 m; flag > 0.6 m)
//   thighs   angle between the two thighs (hip->knee) seen from the front, in the frontal plane (flag > 0.65 rad; standing 0.35-0.4)
//   kneeAng  hip-knee-ankle angle (flag > 2.97 rad = hyperextended, < 0.9 rad = folded)
//   footFwd  an ankle's distance ahead of / behind its hip along the body's heading (flag > 2.3 m ahead, > 2.6 m behind)
//   toeYaw   a PLANTED foot's toe direction against the body's heading (flag > 1.05 rad = 60 degrees)
//   stretch  hip-to-ankle distance over femur+tibia (flag > 0.985, legs at full stretch)
//   roll / pitch   body roll |pRoll| > 0.25, pitch |pPitch| > 0.45 rad
//   tailYaw  tail root-to-tip direction against the heading in plan (flag > 1.2 rad)
import { makeTerrain } from '../src/terrain.js';
import { Creature, IDX, DIM, PV, SPINE_N } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const dt = 1 / 120, hyp = Math.hypot, quiet = process.argv[2] === 'quiet';
const LEGL = DIM.femur + DIM.tibia, EP = 0.5;
const LIM = { stance: [1.25, 'm'], 'stance narrow': [0.15, 'm'], footOut: [0.6, 'm'], thighs: [0.65, 'rad'], 'knee hyper': [2.97, 'rad'], 'knee folded': [0.9, 'rad'], footAhead: [2.3, 'm'], footBehind: [2.6, 'm'], toeYaw: [1.05, 'rad'], stretch: [0.985, ''], roll: [0.25, 'rad'], pitch: [0.45, 'rad'], tailYaw: [1.2, 'rad'] };
const RV = { 'hips very low': 1, 'roll>17deg': 1, 'leg over-extended': 1, 'kink': 1, 'skull vs neck': 1, 'head rolled': 1, 'skull folded': 1, 'knee backward': 1, 'foot twisted': 1, 'ankles crossed': 1, 'shanks touch': 1 };
function segDist(v, a0, a1, b0, b1) { let m = 9; const bx = v[b1] - v[b0], by = v[b1 + 1] - v[b0 + 1], bz = v[b1 + 2] - v[b0 + 2], l2 = bx * bx + by * by + bz * bz || 1e-9;
  for (let i = 0; i <= 8; i++) { const u = i / 8, px = v[a0] + (v[a1] - v[a0]) * u, py = v[a0 + 1] + (v[a1 + 1] - v[a0 + 1]) * u, pz = v[a0 + 2] + (v[a1 + 2] - v[a0 + 2]) * u; const w = Math.max(0, Math.min(1, ((px - v[b0]) * bx + (py - v[b0 + 1]) * by + (pz - v[b0 + 2]) * bz) / l2)); m = Math.min(m, hyp(px - v[b0] - bx * w, py - v[b0 + 1] - by * w, pz - v[b0 + 2] - bz * w)); } return m; }
// (thighs = sum of the two thighs' abduction angles asin(outward component / length): the A seen from the front)
// one watcher per run: call tick(t) after each step; keeps the worst of every measure with its context
function watcher(sim, mind, T) {
  const W = {}, cur = {}, R = {}; // W[name] = {worst, t, ctx, n, ep, last}
  const note = (name, val, t, bad) => { cur[name] = Math.max(cur[name] ?? -9, val); const r = R[name] || (R[name] = { max: -9, t: 0 }); if (val > r.max) { r.max = val; r.t = t; } const e = W[name] || (W[name] = { worst: 0, t: 0, ctx: '', n: 0, ep: 0, last: -9, sev: -1 }); if (!bad) return; e.n++; if (t - e.last > EP) e.ep++; e.last = t; if (val > e.worst) { e.worst = val; e.t = t; e.ctx = ctxOf(sim, mind, name, val); } };
  const ctxOf = (s, m) => { const b = m && m.beh, a = s.act; return `${b ? b.name + '/' + (b.phase || '') : '-'} act=${a ? a.kind + (a.forced ? '!' : '') : '-'} v=${s.v.toFixed(1)} u=${hyp(s.ux, s.uz).toFixed(1)} fp=${s.feet[0].planted ? 'P' : 's'}${s.feet[1].planted ? 'P' : 's'}`; };
  const wrap = (a) => ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return {
    W, R, cur, tick(t) { for (const k in cur) delete cur[k];
      const v = sim.pose.v, psi = sim.psi, fx = Math.sin(psi), fz = Math.cos(psi), rx = Math.cos(psi), rz = -Math.sin(psi), lat = (x, z) => x * rx + z * rz, fwd = (x, z) => x * fx + z * fz;
      const hip = [], kn = [], an = [];
      for (let k = 0; k < 2; k++) { const o = (PV.LEG + k * 6) * 3; hip.push([v[o], v[o + 1], v[o + 2]]); kn.push([v[o + 3], v[o + 4], v[o + 5]]); an.push([v[o + 6], v[o + 7], v[o + 8]]); }
      const st = lat(an[0][0] - an[1][0], an[0][2] - an[1][2]); cur.stance = st; note('stance', st, t, st > LIM.stance[0]); note('stance narrow', 0.15 - st, t, st < LIM['stance narrow'][0] && true);
      for (let k = 0; k < 2; k++) {
        const s = k ? -1 : 1, hx = an[k][0] - hip[k][0], hz = an[k][2] - hip[k][2], out = s * lat(hx, hz), fa = fwd(hx, hz);
        note('footOut', out, t, out > LIM.footOut[0]); note('footAhead', fa, t, fa > LIM.footAhead[0]); note('footBehind', -fa, t, -fa > LIM.footBehind[0]);
        const t1 = [kn[k][0] - hip[k][0], kn[k][1] - hip[k][1], kn[k][2] - hip[k][2]], t2 = [an[k][0] - kn[k][0], an[k][1] - kn[k][1], an[k][2] - kn[k][2]], d = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], n = (a) => Math.sqrt(d(a, a)) || 1;
        const ka = Math.PI - Math.acos(Math.max(-1, Math.min(1, d(t1, t2) / n(t1) / n(t2)))); note('knee hyper', ka, t, ka > LIM['knee hyper'][0]); note('knee folded', 1.8 - ka, t, ka < LIM['knee folded'][0]);
        const ext = hyp(hx, an[k][1] - hip[k][1], hz) / LEGL; note('stretch', ext, t, ext > LIM.stretch[0]);
        if (sim.feet[k].planted) { const o = (PV.LEG + k * 6) * 3, tx = v[o + 12], tz = v[o + 14], ty = Math.abs(wrap(Math.atan2(tx, tz) - psi)); note('toeYaw', ty, t, ty > LIM.toeYaw[0]); }
      }
      { const t1 = [kn[0][0] - hip[0][0], kn[0][1] - hip[0][1], kn[0][2] - hip[0][2]], t2 = [kn[1][0] - hip[1][0], kn[1][1] - hip[1][1], kn[1][2] - hip[1][2]]; // thigh spread seen from the front: drop the fwd component
        const ab = (o, s) => Math.asin(Math.max(-1, Math.min(1, s * lat(o[0], o[2]) / hyp(...o)))), ang = ab(t1, 1) + ab(t2, -1); note('thighs', ang, t, ang > LIM.thighs[0]); cur.thighs = ang; }
      const rl = Math.abs(sim.pRoll.x), pt = Math.abs(sim.pPitch.x); note('roll', rl, t, rl > LIM.roll[0]); note('pitch', pt, t, pt > LIM.pitch[0]);
      { const p0 = sim.spine[IDX.TAIL_BASE].p, p1 = sim.spine[0].p, ty = Math.abs(wrap(Math.atan2(p1.x - p0.x, p1.z - p0.z) - psi + Math.PI)); note('tailYaw', ty, t, ty > LIM.tailYaw[0]); }
      // review subset
      const hh = sim.py.x - sim.groundY; if (hh < 2.2) note('hips very low', 2.2 - hh, t, true); if (rl > 0.3) note('roll>17deg', rl, t, true);
      if (sim.over > 0.08) note('leg over-extended', sim.over, t, true); sim.over = 0;
      for (let j = 1; j < IDX.CHEST; j++) { const a = sim.spine[j].p.clone().sub(sim.spine[j - 1].p).normalize(), b = sim.spine[j + 1].p.clone().sub(sim.spine[j].p).normalize(), an2 = Math.acos(Math.min(1, a.dot(b))); if (an2 > 0.5) note('kink', an2, t, true); }
      { const sk = Math.acos(Math.min(1, sim.spine[IDX.HEAD].p.clone().sub(sim.spine[IDX.HEAD - 1].p).normalize().dot(sim.head.f))); if (sk > 1.2) note('skull vs neck', sk, t, true); const roll = Math.abs(Math.asin(Math.max(-1, Math.min(1, sim.head.l.y)))); if (roll > 0.45) note('head rolled', roll, t, true); if (sim.head.pos.distanceTo(sim.chest.p) < 1.05) note('skull folded', 1, t, true); }
      for (let k = 0; k < 2; k++) { const f = [kn[k][0] - (hip[k][0] + an[k][0]) / 2, kn[k][2] - (hip[k][2] + an[k][2]) / 2]; const fw = fwd(f[0], f[1]); if (fw < -0.02) note('knee backward', -fw, t, true); }
      { const dx = an[0][0] - an[1][0], dz = an[0][2] - an[1][2], l = lat(dx, dz), fa = fwd(dx, dz); if (Math.abs(fa) < 0.5 && l < 0) note('ankles crossed', -l, t, true); }
      { let dmin = 9; for (const j0 of [1, 2]) for (const j1 of [1, 2]) dmin = Math.min(dmin, segDist(v, (PV.LEG + j0) * 3, (PV.LEG + j0 + 1) * 3, (PV.LEG + 6 + j1) * 3, (PV.LEG + 6 + j1 + 1) * 3)); if (dmin < 0.3) note('shanks touch', 0.3 - dmin, t, true); }
    },
  };
}
const rows = [], RAW = new Map(); const rawMerge = (sc, R) => { for (const [n, r] of Object.entries(R)) { const k = sc + '|' + n, o = RAW.get(k); if (!o || r.max > o.max) RAW.set(k, { ...r }); } };   // {sc, seed, name, worst, t, ctx, ep}
const merge = (sc, seed, W) => { for (const [name, e] of Object.entries(W)) if (e.n) rows.push({ sc, seed, name, worst: e.worst, t: e.t, ctx: e.ctx, ep: e.ep }); };
const mk = (seed, x, z, yaw) => { const T = makeTerrain(7), sim = new Creature(T, { x, z, yaw, seed }), mind = new Mind(sim, seed); sim.__mind = mind; const _u = 0,  A = new Arena(T, sim, mind, seed); A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 1; return { T, sim, mind, A }; };
const mkMe = (T, x, z) => { const me = { id: 'you', x, z, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 1, ly: 0, lz: 0 }; me.y = T.height(x, z) + 1.65; return me; };
const Wd = (me) => ({ agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
function move(me, T, nx, nz) { me.vx = (nx - me.x) / dt; me.vz = (nz - me.z) / dt; me.speed = hyp(me.vx, me.vz); if (me.speed > 0.01) { me.fx = me.vx / me.speed; me.fz = me.vz / me.speed; } me.x = nx; me.z = nz; me.y = T.height(nx, nz) + 1.65; }
const SC = {
  'a note geometry': (seed) => { const { T, sim, mind, A } = mk(seed, -6.2, -25.3, -4.47), me = mkMe(T, -2.9, -23.6), w = watcher(sim, mind, T); run(A, sim, me, w, 40, () => { }); return w; },
  'b runner cuts sideways': (seed) => { const { T, sim, mind, A } = mk(seed, 0, 0, 0), me = mkMe(T, 1, 14), w = watcher(sim, mind, T); let cut = null; run(A, sim, me, w, 40, (t) => { const gap = hyp(sim.x - me.x, sim.z - me.z); if (cut === null && t > 2 && gap < 6) cut = t; const sp = 5.5, th = cut === null ? 0 : (t - cut < 4 ? Math.PI / 2 : 0); move(me, T, me.x + Math.sin(th) * sp * dt, me.z + Math.cos(th) * sp * dt); }); return w; },
  'c side-steps at 4 m': (seed) => { const { T, sim, mind, A } = mk(seed, 0, 0, 0), me = mkMe(T, 0, 4), w = watcher(sim, mind, T); run(A, sim, me, w, 40, (t) => { const ph = Math.floor(t / 2.5), tx = [0, 2, -2, 2, -2][Math.min(ph, 4)] ?? 0; const nx = me.x + Math.max(-2 * dt, Math.min(2 * dt, tx - me.x)); move(me, T, nx, me.z); }); return w; },
};
let sc = '', seed = 0;
const trace = (sim, w) => { const b = sim.__mind && sim.__mind.beh; return `${b ? b.name + '/' + (b.phase || '') : '-'} act=${sim.act ? sim.act.kind : '-'} v=${sim.v.toFixed(1)} psi=${sim.psi.toFixed(2)} ` + Object.entries(w.cur).filter(([k]) => ['stance','footOut','thighs','toeYaw','stretch','footAhead','footBehind'].includes(k)).map(([k, v]) => k + '=' + v.toFixed(2)).join(' ') + ` fp=${sim.feet[0].planted ? 'P' : 's'}${sim.feet[1].planted ? 'P' : 's'}`; };
function run(A, sim, me, w, secs, mover) { for (let i = 0; i < secs * 120; i++) { const t = i * dt; mover(t); A.step(dt, Wd(me), undefined); A.events.length = 0; w.endT = t; w.tick(t); if (process.env.TRACE && process.env.TRACE && sc[0] === ONLY[0] && +ONLY[1] === seed && i % +(process.env.EVERY || 12) === 0) console.log(t.toFixed(2), trace(sim, w), `d=${hyp(sim.x - me.x, sim.z - me.z).toFixed(1)}`); if (!A.victim('you').free) break; } }
const ONLY = process.env.ONLY ? process.env.ONLY.split(':') : null;      // ONLY='b:2' (scenario's first letter : seed) runs just that one, and TRACE prints it
for (const sd of [1, 2, 3, 4, 5, 6]) for (const [nm, f] of Object.entries(SC)) { if (ONLY && (nm[0] !== ONLY[0] || +ONLY[1] !== sd)) continue; sc = nm; seed = sd; const w = f(sd); if (!quiet) console.log(`ran ${sc} seed ${sd}: ${w.endT.toFixed(1)} s`); merge(sc, sd, w.W); rawMerge(sc, w.R); }
// the body alone: strike / snap / seize at a point 2..5 m ahead and 0..3 m aside, from standing, no mind
for (const seed of (ONLY && ONLY[0] !== "x") ? [] : [1, 2, 3]) { const W = {}; for (const kind of ['strike', 'snap', 'seize', 'butt']) for (const D of [2.5, 3.7, 5]) for (const off of [-3, -1.5, 0, 1.5, 3]) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed); A.herd.disabled = true; A.herd.list.length = 0; const me = mkMe(T, off, D), w = watcher(sim, null, T);
  for (let i = 0; i < 240; i++) A.step(dt, Wd(me), { goal: null, pace: 1, freeze: true });
  sim.gesture(kind, { x: me.x, y: me.y - 0.6, z: me.z }, { over: true });
  for (let i = 0; i < 4 * 120; i++) { A.step(dt, Wd(me), { goal: null, pace: 1, freeze: true, look: { x: me.x, y: me.y, z: me.z, lock: true } }); A.events.length = 0; w.tick(i * dt); }
  if (process.env.GRID && seed === 1) console.log(`grid ${kind.padEnd(6)} D=${D} off=${String(off).padStart(4)}: ` + ['stance', 'footOut', 'toeYaw', 'thighs', 'stretch', 'footAhead', 'pitch', 'roll', 'tailYaw'].map((k) => k + ' ' + (w.R[k] ? w.R[k].max.toFixed(2) : '-')).join(' '));
  for (const [n, e] of Object.entries(w.W)) { const o = W[n] || (W[n] = { ...e, n: 0, ep: 0 }); o.ep += e.ep; o.n += e.n; if (e.worst > (o.w2 ?? -1)) { o.w2 = e.worst; o.worst = e.worst; o.t = e.t; o.ctx = e.ctx + ` [${kind} D=${D} off=${off}]`; } }
} merge('body alone strike/snap/seize/butt', seed, W); }
// the prowl 'set' of the note: it squares up with a quick `face` turn (mind.js, I.goal face + quickTurn, 41 degrees off at T12), then
// strikes from where it stands (a strike is fired inside ~0.5 rad of its heading); here: face for 0.4 s (not squared) then strike
for (const seed of ONLY ? [] : [1, 2, 3]) { const W = {}; for (const rel of [-0.72, -0.5, 0.5, 0.72]) for (const D of [3.2, 3.7]) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed); A.herd.disabled = true; A.herd.list.length = 0;
  const px = Math.sin(rel) * D, pz = Math.cos(rel) * D, me = mkMe(T, px, pz), w = watcher(sim, null, T);
  for (let i = 0; i < 240; i++) A.step(dt, Wd(me), { goal: null, pace: 1, freeze: true });
  const lk = { x: me.x, y: me.y, z: me.z, lock: true };
  for (let i = 0; i < 4 * 120; i++) { if (i === 48) sim.gesture('strike', { x: me.x, y: me.y - 0.6, z: me.z }, { over: true });
    A.step(dt, Wd(me), i < 48 ? { goal: { kind: 'face', x: me.x, z: me.z }, pace: 1, stalk: true, quickTurn: true, look: lk } : { goal: null, pace: 1, freeze: true, look: lk }); A.events.length = 0; w.tick(i * dt); }
  if (process.env.GRID && seed === 1) console.log(`grid face+strike rel=${rel} D=${D}: ` + ['stance', 'footOut', 'toeYaw', 'thighs', 'stretch', 'pitch', 'roll'].map((k) => k + ' ' + (w.R[k] ? w.R[k].max.toFixed(2) : '-')).join(' '));
  for (const [n, e] of Object.entries(w.W)) { const o = W[n] || (W[n] = { ...e, n: 0, ep: 0 }); o.ep += e.ep; o.n += e.n; if (e.worst > (o.w2 ?? -1)) { o.w2 = e.worst; o.worst = e.worst; o.t = e.t; o.ctx = e.ctx + ` [face+strike rel=${rel} D=${D}]`; } }
} merge('body alone face then strike', seed, W); }

// ---- T14 / T15: body-only intents, as the mind would write them (no mind, no arena; `sim.step(dt, intent)`)
// T15 sighting: pounce lock (face + stalk + quickTurn), pause, prowl rush (approach, pace 9.6, burst, quickTurn) cancelled after 0.1-0.4 s,
// again, then a backward drive. T14 sighting: besiege `go` = move goal at pace 2.0 with the eye locked on the person, round the Warehouse.
const BO = {};
const bodyRun = (seed, x, z, yaw, secs, fn, tag) => { const T = makeTerrain(7), sim = new Creature(T, { x, z, yaw, seed }), w = watcher(sim, null, T); sim.__st = true;
  for (let i = 0; i < secs * 120; i++) { const t = i * dt, intent = fn(t, sim); sim.step(dt, intent); for (const e of sim.events) if (e.type === 'contact' && !process.env.QUIETC) console.log('  contact', tag, 't=' + t.toFixed(2), JSON.stringify(e).slice(0, 120)); sim.events.length = 0; w.tick(t);
    if (process.env.TRACE === tag && i % +(process.env.EVERY || 12) === 0) console.log(t.toFixed(2), `x=${sim.x.toFixed(1)} z=${sim.z.toFixed(1)} psi=${sim.psi.toFixed(2)} v=${sim.v.toFixed(1)} om=${sim.om.toFixed(2)} u=${hyp(sim.ux, sim.uz).toFixed(1)} act=${sim.act ? sim.act.kind : '-'} stalk=${(sim.stalk || 0).toFixed(1)} low=${(sim.lowness || 0).toFixed(2)} pre=${sim.pre ? 'Y' : '-'} fp=${sim.feet[0].planted ? 'P' : 's'}${sim.feet[1].planted ? 'P' : 's'} ${sim.feet.map((f, k) => (f.planted ? 'pl' : 'tg') + '(' + ((f.target.x - sim.x) * Math.cos(sim.psi) - (f.target.z - sim.z) * Math.sin(sim.psi)).toFixed(2) + ',' + ((f.target.x - sim.x) * Math.sin(sim.psi) + (f.target.z - sim.z) * Math.cos(sim.psi)).toFixed(2) + ' yaw' + (f.yaw - sim.psi).toFixed(2) + ')').join(' ')}`, Object.entries(w.cur).filter(([k]) => ['stance', 'footOut', 'thighs'].includes(k)).map(([k, v]) => k + '=' + v.toFixed(2)).join(' ')); }
  return w; };
const rushSc = (beta, d) => (seed) => { const tx = Math.sin(beta) * 4, tz = Math.cos(beta) * 4, st = { x: tx, z: tz };
  const seg = [['lock', 0.4], ['stand', 0.3], ['rush', d], ['stand', 0.1], ['rush', d], ['stand', 0.3], ['back', 0.5], ['stand', 3]]; let t0 = 0; const tl = seg.map(([k, L]) => { const o = { k, a: t0, b: t0 + L }; t0 += L; return o; });
  return bodyRun(seed, 0, 0, 0, 2 + t0, (t0s, sim) => { const t = t0s - 2; if (t < 0) return { goal: null, pace: 1, freeze: true }; const e = tl.find((q) => t >= q.a && t < q.b) || { k: 'stand' };
    if (e.k === 'lock') return { goal: { kind: 'face', x: tx, z: tz }, pace: 1, stalk: true, quickTurn: true, alert: 1, look: { x: tx, y: 1.7, z: tz, lock: true } };
    if (e.k === 'rush') return { goal: { kind: 'approach', id: 7 + Math.round(t * 10), x: tx, z: tz, stop: 2, quick: true }, pace: 9.6, burst: true, agitation: 0.4, quickTurn: true, look: { x: tx, y: 1.7, z: tz, lock: true } };
    if (e.k === 'back') return { goal: { kind: 'drive', throttle: -0.35, steer: 0 }, pace: 1, look: { x: tx, y: 1.7, z: tz, lock: true } };
    return { goal: null, pace: 1, look: { x: tx, y: 1.7, z: tz, lock: true } }; }, 'p' + (beta * 57.3).toFixed(0) + ':' + d); };
for (const beta of [0, 0.52, -0.52, 1.05, -1.05]) for (const d of [0.1, 0.2, 0.3, 0.4]) BO[`T15 rush cancel bearing ${(beta * 57.3).toFixed(0)} dur ${d}`] = rushSc(beta, d);
// T14: the animal at (-30.6, 77.3) heading -8.24 walking at 1.8 m/s; goals to the Warehouse's south wall round its east end (x -44, south wall z 60)
for (const [gx, gz] of [[-46, 56], [-50, 57], [-44, 58], [-56, 57]]) BO[`T14 move round Warehouse corner to ${gx},${gz}`] = (seed) => bodyRun(seed, -30.6, 77.3, -8.24, 30, (t, sim) => ({ goal: { kind: 'move', id: 3, x: gx, z: gz, last: true }, pace: 2.0, look: { x: -31.6, y: 1.7, z: 72.3, lock: true }, noIdle: true }), 'c' + gx + ':' + seed);

// T14 variant: walking straight at 1.8 m/s, then the goal (a `move` at pace 2.0, eye locked ahead on the person) jumps to a point 6 m off at bearing beta
for (const beta of [0.8, -0.8, 1.57, -1.57, 2.4, -2.4, 3.14]) BO[`T14 walk then turn to bearing ${(beta * 57.3).toFixed(0)}`] = (seed) => bodyRun(seed, 0, 0, 0, 12, (t, sim) => { const look = { x: 0, y: 1.7, z: 20, lock: true };
  if (t < 3) return { goal: { kind: 'move', id: 1, x: 0, z: 40, last: true }, pace: 2.0, look, noIdle: true };
  if (!sim.__g) sim.__g = { x: sim.x + Math.sin(sim.psi + beta) * 6, z: sim.z + Math.cos(sim.psi + beta) * 6 };
  return { goal: { kind: 'move', id: 2, x: sim.__g.x, z: sim.__g.z, last: true }, pace: 2.0, look, noIdle: true }; }, 'w' + (beta * 57.3).toFixed(0) + ':' + seed);
// T14 variant 2: running (pace 4.5 or 8) for 3 s, then the mind's besiege `go` (move goal at pace 2.0 at bearing beta, eye on the person)
for (const pc of [4.5, 8]) for (const beta of [0.8, -0.8, 1.57, -1.57, 2.4, -2.4]) BO[`T14 run ${pc} then besiege go at bearing ${(beta * 57.3).toFixed(0)}`] = (seed) => bodyRun(seed, 0, 0, 0, 10, (t, sim) => { const look = { x: 0, y: 1.7, z: 20, lock: true };
  if (t < 3) return { goal: { kind: 'move', id: 1, x: 0, z: 80, last: false }, pace: pc, look, noIdle: true };
  if (!sim.__g) sim.__g = { x: sim.x + Math.sin(sim.psi + beta) * 6, z: sim.z + Math.cos(sim.psi + beta) * 6 };
  return { goal: { kind: 'move', id: 2, x: sim.__g.x, z: sim.__g.z, last: true }, pace: 2.0, look, noIdle: true }; }, 'r' + pc + ':' + (beta * 57.3).toFixed(0) + ':' + seed);
const BOONLY = process.env.BO || (ONLY ? 'none' : '');
for (const [name, f] of Object.entries(BO)) { if (BOONLY === 'none' || (BOONLY && !name.includes(BOONLY))) continue; for (const sd of [1, 2, 3]) { sc = name; seed = sd; const w = f(sd); merge(name, sd, w.W); rawMerge(name, w.R); } }
// table: per scenario and measure, the worst over seeds (with seed, time, context) and the number of seeds / episodes involved
const key = (r) => r.sc + '|' + r.name; const by = new Map(); for (const r of rows) { const g = by.get(key(r)) || { ...r, seeds: new Set(), ep: 0 }; g.seeds.add(r.seed); g.ep += r.ep; if (r.worst > g.worst || !by.has(key(r))) { g.worst = r.worst; g.t = r.t; g.ctx = r.ctx; g.seed = r.seed; } by.set(key(r), g); }
const list = [...by.values()].sort((a, b) => a.sc.localeCompare(b.sc) || (RV[a.name] ? 1 : 0) - (RV[b.name] ? 1 : 0) || a.name.localeCompare(b.name));
for (const g of list) { const u = LIM[g.name] ? LIM[g.name][1] : ''; console.log(`${g.sc.padEnd(34)} ${g.name.padEnd(16)} worst ${g.worst.toFixed(2)}${u} seed ${g.seed} t=${g.t.toFixed(1)} (${g.seeds.size} seeds, ${g.ep} ep) ${g.ctx}`); }
if (process.env.RAW) for (const [k, r] of RAW) console.log('raw', k, r.max.toFixed(2), 't=' + r.t.toFixed(1));
