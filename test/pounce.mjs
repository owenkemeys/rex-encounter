// The chase reflex (mind.js `_preyDrive`, behaviour `pounce`): running in its sight makes it go, fed or not.
//   node test/pounce.mjs [seeds e.g. 3,5,8] [--quiet]
// Scripted people cross in front of the animal on the open Meadow at several distances and hunger levels: sprinting
// (6.2 m/s, the player's sprint), walking (control: must never trigger), tapping sprint for half a second at a time (control),
// sprinting then stopping dead the moment it locks on (should defuse it, mostly), and sprinting for the shed door 33 m off
// (cover it cannot enter). Reports trigger, launch and catch rates, what happened after the grab, and its top speed.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';

const dt = 1 / 120, hyp = Math.hypot, quiet = process.argv.includes('--quiet');
const SEEDS = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '3,5,8').split(',').map(Number);
const fail = [];
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };

/** One crossing. mode: sprint | walk | tap | stop | cover. */
function run(seed, hunger, D, mode) {
  const T = makeTerrain(7), cover = mode === 'cover';
  const ax = cover ? -52 : 0, az = cover ? 6 : 0, s0 = cover ? { x: -45, z: -12 } : { x: -32, z: D };
  const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(s0.x - ax, s0.z - az), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true; mind.hunger = hunger; mind.ov.hold.hunger = hunger;
  const me = { id: 'you', x: s0.x, z: s0.z, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 }, V = A.victim('you');
  const door = T.structures[0].openings[0], inside = { x: T.structures[0].cx, z: T.structures[0].cz };
  const path = cover ? [{ x: door.x, z: door.z + 1.5 }, { x: door.x, z: door.z - 1 }, inside] : [{ x: 40, z: D }];
  const R = { seed, hunger, D, mode, trig: null, launch: null, defused: false, caught: false, motive: null, after: [], vmax: 0, thoughts: [], safe: false };
  let tGo = null, seen = 0, k = 0, stopped = false, lastEntry = null, lastLab = '';
  for (let i = 0; i < 120 * 60; i++) {
    const t = i * dt, px = me.x, pz = me.z;
    if (mind.know.seen) seen += dt;
    if (tGo === null && seen > 4) tGo = t + 1;
    const b = mind.beh;
    if (b && b.name === 'pounce') { if (R.trig === null) { R.trig = t - tGo; R.trigD = hyp(me.x - sim.x, me.z - sim.z); } if (b.phase === 'rush' && R.launch === null) R.launch = t - tGo; if (b.phase === 'defused') R.defused = true; if (b.why) R.why = b.why; }
    if (R.trig !== null && b && b.name === 'seize' && !R.motive) R.motive = b.motive;
    if (V.free && tGo !== null && t > tGo && !R.caught) {
      let sp = mode === 'walk' ? 2.6 : 6.2;
      if (mode === 'tap') sp = (t - tGo) % 2.6 < 0.5 ? 6.2 : 2.6;
      if (mode === 'stop' && b && b.name === 'pounce') { R.lockSeen ??= t; if (t - R.lockSeen > 0.2) stopped = true; }      // a fifth of a second to react
      if (stopped) sp = 0;
      const wp = path[k];
      if (wp) { const dx = wp.x - me.x, dz = wp.z - me.z, d = hyp(dx, dz); if (d < 0.4) k++; else { const st = Math.min(d, sp * dt); me.x += dx / d * st; me.z += dz / d * st; } }
      else if (cover) R.safe = true;
      const vx = me.x - px, vz = me.z - pz, u = hyp(vx, vz); if (u > 1e-4) { me.fx = vx / u; me.fz = vz / u; }
    } else if (!V.free) {
      if (!R.caught) { R.caught = true; R.caughtT = t - tGo; }
      if (i % 30 === 0) A.struggle('you', 1); me.x = V.x; me.z = V.z;
    }
    if (V.free && R.caught) { me.x = V.x; me.z = V.z; }
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
    for (const e of A.events) if (e.src === 'victim' && ['seized', 'knocked', 'dropped', 'tossed', 'death', 'up'].includes(e.type) && R.caught) R.after.push(e.type === 'death' ? 'death:' + e.cause : e.type);
    A.events.length = 0;
    if (b && b.name === 'pounce' && b.phase === 'rush') R.vmax = Math.max(R.vmax, Math.abs(sim.v));
    if (i % 12 === 0) {
      const lab = b ? b.name + (b.phase ? '/' + b.phase : '') : ''; if (lab !== lastLab && tGo !== null && t > tGo - 1) { lastLab = lab; R.thoughts.push(`${(t - tGo).toFixed(1).padStart(5)}s   · ${lab}  d=${hyp(me.x - sim.x, me.z - sim.z).toFixed(0)}`); }
      const S = mind.thinker.stream; let j = S.length - 1; while (j >= 0 && S[j] !== lastEntry) j--;
      for (let q = j + 1; q < S.length; q++) if (tGo !== null && S[q].t >= tGo - 1) R.thoughts.push(`${(S[q].t - tGo).toFixed(1).padStart(5)}s "${S[q].text}"`);
      if (S.length) lastEntry = S[S.length - 1];
    }
    if (tGo !== null && t - tGo > 28) break;
  }
  return R;
}

