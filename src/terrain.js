import { makeRng } from './math.js';
import { makePaddock } from './paddock.js';

// Deterministic uneven ground. Pure function of (x, z) so the simulation and the
// renderer (and, later, any other peer) agree on it without sharing state.

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

export function makeTerrain(seed = 7, paddockOverride = null) {
  const T = {};
  const bumps = [];     // edits made at run time (mounds and pits); part of the shared world state
  // the paddock as a designed place (src/paddock.js): ridge, gully, pond, wood, crags, meadow; static ground baked per seed
  const PD = paddockOverride || makePaddock(seed);
  const base = PD.ground;
  const logs = PD.logs.map((L) => ({ ...L }));       // fallen trunks: part of the ground, so feet step onto and over them (one wedged across the slot is a bridge)
  const LG = 8, lgrid = new Map();
  for (const L of logs) {
    const ex = Math.abs(L.cx) * (L.half + L.r) + L.r, ez = Math.abs(L.cz) * (L.half + L.r) + L.r;
    for (let i = Math.floor((L.x - ex) / LG); i <= Math.floor((L.x + ex) / LG); i++) for (let j = Math.floor((L.z - ez) / LG); j <= Math.floor((L.z + ez) / LG); j++) { const k = i * 4096 + j; (lgrid.get(k) || lgrid.set(k, []).get(k)).push(L); }
  }
  const height = (x, z) => {
    let h = base(x, z);
    const Ls = lgrid.get(Math.floor(x / LG) * 4096 + Math.floor(z / LG));
    if (Ls) for (const L of Ls) {
      const dx = x - L.x, dz = z - L.z, a = dx * L.cx + dz * L.cz; if (Math.abs(a) > L.half + L.r) continue;
      const b = dx * L.cz - dz * L.cx;
      if (L.bridge) { if (Math.abs(a) <= L.half && Math.abs(b) < L.r) { const y = L.y0 + (L.y1 - L.y0) * (a / L.half + 1) / 2 + L.r * 0.92 * Math.sqrt(1 - b * b / (L.r * L.r)); if (y > h) h = y; } continue; }
      const e = Math.max(0, Math.abs(a) - L.half), d2 = b * b + e * e;
      if (d2 < L.r * L.r) h += L.r * 0.92 * Math.sqrt(1 - d2 / (L.r * L.r)) + L.lift;
    }
    for (const b of bumps) { const d2 = (x - b.x) * (x - b.x) + (z - b.z) * (z - b.z); if (d2 < b.r * b.r * 6) h += b.h * Math.exp(-d2 / (b.r * b.r)); }
    return h;
  };
  const addBump = (x, z, h, r) => { bumps.push({ x, z, h, r }); if (bumps.length > 60) bumps.shift(); };
  const normal = (x, z, out) => {
    const e = 0.35;
    const dx = (height(x + e, z) - height(x - e, z)) / (2 * e);
    const dz = (height(x, z + e) - height(x, z - e)) / (2 * e);
    const inv = 1 / Math.hypot(dx, 1, dz);
    out.x = -dx * inv; out.y = inv; out.z = -dz * inv;
    return out;
  };
  // cover: boulder outcrops and a few fallen trunks inside the paddock (shared world state, so the
  // animal's senses and the renderer agree on what blocks a line of sight)
  const obstacles = [...PD.rocks.map((o) => ({ ...o })), ...PD.trees.map((o) => ({ ...o }))];     // outcrops, the Tumble, the Crags; the Wood's trunks and the lone trees
  // fern brakes: low cover a crouching person disappears into (tall grass and reeds are PD.grass)
  const cover = PD.cover.map((c) => ({ ...c }));
  // structures: built from the arena's placed things (paddock.js `things`, schema at the top of that file). Walls and overhead
  // runs are chains of short pillars on the collider list (walls also on the obstacle list, so routing, sight, throws and the
  // belief all respect them); door leaves are moving pillar chains (terrain.doors, stepped by the arena).
  const structures = [], roofs = [], solids = [];
  const PIL = 0.75;      // pillar spacing along a wall
  const wall = (S, ax, az, bx, bz, r, h, mat) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / PIL)), seg = { ax, az, bx, bz };      // the run as one smooth slab, for parts that slide along it
    for (let i = 0; i <= n; i++) obstacles.push({ x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n, r, h, kind: 'wall', sid: S.id, seed: 0, seg });
    S.walls.push({ ax, az, bx, bz, t: r * 2, h, mat });
  };
  // an overhead run (a lintel, a pipe's crown, a roof beam): solid only between y0 and y1 above the structure's base, so a head
  // can pass under it and not through it. Colliders only (routing and the person walk under it).
  const slabCols = [];
  const slab = (S, ax, az, bx, bz, r, y0, y1, mat) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / PIL)), seg = { ax, az, bx, bz };
    for (let i = 0; i <= n; i++) slabCols.push({ x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n, r, bot: S.base + y0, top: S.base + y1, kind: 'wall', sid: S.id, seg });
    (S.slabs || (S.slabs = [])).push({ ax, az, bx, bz, t: r * 2, y0, y1, mat });
  };
  const local = (S, lx, lz) => [S.cx + lx * Math.cos(S.yaw) + lz * Math.sin(S.yaw), S.cz - lx * Math.sin(S.yaw) + lz * Math.cos(S.yaw)];
  const baseOf = (S, hw, hd) => Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([i, j]) => base(...local(S, i * hw, j * hd))));
  const byKey = new Map();
  // a floor up off the ground (every way in is up: `up` openings): you are in it only when you are up there. Those first (the
  // loft is inside the barn: up there you are in the loft, not the barn). Read off the openings, not the kind.
  const raisedOf = (D) => D.openings.length > 0 && D.openings.every((o) => o.up);
  for (const D of [...PD.structures].sort((a, b) => raisedOf(b) - raisedOf(a))) {
    const S = { kind: D.kind, key: D.id, name: D.name, id: 0, cx: D.cx, cz: D.cz, yaw: D.yaw, hw: D.hw, hd: D.hd, h: D.h, base: D.base, walls: [], openings: D.openings.map((o) => ({ ...o })), blockout: true };
    if (raisedOf(D)) S.floor = Math.min(...D.openings.map((o) => o.y)) - 0.8;      // the floor: its ways in are at the floor plus a person's middle
    for (const k of ['ladder', 'ladders', 'hide', 'crouch', 'mat']) if (D[k] !== undefined) S[k] = D[k];
    if (D.walkIn) { S.id = 100 + solids.length; solids.push(S); } else { structures.push(S); S.id = structures.length; }
    if (D.roof) { S.roof = { y: D.base + D.roof }; roofs.push(S); }
    if (D.roofPanel) roofs.push({ roof: { y: D.base + D.h }, cx: D.cx, cz: D.cz, yaw: D.yaw, hw: D.hw - 0.3, hd: D.hd - 0.3 });
    if (D.roofs) for (const [a, b, c, d] of D.roofs) { const [x, z] = local(D, (a + c) / 2, (b + d) / 2); roofs.push({ roof: { y: D.base + D.h }, cx: x, cz: z, yaw: D.yaw, hw: (c - a) / 2 - 0.3, hd: (d - b) / 2 - 0.3 }); }
    byKey.set(D.id, S);
  }
  for (const S of structures) S.id = structures.indexOf(S) + 1;
  const doors = [], navBlocks = [];
  // props: solid things that are not walls of a structure. A pole is an upright cylinder (r, h) on the obstacle list like a tower leg
  // (kind 'wall', no seg: the body knocks against it and shoulders past); an 'upright' thin box (a ladder) is a short wall run; an
  // 'overhead' box (a catwalk, a platform deck) is a slab chain solid from its underside (th.y - 0.1) to its top plus `rail`, and, being
  // lower than the animal is tall (NAV_HEAD), also a pillar the route planner keeps clear (navBlocks, read by nav.js).
  const NAV_HEAD = 3.6;
  const run = (th, sid) => { const hl = th.l / 2, ax = th.x - Math.sin(th.yaw) * hl, az = th.z - Math.cos(th.yaw) * hl, bx = th.x + Math.sin(th.yaw) * hl, bz = th.z + Math.cos(th.yaw) * hl, r = th.w / 2, n = Math.max(1, Math.round(th.l / PIL)), seg = { ax, az, bx, bz };
    for (let i = 0; i <= n; i++) obstacles.push({ x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n, r, h: th.h, top: th.y + th.h, kind: 'wall', sid, seed: 0, seg }); };
  const overheadBox = (th, S) => {      // overhead box: runs along local z across its width, each as wide as its spacing
    const nw = Math.max(1, Math.ceil(th.w / (2 * PIL))), r = th.w / nw / 2, y0 = th.y - 0.1, y1 = th.y + th.h + (th.rail || 0), c = Math.cos(th.yaw), s = Math.sin(th.yaw);
    for (let k = 0; k < nw; k++) {
      const off = -th.w / 2 + r + k * 2 * r, ox = off * c, oz = -off * s, hl = Math.max(0, th.l / 2 - r), ax = th.x + ox - s * hl, az = th.z + oz - c * hl, bx = th.x + ox + s * hl, bz = th.z + oz + c * hl, L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / PIL)), seg = { ax, az, bx, bz };
      for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; slabCols.push({ x, z, r, bot: y0, top: y1, kind: 'wall', sid: S.id, seg }); if (y0 - height(x, z) < NAV_HEAD) navBlocks.push({ x, z, r }); }
    }
  };
  for (const th of PD.things) {
    if (th.kind === 'pole' && !th.visualOnly) { obstacles.push({ x: th.x, z: th.z, r: th.r, h: th.h, top: th.y + th.h, kind: 'wall', sid: byKey.get(th.of)?.id ?? 0, seed: 0 }); continue; }
    const S = byKey.get(th.of); if (!S || th.visualOnly) continue;
    if (th.collide === 'upright') { run(th, S.id); continue; }
    if (th.collide === 'overhead') { overheadBox(th, S); continue; }
    if (th.kind === 'wall') { const r = th.w / 2, top = th.y + th.h; S.base0 = S.base; const n0 = obstacles.length; wall(S, th.ax, th.az, th.bx, th.bz, r, th.h, th.mat); for (const o of obstacles.slice(n0)) o.top = top; }
    else if (th.kind === 'slab') slab(S, th.ax, th.az, th.bx, th.bz, th.w / 2, th.y - S.base, th.y + th.h - S.base, th.mat);
    else if (th.kind === 'post') obstacles.push({ x: th.x, z: th.z, r: th.r, h: th.h, top: th.y + th.h, kind: 'wall', sid: S.id, seed: 0 });
    else if (th.kind === 'door') doors.push({ id: th.id, gap: th.id.replace(/\.[lr]$/, ''), sid: S.id, of: th.of, ...th.door, ang: th.door.state === 'open' ? th.door.openYaw : th.door.closedYaw, cols: [], t: 0, moving: false, thudT: -9 });
  }
  /** The structure whose interior holds (x, y, z), if any: inside the walls, or up on the tower. */
  const insideStructure = (x, z, y = null) => {
    for (const S of structures) {
      const dx = x - S.cx, dz = z - S.cz, lx = dx * Math.cos(S.yaw) - dz * Math.sin(S.yaw), lz = dx * Math.sin(S.yaw) + dz * Math.cos(S.yaw);
      if (Math.abs(lx) < S.hw - 0.05 && Math.abs(lz) < S.hd - 0.05) { if (S.floor !== undefined) { if (y !== null && y > Math.min(S.base + 3, S.floor + 1)) return S; } else return S; }      // up on a raised floor: above the head of anyone standing under it, and up near the floor
    }
    return null;
  };
  /** True when a sight line passes through a roof. */
  const roofBlocks = (ax, ay, az, bx, by, bz) => {
    for (const S of roofs) {
      const y = S.roof.y; if ((ay - y) * (by - y) > 0) continue;
      const t = (y - ay) / (by - ay), x = ax + (bx - ax) * t, z = az + (bz - az) * t, dx = x - S.cx, dz = z - S.cz;
      const lx = dx * Math.cos(S.yaw) - dz * Math.sin(S.yaw), lz = dx * Math.sin(S.yaw) + dz * Math.cos(S.yaw);
      if (Math.abs(lx) < S.hw + 0.3 && Math.abs(lz) < S.hd + 0.3) return true;
    }
    return false;
  };
  const coverAt = PD.coverAt;      // ferns, tall grass and reeds, baked (O(1))
  // ---- colliders: the solid things exactly as they are drawn, for every body that moves (the animal's parts,
  // you, the prey, thrown objects). Rock outcrops and cycads are generated here and the renderer draws these.
  const colliders = [];
  for (const o of obstacles) {
    if (o.kind === 'tree') { colliders.push({ x: o.x, z: o.z, r: o.r, top: base(o.x, o.z) + o.h, kind: 'tree' }); continue; }
    if (o.kind === 'wall') { colliders.push({ x: o.x, z: o.z, r: o.r, top: o.top ?? height(o.x, o.z) + o.h, kind: 'wall', sid: o.sid, seg: o.seg }); continue; }
    const rr = makeRng(o.seed), n = 4 + Math.floor(rr() * 3); o.parts = [];
    for (let k = 0; k < n; k++) {
      const a = rr() * 6.283, d = k === 0 ? 0 : o.r * rr.range(0.25, 0.6), sz = k === 0 ? o.r * 0.85 : o.r * rr.range(0.35, 0.6);
      const x = o.x + Math.sin(a) * d, z = o.z + Math.cos(a) * d, hh = (k === 0 ? o.h : o.h * rr.range(0.4, 0.75)), y = height(x, z) + hh * 0.35, sy = hh * 0.62, sz2 = sz * rr.range(0.8, 1.1), ra = rr() * 3, rb = rr() * 3;
      o.parts.push([x, y, z, sz, sy, sz2, ra, rb]);
      colliders.push({ x, z, r: Math.max(sz, sz2) * 0.92, top: y + sy * 0.95, kind: 'rock' });
    }
    const rc = makeRng(o.seed + 3), m = 1 + Math.floor(rc() * 3); o.cycads = [];
    for (let i = 0; i < m; i++) { const a = rc() * 6.283, d = o.r + rc.range(0.3, 1.3), x = o.x + Math.sin(a) * d, z = o.z + Math.cos(a) * d, hh = rc.range(0.9, 2.4); o.cycads.push([x, z, hh, rc() * 6]); colliders.push({ x, z, r: 0.38, top: height(x, z) + hh + 0.6, kind: 'cycad' }); }
  }
  colliders.push(...slabCols);
  // a coarse grid so a query only looks at what is nearby
  const CG = 6, cgrid = new Map();
  for (const c of colliders) { const i0 = Math.floor((c.x - c.r) / CG), i1 = Math.floor((c.x + c.r) / CG), j0 = Math.floor((c.z - c.r) / CG), j1 = Math.floor((c.z + c.r) / CG); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 8192 + j; (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c); } }
  const gridAdd = (c) => { const i0 = Math.floor((c.x - c.r) / CG), i1 = Math.floor((c.x + c.r) / CG), j0 = Math.floor((c.z - c.r) / CG), j1 = Math.floor((c.z + c.r) / CG); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 8192 + j; (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c); } };
  const addDynamicColliders = (cols) => { for (const c of cols) { colliders.push(c); gridAdd(c); } T.ver++; };
  const refreshDynamicColliders = (cols) => { for (const c of cols) gridAdd(c); T.ver++; };
  // ---- doors and shutters: leaves that swing about a hinge (states open / closed), all opening outward. The person swings them
  // (useDoor); the animal's head or chest pressing on a closed leaf from inside bursts it open (it cannot pull one open from
  // outside: it thuds and holds); each emits events for the audio.
  const leafAt = (d, out) => {
    const n = d.cols.length, sx = Math.sin(d.ang), sz = Math.cos(d.ang);
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n * d.len; out[i].x = d.hinge[0] + sx * u; out[i].z = d.hinge[1] + sz * u; }
  };
  for (const d of doors) {
    const n = Math.max(2, Math.ceil(d.len / 0.3)), r = d.type === 'big' ? 0.13 : 0.09;
    for (let i = 0; i < n; i++) d.cols.push({ x: 0, z: 0, r, bot: d.y0, top: d.y0 + d.h, kind: 'wall', sid: d.sid, door: d });
    leafAt(d, d.cols);
    const reg = { x: d.hinge[0], z: d.hinge[1], r: d.len + 0.4 };
    for (const c of d.cols) { colliders.push(c); const i0 = Math.floor((reg.x - reg.r) / CG), i1 = Math.floor((reg.x + reg.r) / CG), j0 = Math.floor((reg.z - reg.r) / CG), j1 = Math.floor((reg.z + reg.r) / CG); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = i * 8192 + j; (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c); } }
  }
  const built = doors.map((d) => d.state);
  /** Every door and shutter back as the paddock was built (a new scenario). */
  const resetDoors = () => {
    doors.forEach((d, i) => { d.state = built[i]; d.ang = d.state === 'open' ? d.openYaw : d.closedYaw; d.moving = d.burst = false; d.press = 0; d.thudT = -9; leafAt(d, d.cols); });
    T.doorT = 0; T.ver2 = (T.ver2 || 0) + 1;
  };
  const doorMid = (d) => { const a = d.closedYaw; return [d.hinge[0] + Math.sin(a) * d.len * 0.5, d.hinge[1] + Math.cos(a) * d.len * 0.5]; };
  const ev = (events, type, d, extra = {}) => { if (events) { const [x, z] = doorMid(d); events.push({ src: 'door', type, id: d.id, kind: d.type, x, y: d.y0 + d.h * 0.5, z, ...extra }); } };
  /** The door (all leaves of one opening) a person at (x, z) could work, within reach. */
  const doorNear = (x, z, y = null, reach = 2.2) => {
    let best = null, bd = reach;
    for (const d of doors) { const [mx, mz] = doorMid(d), dd = Math.hypot(mx - x, mz - z); if (y !== null && (y < d.y0 - 0.5 || y > d.y0 + d.h + 2.2)) continue; if (dd < bd) { bd = dd; best = d; } }
    return best ? doors.filter((d) => d.gap === best.gap) : null;
  };
  /** Work a door: open -> shut, shut -> open. Returns the new state. */
  const useDoor = (leaves, events) => {
    const nx = leaves[0].state === 'open' ? 'closed' : 'open';
    for (const d of leaves) { d.moving = true; d.speed = 2.2; ev(events, 'creak', d); d.state = nx; }
    T.ver2 = (T.ver2 || 0) + 1; return nx;
  };
  const segD = (px, pz, d) => { const sx = Math.sin(d.ang), sz = Math.cos(d.ang), t = clamp01(((px - d.hinge[0]) * sx + (pz - d.hinge[1]) * sz) / d.len); return Math.hypot(px - d.hinge[0] - sx * t * d.len, pz - d.hinge[1] - sz * t * d.len); };
  /** Step the doors: the animal's head and chest burst closed leaves open from the side they push; leaves swing toward their state. */
  const stepDoors = (dt, sim, events) => {
    T.doorT = (T.doorT || 0) + dt;
    const pts = [];
    if (sim) { const h = sim.head; pts.push([h.pos.x + h.f.x * 1.6, h.pos.y + h.f.y * 1.6, h.pos.z + h.f.z * 1.6, 0.45], [h.pos.x + h.f.x * 0.6, h.pos.y, h.pos.z + h.f.z * 0.6, 0.6], [sim.spine[18].p.x, sim.spine[18].p.y, sim.spine[18].p.z, 1.1]); }
    for (const d of doors) {
      // pressing: its snout, head or chest within touching distance of a shut leaf (the head is held ~0.8 m off solids) for a
      // moment builds pressure: pushed (from the side away from where it folds open) the door gives (burst open); pulled, it thuds and holds
      if (d.state !== 'open' && d.ang === d.closedYaw) {
        let touch = null;
        for (const p of pts) { const [x, y, z, r] = p; if (y > d.y0 - r && y < d.y0 + d.h + r && segD(x, z, d) < r + 0.5) { touch = p; break; } }
        d.press = touch ? (d.press || 0) + dt : Math.max(0, (d.press || 0) - dt);
        const pull = touch && (Math.sin(d.closedYaw) * (touch[2] - d.hinge[1]) - Math.cos(d.closedYaw) * (touch[0] - d.hinge[0])) * Math.sin(d.closedYaw - d.openYaw) > 0;
        if (pull && d.press > 0.35) { d.press = 0; if (T.doorT - d.thudT > 1.2) { d.thudT = T.doorT; ev(events, 'thud', d); } }
        else if (touch && d.press > 0.35) { for (const e of doors) if (e.gap === d.gap) { e.state = 'open'; e.moving = true; e.speed = 7; e.burst = true; e.press = 0; } ev(events, 'bang', d, { burst: true }); T.ver2 = (T.ver2 || 0) + 1; }
      }
      if (!d.moving) continue;
      const goal = d.state === 'open' ? d.openYaw : d.closedYaw, da = goal - d.ang, st = d.speed * dt;
      if (Math.abs(da) <= st) { d.ang = goal; d.moving = false; if (goal === d.closedYaw) ev(events, 'bang', d); d.burst = false; }
      else d.ang += Math.sign(da) * st;
      leafAt(d, d.cols);
    }
  };
  /** A structure added after the world was made (tests, an editor, a level script): walls [lx0, lz0, lx1, lz1, r, h, mat] and
   *  overhead runs [lx0, lz0, lx1, lz1, r, y0, y1, mat] in its own frame, openings a person uses [lx, lz, nlx, nlz, w]. Nothing
   *  in the animal knows the kind; it only meets the colliders. */
  const addStructure = (spec) => {
    const S = { kind: spec.kind, id: structures.length + 1, cx: spec.cx, cz: spec.cz, yaw: spec.yaw || 0, hw: spec.hw, hd: spec.hd, h: spec.h, walls: [], openings: [], ...(spec.extra || {}) };
    S.base = baseOf(S, S.hw, S.hd);
    const o0 = obstacles.length, s0 = slabCols.length;
    for (const [a, b, c, d, r, h, mat] of spec.walls || []) wall(S, ...local(S, a, b), ...local(S, c, d), r, h, mat || 'rock');
    for (const [a, b, c, d, r, y0, y1, mat] of spec.slabs || []) slab(S, ...local(S, a, b), ...local(S, c, d), r, y0, y1, mat || 'rock');
    for (const [a, b, na, nb, w] of spec.openings || []) { const [x, z] = local(S, a, b), [ox, oz] = local(S, a + na, b + nb); S.openings.push({ x, z, nx: ox - x, nz: oz - z, w, y: S.base + 0.9 }); }
    for (const o of obstacles.slice(o0)) { const c = { x: o.x, z: o.z, r: o.r, top: height(o.x, o.z) + o.h, kind: 'wall', sid: o.sid, seg: o.seg }; colliders.push(c); gridAdd(c); }
    for (const c of slabCols.slice(s0)) { colliders.push(c); gridAdd(c); }
    if (spec.roof) { S.roof = { y: S.base + spec.roof }; roofs.push(S); }
    structures.push(S); T.ver++;
    return S;
  };
  const nearOut = [], seen = new Set();
  /** Colliders whose footprint comes within rad of (x, z). The returned array is reused: copy it to keep it. */
  const near = (x, z, rad) => {
    nearOut.length = 0; seen.clear();
    for (let i = Math.floor((x - rad) / CG); i <= Math.floor((x + rad) / CG); i++) for (let j = Math.floor((z - rad) / CG); j <= Math.floor((z + rad) / CG); j++) {
      const L = cgrid.get(i * 8192 + j); if (!L) continue;
      for (const c of L) if (!seen.has(c) && Math.abs(c.x - x) < c.r + rad && Math.abs(c.z - z) < c.r + rad) { seen.add(c); nearOut.push(c); }
    }
    return nearOut;
  };
  /** Push a vertical capsule (footprint radius r, spanning y0..y1) out of everything solid. Returns the push. */
  const pushOut = (p, r, y0, y1, iters = 2, wallsFull = false) => {      // wallsFull: built walls count from the ground up, whatever y0
    let tx = 0, tz = 0;
    for (let it = 0; it < iters; it++) {
      let moved = false;
      for (const c of near(p.x, p.z, r + 0.5)) {
        if (c.bot !== undefined ? (y1 < c.bot || y0 > c.top) : (y0 > c.top && !(wallsFull && c.kind === 'wall'))) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d >= m) continue;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0, k = m - d; p.x += nx * k; p.z += nz * k; tx += nx * k; tz += nz * k; moved = true;
      }
      if (!moved) break;
    }
    return [tx, tz];
  };
  /** True when nothing solid (colliders with their vertical extent, roofs, the ground) lies on the segment a-b; pad widens it. */
  const segClear = (ax, ay, az, bx, by, bz, pad = 0) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(2, Math.ceil(Math.hypot(L, dy) / 0.5));
    for (let i = 1; i < n; i++) { const t = i / n; if (ay + dy * t < height(ax + dx * t, az + dz * t) + 0.05) return false; }
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, L2 = L * L || 1e-9;
    for (const c of near(mx, mz, L / 2 + pad + 0.5)) {
      let t = ((c.x - ax) * dx + (c.z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t - c.x, az + dz * t - c.z), m = c.r + pad; if (d >= m) continue;
      // the stretch of the segment inside this footprint, and whether it is within the solid's height there
      const hw = Math.sqrt(m * m - d * d) / (L || 1e-9), t0 = Math.max(0, t - hw), t1 = Math.min(1, t + hw);
      const y0 = ay + dy * t0, y1 = ay + dy * t1, lo = Math.min(y0, y1) - pad, hi = Math.max(y0, y1) + pad;
      if (hi > (c.bot ?? -1e9) && lo < c.top) return false;
    }
    return !roofBlocks(ax, ay, az, bx, by, bz);
  };
  // obstacles near a point, from a grid (rebuilt when the list grows): for loops that only care about what is close
  // (the belief's particles, the herd's avoidance) instead of walking every trunk and pillar in the paddock
  const OG = 8, og = new Map(), ogOut = []; let ogN = -1, ogGen = 0;
  const obstaclesNear = (x, z, rad) => {
    if (ogN !== obstacles.length) { og.clear(); for (const o of obstacles) for (let i = Math.floor((o.x - o.r) / OG); i <= Math.floor((o.x + o.r) / OG); i++) for (let j = Math.floor((o.z - o.r) / OG); j <= Math.floor((o.z + o.r) / OG); j++) { const k = i * 4096 + j; (og.get(k) || og.set(k, []).get(k)).push(o); } ogN = obstacles.length; }
    ogOut.length = 0; ogGen++;
    for (let i = Math.floor((x - rad) / OG); i <= Math.floor((x + rad) / OG); i++) for (let j = Math.floor((z - rad) / OG); j <= Math.floor((z + rad) / OG); j++) {
      const L = og.get(i * 4096 + j); if (L) for (const o of L) if (o._og !== ogGen) { o._og = ogGen; ogOut.push(o); }
    }
    return ogOut;
  };
  // the place's own data and queries (see paddock.js): water, wetness, cover height, wind, ground kind, place names
  const slopeAt = (x, z) => { const e = 0.5; return Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  Object.assign(T, { ver: 0, addStructure, addDynamicColliders, refreshDynamicColliders, height, base, normal, addBump, bumps, obstacles, logs, cover, coverAt, structures, insideStructure, roofBlocks, colliders, near, pushOut, segClear, size: 420, arena: PD.LAYOUT.fence - 3.5, bound: PD.LAYOUT.fence - 0.5, doors, navBlocks, doorNear, useDoor, stepDoors, resetDoors, solids, things: PD.things,
    grass: PD.grass, landmarks: PD.landmarks, grazing: PD.grazing, paddock: PD, slopeAt, obstaclesNear,
    waterY: PD.waterY, depthAt: PD.depthAt, wetAt: PD.wetAt, wetness: PD.wetAt, coverHeight: PD.coverHeight, windAt: PD.windAt, surfaceAt: PD.surfaceAt, placeName: PD.placeName, speedFactor: PD.speedFactor });
  return T;
}
