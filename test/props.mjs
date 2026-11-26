// node test/props.mjs [--all] [--src <dir>] [--kind <kind>] [--seed N]: does every placed solid thing stop the animal's body?
// For each thing (a sample of the many walls, stems and pillars; `--all` for every one) the body is driven straight at it from 12 m away on
// a clear line, at a walk (2 m/s) and at a run (8 m/s), with a `drive` intent (as test/crashread.mjs does), and we record whether a
// `contact` event fired and how deep the trunk (spine joints from the tail base to the neck base), the head and the feet ended up inside the thing's drawn footprint
// (depth of the part's centre inside the footprint, within the thing's height; 0.25 m allowed; a thin thing none). A thing the body ends up past is a
// pass-through (a thin thing, a pole, post, stem or ladder, is allowed to be shouldered past, but the trunk or head may never get its centre inside the footprint). Low things (fallen logs) are stepped over by design: reported apart (crossed or not, contact or not).
// `--src /tmp/before/src` runs the same list against another copy of src/ (a checkout of the old code) for a before/after.
import { pathToFileURL } from 'node:url';
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SRC = arg('--src') ? pathToFileURL(arg('--src').replace(/\/?$/, '/')).href : new URL('../src/', import.meta.url).href;
const { makeTerrain } = await import(SRC + 'terrain.js');
const { RexSim } = await import(SRC + 'rex/body/rex.js');
const ALL = process.argv.includes('--all'), ONLY = arg('--kind'), SEED = +(arg('--seed') || 7), LIM = 0.25;
const T = makeTerrain(SEED), PD = T.paddock, dt = 1 / 120;
// fallen logs lie in the dense wood, where no 12 m run is clear of stems: they are tried on the open Lawn instead, as copies of the same
// kind of log (radius 0.25 / 0.38 / 0.5, 3 to 7 m long, on a second terrain that has them added to its ground)
const SYN = [[0, 12, 0.25, 4, 1.57], [10, 14, 0.38, 6, 0.5], [-10, 22, 0.5, 7, 1.0], [14, 26, 0.5, 3, 2.2]].map(([x, z, r, len, yaw]) => ({ x, z, yaw, cx: Math.sin(yaw), cz: Math.cos(yaw), half: len / 2 - 0.7 * r, r, lift: 0.58 * r }));
let T2 = T; if (PD.logs && PD.logs.length) { PD.logs.push(...SYN); T2 = makeTerrain(SEED); PD.logs.length -= SYN.length; }

