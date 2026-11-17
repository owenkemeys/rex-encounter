// Route planning over the actual ground: rock is impassable (inflated by the animal's bulk),
// steep ground costs more the steeper it is and is impassable past what a six-tonne biped
// would climb. Planned on a 2 m grid with A*, then pulled taut so the animal walks smooth
// lines instead of grid zigzags. Rebuilt when the ground is reshaped.
import { clamp } from '../math.js';

const CELL = 2, BODY = 2.6, MAXSLOPE = 0.62, SOFTSLOPE = 0.18, FOOTDROP = 1.9;
const ringOf = (body) => Array.from({ length: 8 }, (_, a) => [Math.sin(a * Math.PI / 4) * body, Math.cos(a * Math.PI / 4) * body]);

/** The world's fence, as one rectangle {x0, x1, z0, z1} in any place (not only round the origin): `T.rect` when the world gives
 *  one, else the square `T.bound` (its half-size), else null (the old round paddock, radius `T.arena`). */
export const rectOf = (T) => T.rect || (T.bound ? { x0: -T.bound, x1: T.bound, z0: -T.bound, z1: T.bound } : null);
/** Inside the world's fence, `m` metres in from it (m < 0: that far outside it still counts). Round paddock: radius arena + 10. */
const outside = (T, x, z, m) => { const r = rectOf(T); return r ? x < r.x0 - m || x > r.x1 + m || z < r.z0 - m || z > r.z1 + m : Math.hypot(x, z) > T.arena + 10 + m; };

/** What the body can pass and where it can turn, measured off the body itself: a throwaway copy of it (the same species) stands
 *  and walks on an empty floor whose `pushOut` only records what the body asks of it, i.e. the trunk's own collision parts
 *  (centre, radius) that `Creature._bodyCollide` keeps out of walls. No hand-entered sizes:
 *    pass : the trunk's half-width (the widest part's sideways reach from the body's line): a lane narrower than twice this it
 *           cannot get through at all; anything wider it can shoulder through
 *    room : the radius the stiff trunk (hips to neck root; the tail bends) sweeps turning about its own middle: with less than this
 *           round it, it can walk along but not turn round, so it is a cost on the route, not a wall
 *  Cached per species. */
export function bodyRoom(sim) {
  const sp = sim.species, cache = bodyRoom._c || (bodyRoom._c = new Map());
  if (cache.has(sp)) return cache.get(sp);
  const parts = [], flat = { height: () => 0, base: () => 0, normal: (x, z, o) => o.set(0, 1, 0), size: 400, arena: 1e9, pushOut: (q, r) => { parts.push([q.x, q.z, r]); return [0, 0]; } };
  const b = new sim.constructor(flat, { species: sp, seed: 1 });
  // walking straight (how it goes through a lane): its widest reach either side of its line, over a few strides
  let lo = Infinity, hi = -Infinity, L = Infinity, Rt = -Infinity; const rel = [];
  for (let i = 0; i < 480; i++) {
    parts.length = 0; b.step(1 / 120, { goal: i < 60 ? null : { kind: 'drive', throttle: 1, steer: 0 }, pace: 2, attention: null }); b.events.length = 0;
    if (i < 360 || i % 10) continue;
    const fx = Math.sin(b.psi), fz = Math.cos(b.psi);
    for (const [x, z, r] of parts) { const ah = (x - b.x) * fx + (z - b.z) * fz, lat = -(x - b.x) * fz + (z - b.z) * fx; L = Math.min(L, lat - r); Rt = Math.max(Rt, lat + r); lo = Math.min(lo, ah); hi = Math.max(hi, ah); rel.push([ah, lat, r]); }
  }
  const pass = (Rt - L) / 2, mid = (lo + hi) / 2, mlat = (Rt + L) / 2; let room = pass;
  for (const [ah, lat, r] of rel) room = Math.max(room, Math.hypot(ah - mid, lat - mlat) + r);
  const out = rel.length ? { pass, room } : { pass: BODY, room: BODY };
  cache.set(sp, out); return out;
}

