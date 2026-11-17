// The security camera of the death replay: where it is mounted and how it moves. Pure maths (no three.js, no DOM) so test/killcam_frame.mjs runs the very same code.
// Owner: "it needs to always be funny to watch, so the angle, distance, zoom etc need to all just work."
//
// A tape is a Float32Array of frames, K floats each: the figure's feet (x y z), the animal's head (x y z) and its torso (x y z), 30 frames a second, with the
// frame of the death marked. planShots() looks at the WHOLE tape before it plays: it scores every possible mount (structure corners and wall middles, and virtual poles beside the action) frame by frame for: both subjects fitting the frame, the line of sight
// (T.segClear, the game's own sight test) to the figure and the animal's head, the figure not hidden behind the animal's body, a side-on view across the line
// between them rather than along it, a sane distance and not looking steeply down; the last 3 s before the death and the 2 s after count most. It returns one
// mount or, when one mount loses them for a stretch, two with one cut between (never more).
// Ptz then moves like a pan-tilt-zoom head on that mount: fixed position, a damped spring on pan, tilt and zoom (a little lag, a little overshoot, a rate limit),
// aimed at the midpoint of the figure and the head, zooming so both fit with margin, pushing in over the last second before the kill.
export const HZ = 30, K = 9;
const D2R = Math.PI / 180, FIG_H = 1.77, MINFRAC = 0.125, FMIN = 12 * D2R, FMAX = 56 * D2R, MARGIN = 0.18, TILT_MIN = -62 * D2R, PAN_RATE = 140 * D2R;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const wrap = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/** The framing for the frame `i`: where a camera at `c` should point and how wide to look. out = { pan, tilt, fov, fit, cap }. `push` 0..1 tightens the zoom for the kill. */
export function aimFor(c, F, i, aspect, out, push = 0) {
  const nF = (F.length / K) | 0, i4 = Math.min(nF - 1, i + 4);      // the operator knows the tape: aims a little ahead, so a sudden throw or lunge does not outrun the zoom
  const o = i4 * K, fx = F[o], fy = F[o + 1], fz = F[o + 2], hx = F[o + 3], hy = F[o + 4], hz = F[o + 5];
  const cx = fx, cy = fy + 0.9, cz = fz, mx = (cx + hx) / 2, my = (cy + hy) / 2, mz = (cz + hz) / 2;
  const dFig = Math.hypot(cx - c.x, cy - c.y, cz - c.z) || 1, cap = clamp(2 * Math.atan(FIG_H / (2 * MINFRAC * (aspect < 1 ? 0.6 + 0.4 * aspect : 1)) / dFig), FMIN, FMAX);
  let fit = 0;
  for (const k of [0, 4, 9]) { const q = Math.min(nF - 1, i + k) * K; fit = Math.max(fit, fitFov(c, mx, my, mz, aspect, F[q], F[q + 1] + 0.9, F[q + 2], F[q + 3], F[q + 4], F[q + 5], F[q + 6], F[q + 7], F[q + 8])); }
  let ax = mx, ay = my, az = mz, fov = fit;
  if (fit > cap) { ax = cx + (hx - cx) * 0.4; ay = cy + (hy - cy) * 0.4; az = cz + (hz - cz) * 0.4; fov = cap; }
  else fov = Math.max(FMIN, fit * (1 - 0.12 * push));
  const dx = ax - c.x, dy = ay - c.y, dz = az - c.z, hd = Math.hypot(dx, dz);
  out.pan = Math.atan2(dx, dz); out.tilt = Math.max(TILT_MIN, Math.atan2(dy, hd)); out.fov = clamp(fov, FMIN, FMAX); out.fit = fit; out.cap = cap; out.dist = Math.hypot(dx, dy, dz);
  return out;
}
/** The vertical field of view at which every subject sphere (figure, head, torso) is inside, with margin, looking from c at (ax, ay, az). */
function fitFov(c, ax, ay, az, aspect, cx, cy, cz, hx, hy, hz, bx, by, bz) {
  let fx = ax - c.x, fy = ay - c.y, fz = az - c.z; const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); if (rl < 1e-4) { rx = 1; rz = 0; } else { rx /= rl; rz /= rl; }
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;      // up = right x forward
  let req = 0;
  const one = (x, y, z, r) => {
    const dx = x - c.x, dy = y - c.y, dz = z - c.z, zc = dx * fx + dy * fy + dz * fz; if (zc < 0.8) { req = 9; return; }
    const xc = dx * rx + dz * rz, yc = dx * ux + dy * uy + dz * uz, tx = (Math.abs(xc) + r) / zc, ty = (Math.abs(yc) + r) / zc;
    req = Math.max(req, ty, tx / aspect);
  };
  one(cx, cy, cz, 0.98); one(hx, hy, hz, 0.8); one(bx, by, bz, 1.5);
  return 2 * Math.atan(req * (1 + MARGIN));
}

