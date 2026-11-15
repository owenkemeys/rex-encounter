// node test/neckcheck.mjs [cell...] [--fresh] [--v]: the neck skin over the poses play actually puts it in, no rendering.
// Poses: the arena (mind, herd, director) is run with a player at several places (as test/envelope.mjs), and the full pose
// buffer is kept every half second, plus the poses at the extremes of each neck parameter (root pitch and yaw, mean bend
// and its gradient in both planes, the skull's turn off the last vertebra, head height); cached in out/neck_poses.json
// (--fresh rebuilds it). Each pose is skinned (linear blend, as the GPU does) on each tier, and along the neck (bands of
// the neck curve's parameter s, chest to the back of the skull) measured against the bind:
//   length: the neck's length along the centroids of its sections, chest (s 17.6) to skull (s 25.6), and each band's
//           spacing (telescoping, or a stub)
//   area:   each section's area (mean squared radius about its centroid, across the centroid line)
//   edge:   every edge of a triangle touching the neck or its blend into chest and skull (stretch); crush is reported
// Exits 1 if any pose breaks a bound on any tier.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { RexSim, IDX } from '../src/sim/rex.js';
import { buildRexGeometry, boneMatrices, BONE, BONE_COUNT, NECKC, neckFrames } from '../src/view/rexgeo.js';
import { Matrix4, Vector3 } from 'three';
const args = process.argv.slice(2), verbose = args.includes('--v'), cells = args.filter((a) => !a.startsWith('--')).map(Number);
// edge: the outside of a bend must stretch even on an ideal swept tube: skin R from the curve over a change of curvature dk
// grows by 1 + R dk. The bound is 1.5x that for the pose's largest change of curvature between neighbouring stations
// (R 0.9 m, the widest skin around the neck and the back of the head), and never less than 2; p999 is the 99.9th percentile
const BOUND = { len: [0.92, 1.1], band: [0.7, 1.4], area: [0.65, 1.35], edge: 2.0, p999: 3.2 };
const here = new URL('.', import.meta.url).pathname, CACHE = here + '../out/neck_poses.json';

