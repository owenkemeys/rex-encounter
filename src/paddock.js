// The Arena: a compact, designed 200 x 200 m enclosure inside a 1990s park perimeter fence (approved sketch:
// mapscout/previews/arena.png). World axes: +x east, +z north, y up; the fence runs at x, z = +-99.5.
//
//   The Lawn (centre)       open stand-off ground (~70 x 65 m), the 12 m Feeding Tower, three low berms that break sight lines.
//   The Barn (NE)           36 x 14 m, two big doors (N, S, 1.9 m: head, neck and shoulders, never the 2.1 m chest), two person doors (W, E),
//                           shuttered windows, stalls and a spine wall inside (each opening reaches a different part), a hayloft
//                           (ladder inside; a hay hatch in the N gable at loft height) with a catwalk to the Silo (person-only exit).
//   Service Yard (NW)       the Warehouse (roller door half up: its head only; a person door; broken windows; racks inside) and
//                           a Container stack whose two 1 m gaps only a person fits.
//   Visitor-Centre Ruins (W) columns 2.2 m apart under broken roof slabs: a person threads through, partial cover from above.
//   Jungle (SW), Bamboo (W) trunks under 3 m apart, only a person passes; one game trail and a clearing let the animal hunt inside.
//   Bluff (E, 8 m)          a sheer face with a 1.3 m Ledge rising along it (person only), a Cave the animal can lie up in, and
//                           a ramp at its south end that is the animal's way up (it can lean down at the ledge from the top).
//   River and Pond (S, SE)  wading slows both; the Jetty (a boardwalk) and the Culvert (a pipe under the water) are dry crossings.
//   Gatehouse (N fence)     a small concrete hut beside the shut main gate.
//
// Everything is a pure function of the seed: the layout is fixed (a place you learn); only the ground noise, the jungle's and the
// bamboo's stems and the ferns vary with the seed.
//
// ======================================================================================== EXPORT SCHEMA (for dressing)
// makePaddock(seed).things is the complete list of placed, solid things, in world coordinates. Every entry:
//   { id:   unique string, e.g. 'barn.wall.3', 'barn.door.N.l', 'jungle.trunk.41'
//     of:   id of the structure it belongs to ('barn', 'loft', 'silo', 'warehouse', 'containers', 'ruins', 'gatehouse', 'tower',
//           'culvert', 'cave', 'rubble' (boulders on the bluff's brink), 'jetty', 'fence', 'jungle', 'bamboo')
//     kind: 'wall'    upright box (a wall run, a partition, a rack, a container side)
//           'slab'    overhead box (lintel, roof run, loft floor, culvert crown, cave roof): solid only between y and y + h
//           'post'    upright cylinder (column, tower leg, jetty post, fence post): radius r
//           'trunk'   tree stem (jungle) or bamboo clump: cylinder radius r, height h
//           'door'    a moveable leaf (see door below)
//           'roof'    a roof over a whole shell (visual; sight lines stop at its plane)
//           'deck'    walkable boardwalk / platform surface (visual + ground; not a collider)
//           'pole'    upright cylinder that belongs to no structure (a yard lamp): radius r, height h; a collider like a post
//           'mast', 'catwalk', 'ladder'   drawn parts; a collider only where the entry says `collide`: 'upright' (a thin wall run: a
//                     ladder) or 'overhead' (a slab chain from its underside to its top + `rail`: the catwalk, the tower's deck; also
//                     kept clear by the route planner when lower than the animal is tall: terrain.navBlocks)
//           (fallen logs are not things: makePaddock(seed).logs, low ridges in the ground that the feet step over)
//     mat:  material tag: 'timber' (barn), 'concrete', 'block', 'steel' (warehouse, silo, racks, roller door), 'container',
//           'fence', 'rock', 'wood' (tower, jetty, ladders), 'bamboo', 'jungle', 'pipe', 'hay'
//     x, y, z: centre of the box's base (world m); y is absolute (ground height already added)
//     yaw:  rotation about +y (rad); the box's local +z axis points along (sin yaw, cos yaw): its LENGTH runs along local z
//     w, h, l: box thickness (local x), height (y), length (local z); posts and trunks use r and h instead (trunks: y 0 = stand on
//           the ground, terrain.height(x, z)). Walls and slabs also carry their run's end points ax, az, bx, bz (world).
//     prefab: the src/view/arenaassets.js kind that dresses it (whole-building kinds such as 'warehouse' or 'gatehouse' are on
//           every part of that building: place the prefab once at the structure's frame, P.structures), or null (keep blockout)
//     visualOnly: true for a part with no collider (the warehouse's half-raised roller door)
//     door: (kind 'door' only) { hinge: [x, z], len, y0, h, closedYaw, openYaw, state: 'open' | 'closed', type: 'big' |
//           'person' | 'shutter' }. The leaf runs from the hinge along (sin a, cos a) for len metres, a = the current angle; it
//           swings between closedYaw (spanning the gap) and openYaw (folded back against the outside of the wall). Live state:
//           terrain.doors[i].ang / .state; events { src: 'door', type: 'creak' | 'bang' | 'thud', id, x, z }.
//   }
// Colliders: walls and slabs are chains of pillars of radius w/2 every 0.75 m along the box (terrain.js); posts and trunks are one
// pillar each; door leaves are moving pillar chains. The blockout (src/view/features.js) draws exactly these boxes.
// makePaddock(seed).structures: the enterable places as data (openings for the animal's "get senses and jaws through" drive, roof
// heights, ladders); makePaddock(seed).refuges: the person's refuges, for the reach table (test/reach.mjs).
// =========================================================================================================================
import { makeRng, clamp, lerp, sstep } from './math.js';

function hash2(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10), uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