/** The game's own sight test (ground, wall pillars with their heights, roofs; see terrain.js segClear) but leaving out the thin trunks of trees, which hide a sliver of a person, not the person. */
export function sightClear(T, ax, ay, az, bx, by, bz, pad = 0.05) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(2, Math.ceil(Math.hypot(L, dy) / 1.0));
  for (let i = 1; i < n; i++) { const t = i / n; if (ay + dy * t < T.height(ax + dx * t, az + dz * t) + 0.05) return false; }
  const mx = (ax + bx) / 2, mz = (az + bz) / 2, L2 = L * L || 1e-9;
  for (const c of T.near(mx, mz, L / 2 + pad + 0.5)) {
    if (c.kind === 'tree' && c.r < 0.6) continue;
    let t = ((c.x - ax) * dx + (c.z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(ax + dx * t - c.x, az + dz * t - c.z), m = c.r + pad + (c.kind === 'wall' && c.r >= 0.12 ? 0.25 : 0); if (d >= m) continue;      // (walls are chains of pillars with gaps between them: fatten them so no ray slips through)
    const hw = Math.sqrt(m * m - d * d) / (L || 1e-9), t0 = Math.max(0, t - hw), t1 = Math.min(1, t + hw), y0 = ay + dy * t0, y1 = ay + dy * t1;
    if (Math.max(y0, y1) + pad > (c.bot ?? -1e9) && Math.min(y0, y1) - pad < c.top) return false;
  }
  return !T.roofBlocks(ax, ay, az, bx, by, bz);
}

/** Candidate mounts for a tape: { x, y, z, label, cam, real }. */
export function mountsFor(T, F, n, death = n - 76) {
  const out = [], st = T.structures || [], lim = (T.bound || 95) - 2.5;
  const compass = (dx, dz) => ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'][((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8];      // +x east, +z north
  const nm = (S) => String(S.name || S.kind || 'YARD').replace(/^the\s+/i, '').toUpperCase().replace('FEEDING ', '');
  const inside = (S, x, z, pad) => { const a = x - S.cx, b = z - S.cz, cs = Math.cos(S.yaw), sn = Math.sin(S.yaw); return Math.abs(a * cs - b * sn) < S.hw + pad && Math.abs(a * sn + b * cs) < S.hd + pad; };
  let si = 0;
  for (const S of st) {
    si++;
    const cs = Math.cos(S.yaw), sn = Math.sin(S.yaw), loc = (a, b) => [S.cx + a * cs + b * sn, S.cz - a * sn + b * cs];
    const gy = T.height(S.cx, S.cz), top = clamp((S.base ?? gy) + S.h + 1 - gy, 4, 8);
    const pts = [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]];
    pts.forEach(([u, v], k) => {
      const [x, z] = loc(u * (S.hw + 0.7), v * (S.hd + 0.7)); if (Math.hypot(x, z) > lim) return;
      out.push({ x, y: T.height(x, z) + top, z, label: nm(S) + ' ' + compass(x - S.cx, z - S.cz), cam: ((si * 3 + k * 5) % 14) + 1, real: true });
    });
    // (no mounts inside buildings: rafters, lofts and stall frames are drawn but not in the sight test, and in the first try a ceiling camera looked through a tie-beam)
  }
  // virtual poles beside the action, 7 m up: across the chase line, round the place of the death and round where the last 3 s before it happened
  const mid = (i, o) => { const q = Math.min(n - 1, Math.max(0, i)) * K; o.x = (F[q] + F[q + 3]) / 2; o.z = (F[q + 2] + F[q + 5]) / 2; o.ax = F[q + 3] - F[q + 6]; o.az = F[q + 5] - F[q + 8]; return o; };
  const centres = [mid(death, {}), mid(death - 45, {}), mid(Math.min(n - 1, death + 40), {}), mid(death - 110, {}), mid(death - 190, {})];
  let pi = 0;
  for (const C of centres) {
    const al = Math.hypot(C.ax, C.az) || 1, ax = C.ax / al, az = C.az / al;
    for (const d of [8, 12, 17, 23]) for (const a of [90, -90, 55, -55, 125, -125, 20, -20, 160, -160]) {
      const r = a * D2R, dx = ax * Math.cos(r) - az * Math.sin(r), dz = ax * Math.sin(r) + az * Math.cos(r), x = C.x + dx * d, z = C.z + dz * d;
      if (Math.hypot(x, z) > lim || st.some((S) => inside(S, x, z, 2)) || out.some((m) => !m.real && Math.hypot(m.x - x, m.z - z) < 3)) continue;
      out.push({ x, y: T.height(x, z) + 7, z, label: 'POLE ' + compass(x - C.x, z - C.z), cam: ((pi++ * 5 + 3) % 14) + 1, real: false });
    }
  }
  return out;
}

