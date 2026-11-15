// Navigation soak over the paddock: can the animal get everywhere it should, does it ever get stuck, and can a person
// get everywhere at all (no pockets, nothing to fall through)?
//   node test/navsoak.mjs [reach|mind|person|all] [secs per mind run, default 240] [terrain seeds, default 7,11]
// reach:  the body alone (no mind) is sent to every landmark and to random reachable points; reports arrivals, time and stuck time.
// mind:   the full arena (mind, body, herd) with a person touring the hiding places; reports stuck time, time on blocked ground,
//         time in rock, how much of the map it covered, and whether it ever left the paddock.
// person: flood fill of where a person (0.4 m) can stand and walk from the meadow; reports enclosed pockets.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { Nav } from '../src/sim/nav.js';
import { makeRng } from '../src/math.js';

const which = process.argv[2] || 'all', SECS = +(process.argv[3] || 240), TSEEDS = (process.argv[4] || '7,11').split(',').map(Number);
const dt = 1 / 120;
const stuckOf = (sim) => sim.vT > 0.6 && Math.abs(sim.v) < 0.25;

function areaReport(T) {
  const N = new Nav(T); N._build();
  const main = N._compAt(0, 10); let inA = 0, mainN = 0, blocked = 0, cut = 0;
  for (let j = 0; j < N.n; j++) for (let i = 0; i < N.n; i++) {
    const [x, z] = N.centre(i, j); if (Math.hypot(x, z) > T.arena) continue; inA++;
    const k = i + N.n * j; if (N.cost[k] === Infinity) blocked++; else if (N.comp[k] === main) mainN++; else cut++;
  }
  return { N, main, frac: mainN / inA, blocked: blocked / inA, cut: cut / inA };
}

function reachRuns(tseed) {
  const T = makeTerrain(tseed), { N, frac, blocked, cut } = areaReport(T), R = makeRng(tseed * 3 + 1);
  console.log(`\n== reach (terrain ${tseed}): animal can reach ${(100 * frac).toFixed(1)}% of the paddock; ${(100 * blocked).toFixed(1)}% blocked (rock, trunks, cliffs, the wood), ${(100 * cut).toFixed(1)}% open but cut off (overlook top, slot floor, pen yard, pockets in the wood)`);
  const goals = T.landmarks.map((m) => ({ name: m.name, x: m.x, z: m.z }));
  for (let k = 0; goals.length < T.landmarks.length + 14 && k < 500; k++) { const a = R() * 6.283, d = Math.sqrt(R()) * (T.arena - 6), x = Math.sin(a) * d, z = Math.cos(a) * d; if (N.reachable(0, 10, x, z)) goals.push({ name: `random(${x.toFixed(0)},${z.toFixed(0)})`, x, z }); }
  const sim = new Creature(T, { x: 0, z: 10, yaw: 0, seed: 3 });
  let tot = { arrived: 0, n: 0, stuck: 0, longest: 0, secs: 0, blockedT: 0 };
  for (const [gi, g] of goals.entries()) {
    const [tx, tz] = N.nearestOpen(g.x, g.z, [sim.x, sim.z]), id = gi + 1, lim = 150;
    let t = 0, stuck = 0, run = 0, longest = 0, arrived = false, blockedT = 0;
    for (; t < lim; t += dt) {
      sim.step(dt, { goal: { kind: 'reach', id, x: tx, z: tz }, pace: 4.5, attention: null });
      const ev = sim.events.some((e) => e.type === 'arrived' && e.id === id); sim.events.length = 0;
      if (ev) { arrived = true; break; }
      if (stuckOf(sim)) { stuck += dt; run += dt; longest = Math.max(longest, run); } else run = 0;
      if (N.costAt(sim.x, sim.z) === Infinity) blockedT += dt;
      if (Math.hypot(sim.x - tx, sim.z - tz) < 2) { arrived = true; break; }
    }
    for (let k = 0; k < 120; k++) { sim.step(dt, { goal: null, pace: 2, attention: null }); sim.events.length = 0; }
    tot.n++; tot.arrived += arrived ? 1 : 0; tot.stuck += stuck; tot.longest = Math.max(tot.longest, longest); tot.secs += t; tot.blockedT += blockedT;
    if (!arrived || longest > 2 || gi < T.landmarks.length) console.log(`${Math.hypot(sim.x - tx, sim.z - tz) > 7 ? '!!' : '  '}` + `  ${g.name.padEnd(18)} -> (${tx.toFixed(0)},${tz.toFixed(0)}) ${arrived ? 'arrived' : 'NOT ARRIVED'} in ${t.toFixed(1)}s, stuck ${stuck.toFixed(1)}s (longest ${longest.toFixed(1)}s), on blocked cells ${blockedT.toFixed(1)}s, ended at (${sim.x.toFixed(0)},${sim.z.toFixed(0)})`);
  }
  console.log(`  reach summary: ${tot.arrived}/${tot.n} arrived, ${tot.secs.toFixed(0)}s walking, stuck ${tot.stuck.toFixed(1)}s total (${(100 * tot.stuck / tot.secs).toFixed(2)}%), longest stuck ${tot.longest.toFixed(1)}s, on blocked cells ${tot.blockedT.toFixed(1)}s`);
  return tot;
}

