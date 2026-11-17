// The security-camera replay's framing (src/view/ptz.js), headless: builds the terrain, synthesises a dozen varied tapes (positions of the player figure and the
// animal over 11 s at 30 Hz, the death at 8.5 s) and runs the real mount selection and pan-tilt-zoom over each. Per tape: how often both subjects are in frame (last
// 5 s and whole tape), how often the figure is unoccluded by structures (the game's own sight test, T.segClear), the figure's smallest and median height as a
// fraction of the frame, the largest pan rate, the cuts and mounts.     node test/killcam_frame.mjs [aspect]      (default 1.778; 0.5625 is a phone held upright)
import { makeTerrain } from '../src/terrain.js';
import { planShots, Ptz, HZ, K, sightClear } from '../src/view/ptz.js';

const T = makeTerrain(7), aspect = +(process.argv[2] || 16 / 9), N = 330, DEATH = 255, TC = DEATH / HZ;
const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

/** A polyline with arc length; position and heading at any s (extended straight beyond both ends). */
function poly(pts) {
  const seg = []; let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], l = Math.hypot(bx - ax, bz - az); seg.push({ ax, az, dx: (bx - ax) / l, dz: (bz - az) / l, s0: L, l }); L += l; }
  return { L, at(s) { let g = seg[0]; if (s >= L) g = seg[seg.length - 1]; else for (const q of seg) if (s >= q.s0) g = q; const u = s - g.s0; return { x: g.ax + g.dx * u, z: g.az + g.dz * u, hx: g.dx, hz: g.dz }; } };
}
const loop = (pts, n) => { const o = []; for (let k = 0; k < n; k++) o.push(...pts); o.push(pts[0]); return o; };
const circle = (cx, cz, r, n = 24, laps = 2) => { const o = []; for (let k = 0; k <= n * laps; k++) { const a = (k / n) * Math.PI * 2; o.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); } return o; };

/** One tape. Figure on a path at vf from arc s0 (clamped at the path's end), the animal on the same path at vr from 0; it has him when the gap is 1.8 m, then `mode`. */
function build(def) {
  const P = poly(def.pts), { s0, vf, vr, mode } = def, dt = 1 / HZ, rows = [];
  let tc = null, fig = null, thr = null;
  for (let i = 0; i < 40 * HZ; i++) {
    const t = i * dt, sf = Math.min(P.L, s0 + vf * t); let sr = Math.min(P.L, vr * t);
    if (tc === null && sf - sr < 1.8) tc = t;
    const after = tc === null ? 0 : t - tc;
    if (tc !== null) sr = Math.min(P.L, Math.max(0, sf - 1.8)) + (mode === 'carry' ? Math.min(after, 2.5) * 2.5 : 0);
    const f = P.at(sf), r = P.at(sr), gy = (x, z) => T.height(x, z);
    let hx = r.x + r.hx * 2.7 + Math.sin(t * 3) * 0.25 * r.hz, hz = r.z + r.hz * 2.7 - Math.sin(t * 3) * 0.25 * r.hx, hy = gy(r.x, r.z) + 2.7 + Math.sin(t * 6) * 0.15;
    let fx = f.x, fz = f.z, fy = gy(f.x, f.z);
    if (tc !== null) {
      if (mode === 'carry') { hx = fx + r.hx * 0.3; hz = fz + r.hz * 0.3; hy = fy + 1.6; fy = fy + 1.3; fx = hx; fz = hz; }
      else if (mode === 'pin') { hy = fy + 1.0 + 0.3 * Math.sin(t * 5); hx = fx + r.hx * 0.8; hz = fz + r.hz * 0.8; }
      else if (mode === 'throw') {
        if (!thr) thr = { x: fx, z: fz, dx: r.hx, dz: r.hz, t0: t };
        const u = t - thr.t0, vy = 9, g = 9.81, y = Math.max(0, vy * u - 0.5 * g * u * u), run = Math.min(u, 2 * vy / g);
        fx = thr.x + thr.dx * 9 * run; fz = thr.z + thr.dz * 9 * run; fy = gy(fx, fz) + y; hx = thr.x + thr.dx * 1; hz = thr.z + thr.dz * 1; hy = gy(hx, hz) + 2.2;
      }
    }
    rows.push([fx, fy, fz, hx, hy, hz, r.x, gy(r.x, r.z) + 2.0, r.z]);
    if (tc !== null && t - tc > 4) break;
  }
  // window: the death at frame DEATH, up to N frames; if the chase began later than that the tape is shorter (the figure died soon after spawning)
  const dI = Math.round(tc * HZ), a = Math.max(0, dI - DEATH), b = Math.min(rows.length, a + N), n = b - a, F = new Float32Array(n * K);
  for (let i = 0; i < n; i++) F.set(rows[a + i], i * K);
  return { F, n, death: dI - a };
}

