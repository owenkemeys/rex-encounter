// A death and a new life: the animal must take the respawned person for a new individual.
//   node test/newcomer.mjs [seeds e.g. 3,5,8] [--quiet]
// A starving animal, made to see the person as food (ov.verdict, released at the death), kills and eats them; the person
// threw a stone first (a grudge) and had a hiding spot on record. Six seconds after the death they come back (arena.respawn)
// away from it, wait out of the way, then walk into the open and stand. Checks: everything about the dead one is gone
// (where they are, hides, exits, decoys, grudge, verdict, tests, bond), the general prior about small things remains, nothing
// goes on hunting where the dead one was, and the first sighting of the newcomer is a first meeting in its thoughts.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';

const dt = 1 / 120, hyp = Math.hypot, quiet = process.argv.includes('--quiet');
const SEEDS = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '3,5,8').split(',').map(Number);
const HUNT = new Set(['search', 'stare', 'ambush', 'revisit', 'besiege', 'lurk', 'prowl', 'appraise', 'test', 'shadow', 'stalk', 'chase', 'seize', 'pin', 'butt', 'swipe', 'toy']);
const fail = [];
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };

function run(seed) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true; mind.hunger = 0.96; mind.ov.hold.hunger = 0.96; mind.ov.verdict = 'food';
  const me = { id: 'you', x: 0, z: 18, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 }, V = A.victim('you');
  const R = { seed, tr: [], deathT: null, respawnT: null, meetT: null, ghost: 0, before: null, after: null, meetThoughts: [], deathAt: null };
  let lastEntry = null, lastBeh = '', stoned = false, phase = 'first', walkTo = null;
  for (let i = 0; i < 120 * 260; i++) {
    const t = i * dt, px = me.x, pz = me.z;
    if (phase === 'first') {
      if (V.free) {
        me.x = V.x || me.x; me.z = V.z || me.z;
        if (!stoned && t > 3) { stoned = true; A.things.throw('stone', me.x, me.y, me.z, sim.x, sim.z, 'you', sim.py.x + 0.4); }
        if (t === 5 * 120 * dt) mind.mem.spots.push({ x: me.x + 3, z: me.z, n: 2, t: mind.t, miss: 0 });      // a hiding habit on record
        const u = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / u; me.fz = (sim.z - me.z) / u;
      } else if (!V.dead) { if (i % 20 === 0) A.struggle('you', 1); me.x = V.x; me.z = V.z; }
      if (V.dead && R.deathT === null) {
        R.deathT = t; R.deathAt = { x: V.x, z: V.z }; mind.ov.verdict = null; mind.ov.hold = {};
        R.before = { who: mind.who, grudge: mind.grudge, stones: mind.wrongs.stones, spots: mind.mem.spots.length, verdict: mind.ap.verdict, tests: mind.ap.tests, enc: mind.mem.encounters };
      }
      if (V.dead && t - R.deathT > 6) {
        // a new life far from the animal; it waits there a while, out of its way, then walks out into the open
        const p = A.respawn('you'); me.x = p.x; me.z = p.z; phase = 'second'; R.respawnT = t; R.spawn = p;
        R.after = { who: mind.who, grudge: mind.grudge, stones: mind.wrongs.stones, spots: mind.mem.spots.length, verdict: mind.ap.verdict, tests: mind.ap.tests, enc: mind.mem.encounters,
          target: mind.know.target ? mind.know.target.who : null, seen: mind.know.seen, kind: { ...mind.kind }, prior: mind.ap.fromPrior || null, hunger: mind.hunger };
      }
      if (t > 150 && R.deathT === null) break;
    } else {
      if (V.free) {
        if (t - R.respawnT > 40 && !walkTo) { const u = hyp(sim.x - me.x, sim.z - me.z) || 1; walkTo = { x: sim.x + (me.x - sim.x) / u * 24, z: sim.z + (me.z - sim.z) / u * 24 }; }
        if (walkTo) { const dx = walkTo.x - me.x, dz = walkTo.z - me.z, d = hyp(dx, dz); if (d > 0.5) { me.x += dx / d * 1.3 * dt; me.z += dz / d * 1.3 * dt; } else walkTo.done = true; }
        const u = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / u; me.fz = (sim.z - me.z) / u;
      } else { if (i % 20 === 0) A.struggle('you', 1); me.x = V.x; me.z = V.z; }
      // nothing goes on about the dead one: no picture of it, no hunting where it lay (its remains are food, not it)
      const K = mind.know, b = mind.beh;
      if (K.target && K.target.who && K.target.who !== V.who) R.ghost++;
      if (!R.meetT && b && HUNT.has(b.name) && !K.seen && mind.sum.cert > 0.3 && hyp(mind.sum.x - R.deathAt.x, mind.sum.z - R.deathAt.z) < 8) R.ghost++;
      if (!R.meetT && K.seen && mind.who === V.who) R.meetT = t;
      if (R.meetT && t - R.meetT > 45) break;
    }
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    if (i % 12 === 0) {
      const b = mind.beh, lab = b ? b.name + (b.phase ? '/' + b.phase : '') : '';
      if (lab !== lastBeh) { lastBeh = lab; R.tr.push({ t, s: `            · ${lab} [${mind.ap.verdict}] hunger ${mind.hunger.toFixed(2)}` }); }
      const S = mind.thinker.stream; let k = S.length - 1; while (k >= 0 && S[k] !== lastEntry) k--;
      for (let j = k + 1; j < S.length; j++) { R.tr.push({ t: S[j].t, s: `   "${S[j].text}"`.padEnd(30) + ` ${S[j].kind} [${S[j].cond}]` }); if (S[j].cond.includes('newcomer')) R.meetThoughts.push(S[j].text); }
      if (S.length) lastEntry = S[S.length - 1];
    }
  }
  R.final = { verdict: mind.ap.verdict, kind: { ...mind.kind }, hunger: mind.hunger };
  return R;
}

