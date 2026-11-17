// Does a passive person get provoked? A person standing still in the open, the animal starting 25 m off, having noticed them.
// Per hunger and seed: time from first within 6 m to first physical contact, the longest stretch within 6 m spent only looking/sniffing/circling,
// counts of each kind of contact, time of death.   node test/provoke.mjs [hungers=0.2,0.5,0.8] [secs=120] [seeds=1-6] [still|run]   V=1 for timelines
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
const HUNS = (process.argv[2] || '0.2,0.5,0.8').split(',').map(Number), SECS = +(process.argv[3] || 120), seeds = (process.argv[4] || '1,2,3,4,5,6').split(',').map(Number), MODE = process.argv[5] || 'still', dt = 1 / 120, hyp = Math.hypot, V = !!process.env.V;
const med = (a) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);
const all = {};
for (const HUN of HUNS) {
  const rows = [];
  for (const seed of seeds) {
    const T = makeTerrain(7), me = { id: 'you', x: 0, z: 0, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 1, ly: 0, lz: 0 }; me.y = T.height(0, 0) + 1.65;
    const sim = new Creature(T, { x: 0, z: 25, yaw: Math.PI, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
    A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = HUN; if (mind.ov && mind.ov.notice) mind.ov.notice.you = true;
    const v = A.victim('you'); const cnt = {}, tl = []; let lastC = null, gap = 0, gap2 = 0, lastA = null, arrive = null, first = null, dead = null, polite = 0, politeMax = 0, lastB = '', lastT = 0;
    const note = (k, t) => { cnt[k] = (cnt[k] || 0) + 1; if (arrive !== null && first === null) first = t; if (arrive !== null) { gap = Math.max(gap, t - Math.max(lastC ?? arrive, arrive)); lastC = t; gap2 = Math.max(gap2, t - Math.max(lastA ?? arrive, arrive)); lastA = t; } if (V) tl.push(`${t.toFixed(1)} ${k}`); };
    for (let i = 0; i < SECS * 120 && !dead; i++) {
      const t = i * dt; const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl;
      me.x = v.state === 'free' ? me.x : v.x; me.z = v.state === 'free' ? me.z : v.z; if (v.state === 'free') { if (MODE === 'run' && arrive !== null) { me.vx = -me.fx * 5; me.vz = -me.fz * 5; me.x += me.vx * dt; me.z += me.vz * dt; me.speed = 5; } me.y = T.height(me.x, me.z) + 1.65; }
      A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
      const d = hyp(sim.x - me.x, sim.z - me.z); if (arrive === null && d < 6) { arrive = t; if (V) tl.push(`${t.toFixed(1)} ARRIVE`); }
      for (const e of A.events) {
        if (e.type === 'nudge') { const h = sim.head.pos; if (hyp(h.x - me.x, h.z - me.z) < 3.5) note('nudge', t); }
        else if (e.type === 'knocked') note('knock:' + e.by, t);
        else if (e.type === 'pinned') note('pin', t); else if (e.type === 'seized') note('seize', t);
        else if (e.type === 'tossed') note('toss', t); else if (e.type === 'dropped') note('drop', t);
        else if (e.type === 'death') { dead = t; note('death:' + e.cause, t); }
        else if (e.type === 'huff' || e.type === 'roar' || e.type === 'snap' || e.type === 'stomp') { if (hyp(sim.head.pos.x - me.x, sim.head.pos.z - me.z) < 3.5) { cnt['display:' + e.type] = (cnt['display:' + e.type] || 0) + 1; if (arrive !== null) { gap2 = Math.max(gap2, t - Math.max(lastA ?? arrive, arrive)); lastA = t; } } }
      }
      A.events.length = 0;
      const b = mind.beh, bn = b ? b.name : '-';
      if (V && (bn + (b && b.phase || '')) !== lastB) { tl.push(`${t.toFixed(1)} beh ${bn}/${b && b.sub || b && b.phase || ''} d=${d.toFixed(1)}`); lastB = bn + (b && b.phase || ''); }
      

      if (first !== null && V && false) break;
    }
    if (arrive !== null && !dead) gap = Math.max(gap, SECS - Math.max(lastC ?? arrive, arrive)); politeMax = gap; if (arrive !== null && !dead) gap2 = Math.max(gap2, SECS - Math.max(lastA ?? arrive, arrive));
    const r = { seed, gap2, arrive, first, lag: arrive !== null && first !== null ? first - arrive : null, politeMax, cnt, dead };
    rows.push(r); console.log(`h${HUN} seed ${seed}: arrive ${arrive === null ? '-' : arrive.toFixed(1)} first contact ${first === null ? 'never' : first.toFixed(1)} (lag ${r.lag === null ? '-' : r.lag.toFixed(1)}) longest gap: contact ${politeMax.toFixed(1)} any-act ${gap2.toFixed(1)} contacts ${JSON.stringify(cnt)} ${dead === null ? 'alive' : 'DIED ' + dead.toFixed(1)}`);
    if (V) console.log(tl.join('\n'));
  }
  const lags = rows.map((r) => r.lag).filter((x) => x !== null), kinds = rows.map((r) => Object.keys(r.cnt).filter((k) => !k.startsWith('death')).map((k) => k.replace(/:.*/, '')).filter((x, i, a) => a.indexOf(x) === i).length);
  console.log(`== hunger ${HUN}: median lag ${med(lags) === null ? '-' : med(lags).toFixed(1)} (never ${rows.length - lags.length}); longest gap contact: mean ${(rows.reduce((a, r) => a + r.politeMax, 0) / rows.length).toFixed(1)} max ${Math.max(...rows.map((r) => r.politeMax)).toFixed(1)}; any-act (contact or huff/roar/snap/stomp): mean ${(rows.reduce((a, r) => a + r.gap2, 0) / rows.length).toFixed(1)} max ${Math.max(...rows.map((r) => r.gap2)).toFixed(1)}; kinds/run ${kinds.join(',')}; deaths ${rows.filter((r) => r.dead !== null).length}/${rows.length}; tosses in ${rows.filter((r) => r.cnt.toss).length} seeds`);
}