// ---- the list of drawn solid things, each with a footprint test: depth(x, y, z) > 0 inside it (m, to the nearest edge)
const list = [];
const segD = (px, pz, ax, az, bx, bz) => { const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / l2)); return Math.hypot(px - ax - ex * t, pz - az - ez * t); };
const add = (id, kind, of, x, z, y0, y1, depth, extra = {}) => list.push({ id, kind, of, x, z, y0, y1, depth, half: 9, ...extra });      // half: half the thing's thickness (m): the deepest a centre can go in
for (const th of PD.things) {
  if (th.visualOnly || th.kind === 'door' || th.kind === 'roof' || th.kind === 'deck') continue;
  if (th.kind === 'wall' || th.kind === 'slab') { const r = th.w / 2; add(th.id, th.kind, th.of, th.x, th.z, th.y, th.y + th.h, (x, y, z) => r - segD(x, z, th.ax, th.az, th.bx, th.bz), { len: th.l, half: r }); }
  else if (th.kind === 'post' || th.kind === 'pole') add(th.id, th.kind, th.of, th.x, th.z, th.y, th.y + th.h, (x, y, z) => th.r - Math.hypot(x - th.x, z - th.z), { half: th.r });
  else if (th.kind === 'trunk') add(th.id, 'trunk', th.of, th.x, th.z, T.height(th.x, th.z), T.height(th.x, th.z) + th.h, (x, y, z) => th.r - Math.hypot(x - th.x, z - th.z), { half: th.r });
  else if (th.kind === 'catwalk' || th.kind === 'mast' || th.kind === 'ladder') {      // drawn boxes: footprint w x l along yaw; the catwalk's rails stand 1 m over its deck
    if (th.id === 'tower.arm') continue;      // a hoist arm at 11.6 m: out of reach of any part
    const c = Math.cos(th.yaw), s = Math.sin(th.yaw), top = th.y + th.h + (th.kind === 'catwalk' ? 1.0 : 0), bot = th.kind === 'catwalk' ? th.y - 0.05 : th.y;
    add(th.id, th.kind, th.of, th.x, th.z, bot, top, (x, y, z) => { const dx = x - th.x, dz = z - th.z, lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.min(th.w / 2 - Math.abs(lx), th.l / 2 - Math.abs(lz)); }, { len: th.l, half: th.w / 2 });
  }
}
if (!list.some((t) => t.kind === 'pole')) [[-40, 55], [-67, 53], [-37, 80], [-20, 64], [-50, 84]].forEach(([x, z], i) => { const y = T.height(x, z); add(`lamp.pole.${i}`, 'pole', 'lamps', x, z, y, y + 6.2, (px, py, pz) => 0.25 - Math.hypot(px - x, pz - z), { half: 0.25 }); });      // drawn by features.js whether or not they are placed things
if (T2 !== T) for (const [i, L] of SYN.entries()) add(`lawn.log.${i} (r ${L.r})`, 'log', 'lawn', L.x, L.z, 0, 99, (x, y, z) => { const dx = x - L.x, dz = z - L.z, a = dx * L.cx + dz * L.cz, b = dx * L.cz - dz * L.cx, e = Math.max(0, Math.abs(a) - L.half); return L.r - Math.hypot(b, e); }, { low: true, ux: L.cx, uz: L.cz });

// ---- which of them to run
const pick = (arr, n) => ALL || arr.length <= n ? arr : arr.filter((_, i) => i % Math.ceil(arr.length / n) === 0);
const groups = new Map(); for (const t of list) { const k = `${t.of}/${t.kind}`; (groups.get(k) || groups.set(k, []).get(k)).push(t); }
const run = []; for (const [k, arr] of groups) { if (ONLY && !k.includes(ONLY)) continue; run.push(...pick(arr, k.endsWith('trunk') ? 10 : k.endsWith('wall') || k.endsWith('slab') ? 5 : 8)); }

