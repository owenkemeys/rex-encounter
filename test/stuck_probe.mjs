import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
const T = makeTerrain(7), sim = new Creature(T, { x: -9, z: 70, yaw: -Math.PI / 2, seed: 3 }), mind = new Mind(sim, 3), A = new Arena(T, sim, mind, 3);
A.herd.list.length = 0; A.herd.disabled = true;
const orig = mind.step.bind(mind); mind.step = (d, w) => { const I = orig(d, w); I.goal = { kind: 'drive', throttle: 1, steer: 0 }; I.pace = 9; return I; };
for (let i = 0; i < 10 * 120; i++) { A.step(1/120, { agents: [], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0; if (i % 30 === 0) console.log((i/120).toFixed(2), sim.x.toFixed(1), sim.z.toFixed(1), sim.psi.toFixed(2), (sim.speed||0).toFixed(1), mind.mem.crash && mind.mem.crash.t); if (mind.mem.crash && mind.mem.crash.t>0 && i%30===0) { } }