// a person touring the hiding places: walks (2.6 m/s, pushed out of solids), lingers, crouches in cover, shouts now and then
function mindRun(tseed, mseed, secs) {
  const T = makeTerrain(tseed), { N } = areaReport(T), R = makeRng(mseed * 17 + tseed);
  const sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: mseed }), mind = new Mind(sim, mseed), A = new Arena(T, sim, mind, mseed);
  const tour = (T.paddock.LAYOUT && T.paddock.LAYOUT.fence ? ['the Barn', 'the Warehouse', 'the Containers', 'the Ruins', 'the Jungle', 'the Bamboo', 'the Cave', 'the Ledge Foot', 'the Pond', 'the Jetty', 'the Culvert', 'the Gatehouse', 'the Feeding Tower', 'the South Field'] : ['the Overlook', 'the Tumble', 'the Jam', 'the Long Grass', 'the Pond', 'the Wallow', 'the Crags', 'the Clearing', 'the Wood', 'the Ford', 'the Station', 'the Anvil', 'the Lone Pine', 'the Gully']).map((n) => T.landmarks.find((m) => m.name === n)).filter(Boolean);
  for (let i = tour.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [tour[i], tour[j]] = [tour[j], tour[i]]; }
  const me = { id: 'you', x: 20, z: 30, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
  let wp = 0, linger = 0, stuck = 0, run = 0, longest = 0, blockedT = 0, inRock = 0, outside = 0, seenT = 0, nan = false; const cells = new Set(), behs = {}, blockedAt = {};
  const wind = { x: 1.5, z: -2 };
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt, g = tour[wp % tour.length], px = me.x, pz = me.z;
    const gx = g.x + Math.sin(wp * 2.3) * 2, gz = g.z + Math.cos(wp * 2.3) * 2, dx = gx - me.x, dz = gz - me.z, d = Math.hypot(dx, dz);
    if (d > 1.5 && linger <= 0) { const sp = Math.hypot(me.x - sim.x, me.z - sim.z) < 25 ? 5.5 : 2.6; me.x += dx / d * sp * dt; me.z += dz / d * sp * dt; me.crouch = false; }
    else { if (linger <= 0) linger = 20 + R() * 25; linger -= dt; me.crouch = T.coverAt(me.x, me.z) > 0.2; if (linger <= 0) wp++; }
    { const gy = T.height(me.x, me.z); T.pushOut(me, 0.4, gy, gy + 1.8, 3); }
    me.y = T.height(me.x, me.z) + (me.crouch ? 1.0 : 1.7); me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = Math.hypot(me.vx, me.vz);
    const noises = i % (120 * 45) === 0 && i ? [{ x: me.x, y: me.y, z: me.z, loud: 0.5, kind: 'shout' }] : [];
    A.step(dt, { agents: [me], noises, light: 0.85, flash: false, wind }); A.events.length = 0;
    if (!(sim.x + sim.z === sim.x + sim.z)) { nan = true; break; }
    if (stuckOf(sim)) { stuck += dt; run += dt; longest = Math.max(longest, run); } else run = 0;
    if (N.costAt(sim.x, sim.z) === Infinity) { blockedT += dt; const z = T.placeName(sim.x, sim.z) + (T.slopeAt(sim.x, sim.z) > 0.62 ? '/steep' : '') + (T.near(sim.x, sim.z, 3.5).length ? '/nearsolid' : ''); blockedAt[z] = (blockedAt[z] || 0) + dt; }
    if (T.bound ? Math.max(Math.abs(sim.x), Math.abs(sim.z)) > T.bound + 1 : Math.hypot(sim.x, sim.z) > T.arena + 10) outside += dt;
    if (i % 12 === 0) { for (const c of T.near(sim.x, sim.z, 1.2)) if (c.kind !== 'tree' || true) { if (Math.hypot(sim.x - c.x, sim.z - c.z) < c.r + 0.9 && sim.groundY + 1.5 < c.top) { inRock += 0.1; break; } } cells.add(`${Math.floor(sim.x / 4)},${Math.floor(sim.z / 4)}`); }
    if (mind.know.seen) seenT += dt;
    const b = mind.beh ? mind.beh.name : 'none'; behs[b] = (behs[b] || 0) + dt;
  }
  const cov = cells.size * 16 / (Math.PI * T.arena ** 2);
  console.log(`  terrain ${tseed} mind ${mseed}: ${secs}s, stuck ${stuck.toFixed(1)}s (longest ${longest.toFixed(1)}s), on blocked ground ${blockedT.toFixed(1)}s, hips in rock/trunk ${inRock.toFixed(1)}s, outside ${outside.toFixed(1)}s, covered ${(100 * cov).toFixed(0)}% of the map, saw the person ${(100 * seenT / secs).toFixed(0)}%${nan ? ' NaN!' : ''}`);
  console.log(`     blocked ground by place: ${JSON.stringify(Object.fromEntries(Object.entries(blockedAt).map(([k, v]) => [k, +v.toFixed(1)])))}\n     behaviour seconds: ${Object.entries(behs).sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}`);
  return { stuck, longest, blockedT, inRock, outside, nan };
}

