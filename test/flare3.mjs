// Flares on reuse: from the game's start a person stands ~12 m off, and each time the animal is within 14 m of him (at least
// GAP s after the last) throws a flare to its side, ~9 m from it, as a lure; three in all. For each flare, from its landing:
// how soon the head turns to it (horizontal aim within 25 deg), how long the head stays on it in the next 15 s (dwell), the
// longest single look, whether it left what it was doing for it (investigate), how close it went, and what it thought.
// node test/flare3.mjs [seeds=4] [GAP=20]   --root=/path runs another tree
import { pathToFileURL, fileURLToPath } from 'node:url';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const pos = process.argv.slice(2).filter((x) => !x.startsWith('-'));
const N = +(pos[0] || 4), GAP = +(pos[1] || 20), dt = 1 / 120, hyp = Math.hypot;
const ROOT = arg('root', fileURLToPath(new URL('..', import.meta.url))).replace(/\/$/, '');
const imp = (p) => import(pathToFileURL(ROOT + '/' + p).href);
const { makeTerrain } = await imp('src/terrain.js'), { Creature } = await imp('src/rex/body/rex.js'), { Mind } = await imp('src/rex/brain/mind.js'), { Arena } = await imp('src/sim/arena.js'), { LAYOUT } = await imp('src/paddock.js');
const SP = LAYOUT.spawn, all = [[], [], []];
for (let seed = 1; seed <= N; seed++) {
  const T = makeTerrain(7), sim = new Creature(T, { x: SP.rex.x, z: SP.rex.z, yaw: SP.rex.yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  const me = { id: 'you', x: SP.you.x, z: SP.you.z, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 1, fz: 0 };
  me.y = T.height(me.x, me.z) + 1.7; A.opening(me);
  const Vc = A.victim('you'), F = []; let lastThrow = -99, death = null, side = 1;
  for (let i = 0; i < 300 * 120 && F.length <= 3; i++) {
    const t = i * dt, px = me.x, pz = me.z, d = hyp(sim.x - me.x, sim.z - me.z);
    if (Vc.free) {
      if (d > 12.5) { const s = Math.min(d - 12, 1.4 * dt); me.x += (sim.x - me.x) / d * s; me.z += (sim.z - me.z) / d * s; }
      me.fx = (sim.x - me.x) / (d || 1); me.fz = (sim.z - me.z) / (d || 1);
      if (F.length < 3 && d < 14 && t - lastThrow > GAP && t > 8) {
        lastThrow = t; side = -side;
        const ux = (sim.x - me.x) / d, uz = (sim.z - me.z) / d, lx = sim.x + uz * side * 9 - ux * 2, lz = sim.z - ux * side * 9 - uz * 2;
        const th = A.things.throw('flare', me.x, me.y, me.z, lx, lz, 'you');
        F.push({ n: F.length + 1, id: th && th.id, t, land: null, turn: null, dwell: 0, look: 0, run: 0, inv: false, minD: 99, th: [], beh0: mind.beh && mind.beh.name, behs: {} });
      }
    } else { me.x = Vc.x; me.z = Vc.z; }
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = Vc.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: -1 } });
    for (const e of A.events) if (e.src === 'victim' && e.type === 'death' && death === null) death = t;
    A.events.length = 0;
    for (const f of F) {
      const o = A.things.list.find((q) => q.id === f.id); if (!o) continue;
      if (f.land === null && o.rest) f.land = t;
      if (f.land === null || t - f.land > 15) continue;
      const h = sim.head, b = Math.atan2(o.x - h.pos.x, o.z - h.pos.z) - Math.atan2(h.f.x, h.f.z), off = Math.abs(Math.atan2(Math.sin(b), Math.cos(b)));
      if (off < 0.44) { f.dwell += dt; f.run += dt; f.look = Math.max(f.look, f.run); if (f.turn === null) f.turn = t - f.land; } else f.run = 0;
      if (mind.beh && mind.beh.name === 'investigate') f.inv = true;
      f.minD = Math.min(f.minD, hyp(sim.x - o.x, sim.z - o.z));
      const L = mind.label; f.behs[L] = (f.behs[L] || 0) + dt;
      const tt = mind.voice && mind.voice.think; if (tt && f.th[f.th.length - 1] !== tt) f.th.push(tt);
    }
    if (death !== null) break;
    if (F.length === 3 && F[2].land !== null && t - F[2].land > 15) break;
  }
  console.log(`s${seed}${death !== null ? ' (dead at ' + death.toFixed(0) + ' s)' : ''}`);
  for (const f of F) {
    all[f.n - 1].push(f);
    console.log(`  flare ${f.n} at ${f.t.toFixed(0)}s (was ${f.beh0}): head to it ${f.turn === null ? 'never' : '+' + f.turn.toFixed(1) + ' s'}, dwell ${f.dwell.toFixed(1)} s of 15, longest look ${f.look.toFixed(1)} s, left its goal ${f.inv ? 'yes' : 'no'}, nearest ${f.minD.toFixed(1)} m | ${Object.entries(f.behs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v.toFixed(0)).join(', ')} | ${f.th.slice(0, 6).join(' / ')}`);
  }
}
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
console.log('\nSUMMARY (median over seeds)');
all.forEach((A, k) => { if (!A.length) return; const turned = A.filter((f) => f.turn !== null); console.log(`  flare ${k + 1}: n=${A.length}  head turned ${turned.length}/${A.length} (median +${med(turned.map((f) => f.turn)).toFixed(1)} s)  dwell ${med(A.map((f) => f.dwell)).toFixed(1)} s  longest look ${med(A.map((f) => f.look)).toFixed(1)} s  left goal ${A.filter((f) => f.inv).length}/${A.length}`); });