// ------------------------------------------------------------------ the layout (fixed)
export const LAYOUT = {
  fence: 99.5,
  lawn: { x: 4, z: 8, rx: 35, rz: 32 },
  berms: [[-9, 45, 0.33, 9, 3.6, 1.9], [-31, -8, -0.95, 8, 3.4, 1.8], [36, -17, 0.45, 9, 3.6, 1.9]],      // x, z, yaw, half-length, half-width, height
  bluff: { face: 75, top: 8, z0: -26, zTop: -4, shelf: 1.3, ledge0: 86, ledge1: 34 },                 // face x; ramp from z0 (ground) to zTop; the ledge from ledge0 (ground) up to ledge1 (top)
  cave: { x0: 75, x1: 84.5, z0: 16.5, z1: 27.5, roof: 5.6 },
  river: { wl: -0.55, half: 6.5, bank: 2.5, depth: 0.95 },
  pond: { x: 73, z: -47, r: 16.5, depth: 1.15 },
  jetty: { x: 23, z0: -91, z1: -69.5, half: 0.75 },
  culvert: { x: 0, z: -82, hd: 7.6 },
  jungle: { trail: [[-24, -18], [-36, -30], [-52, -42], [-62, -52], [-70, -66]], trailHalf: 6, clearing: { x: -62, z: -52, r: 8 } },
  bamboo: { x0: -99, x1: -85, z0: -6, z1: 93 },
  spawn: { you: { x: -13, z: 2 }, rex: { x: 15, z: 14, yaw: -2.0 } },     // ~30 m apart on the Lawn, in the open
  // Where a session starts and where a new life appears. Owner (2026-11-17): "the arena and/or spawn position i find to be overly big and
  // boring, i end up dashing over to the ruins or the barn from the start point most times because that gives opportunities for
  // fooling around with the rex." So: the first spawn is in the open between the Barn and the Containers, 12 to 18 m from cover (the Barn, or the berm in front), the
  // animal about 38 m off on the Lawn in plain view. A respawn takes whichever of `respawn` is farthest from the animal (at least
  // 40 m, out of its sight line if one is) so a new life is never a second death; `spawn` above is the fallback.
  spawns: {
    first: { you: { x: -4, z: 58 }, rex: { x: -4, z: 20 } },
    // the gatehouse start (main.js GATE): the opening is the gatehouse's security camera on the animal sniffing round outside; on
    // the first move or look you are the guard at the monitor (at `guard`, facing the wide east window) and look up from it. It starts out in the
    // paddock 38 m east of the hut, in sight of that window, and walks in (owner: "approaching from a distance, so we can see it move before it
    // starts its investigation"; src/gatesplash.js draws it); cam and cam2 are the hut's own
    // cameras on its SE and SW corners (main.js gateMount)
    gate: { guard: { x: -6.6, z: 95 }, window: { x: -4, z: 95 }, rex: { x: 31, z: 93, yaw: -1.57 }, cam: { x: -3.7, y: 3.6, z: 92.3 }, cam2: { x: -10.3, y: 3.6, z: 92.3 } },      // between the Barn (17 m E) and the Containers (20 m W), the berm 12 m ahead; the animal faces you, the berm's end clear of the line
    respawn: [
      { name: 'the Barn', x: 30, z: 49 },            // 14 m off its south face
      { name: 'the Ruins', x: -30, z: 20 },          // 16 m off their east side
      { name: 'the Containers', x: -30, z: 48 },     // 14 m south of the stack
      { name: 'the Warehouse', x: -52, z: 46 },      // 14 m south of it, in the Yard
    ],
  },
};
export const riverZ = (x) => -82 + 0.05 * x + 1.5 * Math.sin(x / 19);
const L = LAYOUT;
const jungleEdge = (z) => (z > -12 ? -1e9 : z > -45 ? lerp(-30, -15, (-12 - z) / 33) : lerp(-15, -25, (-45 - z) / 55));

const cache = new Map();

