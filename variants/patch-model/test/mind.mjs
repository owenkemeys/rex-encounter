// Plays scripted people against the mind and prints what the animal did.
import { makeTerrain } from '../src/terrain.js';
import { RexSim } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
export function play(name, script, secs, { seed = 3, light = 0.8, wind = { x: 0, z: -3 }, verbose = true, rexAt = { x: 0, z: 0, yaw: 0 } } = {}) {
  const T = makeTerrain(7), sim = new RexSim(T, { ...rexAt, seed }), mind = new Mind(sim, seed);
  const dt = 1 / 120, me = { id: 'you', x: 0, y: 0, z: 30, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 };
  const log = [], counts = {}, ev = {}; let lastB = null, lastThought = '', minD = 1e9, snaps = 0, timeSeen = 0;
  const st = { t: 0, noises: [], me, sim, mind, T };
  for (let i = 0; i < secs * 120; i++) {
    const t = Math.round(i * dt * 1e6) / 1e6; st.t = t; st.noises = [];
    const px = me.x, pz = me.z;
    script(st, dt);
    me.y = T.height(me.x, me.z) + (me.crouch ? 1.0 : 1.7);
    me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = Math.hypot(me.vx, me.vz);
    if (st.face === 'rex') { const d = Math.hypot(sim.x - me.x, sim.z - me.z) || 1; me.fx = (sim.x - me.x) / d; me.fz = (sim.z - me.z) / d; }
    else if (me.speed > 0.2) { me.fx = me.vx / me.speed; me.fz = me.vz / me.speed; }
    const I = mind.step(dt, { agents: [me], noises: st.noises, light, flash: false, wind });
    sim.step(dt, I);
    for (const e of sim.events) { ev[e.type] = (ev[e.type] || 0) + 1; if (e.type === 'snap') snaps++; } sim.events.length = 0;
    const b = mind.beh;
    if (b && b.gen !== lastB) { lastB = b.gen; counts[b.name] = (counts[b.name] || 0) + 1; log.push(`${t.toFixed(1).padStart(6)}s ${b.name.padEnd(8)} d=${Math.hypot(sim.x - me.x, sim.z - me.z).toFixed(0).padStart(3)}m seen=${mind.know.seen ? 'Y' : 'n'} ar=${mind.mood.arousal.toFixed(2)} int=${mind.mood.interest.toFixed(2)} irr=${mind.mood.irritation.toFixed(2)} cert=${mind.sum.cert.toFixed(2)} (${b.reason})`); }
    if (mind.thought !== lastThought && verbose === 'thoughts') { lastThought = mind.thought; log.push(`         · ${mind.thought}`); }
    { const tip = sim.head.pos.clone().addScaledVector(sim.head.f, 1.8); minD = Math.min(minD, Math.hypot(tip.x - me.x, tip.y - me.y, tip.z - me.z)); st.minHip = Math.min(st.minHip ?? 99, Math.hypot(sim.x - me.x, sim.z - me.z)); }
    if (mind.know.seen) timeSeen += dt;
    st.stuck = (sim.vT > 0.6 && Math.abs(sim.v) < 0.25) ? (st.stuck || 0) + dt : 0; st.maxStuck = Math.max(st.maxStuck || 0, st.stuck);
    for (const o of T.obstacles) if (Math.hypot(sim.x - o.x, sim.z - o.z) < o.r + 1.2) st.inRock = (st.inRock || 0) + 1;
  }
  if (verbose) console.log(`\n== ${name}\n` + log.join('\n'));
  console.log(`   summary: ${JSON.stringify(counts)} events ${JSON.stringify(ev)} closest snout tip ${minD.toFixed(1)}m, hips ${st.minHip.toFixed(1)}m, seen ${(100 * timeSeen / secs).toFixed(0)}% of the time, longest stuck ${(st.maxStuck || 0).toFixed(1)}s, ticks in rock ${st.inRock || 0}`);
  return { counts, minD };
}
if (process.argv[1].endsWith('mind.mjs')) {
  const which = process.argv[2] || 'all', seed = +(process.argv[3] || 3);
  const S = {
    still_open: [(s) => { s.me.x = 0; s.me.z = 34; s.face = 'rex'; }, 150],
    wander_near: [(s, dt) => { s.me.x = Math.sin(s.t * 0.05) * 30; s.me.z = 20 + Math.cos(s.t * 0.07) * 15; s.face = null; }, 150],
    hide_and_throw: [(s, dt) => {
      // seen walking in the open, slips behind the nearest rock, crouches, then throws stones off to the side
      const o = s.T.obstacles.reduce((b, q) => Math.hypot(q.x, q.z) < Math.hypot(b.x, b.z) ? q : b);
      if (s.t < 1e-6) { s.ox = o.x; s.oz = o.z; const u = Math.hypot(o.x, o.z); s.hx = o.x + o.x / u * (o.r + 1); s.hz = o.z + o.z / u * (o.r + 1); s.me.x = o.x + o.z / u * 16; s.me.z = o.z - o.x / u * 16; }
      if (s.t > 4 && s.t < 30) { const dx = s.hx - s.me.x, dz = s.hz - s.me.z, d = Math.hypot(dx, dz); if (d > 0.3) { s.me.x += dx / d * dt * 1.4; s.me.z += dz / d * dt * 1.4; } }
      s.me.crouch = s.t > 18; s.face = 'rex';
      for (const T of [50, 85, 120, 150]) if (Math.abs(s.t - T) < 1e-6) { const a = Math.atan2(s.ox, s.oz) + (T % 2 ? 1.6 : -1.6); s.noises.push({ x: s.ox + Math.sin(a) * 30, y: 0, z: s.oz + Math.cos(a) * 30, loud: 0.35, kind: 'stone' }); }
    }, 170],
    run_away: [(s, dt) => { if (s.t < 1) { s.me.x = 0; s.me.z = 22; } if (s.t > 12 && s.t < 30) { s.me.z += dt * 5.5; s.me.x += dt * 2; } s.face = s.t > 12 && s.t < 30 ? null : 'rex'; }, 60],
    approach_it: [(s, dt) => { if (s.t < 1) { s.me.x = 3; s.me.z = 40; } if (s.t > 5 && Math.hypot(s.me.x - s.sim.x, s.me.z - s.sim.z) > 9) { const d = Math.hypot(s.sim.x - s.me.x, s.sim.z - s.me.z); s.me.x += (s.sim.x - s.me.x) / d * dt * 1.3; s.me.z += (s.sim.z - s.me.z) / d * dt * 1.3; } s.face = 'rex'; }, 120],
    shout_behind: [(s, dt) => { s.me.x = 0; s.me.z = -45; s.face = 'rex'; if (Math.abs(s.t - 10) < 1e-3) s.noises.push({ x: 0, y: 0, z: -45, loud: 0.6, kind: 'shout' }); }, 90],
  };
  for (const [k, [fn, secs]] of Object.entries(S)) if (which === 'all' || which === k) play(k, fn, secs, { seed, rexAt: k === 'hide_and_throw' ? { x: 0, z: 0, yaw: -2.7 } : undefined, verbose: which === 'all' ? true : 'thoughts' });
}