let shown = false;
for (const seed of SEEDS) {
  const R = run(seed);
  console.log(`\n== s${seed}: died ${R.deathT === null ? 'never' : R.deathT.toFixed(0) + ' s'}, respawned ${R.respawnT ? R.respawnT.toFixed(0) + ' s' : '-'}, met ${R.meetT ? R.meetT.toFixed(0) + ' s' : 'never'}`);
  if (R.deathT === null) { check(false, `s${seed}: the scripted kill happened`); continue; }
  console.log(`  before death: ${JSON.stringify(R.before)}`);
  console.log(`  after respawn: ${JSON.stringify(R.after)}`);
  check(R.before.grudge > 0 || R.before.stones > 0, `s${seed}: the dead one had earned a grudge (stone)`);
  check(R.after.who === null && R.after.target === null && !R.after.seen, `s${seed}: no picture of the dead one left (who, target, seen)`);
  check(R.after.grudge === 0 && R.after.stones === 0 && R.after.spots === 0 && R.after.tests === 0 && R.after.enc === 0, `s${seed}: grudge, stones, hiding spots, tests, encounters cleared`);
  check(R.after.verdict === 'curious', `s${seed}: verdict back to an open question (${R.after.verdict})`);
  check(R.after.kind.killed >= 1 && R.after.kind.met >= 1, `s${seed}: the general prior remains (${JSON.stringify(R.after.kind)})`);
  check(R.ghost === 0, `s${seed}: nothing hunts the dead one's position or carries its picture (${R.ghost} ticks)`);
  check(!!R.meetT, `s${seed}: it notices the newcomer`);
  check(R.final.kind.met >= 2, `s${seed}: counted as a second individual met (${R.final.kind.met})`);
  check(R.meetThoughts.length > 0, `s${seed}: first sighting voiced as a first meeting (${R.meetThoughts.map((x) => '"' + x + '"').join(', ')})`);
  if (!quiet && !shown) {
    shown = true; console.log(`  transcript ${(R.deathT - 12).toFixed(0)} s .. end`);
    for (const e of R.tr.filter((e) => e.t >= R.deathT - 12 && (e.t < R.deathT + 30 || e.t > R.meetT - 8))) console.log(`${e.t.toFixed(1).padStart(6)}s ${e.s}`);
  }
}
console.log(fail.length ? `\n${fail.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
if (fail.length) process.exitCode = 1;