/** Build (once per seed) the static ground and everything laid out on it. */
export function makePaddock(seed = 7) {
  if (cache.has(seed)) return cache.get(seed);
  const R = makeRng(seed * 7919 + 13), F = 1;
  const things = [], structures = [], refuges = [];
  const T0 = (id, o) => { things.push({ id, ...o }); return o; };

  // ---------------------------------------------------------------- ground
  const pads = [];      // flat building pads [cx, cz, hw, hd, y]
  const noise = (x, z) => 0.22 * vnoise(x / 23 + 3.1, z / 23 - 1.7, seed) + 0.08 * vnoise(x / 7 - 5.3, z / 7 + 2.2, seed + 1);
  const pondR = (x, z) => { const a = Math.atan2(x - L.pond.x, z - L.pond.z); return L.pond.r + 2 * Math.sin(2 * a + 0.7) + 1.4 * Math.sin(3 * a + 2); };
  const B = L.bluff, C = L.cave, RV = L.river;
  const bluffH = (x, z) => {      // the bluff's own height (0 off it)
    if (z < B.z0) return 0;
    const fx = B.face + 0.8 * Math.sin(z / 9);
    const top = B.top * sstep(B.z0, B.zTop, z);
    let h = x > fx ? top * sstep(fx, fx + 0.35, x) : 0;
    // the cave: carved out of the face
    if (x > C.x0 - 0.5 && x < C.x1 && z > C.z0 && z < C.z1) h = Math.min(h, 0.05);
    // the ledge: a shelf in front of the face, rising from the ground in the north to the top
    if (z < B.ledge0 + 3 && z > B.ledge1 - 2 && x > fx - B.shelf - 0.3 && x <= fx + 0.05) {
      const hl = B.top * clamp((B.ledge0 - z) / (B.ledge0 - B.ledge1), 0, 1);
      h = Math.max(h, hl * sstep(fx - B.shelf - 0.3, fx - B.shelf, x));
    }
    return h;
  };
  const surf = (x, z) => {
    let h = noise(x, z);
    for (const [bx, bz, yaw, hl, hw, bh] of L.berms) {
      const dx = x - bx, dz = z - bz, a = dx * Math.sin(yaw) + dz * Math.cos(yaw), b = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const e = Math.hypot(Math.max(0, Math.abs(a) - hl), b); if (e < hw) h += bh * 0.5 * (1 + Math.cos(Math.PI * e / hw));
    }
    for (const [cx, cz, hw, hd, y] of pads) { const e = Math.hypot(Math.max(0, Math.abs(x - cx) - hw), Math.max(0, Math.abs(z - cz) - hd)); if (e < 3) h = lerp(y, h, sstep(0, 3, e)); }
    h += bluffH(x, z);
    // the river and the pond
    const dr = Math.abs(z - riverZ(x));
    if (dr < RV.half + RV.bank) h = Math.min(h, dr < RV.half ? RV.wl - RV.depth * (1 - (dr / RV.half) ** 2) + 0.12 : lerp(RV.wl + 0.12, h, sstep(RV.half, RV.half + RV.bank, dr)));
    const dp = Math.hypot(x - L.pond.x, z - L.pond.z);
    if (dp < L.pond.r + 6) { const rp = pondR(x, z); if (dp < rp + 2.5) h = Math.min(h, dp < rp ? RV.wl - L.pond.depth * (1 - (dp / rp) ** 2) + 0.1 : lerp(RV.wl + 0.1, h, sstep(rp, rp + 2.5, dp))); }
    // the channel joining the pond to the river
    if (x > 86 && x < 96 && z < -58 && z > riverZ(x)) { const d = Math.abs(x - 91); if (d < 4) h = Math.min(h, RV.wl - 0.5 * (1 - (d / 2.4) ** 2) + 0.12); }
    // the jetty's deck and the culvert's dry floor
    if (Math.abs(x - L.jetty.x) < L.jetty.half && z > L.jetty.z0 && z < L.jetty.z1) h = Math.max(h, RV.wl + 0.5);
    if (Math.abs(x - L.culvert.x) < 1.05 && Math.abs(z - L.culvert.z) < L.culvert.hd + 0.2) h = Math.max(h, RV.wl + 0.35);
    return h;
  };
  // pads under the buildings (flat at the noise level there)
  for (const [cx, cz, hw, hd] of [[30, 70, 20.5, 12.5], [-54, 67, 12.5, 9.5], [-30, 68, 6, 7], [-58, 20, 12.5, 9.5], [-7, 95, 3.5, 3], [-4, -16, 2.5, 2.5], [57, 74.5, 4, 4]]) pads.push([cx, cz, hw, hd, noise(cx, cz)]);
  const BK = 120, ST = 0.5, N = Math.round(2 * BK / ST) + 1, grid = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -BK + i * ST, z = -BK + j * ST; grid[i + N * j] = surf(x, z); }
  const ground = (x, z) => {
    const fx = (x + BK) / ST, fz = (z + BK) / ST;
    if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return noise(x, z);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = i + N * j;
    const a = grid[k], b = grid[k + 1], c = grid[k + N], d = grid[k + N + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };

  // ---------------------------------------------------------------- structures as placed things
  // a structure frame: local (lx, lz) -> world; S.base = floor height
  const frame = (id, kind, name, cx, cz, yaw, hw, hd, h, extra = {}) => {
    const S = { id, kind, name, cx, cz, yaw, hw, hd, h, openings: [], ...extra };
    S.local = (lx, lz) => [cx + lx * Math.cos(yaw) + lz * Math.sin(yaw), cz - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
    S.base = S.base ?? Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([i, j]) => ground(...S.local(i * hw, j * hd))));
    S.n = 0; structures.push(S); return S;
  };
  const box = (S, kind, ax, az, bx, bz, w, y0, h, mat) => {      // a wall/slab run in S's frame from (ax, az) to (bx, bz)
    const [x0, z0] = S.local(ax, az), [x1, z1] = S.local(bx, bz), len = Math.hypot(x1 - x0, z1 - z0);
    return T0(`${S.id}.${kind}.${S.n++}`, { of: S.id, kind, mat, x: (x0 + x1) / 2, y: S.base + y0, z: (z0 + z1) / 2, yaw: Math.atan2(x1 - x0, z1 - z0), w, h, l: len, ax: x0, az: z0, bx: x1, bz: z1 });
  };
  const wallL = (S, ax, az, bx, bz, w, h, mat) => box(S, 'wall', ax, az, bx, bz, w, 0, h, mat);
  const slabL = (S, ax, az, bx, bz, w, y0, y1, mat) => box(S, 'slab', ax, az, bx, bz, w, y0, y1 - y0, mat);
  const post = (S, lx, lz, r, h, mat, y0 = 0) => { const [x, z] = S.local(lx, lz); return T0(`${S.id}.post.${S.n++}`, { of: S.id, kind: 'post', mat, x, y: S.base + y0, z, yaw: 0, r, h }); };
  const opening = (S, lx, lz, nlx, nlz, w, y, up = false) => { const [x, z] = S.local(lx, lz), [ox, oz] = S.local(lx + nlx, lz + nlz); S.openings.push({ x, z, nx: ox - x, nz: oz - z, w, y: S.base + y, ...(up ? { up: true } : {}) }); };
  // a door leaf: hinge at local (hx, hz); closed it runs along local direction (dx, dz) for len; open it folds back outside (normal n)
  const door = (S, tag, type, hx, hz, dx, dz, nlx, nlz, len, y0, h, state = 'open') => {
    const [x, z] = S.local(hx, hz), [ex, ez] = S.local(hx + dx, hz + dz), [ox, oz] = S.local(hx + nlx, hz + nlz);
    const closedYaw = Math.atan2(ex - x, ez - z), outYaw = Math.atan2(ox - x, oz - z);
    let openYaw = closedYaw + 2 * Math.atan2(Math.sin(outYaw - closedYaw), Math.cos(outYaw - closedYaw)) * 0.94;      // folded back to (nearly) flat on the outside face
    const d = { hinge: [x, z], len, y0: S.base + y0, h, closedYaw, openYaw, state, type };
    T0(`${S.id}.door.${tag}`, { of: S.id, kind: 'door', mat: S.doorMat || 'timber', x, y: S.base + y0, z, yaw: state === 'open' ? openYaw : closedYaw, w: type === 'big' ? 0.16 : 0.08, h, l: len, door: d });
  };
  // a rectangular shell: gaps [side, offset along the side, width, sill, lintel, doors?]; sides 0:+z 1:+x 2:-z 3:-x, each run
  // anticlockwise seen from above starting at the (-x,+z) corner, so a positive offset goes +x on side 0, -z on 1, -x on 2, +z on 3
  const rect = (S, hw, hd, h, w, gaps, mat) => {
    const sides = [[-hw, hd, hw, hd], [hw, hd, hw, -hd], [hw, -hd, -hw, -hd], [-hw, -hd, -hw, hd]], r = w / 2;
    sides.forEach(([ax, az, bx, bz], si) => {
      const Ls = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / Ls, uz = (bz - az) / Ls, nx = -uz, nz = ux;      // outward normal
      const mine = gaps.filter((g) => g[0] === si), cuts = mine.map(([, c, gw]) => [Ls / 2 + c - gw / 2 - r, Ls / 2 + c + gw / 2 + r]).sort((a, b) => a[0] - b[0]);
      let s0 = 0;
      for (const [c0, c1] of [...cuts, [Ls, Ls]]) { if (c0 - s0 > 0.05) wallL(S, ax + ux * s0, az + uz * s0, ax + ux * c0, az + uz * c0, w, h, mat); s0 = c1; }
      for (const [, c, gw, sill, lintel, dr] of mine) {
        const mx = ax + ux * (Ls / 2 + c), mz = az + uz * (Ls / 2 + c), e0 = Ls / 2 + c - gw / 2 - r * 0.5, e1 = Ls / 2 + c + gw / 2 + r * 0.5;
        if (sill) wallL(S, ax + ux * e0, az + uz * e0, ax + ux * e1, az + uz * e1, w, sill, mat);
        if (lintel && lintel < h) slabL(S, ax + ux * e0, az + uz * e0, ax + ux * e1, az + uz * e1, w, lintel, h, mat);
        if (!sill) opening(S, mx, mz, nx, nz, gw, Math.min(1.1, (lintel || h) - 0.4));
        if (dr) {      // leaves hinged at the gap's edges, swinging out
          const g0 = Ls / 2 + c - gw / 2, g1 = Ls / 2 + c + gw / 2, y0 = sill || 0.02, hh = (lintel || h) - y0 - 0.05, tag = dr.tag;
          if (dr.leaves === 2) { door(S, tag + '.l', dr.type, ax + ux * g0, az + uz * g0, ux, uz, nx, nz, gw / 2 - 0.02, y0, hh, dr.state); door(S, tag + '.r', dr.type, ax + ux * g1, az + uz * g1, -ux, -uz, nx, nz, gw / 2 - 0.02, y0, hh, dr.state); }
          else door(S, tag, dr.type, ax + ux * g0, az + uz * g0, ux, uz, nx, nz, gw - 0.04, y0, hh, dr.state);
        }
      }
    });
  };
  // a roof (visual; sight stops at it: terrain roofBlocks): a thin box over the whole shell at S.roof
  const roofOf = (S, m) => T0(`${S.id}.roof`, { of: S.id, kind: 'roof', mat: S.mat, x: S.cx, y: S.base + S.roof, z: S.cz, yaw: S.yaw, w: S.hw * 2 + 2 * m, h: 0.25, l: S.hd * 2 + 2 * m });
  // ---- the Barn: 36 x 14, timber, roofed at the eaves (6.5 m); many gaps in its boards; the hayloft along its east gable
  {
    const S = frame('barn', 'barn', 'the Barn', 30, 70, 0, 18, 7, 6.5, { mat: 'timber', doorMat: 'timber' });
    const big = (tag) => ({ tag, type: 'big', leaves: 2, state: 'open' }), per = (tag) => ({ tag, type: 'person', state: 'open' }), sh = (tag) => ({ tag, type: 'shutter', leaves: 2, state: 'open' });
    const WN = [1.8, 0.5, 3.4];      // window gaps: width, sill, lintel (a head goes through, never the chest; shutters close them)
    rect(S, 18, 7, 6.5, 0.4, [
      [0, 5, 1.9, 0, 4.6, big('N')], [2, 6, 1.9, 0, 4.6, big('S')],                   // big doors: N at x 35 (by the loft), S at x 24 (into a stall bay)
      [3, 2, 1.0, 0, 2.1, per('W')], [1, 1.8, 1.0, 0, 2.1, per('E')],               // person doors: W at z 72, E at z 68.2
      ...[-15, -10, -5, 0, 10, 12.5].map((c, i) => [0, c, ...WN, sh('wN' + i)]),            // windows along the north side
      ...[14, 9, 3.5, -1, -6, -11].map((c, i) => [2, c, ...WN, sh('wS' + i)]),             // and the south
      [3, -3.5, ...WN, sh('wW0')], [3, 5, ...WN, sh('wW1')],                          // the west gable
      [0, 15.2, 3.0, 3.2, 6.0], [2, -15.2, 3.0, 3.2, 6.0], [1, 4, 3.0, 3.2, 6.0], [1, -1, 3.0, 3.2, 6.0],      // hay hatches at loft height: N, S, two in the E gable
      [1, -4.5, 1.0, 3.2, 5.3],                                                         // the loft's door onto the catwalk (a person's width)
    ], 'timber');
    // inside: a spine wall (a gap for a person), stalls along the walls, a tack room: each opening reaches a different part
    wallL(S, -13, 0, -3, 0, 0.3, 3.0, 'timber'); wallL(S, -1.9, 0, 6, 0, 0.3, 3.0, 'timber');
    for (const lx of [-15, -11]) wallL(S, lx, 7, lx, 3, 0.25, 2.6, 'timber');           // stalls by the north wall
    for (const lx of [-9, -1]) wallL(S, lx, -7, lx, -3.5, 0.25, 2.6, 'timber');         // a stall bay inside the S door
    wallL(S, -18, -3, -13, -3, 0.25, 2.6, 'timber'); wallL(S, -13, -3, -13, -6.4, 0.25, 2.6, 'timber');      // a tack room in the SW corner
    S.roof = 6.5; S.hide = { x: 22, z: 66.5 }; roofOf(S, 0.3);
    refuges.push({ name: 'barn floor', of: 'barn', rect: [12.4, 63.4, 47.6, 76.6], y: null });
  }
  // ---- the Hayloft: a platform at 3 m along the barn's east gable (climbed: the ladder inside; the catwalk to the silo outside)
  {
    const LH = 3.0, S = frame('loft', 'tower', 'the Loft', 45.2, 70, 0, 2.6, 6.4, LH, { mat: 'hay', base: structures.find((s) => s.id === 'barn').base });
    for (let lz = -6.3; lz <= 6.31; lz += 0.7) slabL(S, -2.6, lz, 2.6, lz, 0.5, LH - 0.25, LH, 'timber');
    S.ladder = { x: 41.8, z: 72 }; S.ladders = [{ x: 41.8, z: 72, at: [-2.2, 2] }, { x: 61.5, z: 74.5, at: [2.2, 4.5] }];
    T0('loft.ladder.0', { of: 'loft', kind: 'ladder', mat: 'wood', x: 42.4, y: S.base, z: 72, yaw: Math.PI / 2, w: 0.1, h: LH + 1, l: 0.6, collide: 'upright' });
    T0('loft.catwalk', { of: 'loft', kind: 'catwalk', mat: 'steel', x: 50.85, y: S.base + LH + 0.2, z: 74.5, yaw: Math.PI / 2, w: 1.0, h: 0.1, l: 5.7, collide: 'overhead', rail: 1.0 });   // the bridge to the silo: a deck at 3.2 m with rails to 4.3 m, solid for anything taller than the gap under it (not walkable: you are clamped to the loft)
    for (const [lx, lz, nx, nz] of [[0, 6.4, 0, 1], [0, -6.4, 0, -1], [2.6, -4, 1, 0], [2.6, 1, 1, 0]]) opening(S, lx, lz, nx, nz, 3.0, LH + 0.8, true);      // the hay hatches
    opening(S, -2.6, 0, -1, 0, 8, LH + 0.8, true);          // the open west edge over the barn floor
    S.hide = { x: 44, z: 73.5 }; S.roofPanel = true;
    refuges.push({ name: 'loft', of: 'loft', rect: [42.8, 63.8, 47.6, 76.2], y: S.base + LH, up: true });
  }
  // ---- the Silo (the catwalk's far end; solid)
  {
    const S = frame('silo', 'silo', 'the Silo', 57, 74.5, 0, 3.3, 3.3, 14, { mat: 'steel', walkIn: true });
    for (let k = 0; k < 14; k++) { const a0 = k / 14 * 6.283, a1 = (k + 1) / 14 * 6.283; wallL(S, Math.sin(a0) * 3.1, Math.cos(a0) * 3.1, Math.sin(a1) * 3.1, Math.cos(a1) * 3.1, 0.4, 14, 'steel'); }
    T0('silo.ladder', { of: 'silo', kind: 'ladder', mat: 'steel', x: 60.6, y: S.base, z: 74.5, yaw: Math.PI / 2, w: 0.1, h: 13, l: 0.6, collide: 'upright' });
  }
  // ---- the Service Yard: the Warehouse and the Containers
  {
    const S = frame('warehouse', 'warehouse', 'the Warehouse', -54, 67, 0, 10, 7, 7, { mat: 'steel', doorMat: 'steel' });
    const WW = [1.8, 1.0, 3.0];      // broken windows
    rect(S, 10, 7, 7, 0.35, [[1, 0, 2.4, 0, 2.3], [2, 6, 1.0, 0, 2.1, { tag: 'S', type: 'person', state: 'open' }], [2, -4, ...WW], [0, -5, ...WW], [0, -0.5, ...WW], [0, 4, ...WW], [3, 2.5, ...WW], [3, -3.5, ...WW], [1, 4.6, ...WW], [1, -4.6, ...WW]], 'steel');
    T0('warehouse.roller', { of: 'warehouse', kind: 'slab', mat: 'steel', x: -44, y: S.base + 2.3, z: 67, yaw: 0, w: 0.2, h: 4.7, l: 3.2, visualOnly: true });      // the roller door, stuck half up
    for (const lz of [2.5, -2.5]) wallL(S, -7, lz, 4, lz, 0.9, 3.4, 'steel');            // racks
    S.roof = 7; S.hide = { x: -60, z: 70 }; roofOf(S, 0.3);
    refuges.push({ name: 'warehouse', of: 'warehouse', rect: [-63.6, 60.4, -44.4, 73.6], y: null });
  }
  {
    const S = frame('containers', 'containers', 'the Containers', -30, 68, 0, 5.3, 6.1, 5.2, { mat: 'container' });
    for (const lx of [-3.8, 0, 3.8]) { for (const [a, b, c, d] of [[-1.15, -6, 1.15, -6], [1.15, -6, 1.15, 6], [1.15, 6, -1.15, 6], [-1.15, 6, -1.15, -6]]) wallL(S, lx + a, b, lx + c, d, 0.3, 5.2, 'container'); }
    for (const lx of [-1.9, 1.9]) { opening(S, lx, 6.2, 0, 1, 1.0, 1.0); opening(S, lx, -6.2, 0, -1, 1.0, 1.0); }
    S.hide = { x: -31.9, z: 68 };
    refuges.push({ name: 'container gaps', of: 'containers', rect: [-32.4, 61.9, -27.6, 74.1], y: null, onlyGaps: [-31.9, -28.1] });
  }
  // ---- the Visitor-Centre Ruins: columns 2.2 m apart under two surviving roof slabs, a low broken wall on the west
  {
    const S = frame('ruins', 'ruins', 'the Ruins', -58, 20, 0, 12, 9, 3.6, { mat: 'concrete' });
    for (let i = 0; i <= 10; i++) for (let j = 0; j <= 8; j++) post(S, -11 + 2.2 * i, -8.8 + 2.2 * j, 0.28, 3.6, 'concrete');
    S.roofs = [[-11.4, 0, 0.2, 9.2], [2, -9.2, 11.4, -2]];      // [lx0, lz0, lx1, lz1]: the slabs still up
    for (const [a, b, c, d] of S.roofs) for (let lz = b; lz <= d + 0.01; lz += 0.7) slabL(S, a, lz, c, lz, 0.5, 3.6, 3.95, 'concrete');
    wallL(S, -12.4, -9.2, -12.4, 2, 0.4, 1.1, 'block');
    for (const [lx, lz, nx, nz] of [[0, 9.2, 0, 1], [0, -9.2, 0, -1], [12.2, 0, 1, 0], [-12.2, 5, -1, 0]]) opening(S, lx, lz, nx, nz, 1.9, 1.0);
    S.hide = { x: -60.2, z: 24.4 };
    refuges.push({ name: 'ruins', of: 'ruins', rect: [-70, 11, -46, 29], y: null });
  }
  // ---- the Gatehouse by the shut main gate
  {
    const S = frame('gatehouse', 'gatehouse', 'the Gatehouse', -7, 95, 0, 3, 2.5, 3, { mat: 'concrete', doorMat: 'steel' });
    rect(S, 3, 2.5, 3, 0.3, [[2, 0.6, 1.0, 0, 2.1, { tag: 'S', type: 'person', state: 'closed' }], [1, 0, 1.7, 0.9, 2.7], [3, 0, 1.0, 0.9, 2.1]], 'concrete');
    S.roof = 3; S.hide = { x: -7.6, z: 95.6 }; roofOf(S, 0.3);
    for (let lz = -2.5; lz <= 2.51; lz += 0.7) slabL(S, -3, lz, 3, lz, 0.5, 3.0, 3.3, 'concrete');      // a concrete roof the head cannot come down through
    refuges.push({ name: 'gatehouse', of: 'gatehouse', rect: [-9.7, 92.8, -4.3, 97.2], y: null });
  }
  // ---- the Feeding Tower on the Lawn: a platform at 4.4 m on a 12 m frame with a hoist arm
  {
    const S = frame('tower', 'tower', 'the Feeding Tower', -4, -16, 0.25, 1.6, 1.6, 4.4, { mat: 'wood' });
    for (const [i, j] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) post(S, i * 1.6, j * 1.6, 0.22, 12, 'wood');
    const [lx, lz] = S.local(0, 2.1); S.ladder = { x: lx, z: lz }; S.ladders = [{ x: lx, z: lz, at: [0, 1.2] }];
    for (const [i, j] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) opening(S, i * 1.6, j * 1.6, i, j, 3, 4.4 + 0.8, true);
    T0('tower.mast', { of: 'tower', kind: 'mast', mat: 'wood', x: S.cx, y: S.base + 4.4, z: S.cz, yaw: 0.25, w: 3.7, h: 0.18, l: 3.7, collide: 'overhead' });
    T0('tower.arm', { of: 'tower', kind: 'mast', mat: 'steel', ...(([x, z]) => ({ x, z }))(S.local(0, -3)), y: S.base + 11.6, yaw: 0.25, w: 0.25, h: 0.25, l: 6 });
    refuges.push({ name: 'feeding tower', of: 'tower', rect: null, pts: [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => S.local(a * 1.2, b * 1.2)), y: S.base + 4.4, up: true });
  }
  // ---- the yard lamps: five poles with sodium heads round the Service Yard (a concrete foot 0.5 m square, a 6.2 m steel pole).
  // Solid: a thin cylinder of the foot's width, so the body knocks against and shoulders past one as it does a tower leg.
  // (the fourth stood at x -20, 4.7 m off the Containers' east face: a solid pole in that lane made the corner chase clip it and take 16 s, not 9.5; it is at -17 now)
  // (no structure: `of` is 'lamps'; terrain.js makes a pole of every 'pole' thing; src/view/features.js draws them)
  [[-40, 55], [-67, 53], [-37, 80], [-17, 64], [-50, 84]].forEach(([x, z], i) => T0(`lamp.pole.${i}`, { of: 'lamps', kind: 'pole', mat: 'steel', x, y: ground(x, z), z, yaw: 0, r: 0.25, h: 6.2 }));
  // ---- the Culvert: a concrete pipe across the river bed, dry inside, open at both ends
  {
    const cv = L.culvert, S = frame('culvert', 'culvert', 'the Culvert', cv.x, cv.z, 0, 1.0, cv.hd, 2.3, { mat: 'pipe', base: RV.wl + 0.35 });
    for (const sx of [-1, 1]) { wallL(S, sx * 1.33, -cv.hd, sx * 1.33, cv.hd, 0.6, 1.9, 'pipe'); for (const e of [-1, 1]) slabL(S, sx * 0.95, e * cv.hd, sx * 0.95, e * 1.3, 0.64, 1.95, 2.4, 'pipe'); }
    for (const e of [-1, 1]) slabL(S, 0, e * cv.hd, 0, e * 1.3, 0.9, 2.2, 2.5, 'pipe');      // the crown, broken through in mid-river: a hole the snout can come down
    opening(S, 0, 0, 0, 0.01, 2.2, 2.2, true);
    for (const e of [1, -1]) opening(S, 0, e * (cv.hd + 0.1), 0, e, 1.6, 0.9);
    S.roof = 2.3; S.crouch = true; S.hide = { x: cv.x, z: cv.z - 4 };
    refuges.push({ name: 'culvert', of: 'culvert', rect: [-0.6, cv.z - cv.hd, 0.6, cv.z + cv.hd], y: null });
  }
  // ---- the Cave in the bluff: roofed by rock (the walls are the bluff itself); the animal lies up in it
  {
    const S = frame('cave', 'cave', 'the Cave', (C.x0 + C.x1) / 2, (C.z0 + C.z1) / 2, 0, (C.x1 - C.x0) / 2, (C.z1 - C.z0) / 2, C.roof, { mat: 'rock', walkIn: true });
    for (let lz = -S.hd; lz <= S.hd + 0.01; lz += 0.75) slabL(S, -S.hw - 0.3, lz, S.hw + 0.5, lz, 0.6, C.roof, B.top + 0.2, 'rock');
    S.roof = C.roof;
  }
  // ---- two rubble lines along the bluff's top edge above the ledge (gaps a person slips through): the animal cannot stand at the
  // brink there to lean down at it, nor blunder onto the ledge's top end
  {
    const S = frame('rubble', 'rubble', 'the brink', 79, 60, 0, 1.5, 26, 1.6, { mat: 'rock', walkIn: true, base: B.top });
    for (let z = B.ledge1 - 8; z <= B.ledge0 + 4; z += 3.0) for (const [dx, dz] of [[2.2, 0], [4.4, 1.5]]) { const fx = B.face + 0.8 * Math.sin((z + dz) / 9); T0(`rubble.post.${S.n++}`, { of: 'rubble', kind: 'post', mat: 'rock', x: fx + dx, y: B.top - 0.3, z: z + dz, yaw: 0, r: 1.05, h: 1.8 }); }
  }
  // ---- the Jetty: a boardwalk on posts across the river (its deck is ground: see surf)
  {
    const J = L.jetty, S = frame('jetty', 'jetty', 'the Jetty', J.x, (J.z0 + J.z1) / 2, 0, J.half, (J.z1 - J.z0) / 2, 1, { mat: 'wood', walkIn: true, base: RV.wl - 0.9 });
    for (let z = J.z0 + 0.5; z <= J.z1; z += 2.6) for (const sx of [-1, 1]) T0(`jetty.post.${S.n++}`, { of: 'jetty', kind: 'post', mat: 'wood', x: J.x + sx * (J.half + 0.12), y: RV.wl - 0.9, z, yaw: 0, r: 0.12, h: 2.3 });
    T0('jetty.deck', { of: 'jetty', kind: 'deck', mat: 'wood', x: J.x, y: RV.wl + 0.38, z: (J.z0 + J.z1) / 2, yaw: 0, w: J.half * 2, h: 0.12, l: J.z1 - J.z0 });
  }
  // ---- the perimeter fence (the main gate beside the gatehouse is shut and part of it)
  {
    const S = frame('fence', 'fence', 'the fence', 0, 0, 0, 99.5, 99.5, 4.2, { mat: 'fence', walkIn: true, base: 0 });
    const f = L.fence;
    for (const [a, b, c, d] of [[-f, f, f, f], [f, f, f, -f], [f, -f, -f, -f], [-f, -f, -f, f]]) T0(`fence.wall.${S.n++}`, { of: 'fence', kind: 'wall', mat: 'fence', x: (a + c) / 2, y: -1, z: (b + d) / 2, yaw: Math.atan2(c - a, d - b), w: 0.3, h: 5.2, l: Math.hypot(c - a, d - b), ax: a, az: b, bx: c, bz: d });
  }

  // ---------------------------------------------------------------- the jungle and the bamboo screen (stems a person fits between)
  const trees = [], cover = [], grass = [], logs = [];
  const J = L.jungle, trail = J.trail;
  const trailD = (x, z) => { let m = 1e9; for (let i = 0; i < trail.length - 1; i++) { const [ax, az] = trail[i], [bx, bz] = trail[i + 1], dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return m; };
  const inJungle = (x, z) => z < -12 && x < jungleEdge(z) && z > riverZ(x) + L.river.half + 2.5 && x > -98;
  const inBamboo = (x, z) => x > L.bamboo.x0 && x < L.bamboo.x1 + 2 * Math.sin(z / 7) && z > L.bamboo.z0 && z < L.bamboo.z1;
  const stems = (inside, sp, r0, r1, h0, h1, zone, species, n, avoid) => {
    const G = 3, gm = new Map(), mine = [];
    const near = (x, z) => { for (let i = Math.floor(x / G) - 2; i <= Math.floor(x / G) + 2; i++) for (let j = Math.floor(z / G) - 2; j <= Math.floor(z / G) + 2; j++) for (const o of gm.get(i * 4096 + j) || []) if (Math.hypot(o.x - x, o.z - z) < sp) return true; return false; };
    for (let k = 0; k < n * 40 && mine.length < n; k++) {
      const x = R.range(-100, 0), z = R.range(-100, 100); if (!inside(x, z) || avoid(x, z) || near(x, z)) continue;
      const o = { x, z, r: R.range(r0, r1), h: R.range(h0, h1), seed: (R() * 1e6) | 0, kind: 'tree', species, zone }; mine.push(o); trees.push(o);
      const key = Math.floor(x / G) * 4096 + Math.floor(z / G); (gm.get(key) || gm.set(key, []).get(key)).push(o);
    }
    return mine;
  };
  // jungle: stems 2.6-3.2 m apart (clear gaps under 3 m), the game trail and the clearing kept open for the animal
  const jt = stems(inJungle, 2.5, 0.3, 0.5, 14, 24, 'jungle', 'jungle', 900, (x, z) => trailD(x, z) < J.trailHalf || Math.hypot(x - J.clearing.x, z - J.clearing.z) < J.clearing.r);
  const bm = stems(inBamboo, 2.2, 0.35, 0.55, 7, 10, 'bamboo', 'bamboo', 600, (x, z) => Math.hypot(x + 92, z - 72) < 5 && false);
  jt.forEach((o, i) => T0(`jungle.trunk.${i}`, { of: 'jungle', kind: 'trunk', mat: 'jungle', x: o.x, y: 0, z: o.z, yaw: 0, r: o.r, h: o.h }));
  bm.forEach((o, i) => T0(`bamboo.trunk.${i}`, { of: 'bamboo', kind: 'trunk', mat: 'bamboo', x: o.x, y: 0, z: o.z, yaw: 0, r: o.r, h: o.h }));
  // fallen logs on the jungle floor (low things: part of the ground, like terrain.js's `logs` says: the feet step onto and over a
  // ridge 0.4 to 0.8 m high, a person cannot climb it, the route planner reads it as steep ground). Off the trail and the clearing,
  // clear of every stem. Own rng so nothing else's random draws move. src/view/world.js draws terrain.logs.
  { const RL = makeRng(seed * 4099 + 77), tr = J.trail, td = (x, z) => { let m = 1e9; for (let i = 0; i < tr.length - 1; i++) { const [ax, az] = tr[i], [bx, bz] = tr[i + 1], dx = bx - ax, dz = bz - az, t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1); m = Math.min(m, Math.hypot(x - ax - dx * t, z - az - dz * t)); } return m; };
    for (let k = 0; k < 600 && logs.length < 26; k++) {
      const x = RL.range(-97, -16), z = RL.range(-76, -14), a = RL() * 6.283, Ln = RL.range(3, 7), r = RL.range(0.25, 0.5), ux = Math.sin(a), uz = Math.cos(a);
      let ok = inJungle(x, z) && td(x, z) > 3.5 && Math.hypot(x - J.clearing.x, z - J.clearing.z) > J.clearing.r + Ln / 2 + 1;
      for (let u = -Ln / 2; ok && u <= Ln / 2; u += 0.7) { const px = x + ux * u, pz = z + uz * u; ok = inJungle(px, pz) && !jt.some((o) => Math.hypot(o.x - px, o.z - pz) < o.r + r + 0.3); }
      if (ok) logs.push({ x, z, yaw: a, cx: ux, cz: uz, half: Ln / 2 - 0.7 * r, r, lift: 0.58 * r });
    } }
  refuges.push({ name: 'jungle', of: 'jungle', fn: inJungle, rect: [-98, -76, -15, -12], y: null });
  refuges.push({ name: 'bamboo screen', of: 'bamboo', fn: inBamboo, rect: [-99, -6, -83, 93], y: null });
  refuges.push({ name: 'bluff ledge', of: 'bluff', ledge: true, rect: [72.5, 34, 76, 86], y: null });
  // understory ferns in the jungle, reeds round the pond and along the river banks
  for (let k = 0, n = 0; k < 400 && n < 9; k++) { const x = R.range(-96, -18), z = R.range(-76, -14); if (!inJungle(x, z) || cover.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue; cover.push({ x, z, r: R.range(4.5, 7), seed: (R() * 1e6) | 0 }); n++; }
  for (let a = 0; a < 6.283; a += 0.5) { const rr = pondR(L.pond.x + Math.sin(a), L.pond.z + Math.cos(a)) + 1.4, x = L.pond.x + Math.sin(a) * rr, z = L.pond.z + Math.cos(a) * rr; if (x < 97) grass.push({ x, z, r: R.range(2.6, 3.8), h: 2.1, kind: 'reed' }); }
  for (let x = -60; x < 95; x += R.range(14, 22)) { if (Math.abs(x - L.jetty.x) < 5 || Math.abs(x - L.culvert.x) < 5) continue; const sd = R() < 0.5 ? 1 : -1; grass.push({ x, z: riverZ(x) + sd * (L.river.half + 1.8), r: R.range(2.4, 3.6), h: 2.0, kind: 'reed' }); }
  for (const [x, z, r] of [[-12, -46, 6], [12, -52, 5], [44, 30, 5]]) grass.push({ x, z, r, h: 1.6, kind: 'grass' });

  // ---------------------------------------------------------------- zones, water, cover (1 m bake)
  const MW = 1, MB = 110, MN = Math.round(2 * MB / MW) + 1;
  const waterY = new Float32Array(MN * MN), wet = new Uint8Array(MN * MN), zone = new Uint8Array(MN * MN), chan = new Float32Array(MN * MN * 3);
  const ZONES = ['the lawn', 'the field', 'the barn', 'the loft', 'the silo', 'the yard', 'the warehouse', 'the containers', 'the ruins', 'the jungle', 'the bamboo', 'the bluff', 'the ledge', 'the cave', 'the river', 'the pond', 'the jetty', 'the culvert', 'the gatehouse', 'the berm', 'the trail', 'the tower'];
  const ZI = Object.fromEntries(ZONES.map((n, i) => [n, i]));
  const inRect = (x, z, r, m = 0) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m;
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) {
    const x = -MB + i * MW, z = -MB + j * MW, k = i + MN * j, h = ground(x, z);
    let wy = h - 0.6, w = 0, zn = ZI['the field'], cx = 0, cz = 0, cg = 0;
    const dr = Math.abs(z - riverZ(x)), dp = Math.hypot(x - L.pond.x, z - L.pond.z), inCulvert = Math.abs(x - L.culvert.x) < 1.7 && Math.abs(z - L.culvert.z) < L.culvert.hd;
    if (!inCulvert && (dr < RV.half + 0.6 || (dp < L.pond.r + 4 && dp < pondR(x, z) + 0.6) || (x > 87 && x < 95 && z < -58 && z > riverZ(x)))) wy = RV.wl;
    if (dr < RV.half + RV.bank + 2) { w = Math.max(w, 0.5 * (1 - sstep(RV.half, RV.half + RV.bank + 2, dr))); cx = 1; cz = 0.05; cg = 0.6 * (1 - sstep(RV.half, RV.half + 6, dr)); }
    if (wy - h > 0) w = 1;
    const bl = bluffH(x, z), fx = B.face + 0.8 * Math.sin(z / 9);
    if (inRect(x, z, [C.x0 - 0.5, C.z0, C.x1, C.z1])) zn = ZI['the cave'];
    else if (bl > 1 && x < fx + 0.1 && z < B.ledge0 + 3) zn = ZI['the ledge'];
    else if (bl > 1 || (x > fx && z > B.z0)) zn = ZI['the bluff'];
    else if (wy - h > 0.05) zn = dp < L.pond.r + 4 ? ZI['the pond'] : ZI['the river'];
    else if (Math.abs(x - L.jetty.x) < 1.5 && z > L.jetty.z0 && z < L.jetty.z1) zn = ZI['the jetty'];
    else if (inCulvert) zn = ZI['the culvert'];
    else if (inRect(x, z, [10, 58, 50, 82])) zn = ZI['the barn'];
    else if (Math.hypot(x - 57, z - 74.5) < 3.6) zn = ZI['the silo'];
    else if (inRect(x, z, [-66, 58, -42, 76])) zn = ZI['the warehouse'];
    else if (inRect(x, z, [-35.5, 61.5, -24.5, 74.5])) zn = ZI['the containers'];
    else if (inRect(x, z, [-73, 48, -24, 90])) zn = ZI['the yard'];
    else if (inRect(x, z, [-71, 10, -45, 30])) zn = ZI['the ruins'];
    else if (inRect(x, z, [-11, 92, -3, 98.5])) zn = ZI['the gatehouse'];
    else if (inJungle(x, z)) zn = trailD(x, z) < J.trailHalf || Math.hypot(x - J.clearing.x, z - J.clearing.z) < J.clearing.r ? ZI['the trail'] : ZI['the jungle'];
    else if (inBamboo(x, z)) zn = ZI['the bamboo'];
    else if (Math.hypot(x + 4, z + 16) < 3) zn = ZI['the tower'];
    else if (h - noise(x, z) > 0.8) zn = ZI['the berm'];
    else if (Math.hypot((x - L.lawn.x) / L.lawn.rx, (z - L.lawn.z) / L.lawn.rz) < 1) zn = ZI['the lawn'];
    waterY[k] = wy; wet[k] = Math.round(clamp(w, 0, 1) * 255); zone[k] = zn; chan[k * 3] = cx; chan[k * 3 + 1] = cz; chan[k * 3 + 2] = cg;
  }
  const bil = (A, x, z, def) => {
    const fx = (x + MB) / MW, fz = (z + MB) / MW;
    if (fx < 0 || fz < 0 || fx >= MN - 1 || fz >= MN - 1) return def;
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = i + MN * j;
    return A[k] * (1 - u) * (1 - v) + A[k + 1] * u * (1 - v) + A[k + MN] * (1 - u) * v + A[k + MN + 1] * u * v;
  };
  const cell = (x, z) => { const i = Math.round((x + MB) / MW), j = Math.round((z + MB) / MW); return i < 0 || j < 0 || i >= MN || j >= MN ? -1 : i + MN * j; };
  const cov = new Uint8Array(MN * MN), covH = new Uint8Array(MN * MN), shelter = new Uint8Array(MN * MN), covF = new Float32Array(MN * MN);
  const stamp = (f, fn) => {
    const i0 = Math.max(0, Math.floor((f.x - f.r + MB) / MW)), i1 = Math.min(MN - 1, Math.ceil((f.x + f.r + MB) / MW)), j0 = Math.max(0, Math.floor((f.z - f.r + MB) / MW)), j1 = Math.min(MN - 1, Math.ceil((f.z + f.r + MB) / MW));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const x = -MB + i * MW, z = -MB + j * MW, d = Math.hypot(x - f.x, z - f.z); if (d < f.r) fn(i + MN * j, x, z, d); }
  };
  for (const f of cover) stamp(f, (k, x, z, d) => { const v = 1 - (d / f.r) ** 3; if (v > covF[k]) { covF[k] = v; covH[k] = 50; } });
  for (const g of grass) stamp(g, (k, x, z, d) => { const v = 0.9 * (1 - (d / g.r) ** 2.2) * (0.85 + 0.15 * vnoise(x / 2.5, z / 2.5, seed + 13)); if (v > covF[k] * 0.95) { if (v > covF[k]) covF[k] = v; covH[k] = Math.round(g.h * 50); } });
  for (let k = 0; k < MN * MN; k++) cov[k] = Math.round(clamp(covF[k], 0, 1) * 255);
  for (let j = 0; j < MN; j++) for (let i = 0; i < MN; i++) { const x = -MB + i * MW, z = -MB + j * MW; if (inJungle(x, z) || inBamboo(x, z)) shelter[i + MN * j] = 255; }
  { const S2 = new Uint8Array(shelter); for (let j = 2; j < MN - 2; j++) for (let i = 2; i < MN - 2; i++) { let s = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) s += S2[i + a + MN * (j + b)]; shelter[i + MN * j] = s / 25; } }

  const P = {
    seed, ground, B: BK, ST, N, F, LAYOUT, things, structures, refuges, riverZ, pondR,
    rocks: [], trees, logs, cover, grass, zones: ZONES, inWood: (x, z) => inJungle(x, z) || inBamboo(x, z), inJungle, inBamboo,
    pond: { x: L.pond.x, z: L.pond.z, r: L.pond.r, depth: L.pond.depth, level: RV.wl, R: pondR }, river: { ...RV, z: riverZ },
    /** Water surface height here, or a value below the ground where there is none. */
    waterY: (x, z) => bil(waterY, x, z, -1e9),
    /** Depth of standing or running water (m); 0 where dry. */
    depthAt: (x, z) => { const d = bil(waterY, x, z, -1e9) - ground(x, z); return d > 0 ? d : 0; },
    /** 0 dry .. 1 in water: wet ground holds no scent trail, splashes, slows. */
    wetAt: (x, z) => bil(wet, x, z, 0) / 255,
    /** 0..1 how well something low hides a person here (ferns, tall grass, reeds). */
    coverAt: (x, z) => bil(cov, x, z, 0) / 255,
    /** Height of the cover here (m): ferns ~1 hide a crouching person, grass ~1.6 and reeds ~2 a standing one. */
    coverHeight: (x, z) => { const k = cell(x, z); return k < 0 ? 0 : covH[k] / 50; },
    /** Name of the place (x, z) is in, for thoughts and readouts. */
    placeName: (x, z) => { const k = cell(x, z); return k < 0 || Math.max(Math.abs(x), Math.abs(z)) > L.fence ? 'beyond the fence' : ZONES[zone[k]]; },
    /** Wind as it is here: calmed among the stems (jungle, bamboo), drawn along the river. */
    windAt: (x, z, w, out = { x: 0, z: 0 }) => {
      const sh = bil(shelter, x, z, 0) / 255, k = cell(x, z), m = Math.hypot(w.x, w.z), g = k < 0 ? 0 : chan[k * 3 + 2];
      let wx = w.x * (1 - 0.72 * sh), wz = w.z * (1 - 0.72 * sh);
      if (g > 0.05) { const s = Math.max(0.6, m * 0.6) * Math.sign(w.x || 1); wx = lerp(wx, chan[k * 3] * s, g); wz = lerp(wz, chan[k * 3 + 1] * s, g); }
      out.x = wx; out.z = wz; return out;
    },
    /** How much the ground here slows a walker (1 = not at all): wading, deeper is slower (the animal's long legs mind it less). */
    speedFactor: (x, z, who = 'person') => { const d = Math.max(0, bil(waterY, x, z, -1e9) - ground(x, z)); return who === 'person' ? 1 - 0.65 * clamp(d / 0.9, 0, 1) : 1 - 0.35 * clamp(d / 1.2, 0, 1); },
    /** What the ground is here: 'water' | 'mud' | 'marsh' | 'gravel' | 'rock' | 'forest' | 'track' | 'grass'. */
    surfaceAt: (x, z) => {
      const k = cell(x, z); if (k < 0) return 'grass';
      const d = bil(waterY, x, z, -1e9) - ground(x, z), zn = ZONES[zone[k]];
      if (d > 0.04) return 'water';
      if (zn === 'the cave' || zn === 'the ledge' || zn === 'the culvert' || zn === 'the warehouse' || zn === 'the containers' || zn === 'the ruins' || zn === 'the gatehouse') return 'rock';
      const e = 0.6, sl = Math.hypot(ground(x + e, z) - ground(x - e, z), ground(x, z + e) - ground(x, z - e)) / (2 * e);
      if (sl > 0.95) return 'rock';
      if (zn === 'the yard') return 'gravel';
      if (zn === 'the barn' || zn === 'the jetty') return 'track';
      if (wet[k] > 90) return 'marsh';
      if (zn === 'the jungle' || zn === 'the bamboo' || zn === 'the trail') return 'forest';
      return 'grass';
    },
  };
  // the dressing library's prefab for each thing (src/view/arenaassets.js kinds), where one exists; null: keep the blockout
  const PREFAB = { 'barn/wall': 'barn.wall', 'barn/slab': 'barn.wall', 'barn/roof': 'barn.roof', 'loft/slab': 'barn.loft', 'silo/wall': 'barn.silo', 'warehouse/wall': 'warehouse', 'warehouse/slab': 'warehouse',
    'warehouse/roof': 'warehouse', 'containers/wall': 'container', 'ruins/post': 'ruin.column', 'ruins/slab': 'ruin.slab', 'ruins/wall': 'ruin.wall', 'gatehouse/wall': 'gatehouse', 'gatehouse/slab': 'gatehouse',
    'gatehouse/roof': 'gatehouse', 'tower/post': 'tower', 'tower/mast': 'tower', 'culvert/wall': 'culvert', 'culvert/slab': 'culvert', 'cave/slab': 'rock.cave', 'rubble/post': 'rock.boulder',
    'jetty/post': 'jetty', 'jetty/deck': 'boardwalk', 'fence/wall': 'fence.panel', 'jungle/trunk': 'tree.palm', 'bamboo/trunk': 'bamboo' };
  for (const t of things) t.prefab = t.kind === 'door' ? (t.door.type === 'big' ? 'door.big' : t.door.type === 'person' ? 'door.small' : null) : t.id === 'warehouse.roller' ? 'door.roller' : PREFAB[`${t.of}/${t.kind}`] || null;
  P.place = Object.fromEntries(structures.map((S) => [S.id, { x: S.cx, z: S.cz, yaw: S.yaw }]));
  P.landmarks = [
    { name: 'the Lawn', x: 4, z: 8, kind: 'open' }, { name: 'the Feeding Tower', x: -4, z: -16, kind: 'structure' }, { name: 'the Barn', x: 30, z: 70, kind: 'structure' },
    { name: 'the Silo', x: 57, z: 80, kind: 'structure' }, { name: 'the Warehouse', x: -54, z: 52, kind: 'structure' }, { name: 'the Containers', x: -30, z: 80, kind: 'structure' },
    { name: 'the Yard', x: -40, z: 52, kind: 'open' }, { name: 'the Ruins', x: -58, z: 34, kind: 'structure' }, { name: 'the Jungle', x: -62, z: -52, kind: 'forest' },
    { name: 'the Jungle Edge', x: -20, z: -40, kind: 'forest' }, { name: 'the Bamboo', x: -80, z: 40, kind: 'forest' }, { name: 'the Bluff', x: 88, z: 10, kind: 'high' },
    { name: 'the Cave', x: 79.5, z: 22, kind: 'rocks' }, { name: 'the Ledge Foot', x: 70, z: 88, kind: 'high' }, { name: 'the Pond', x: 60, z: -40, kind: 'water' },
    { name: 'the River', x: -40, z: -84, kind: 'water' }, { name: 'the Jetty', x: 23, z: -66, kind: 'crossing' }, { name: 'the Culvert', x: 0, z: -68, kind: 'crossing' },
    { name: 'the Gatehouse', x: -7, z: 89, kind: 'structure' }, { name: 'the North Berm', x: -9, z: 39, kind: 'rocks' }, { name: 'the South Field', x: 0, z: -50, kind: 'open' },
  ];
  /** Open grazing for prey: the south field, the meadow between the lawn and the barn, the strip below the bluff. */
  P.grazing = [{ x: -2, z: -50, r: 13 }, { x: 22, z: 42, r: 10 }, { x: 58, z: 8, r: 10 }, { x: -40, z: 40, r: 9 }];
  cache.set(seed, P);
  return P;
}

/** The respawn spot for a new life: of `spots`, those at least `minD` m from the animal (x, z, head height hy); of those, ones it cannot
 *  see (nothing solid on the line from its head to eye height there) come first; then the farthest. Null when none is 40 m away. */
export function pickRespawn(T, spots, ax, az, hy, minD = 40) {
  let best = null;
  for (const s of spots) {
    const d = Math.hypot(s.x - ax, s.z - az); if (d < minD) continue;
    const seen = T.segClear ? T.segClear(ax, hy, az, s.x, T.height(s.x, s.z) + 1.7, s.z, 0.1) : true, rank = (seen ? 0 : 1e4) + d;
    if (!best || rank > best.rank) best = { ...s, rank, seen, d };
  }
  return best;
}