/** Choose the shot(s) for a tape of n frames with the death at frame `death`. Returns { shots: [{ m, f0, f1 }], score } (f1 exclusive), and `info` for tuning. */
export function planShots(T, F, n, death, aspect = 16 / 9) {
  const mounts = mountsFor(T, F, n, death), STEP = 4, ns = Math.ceil(n / STEP), tmp = {}, V = { x: 0, y: 0, z: 0 };
  const wts = new Float32Array(ns); let wsum = 0;
  for (let s = 0; s < ns; s++) { const f = s * STEP, w = f >= death - 90 && f < death + 60 ? 4 : f >= death - 150 && f < death - 90 ? 2 : 1; wts[s] = w; wsum += w; }
  // stage 1: everything that needs no sight line
  const geo = mounts.map((m) => {
    const g = new Float32Array(ns); let tot = 0;
    for (let s = 0; s < ns; s++) {
      const i = Math.min(n - 1, s * STEP), o = i * K; V.x = m.x; V.y = m.y; V.z = m.z;
      aimFor(V, F, i, aspect, tmp, 0);
      const fit = tmp.fit <= tmp.cap * 1.02 ? 1 : Math.pow(tmp.cap / tmp.fit, 1.5), fitHard = tmp.fit > FMAX ? 0.15 : 1;
      const el = Math.atan2(m.y - (F[o + 1] + F[o + 4]) / 2, Math.hypot(m.x - (F[o] + F[o + 3]) / 2, m.z - (F[o + 2] + F[o + 5]) / 2)), pitch = 1 - 0.7 * sstep(36 * D2R, 56 * D2R, el) - 0.3 * sstep(56 * D2R, 68 * D2R, el);
      const d = tmp.dist, dist = (d < 7 ? (d / 7) * (d / 7) : 1) * (d > 34 ? 34 / d : 1);
      // side-on to the animal's facing (torso to head), and the figure hidden behind its body
      let ux = F[o + 3] - F[o + 6], uz = F[o + 5] - F[o + 8]; const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      let vx = F[o] - m.x, vz = F[o + 2] - m.z; const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
      const side = 0.5 + 0.5 * (1 - Math.abs(ux * vx + uz * vz));
      const dB = Math.hypot(F[o + 6] - m.x, F[o + 7] - m.y, F[o + 8] - m.z), dF = Math.hypot(F[o] - m.x, F[o + 1] + 0.9 - m.y, F[o + 2] - m.z);
      let hid = 1;
      if (dB < dF + 0.5) {
        const a = angleBetween(F[o] - m.x, F[o + 1] + 0.9 - m.y, F[o + 2] - m.z, F[o + 6] - m.x, F[o + 7] - m.y, F[o + 8] - m.z), r = Math.asin(Math.min(1, 1.7 / dB));
        hid = a < r ? 0.2 : a < r * 1.8 ? 0.2 + 0.8 * (a - r) / (r * 0.8) : 1;
      }
      const sc = fit * fitHard * pitch * dist * side * hid; g[s] = sc; tot += sc * wts[s];
    }
    return { m, g, tot };
  });
  // a quick sight test at three key moments for every mount, so the full test is spent on mounts that can see the action at all
  const sight = (m, i) => { const o = Math.min(n - 1, Math.max(0, i)) * K, fx = F[o], fy = F[o + 1], fz = F[o + 2], a = sightClear(T, m.x, m.y, m.z, fx, fy + 0.95, fz), b = sightClear(T, m.x, m.y, m.z, fx, fy + 1.65, fz); return (a && b ? 1 : a || b ? 0.35 : 0) * (sightClear(T, m.x, m.y, m.z, F[o + 3], F[o + 4], F[o + 5]) ? 1 : 0.6); };
  const early = Math.max(2, Math.floor((death - 90) / STEP));
  for (const g of geo) {
    g.rank = g.tot * (0.15 + 0.85 * (sight(g.m, death) + sight(g.m, death - 60) + sight(g.m, death + 30)) / 3);
    let e = 0; for (let s = 0; s < early; s++) e += g.g[s]; g.rankE = e * (0.15 + 0.85 * (sight(g.m, 0) + sight(g.m, early * STEP / 2) + sight(g.m, early * STEP)) / 3);      // the stretch before the last 3 s
  }
  const pick = new Set();
  for (const key of ['rank', 'rankE']) geo.map((_, k) => k).sort((a, b) => geo[b][key] - geo[a][key]).slice(0, 12).forEach((k) => pick.add(k));
  const order = [...pick];
  // stage 2: the sight lines, for the best few only
  const cand = order.map((k) => {
    const { m, g } = geo[k], sc = new Float32Array(ns); let tot = 0;
    for (let s = 0; s < ns; s++) {
      if (g[s] <= 0) continue;
      sc[s] = (g[s] > 0 ? 0.3 + 0.7 * g[s] : 0.05) * sight(m, s * STEP) * (m.real ? 1.03 : 1); tot += sc[s] * wts[s];
    }
    return { m, sc, tot };
  });
  let best = cand[0]; for (const c of cand) if (c.tot > best.tot) best = c;
  // one cut at most: the pair and the moment that together score highest, taken only when it is clearly better and each side is long enough
  let pair = null, gainMin = 0.05 * wsum;
  const pre = cand.map((c) => { const p = new Float32Array(ns + 1); for (let s = 0; s < ns; s++) p[s + 1] = p[s] + c.sc[s] * wts[s]; return p; });
  const MINSEG = Math.ceil(1.4 * HZ / STEP);
  for (let a = 0; a < cand.length; a++) for (let b = 0; b < cand.length; b++) {
    if (a === b) continue;
    for (let j = MINSEG; j <= ns - MINSEG; j++) {
      const tot = pre[a][j] + (pre[b][ns] - pre[b][j]);
      if (tot > best.tot + gainMin && (!pair || tot > pair.tot)) pair = { a, b, j, tot };
    }
  }
  const shots = pair ? [{ m: cand[pair.a].m, f0: 0, f1: pair.j * STEP }, { m: cand[pair.b].m, f0: pair.j * STEP, f1: n }] : [{ m: best.m, f0: 0, f1: n }];
  return { shots, score: (pair ? pair.tot : best.tot) / wsum, mounts: mounts.length };
}
function angleBetween(ax, ay, az, bx, by, bz) { const d = (ax * bx + ay * by + az * bz) / ((Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)) || 1); return Math.acos(clamp(d, -1, 1)); }