if (process.env.ONE) { const [sd, h, D, mode] = process.env.ONE.split(','); const r = run(+sd, +h, +D, mode); for (const x of r.thoughts) console.log(x); process.exit(0); }
const rows = [], line = (r) => `  s${r.seed} h${r.hunger} ${String(r.D).padStart(2)}m ${r.mode.padEnd(6)} trig ${r.trig === null ? '  -  ' : r.trig.toFixed(1).padStart(4) + 's'} launch ${r.launch === null ? ' -  ' : r.launch.toFixed(1) + 's'}${r.defused ? ' defused' : ''} ${r.caught ? `CAUGHT ${r.caughtT.toFixed(1)}s (${r.motive || '?'}) then ${[...new Set(r.after)].join(',')}` : r.mode === 'cover' && r.safe ? 'reached cover' : ''}${r.why ? ' gave up:' + r.why : ''} vmax ${r.vmax.toFixed(1)}`;
const T = { sprint: [], walk: [], tap: [], stop: [], cover: [] };
for (const seed of SEEDS) for (const h of [0.3, 0.85]) {
  for (const D of [12, 22, 35]) for (const mode of ['sprint', 'walk']) { const r = run(seed, h, D, mode); T[mode].push(r); console.log(line(r)); if (!quiet && mode === 'sprint' && D === 22 && seed === SEEDS[0]) for (const x of r.thoughts.slice(0, 22)) console.log('        ' + x); }
  for (const mode of ['tap', 'stop', 'cover']) { const r = run(seed, h, 22, mode); T[mode].push(r); console.log(line(r)); if (!quiet && mode === 'stop' && seed === SEEDS[0] && h === 0.3) for (const x of r.thoughts.slice(0, 14)) console.log('        ' + x); }
}
const rate = (a, f) => `${a.filter(f).length}/${a.length}`;
console.log('\nSUMMARY');
for (const [m, a] of Object.entries(T)) console.log(`  ${m.padEnd(6)} triggered ${rate(a, (r) => r.trig !== null)}  launched ${rate(a, (r) => r.launch !== null)}  caught ${rate(a, (r) => r.caught)}${m === 'cover' ? `  reached cover ${rate(a, (r) => r.safe)}` : ''}`);
for (const h of [0.3, 0.85]) { const a = T.sprint.filter((r) => r.hunger === h); console.log(`  sprint at hunger ${h}: triggered ${rate(a, (r) => r.trig !== null)}, caught ${rate(a, (r) => r.caught)}, motives ${JSON.stringify(a.filter((r) => r.motive).map((r) => r.motive))}, deaths ${a.filter((r) => r.after.some((x) => x.startsWith('death'))).length}`); }
const vm = Math.max(...T.sprint.map((r) => r.vmax)); console.log(`  top speed in the rush ${vm.toFixed(1)} m/s (player sprint 6.2)`);
console.log('\nCHECKS');
check(T.walk.every((r) => r.trig === null), 'walking past never triggers it');
check(T.tap.every((r) => r.trig === null), 'tapping sprint (half a second at a time) never triggers it');
check(T.sprint.filter((r) => r.trig !== null).length >= 0.6 * T.sprint.length, 'a sustained sprint across its view usually triggers it');
check(T.sprint.filter((r) => r.hunger === 0.3 && r.trig !== null).length > 0, 'it fires in a fed animal too');
check(T.sprint.filter((r) => r.caught).length > 0, 'sprinting in the open is a real risk (caught at least sometimes)');
check(vm > 6.6, 'its rush beats the player\'s sprint');
check(T.stop.filter((r) => r.defused).length >= 0.5 * T.stop.filter((r) => r.trig !== null).length, 'stopping dead during the lock-on defuses it at least half the time');
check(T.cover.filter((r) => r.safe && !r.caught).length > 0, 'running for cover it cannot enter can save you');
check(T.sprint.filter((r) => r.hunger === 0.3 && r.caught).every((r) => !r.after.some((x) => x.startsWith('death'))), 'a fed animal does not kill what it grabbed on reflex');
console.log(fail.length ? `\n${fail.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
if (fail.length) process.exitCode = 1;