export class Nav {
  /** body: the radius its bulk needs kept clear of anything solid when it plans a route. A number (the species' `navBody`, or a
   *  world's override) is a hard radius with no squeeze band, as before; anything else means "measure the body" (`fit`, called
   *  by the mind with `bodyRoom(sim)`; until then 2.6).
   *  The grid covers the world's rectangle wherever it lies (`T.rect`), else a square round the origin of half-size arena + 14. */
  constructor(terrain, body = null) {
    this.T = terrain; this.ver = -1; this.fixed = typeof body === 'number'; this.body = this.fixed ? body : BODY; this.room = this.body; this.ring = ringOf(this.body);
    const r = terrain.rect;
    if (r) { this.ox = (r.x0 + r.x1) / 2; this.oz = (r.z0 + r.z1) / 2; this.R = Math.max(r.x1 - r.x0, r.z1 - r.z0) / 2 + 14; }
    else { this.ox = 0; this.oz = 0; this.R = terrain.arena + 14; }
    this.n = Math.ceil((2 * this.R) / CELL);
  }
  /** Take the body's own measure (bodyRoom): the hard radius becomes what the trunk cannot pass, and between that and its turning
   *  room a cell costs more the tighter it is (a squeeze), so it keeps to open ground and shoulders through a lane only when the
   *  way round is much longer. Ignored when a fixed radius was given. */
  fit({ pass, room }) { if (this.fixed) return this; this.body = pass; this.room = Math.max(pass, room); this.ring = ringOf(pass); this.ver = -1; return this; }

  _build() {
    const T = this.T, n = this.n, R = this.R, ox = this.ox, oz = this.oz, BODY = this.body, ROOM = this.room, SQ = ROOM - BODY, RING = this.ring, cost = this.cost = new Float32Array(n * n), clr = new Float32Array(n * n).fill(3 + SQ);
    // rock, trunks and walls, stamped: blocked inside the trunk's half-width; between that and its turning room a squeeze (steep
    // cost); a clearance cost within 3 m beyond the turning room (clr: free distance past the trunk's half-width)
    for (const o of T.navBlocks ? T.obstacles.concat(T.navBlocks) : T.obstacles) {      // props: overhead things the body cannot pass under count as solid
      const reach = o.r + ROOM + 3, i0 = Math.max(0, Math.floor((o.x - ox - reach + R) / CELL)), i1 = Math.min(n - 1, Math.floor((o.x - ox + reach + R) / CELL)), j0 = Math.max(0, Math.floor((o.z - oz - reach + R) / CELL)), j1 = Math.min(n - 1, Math.floor((o.z - oz + reach + R) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const d = Math.hypot(ox - R + (i + 0.5) * CELL - o.x, oz - R + (j + 0.5) * CELL - o.z) - o.r - BODY, k = i + n * j; if (d < clr[k]) clr[k] = d; }
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = ox - R + (i + 0.5) * CELL, z = oz - R + (j + 0.5) * CELL, k = i + n * j;
      let c = 1;
      if (outside(T, x, z, 0) || clr[k] < 0) c = Infinity;
      if (c < Infinity) {
        const e = 1.5, h0 = T.height(x, z), g = Math.hypot(T.height(x + e, z) - T.height(x - e, z), T.height(x, z + e) - T.height(x, z - e)) / (2 * e);
        // the ground under its whole footprint: a slot narrower than the body, or a knife-edge, is no way for it however level its floor or crest
        let rim = 0; for (let a = 0; a < 8; a++) { const dh = Math.abs(T.height(x + RING[a][0], z + RING[a][1]) - h0); if (dh > rim) rim = dh; }
        if (g > MAXSLOPE || rim > FOOTDROP) c = Infinity; else c += 14 * Math.max(0, g - SOFTSLOPE) ** 1.5 * 10;
        if (c < Infinity && clr[k] < SQ) c += 3 + 9 * ((SQ - clr[k]) / SQ) ** 2;      // a squeeze: it fits, but cannot turn round in it
        if (c < Infinity && clr[k] < 3 + SQ) c += (3 + SQ - clr[k]) * 0.6;   // prefer some clearance
        if (c < Infinity && T.depthAt) c += Math.min(2.5, T.depthAt(x, z) * 2.2) + (T.surfaceAt && T.surfaceAt(x, z) === 'mud' ? 1.2 : 0);      // wading is slow
      }
      cost[k] = c;
    }
    // connected regions, so a goal it cannot reach becomes the nearest place it can
    const comp = this.comp = new Int32Array(n * n).fill(-1), st = new Int32Array(n * n); let nc = 0;
    for (let k0 = 0; k0 < n * n; k0++) {
      if (comp[k0] >= 0 || cost[k0] === Infinity) continue;
      let top = 0; st[top++] = k0; comp[k0] = nc;
      while (top) {
        const k = st[--top], i = k % n, j = (k / n) | 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const a = i + di, b = j + dj; if ((!di && !dj) || a < 0 || b < 0 || a >= n || b >= n) continue;
          const q = a + n * b; if (comp[q] >= 0 || cost[q] === Infinity) continue;
          if (di && dj && (cost[a + n * j] === Infinity || cost[i + n * b] === Infinity)) continue;
          comp[q] = nc; st[top++] = q;
        }
      }
      nc++;
    }
    this.ver = this._ver();
  }
  _ver() { const T = this.T; return T.bumps.length + T.bumps.reduce((s, b) => s + b.x + b.z, 0) + (T.ver || 0) * 1e6; }      // reshaped ground, or something built
  _fresh() { if (this._ver() !== this.ver) this._build(); }
  cellOf(x, z) { return [clamp(Math.floor((x - this.ox + this.R) / CELL), 0, this.n - 1), clamp(Math.floor((z - this.oz + this.R) / CELL), 0, this.n - 1)]; }
  centre(i, j) { return [this.ox - this.R + (i + 0.5) * CELL, this.oz - this.R + (j + 0.5) * CELL]; }
  costAt(x, z) { this._fresh(); const [i, j] = this.cellOf(x, z); return this.cost[i + this.n * j] + this._soreAt(x, z); }
  /** Places marked as a bad way for a while (`sore`: [{x, z, r, c}], kept by whoever marks them: the mind, where its body got
   *  stuck): an extra cost, never a wall, so the planner goes another way if there is one and the same way if there is not. */
  _soreAt(x, z) { let c = 0; if (this.sore) for (const m of this.sore) if (Math.hypot(x - m.x, z - m.z) < m.r) c += m.c; return c; }

