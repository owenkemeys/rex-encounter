// Lot B, the overflow car park outside the breached park (#lot): a tighter seeded layout with the same contract as
// src/paddock.js, so Terrain, Arena, the animal and World run on it unchanged.
//
// The plan (before the seeded east/west flip): the Ticket Kiosk and smashed park gate sit at the south end (z = -31/-38),
// the lit EXIT arch and waiting Park Ranger truck sit straight north at the far end of the avenue (z = +37). Two clean
// parking rows (A at z = -12, B at z = +14) flank a wide central avenue, holding ~20 to 25 cars in small clumps with
// generous driving aisles between them. The family's van stalled in the middle aisle (hazards blinking); from there the
// two visitors (one carrying a flashlight) dash to a cover gap in row B, then straight for the lit exit.
import { makeRng, clamp } from './math.js';

export const LOT_SEED = 42;
const FENCE = 38;

// footprints for collision; the drawn shapes are src/view/lotcars.js CAR_STYLES (keep w, l, h in step)
export const CAR_SPECS = {
  sedan:   { w: 1.84, l: 4.6,  h: 1.43, low: true,  colors: [0x263a52, 0x6e2424, 0x32463c, 0x6a6d70, 0x1c1e22, 0x766446, 0x9a9c98] },
  hatch:   { w: 1.78, l: 4.05, h: 1.5,  low: true,  colors: [0x7a2a22, 0x2c4f6e, 0xa8a9a4, 0x3a3d42, 0x8a7a3c, 0x41604a] },
  suv:     { w: 1.98, l: 4.8,  h: 1.76, low: false, colors: [0x263138, 0x4d382b, 0x2f4136, 0x77797c, 0x5c2b29, 0x15171a] },
  minivan: { w: 2.0,  l: 5.05, h: 1.78, low: false, colors: [0x88919a, 0x5a2a2a, 0x2f4660, 0xb4b2a8] },
  pickup:  { w: 2.04, l: 5.35, h: 1.84, low: false, colors: [0x2a4a35] },
};
const STALL_W = 3.2, STALL_L = 5.4, SPINE = 5.2, COLS = 7;
// Two single parking rows flanking the avenue: leaves wide 18 to 20 m open driving aisles so the rex runs, turns,
// climbs over sedans, and shoves/flips SUVs cleanly without feeling cramped or cluttered.
const ROWS = [
  { id: 'A', z: -13.5, yaw: 0 },
  { id: 'B', z: 14.5,  yaw: Math.PI },
];
const colX = (k) => SPINE + STALL_W / 2 + k * STALL_W;      // 6.8, 10.0, ... 26.0

const cache = new Map();

