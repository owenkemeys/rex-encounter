// T11 in play: a hungry animal chases a scripted runner that weaves tight round the Containers' corners for 5 minutes; every body knock
// (a new sim.crashS) is counted with what the mind then shows (mind.voice.think) within 0.6 s and how long that stays up.
//   node test/crashthoughtchase.mjs [seed|all] [secs]
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const arg = process.argv[2] || 'all', SECS = +(process.argv[3] || 300), dt = 1 / 120, hyp = Math.hypot, seeds = arg === 'all' ? [1, 2, 3, 4] : [+arg];
const PAIN = /^(bump|ow|OW|hard thing|careful|slow\. careful)|hurt|head/i, DISM = /not care|no stop|keep go|still chase|no\. stop|press|on\b|ow\. no/i;
const tot = { n: 0, pain: 0, dism: 0, none: 0, early: 0, held: 0, wound: 0 };
for (const seed of seeds) {
  const T = makeTerrain(7), sim = new Creature(T, { x: -21.5, z: 47, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 1;
  const v = A.victim('you'), path = [{ x: -22.5, z: 60 }, { x: -23.4, z: 75.2 }, { x: -44, z: 77 }, { x: -46, z: 56 }, { x: -24, z: 50 }, { x: -9, z: 70 }, { x: -22.5, z: 60 }];
  const me = { id: 'you', x: -22.5, z: 60, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 1, ly: 0, lz: 0 }; me.y = T.height(me.x, me.z) + 1.65;
  let k = 1, last = null; const rows = []; let lastKnock = null, deaths = 0;
  for (let i = 0; i < SECS * 120; i++) {
    const t = i * dt;
    if (v.dead && t - v.deadT > 3) { v.respawn(-22.5, 60, T); me.x = -22.5; me.z = 60; k = 1; deaths++; }
    if (v.state === 'free') { const g = path[k], dx = g.x - me.x, dz = g.z - me.z, d = hyp(dx, dz), st = Math.min(d, 6.2 / 120); me.x += dx / (d || 1) * st; me.z += dz / (d || 1) * st; me.vx = dx / (d || 1) * 6.2; me.vz = dz / (d || 1) * 6.2; me.speed = 6.2; if (d < 0.1) k = (k + 1) % path.length; me.y = T.height(me.x, me.z) + 1.65; }
    const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl;
    A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const th = mind.voice.think || '', C = sim.crashS;
    if (mind.mem.crash && mind.mem.crash.t !== (last && last.t)) { last = mind.mem.crash; const M = mind.mood; lastKnock = { t: mind.t, hard: C.hard || 0, reel: C.reel || 0, tan: C.tan ?? 1, irr: M.irritation, aro: M.arousal, frus: mind.peril.frus, beh: mind.beh ? mind.beh.name : '-', txt: null, t0: null, t1: null, seen: [] }; rows.push(lastKnock); }
    if (lastKnock) { const dtk = mind.t - lastKnock.t; if (dtk >= 0.6 && lastKnock.txt === null) { lastKnock.txt = th; lastKnock.t0 = mind.t; } if (lastKnock.txt !== null && lastKnock.t1 === null) { if (th !== lastKnock.txt) lastKnock.t1 = mind.t; } if (dtk < 0.6 && th && !lastKnock.first) lastKnock.first = th; }
  }
  rows.forEach((r, j) => { const nx = rows[j + 1], gap = nx ? nx.t - r.t : 99, held = (r.t1 ?? mind.t) - r.t, txt = r.first || r.txt || '';      // held: from the knock to the next change
    const kind = !txt ? 'none' : DISM.test(txt) && !/^ow\. (hard|that)/i.test(txt) ? 'dism' : PAIN.test(txt) ? 'pain' : 'other';
    tot.n++; tot[kind === 'other' ? 'none' : kind]++; if (kind === 'pain' || kind === 'dism') { if (held >= 1.5 || gap < 1.5) tot.held++; else tot.early++; } if (r.irr > 0.45 || r.frus > 0.5 || (r.aro > 0.6)) tot.wound++;
    if (process.env.V) console.log(`  seed ${seed} t ${r.t.toFixed(0)} ${r.beh} hard ${r.hard.toFixed(2)} reel ${r.reel.toFixed(2)} tan ${r.tan.toFixed(2)} irr ${r.irr.toFixed(2)} aro ${r.aro.toFixed(2)} frus ${r.frus.toFixed(2)} -> "${txt}" (${kind}) held ${held.toFixed(1)}`); });
  console.log(`seed ${seed}: knocks ${rows.length}, deaths ${deaths}`);
}
const p = (x) => (tot.n ? (100 * x / tot.n).toFixed(0) : '-') + '%';
console.log(`TOTAL knocks ${tot.n}: pain thought ${p(tot.pain)}, dismissal ${p(tot.dism)}, nothing/other ${p(tot.none)}; crash thought held >=1.5 s ${p(tot.held)}, replaced early ${p(tot.early)}; wound-up by the rule ${p(tot.wound)}`);
