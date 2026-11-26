// "Stuck" in open ground: the mind's wedged-body recovery (mind._unstick), the give-up after it, and the reach judge (_canReach,
// _noReach) must only fire when the body is in contact with, or hemmed in by, something solid. Plays ordinary encounters in open
// ground on our arena and in the made-up world (test/foreign_world.mjs): the animal alone, and a person standing still at 6, 12
// and 25 m, for several seeds. Logs every stuck / gave-up / no-reach event (the moment the mind records it) and every thought
// voiced from them, with time, behaviour, body speed, nearest solid, whether a route exists, the planner's cost at the body and
// what the feet were doing. Fails (exit 1) when any happens with no solid within a body length of the hips.
//   node test/stuckopen.mjs [--seeds=1,2,3] [--secs=180] [--world=arena|foreign|both] [--dist=alone,6,12,25] [--verbose]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { rectOf } from '../src/rex/body/nav.js';
import { makeForeign } from './foreign_world.mjs';

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number), SECS = +arg('secs', 180), WORLD = arg('world', 'both'), DISTS = arg('dist', 'alone,6,12,25').split(',');
const VERBOSE = process.argv.includes('--verbose'), dt = 1 / 120, BODY_LEN = 12.5;
const CUES = new Set(['stuck', 'gaveup', 'noreach']);

// nearest solid to (x, z): colliders (edge distance, only ones tall enough to stop a leg) and the world's fence
function nearestSolid(T, x, z, gy) {
  let m = 99;
  for (const c of T.near(x, z, 30)) { if ((c.top ?? 99) < gy + 0.4) continue; m = Math.min(m, Math.hypot(c.x - x, c.z - z) - c.r); }
  const R = rectOf(T); if (R) m = Math.min(m, x - R.x0, R.x1 - x, z - R.z0, R.z1 - z);
  return Math.max(0, m);
}
// the most open places in a world: centre points with nothing solid within `need` m
function openSpots(T, need) {
  const R = rectOf(T), out = [];
  for (let x = R.x0 + need; x <= R.x1 - need; x += 3) for (let z = R.z0 + need; z <= R.z1 - need; z += 3) { const m = nearestSolid(T, x, z, T.height(x, z)); if (m >= need) out.push({ x, z, m }); }
  return out.sort((a, b) => b.m - a.m);
}
const feetOf = (sim) => sim.feet.map((f) => (f.planted ? 'P' : 'S')).join('');
const fmt = (v, n = 1) => (typeof v === 'number' ? v.toFixed(n) : String(v));

