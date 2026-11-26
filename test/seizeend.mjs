// T10: how does a seize end? A person standing still (open ground 6 m off, or at the Warehouse window spot), a hungry animal, seeds 1..6.
// Prints each seize: how it ended (killed, dropped, tossed, slipped = he worked loose), the taste verdict and its terms, and time to death.
//   node test/seizeend.mjs [open|window] [hunger] [secs] [seed|all]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const where = process.argv[2] || 'open', HUN = +(process.argv[3] || 0.9), SECS = +(process.argv[4] || 120), arg = process.argv[5] || 'all', dt = 1 / 120, hyp = Math.hypot, verbose = !!process.env.V;
const seeds = arg === 'all' ? [1, 2, 3, 4, 5, 6] : [+arg];
const tot = { seizes: 0, first: 0, firstKill: 0, kills: 0, ends: {}, ttk: [], thoughtDrop: {} };
for (const seed of seeds) {
  const T = makeTerrain(7);
  const win = where === 'window', px = win ? -50.3 : 0, pz = win ? 60.6 : 0;
  const me = { id: 'you', x: px, z: pz, y: 0, vx: 0, vz: 0, speed: 0, crouch: !!process.env.CROUCH, fx: 0, fz: -1, lx: 1, ly: 0, lz: 0 }; me.y = T.height(me.x, me.z) + 1.65;
  const st = win ? [-50.5, 45, 0] : [px, pz + 6, Math.PI];
  const sim = new Creature(T, { x: st[0], z: st[1], yaw: st[2], seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = HUN; if (process.env.FORCE) mind.ov.force = 'seize';
  const v = A.victim('you'); let prev = v.state, seizeAt = null, n = 0, last = null, taste = null, dead = null, subs = [], lastSub = null;
  for (let i = 0; i < SECS * 120 && !dead; i++) {
    const t = i * dt; const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl;
    if (process.env.DOWN && i === 60) v.knock(0.5, 1.5, 0, 'test', 0.3);      // DOWN=1: he starts the run knocked flat (the other way into a seize: the owner was thrown and picked up again)
    if (v.state === 'free') { me.x = v.x; me.z = v.z; }
    A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
    const evs = A.events.slice(); A.events.length = 0;
    const b = mind.beh;
    if (b && b.name === 'seize' && b.phase === 'hold') { if (b.sub !== lastSub) { subs.push(b.sub); lastSub = b.sub; } if (b.tasted && !taste) { const ap = mind.ap; taste = { kept: b.kept, need: +ap.need.toFixed(2), worth: +ap.worth.toFixed(2), meat: +(ap.cues.meat || 0).toFixed(2), blood: +(mind.know.target.blood || 0).toFixed(2), palate: +ap.palate.toFixed(2), cost: +ap.cost.toFixed(2), fear: +ap.fear.toFixed(2), ovv: mind.ov.verdict, motive: b.motive, hunger: +mind.hunger.toFixed(2) }; } }
    if (v.state === 'held' && prev !== 'held') { seizeAt = t; n++; tot.seizes++; if (n === 1) tot.first++; subs = []; lastSub = null; taste = null; last = { motive: b && b.motive, handled: v.handled }; }
    if (v.dead && !dead) { dead = t; if (verbose) console.log('  death beh', b && b.name, b && b.phase, b && b.sub, 'act', sim.act && sim.act.kind, 'peril', mind.peril.stage, 'hist', evs.map((e) => e.type).join(',')); }
    if (prev === 'held' && v.state !== 'held') {
      let how = v.dead ? 'KILLED' : evs.some((e) => e.type === 'tossed') ? 'tossed' : evs.some((e) => e.type === 'slipped') ? 'slipped(he worked loose)' : evs.some((e) => e.type === 'dropped') ? 'dropped' : 'other:' + v.state;
      const key = how.split('(')[0]; tot.ends[key] = (tot.ends[key] || 0) + 1;
      if (v.dead) { tot.kills++; if (n === 1) tot.firstKill++; tot.ttk.push(t - seizeAt); }
      console.log(`seed ${seed} seize#${n} t=${seizeAt.toFixed(1)} held ${(t - seizeAt).toFixed(1)} s -> ${how}; motive ${last.motive}; subs ${subs.join('>')}; voice "${mind.thinker.stream.length ? mind.thinker.stream[mind.thinker.stream.length - 1].text : ''}"; taste ${taste ? JSON.stringify(taste) : '-'}`);
    }
    prev = v.state;
  }
  console.log(`SEED ${seed}: seizes ${n}, ${dead === null ? 'alive' : 'died at ' + dead.toFixed(1) + ' s by ' + v.cause + ' (' + (v.lastHurt && v.lastHurt.motive) + ')'}`);
}
console.log(`TOTAL ${where} hunger ${HUN}: seizes ${tot.seizes}; first seizes ${tot.first}, first seizes that kill ${tot.firstKill}; kills ${tot.kills}; ends ${JSON.stringify(tot.ends)}; seize-to-death ${tot.ttk.map((x) => x.toFixed(1)).join(',') || '-'} s`);
