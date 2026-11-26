// The owner's barn playtest (T3/T4): a person standing still at (24.4, 76.5) just inside the Barn's south wall, a hungry rex starting 15 m off.
// Does the head reach him, do its snaps connect, how long to the first seize, is the head squared on him while it sees him?
//   node test/barn.mjs [seed] [secs] [quiet]      (seeds 1..6 if seed is "all")
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
const arg = process.argv[2] || 'all', SECS = +(process.argv[3] || 90), quiet = arg === 'all' || process.argv[4] === 'quiet', dt = 1 / 120, hyp = Math.hypot;
const seeds = arg === 'all' ? [1, 2, 3, 4, 5, 6] : [+arg];
const STR = new Set(['snap', 'seize', 'strike']);
const rows = [];
for (const seed of seeds) {
  const T = makeTerrain(7);
  const me = { id: 'you', x: 24.4, z: 76.5, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 1, ly: 0, lz: 0 }; me.y = T.height(me.x, me.z) + 1.65;
  const st = (process.env.START || '27,91.5,3.14').split(',').map(Number), sim = new Creature(T, { x: st[0], z: st[1], yaw: st[2], seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.list.length = 0; A.herd.disabled = true; mind.hunger = 0.8;
  let lastRoll = 0, lastYo = 0, held = null, snaps = [], lastKind = null, seenT = 0, cockT = 0, nearT = 0, minTip = 99, lastAct = null, reachT = 0;
  for (let i = 0; i < SECS * 120; i++) {
    const t = i * dt; const fl = hyp(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / fl; me.fz = (sim.z - me.z) / fl;
    A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0;
    const h = sim.head.pos, F = sim.head.f, HL = sim.sp ? sim.sp.dims.headLen : 1.1, tip = { x: h.x + F.x * HL, y: h.y + F.y * HL, z: h.z + F.z * HL };
    const dTip = hyp(tip.x - me.x, tip.y - 0.65 - me.y + 0.65, tip.z - me.z), b = mind.beh, c = mind.ctx;
    if (dTip < minTip) minTip = dTip;
    const act = sim.act, k = act && act.forced && STR.has(act.kind) ? act : null;
    if (k && k !== lastAct) { const p = k.pt; snaps.push({ t, kind: k.kind, miss: p ? hyp(p.x - me.x, p.y - (me.y - 0.5), p.z - me.z) : -1, tipd: dTip, beh: b && b.name + '/' + (b.phase || ''), can: dTip < 1.2 }); }
    lastAct = k;
    // head cock while he is seen: the skull's roll about its own axis, and its yaw off the line to him
    const seen = !!(c && c.seen); if (seen) { seenT += dt; const roll = Math.abs(Math.asin(Math.max(-1, Math.min(1, sim.head.l.y)))), yo = Math.abs(((Math.atan2(me.x - h.x, me.z - h.z) - sim.head.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); lastRoll = roll; lastYo = yo; if (roll > 0.3 || yo > 0.5) cockT += dt; if (b && b.name === 'besiege' && roll > 0.3) reachT += dt; }
    if (!held && !A.victim('you').free) { held = t; break; }
    if (!quiet && i % 120 === 0) { const bn = b ? b.name + '/' + (b.sub || '') + '/' + (b.phase || '') : '-'; const rec = snaps.filter((s) => s.t > t - 1).map((s) => `${s.kind}@tip${s.tipd.toFixed(1)}`).join(','); console.log(`${t.toFixed(0).padStart(3)} ${bn} body ${sim.x.toFixed(1)},${sim.z.toFixed(1)} dBody ${hyp(sim.x - me.x, sim.z - me.z).toFixed(1)} dTip ${dTip.toFixed(2)} seen ${seen ? 1 : 0} roll ${lastRoll.toFixed(2)} yawoff ${lastYo.toFixed(2)} strikes[${rec}]`); }
  }
  const real = snaps.filter((s) => s.kind !== 'seize' || true);
  rows.push({ seed, held, n: snaps.length, can: snaps.filter((s) => s.can).length, minTip, cock: seenT ? cockT / seenT : 0 });
  console.log(`SEED ${seed}: first seize/kill ${held === null ? 'never' : held.toFixed(1) + ' s'}; strikes ${snaps.length} (kinds ${[...new Set(snaps.map((s) => s.kind))]}), within 1.2 m of his centre at the moment ${snaps.filter((s) => s.can).length}; mean target miss ${snaps.length ? (snaps.reduce((a, s) => a + s.miss, 0) / snaps.length).toFixed(1) : '-'} m; min tip dist ${minTip.toFixed(2)}; head cocked while seen ${(100 * (seenT ? cockT / seenT : 0)).toFixed(0)}% of ${seenT.toFixed(0)} s seen`);
}
const ok = rows.filter((r) => r.held !== null); console.log(`TOTAL seized ${ok.length}/${rows.length}; median time ${ok.length ? ok.map((r) => r.held).sort((a, b) => a - b)[Math.floor(ok.length / 2)].toFixed(1) : '-'} s; mean cocked share ${(100 * rows.reduce((a, r) => a + r.cock, 0) / rows.length).toFixed(0)}%`);
