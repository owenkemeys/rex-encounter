// Lot B, the overflow car park outside the breached park (#lot): a seeded layout with the same contract as src/paddock.js,
// so Terrain, Arena, the animal and World run on it unchanged.
//
// The plan (before the seeded east/west flip): the park gate and the Ticket Kiosk are at the south end, the road exit at
// the north end, and one avenue runs straight between them. Either side of the avenue are parking islands: two double rows
// (A, B) and a single row along the north kerb (C), with open aisles about 19 m wide between them for the animal to stride
// and turn in. Every parked car stands in a marked stall, in clumps of two to four with gaps between; one or two were
// left crooked in an aisle. The stranded family's van stalled in the middle aisle on its way out: the two visitors go
// from it to a gap between cars in row B, across the north aisle to a gap in row C, and then to the exit.
//
// What the seed decides: the flip, which stalls are taken and by what, which gaps the visitors use, where the ranger's
// pickup (spare flares) and the abandoned cars are, which lamp is dead and which flickers, and where the puddles lie.
import { makeRng, clamp } from './math.js';

export const LOT_SEED = 42;
const FENCE = 50;

// footprints for collision; the drawn shapes are src/view/lotcars.js CAR_STYLES (keep w, l, h in step)
export const CAR_SPECS = {
  sedan:   { w: 1.84, l: 4.6,  h: 1.43, colors: [0x263a52, 0x6e2424, 0x32463c, 0x6a6d70, 0x1c1e22, 0x766446, 0x9a9c98] },
  hatch:   { w: 1.78, l: 4.05, h: 1.5,  colors: [0x7a2a22, 0x2c4f6e, 0xa8a9a4, 0x3a3d42, 0x8a7a3c, 0x41604a] },
  suv:     { w: 1.98, l: 4.8,  h: 1.76, colors: [0x263138, 0x4d382b, 0x2f4136, 0x77797c, 0x5c2b29, 0x15171a] },
  minivan: { w: 2.0,  l: 5.05, h: 1.78, colors: [0x88919a, 0x5a2a2a, 0x2f4660, 0xb4b2a8] },
  pickup:  { w: 2.04, l: 5.35, h: 1.84, colors: [0x2a4a35] },
};
const STALL_W = 3.0, STALL_L = 5.4, SPINE = 4.5, COLS = 10;
// sub-rows: z of the stall centres, the way a car driven in forwards faces, and which aisle it opens on
const ROWS = [
  { id: 'A1', z: -18.7, yaw: 0 }, { id: 'A2', z: -13.3, yaw: Math.PI },
  { id: 'B1', z: 11.3, yaw: 0 }, { id: 'B2', z: 16.7, yaw: Math.PI },
  { id: 'C', z: 42.3, yaw: 0 },
];
const colX = (k) => SPINE + STALL_W / 2 + k * STALL_W;      // 6, 9, ... 33

const cache = new Map();

