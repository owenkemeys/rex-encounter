// A made-up world that is not our arena, for the platform tests (test/platform.mjs): flat ground at y = 12, a rectangular fence
// well away from the origin (x 200..290, z -340..-270), boxes as pillar chains (the way a foreign game's physics boxes are
// adapted, cf. /home/claude/saltrex/src/saltworld.js), and structures of kinds the animal's code has never heard of. Zone names
// are made-up strings too. Nothing here is from the paddock.
//   makeForeign()  -> T (the terrain contract the sim reads; see src/terrain.js)
const PIL = 0.75;
export const RECT = { x0: 200, x1: 290, z0: -340, z1: -270 };
export const G0 = 12;

// structures (kinds unknown to the sim): centre, half sizes, wall height, roof, door gaps (side, offset, width), raised floor
export const STRUCTS = [
  { kind: 'zorb', cx: 225, cz: -320, hw: 5, hd: 4, wall: 3.8, roof: true, mat: 'plastoid', doors: [['s', 0, 1.3]] },       // closed, roofed, a door its head passes and its body does not
  { kind: 'zorb', cx: 270, cz: -320, hw: 11, hd: 8, wall: 6.5, roof: true, mat: 'plastoid', doors: [['n', 0, 9]] },        // the same kind, much bigger, a door its body walks through
  { kind: 'quux', cx: 230, cz: -285, hw: 6, hd: 5, wall: 0.7, roof: false, mat: 'unobtainium', doors: [['e', 0, 2]] },      // low walls only
  { kind: 'plinth9', cx: 268, cz: -285, hw: 1.8, hd: 1.8, floor: 4.6, mat: 'driftwood' },                                   // a floor up on four posts
];
// bare boxes (lanes of crates, a long wall): [x0, z0, x1, z1, height]
export const BOXES = [[244, -300, 250, -290, 3.0], [244, -280, 250, -276, 2.6], [205, -300, 215, -298, 5.2]];
// standing things of unknown kinds: a few thin posts, a big lump
export const PROPS = [{ x: 255, z: -305, r: 0.25, h: 2.5, kind: 'gizmo' }, { x: 257, z: -306, r: 0.25, h: 2.5, kind: 'gizmo' }, { x: 238, z: -305, r: 1.8, h: 3.2, kind: 'blorp' }];

