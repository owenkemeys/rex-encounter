// Lot B (#lot), headless: the layout, the start freeze, the opening run, the cars, and a whole escape.
// node test/lotmode.mjs    (pacing, by eye: node test/lotrun.mjs passive 5)
import assert from 'node:assert/strict';
import { makeLotPaddock, LOT_SEED, CAR_SPECS } from '../src/lot.js';
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { LotMode } from '../src/sim/lotmode.js';

// 1. layout: every parked car in a stall, the visitors' runs clear of cars, seeds differ
for (const seed of [LOT_SEED, 1, 2, 3, 99]) {
  const L = makeLotPaddock(seed).lot;
  assert.ok(L.cars.length >= 30 && L.cars.length <= 70, `seed ${seed}: a half-full lot (${L.cars.length} cars)`);
  for (const c of L.cars) {
    assert.ok(CAR_SPECS[c.kind], `known kind ${c.kind}`);
    if (c.role === 'visitor' || c.role === 'ranger') assert.ok(L.stalls.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < 0.4), `seed ${seed}: ${c.id} stands in a stall`);
  }
  for (let i = 0; i < L.cars.length; i++) for (let j = i + 1; j < L.cars.length; j++) assert.ok(Math.hypot(L.cars[i].x - L.cars[j].x, L.cars[i].z - L.cars[j].z) > 2.4, `seed ${seed}: ${L.cars[i].id} and ${L.cars[j].id} do not overlap`);
  const pt = (s, from) => (s.kind === 'lane' ? { x: s.x, z: Math.abs(from.z - s.z0) < Math.abs(from.z - s.z1) ? s.z0 : s.z1 } : { x: s.x, z: s.z });
  let at = pt(L.stops[0], { z: 0 });
  for (let i = 1; i < L.stops.length; i++) {
    const prev = L.stops[i - 1], a = prev.kind === 'lane' ? { x: prev.x, z: (L.stops[i].z ?? L.stops[i].z0) > prev.z1 ? prev.z1 : prev.z0 } : at, b = pt(L.stops[i], a);
    for (let u = 0.08; u < 0.95; u += 0.03) { const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u; for (const c of L.cars) if (c.id !== prev.carId) assert.ok(Math.hypot(c.x - x, c.z - z) > 1.9, `seed ${seed}: run ${i} is clear of ${c.id}`); }
    at = b;
  }
}
const p42 = makeLotPaddock(LOT_SEED), p99 = makeLotPaddock(99), g = p42.LAYOUT.spawns.gate;
assert.ok(Math.hypot(g.rex.x - g.guard.x, g.rex.z - g.guard.z) < 16, 'the animal starts just outside the kiosk');
assert.ok(JSON.stringify(p42.lot.cars.map((c) => [c.x, c.kind])) !== JSON.stringify(p99.lot.cars.map((c) => [c.x, c.kind])), 'seeds differ');

// 2. start freeze: nothing for the animal to find, and nobody moves, until activate()
const terrain = makeTerrain(7, p42);
const sim = new RexSim(terrain, { x: g.rex.x, z: g.rex.z, yaw: g.rex.yaw, seed: LOT_SEED }), mind = new Mind(sim, LOT_SEED), arena = new Arena(terrain, sim, mind, LOT_SEED);
arena.herd.disabled = true;
const lot = new LotMode(terrain, p42.lot);
const tick = (n, agents = () => lot.extraAgents()) => { for (let i = 0; i < n; i++) { const ns = []; arena.things.extra = lot.extraLights(); arena.step(1 / 120, { agents: agents(), noises: ns, light: 0.4, flash: 0, wind: { x: 1, z: 0 } }); lot.step(1 / 120, sim, mind, arena, arena.things, ns, false); assert.ok(Number.isFinite(sim.x) && Number.isFinite(sim.z), 'the animal stays a number'); lot.events.length = 0; arena.events.length = 0; } };
assert.equal(lot.extraAgents().length, 0, 'visitors hidden before activate()');
tick(120 * 5);
assert.ok(lot.kids.every((k) => k.state === 'cover' && k.stop === 0), 'visitors stay by the van on the start screen');

// 3. the opening: they break for row B and the van's alarm goes
lot.activate(); tick(120 * 2);
assert.ok(lot.introDashed && lot.kids.every((k) => k.state === 'sprint' || k.stop >= 1), 'they run from the van a moment after the look-up');
assert.ok(lot.byId.get('car.minivan').alarmT > 0, 'the van alarm sounds');
tick(120 * 40);      // and the animal, on its own, stalks them without the sim breaking (it once went NaN here)

// 4. cars: flares, alarm, horn, and no collider pile-up when one skids
lot.reset();
const noises = [], kit = { flare: { n: 1, max: 3 } }, beside = (c) => ({ x: c.x + Math.cos(c.yaw) * (c.w / 2 + 0.6), z: c.z - Math.sin(c.yaw) * (c.w / 2 + 0.6) });
const ranger = lot.cars.find((c) => c.role === 'ranger'); lot.interact(beside(ranger), kit, noises);
assert.equal(kit.flare.n, 3, 'the pickup refills flares');
const locked = lot.interactable(beside(lot.cars.find((c) => c.locked && c.alarmLeft >= 2 && c.role === 'visitor'))).car; lot.interact(beside(locked), kit, noises);
assert.ok(locked.alarmT > 10, 'a thumped car sounds its alarm');
const open = lot.cars.find((c) => c.openDoor); lot.interact(beside(open), kit, noises);
assert.ok(open.hornT > 2 && open.beamsT > 15, 'an open car has a horn and high beams');
assert.equal(lot.interactable({ x: 0, z: -30 }), null, 'nothing to use out in the open');
const before = terrain.near(locked.x, locked.z, 8).length;
lot.impactCar(locked, 1, 0, 1.8, true); tick(60);
assert.ok(Math.hypot(locked.x - locked.x0, locked.z - locked.z0) > 0.3, 'a struck car skids');
assert.ok(terrain.near(locked.x, locked.z, 8).length <= before + 3, 'no colliders pile up as it skids');

// 5. a whole escape, the animal held at the kiosk
lot.reset(); sim.reset(g.rex.x, g.rex.z, g.rex.yaw); lot.activate();
const you = () => [{ id: 'you', x: g.guard.x, y: 1.7, z: g.guard.z, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1, torch: true }, ...lot.extraAgents()];
for (let s = 0; s < 150 && lot.status === 'active'; s++) tick(120, you);
assert.ok(lot.kids.some((k) => k.stop >= 2 || k.state === 'escaped'), `visitors get on while it is held elsewhere (${lot.kids.map((k) => k.state + k.stop)})`);
lot.reset();
assert.ok(lot.kids.every((k) => k.stop === 0 && k.state === 'cover') && !lot.active && lot.status === 'active' && lot.cars.every((c) => c.x === c.x0 && c.alarmT === 0), 'reset puts everything back');
console.log(`ok   lotmode: layout x5 seeds, start freeze, opening, cars, escape (${lot.cars.length} cars)`);
