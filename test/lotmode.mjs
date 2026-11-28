// Lot B (#lot), headless: layout, start freeze, opening run, car trampling/crushing/dominoes/flips, flashlight, escape.
// node test/lotmode.mjs    (pacing, by eye: node test/lotrun.mjs passive 5)
import assert from 'node:assert/strict';
import { makeLotPaddock, LOT_SEED, CAR_SPECS } from '../src/lot.js';
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { LotMode } from '../src/sim/lotmode.js';

// 1. layout: tighter ~16 to 30 car lot, every parked car in a stall, visitors' runs clear of cars, seeds differ
for (const seed of [LOT_SEED, 1, 2, 3, 99]) {
  const L = makeLotPaddock(seed).lot;
  assert.ok(L.cars.length >= 14 && L.cars.length <= 32, `seed ${seed}: tighter lot (${L.cars.length} cars)`);
  for (const c of L.cars) {
    assert.ok(CAR_SPECS[c.kind], `known kind ${c.kind}`);
    if (c.role === 'visitor' || c.role === 'ranger') assert.ok(L.stalls.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 0.4), `seed ${seed}: ${c.id} stands in a stall`);
  }
  for (let i = 0; i < L.cars.length; i++) for (let j = i + 1; j < L.cars.length; j++) {
    assert.ok(Math.hypot(L.cars[i].x - L.cars[j].x, L.cars[i].z - L.cars[j].z) > 2.3, `seed ${seed}: ${L.cars[i].id} and ${L.cars[j].id} do not overlap`);
  }
  const pt = (s, from) => (s.kind === 'lane' ? { x: s.x, z: Math.abs(from.z - s.z0) < Math.abs(from.z - s.z1) ? s.z0 : s.z1 } : { x: s.x, z: s.z });
  let at = pt(L.stops[0], { z: 0 });
  for (let i = 1; i < L.stops.length; i++) {
    const prev = L.stops[i - 1], a = prev.kind === 'lane' ? { x: prev.x, z: (L.stops[i].z ?? L.stops[i].z0) > prev.z1 ? prev.z1 : prev.z0 } : at, b = pt(L.stops[i], a);
    for (let u = 0.08; u < 0.95; u += 0.03) {
      const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
      for (const c of L.cars) if (c.id !== prev.carId) assert.ok(Math.hypot(c.x - x, c.z - z) > 1.85, `seed ${seed}: run ${i} is clear of ${c.id}`);
    }
    at = b;
  }
}
const p42 = makeLotPaddock(LOT_SEED), p99 = makeLotPaddock(99), g = p42.LAYOUT.spawns.gate;
assert.ok(Math.hypot(g.rex.x - g.guard.x, g.rex.z - g.guard.z) < 16, 'the animal starts just outside the kiosk');
assert.ok(g.cam.fov >= 58 && g.cam.fov <= 72, `wide CCTV lens (${g.cam.fov} deg)`);
assert.ok(JSON.stringify(p42.lot.cars.map((c) => [c.x, c.kind])) !== JSON.stringify(p99.lot.cars.map((c) => [c.x, c.kind])), 'seeds differ');

// 2. start freeze & flashlight sweeping on CCTV before activate()
const terrain = makeTerrain(7, p42);
const sim = new RexSim(terrain, { x: g.rex.x, z: g.rex.z, yaw: g.rex.yaw, seed: LOT_SEED }), mind = new Mind(sim, LOT_SEED), arena = new Arena(terrain, sim, mind, LOT_SEED);
arena.herd.disabled = true;
const lot = new LotMode(terrain, p42.lot);
const tick = (n, agents = () => lot.extraAgents()) => {
  for (let i = 0; i < n; i++) {
    const ns = []; arena.things.extra = lot.extraLights();
    arena.step(1 / 120, { agents: agents(), noises: ns, light: 0.4, flash: 0, wind: { x: 1, z: 0 } });
    lot.step(1 / 120, sim, mind, arena, arena.things, ns, false);
    assert.ok(Number.isFinite(sim.x) && Number.isFinite(sim.z), 'the animal stays a number');
    lot.events.length = 0; arena.events.length = 0;
  }
};
assert.equal(lot.extraAgents().length, 0, 'visitors hidden from rex before activate()');
tick(120 * 4);
assert.ok(lot.kids.every((k) => k.state === 'cover' && k.stop === 0), 'visitors stay by the van on the start screen');
assert.ok(lot.kids[0].hasTorch && lot.kids[0].torchAim.active, 'Visitor A holds a lit flashlight on the start feed');

// 3. opening dash + flashlight switches to bright forward torch when sprinting
lot.activate(); tick(120 * 2);
assert.ok(lot.introDashed && lot.kids.every((k) => k.state === 'sprint' || k.stop >= 1), 'they run from the van a moment after look-up');
assert.ok(lot.byId.get('car.minivan').hornT > 0, 'the van horn sounds');
const sprintAgent = lot.extraAgents().find((a) => a.id === 'kid1');
if (lot.kids[0].state === 'sprint') assert.equal(sprintAgent.torch, true, 'sprinting visitor exposes flashlight to rex senses');
tick(120 * 20);