  /** True when a straight walk from a to b crosses nothing blocked and nothing much worse than open ground. */
  clear(x0, z0, x1, z1, tol = 1.6) {
    const d = Math.hypot(x1 - x0, z1 - z0), k = Math.max(2, Math.ceil(d / (CELL * 0.5)));
    for (let s = 0; s <= k; s++) { const c = this.costAt(x0 + (x1 - x0) * s / k, z0 + (z1 - z0) * s / k); if (c > tol * 1.0 + 0.6 || c === Infinity) return false; }
    return true;
  }

  /** Nearest reachable point to (x, z); with `from` given, nearest one in the same connected region as `from`. */
  nearestOpen(x, z, from = null) {
    this._fresh();
    const want = from ? this._compAt(from[0], from[1]) : -1;
    const ok = (k) => this.cost[k] < Infinity && (want < 0 || this.comp[k] === want);
    { const [i, j] = this.cellOf(x, z); if (ok(i + this.n * j)) return [x, z]; }
    const [ci, cj] = this.cellOf(x, z);
    for (let r = 1; r < (want < 0 ? 20 : this.n); r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= this.n || j >= this.n) continue;
      if (ok(i + this.n * j)) return this.centre(i, j);
    }
    return [x, z];
  }
  /** The connected region at (x, z) (the nearest open cell's, when it stands somewhere blocked). */
  _compAt(x, z) {
    const [ci, cj] = this.cellOf(x, z), n = this.n;
    for (let r = 0; r < 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= n || j >= n) continue;
      if (this.comp[i + n * j] >= 0) return this.comp[i + n * j];
    }
    return -1;
  }
  /** True when the animal can walk from a to b at all. */
  reachable(x0, z0, x1, z1) { this._fresh(); const a = this._compAt(x0, z0); return a >= 0 && a === this._compAt(x1, z1); }

  /** Walking distance (metres along open cells) from (x0, z0) to everywhere: one sweep, then `len(x, z)` for any number of goals
   *  (Infinity where it cannot get to). For choosing goals by how far they really are, not as the crow flies. */
  field(x0, z0) {
    this._fresh();
    const n = this.n, N = n * n, g = new Float64Array(N).fill(Infinity), done = new Uint8Array(N), [fx, fz] = this.nearestOpen(x0, z0, [x0, z0]), [si, sj] = this.cellOf(fx, fz), s = si + n * sj;
    const heap = [[0, s]]; g[s] = 0;
    const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, k] = pop(); if (done[k]) continue; done[k] = 1;
      const i = k % n, j = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const q = a + n * b; if (this.cost[q] === Infinity) continue;
        if (di && dj && (this.cost[a + n * j] === Infinity || this.cost[i + n * b] === Infinity)) continue;
        const nd = d + CELL * (di && dj ? 1.414 : 1) * (this.cost[q] >= 4 ? 1.5 : 1);      // (a squeeze counts as longer: it is slow going)
        if (nd < g[q]) { g[q] = nd; push(q, nd); }
      }
    }
    return { len: (x, z) => { const [i, j] = this.cellOf(x, z); return g[i + n * j]; } };
  }

  plan(x0, z0, x1, z1) {
    this._fresh();
    [x1, z1] = this.nearestOpen(x1, z1, [x0, z0]);
    if (this.clear(x0, z0, x1, z1)) return [{ x: x1, z: z1 }];
    const n = this.n, [si, sj] = this.cellOf(x0, z0), [gi, gj] = this.cellOf(x1, z1), N = n * n;
    const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const heap = []; const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return Math.max(dx, dz) + 0.414 * Math.min(dx, dz); };
    let sore = null;
    if (this.sore && this.sore.length) { sore = new Float32Array(N); for (const m of this.sore) { const [a0, b0] = this.cellOf(m.x - m.r, m.z - m.r), [a1, b1] = this.cellOf(m.x + m.r, m.z + m.r); for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) { const [cx, cz] = this.centre(a, b); if (Math.hypot(cx - m.x, cz - m.z) < m.r) sore[a + n * b] += m.c; } } }
    const s = si + n * sj, goal = gi + n * gj; g[s] = 0; push(s, h(si, sj));
    let it = 0;
    while (heap.length && it++ < 40000) {
      const [, k] = pop(); if (closed[k]) continue; closed[k] = 1; if (k === goal) break;
      const i = k % n, j = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const q = a + n * b, c = this.cost[q] + (sore ? sore[q] : 0); if (c === Infinity || closed[q]) continue;
        if (di && dj && (this.cost[a + n * j] === Infinity || this.cost[i + n * b] === Infinity)) continue;
        const ng = g[k] + c * (di && dj ? 1.414 : 1);
        if (ng < g[q]) { g[q] = ng; from[q] = k; push(q, ng + h(a, b)); }
      }
    }
    if (from[goal] < 0 && goal !== s) return [{ x: x1, z: z1 }];
    const cells = []; for (let k = goal; k !== -1 && k !== s; k = from[k]) cells.push(k); cells.reverse();
    const pts = cells.map((k) => { const [x, z] = this.centre(k % n, (k / n) | 0); return { x, z }; });
    if (!pts.length) return [{ x: x1, z: z1 }];
    pts[pts.length - 1] = { x: x1, z: z1 };
    // pull taut
    const out = []; let ax = x0, az = z0, idx = 0;
    while (idx < pts.length) {
      let far = idx;
      for (let k = pts.length - 1; k > idx; k--) if (this.clear(ax, az, pts[k].x, pts[k].z)) { far = k; break; }
      out.push(pts[far]); ax = pts[far].x; az = pts[far].z; idx = far + 1;
    }
    return out;
  }
}

