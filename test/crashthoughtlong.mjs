// Regression check for T11: after crashes, do thoughts and behaviour carry on for 90 s? The body is driven into a wall (two knocks), then released
// with a hungry (1.0) mind and a person standing still 13 m off. Prints the thought stream, behaviour changes, time in `pause`, longest gap.
//   node test/crashthoughtlong.mjs [seed] [off]      ("off": the crash handling (mind._onCrash) returns at once)
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const seed = +(process.argv[2] || 3), OFF = process.argv.includes('off'), dt = 1 / 120, verbose = !!process.env.V, GONE = +(process.env.GONE || 0);      // GONE=s: he leaves (out of sight) s seconds after it is released
const T = makeTerrain(7), sim = new Creature(T, { x: -9, z: 70, yaw: -Math.PI / 2, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 1;
if (OFF) mind._onCrash = () => { };
let drive = true; const orig = mind.step.bind(mind); mind.step = (d, w) => { const I = orig(d, w); if (drive) { I.goal = { kind: 'drive', throttle: 1, steer: 0 }; I.pace = 9; } return I; };
const me = { id: 'you', x: 0, z: 0, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 1, ly: 0, lz: 0 };
let knockT = null, lastB = '', pauseT = 0, lastTh = null, maxGap = 0, nTh = 0, seenN = 0, t0 = null;
for (let i = 0; i < 100 * 120; i++) {
  const t = i * dt;
  if (drive && t > 8) { drive = false; t0 = t; const f = { x: -Math.sin(sim.psi), z: -Math.cos(sim.psi) }; me.x = sim.x + f.x * 13; me.z = sim.z + f.z * 13; me.y = T.height(me.x, me.z) + 1.65; }
  const ag = process.env.CHASE && t <= 8 ? [{ ...me, x: -32, z: 70, y: T.height(-32, 70) + 1.65 }] : t > 8 && (t < 8 + GONE || GONE === 0) ? [me] : []; if (ag.length) { me.fx = 0; me.fz = 1; }
  A.step(dt, { agents: ag, noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
  if (t0 === null) continue;
  const b = mind.beh, bn = b ? b.name + '/' + (b.phase || '') : '-'; if (bn !== lastB) { if (verbose) console.log(`  ${(t - t0).toFixed(1)} beh ${bn}`); lastB = bn; }
  if (b && b.name === 'pause') pauseT += dt;
  const S = mind.thinker.stream, L = S[S.length - 1];
  if (L && L !== lastTh) { const rel = L.t - t0; if (lastTh) maxGap = Math.max(maxGap, L.t - lastTh.t); lastTh = L; nTh++; console.log(`  thought ${rel.toFixed(1)} "${L.text}"`); }
  if (verbose && i % 120 === 0) console.log(`  ${(t - t0).toFixed(0)} v ${sim.v.toFixed(2)} beh ${bn} seen ${!!mind.know.seen} wary ${mind.wary ? (mind.wary.until - mind.t).toFixed(0) : '-'} after ${mind.crashAfter ? 1 : 0} lastEmit ${(mind.thinker.lastEmit - mind.t).toFixed(1)} gap ${mind.thinker.gap.toFixed(1)} q ${mind.thinker.queue.length} quiet ${mind.peril.quiet}`);
}
if (lastTh) maxGap = Math.max(maxGap, mind.t - lastTh.t);
console.log(`${OFF ? 'OFF' : 'ON '} seed ${seed}: thoughts ${nTh}, longest gap (incl. to end) ${maxGap.toFixed(1)} s, time in pause ${pauseT.toFixed(1)} s of 92`);
