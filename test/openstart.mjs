// The open-field start (main.js OPEN, paddock.js LAYOUT.spawns.first) as a passive player meets it, as main.js runs it: the start
// card is up for `card` s (no agents: main.js aware()), then he steps in where the camera stands (arena.opening with FIRST.hunger;
// he is sensed from 1 s later), stands still facing the animal and does nothing (no struggle when held). Per seed: first sight,
// first nudge / shove / toss, when it decides to have him (the reach, a rush or a strike), and the kill; times from stepping in.
//   node test/openstart.mjs [seeds=1-12] [--card 5] [--secs 150] [--hunger 0.65,0.75] [--open 45] [--set drainT=45,curPeril=0.8]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { LAYOUT } from '../src/paddock.js';
import { TYRANNOSAURUS } from '../src/species/tyrannosaurus.js';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [s0, s1] = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '1-12').split('-').map(Number);
const OSECS = +arg('--open', 45), HUN = arg('--hunger', LAYOUT.spawns.first.hunger.join(',')).split(',').map(Number);
for (const kv of (arg('--set', '') || '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); TYRANNOSAURUS.mind.core[k] = +v; }      // e.g. --set drainT=45
const CARD = +arg('--card', 5), SECS = +arg('--secs', 150), F = LAYOUT.spawns.first, dt = 1 / 120;
const rows = [];
for (let seed = s0; seed <= (s1 || s0); seed++) {
  const T = makeTerrain(7), yaw = Math.atan2(F.you.x - F.rex.x, F.you.z - F.rex.z);
  const sim = new Creature(T, { x: F.rex.x, z: F.rex.z, yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  const me = { id: 'you', x: F.you.x, z: F.you.z, y: T.height(F.you.x, F.you.z) + 1.7, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, torch: false, lx: 0, ly: 0, lz: -1 };
  const V = A.victim('you'), R = { seed, d0: null, seen: null, nudge: null, shove: null, toss: null, decide: null, how: null, kill: null, probes: [] };
  const aware = CARD;      // main.js start(): in the open start you are there, still, from the moment you begin
  for (let i = 0; i < (CARD + SECS) * 120; i++) {
    const t = i * dt, ts = t - CARD, in_ = t >= aware;
    if (Math.abs(ts) < dt / 2) A.opening({ x: me.x, z: me.z }, OSECS, HUN);      // main.js start(): beginning starts the meeting
    if (V.free) { const d = Math.hypot(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / d; me.fz = (sim.z - me.z) / d; } else { me.x = V.x; me.z = V.z; }
    me.y = T.height(me.x, me.z) + 1.7;
    if (Math.abs(ts) < dt / 2) R.d0 = +Math.hypot(sim.x - me.x, sim.z - me.z).toFixed(0);
    A.step(dt, { agents: in_ ? [me] : [], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
    for (const e of A.events) {
      if (e.type === 'tossed' && e.id === 'you' && R.toss === null) R.toss = +ts.toFixed(1);
      if (e.src === 'victim' && e.type === 'death' && R.kill === null) R.kill = +ts.toFixed(1);
    }
    A.events.length = 0;
    if (in_ && mind.know.seen && R.seen === null) R.seen = +ts.toFixed(1);
    const K = mind.core; if (K) for (const p of K.probes.slice(R.probes.length)) { R.probes.push(p.kind + '@' + (p.t - CARD).toFixed(0)); if (R[p.kind] === null) R[p.kind] = +(p.t - CARD).toFixed(1); }
    const P = mind.peril, b = mind.beh;
    if (R.decide === null && in_ && ((K && K.reach) || P.stage === 'rush' || P.stage === 'strike' || (b && (b.name === 'pounce' || (b.name === 'prowl' && b.phase === 'rush'))))) { R.decide = +ts.toFixed(1); R.how = K && K.reach ? 'reach' : (b ? b.name : '-') + '/' + P.stage; }
    if (R.kill !== null) break;
  }
  rows.push(R);
  console.log(`seed ${String(seed).padStart(2)} d0 ${R.d0} m  seen ${R.seen ?? '-'}  nudge ${R.nudge ?? '-'}  shove ${R.shove ?? '-'}  tossed ${R.toss ?? '-'}  decides ${R.decide ?? '-'} (${R.how ?? ''})  kill ${R.kill ?? '-'}   ${R.probes.slice(0, 10).join(' ')}`);
}
const med = (k) => { const v = rows.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b); return v.length ? `${v[v.length >> 1]} s (${v.length}/${rows.length})` : `- (0/${rows.length})`; };
const firstTouch = rows.map((r) => [r.nudge, r.shove, r.toss].filter((x) => x !== null)).map((a) => (a.length ? Math.min(...a) : null));
rows.forEach((r, i) => (r.touch = firstTouch[i]));
console.log(`MEDIAN (${arg('--set', '')} opening ${OSECS} s, hunger ${HUN}, card ${CARD} s, from stepping in): first touch ${med('touch')}, decides ${med('decide')}, kill ${med('kill')}`);
