// Breached Overflow Parking Lot (LOT B) — seeded layout for the cover-to-cover escape mode (#lot).
// Produces the same Paddock contract as src/paddock.js so Terrain, Arena, RexSim, Mind and World
// run on it unchanged. All layout variation is derived from `seed` (fixed to LOT_SEED during playtesting).
import { makeRng, clamp } from './math.js';

export const LOT_SEED = 42;
const FENCE = 52;

const CAR_SPECS = {
  sedan:   { w: 1.85, l: 4.4, h: 1.42, colors: [0x2c3e55, 0x6b2828, 0x3b4840, 0x5c5852, 0x262930, 0x7a6a4c] },
  suv:     { w: 2.0,  l: 4.8, h: 1.78, colors: [0x2a3338, 0x4f3a2e, 0x36443a, 0x484b52] },
  minivan: { w: 2.0,  l: 5.0, h: 1.82, colors: [0x7e858c] },
  ranger:  { w: 2.05, l: 4.9, h: 1.85, colors: [0x2e4a36] },
};

const cache = new Map();

export function makeLotPaddock(seed = LOT_SEED) {
  if (cache.has(seed)) return cache.get(seed);
  const R = makeRng(seed * 9173 + 29);
  const flip = R() < 0.5 ? 1 : -1;      // seeded: flips breach/kids east <-> west so sightlines and escape vector invert
  const fx = (x) => x * flip;

  // ---- seeded drainage puddle (loud splash aisle)
  const puddles = [
    { x: fx(2 + (R() - 0.5) * 8), z: 2 + (R() - 0.5) * 10, rx: 9.5, rz: 6.5, depth: 0.22 },
    { x: fx(-14 + (R() - 0.5) * 6), z: -12 + (R() - 0.5) * 8, rx: 7.0, rz: 5.5, depth: 0.16 },
  ];

  // ---- flat drained asphalt inside the lot, gentle earthen berm outside the fence
  const ground = (x, z) => {
    const edge = Math.max(Math.abs(x), Math.abs(z)) - FENCE;
    let h = 0;
    if (edge > 0) h += Math.min(3.2, edge * 0.08 + 0.35 * Math.sin(x * 0.09 + seed) * Math.cos(z * 0.09));
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
  const wetAt = (x, z) => (depthAt(x, z) > 0.01 ? 0.9 : Math.max(Math.abs(x), Math.abs(z)) < FENCE ? 0.55 : 0.35);

  const things = [], structures = [], refuges = [];
  const T0 = (id, o) => { things.push({ id, ...o }); return o; };

  // ---- Ticket / Guard Kiosk (gatehouse) on South-West / South-East edge, facing North into the lot
  const kX = fx(-22), kZ = -38;
  const kBase = ground(kX, kZ), hw = 2.6, hd = 2.4, kh = 3.2;
  const addWall = (of, id, ax, az, bx, bz, w, h, mat, y0 = 0) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    T0(id, { of, kind: 'wall', mat, x: mx, y: kBase + y0, z: mz, yaw, w, h, l, ax, az, bx, bz, prefab: null });
  };
  // North wall (wide viewing window facing the lot: low sill 0..1.05, lintel 2.3..3.2, corners)
  addWall('gatehouse', 'gh.n.sill', kX - hw, kZ + hd, kX + hw, kZ + hd, 0.28, 1.05, 'concrete', 0);
  T0('gh.n.lintel', { of: 'gatehouse', kind: 'slab', mat: 'concrete', x: kX, y: kBase + 2.35, z: kZ + hd, yaw: Math.PI / 2, w: 0.28, h: 0.85, l: hw * 2, ax: kX - hw, az: kZ + hd, bx: kX + hw, bz: kZ + hd, prefab: null });
  // South wall (solid)
  addWall('gatehouse', 'gh.s', kX - hw, kZ - hd, kX + hw, kZ - hd, 0.28, kh, 'concrete', 0);
  // Outer side wall (solid)
  const solidSide = kX - flip * hw, doorSide = kX + flip * hw;
  addWall('gatehouse', 'gh.side.solid', solidSide, kZ - hd, solidSide, kZ + hd, 0.28, kh, 'concrete', 0);
  // Inner side wall (doorway gap 1.3 m wide in the middle, openable or plain open so you can dash straight out)
  addWall('gatehouse', 'gh.side.a', doorSide, kZ - hd, doorSide, kZ - 0.75, 0.28, kh, 'concrete', 0);
  addWall('gatehouse', 'gh.side.b', doorSide, kZ + 0.75, doorSide, kZ + hd, 0.28, kh, 'concrete', 0);
  T0('gh.side.lintel', { of: 'gatehouse', kind: 'slab', mat: 'concrete', x: doorSide, y: kBase + 2.25, z: kZ, yaw: 0, w: 0.28, h: 0.95, l: 1.5, ax: doorSide, az: kZ - 0.75, bx: doorSide, bz: kZ + 0.75, prefab: null });
  T0('gh.roof', { of: 'gatehouse', kind: 'roof', mat: 'concrete', x: kX, y: kBase + kh, z: kZ, yaw: 0, w: hw * 2 + 0.5, h: 0.22, l: hd * 2 + 0.5, prefab: null, visualOnly: true });

  structures.push({
    id: 'gatehouse', kind: 'gatehouse', name: 'the Ticket Kiosk',
    cx: kX, cz: kZ, yaw: 0, hw, hd, h: kh, base: kBase, roof: kh, mat: 'concrete',
    openings: [
      { x: kX, z: kZ + hd, nx: 0, nz: 1, w: 3.4, y: kBase + 1.65 },
      { x: doorSide, z: kZ, nx: flip, nz: 0, w: 1.4, y: kBase + 1.1 },
    ],
  });

  // ---- Perimeter Fence with a smashed breach on the North-East (or NW when flipped) and Evac Exit Gate on the far side
  const breachX = fx(24), breachZ = FENCE;
  const exitX = fx(-34), exitZ = 22;
  const fenceWall = (id, ax, az, bx, bz) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    T0(id, { of: 'fence', kind: 'wall', mat: 'fence', x: mx, y: ground(mx, mz), z: mz, yaw, w: 0.3, h: 4.5, l, ax, az, bx, bz, prefab: null });
  };
  // North fence (split around breach gap of 9 m — visual gap, rex stays inside via bound)
  const bLo = Math.min(breachX - 4.5, breachX + 4.5), bHi = Math.max(breachX - 4.5, breachX + 4.5);
  fenceWall('fence.n1', -FENCE, FENCE, bLo, FENCE);
  fenceWall('fence.n2', bHi, FENCE, FENCE, FENCE);
  fenceWall('fence.s', -FENCE, -FENCE, FENCE, -FENCE);
  fenceWall('fence.e', FENCE, -FENCE, FENCE, FENCE);
  fenceWall('fence.w', -FENCE, -FENCE, -FENCE, FENCE);

  // ---- Evacuation Exit Bollards (choke point kids slip through, rex can't)
  const evac = { x: exitX, z: exitZ, r: 3.2 };
  for (const dz of [-1.6, 1.6]) {
    T0(`evac.post.${dz > 0 ? 'a' : 'b'}`, { of: 'fence', kind: 'pole', mat: 'concrete', x: exitX + flip * 1.4, y: ground(exitX + flip * 1.4, exitZ + dz), z: exitZ + dz, r: 0.28, h: 1.35, prefab: null });
  }

  // ---- Seeded Concrete Planter Islands (low concrete curbs + light poles)
  const lights = [
    { id: 'lamp.1', x: fx(-28), z: -14, h: 9.5, state: 'on' },
    { id: 'lamp.2', x: fx(0),   z: -14, h: 9.5, state: 'on' },
    { id: 'lamp.3', x: fx(26),  z: -14, h: 9.5, state: 'on' },
    { id: 'lamp.4', x: fx(-28), z: 18,  h: 9.5, state: 'on' },
    { id: 'lamp.5', x: fx(0),   z: 18,  h: 9.5, state: 'on' },
    { id: 'lamp.6', x: fx(26),  z: 18,  h: 9.5, state: 'on' },
  ];
  // Seeded floodlight outages: 1 dead, 1 flickering (never kill lamp.4 over the exit or lamp.3 over the kids' start)
  const candOut = [0, 1, 4, 5];
  const deadIdx = candOut[Math.floor(R() * candOut.length)];
  const flickCand = candOut.filter((i) => i !== deadIdx);
  const flickIdx = flickCand[Math.floor(R() * flickCand.length)];
  lights[deadIdx].state = 'off';
  lights[flickIdx].state = 'flicker';
  for (const L of lights) {
    T0(L.id, { of: 'fence', kind: 'pole', mat: 'steel', x: L.x, y: ground(L.x, L.z), z: L.z, r: 0.22, h: L.h, prefab: null });
  }

  // ---- Parked Cars (10 vehicles: 1 stalled minivan for kids start, 2 cover-lane cars, 1 ranger SUV, 6 visitor cars)
  const pickCol = (kind) => { const cs = CAR_SPECS[kind].colors; return cs[Math.floor(R() * cs.length)]; };
  const jit = (s) => (R() - 0.5) * s;

  // Escape lane stops: Start Minivan (E/W) -> Cover 1 (mid-east) -> Cover 2 (mid-west) -> Exit Gate
  const startCar = { id: 'car.minivan', kind: 'minivan', role: 'start', x: fx(32 + jit(2)), z: -8 + jit(2), yaw: (flip > 0 ? -Math.PI * 0.45 : Math.PI * 0.45) + jit(0.15), locked: true, hazards: true, lightsOn: true, alarmLeft: 1 };
  const cover1   = { id: 'car.cover1',  kind: 'sedan',   role: 'cover1', x: fx(14 + jit(2)), z: 2 + jit(2), yaw: jit(0.22), locked: true, hazards: false, lightsOn: false, alarmLeft: 2 };
  const cover2   = { id: 'car.cover2',  kind: 'suv',     role: 'cover2', x: fx(-12 + jit(2)), z: 12 + jit(2), yaw: Math.PI * 0.5 + jit(0.2), locked: true, hazards: false, lightsOn: false, alarmLeft: 2 };

  // Ranger SUV (spare flares in open rear hatch) placed in one of 2 seeded mid-south / mid-north bays
  const rangerSpot = R() < 0.5 ? { x: fx(-6 + jit(3)), z: -22 + jit(2), yaw: Math.PI * 0.5 + jit(0.2) } : { x: fx(8 + jit(3)), z: -24 + jit(2), yaw: -Math.PI * 0.5 + jit(0.2) };
  const rangerCar = { id: 'car.ranger', kind: 'ranger', role: 'ranger', ...rangerSpot, locked: false, openDoor: false, hasFlares: true, flaresLeft: 2, hazards: true, lightsOn: true, alarmLeft: 0 };

  // Additional visitor cars arranged in realistic parking bays (leaving wide central driving aisles for the rex)
  const extraSpecs = [
    { id: 'car.v1', kind: 'sedan', x: fx(-28 + jit(2)), z: -6 + jit(2),  yaw: Math.PI * 0.5 + jit(0.12) },
    { id: 'car.v2', kind: 'suv',   x: fx(-14 + jit(2)), z: -10 + jit(2), yaw: jit(0.18) },
    { id: 'car.v3', kind: 'sedan', x: fx(16 + jit(2)),  z: -22 + jit(2), yaw: jit(0.16) },
    { id: 'car.v4', kind: 'sedan', x: fx(28 + jit(2)),  z: 14 + jit(2),  yaw: Math.PI * 0.5 + jit(0.15) },
    { id: 'car.v5', kind: 'suv',   x: fx(4 + jit(2)),   z: 28 + jit(2),  yaw: Math.PI + jit(0.18) },
    { id: 'car.v6', kind: 'sedan', x: fx(-22 + jit(2)), z: 30 + jit(2),  yaw: jit(0.15) },
  ];
  // Seeded: 2 of the visitor/cover cars were abandoned mid-evacuation (driver door ajar, horn + high beams ready!)
  const openPickA = Math.floor(R() * 3);          // from v1..v3 (closer to kiosk/mid)
  const openPickB = 3 + Math.floor(R() * 3);      // from v4..v6 (north half)

  const cars = [startCar, cover1, cover2, rangerCar, ...extraSpecs.map((c, idx) => ({
    ...c, role: 'visitor',
    locked: !(idx === openPickA || idx === openPickB),
    openDoor: idx === openPickA || idx === openPickB,
    hazards: idx === openPickA,
    lightsOn: idx === openPickA || idx === openPickB,
    alarmLeft: idx === openPickA || idx === openPickB ? 0 : 2,
  }))].map((c) => {
    const sp = CAR_SPECS[c.kind];
    return { ...c, w: sp.w, l: sp.l, h: sp.h, color: pickCol(c.kind) };
  });

  // Escape route stops (4 stops: minivan -> cover1 -> cover2 -> exit gate)
  const stops = [
    { kind: 'car', carId: startCar.id, x: startCar.x, z: startCar.z, r: 2.8, label: 'stalled minivan' },
    { kind: 'car', carId: cover1.id,   x: cover1.x,   z: cover1.z,   r: 2.6, label: 'sedan' },
    { kind: 'car', carId: cover2.id,   x: cover2.x,   z: cover2.z,   r: 2.8, label: 'SUV' },
    { kind: 'exit', carId: null,       x: evac.x,     z: evac.z,     r: 2.4, label: 'exit gate' },
  ];

  // Spawns & CCTV cameras for Lot B
  const guard = { x: kX, z: kZ + 0.5 };
  const windowAt = { x: kX, z: kZ + hd };
  const rexStart = { x: breachX - flip * 4, z: breachZ - 14, yaw: Math.atan2(startCar.x - (breachX - flip * 4), startCar.z - (breachZ - 14)) };
  const camKiosk = { x: kX + flip * (hw + 0.4), y: 3.8, z: kZ + hd + 0.5 };
  const camKids = { x: startCar.x - flip * 10, y: 5.5, z: startCar.z + 11, look: { x: startCar.x, y: 1.1, z: startCar.z } };
  const camExit = { x: evac.x + flip * 12, y: 5.5, z: evac.z - 10, look: { x: evac.x, y: 1.2, z: evac.z } };

  const LAYOUT = {
    fence: FENCE,
    spawn: { you: { x: guard.x + flip * 4.5, z: guard.z + 2 }, rex: rexStart },
    spawns: {
      first: { you: { x: guard.x + flip * 4.5, z: guard.z + 2 }, rex: rexStart, hunger: [0.55, 0.65] },
      gate: {
        guard, window: windowAt, rex: rexStart,
        cam: camKiosk,
        cam2: { x: kX - flip * (hw + 0.4), y: 3.8, z: kZ + hd + 0.5 },
        camKids, camExit,
      },
      respawn: [
        { name: 'the Ticket Kiosk', x: kX + flip * 4, z: kZ + 4 },
        { name: 'the South Lot', x: fx(0), z: -34 },
      ],
    },
  };

  // Sparse perimeter trees outside the fence only (dark treeline frame, never inside the asphalt lot)
  const trees = [];
  for (let i = 0; i < 42; i++) {
    const a = (i / 42) * Math.PI * 2 + (R() - 0.5) * 0.08;
    const rad = FENCE + 10 + R() * 24;
    const tx = Math.sin(a) * rad, tz = Math.cos(a) * rad;
    trees.push({ x: tx, z: tz, r: 0.45 + R() * 0.35, h: 12 + R() * 8, kind: 'tree', seed: i * 17 + seed });
  }

  const placeName = (x, z) => {
    if (Math.abs(x - kX) < hw + 1 && Math.abs(z - kZ) < hd + 1) return 'the Ticket Kiosk';
    if (Math.hypot(x - evac.x, z - evac.z) < 8) return 'the Evacuation Gate';
    if (Math.hypot(x - breachX, z - breachZ) < 10) return 'the Breached Fence';
    return 'Lot B';
  };

  const lot = { seed, flip, fence: FENCE, cars, stops, lights, puddles, evac, breach: { x: breachX, z: breachZ }, kiosk: { x: kX, z: kZ, hw, hd, h: kh }, camKids, camExit };

  const out = {
    seed, LAYOUT, ground, things, structures, refuges,
    rocks: [], trees, cover: [], logs: [], grass: [],
    pond: null, river: null, riverZ: () => -999,
    landmarks: [{ name: 'Ticket Kiosk', x: kX, z: kZ }, { name: 'Evacuation Gate', x: evac.x, z: evac.z }],
    grazing: [],
    coverAt: () => 0,
    waterY: () => -99,
    depthAt, wetAt,
    coverHeight: () => 0,
    windAt: () => 1,
    surfaceAt: (x, z) => (depthAt(x, z) > 0.04 ? 'water' : Math.max(Math.abs(x), Math.abs(z)) < FENCE ? 'gravel' : 'forest'),
    placeName,
    speedFactor: (x, z) => (depthAt(x, z) > 0.08 ? 0.82 : 1),
    lot,
  };
  cache.set(seed, out);
  return out;
}
