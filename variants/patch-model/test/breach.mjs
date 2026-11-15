// Strength: a person hides in a structure; how long until the animal breaks a way in, by motivation.
//   node test/breach.mjs [kinds e.g. shed,pen,tower] [motives e.g. curious,hungry,angry] [secs] [seed]
// It knows where you are from the start (`ov.omniscient`, besiege forced): this measures the capability and the will, not the
// finding. Prints, per run: first crack, first panel/leg giving way, the reach-in (seize), whether it gave up, what it tried.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { Nav } from '../src/sim/nav.js';

const kinds = (process.argv[2] || 'shed,pen,tower').split(','), motives = (process.argv[3] || 'curious,hungry,angry').split(',');
const secs = +(process.argv[4] || 300), seed = +(process.argv[5] || 3);
export function breach(kind, motive, secs, seed, log = false) {
  const T = makeTerrain(7), S = T.structures.find((s) => s.kind === kind), NV = new Nav(T);
  let ax = 0, az = 0;
  found: for (const d of [24, 30, 20]) for (const O of S.openings) { const nl = Math.hypot(O.nx, O.nz), x = O.x + O.nx / nl * d, z = O.z + O.nz / nl * d; if (NV.costAt(x, z) < 1.3 && !(T.depthAt(x, z) > 0)) { ax = x; az = z; break found; } }
  const sim = new Creature(T, { x: ax, z: az, yaw: Math.atan2(S.cx - ax, S.cz - az), seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = true;
  const h = motive === 'hungry' ? 0.9 : motive === 'angry' ? 0.45 : 0.25; mind.hunger = h; mind.ov.hold.hunger = h;
  if (motive === 'angry') { mind.mood.irritation = 0.9; mind.grudge = 0.7; }
  mind.ov.force = 'besiege'; mind.ov.omniscient = true;
  const up = kind === 'tower', V = A.victim('you');
  // a corner away from the door, where a person would press themselves
  const lx = kind === 'shed' ? -2.2 : kind === 'pen' ? 5.5 : 0, lz = kind === 'shed' ? -1.4 : kind === 'pen' ? -3.5 : 0;
  const px = S.cx + lx * Math.cos(S.yaw) + lz * Math.sin(S.yaw), pz = S.cz - lx * Math.sin(S.yaw) + lz * Math.cos(S.yaw);
  const me = { id: 'you', x: px, z: pz, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
  const R = { kind, motive, crack: null, give: null, collapse: null, caught: null, gaveUp: null, hows: {}, gives: 0, subs: new Set() };
  let forced = false;
  for (let i = 0; i < secs * 120; i++) {
    const t = i / 120;
    if (V.free) { me.x = px; me.z = pz; me.y = (up && !S.collapsed ? S.base + S.h : T.height(me.x, me.z)) + 1.7; } else { me.x = V.x; me.z = V.z; me.y = V.y + 1; }
    A.step(1 / 120, { agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: -2 } });
    for (const e of A.events) {
      if (e.src === 'world') { if (e.type === 'crack' && R.crack === null) R.crack = t; if (e.type === 'give') { R.gives++; if (R.give === null) R.give = t; } if (e.type === 'collapse') R.collapse = t; if (e.how && e.type === 'creak') R.hows[e.how] = (R.hows[e.how] || 0) + 1; if (log && e.type !== 'creak') console.log(`   ${t.toFixed(1)}s ${e.type} part ${e.part} ${e.mat} by ${e.how}`); }
      if (e.src === 'victim' && e.type === 'seized' && R.caught === null) R.caught = t;
    }
    A.events.length = 0;
    const b = mind.beh;
    if (b && b.name === 'besiege' && b.phase === 'force') { forced = true; R.subs.add(b.sub); }
    if (b && b.name === 'besiege' && b.forceDone && R.gaveUp === null) R.gaveUp = t;
    if (mind.ov.force && (R.caught !== null || (b && b.name === 'seize'))) mind.ov.force = null;
    if (log && i % 1200 === 0) console.log(`   ${t.toFixed(0)}s ${mind.label}/${b && b.phase}/${b && b.sub} spent ${b && b.spent ? b.spent.toFixed(0) : '-'} will ${b && b.will ? b.will.toFixed(0) : '-'}  "${mind.thought}"`);
    if (R.caught !== null && t - R.caught > 3) break;
  }
  R.forced = forced;
  return R;
}
if (process.argv[1] && process.argv[1].endsWith('breach.mjs')) {
  const f = (x) => (x === null ? '   -  ' : (x.toFixed(0) + 's').padStart(6));
  for (const k of kinds) for (const m of motives) {
    const r = breach(k, m, secs, seed, !!process.env.LOG);
    console.log(`${k.padEnd(6)} ${m.padEnd(8)} forced ${r.forced ? 'y' : 'n'} crack ${f(r.crack)} give ${f(r.give)} (${r.gives}) collapse ${f(r.collapse)} reached-in ${f(r.caught)} gave-up ${f(r.gaveUp)} hows ${JSON.stringify(r.hows)} subs ${[...r.subs].join(',')}`);
  }
}