export function makeLotPaddock(seed = LOT_SEED) {
  if (cache.has(seed)) return cache.get(seed);
  const R = makeRng(seed * 9173 + 29);
  const flip = R() < 0.5 ? 1 : -1;      // the visitors' side of the avenue is +x before the flip
  const fx = (x) => x * flip;
  const pick = (a) => a[Math.floor(R() * a.length)];

  // ---- the stall grid (LotView paints exactly these)
  const stalls = [];
  for (const row of ROWS) for (const side of [1, -1]) for (let k = 0; k < COLS; k++) stalls.push({ x: side * colX(k), z: row.z, yaw: row.yaw, row: row.id, side, k, car: null });
  const stall = (row, side, k) => stalls.find((s) => s.row === row && s.side === side * flip && s.k === k);

  // ---- which stalls are taken: clumps of two to four with gaps, then the places the story needs
  for (const row of ROWS) for (const side of [1, -1]) {
    let k = Math.floor(R() * 3);
    while (k < COLS) { const run = 2 + Math.floor(R() * 2.6); for (let i = 0; i < run && k < COLS; i++, k++) stall(row.id, side, k).car = 'any'; k += 2 + Math.floor(R() * 4); }
  }
  const laneB = 2 + Math.floor(R() * 3), laneC = 1 + Math.floor(R() * 4);      // the visitors' gaps: between columns lane and lane+1
  for (const r of ['B1', 'B2']) { stall(r, 1, laneB).car = 'any'; stall(r, 1, laneB + 1).car = 'any'; }
  for (let k = 0; k < COLS; k++) stall('C', 1, k).car = k === laneC || k === laneC + 1 ? 'any' : k < laneC ? null : stall('C', 1, k).car;      // open ground between their last gap and the exit
  const laneBx = fx(colX(laneB) + STALL_W / 2), laneCx = fx(colX(laneC) + STALL_W / 2);

  // ---- puddles in the aisles (loud to run through)
  const puddles = [
    { x: fx(-14 + (R() - 0.5) * 16), z: -1 + (R() - 0.5) * 8, rx: 7.5, rz: 4.5, depth: 0.18 },
    { x: fx(-10 + R() * 34), z: 30 + (R() - 0.5) * 7, rx: 6.5, rz: 4.0, depth: 0.16 },
    { x: fx(8 + (R() - 0.5) * 30), z: -30 + (R() - 0.5) * 6, rx: 5.5, rz: 3.5, depth: 0.14 },
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
  const wetAt = (x, z) => (depthAt(x, z) > 0.01 ? 0.92 : Math.max(Math.abs(x), Math.abs(z)) < FENCE ? 0.58 : 0.35);

  const things = [], structures = [], refuges = [];
  const T0 = (id, o) => { things.push({ id, ...o }); return o; };

  // ---- the Ticket Kiosk by the park gate at the south end, its wide window facing north up the lot
  const kX = fx(-7), kZ = -41;
  const kBase = ground(kX, kZ), hw = 2.4, hd = 2.2, kh = 3.1;
  const addWall = (of, id, ax, az, bx, bz, w, h, mat, y0 = 0) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    T0(id, { of, kind: 'wall', mat, x: mx, y: kBase + y0, z: mz, yaw, w, h, l, ax, az, bx, bz, prefab: null });
  };
  // North wall (wide viewing window facing the whole lot)
  addWall('gatehouse', 'gh.n.sill', kX - hw, kZ + hd, kX + hw, kZ + hd, 0.26, 1.05, 'concrete', 0);
  T0('gh.n.lintel', { of: 'gatehouse', kind: 'slab', mat: 'concrete', x: kX, y: kBase + 2.35, z: kZ + hd, yaw: Math.PI / 2, w: 0.26, h: 0.75, l: hw * 2, ax: kX - hw, az: kZ + hd, bx: kX + hw, bz: kZ + hd, prefab: null });
  // South wall (solid)
  addWall('gatehouse', 'gh.s', kX - hw, kZ - hd, kX + hw, kZ - hd, 0.26, kh, 'concrete', 0);
  // Outer side wall (solid)
  const solidSide = kX - flip * hw, doorSide = kX + flip * hw;
  addWall('gatehouse', 'gh.side.solid', solidSide, kZ - hd, solidSide, kZ + hd, 0.26, kh, 'concrete', 0);
  // Inner side wall (open doorway 1.4 m wide so you can step straight out into the lot)
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

  // ---- the fence: the smashed park gate beside the kiosk (south), the road exit at the far end of the avenue (north)
  const breachX = fx(11), breachZ = -FENCE, exitX = 0, exitZ = FENCE - 1;
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
  // bollards across the exit: a person slips between them, the animal does not
  const evac = { x: exitX, z: exitZ, r: 2.2 };
  for (let i = -3; i <= 3; i++) if (i !== 0) T0(`evac.post.${i + 3}`, { of: 'fence', kind: 'pole', mat: 'concrete', x: exitX + i * 1.5, y: ground(exitX + i * 1.5, FENCE), z: FENCE, r: 0.2, h: 1.1, prefab: null });

  // ---- sodium lamps on the islands and the north kerb; by seed one is dead and one flickers
  const lights = [];
  for (const sd of [1, -1]) { lights.push({ id: `lamp.A${sd}`, x: sd * 19.5, z: -16, h: 9.5, state: 'on' }, { id: `lamp.B${sd}`, x: sd * 19.5, z: 14, h: 9.5, state: 'on' }, { id: `lamp.C${sd}`, x: sd * 21, z: 46.4, h: 9.5, state: 'on' }); }
  const dead = Math.floor(R() * lights.length); lights[dead].state = 'off';
  lights[(dead + 1 + Math.floor(R() * (lights.length - 1))) % lights.length].state = 'flicker';
  for (const L of lights) T0(L.id, { of: 'fence', kind: 'pole', mat: 'steel', x: L.x, y: ground(L.x, L.z), z: L.z, r: 0.2, h: L.h, prefab: null });

  // ---- the cars
  const KINDS = ['sedan', 'sedan', 'sedan', 'hatch', 'hatch', 'suv', 'suv', 'suv', 'minivan'];
  const cars = [];
  const car = (id, kind, role, x, z, yaw, extra = {}) => {
    const sp = CAR_SPECS[kind];
    const c = { id, kind, role, x, z, yaw, w: sp.w, l: sp.l, h: sp.h, color: pick(sp.colors), locked: true, openDoor: false, hazards: false, lightsOn: false, alarmLeft: 2, ...extra };
    cars.push(c); return c;
  };
  // the ranger's pickup, tailgate down with a case of flares: parked on the far side of the avenue from the visitors
  const rangerStall = stall(R() < 0.5 ? 'A2' : 'B1', -1, 1 + Math.floor(R() * 5)); rangerStall.car = 'ranger';
  for (const s of stalls) {
    if (!s.car) continue;
    const back = R() < 0.14, nose = s.yaw + (back ? Math.PI : 0);
    const x = s.x + (R() - 0.5) * 0.24, z = s.z + (R() - 0.5) * 0.3, yaw = nose + (R() - 0.5) * 0.06, id = `car.${s.row}${s.side > 0 ? 'e' : 'w'}${s.k}`;
    if (s.car === 'ranger') car('car.ranger', 'pickup', 'ranger', s.x, s.z, s.yaw + (s.row === 'A2' ? 0 : Math.PI) + Math.PI, { locked: false, hasFlares: true, flaresLeft: 2, alarmLeft: 0, livery: 'ranger' });
    else car(id, pick(KINDS), 'visitor', x, z, yaw);
  }
  // the family's van, stalled in the middle aisle, nose toward the avenue and the way out
  const van = car('car.minivan', 'minivan', 'start', fx(colX(laneB) - 1 + R() * 2), -3.2 + R() * 1.6, (flip > 0 ? -1 : 1) * (Math.PI / 2 - 0.22), { hazards: true, lightsOn: true, alarmLeft: 2, color: 0x8d949b });
  // two cars left where their drivers ran: doors open, keys in (the horn and the high beams work)
  car('car.left1', pick(['sedan', 'hatch', 'suv']), 'abandoned', fx(-10 - R() * 14), 28 + R() * 5, (R() - 0.5) * 2.4, { locked: false, openDoor: true, hazards: true, alarmLeft: 0 });
  car('car.left2', pick(['sedan', 'hatch']), 'abandoned', fx((R() < 0.5 ? -1 : 1) * (14 + R() * 14)), -29 + R() * 4, Math.PI / 2 + (R() - 0.5) * 1.2, { locked: false, openDoor: true, hazards: false, alarmLeft: 0 });

  // ---- the visitors' way out: from the van, to a gap between cars in row B, to a gap in row C, to the exit.
  // A gap is a lane between two parked cars: they keep to whichever end of it is further from the animal.
  const vs = Math.sin(van.yaw), vc = Math.cos(van.yaw);
  const stops = [
    { kind: 'car', carId: van.id, x: van.x - vs * 3.4, z: van.z - vc * 3.4 + 0.6, label: 'the stalled van' },      // off its tail, in view of the kiosk camera
    { kind: 'lane', x: laneBx, z0: 9.2, z1: 18.8, label: 'row B' },
    { kind: 'lane', x: laneCx, z0: 40.2, z1: 46.6, label: 'row C' },
    { kind: 'exit', x: evac.x, z: evac.z + 2.2, label: 'the exit' },
  ];

  // ---- the opening: you in the kiosk at the window, the animal just outside it, the van and the exit beyond in one frame
  const guard = { x: kX, z: kZ + 0.3 };
  const windowAt = { x: kX, z: kZ + hd };
  const rexStart = { x: kX + flip * 1.5, z: kZ + 12, yaw: Math.atan2(-flip * 1.5, -12) };
  const camKiosk = { x: kX - flip * (hw + 0.4), y: 4.3, z: kZ + hd + 0.4, look: { x: fx(8), y: 1.2, z: -8 } };
  const camKiosk2 = { x: kX + flip * (hw + 0.4), y: 4.3, z: kZ + hd + 0.4 };

  const LAYOUT = {
    fence: FENCE,
    spawn: { you: { x: kX + flip * 4, z: kZ + 3 }, rex: rexStart },
    spawns: {
      first: { you: { x: kX + flip * 4, z: kZ + 3 }, rex: rexStart, hunger: [0.55, 0.65] },
      gate: { guard, window: windowAt, rex: rexStart, cam: camKiosk, cam2: camKiosk2 },
      respawn: [
        { name: 'the Ticket Kiosk', x: kX + flip * 4.5, z: kZ + 3 },
        { name: 'the Avenue', x: 0, z: -26 },
      ],
    },
  };

  // Dark perimeter treeline strictly outside the fence
  const trees = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + (R() - 0.5) * 0.08;
    const rad = FENCE + 9 + R() * 22;
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
    seed, flip, fence: FENCE, stalls, stallW: STALL_W, stallL: STALL_L, spine: SPINE,
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