export function makeForeign() {
  const T = {};
  const height = (x, z) => G0 + 0.002 * (x - 245);      // nearly flat, tilted a little
  const normal = (x, z, o) => { const e = 0.35, dx = (height(x + e, z) - height(x - e, z)) / (2 * e), dz = (height(x, z + e) - height(x, z - e)) / (2 * e), inv = 1 / Math.hypot(dx, 1, dz); o.x = -dx * inv; o.y = inv; o.z = -dz * inv; return o; };
  const obstacles = [], colliders = [], roofs = [], structures = [];
  const chain = (ax, az, bx, bz, r, push) => { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / PIL)); for (let i = 0; i <= n; i++) push(ax + (bx - ax) * i / n, az + (bz - az) * i / n, r); };
  const solid = (x, z, r, h, extra = {}) => { const top = height(x, z) + h; obstacles.push({ x, z, r, h, top, kind: 'wall', seed: 0, ...extra }); colliders.push({ x, z, r, top, kind: 'wall', sid: extra.sid }); };
  for (const [x0, z0, x1, z1, h] of BOXES) {
    const w = x1 - x0, d = z1 - z0, s = Math.min(w, d), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (s <= 3.2) { const r = s / 2; if (w >= d) chain(x0 + r, cz, x1 - r, cz, r, (x, z, r) => solid(x, z, r, h)); else chain(cx, z0 + r, cx, z1 - r, r, (x, z, r) => solid(x, z, r, h)); }
    else { const r = 0.6; chain(x0 + r, z0 + r, x1 - r, z0 + r, r, (x, z, rr) => solid(x, z, rr, h)); chain(x0 + r, z1 - r, x1 - r, z1 - r, r, (x, z, rr) => solid(x, z, rr, h)); chain(x0 + r, z0 + r, x0 + r, z1 - r, r, (x, z, rr) => solid(x, z, rr, h)); chain(x1 - r, z0 + r, x1 - r, z1 - r, r, (x, z, rr) => solid(x, z, rr, h)); }
  }
  for (const p of PROPS) { const top = height(p.x, p.z) + p.h; obstacles.push({ ...p, top, seed: 3 }); colliders.push({ x: p.x, z: p.z, r: p.r, top, kind: p.kind }); }
  let id = 0;
  for (const D of STRUCTS) {
    const S = { kind: D.kind, key: D.kind + id, name: 'the ' + D.kind, id: ++id, cx: D.cx, cz: D.cz, yaw: 0, hw: D.hw, hd: D.hd, h: D.wall || D.floor, base: height(D.cx, D.cz), walls: [], openings: [], mat: D.mat };
    if (D.floor) {      // a floor up on posts: four posts, openings all round at the floor
      for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid(D.cx + i * D.hw, D.cz + j * D.hd, 0.22, D.floor + 3, { sid: S.id });
      for (const [i, j] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) S.openings.push({ x: D.cx + i * D.hw, z: D.cz + j * D.hd, nx: i, nz: j, w: 3, y: S.base + D.floor + 0.8, up: true });
      S.floor = S.base + D.floor;
    } else {
      const r = 0.2, sides = { s: [-D.hw, -D.hd, D.hw, -D.hd, 0, -1], n: [-D.hw, D.hd, D.hw, D.hd, 0, 1], w: [-D.hw, -D.hd, -D.hw, D.hd, -1, 0], e: [D.hw, -D.hd, D.hw, D.hd, 1, 0] };
      for (const [k, [ax, az, bx, bz, nx, nz]] of Object.entries(sides)) {
        const door = (D.doors || []).find((q) => q[0] === k), L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
        const runs = door ? [[0, L / 2 + door[1] - door[2] / 2], [L / 2 + door[1] + door[2] / 2, L]] : [[0, L]];
        for (const [s0, s1] of runs) {
          const x0 = D.cx + ax + ux * s0, z0 = D.cz + az + uz * s0, x1 = D.cx + ax + ux * s1, z1 = D.cz + az + uz * s1;
          chain(x0, z0, x1, z1, r, (x, z, rr) => solid(x, z, rr, D.wall, { sid: S.id, seg: { ax: x0, az: z0, bx: x1, bz: z1 } }));
          S.walls.push({ ax: x0, az: z0, bx: x1, bz: z1, t: 2 * r, h: D.wall, mat: D.mat });
        }
        if (door) S.openings.push({ x: D.cx + ax + ux * (L / 2 + door[1]), z: D.cz + az + uz * (L / 2 + door[1]), nx, nz, w: door[2], y: S.base + Math.min(1.1, D.wall - 0.4) });
      }
      if (D.roof) { S.roof = { y: S.base + D.wall }; roofs.push(S); }
    }
    structures.push(S);
  }
  const CG = 6, cgrid = new Map();
  for (const c of colliders) { for (let i = Math.floor((c.x - c.r) / CG); i <= Math.floor((c.x + c.r) / CG); i++) for (let j = Math.floor((c.z - c.r) / CG); j <= Math.floor((c.z + c.r) / CG); j++) { const k = i * 8192 + j; (cgrid.get(k) || cgrid.set(k, []).get(k)).push(c); } }
  const nearOut = [], seen = new Set();
  const near = (x, z, rad) => {
    nearOut.length = 0; seen.clear();
    for (let i = Math.floor((x - rad) / CG); i <= Math.floor((x + rad) / CG); i++) for (let j = Math.floor((z - rad) / CG); j <= Math.floor((z + rad) / CG); j++) {
      const L = cgrid.get(i * 8192 + j); if (!L) continue;
      for (const c of L) if (!seen.has(c) && Math.abs(c.x - x) < c.r + rad && Math.abs(c.z - z) < c.r + rad) { seen.add(c); nearOut.push(c); }
    }
    return nearOut;
  };
  const pushOut = (p, r, y0, y1, iters = 2, wallsFull = false) => {
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
  const roofBlocks = (ax, ay, az, bx, by, bz) => {
    for (const S of roofs) {
      const y = S.roof.y; if ((ay - y) * (by - y) > 0) continue;
      const t = (y - ay) / (by - ay), x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (Math.abs(x - S.cx) < S.hw + 0.3 && Math.abs(z - S.cz) < S.hd + 0.3) return true;
    }
    return false;
  };
  const segClear = (ax, ay, az, bx, by, bz, pad = 0) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dz), n = Math.max(2, Math.ceil(Math.hypot(L, dy) / 0.5));
    for (let i = 1; i < n; i++) { const t = i / n; if (ay + dy * t < height(ax + dx * t, az + dz * t) + 0.05) return false; }
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, L2 = L * L || 1e-9;
    for (const c of near(mx, mz, L / 2 + pad + 0.5)) {
      let t = ((c.x - ax) * dx + (c.z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(ax + dx * t - c.x, az + dz * t - c.z), m = c.r + pad; if (d >= m) continue;
      const hw = Math.sqrt(m * m - d * d) / (L || 1e-9), t0 = Math.max(0, t - hw), t1 = Math.min(1, t + hw);
      const y0 = ay + dy * t0, y1 = ay + dy * t1, lo = Math.min(y0, y1) - pad, hi = Math.max(y0, y1) + pad;
      if (hi > (c.bot ?? -1e9) && lo < c.top) return false;
    }
    return !roofBlocks(ax, ay, az, bx, by, bz);
  };
  const obstaclesNear = (x, z, rad) => obstacles.filter((o) => Math.abs(o.x - x) < rad + o.r && Math.abs(o.z - z) < rad + o.r);
  // inside: in the footprint (and up on the floor, for a raised one)
  const insideStructure = (x, z, y = null) => {
    for (const S of structures) if (Math.abs(x - S.cx) < S.hw - 0.05 && Math.abs(z - S.cz) < S.hd - 0.05) { if (S.floor !== undefined) { if (y !== null && y > S.floor + 0.5) return S; } else return S; }
    return null;
  };
  const ZN = ['the frobnicator', 'beyond the zarg', 'the gully', 'the meadow', 'the shed'];      // made-up and misleading zone strings
  const placeName = (x, z) => ZN[(Math.floor(x / 17) + Math.floor(z / 13)) & 3];
  Object.assign(T, {
    ver: 0, height, base: height, normal, addBump() {}, bumps: [], obstacles, logs: [], cover: [], coverAt: () => 0, coverHeight: () => 0,
    structures, insideStructure, roofBlocks, colliders, near, pushOut, segClear, obstaclesNear, size: 200,
    arena: 30, rect: RECT, doors: [], solids: [], things: [], grass: [], landmarks: [], grazing: [],
    slopeAt: () => 0.002, waterY: () => G0 - 5, depthAt: () => 0, wetAt: () => 0, wetness: () => 0, surfaceAt: () => 'tarmac', placeName, speedFactor: () => 1,
  });
  return T;
}
export const inRect = (x, z, m = 0) => x >= RECT.x0 + m && x <= RECT.x1 - m && z >= RECT.z0 + m && z <= RECT.z1 - m;