/** A pan-tilt-zoom head on a fixed mount. step(dt, F, i, aspect, push) moves toward the framing for tape frame i. */
export class Ptz {
  constructor() { this.m = { x: 0, y: 0, z: 0 }; this.pan = 0; this.tilt = -0.3; this.fov = 0.6; this.vp = 0; this.vt = 0; this.vf = 0; this.rate = 0; this.tg = {}; }
  /** Fix the head on a mount and point it straight at the frame (a hard cut; no easing from the last view). */
  mount(m, F, i, aspect) { this.m = m; aimFor(m, F, i, aspect, this.tg, 0); this.pan = this.tg.pan; this.tilt = this.tg.tilt; this.fov = this.tg.fov; this.vp = this.vt = this.vf = 0; this.rate = 0; }
  step(dt, F, i, aspect, push = 0) {
    const g = aimFor(this.m, F, i, aspect, this.tg, push), W = 5.2, Z = 0.62, h = Math.min(dt, 1 / 30);
    for (let k = 0, n = Math.max(1, Math.round(dt / h)); k < n; k++) {
      const e = wrap(g.pan - this.pan);
      this.vp += (W * W * e - 2 * Z * W * this.vp) * h; this.vp = clamp(this.vp, -PAN_RATE, PAN_RATE); this.pan += this.vp * h;
      this.vt += (W * W * (g.tilt - this.tilt) - 2 * Z * W * this.vt) * h; this.vt = clamp(this.vt, -PAN_RATE, PAN_RATE); this.tilt += this.vt * h;
      const lf = Math.log(this.fov), le = Math.log(g.fov) - lf, WZ = g.fov > this.fov ? 4.2 : 2.6;      // zooms out briskly (so nothing leaves the frame), in slowly
      this.vf += (WZ * WZ * le - 2 * WZ * this.vf) * h; this.fov = Math.exp(lf + this.vf * h);
    }
    this.fov = clamp(this.fov, FMIN * 0.9, FMAX * 1.02); this.tilt = clamp(this.tilt, TILT_MIN - 0.05, 1.2);
    this.rate = Math.hypot(this.vp * Math.cos(this.tilt), this.vt);
    return this;
  }
  /** Unit forward vector. */
  fwd(o = {}) { const c = Math.cos(this.tilt); o.x = Math.sin(this.pan) * c; o.y = Math.sin(this.tilt); o.z = Math.cos(this.pan) * c; return o; }
  /** Normalised device coordinates of a world point (x, y in -1..1 when inside the frame), null when behind. */
  project(x, y, z, aspect, o = {}) {
    const f = this.fwd({}), dx = x - this.m.x, dy = y - this.m.y, dz = z - this.m.z, zc = dx * f.x + dy * f.y + dz * f.z; if (zc < 0.1) return null;
    let rx = -f.z, rz = f.x; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
    const ux = -rz * f.y, uy = rz * f.x - rx * f.z, uz = rx * f.y, xc = dx * rx + dz * rz, yc = dx * ux + dy * uy + dz * uz, t = Math.tan(this.fov / 2);
    o.x = xc / zc / (t * aspect); o.y = yc / zc / t; return o;
  }
}