// 4. cars: flares, alarm, horn, trampling/crushing, domino shunt, side flip, and zero collider pile-up
lot.reset();
const noises = [], kit = { flare: { n: 1, max: 3 } };
const beside = (c) => ({ x: c.x + Math.cos(c.yaw) * (c.w / 2 + 0.6), z: c.z - Math.sin(c.yaw) * (c.w / 2 + 0.6) });
const ranger = lot.cars.find((c) => c.role === 'ranger'); lot.interact(beside(ranger), kit, noises);
assert.equal(kit.flare.n, 3, 'the pickup refills flares');
const locked = lot.interactable(beside(lot.cars.find((c) => c.locked && c.alarmLeft >= 2 && c.role === 'visitor'))).car; lot.interact(beside(locked), kit, noises);
assert.ok(locked.alarmT > 10, 'a thumped car sounds its alarm');
const open = lot.cars.find((c) => c.openDoor); lot.interact(beside(open), kit, noises);
assert.ok(open.hornT > 2 && open.beamsT > 15, 'an open car has a horn and high beams');
assert.equal(lot.interactable({ x: 0, z: -24 }), null, 'nothing to use out in the open');

// 4a. tramplable low car contributes to terrain.height() and crushes under a rex footstep
const sedan = lot.cars.find((c) => c.tramplable && c.role === 'visitor');
const hBefore = terrain.height(sedan.x, sedan.z);
assert.ok(hBefore > 0.75 && hBefore < 1.25, `tramplable car lifts ground height (${hBefore.toFixed(2)} m)`);
lot.trampleCar(sedan, sedan.x, sedan.z, 0, 2, noises);
assert.ok(sedan.crush >= 0.4 && sedan.glassBroken, 'stepping on a sedan crushes roof and shatters glass');
assert.ok(terrain.height(sedan.x, sedan.z) < hBefore - 0.1, 'crushed roof lowers ground height');
// rex trunk (wallsFull=true) passes over tramplable cars, while player (wallsFull=false) still collides
const pRex = { x: sedan.x, z: sedan.z }, pYou = { x: sedan.x, z: sedan.z };
terrain.pushOut(pRex, 1.0, 0, 3, 2, true);
terrain.pushOut(pYou, 0.35, 0.1, 1.5, 2, false);
assert.ok(Math.hypot(pRex.x - sedan.x, pRex.z - sedan.z) < 0.01, 'rex body steps over tramplable car');
assert.ok(Math.hypot(pYou.x - sedan.x, pYou.z - sedan.z) > 0.4, 'player still collides with car');

// 4b. hard broadside slam shoves and flips a tall SUV onto its side/roof without collider pile-up or nav stutter
const suv = lot.cars.find((c) => !c.tramplable && c.role === 'visitor') || lot.byId.get('car.minivan');
const beforeCols = terrain.near(suv.x, suv.z, 8).length, verBefore = terrain.ver;
const sideX = Math.cos(suv.yaw), sideZ = -Math.sin(suv.yaw);
lot.impactCar(suv, sideX, sideZ, 2.8, true, noises);
tick(120);
assert.ok(Math.hypot(suv.x - suv.x0, suv.z - suv.z0) > 0.5, 'broadside hit shoves SUV');
assert.ok(suv.flipped !== 0 && suv.tramplable, `hard broadside hit flips SUV onto side/roof (flipped=${suv.flipped}, roll=${suv.roll.toFixed(2)})`);
assert.ok(terrain.near(suv.x, suv.z, 8).length <= beforeCols + 3, 'no colliders pile up as car skids');
assert.ok(terrain.ver - verBefore <= 3, `no per-tick nav rebuild storm (ver delta=${terrain.ver - verBefore})`);

// 4c. car-to-car domino shunt: ram one parked car directly into its stall neighbour
lot.reset();
let pair = null;
for (const a of lot.cars) for (const b of lot.cars) if (a !== b && Math.hypot(a.x - b.x, a.z - b.z) < 3.6) { pair = [a, b]; break; }
assert.ok(pair, 'found adjacent car pair for domino test');
const [ca, cb] = pair, ddx = cb.x - ca.x, ddz = cb.z - ca.z, ddl = Math.hypot(ddx, ddz);
lot.impactCar(ca, ddx / ddl, ddz / ddl, 2.6, true, noises);
tick(90);
assert.ok(Math.hypot(cb.x - cb.x0, cb.z - cb.z0) > 0.15, 'domino impact shoves neighbour car');

// 5. full escape while the animal is held at the kiosk, plus clean reset
lot.reset(); sim.reset(g.rex.x, g.rex.z, g.rex.yaw); lot.activate();
const you = () => [{ id: 'you', x: g.guard.x, y: 1.7, z: g.guard.z, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1, torch: true }, ...lot.extraAgents()];
for (let s = 0; s < 140 && lot.status === 'active'; s++) tick(120, you);
assert.ok(lot.kids.some((k) => k.state === 'escaped'), `visitors escape while rex is held (${lot.kids.map((k) => k.state + k.stop)})`);
lot.reset();
assert.ok(lot.kids.every((k) => k.stop === 0 && k.state === 'cover') && !lot.active && lot.status === 'active' && lot.cars.every((c) => c.x === c.x0 && c.alarmT === 0 && c.crush === 0 && c.flipped === 0), 'reset puts everything back');
console.log(`ok   lotmode: layout x5, start freeze, flashlight, trample/crush, flip, domino, escape (${lot.cars.length} cars)`);