const D = [
  { name: 'open chase', pts: [[-40, -70], [0, -35], [35, 5], [60, 40]], s0: 20, vf: 6.5, vr: 9.2, mode: 'carry' },
  { name: 'open, curving', pts: circle(0, -30, 24), s0: 14, vf: 6.5, vr: 9.0, mode: 'carry' },
  { name: 'container wall', pts: [[40, 44], [0, 50], [-14, 64], [-23.4, 68]], s0: 18, vf: 6.5, vr: 9.2, mode: 'pin' },
  { name: 'barn doorway', pts: [[24, 10], [24, 64.2]], s0: 14, vf: 6.5, vr: 9.2, mode: 'carry' },
  { name: 'long straight run', pts: [[-90, -60], [-30, -50], [30, -65], [80, -45]], s0: 12, vf: 6.5, vr: 8.1, mode: 'carry' },
  { name: 'round warehouse', pts: loop([[-68, 79], [-40, 79], [-40, 55], [-68, 55]], 3), s0: 14, vf: 6.5, vr: 9.0, mode: 'carry' },
  { name: 'standing, taken', pts: [[10, -40], [10, 10]], s0: 40, vf: 0, vr: 4.8, mode: 'carry' },
  { name: 'thrown in the air', pts: [[20, -60], [20, 20]], s0: 18, vf: 6.5, vr: 9.2, mode: 'throw' },
  { name: 'round the ruins', pts: loop([[-76, 32], [-40, 32], [-40, 8], [-76, 8]], 3), s0: 14, vf: 6.5, vr: 9.0, mode: 'carry' },
  { name: 'feeding tower', pts: circle(-4, -16, 6, 20, 3), s0: 12, vf: 6.0, vr: 8.5, mode: 'carry' },
  { name: 'along the fence', pts: [[88, -70], [88, 70]], s0: 15, vf: 6.5, vr: 9.2, mode: 'pin' },
  { name: 'zig-zag, barn east', pts: [[75, 20], [58, 36], [74, 50], [58, 64], [73, 78], [58, 90]], s0: 12, vf: 6.0, vr: 8.8, mode: 'carry' },
];