function collect() {
  return Promise.all([import('../src/terrain.js'), import('../src/sim/mind.js'), import('../src/sim/arena.js')]).then(([{ makeTerrain }, { Mind }, { Arena }]) => {
    const PLACES = [['near', 9, 0, 0], ['close', 4, 0, 0], ['tower', 7, 8, 0], ['behind', 10, 0, 1], ['far', 35, 0, 0], ['none', 0, 0, 0]];
    const DT = 1 / 120, SEC = 30, keep = [], ext = {};
    for (const [pl, dist, up, circ] of PLACES) for (let s = 1; s <= 2; s++) {
      const T = makeTerrain(7), sim = new RexSim(T, { x: 0, z: 0, yaw: s, seed: s }), mind = new Mind(sim, s), A = new Arena(T, sim, mind, s);
      for (let i = 0; i < SEC * 120; i++) {
        const t = i * DT, a = circ ? t * 0.35 : s * 1.3;
        const me = { id: 'you', x: Math.sin(a) * dist, z: Math.cos(a) * dist, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
        if (circ) { me.x += sim.x; me.z += sim.z; }
        me.y = T.height(me.x, me.z) + 1.7 + up;
        A.step(DT, { agents: dist ? [me] : [], noises: [], light: 0.55, flash: false, wind: { x: 1, z: 0 } }); A.events.length = 0;
        if (i < 240 || !sim.neckX) continue;
        const snap = () => ({ v: Array.from(sim.pose.v, (x) => +x.toFixed(5)), s: Array.from(sim.pose.s, (x) => +x.toFixed(5)), tag: `${pl}${s} t${t.toFixed(1)}` });
        const X = sim.neckX, e = sim.neckEnd, h = sim.head;
        const q = { rootP: X[0], rootY: X[1], bendP: X[2], gradP: X[3], bendY: X[4], gradY: X[5], skull: Math.acos(Math.max(-1, Math.min(1, e.dot(h.f)))), headUp: h.pos.y - sim.chest.p.y, headPitch: h.f.y };
        for (const k in q) for (const [side, better] of [['lo', (a, b) => a < b], ['hi', (a, b) => a > b]]) {
          const id = k + '.' + side; if (!ext[id] || better(q[k], ext[id].val)) ext[id] = { val: q[k], i, pose: null, want: true };
          if (ext[id].i === i) ext[id].pose = snap();
        }
        if (i % 60 === 0) keep.push(snap());
      }
    }
    const step = Math.max(1, Math.floor(keep.length / 40)), poses = keep.filter((_, i) => i % step === 0);
    for (const id in ext) poses.push({ ...ext[id].pose, tag: `${id} ${ext[id].val.toFixed(2)} (${ext[id].pose.tag})` });
    return poses;
  });
}

const flat = { height: () => 0, normal: (x, z, o) => { o.x = 0; o.y = 1; o.z = 0; return o; }, arena: 1e4, size: 1e4, addBump() {}, bumps: [] };
let poses;
if (!args.includes('--fresh') && existsSync(CACHE)) poses = JSON.parse(readFileSync(CACHE, 'utf8'));
else { poses = await collect(); mkdirSync(here + '../out', { recursive: true }); writeFileSync(CACHE, JSON.stringify(poses)); }
const V = () => new Vector3(), S0 = 18.0, S1 = 25.6, BW = 0.4, NB = Math.round((S1 - S0) / BW), NA = 16;
let fail = 0;
for (const cell of cells.length ? cells : [0.0725, 0.04]) {
  const sim = new RexSim(flat, { x: 0, z: 0, yaw: 0, seed: 1 }), g = buildRexGeometry(sim.pose, { cell }), nv = g.position.length / 3;
  const inv = g.bind.map((m) => m.clone().invert()), N0 = BONE.neck(0), stations = BONE_COUNT > N0, FB = neckFrames(g.bindPose);
  console.log(`skin: ${stations ? NECKC.N + ' neck stations' : '7 neck joints'}`);
  // material coordinates: s from the vertex's neck-station weights (a vertex that is mostly neck), band, angle round the bind curve
  const sv = new Float32Array(nv).fill(-1), band = new Int16Array(nv).fill(-1), ang = new Int16Array(nv), touch = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    let wn = 0, ws = 0;
    for (let c = 0; c < 4; c++) { const b = g.skinIndex[i * 4 + c], w = g.skinWeight[i * 4 + c]; if (stations ? b >= N0 : b >= IDX.NECK0 && b < BONE.SKULL) { wn += w; ws += w * (stations ? NECKC.S0 + (b - N0) * NECKC.H : b); } if (b === BONE.SKULL && g.headPos[i * 3 + 2] < 0.3) touch[i] = 1; if (b === IDX.CHEST && w > 0.2) touch[i] = 1; }
    if (wn > 0.05) touch[i] = 1;
    if (wn < 0.5 || g.tags[i] === 3) continue;
    const s = g.neckS && g.neckS[i] >= 0 ? g.neckS[i] : ws / wn; sv[i] = s; if (s < S0 || s >= S1) continue;
    band[i] = Math.floor((s - S0) / BW);
    const k = Math.round((s - NECKC.S0) / NECKC.H), M = FB[Math.max(0, Math.min(NECKC.N - 1, k))].elements, q = V().fromArray(g.position, i * 3);
    const dx = q.x - M[12], dy = q.y - M[13], dz = q.z - M[14];
    ang[i] = Math.floor(((Math.atan2(dx * M[0] + dy * M[1] + dz * M[2], dx * M[4] + dy * M[5] + dz * M[6]) + Math.PI) / (2 * Math.PI)) * NA) % NA;
  }
  const E = []; for (let t = 0; t < g.index.length; t += 3) if (touch[g.index[t]] || touch[g.index[t + 1]] || touch[g.index[t + 2]]) for (let e = 0; e < 3; e++) touch[g.index[t + e]] |= 2;
  for (let t = 0; t < g.index.length; t += 3) if ((touch[g.index[t]] & 1) || (touch[g.index[t + 1]] & 1) || (touch[g.index[t + 2]] & 1)) for (let e = 0; e < 3; e++) { const a = g.index[t + e], b = g.index[t + (e + 1) % 3]; if (a < b) E.push(a, b); }
  // per band: centroid, and radii (max per angle sector) across the centroid line
  const measure = (pos) => {
    const C = Array.from({ length: NB }, V), n = new Float32Array(NB);
    for (let i = 0; i < nv; i++) if (band[i] >= 0) { C[band[i]].x += pos[i * 3]; C[band[i]].y += pos[i * 3 + 1]; C[band[i]].z += pos[i * 3 + 2]; n[band[i]]++; }
    C.forEach((c, k) => c.multiplyScalar(1 / Math.max(1, n[k])));
    const T = C.map((c, k) => V().subVectors(C[Math.min(NB - 1, k + 1)], C[Math.max(0, k - 1)]).normalize());
    const R = new Float32Array(NB * NA), d = V();
    for (let i = 0; i < nv; i++) { const k = band[i]; if (k < 0) continue; d.fromArray(pos, i * 3).sub(C[k]); d.addScaledVector(T[k], -d.dot(T[k])); const r = d.length(); if (r > R[k * NA + ang[i]]) R[k * NA + ang[i]] = r; }
    const area = []; for (let k = 0; k < NB; k++) { let s = 0, m = 0; for (let j = 0; j < NA; j++) if (R[k * NA + j] > 0) { s += R[k * NA + j] ** 2; m++; } area.push(m >= NA * 0.75 ? s / m : 0); }
    const sp = []; let L = 0; for (let k = 0; k < NB - 1; k++) { const l = n[k] >= 8 && n[k + 1] >= 8 ? C[k].distanceTo(C[k + 1]) : 0; sp.push(l); L += l; }
    return { area, sp, L };
  };
  const mb = measure(g.position);
  const M = Array.from({ length: BONE_COUNT }, () => new Matrix4()), Sk = Array.from({ length: BONE_COUNT }, () => new Matrix4()), Q = new Float32Array(nv * 3), a = V(), q = V();
  const worst = { len: [1, 1], band: [9, 0], area: [9, 0], edge: 0, crush: 9 }, rows = [];
  for (const P of poses) {
    boneMatrices({ v: Float32Array.from(P.v), s: Float32Array.from(P.s) }, M, 0.1);
    for (let b = 0; b < BONE_COUNT; b++) Sk[b].multiplyMatrices(M[b], inv[b]);
    for (let i = 0; i < nv; i++) { if (sv[i] < 0 && !touch[i]) continue; a.set(0, 0, 0); for (let c = 0; c < 4; c++) { const w = g.skinWeight[i * 4 + c]; if (w) a.addScaledVector(q.fromArray(g.position, i * 3).applyMatrix4(Sk[g.skinIndex[i * 4 + c]]), w); } a.toArray(Q, i * 3); }
    const mp = measure(Q), lr = mp.L / mb.L;
    let dk = 0; { const FP = neckFrames({ v: Float32Array.from(P.v), s: Float32Array.from(P.s) }), t = (B, k) => V().setFromMatrixColumn(B === M ? FP[k] : FB[k], 2), x = (B, k) => V().setFromMatrixPosition(B === M ? FP[k] : FB[k]);
      for (let k = 0; k < NECKC.N - 1; k++) { const l = x(g.bind, k).distanceTo(x(g.bind, k + 1)) || 1, ab = Math.acos(Math.min(1, t(g.bind, k).dot(t(g.bind, k + 1)))), ap = Math.acos(Math.min(1, t(M, k).dot(t(M, k + 1)))); dk = Math.max(dk, Math.abs(ap - ab) / l); } }
    const eMax = Math.max(BOUND.edge, 1.5 * (1 + 0.9 * dk)), ER = [];
    let bLo = 9, bHi = 0, aLo = 9, aHi = 0, aw = '', eHi = 0, eLo = 9, ew = '';
    for (let k = 0; k < NB - 1; k++) { if (!(mb.sp[k] > 0)) continue; const r = mp.sp[k] / mb.sp[k]; bLo = Math.min(bLo, r); bHi = Math.max(bHi, r); }
    for (let k = 0; k < NB; k++) if (mb.area[k] > 0 && mp.area[k] > 0) { const r = mp.area[k] / mb.area[k]; if (r < aLo) { aLo = r; aw = (S0 + (k + 0.5) * BW).toFixed(1); } if (r > aHi) aHi = r; }
    for (let e = 0; e < E.length; e += 2) { const u = E[e], w = E[e + 1];
      const r = Math.hypot(g.position[u * 3] - g.position[w * 3], g.position[u * 3 + 1] - g.position[w * 3 + 1], g.position[u * 3 + 2] - g.position[w * 3 + 2]); if (r < cell * 0.3) continue;
      const k = Math.hypot(Q[u * 3] - Q[w * 3], Q[u * 3 + 1] - Q[w * 3 + 1], Q[u * 3 + 2] - Q[w * 3 + 2]) / r; eLo = Math.min(eLo, k); ER.push(k);
      if (k > eHi) { eHi = k; if (process.env.NCDBG) { const bs = (i) => [0, 1, 2, 3].map((c) => g.skinIndex[i * 4 + c] + ':' + g.skinWeight[i * 4 + c].toFixed(2)).join(' '); ew = `r${r.toFixed(3)} [${bs(u)}] [${bs(w)}] `; } else ew = ''; ew += `s${sv[u].toFixed(1)}/${sv[w].toFixed(1)} h(${[0, 1, 2].map((c) => g.headPos[u * 3 + c].toFixed(2))})`; } }
    ER.sort((a, b) => a - b); const p999 = ER[Math.floor(ER.length * 0.999)];
    const ok = lr >= BOUND.len[0] && lr <= BOUND.len[1] && bLo >= BOUND.band[0] && bHi <= BOUND.band[1] && aLo >= BOUND.area[0] && aHi <= BOUND.area[1] && eHi <= eMax && p999 <= BOUND.p999;
    worst.p999 = Math.max(worst.p999 || 0, p999); worst.eRel = Math.max(worst.eRel || 0, eHi / eMax);
    if (!ok) fail = 1;
    worst.len = [Math.min(worst.len[0], lr), Math.max(worst.len[1], lr)]; worst.band = [Math.min(worst.band[0], bLo), Math.max(worst.band[1], bHi)];
    worst.area = [Math.min(worst.area[0], aLo), Math.max(worst.area[1], aHi)]; worst.edge = Math.max(worst.edge, eHi); worst.crush = Math.min(worst.crush, eLo);
    if (verbose || !ok) rows.push(`  ${P.tag.padEnd(44)} len ${lr.toFixed(3)} band ${bLo.toFixed(2)}..${bHi.toFixed(2)} area ${aLo.toFixed(2)}(s${aw})..${aHi.toFixed(2)} edge ${eLo.toFixed(2)}..${eHi.toFixed(2)} (max ${eMax.toFixed(1)}, p999 ${p999.toFixed(2)}) ${ew}${ok ? '' : '  FAIL'}`);
  }
  console.log(`cell ${cell}: ${g.stats.tris} tris, ${BONE_COUNT} bones, neck verts ${band.filter((b) => b >= 0).length}, ${poses.length} poses, bind neck length ${mb.L.toFixed(3)} m`);
  if (rows.length) console.log(rows.join('\n'));
  console.log(`  worst: length ${worst.len.map((x) => x.toFixed(3)).join('..')}  band spacing ${worst.band.map((x) => x.toFixed(2)).join('..')}  area ${worst.area.map((x) => x.toFixed(2)).join('..')}  edge stretch ${worst.edge.toFixed(2)} (of its bound at most ${worst.eRel.toFixed(2)}; p99.9 ${worst.p999.toFixed(2)}; crush ${worst.crush.toFixed(2)})`);
}
console.log(`bounds: length ${BOUND.len.join('..')} of bind, band spacing ${BOUND.band.join('..')}, section area ${BOUND.area.join('..')}, edge stretch <= max(${BOUND.edge}, 1.5 x geometric for the pose's change of curvature), p99.9 <= ${BOUND.p999}; crush (inside of a bend) reported, not bounded`);
process.exit(fail);