// ---------------------------------------------------------------- bringing a sensor to a target
// Where can it put an eye, or its nostrils, so they have the target in a clear line, and how must it stand to get them there?
// Nothing here knows what a door, a window or a pipe is: sensor points are tried all round the target at every height from
// the ground to full reach, kept where the straight line to the target is clear of every collider (so the openings are found
// from the geometry, whatever made them), and then a head pose is fitted to each (snout tip at the point, or one eye at it with
// the head turned to put the target on that side), checked against the colliders, entered along its own axis from a staging
// point outside, and carried by a neck that is long enough and inside its cone from a body that stands clear (hips, chest,
// feet, tail root) in one of the postures the body knows it has (`model` from Creature.selfModel: crouch depth -> neck root).
const AZ = 24, RADII = [0.45, 0.9, 1.5, 2.3, 3.3, 4.6, 5.6], HEIGHTS = [0.9, 1.1, 1.3, 1.75, 2.4, 3.2, 4.1, 5.0];
/** All at once (tests, tools). In the running animal use senseSpotsGen and step it a little each tick. */
export function senseSpots(T, model, P, from, opt = {}) { const g = senseSpotsGen(T, model, P, from, opt); for (;;) { const r = g.next(); if (r.done) return r.value; } }
/** The same search as a generator: it yields every few candidates so the work is spread over ticks; returns the spots. */
export function* senseSpotsGen(T, model, P, from, opt = {}) {
  const { postures, neckLen, headLen, reach, cone, eye } = model, avoid = opt.avoid || [];
  let work = 0;
  const hit = (x, y0, y1, z, r, wallsFull) => {
    work++;
    for (const c of T.near(x, z, r + 0.1)) { if (c.bot !== undefined ? (y1 < c.bot || y0 > c.top) : (y0 > c.top && !(wallsFull && c.kind === 'wall'))) continue; if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true; }
    return false;
  };
  // what the head must keep off (a person: the body holds its head this far from one, Creature._head's keepOut), as vertical
  // capsules round the target; the same points of the head are tested as the body tests
  const keep = opt.keep || [];
  const keepOK = (Hx, Hy, Hz, f, u) => {
    for (const K of keep) for (const [a, b] of [[1.75, 0.1], [0.9, -0.6], [0, 0], [1.2, -0.3]]) {
      const x = Hx + f[0] * a + u[0] * b, y = Hy + f[1] * a + u[1] * b, z = Hz + f[2] * a + u[2] * b, dy = y < K.y0 ? K.y0 - y : y > K.y1 ? y - K.y1 : 0;
      if (Math.hypot(x - K.x, dy, z - K.z) < K.r) return false;
    }
    return true;
  };
  const skullOK = (Hx, Hy, Hz, f, inflate) => {
    for (let k = 0; k <= 5; k++) { const u = k / 5 * headLen, x = Hx + f[0] * u, y = Hy + f[1] * u - 0.12, z = Hz + f[2] * u, r = 0.5 + (0.2 - 0.5) * k / 5 + inflate; if (y - r * 0.6 < T.height(x, z) || hit(x, y - r, y + r, z, r)) return false; }
    return true;
  };
  // where the body can walk from where it is (cells of the route grid joined to its own); a stance must be a short straight step
  // off one of them, so a place inside a walled pen is not taken for one outside it
  const nav = opt.nav;
  let reach0 = null;
  if (nav) {
    nav._fresh(); const n = nav.n, seen = new Uint8Array(n * n), [fx0, fz0] = nav.nearestOpen(from.x, from.z), [si, sj] = nav.cellOf(fx0, fz0), q = [si + n * sj]; seen[q[0]] = 1;      // (from open ground nearest to where it stands)
    for (let k = 0; k < q.length; k++) { const c = q[k], i = c % n, j = (c / n) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue; const e = a + n * b; if (!seen[e] && nav.cost[e] < Infinity) { seen[e] = 1; q.push(e); } } }
    reach0 = seen;
  }
  const wcache = new Map(), ring2 = []; for (let dj = -4; dj <= 4; dj++) for (let di = -4; di <= 4; di++) ring2.push([di, dj]);      // up to 8 m off the open ground, by a straight clear step (a body-wide line) ring2.sort((p, q) => Math.hypot(...p) - Math.hypot(...q));
  // and the ground along that step has no rise or drop a six-tonne biped could not take in its stride (a ledge on a cliff face,
  // a knife-edge, the top of a wall of rock is not a place to stand however clear the air above it is)
  const stepsOK = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(L / 0.5)); let h0 = T.height(ax, az); for (let i = 1; i <= k; i++) { const h1 = T.height(ax + (bx - ax) * i / k, az + (bz - az) * i / k); if (Math.abs(h1 - h0) > 0.55) return false; h0 = h1; } return true; };
  const walkable = (x, z) => {
    if (!nav) return true;
    const [ci, cj] = nav.cellOf(x, z), n = nav.n, key = Math.round(x * 2) * 100003 + Math.round(z * 2);      // half-metre bins
    if (nav.cost[ci + n * cj] < Infinity) return !!reach0[ci + n * cj];      // open ground: walkable if joined to where it is
    if (wcache.has(key)) return wcache.get(key);
    let ok = false, k = 0;
    for (const [di, dj] of ring2) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= n || j >= n || !reach0[i + n * j]) continue;
      const [cx, cz] = nav.centre(i, j), g = T.height(x, z); work += 4;
      if (T.segClear(cx, T.height(cx, cz) + 1.2, cz, x, g + 1.2, z, 0.9) && stepsOK(cx, cz, x, z)) { ok = true; break; }
      if (++k >= 6) break;
    }
    wcache.set(key, ok); return ok;
  };
  // sensor points with a clear line to the target, nearest first
  // (a coarse ring of directions first; then the directions either side of any that saw out at some distance, finer, since a
  // long narrow way in, a pipe or a slot, is open over only a few degrees)
  const Es = [], ring = (a) => { const sa = Math.sin(a), ca = Math.cos(a); let far = false;
    for (const r of RADII) for (const hh of HEIGHTS) {
      const x = P.x + sa * r, z = P.z + ca * r, y = T.height(x, z) + hh;
      if (!T.segClear(x, y, z, P.x, P.y, P.z, 0.04)) continue;
      Es.push({ x, y, z, d: Math.hypot(x - P.x, y - P.y, z - P.z) }); if (r >= 2.3) far = true;
    }
    return far; };
  const open = [];
  for (let ai = 0; ai < AZ; ai++) { if (ring((ai / AZ) * Math.PI * 2)) open.push(ai); if (ai % 4 === 3) yield; }
  for (const ai of open) for (const k of [-0.5, -0.25, 0.25, 0.5]) { if (open.includes(ai + Math.sign(k)) && Math.abs(k) === 0.5) continue; ring(((ai + k) / AZ) * Math.PI * 2); }
  yield;
  Es.sort((p, q) => p.d - q.d);
  const out = [], f = [0, 0, 0], l = [0, 0, 0], u = [0, 0, 0];
  let lastY = 0;
  for (const E of Es) {
    if (opt.maxDist && E.d > opt.maxDist) break;
    if (out.length >= (opt.max || 40) || work > (opt.budget || 200000)) break;
    const Dx = P.x - E.x, Dy = P.y - E.y, Dz = P.z - E.z, Dl = Math.hypot(Dx, Dy, Dz) || 1, hb = Math.atan2(Dx, Dz), pe = Math.asin(Dy / Dl);
    for (const [s, turn] of [[0, 0], [1, 0.55], [-1, 0.55], [1, 1.15], [-1, 1.15]]) {
      if (s === 0 && opt.eyeOnly) continue;
      if (work - lastY > 2500) { lastY = work; yield; }
      // the head pose: snout tip at E pointing at the target, or one eye at E with the head turned off the line (a little, or
      // side-on to put a lateral eye to a narrow slot)
      const yaw = s === 0 ? hb : hb - s * turn, pitch = s === 0 ? Math.max(-0.85, Math.min(0.45, pe)) : Math.max(-0.4, Math.min(0.3, pe));
      const sy = Math.sin(yaw), cy = Math.cos(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
      f[0] = sy * cp; f[1] = sp; f[2] = cy * cp; l[0] = cy; l[1] = 0; l[2] = -sy; u[0] = -sy * sp; u[1] = cp; u[2] = -cy * sp;
      let Hx, Hy, Hz;
      if (s === 0) { Hx = E.x - f[0] * headLen; Hy = E.y - f[1] * headLen; Hz = E.z - f[2] * headLen; }
      else { Hx = E.x - f[0] * eye.z - l[0] * s * eye.x - u[0] * eye.y; Hy = E.y - f[1] * eye.z - u[1] * eye.y; Hz = E.z - f[2] * eye.z - l[2] * s * eye.x - u[2] * eye.y; }
      const why = opt.why || {}; const W = (k) => { why[k] = (why[k] || 0) + 1; };
      if (Hy < T.height(Hx, Hz) + 0.85) { W('jaw'); continue; }      // the lower jaw hangs 0.8 m under the skull
      if (!keepOK(Hx, Hy, Hz, f, u)) { W('keep'); continue; }
      // first the cheap part: is there a posture and a neck reach that can carry a head here at all (lengths and the cone only)
      // the body faces the target, or stands a little across it (room for the tail, a wall behind) with the neck turned
      const cand = [], Lt = 0.5 * (reach[0] + reach[1]) * neckLen;      // the neck at a comfortable length: how far behind the head its root is
      for (const off of [0, 0.4, -0.4, 0.8, -0.8]) {
      const psi = hb + off, fx = Math.sin(psi), fz = Math.cos(psi);
      { let dyaw = yaw - psi; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw)); if (Math.abs(dyaw) > model.yawMax - 0.2) continue; }
      for (const q of postures) for (let it = 0, g = T.height(Hx - fx * (1 + q.f), Hz - fz * (1 + q.f)); it < 1; it++) {
        const dy = Hy - (g + q.y); if (Math.abs(dy) >= Lt) continue;
        const hr = Math.sqrt(Lt * Lt - dy * dy); if (hr < 0.35) continue;
        const nx = Hx - fx * hr, nz = Hz - fz * hr, Bx = nx - fx * q.f, Bz = nz - fz * q.f; g = T.height(Bx, Bz); const ny = g + q.y;
        const vx = Hx - nx, vy = Hy - ny, vz = Hz - nz, L = Math.hypot(vx, vy, vz);
        if (L < reach[0] * neckLen || L > reach[1] * neckLen) continue;
        const ce = Math.cos(q.elev), se = Math.sin(q.elev), cosA = (vx * fx * ce + vy * se + vz * fz * ce) / L;
        if (cosA < Math.cos(cone)) continue;
        if (opt.trace) opt.trace(E, s, q.low, 'cand', { L: Math.hypot(vx, vy, vz) / neckLen, cone: Math.acos(cosA), walk: walkable(Bx, Bz) });
        if (outside(T, Bx, Bz, -1) || !walkable(Bx, Bz)) continue;      // (cached: cheap after the first in each half metre)
        cand.push({ q, hr, nx, nz, ny, Bx, Bz, g, vx, vy, vz, fx, fz, psi, off });
      }
      }
      cand.sort((p, q) => Math.abs(p.off) - Math.abs(q.off) || p.q.low - q.q.low);
      if (!cand.length) { W('reach'); continue; }
      if (!skullOK(Hx, Hy, Hz, f, 0.04)) { W('skull'); continue; }
      // entered along its own axis: from a staging point far enough back that the whole skull is clear of everything with room
      // above it (so the head can come down onto the axis there), straight in; every point of that way must be clear too
      let back = 0;
      for (let b = 0.3; b <= 3.61; b += 0.3) {
        if (!skullOK(Hx - f[0] * b, Hy - f[1] * b, Hz - f[2] * b, f, 0.02)) { back = -1; break; }
        if (skullOK(Hx - f[0] * b, Hy - f[1] * b + 1.0, Hz - f[2] * b, f, 0.06) && skullOK(Hx - f[0] * b, Hy - f[1] * b, Hz - f[2] * b, f, 0.1)) { back = b; break; }
      }
      if (back <= 0) { W('way'); continue; }
      // a neck and a body to carry it, clear of everything, standing where it can walk to: the lowest posture that works
      let best = null;
      for (const { q, hr, nx, nz, ny, Bx, Bz, g, vx, vy, vz, fx, fz, psi, off } of cand) {
        let ok = true;
        for (const k of [0.3, 0.6, 0.85]) { const x = nx + vx * k, y = ny + vy * k, z = nz + vz * k; if (hit(x, y - 0.42, y + 0.42, z, 0.42)) { ok = false; break; } }
        if (!ok) { W('neck'); if (opt.trace) opt.trace(E, s, q.low, 'neck'); continue; }
        const lx = fz, lz = -fx;
        // the same parts the body is kept out of things with (Creature._bodyCollide), a little fatter: pelvis to the ground, the
        // back, the chest at the neck's root; then the feet and the root of the tail
        const parts = [[Bx, Bz, 1.1, g - 1, g + q.hip + 0.7], [Bx + fx * 1.15, Bz + fz * 1.15, 1.2, g + q.hip - 0.6, g + q.hip + 1.2], [Bx + fx * q.f, Bz + fz * q.f, 1.15, ny - 1.0, ny + 0.6],
          [Bx + lx * 0.62 + fx * 0.15, Bz + lz * 0.62 + fz * 0.15, 0.45, g, g + 1.4], [Bx - lx * 0.62 + fx * 0.15, Bz - lz * 0.62 + fz * 0.15, 0.45, g, g + 1.4], [Bx - fx * 1.6, Bz - fz * 1.6, 0.65, g + 1.8, g + q.hip + 0.6]];
        for (const [x, z, r, y0, y1] of parts) if (hit(x, y0, y1, z, r, true)) { ok = false; break; }
        if (!ok) { W('body'); continue; }
        // and the tail, here and at the lining-up stance further back (it swings a little: a fat margin)
        for (const bk of [0, back + 0.15]) { for (let k = 1; k <= 5 && ok; k++) { const u = k / 5, d = 1.2 + u * (model.tailLen || 5.5) * 0.95, r = 0.75 - 0.5 * u + 0.25, x = Bx - fx * (d + bk), z = Bz - fz * (d + bk), gy = T.height(x, z); if (hit(x, gy + q.hip - 1.6 * u - 0.3, gy + q.hip + 0.6, z, r)) ok = false; } if (!ok) break; }
        if (!ok) { W('tail'); continue; }
        { const bx = Bx - fx * (back + 0.15), bz = Bz - fz * (back + 0.15), gb = T.height(bx, bz); if (hit(bx, gb - 1, gb + q.hip + 0.7, bz, 1.1, true) || !walkable(bx, bz)) { W('lineup'); continue; } }
        best = { q, Bx, Bz, hr, psi, off }; break;
      }
      if (!best) continue;
      let pen = 0; for (const A of avoid) if (Math.hypot(A.x - E.x, A.y - E.y, A.z - E.z) < 1.0 && A.s === s) pen += A.w ?? 4;
      const walk = Math.hypot(best.Bx - from.x, best.Bz - from.z);
      const score = E.d + 0.45 * best.q.low + 0.3 * Math.abs(best.off) + 0.05 * walk + (s ? 0.25 : 0) + pen + (opt.bias ? opt.bias(E, s) : 0);
      out.push({ kind: s ? 'eye' : 'nose', eye: s, E: { x: E.x, y: E.y, z: E.z }, H: { x: Hx, y: Hy, z: Hz }, d: { x: f[0], y: f[1], z: f[2] }, low: best.q.low, B: { x: best.Bx, z: best.Bz }, yaw: best.psi, back: back + 0.15, score, dist: E.d,
        key: `${s}:${E.x.toFixed(1)}:${E.y.toFixed(1)}:${E.z.toFixed(1)}`, shape: shapeAt(T, E, Dx / Dl, Dy / Dl, Dz / Dl, hit) });
    }
  }
  return out.sort((p, q) => p.score - q.score);
}
/** What the way in looks like where the sensor goes: free width across it and height over it, and whether it is roofed, low
 *  to the ground, narrow, tall. For the thoughts: a perceived shape, not a kind of structure. */
function shapeAt(T, E, dx, dy, dz, hit) {
  const hl = Math.hypot(dx, dz) || 1, ax = -dz / hl, az = dx / hl;
  const free = (sx, sy, sz, max) => { let w = 0; for (; w < max; w += 0.15) if (hit(E.x + sx * w, E.y + sy * w - 0.05, E.y + sy * w + 0.05, E.z + sz * w, 0.05)) break; return w; };
  const width = free(ax, 0, az, 3) + free(-ax, 0, -az, 3), up = free(0, 1, 0, 3), g = E.y - T.height(E.x, E.z), height = up + Math.min(g, 3);
  return { width: +width.toFixed(2), height: +height.toFixed(2), roofed: up < 3, low: E.y - T.height(E.x, E.z) < 1.6, narrow: width < 1.6, tall: height > 2.4, under: up < 1.2 };
}
/** The planner from a Nav (the animal reaches it through sim.nav): see senseSpotsGen. */
Nav.prototype.senseGen = function (model, P, from, opt) { return senseSpotsGen(this.T, model, P, from, { nav: this, ...opt }); };