const rows = [], pad = (s, n) => String(s).padEnd(n), pct = (v) => (v * 100).toFixed(0).padStart(3) + '%';
const o = { x: 0, y: 0 }, tg = {};
let worst = { last5: 1, clear: 1, med: 9 };
const t0 = Date.now();
for (const d of D) {
  const { F, n, death } = build(d), tp = Date.now(), plan = planShots(T, F, n, death, aspect), plT = Date.now() - tp, ptz = new Ptz();
  let inAll = 0, inLast = 0, nLast = 0, clr = 0, clrT = 0, fh = [], maxRate = 0, prevPan = 0;
  for (const sh of plan.shots) {
    ptz.mount(sh.m, F, sh.f0, aspect);
    for (let i = sh.f0; i < sh.f1; i++) {
      if (i > sh.f0) ptz.step(1 / HZ, F, i, aspect, sstep(death - 45, death, i)); else prevPan = ptz.pan;
      const q = i * K, P = ptz.project.bind(ptz);
      const pts = [[F[q], F[q + 1], F[q + 2]], [F[q], F[q + 1] + 1.8, F[q + 2]], [F[q + 3], F[q + 4], F[q + 5]], [F[q + 6], F[q + 7], F[q + 8]]];
      let ok = true; for (const p of pts) { const r = P(p[0], p[1], p[2], aspect, o); if (!r || Math.abs(r.x) > 0.95 || Math.abs(r.y) > 0.95) ok = false; }
      const a = P(F[q], F[q + 1], F[q + 2], aspect, { }), b = P(F[q], F[q + 1] + 1.77, F[q + 2], aspect, { });
      if (a && b) fh.push(Math.abs(b.y - a.y) / 2);
      const m = ptz.m, c1 = sightClear(T, m.x, m.y, m.z, F[q], F[q + 1] + 0.95, F[q + 2]), c2 = sightClear(T, m.x, m.y, m.z, F[q], F[q + 1] + 1.65, F[q + 2]);
      if (c1 && c2) clr++;
      if (T.segClear(m.x, m.y, m.z, F[q], F[q + 1] + 0.95, F[q + 2], 0.05) && T.segClear(m.x, m.y, m.z, F[q], F[q + 1] + 1.65, F[q + 2], 0.05)) clrT++;      // the strict game test, trunks of trees too
      if (ok) inAll++;
      if (i >= n - 150) { nLast++; if (ok) inLast++; }
      if (i > sh.f0) maxRate = Math.max(maxRate, Math.abs(ptz.vp * Math.cos(ptz.tilt)) * 180 / Math.PI);
    }
  }
  fh.sort((x, y) => x - y);
  const r = { name: d.name, frames: n, last5: inLast / nLast, all: inAll / n, clear: clr / n, clearT: clrT / n, min: fh[0], med: fh[fh.length >> 1], rate: maxRate, cuts: plan.shots.length - 1, mounts: plan.shots.map((s) => s.m.label + (plan.shots.length > 1 ? '@' + (s.f0 / HZ).toFixed(1) : '')).join(' > '), ms: plT };
  rows.push(r);
  worst.last5 = Math.min(worst.last5, r.last5); worst.clear = Math.min(worst.clear, r.clear); worst.med = Math.min(worst.med, r.med);
}
console.log(`aspect ${aspect.toFixed(3)}; planning + camera for ${D.length} tapes in ${Date.now() - t0} ms\n`);
console.log(pad('tape', 20) + pad('frames', 7) + pad('both in(last5s)', 16) + pad('both in(all)', 13) + pad('fig clear', 10) + pad('(+trees)', 9) + pad('fig h min', 10) + pad('median', 8) + pad('pan deg/s', 10) + pad('cuts', 5) + pad('plan ms', 8) + 'mounts');
for (const r of rows) console.log(pad(r.name, 20) + pad(r.frames, 7) + pad(pct(r.last5), 16) + pad(pct(r.all), 13) + pad(pct(r.clear), 10) + pad(pct(r.clearT), 9) + pad(r.min.toFixed(3), 10) + pad(r.med.toFixed(3), 8) + pad(r.rate.toFixed(0), 10) + pad(r.cuts, 5) + pad(r.ms, 8) + r.mounts);
const mean = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
console.log(`\nworst: both in last 5 s ${pct(worst.last5)}, unoccluded ${pct(worst.clear)}, median figure height ${worst.med.toFixed(3)}   mean: last5 ${pct(mean('last5'))}, clear ${pct(mean('clear'))}`);
const bad = rows.filter((r) => r.last5 < 0.95 || r.clear < 0.9 || r.med < 0.12);
console.log(bad.length ? 'FAIL: ' + bad.map((r) => r.name).join(', ') : 'PASS (>= 95% both in frame over the last 5 s, >= 90% unoccluded, median figure >= 0.12 of the frame, on every tape)');
process.exitCode = bad.length ? 1 : 0;
