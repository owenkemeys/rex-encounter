// Owner's bug: you walk into a shelter unseen while the animal is on the far side of it; it must not know at once.
// The animal stands on the far side of the barn (its back wall between you), at several distances from that wall, facing
// away from it or along it; the wind blows from it to you (no scent reaches it). You come in quietly by the door on the other side and
// go to the hiding place. For each case: when (after you are inside) it first senses you, by which sense, when it suspects or
// is sure you are in there, and where its head was relative to the openings. Fails on any knowledge inside 3 s that no sense
// delivered through an opening (a near-field read through a solid wall, or a read of where you really are).
// node test/shelter_unseen.mjs [seeds=1,2,3]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const dt = 1 / 120, hyp = Math.hypot, SEEDS = (process.argv[2] || '1,2,3').split(',').map(Number);
let bad = 0;
for (const back of [2.5, 5, 9]) for (const facing of ['away', 'along']) for (const seed of SEEDS) {
  const T = makeTerrain(7), St = T.structures.find((s) => s.kind === 'barn'), h = St.hide || { x: St.cx, z: St.cz };
  // the far side: beyond the wall opposite the door you use (the south door; the animal north of the barn, no door in front of it)
  const door = St.openings.find((o) => o.nz < -0.5), ax = St.cx - 6, az = St.cz + St.hd + back + 2.2;
  const sim = new Creature(T, { x: ax, z: az, yaw: facing === 'away' ? 0 : Math.PI / 2, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true; mind.hunger = 0.45; mind.mood.interest = 0.2;
  const me = { id: 'you', x: door.x, z: door.z - 8, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
  const way = [{ x: door.x, z: door.z - 1.5 }, { x: door.x, z: door.z + 1 }, h], W = { x: 0, z: -2.5 };      // wind from it to you
  let wi = 0, inT = null, first = null, susp = null, seenOut = false, stepT = 1.5;
  for (let i = 0; i < 40 * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z, noises = [];
    if (me.speed > 0.5 && (stepT -= dt * me.speed) <= 0) { stepT = 1.5; noises.push({ x: me.x, y: T.height(me.x, me.z), z: me.z, loud: 0.045, kind: 'step', you: true }); }
    if (wi < way.length) { const q = way[wi], d = hyp(q.x - me.x, q.z - me.z); if (d < 0.2) wi++; else { me.x += (q.x - me.x) / d * Math.min(d, 1.4 * dt); me.z += (q.z - me.z) / d * Math.min(d, 1.4 * dt); } }
    if (inT === null && T.insideStructure(me.x, me.z)) inT = t;
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = hyp(me.vx, me.vz);
    A.step(dt, { agents: [me], noises, light: 0.85, flash: false, wind: W }); A.events.length = 0;
    const K = mind.know, hp = sim.head.pos;
    if (inT === null) { if (K.seen) seenOut = true; continue; }
    const k = t - inT, toOpen = Math.min(...St.openings.map((o) => hyp(o.x - hp.x, o.z - hp.z))), headIn = !!T.insideStructure(hp.x, hp.z, hp.y);
    if (first === null && K.seen) first = { t: k, via: K.via, toOpen, headIn, d: hyp(me.x - hp.x, me.z - hp.z) };
    const bel = T.insideStructure(mind.sum.x, mind.sum.z);
    if (susp === null && ((bel && bel.id === St.id && mind.sum.cert > 0.55) || (mind.beh && mind.beh.name === 'besiege'))) susp = { t: k, beh: mind.beh && mind.beh.name, cert: +mind.sum.cert.toFixed(2) };
  }
  // knowledge inside 3 s is a bug unless its head was at an opening (sound and smell come out of the openings) or it saw you
  const quick = (first && first.t < 3 && first.via !== 'sight' && first.toOpen > 4.2 && !first.headIn) || (susp && susp.t < 3 && !first);
  if (quick && !seenOut) bad++;
  console.log(`back ${String(back).padStart(3)} m facing ${facing.padEnd(5)} seed ${seed}: ${seenOut ? 'saw you outside; ' : ''}first sensed ${first ? `${first.t.toFixed(1)} s by ${first.via} (head ${first.toOpen.toFixed(1)} m from an opening, ${first.d.toFixed(1)} m from you)` : 'never'}; suspects/sure ${susp ? `${susp.t.toFixed(1)} s (${susp.beh}, cert ${susp.cert})` : 'never'}${quick && !seenOut ? '  <-- knew at once' : ''}`);
}
console.log(bad ? `FAIL: ${bad} cases knew at once with no sense through an opening` : 'OK');
if (bad) process.exitCode = 1;
