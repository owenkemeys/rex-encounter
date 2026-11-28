// Headless tests for Lot B (#lot): seeded layout variation, car suspension/skid/alarms/flares,
// and cover-to-cover kids escape driven through the real Terrain, RexSim, Mind, and Arena.
import assert from 'node:assert/strict';
import { makeLotPaddock, LOT_SEED } from '../src/lot.js';
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { LotMode } from '../src/sim/lotmode.js';

// 1. Seeded layout: same seed is deterministic; different seeds genuinely vary structural features
const p42a = makeLotPaddock(LOT_SEED);
const p42b = makeLotPaddock(LOT_SEED);
assert.equal(p42a, p42b, 'same seed returns cached layout');
const p99 = makeLotPaddock(99);
assert.equal(p42a.lot.cars.length, 10, '10 parked vehicles in Lot B');
assert.equal(p42a.lot.stops.length, 4, '4 cover-to-cover escape stops');
const diffs = [
  p42a.lot.flip !== p99.lot.flip,
  p42a.lot.puddles[0].x !== p99.lot.puddles[0].x,
  p42a.lot.lights.map((l) => l.state).join(',') !== p99.lot.lights.map((l) => l.state).join(','),
  p42a.lot.cars.find((c) => c.role === 'ranger').x !== p99.lot.cars.find((c) => c.role === 'ranger').x,
];
assert.ok(diffs.filter(Boolean).length >= 2, 'different seeds vary puddles, lights, ranger spot, or orientation');

// 2. Terrain + LotMode car interactions: alarm, open-door horn, ranger flare resupply, suspension rock & skid
const terrain = makeTerrain(7, p42a);
const rexStart = p42a.LAYOUT.spawns.gate.rex;
const sim = new RexSim(terrain, { x: rexStart.x, z: rexStart.z, yaw: rexStart.yaw, seed: LOT_SEED });
const mind = new Mind(sim, LOT_SEED);
const arena = new Arena(terrain, sim, mind, LOT_SEED);
arena.herd.disabled = true;
const lotMode = new LotMode(terrain, p42a.lot);

const noises = [];
const kit = { flare: { n: 1, max: 3 } };

// Ranger SUV flare resupply
const ranger = lotMode.cars.find((c) => c.role === 'ranger');
assert.ok(ranger && ranger.flaresLeft === 2, 'ranger SUV starts with 2 spare flares');
const hitR = lotMode.interactable({ x: ranger.x, z: ranger.z });
assert.equal(hitR.label, 'grab spare flares');
lotMode.interact({ x: ranger.x, z: ranger.z }, kit, noises);
assert.equal(kit.flare.n, 3, 'grabbing spare flares refills player kit to 3');
assert.equal(ranger.flaresLeft, 0, 'ranger flares depleted');

// Locked car alarm
const lockedCar = lotMode.cars.find((c) => c.locked && c.alarmLeft >= 2);
const hitL = lotMode.interactable({ x: lockedCar.x, z: lockedCar.z });
assert.equal(hitL.label, 'trip car alarm');
lotMode.interact({ x: lockedCar.x, z: lockedCar.z }, kit, noises);
assert.ok(lockedCar.alarmT > 10, 'alarm active after tripping');
assert.ok(noises.some((n) => n.kind === 'alarm' && n.loud >= 0.8), 'alarm emits loud noise');
assert.ok(lotMode.extraLights().some((l) => l.bright > 0.5), 'alarm emits bright light cue for rex mind');

// Open-door horn & high beams
const openCar = lotMode.cars.find((c) => c.openDoor);
assert.ok(openCar, 'at least one abandoned open-door car exists');
const hitO = lotMode.interactable({ x: openCar.x, z: openCar.z });
assert.equal(hitO.label, 'blast horn & lights');
lotMode.interact({ x: openCar.x, z: openCar.z }, kit, noises);
assert.ok(openCar.hornT > 2 && openCar.beamsT > 15, 'horn and high beams active');

// Suspension rock & skid on rex impact
const cx0 = lockedCar.x, cz0 = lockedCar.z;
lotMode.impactCar(lockedCar, 1, 0, 1.6, true);
assert.ok(Math.abs(lockedCar.vPitch) + Math.abs(lockedCar.vRoll) > 0.5, 'car rocks on springs');
lotMode.step(1 / 60, sim, mind, arena, arena.things, noises, false);
assert.ok(Math.hypot(lockedCar.x - cx0, lockedCar.z - cz0) > 0.01, 'hard rex impact skids car sideways');

// 3. Cover-to-cover kids escape: when rex is distracted across the lot, kids advance and escape
lotMode.reset();
sim.reset(-35, -35, 0);      // pull rex far away to the kiosk corner
const DT = 1 / 60;
for (let i = 0; i < 60 * 35 && lotMode.status === 'active'; i++) {
  const n = [];
  arena.things.extra = lotMode.extraLights();
  // Keep rex occupied far from escape lane
  const ag = [{ id: 'you', x: -30, y: 1.7, z: -30, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1, torch: true }, ...lotMode.extraAgents()];
  arena.step(DT, { agents: ag, noises: n, light: 0.4, flash: 0, wind: { x: 1, z: 0 } });
  lotMode.step(DT, sim, mind, arena, arena.things, n, false);
}
const escaped = lotMode.kids.filter((k) => k.state === 'escaped').length;
assert.ok(escaped >= 1 || lotMode.kids.some((k) => k.stop >= 1), `kids advance cover-to-cover when rex is distracted (escaped=${escaped}, stops=${lotMode.kids.map((k) => k.stop)})`);
console.log(`ok   lotmode: seeded layout, car alarms/horn/flares/skid, kids escape (status=${lotMode.status}, escaped=${escaped}/2, stops=${lotMode.kids.map((k) => k.stop).join(',')})`);