export function makeLotPaddock(seed = LOT_SEED) {
  if (cache.has(seed)) return cache.get(seed);
  const R = makeRng(seed * 9173 + 29);
  const flip = R() < 0.5 ? 1 : -1;      // the visitors' side of the avenue is +x before the flip
  const fx = (x) => x * flip;
  const pick = (a) => a[Math.floor(R() * a.length)];

  // ---- the stall grid (LotView paints exactly these)
  const stalls = [];
  for (const row of ROWS) for (const side of [1, -1]) for (let k = 0; k < COLS; k++) {
    stalls.push({ x: side * colX(k), z: row.z, yaw: row.yaw, row: row.id, side, k, car: null });
  }
  const stall = (row, side, k) => stalls.find((s) => s.row === row && s.side === side * flip && s.k === k);

  // ---- fill ~60% of stalls in neat clumps of 2 to 3 (~16 to 20 parked cars + van + ranger + 2 abandoned = ~20 to 24 total)
  for (const row of ROWS) for (const side of [1, -1]) {
    let k = Math.floor(R() * 2);
    while (k < COLS) {
      const run = 2 + Math.floor(R() * 1.7);
      for (let i = 0; i < run && k < COLS; i++, k++) stall(row.id, side, k).car = 'any';
      k += 1 + Math.floor(R() * 2.5);
    }
  }
  // Visitors' row B cover gap: flanked by 2 cars (columns laneB and laneB+1), with clear run to the exit past it
  const laneB = 1 + Math.floor(R() * 3);
  stall('B', 1, laneB).car = 'any';
  stall('B', 1, laneB + 1).car = 'any';
  if (laneB > 0) stall('B', 1, laneB - 1).car = null;      // open sightline toward the avenue & exit
  // Keep sightline from kiosk camera to stalled minivan unobstructed: clear inner stalls on visitor side of Row A
  stall('A', 1, 0).car = null;
  stall('A', 1, 1).car = null;
  const laneBx = fx(colX(laneB) + STALL_W / 2);

  // ---- puddles in the aisles (loud to splash through)
  const puddles = [
    { x: fx(-12 + (R() - 0.5) * 10), z: 0 + (R() - 0.5) * 6, rx: 6.5, rz: 4.0, depth: 0.16 },
    { x: fx(8 + (R() - 0.5) * 16), z: 25 + (R() - 0.5) * 5, rx: 6.0, rz: 3.6, depth: 0.15 },
  ];

  // ---- Flat drained asphalt inside Lot B, gentle earthen berm outside the fence
  const ground = (x, z) => {
    const edge = Math.max(Math.abs(x), Math.abs(z)) - FENCE;
    let h = 0;
    if (edge > 0) h += Math.min(3.2, edge * 0.08 + 0.32 * Math.sin(x * 0.09 + seed) * Math.cos(z * 0.09));
    for (const p of puddles) {
      const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
      if (d < 1.2) { const u = clamp(1 - d / 1.2, 0, 1); h -= p.depth * u * u; }
    }
    return h;
  };
  const depthAt = (x, z) => {
    let dep = 0;
    for (const p of puddles) {
      const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
      if (d < 1) dep = Math.max(dep, p.depth * (1 - d * d));
    }
    return dep;
  };
  const wetAt = (x, z) => (depthAt(x, z) > 0.01 ? 0.92 : Math.max(Math.abs(x), Math.abs(z)) < FENCE ? 0.62 : 0.35);

  const things = [], structures = [], refuges = [];
  const T0 = (id, o) => { things.push({ id, ...o }); return o; };

  // ---- the Ticket Kiosk at the south end, wide window facing north up the lot
  const kX = fx(-8.5), kZ = -31;
  const kBase = ground(kX, kZ), hw = 2.4, hd = 2.2, kh = 3.1;
  const addWall = (of, id, ax, az, bx, bz, w, h, mat, y0 = 0) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    T0(id, { of, kind: 'wall', mat, x: mx, y: kBase + y0, z: mz, yaw, w, h, l, ax, az, bx, bz, prefab: null });
  };
  addWall('gatehouse', 'gh.n.sill', kX - hw, kZ + hd, kX + hw, kZ + hd, 0.26, 1.05, 'concrete', 0);
  T0('gh.n.lintel', { of: 'gatehouse', kind: 'slab', mat: 'concrete', x: kX, y: kBase + 2.35, z: kZ + hd, yaw: Math.PI / 2, w: 0.26, h: 0.75, l: hw * 2, ax: kX - hw, az: kZ + hd, bx: kX + hw, bz: kZ + hd, prefab: null });
  addWall('gatehouse', 'gh.s', kX - hw, kZ - hd, kX + hw, kZ - hd, 0.26, kh, 'concrete', 0);
  const solidSide = kX - flip * hw, doorSide = kX + flip * hw;
  addWall('gatehouse', 'gh.side.solid', solidSide, kZ - hd, solidSide, kZ + hd, 0.26, kh, 'concrete', 0);
  addWall('gatehouse', 'gh.side.a', doorSide, kZ - hd, doorSide, kZ - 0.7, 0.26, kh, 'concrete', 0);
  addWall('gatehouse', 'gh.side.b', doorSide, kZ + 0.7, doorSide, kZ + hd, 0.26, kh, 'concrete', 0);
  T0('gh.side.lintel', { of: 'gatehouse', kind: 'slab', mat: 'concrete', x: doorSide, y: kBase + 2.25, z: kZ, yaw: 0, w: 0.26, h: 0.85, l: 1.4, ax: doorSide, az: kZ - 0.7, bx: doorSide, bz: kZ + 0.7, prefab: null });
  T0('gh.roof', { of: 'gatehouse', kind: 'roof', mat: 'concrete', x: kX, y: kBase + kh, z: kZ, yaw: 0, w: hw * 2 + 0.6, h: 0.22, l: hd * 2 + 0.6, prefab: null, visualOnly: true });

  structures.push({
    id: 'gatehouse', kind: 'gatehouse', name: 'the Ticket Kiosk',
    cx: kX, cz: kZ, yaw: 0, hw, hd, h: kh, base: kBase, roof: kh, mat: 'concrete',
    openings: [
      { x: kX, z: kZ + hd, nx: 0, nz: 1, w: 3.4, y: kBase + 1.65 },
      { x: doorSide, z: kZ, nx: flip, nz: 0, w: 1.4, y: kBase + 1.1 },
    ],
  });

  // ---- the fence: smashed park gate beside the kiosk (south), lit road exit at the far end of the avenue (north)
  const breachX = fx(9.5), breachZ = -FENCE, exitX = 0, exitZ = FENCE - 1;
  const fenceWall = (id, ax, az, bx, bz) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    T0(id, { of: 'fence', kind: 'wall', mat: 'fence', x: mx, y: ground(mx, mz), z: mz, yaw, w: 0.28, h: 4.5, l, ax, az, bx, bz, prefab: null });
  };
  fenceWall('fence.s1', -FENCE, -FENCE, breachX - 5, -FENCE);
  fenceWall('fence.s2', breachX + 5, -FENCE, FENCE, -FENCE);
  fenceWall('fence.n1', -FENCE, FENCE, -SPINE, FENCE);
  fenceWall('fence.n2', SPINE, FENCE, FENCE, FENCE);
  fenceWall('fence.e', FENCE, -FENCE, FENCE, FENCE);
  fenceWall('fence.w', -FENCE, -FENCE, -FENCE, FENCE);
  // bollards across the exit: people slip between them, the rex does not
  const evac = { x: exitX, z: exitZ, r: 2.4 };
  for (let i = -3; i <= 3; i++) if (i !== 0) {
    T0(`evac.post.${i + 3}`, { of: 'fence', kind: 'pole', mat: 'concrete', x: exitX + i * 1.5, y: ground(exitX + i * 1.5, FENCE), z: FENCE, r: 0.2, h: 1.1, prefab: null });
  }

  // ---- sodium lamps flanking the lot; by seed one is dead and one flickers
  const lights = [];
  for (const sd of [1, -1]) {
    lights.push({ id: `lamp.A${sd}`, x: sd * 15, z: -13.5, h: 9.2, state: 'on' });
    lights.push({ id: `lamp.B${sd}`, x: sd * 15, z: 14.5, h: 9.2, state: 'on' });
  }
  const dead = Math.floor(R() * lights.length); lights[dead].state = 'off';
  lights[(dead + 1 + Math.floor(R() * (lights.length - 1))) % lights.length].state = 'flicker';
  for (const L of lights) T0(L.id, { of: 'fence', kind: 'pole', mat: 'steel', x: L.x, y: ground(L.x, L.z), z: L.z, r: 0.2, h: L.h, prefab: null });

  // ---- the cars (~20 to 24 total: heavy on tramplable sedans/hatches plus solid SUVs/vans that shove and flip)
  const KINDS = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'hatch', 'suv', 'suv', 'minivan'];
  const cars = [];
  const car = (id, kind, role, x, z, yaw, extra = {}) => {
    const sp = CAR_SPECS[kind];
    const c = { id, kind, role, x, z, yaw, w: sp.w, l: sp.l, h: sp.h, low: !!sp.low, color: pick(sp.colors), locked: true, openDoor: false, hazards: false, lightsOn: false, alarmLeft: 2, ...extra };
    cars.push(c); return c;
  };
  // Ranger pickup with open tailgate + glowing red flare case: on the opposite side of the avenue from the visitors
  const rangerStall = stall(R() < 0.5 ? 'A' : 'B', -1, 1 + Math.floor(R() * 3)); rangerStall.car = 'ranger';
  for (const s of stalls) {
    if (!s.car) continue;
    const back = R() < 0.16, nose = s.yaw + (back ? Math.PI : 0);
    const x = s.x + (R() - 0.5) * 0.2, z = s.z + (R() - 0.5) * 0.24, yaw = nose + (R() - 0.5) * 0.06, id = `car.${s.row}${s.side > 0 ? 'e' : 'w'}${s.k}`;
    if (s.car === 'ranger') car('car.ranger', 'pickup', 'ranger', s.x, s.z, s.yaw + Math.PI, { locked: false, hasFlares: true, flaresLeft: 2, alarmLeft: 0, livery: 'ranger' });
    else car(id, pick(KINDS), 'visitor', x, z, yaw);
  }
  // The stranded family's minivan: stalled in the open middle aisle, nose angled toward the avenue & exit, hazards blinking
  const vanX = fx(10.5 + R() * 2.0), vanZ = -1.5 + (R() - 0.5) * 1.4;
  const van = car('car.minivan', 'minivan', 'start', vanX, vanZ, (flip > 0 ? -1 : 1) * (Math.PI / 2 - 0.35), { hazards: true, lightsOn: true, alarmLeft: 2, color: 0x9aa3ab });
  // Two abandoned cars left crooked in driving lanes with driver's door open and keys in (horn + high beams)
  car('car.left1', pick(['sedan', 'hatch']), 'abandoned', fx(-11 - R() * 7), 1.5 + (R() - 0.5) * 4, (R() - 0.5) * 1.6, { locked: false, openDoor: true, hazards: true, alarmLeft: 0 });
  car('car.left2', pick(['sedan', 'suv']), 'abandoned', fx(-10 - R() * 10), 25 + (R() - 0.5) * 3, Math.PI / 2 + (R() - 0.5) * 1.0, { locked: false, openDoor: true, hazards: false, alarmLeft: 0 });

  // ---- the visitors' route: stalled van -> cover gap in row B -> lit EXIT
  const vs = Math.sin(van.yaw), vc = Math.cos(van.yaw);
  const stops = [
    { kind: 'car', carId: van.id, x: van.x - vs * 3.1, z: van.z - vc * 3.1 + 0.5, label: 'the stalled van' },
    { kind: 'lane', x: laneBx, z0: 11.4, z1: 17.6, label: 'row B' },
    { kind: 'exit', x: evac.x, z: evac.z + 2.5, label: 'the exit' },
  ];

  // ---- wide-angle CCTV storytelling opening:
  // Camera sits high on the outer rear corner of the kiosk (wide 64 deg lens) looking diagonally across the lot:
  //   - Left/near foreground: the rex prowling just outside your Ticket Kiosk window
  //   - Right midground: the stalled minivan (blinking hazards) and the two visitors with their flashlight
  //   - Center background: the glowing green EXIT arch and waiting Park Ranger truck
  const guard = { x: kX, z: kZ + 0.3 };
  const windowAt = { x: kX, z: kZ + hd };
  const rexStart = { x: kX - flip * 0.6, z: kZ + 10.2, yaw: Math.atan2(flip * 0.6, -10.2) };
  const camKiosk = {
    x: kX - flip * (hw + 2.4), y: 6.6, z: kZ - 2.2, fov: 64,
    look: { x: fx(3.2), y: 1.4, z: 3.5 },
  };
  const camKiosk2 = { x: kX + flip * (hw + 1.0), y: 5.5, z: kZ + hd + 0.5, fov: 60 };

  const LAYOUT = {
    fence: FENCE,
    spawn: { you: { x: kX + flip * 4, z: kZ + 3 }, rex: rexStart },
    spawns: {
      first: { you: { x: kX + flip * 4, z: kZ + 3 }, rex: rexStart, hunger: [0.55, 0.65] },
      gate: { guard, window: windowAt, rex: rexStart, cam: camKiosk, cam2: camKiosk2 },
      respawn: [
        { name: 'the Ticket Kiosk', x: kX + flip * 4.5, z: kZ + 3 },
        { name: 'the Avenue', x: 0, z: -22 },
      ],
    },
  };

  // Dark perimeter treeline strictly outside the fence
  const trees = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + (R() - 0.5) * 0.08;
    const rad = FENCE + 9 + R() * 20;
    trees.push({ x: Math.sin(a) * rad, z: Math.cos(a) * rad, r: 0.45 + R() * 0.35, h: 12 + R() * 8, kind: 'tree', seed: i * 17 + seed });
  }

  const placeName = (x, z) => {
    if (Math.abs(x - kX) < hw + 1 && Math.abs(z - kZ) < hd + 1) return 'the Ticket Kiosk';
    if (Math.hypot(x - evac.x, z - evac.z) < 8) return 'the Exit';
    if (Math.hypot(x - breachX, z - breachZ) < 10) return 'the Park Gate';
    if (Math.abs(x) < SPINE) return 'the Avenue';
    return 'Lot B';
  };

  const lot = {
    seed, flip, fence: FENCE, stalls, stallW: STALL_W, stallL: STALL_L, spine: SPINE, rows: ROWS,
    cars, stops, lights, puddles, evac,
    breach: { x: breachX, z: breachZ },
    kiosk: { x: kX, z: kZ, hw, hd, h: kh },
  };

  const out = {
    seed, LAYOUT, ground, things, structures, refuges,
    rocks: [], trees, cover: [], logs: [], grass: [],
    pond: null, river: null, riverZ: () => -999,
    landmarks: [{ name: 'Ticket Kiosk', x: kX, z: kZ }, { name: 'Exit', x: evac.x, z: evac.z }],
    grazing: [],
    coverAt: () => 0,
    waterY: () => -99,
    depthAt, wetAt,
    coverHeight: () => 0,
    windAt: (x, z, w, out = { x: 0, z: 0 }) => { out.x = w.x; out.z = w.z; return out; },
    surfaceAt: (x, z) => (depthAt(x, z) > 0.04 ? 'water' : Math.max(Math.abs(x), Math.abs(z)) < FENCE ? 'gravel' : 'forest'),
    placeName,
    speedFactor: (x, z) => (depthAt(x, z) > 0.08 ? 0.82 : 1),
    lot,
  };
  cache.set(seed, out);
  return out;
}
