// Arena step cost (the score's perf section, standalone): node test/perfstep.mjs [secs] [--prof]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const dt = 1 / 120, secs = +(process.argv[2] || 60);
const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed: 3 }), mind = new Mind(sim, 3), A = new Arena(T, sim, mind, 3);
const me = { id: 'you', x: 10, z: 25, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
const W = () => ({ agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: -3 } });
for (let i = 0; i < 240; i++) A.step(dt, W()); A.events.length = 0;
const t0 = performance.now(), n = secs * 120;
for (let i = 0; i < n; i++) { me.y = T.height(me.x, me.z) + 1.7; A.step(dt, W()); A.events.length = 0; }
console.log('ms/step', ((performance.now() - t0) / n).toFixed(3), 'beh', mind.label);