function play(world, seed, dist) {
  const T = world === 'arena' ? makeTerrain(7) : makeForeign();
  // a place in the open where the animal and the person both stand clear: the animal 14+ m from anything, the person 6+ m
  // (a small world may have no place 14 m clear: then the most open places it has)
  let spots = []; for (const need of [14, 10, 8, 6, 4]) { spots = openSpots(T, need); if (spots.length >= 3) break; }
  const S0 = spots[(seed * 7) % Math.min(spots.length, 12)];
  const yaw = (seed * 2.399) % (2 * Math.PI);
  const sim = new Creature(T, { x: S0.x, z: S0.z, yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  if (world !== 'arena') A.herd.disabled = true;
  let you = null;
  if (dist !== 'alone') {
    const d = +dist; let best = null;
    for (let k = 0; k < 16; k++) { const a = yaw + k * Math.PI / 8, x = sim.x + Math.sin(a) * d, z = sim.z + Math.cos(a) * d, m = nearestSolid(T, x, z, T.height(x, z)); if (!best || m > best.m) best = { x, z, m }; if (m > 8) { best = { x, z, m }; break; } }
    you = { id: 'you', x: best.x, z: best.z, y: T.height(best.x, best.z) + 1.65, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 0, ly: 0, lz: -1 };
  }
  const ev = [], th = []; let pStuck = -99, pGave = -99, pNo = -99, nStream = 0, openT = 0;
  const wind = world === 'arena' ? { x: 0, z: -3 } : { x: 1, z: 0.4 };
  const H = [];      // the last 5 s, tick by tick: what the mind asked of the body before the event (the event's own tick already backs out)
  const snap = (what) => {
    const prev = H.length > 1 ? H[H.length - 2] : null, I = prev ? prev.I : mind.intent || {}, g = I.goal, b = mind.beh, nav = sim.nav, gy = sim.groundY;
    const ns = nearestSolid(T, sim.x, sim.z, gy);
    const G = mind.mem.gaveUp && what === 'gaveup' ? mind.mem.gaveUp : g;
    const route = G && G.x !== undefined && nav ? nav.reachable(sim.x, sim.z, G.x, G.z) : null;
    return {
      world, seed, dist, what, t: +mind.t.toFixed(2), beh: b ? b.name + (b.phase ? '/' + b.phase : '') : '-', gaveBeh: what === 'gaveup' ? mind.mem.gaveUp.beh : undefined,
      v: Math.abs(sim.v), vT: sim.vT, om: sim.om, omT: sim.omT, solid: ns, open: ns > BODY_LEN, route, cost: nav ? nav.costAt(sim.x, sim.z) : null,
      goal: g ? g.kind + (g.x !== undefined ? ' ' + fmt(Math.hypot(g.x - sim.x, g.z - sim.z)) + 'm' : '') + (g.stop !== undefined ? ' stop ' + fmt(g.stop) : '') : 'none',
      reach: sim.reach ? sim.reach.phase : '-', feet: feetOf(sim), freeze: !!I.freeze, path: sim.path ? sim.path.pts.length : 0,
      err: g && g.x !== undefined ? +Math.abs(Math.atan2(Math.sin(Math.atan2(g.x - sim.x, g.z - sim.z) - sim.psi), Math.cos(Math.atan2(g.x - sim.x, g.z - sim.z) - sim.psi))).toFixed(2) : null,
      x: +sim.x.toFixed(1), z: +sim.z.toFixed(1), you: you ? fmt(Math.hypot(you.x - sim.x, you.z - sim.z)) : '-',
      hist: hist(),
    };
  };
  // the 4 s before: path length walked, net displacement, mean speed, goal kinds and behaviours, mean |turn|, share of ticks
  // with both feet planted, the goal's bearing off the heading (min/max), freeze share
  const hist = () => {
    const W = H.slice(-4 * 120 - 1, -1); if (W.length < 2) return '';
    let L = 0, om = 0, pp = 0, fr = 0, emin = 9, emax = 0; const kinds = {}, behs = {};
    for (let k = 1; k < W.length; k++) L += Math.hypot(W[k].x - W[k - 1].x, W[k].z - W[k - 1].z);
    for (const w of W) { om += Math.abs(w.om); if (w.feet === 'PP') pp++; if (w.I.freeze) fr++; const g = w.I.goal; kinds[g ? g.kind : 'none'] = (kinds[g ? g.kind : 'none'] || 0) + 1; behs[w.beh] = (behs[w.beh] || 0) + 1; if (w.err !== null) { emin = Math.min(emin, w.err); emax = Math.max(emax, w.err); } }
    const pc = (o) => Object.entries(o).map(([k, v]) => k + ' ' + Math.round(100 * v / W.length) + '%').join(', ');
    const a = W[0], b = W[W.length - 1];
    return `4s before: walked ${L.toFixed(1)} m, net ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(1)} m, |om| ${(om / W.length).toFixed(2)}, both feet down ${Math.round(100 * pp / W.length)}%, freeze ${Math.round(100 * fr / W.length)}%, goal-bearing ${emin.toFixed(2)}..${emax.toFixed(2)} rad, goals [${pc(kinds)}], behs [${pc(behs)}], goal dist ${W[W.length - 1].gd}`;
  };
  for (let i = 0; i < SECS * 120; i++) {
    A.step(dt, { agents: you ? [you] : [], noises: [], hits: [], light: 0.8, flash: 0, wind });
    A.events.length = 0;
    { const I = mind.intent || {}, g = I.goal, e = g && g.x !== undefined ? Math.abs(Math.atan2(Math.sin(Math.atan2(g.x - sim.x, g.z - sim.z) - sim.psi), Math.cos(Math.atan2(g.x - sim.x, g.z - sim.z) - sim.psi))) : null;
      H.push({ I: { goal: g ? { ...g } : null, freeze: I.freeze }, x: sim.x, z: sim.z, om: sim.om, feet: feetOf(sim), beh: mind.beh ? mind.beh.name + (mind.beh.phase ? '/' + mind.beh.phase : '') : '-', err: e, gd: g && g.x !== undefined ? Math.hypot(g.x - sim.x, g.z - sim.z).toFixed(1) + (g.stop !== undefined ? '/stop ' + g.stop.toFixed(1) : '') : '-' });
      if (H.length > 6 * 120) H.shift(); }
    if (you) { const v = A.victims && A.victims.get('you'); if (v && v.dead) { you = null; } }
    const M = mind.mem;
    const openNow = nearestSolid(T, sim.x, sim.z, sim.groundY) > BODY_LEN; if (openNow) openT += dt;
    // the reach judge, for you standing in the open, and for food in the open ahead of it (once a second)
    if (i % 120 === 0) {
      const aff = mind.ctx && mind.ctx.aff;
      if (you && aff && mind.know.seen && nearestSolid(T, you.x, you.z, T.height(you.x, you.z)) > 6 && (!aff.body || !aff.reach)) noReach.push({ world, seed, dist, t: +mind.t.toFixed(1), what: 'you', aff: JSON.stringify(aff) });
      const fx = sim.x + Math.sin(sim.psi) * 10, fz = sim.z + Math.cos(sim.psi) * 10;
      if (openNow && nearestSolid(T, fx, fz, T.height(fx, fz)) > 6 && !(() => { const r = mind._canReach({ id: '__probe', kind: 'meat', x: fx, z: fz }); delete mind.objMem.__probe; return r; })()) noReach.push({ world, seed, dist, t: +mind.t.toFixed(1), what: 'meat', at: [fx.toFixed(1), fz.toFixed(1)] });
    }
    if (M.stuck && M.stuck.t !== pStuck) { pStuck = M.stuck.t; ev.push(snap('stuck')); }
    if (M.gaveUp && M.gaveUp.t !== pGave) { pGave = M.gaveUp.t; ev.push(snap('gaveup')); }
    if (M.noReach && M.noReach.t !== pNo) { pNo = M.noReach.t; ev.push(snap('noreach')); }
    const S = mind.thinker.stream; if (S.length && S[S.length - 1] !== S.__last) { const e = S[S.length - 1]; S.__last = e; if (CUES.has(e.cond)) th.push({ ...snap('thought:' + e.cond) }); }
  }
  return { ev, th, openT };
}

const worlds = WORLD === 'both' ? ['arena', 'foreign'] : [WORLD];
let all = [], allTh = [], openT = 0, runs = 0; const noReach = [];
for (const w of worlds) for (const seed of SEEDS) for (const d of DISTS) {
  const t0 = Date.now(), r = play(w, seed, d); runs++; openT += r.openT;
  all.push(...r.ev); allTh.push(...r.th);
  const bad = r.ev.filter((e) => e.open).length;
  console.log(`${w.padEnd(7)} seed ${seed} ${String(d).padEnd(5)} events ${String(r.ev.length).padStart(2)} (open ${bad})  thoughts ${r.th.length} (open ${r.th.filter((e) => e.open).length})  in open ${r.openT.toFixed(0)}s  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  if (VERBOSE || bad) for (const e of r.ev) console.log(`   ${e.open ? 'OPEN' : '    '} ${e.what.padEnd(7)} t=${fmt(e.t)} ${e.beh}${e.gaveBeh ? ' (gave up ' + e.gaveBeh + ')' : ''} v=${fmt(e.v, 2)} vT=${fmt(e.vT, 2)} om=${fmt(e.om, 2)} omT=${fmt(e.omT, 2)} solid=${fmt(e.solid)}m route=${e.route} cost=${fmt(e.cost, 2)} goal=${e.goal} err=${e.err} reach=${e.reach} feet=${e.feet} freeze=${e.freeze} you=${e.you} at ${e.x},${e.z}\n        ${e.hist}`);
}
const byWhat = (L) => { const o = {}; for (const e of L) o[e.what] = (o[e.what] || 0) + 1; return JSON.stringify(o); };
const open = all.filter((e) => e.open), openTh = allTh.filter((e) => e.open);
console.log(`\n${runs} runs x ${SECS}s; time in open ground (nothing within ${BODY_LEN} m) ${openT.toFixed(0)} s`);
console.log(`events: ${all.length} ${byWhat(all)}; with no solid within a body length: ${open.length} ${byWhat(open)}`);
console.log(`thoughts voiced: ${allTh.length} ${byWhat(allTh)}; in open ground: ${openTh.length}`);
console.log(`reach judge: says it cannot get at you or at food standing in the open: ${noReach.length}${noReach.length ? ' ' + JSON.stringify(noReach.slice(0, 5)) : ''}`);
const ok = open.length === 0 && openTh.length === 0 && noReach.length === 0;
console.log(ok ? 'ok   no stuck, gave-up or no-reach in open ground' : 'FAIL stuck, gave-up or no-reach in open ground');
process.exit(ok ? 0 : 1);
