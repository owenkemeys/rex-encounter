// Stimulus scenarios: meat upwind, a flare, the herd, stones thrown at it. Prints behaviour timelines.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const which = process.argv[2] || 'all', seed = +(process.argv[3] || 3);
const SC = {
  meat: { secs: 150, setup: (A, s) => { A.things.place('meat', s.x + 70, s.z + 20); }, wind: (s) => ({ x: -3, z: -0.8 }), hunger: 0.7 },
  flare: { secs: 90, setup: (A, s) => { A.things.throw('flare', s.x + 30, 3, s.z + 30, s.x + Math.sin(s.psi) * 22, s.z + Math.cos(s.psi) * 22); }, light: 0.55 },
  herd: { secs: 180, setup: (A, s) => { A.herd.home = { x: s.x + 50, z: s.z + 10 }; for (const p of A.herd.list) { p.x = s.x + 50 + (p.x - A.herd.list[0].x); p.z = s.z + 10 + (p.z - A.herd.list[0].z); } }, hunger: 0.9 },
  stones: { secs: 60, person: true, throws: [6, 10, 14, 22] },
};
for (const [name, S] of Object.entries(SC)) {
  if (which !== 'all' && which !== name) continue;
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0.4, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  if (S.hunger) mind.hunger = S.hunger;
  S.setup && S.setup(A, sim);
  const me = { id: 'you', x: sim.x + Math.sin(sim.psi + 2.6) * 24, z: sim.z + Math.cos(sim.psi + 2.6) * 24, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
  console.log(`\n== ${name}`); let lab = '', thr = 0, rock = 0, stats = {};
  for (let i = 0; i < S.secs * 120; i++) {
    const t = i / 120; me.y = T.height(me.x, me.z) + 1.7;
    if (S.throws && thr < S.throws.length && t > S.throws[thr]) { A.things.throw('stone', me.x, me.y, me.z, sim.x + Math.sin(sim.psi) * 1.2, sim.z + Math.cos(sim.psi) * 1.2, 'you', sim.py.x + 0.3); thr++; }
    const wind = S.wind ? S.wind(sim) : { x: 0, z: -3 };
    A.step(1 / 120, { agents: S.person ? [me] : [], noises: [], light: S.light ?? 0.9, flash: false, wind });
    for (const e of A.events) { const k = e.src + ':' + e.type; if (!/footfall|liftoff|impact/.test(e.type)) stats[k] = (stats[k] || 0) + 1; }
    A.events.length = 0;
    if (process.env.TRACE && mind.label === "hunt" && mind.beh.phase === "rush" && i % 12 === 0) { const q = A.herd.list.find((p) => p.id === mind.beh.id); console.log("   rush", t.toFixed(1), "d", Math.hypot(q.x - sim.x, q.z - sim.z).toFixed(1), "v", sim.v.toFixed(1), "prey v", q.v.toFixed(1), q.state, "snapped", mind.beh.snapped, "fat", sim.exertion.toFixed(2)); }
    const L = mind.label + (mind.beh && mind.beh.phase ? '/' + mind.beh.phase : '') + (mind.beh && mind.beh.sub ? '/' + mind.beh.sub : '');
    if (L !== lab && !/\/(bite|tear|gulp)$/.test(L)) { lab = L; const f = mind.focus; console.log(`${t.toFixed(1).padStart(6)}s ${L.padEnd(22)} hunger=${mind.hunger.toFixed(2)} focus=${f ? f.kind + '@' + f.d?.toFixed(0) + 'm sal=' + f.sal.toFixed(2) : '-'} prey=${mind.prey ? mind.prey.d.toFixed(0) + 'm ' + mind.prey.state : '-'} | ${mind.thought}`); }
    for (const o of T.obstacles) if (Math.hypot(sim.x - o.x, sim.z - o.z) < o.r) rock++;
  }
  console.log('   events', JSON.stringify(stats), 'ticks in rock', rock, 'meat left', A.things.list.filter((o) => o.amount > 0).map((o) => o.kind + ':' + o.amount.toFixed(2)).join(','), 'herd', A.herd.alive.length);
}