// ---- the approach: 12 m out, on a line with nothing else solid in the way, aimed at the thing
function approach(t) {
  const cands = [];
  if (t.len) { const th = PD.things.find((q) => q.id === t.id); if (th && th.yaw !== undefined) { const nx = Math.cos(th.yaw), nz = -Math.sin(th.yaw); cands.push([nx, nz], [-nx, -nz]); } }
  if (t.ux !== undefined) cands.push([t.uz, -t.ux], [-t.uz, t.ux]);
  for (let k = 0; k < 16; k++) cands.push([Math.sin(k * Math.PI / 8), Math.cos(k * Math.PI / 8)]);
  for (const D of [12.5, 8, 5.5]) for (const [ux, uz] of cands) {      // 12 m out where the ground allows; a nearer start in the dense wood
    const sx = t.x + ux * D, sz = t.z + uz * D; let ok = Math.hypot(sx, sz) < 96 && Math.abs(T.height(sx, sz) - T.height(t.x, t.z)) < 1.5 && T.depthAt(sx, sz) < 0.2;
    for (let d = 4.5; ok && d <= D + 1.5; d += 1) { const px = t.x + ux * d, pz = t.z + uz * d; if (T.near(px, pz, 2.4).length) ok = false; if (T.height(px, pz) - T.height(t.x, t.z) > 1.2 || T.depthAt(px, pz) > 0.3) ok = false; }
    if (ok) return { sx, sz, ux, uz, D };
  }
  return null;
}
function drive(t, A, pace) {
  const sim = new RexSim(t.low ? T2 : T, { seed: 3 }), psi = Math.atan2(-A.ux, -A.uz);
  sim.reset(A.sx - A.ux * 0, A.sz, psi); sim.reset(A.sx, A.sz, psi);
  const secs = A.D / pace + 3.5, R = { contact: 0, force: 0, trunk: -9, head: -9, feet: -9, past: false, v0: 0, hit: null };
  // trunk = tail base to neck base (the tail's tip has no collider)
  const parts = (cb) => { for (let j = 12; j <= 19; j++) { const p = sim.spine[j].p; if (p) cb('trunk', p); } cb('head', sim.head.pos); for (const f of sim.feet || []) if (f.pos) cb('feet', f.pos); };
  let side0 = null;
  for (let i = 0; i < secs * 120; i++) {
    sim.step(dt, { goal: { kind: 'drive', throttle: 1, steer: 0 }, pace, burst: false, agitation: 0, attention: null });
    for (const e of sim.events) if (e.type === 'contact') { R.contact++; R.force = Math.max(R.force, e.force || 0); if (!R.hit) R.hit = e.part; }
    sim.events.length = 0;
    parts((k, p) => { if (!isFinite(p.x)) return; if (p.y < t.y0 - 0.3 || p.y > t.y1 + 0.3) return; const d = t.depth(p.x, p.y, p.z); if (d > R[k]) R[k] = d; });
  }
  // past it: the hips ended up on the far side of the thing's centre, measured along the line of approach
  R.past = (sim.x - t.x) * A.ux + (sim.z - t.z) * A.uz < -0.3;
  R.v = Math.hypot(sim.x - A.sx, sim.z - A.sz); return R;
}
const f = (x) => (x <= -9 ? '  -  ' : x.toFixed(2).padStart(5));
console.log(`props: ${list.length} placed things in ${groups.size} kinds (${run.length} run${ALL ? '' : ', sampled; --all for every one'}); src ${arg('--src') || 'src'}; seed ${SEED}`);
console.log('thing                        kind    pace contact  trunk  head  feet  past  verdict');
const bad = [], byKind = new Map(); let n = 0;
for (const t of run) {
  const A = approach(t); if (!A) { console.log(`${t.id.padEnd(28)} ${t.kind.padEnd(7)} no clear approach`); continue; }
  for (const pace of [2, 8]) {
    const R = drive(t, A, pace), pen = Math.max(R.trunk, R.head, R.feet), low = t.low;
    const lim = Math.min(LIM, 0.5 * t.half), fail = low ? false : Math.max(R.trunk, R.head) > lim || R.feet > LIM, v = low ? (R.past ? 'stepped over' : R.contact ? 'knocked, held' : 'held') : fail ? 'TOO DEEP' : R.contact ? 'ok' : R.past ? 'ok (went round / shouldered past)' : 'ok (no contact event)';
    const row = byKind.get(t.of + '/' + t.kind) || byKind.set(t.of + '/' + t.kind, { n: 0, fail: 0, noc: 0, worst: -9 }).get(t.of + '/' + t.kind); row.n++; row.worst = Math.max(row.worst, low ? -9 : pen); if (fail) row.fail++; if (!low && !R.contact) row.noc++;
    if (fail || ONLY || (!low && !R.contact && pace === 8)) console.log(`${t.id.padEnd(28)} ${t.kind.padEnd(7)} ${String(pace).padStart(3)}  ${String(R.contact).padStart(6)} ${f(R.trunk)} ${f(R.head)} ${f(R.feet)}  ${R.past ? 'yes ' : 'no  '}  ${v}`);
    if (fail) bad.push(`${t.id}@${pace}`); n++;
  }
}
console.log('\nby kind (runs, offenders, runs with no contact event, worst penetration m):');
for (const [k, r] of byKind) console.log(`  ${k.padEnd(20)} ${String(r.n).padStart(3)} runs  ${String(r.fail).padStart(3)} offenders  ${String(r.noc).padStart(3)} no-contact  worst ${r.worst <= -9 ? '-' : r.worst.toFixed(2)}`);
console.log(`\n${n} runs: ${bad.length} offenders (a part's centre deeper in than min(0.25 m, half the thing's thickness)).` + (bad.length ? '\n  offenders: ' + bad.slice(0, 40).join(', ') + (bad.length > 40 ? ' ...' : '') : ''));
process.exit(bad.length ? 1 : 0);