// where can a person be? flood fill a 0.5 m grid of standable points (a 0.4 m capsule clear of colliders, on the ground) from the meadow
function personRun(tseed) {
  const T = makeTerrain(tseed), S = 0.5, RR = T.arena + 10, n = Math.ceil(2 * RR / S), ok = new Uint8Array(n * n), seen = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = -RR + (i + 0.5) * S, z = -RR + (j + 0.5) * S; if (Math.hypot(x, z) > RR) continue;
    const g = T.height(x, z), p = { x, z }; T.pushOut(p, 0.4, g, g + 1.8, 1);
    ok[i + n * j] = Math.hypot(p.x - x, p.z - z) < 1e-3 && T.height(x, z) === T.height(x, z) ? 1 : 0;
  }
  const st = [], s0 = Math.floor((0 + RR) / S) + n * Math.floor((10 + RR) / S); st.push(s0); seen[s0] = 1; let cnt = 0;
  while (st.length) { const k = st.pop(); cnt++; const i = k % n, j = (k / n) | 0; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = i + a + n * (j + b); if (i + a < 0 || j + b < 0 || i + a >= n || j + b >= n || seen[q] || !ok[q]) continue; seen[q] = 1; st.push(q); } }
  let free = 0, pockets = 0, pocketCells = 0; const pocketList = [];
  const seen2 = new Uint8Array(seen);
  for (let k = 0; k < n * n; k++) if (ok[k]) { free++; if (!seen2[k]) { pockets++; let c = 0; const st2 = [k]; seen2[k] = 1; let sx = 0, sz = 0; while (st2.length) { const q = st2.pop(); c++; const i = q % n, j = (q / n) | 0; sx += -RR + (i + 0.5) * S; sz += -RR + (j + 0.5) * S; for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r = i + a + n * (j + b); if (i + a < 0 || j + b < 0 || i + a >= n || j + b >= n || seen2[r] || !ok[r]) continue; seen2[r] = 1; st2.push(r); } } pocketCells += c; if (c * S * S > 0.6) pocketList.push(`${(c * S * S).toFixed(1)}m2 at (${(sx / c).toFixed(0)},${(sz / c).toFixed(0)})`); } }
  // steepest walkable ground a person would have to use: anything over 1.0 is a scramble, over 2 a climb
  let steep = 0; for (let k = 0; k < n * n; k++) if (seen[k]) { const i = k % n, j = (k / n) | 0, x = -RR + (i + 0.5) * S, z = -RR + (j + 0.5) * S; if (T.slopeAt(x, z) > 1.0) steep++; }
  console.log(`\n== person (terrain ${tseed}): ${(100 * cnt / free).toFixed(2)}% of standable ground connected to the meadow; ${pockets} enclosed pockets (${(pocketCells * S * S).toFixed(1)} m2): ${pocketList.slice(0, 12).join(', ') || 'none larger than 0.6 m2'}; ${(steep * S * S).toFixed(0)} m2 of reachable ground steeper than 45 degrees (cliff faces a person can currently walk up)`);
}

for (const ts of TSEEDS) {
  if (which === 'all' || which === 'person') personRun(ts);
  if (which === 'all' || which === 'reach') reachRuns(ts);
  if (which === 'all' || which === 'mind') { console.log(`\n== mind soak (terrain ${ts})`); for (const ms of (process.env.MS || "3,5,8").split(",").map(Number)) mindRun(ts, ms, SECS); }
}
