// Fires each achievement detector from a scripted situation against the real terrain, body, mind and arena (headless).
//   node test/achievements.mjs [id|all] [seed]
// Each scenario names the achievements it expects and how the situation is made:
//   natural  the animal does it on its own from what the scripted person does
//   forced   the person's side is scripted and one step the animal would take is forced (a roar, a grab) through the real code path
//   probe    a mind probe (ov) removes a sense so a rare state can be reached on demand
// An achievement with no scenario that fires it is reported as unverified.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { Achievements, ACHIEVEMENTS } from '../src/achievements.js';

const DT = 1 / 120;
const hyp = Math.hypot;

export function world(seed = 3, { rexAt = { x: 0, z: 0, yaw: 0 }, herd = false } = {}) {
  const T = makeTerrain(7), sim = new Creature(T, { ...rexAt, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  if (!herd) A.herd.disabled = true;
  const me = { id: 'you', x: 0, y: 0, z: 30, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1, lx: 0, ly: 0, lz: 1, torch: false };
  const got = [], toasts = [], ideas = [];
  const ach = new Achievements({ sim, mind, terrain: T, things: A.things, arena: A }, { onDone: (a) => got.push({ id: a.id, t: ach.t }), onIdea: (a) => ideas.push({ id: a.id, t: ach.t }), rng: () => 0.5 });
  ach.done.clear(); ach.reset(false);
  return { T, sim, mind, A, me, ach, got, ideas, toasts, wind: { x: 0, z: -3 }, light: 0.85, noises: [] };
}

/** Advance the world by secs, calling script(w, t) before each step. */
export function advance(w, secs, script, { you = true } = {}) {
  const { T, sim, mind, A, me, ach } = w, n = Math.round(secs * 120);
  for (let i = 0; i < n; i++) {
    w.t = (w.t || 0) + DT; const px = me.x, pz = me.z; w.noises = [];
    if (script) script(w, w.t);
    const V = A.victim('you'); if (V.free) { me.y = T.height(me.x, me.z) + (me.crouch ? 1.0 : 1.7); me.vx = (me.x - px) / DT; me.vz = (me.z - pz) / DT; me.speed = hyp(me.vx, me.vz); } else me.speed = 0;
    A.step(DT, { agents: you ? [me] : [], noises: w.noises, light: w.light, flash: false, wind: w.wind });
    const hp = sim.head.pos, dx = hp.x - me.x, dy = hp.y - me.y, dz = hp.z - me.z, d = hyp(dx, dy, dz) || 1;
    const look = w.face === 'rex' ? { x: dx / d, y: dy / d, z: dz / d } : { x: me.fx, y: 0, z: me.fz };
    const Y = you && T.height ? { x: me.x, y: me.y, z: me.z, fx: look.x, fy: look.y, fz: look.z } : null;
    for (const e of A.events) ach.event(e, Y);
    A.events.length = 0;
    ach.update(DT, w.noYou ? null : Y);
  }
}
const walkTo = (me, x, z, speed, dt = DT) => { const dx = x - me.x, dz = z - me.z, d = hyp(dx, dz); if (d > 0.05) { const s = Math.min(speed * dt, d); me.x += dx / d * s; me.z += dz / d * s; me.fx = dx / d; me.fz = dz / d; } return d; };
const ahead = (sim, d, side = 0) => ({ x: sim.x + Math.sin(sim.psi) * d + Math.cos(sim.psi) * side, z: sim.z + Math.cos(sim.psi) * d - Math.sin(sim.psi) * side });

// ---------------------------------------------------------------------------------------------------------------------
const SC = {
  tail: { how: 'natural', expect: ['tail'], secs: 60, run(w) {
    // you come up behind it at a walk, lay a hand on the end of its tail, then creep straight away from it
    const tip = () => w.sim.spine[1].p;
    w.me.x = tip().x - Math.sin(w.sim.psi) * 3; w.me.z = tip().z - Math.cos(w.sim.psi) * 3;
    advance(w, 6, (w) => { const t = tip(); walkTo(w.me, t.x + Math.cos(w.sim.psi) * 0.6, t.z - Math.sin(w.sim.psi) * 0.6, 3.5); });
    const ax = w.me.x - w.sim.x, az = w.me.z - w.sim.z, al = hyp(ax, az);
    advance(w, 50, (w) => { w.me.crouch = true; w.me.x += ax / al * 1.4 * DT; w.me.z += az / al * 1.4 * DT; });
  } },
  hand: { how: 'natural', expect: ['hand'], secs: 60, setup(w) { w.mind.hunger = 0.95; }, run(w) {
    // meat thrown from 6 m, landing by its snout
    const t = ahead(w.sim, 6); w.me.x = w.sim.x - Math.sin(w.sim.psi) * 0 + Math.sin(w.sim.psi + 2.6) * 4; w.me.z = w.sim.z + Math.cos(w.sim.psi + 2.6) * 4;
    advance(w, 3, null); const h = w.sim.head.pos; w.A.things.throw('meat', w.me.x, w.me.y, w.me.z, h.x + w.sim.head.f.x * 2.2, h.z + w.sim.head.f.z * 2.2, 'you');
    advance(w, 40, (w) => { w.face = 'rex'; }); void t;
  } },
  steal: { how: 'natural', expect: ['steal'], secs: 30, run(w) {
    // meat on the ground two metres from its snout; you walk up and take it (T), exactly as the UI does
    const h = w.sim.head.pos, m = w.A.things.place('meat', h.x + w.sim.head.f.x * 3, h.z + w.sim.head.f.z * 3, { amount: 3 }); w.me.x = m.x + 2; w.me.z = m.z + 1;
    advance(w, 2, null); w.ach.took(m); w.A.take(m.id, 'you'); advance(w, 1, null);
  } },
  nose: { how: 'natural', expect: ['steal', 'nose'], secs: 120, setup(w) { w.mind.hunger = 0.95; }, run(w) {
    // meat it is eating; when it is feeding you take it from under its nose
    const h = w.sim.head.pos, m = w.A.things.place('meat', h.x + w.sim.head.f.x * 14, h.z + w.sim.head.f.z * 14, { amount: 3 }); w.me.x = m.x - 3; w.me.z = m.z + 8;
    let took = false;
    advance(w, 100, (w) => {
      if (!took && w.mind.label === 'feed' && w.mind.focus && w.mind.focus.id === m.id && hyp(w.sim.head.pos.x - m.x, w.sim.head.pos.z - m.z) < 3) { took = true; w.ach.took(m); w.A.take(m.id, 'you'); }
    });
    w.note = took ? 'took it mid-feed' : 'it never fed';
  } },
  roar: { how: 'forced', expect: ['roar'], secs: 12, run(w) {
    // its own roar (mind.lastRoar set as the mind does) at a person standing in front of it; the debug-button roar must NOT count
    w.me.x = ahead(w.sim, 10).x; w.me.z = ahead(w.sim, 10).z; w.face = 'rex'; advance(w, 1, null);
    w.sim.roar(); advance(w, 4, null);
    w.note = 'debug-button roar counted: ' + w.ach.has('roar');
    if (w.ach.has('roar')) { w.bad = true; return; }
    w.mind.lastRoar = w.mind.t; w.sim.roar(); advance(w, 1, null);
  } },
  moth: { how: 'natural', expect: ['moth'], secs: 90, light: 0.5, run(w) {
    // a flare thrown to land 25 m ahead of it
    w.me.x = ahead(w.sim, 0, 25).x; w.me.z = ahead(w.sim, 0, 25).z; const a = ahead(w.sim, 25);
    advance(w, 1, null); w.A.things.throw('flare', w.me.x, w.me.y, w.me.z, a.x, a.z, 'you');
    advance(w, 70, (w) => { w.face = 'rex'; });
  } },
  boop: { how: 'forced', expect: ['boop'], secs: 30, run(w) {
    // you stand at its snout while it is calm; (its own nudge event also counts)
    advance(w, 1, null); w.face = 'rex'; w.me.x = ahead(w.sim, 6).x; w.me.z = ahead(w.sim, 6).z;
    advance(w, 40, (w) => { w.mind.ov.force = 'nudge'; const h = w.sim.head.pos, f = w.sim.head.f; w.me.x = h.x + f.x * 2.2; w.me.z = h.z + f.z * 2.2; });
  } },
  stare: { how: 'natural', expect: ['stare'], secs: 90, run(w) {
    w.me.x = ahead(w.sim, 22).x; w.me.z = ahead(w.sim, 22).z; w.face = 'rex';
    advance(w, 80, (w) => { w.mind.hunger = 0.3; });
  } },
  ground: { how: 'forced', expect: ['ground'], secs: 20, run(w) {
    // it is giving ground (backoff) while it knows you and you are close
    w.me.x = ahead(w.sim, 8).x; w.me.z = ahead(w.sim, 8).z; w.face = 'rex'; advance(w, 3, null);
    advance(w, 8, (w) => { w.mind.ov.force = 'backoff'; });
  } },
  ghost: { how: 'natural', expect: ['ghost'], secs: 200, run(w) {
    // seen once, then you are gone behind a ridge 80 m away, motionless and silent
    w.me.x = ahead(w.sim, 14).x; w.me.z = ahead(w.sim, 14).z; w.face = 'rex'; advance(w, 8, null);
    const x = w.sim.x - Math.sin(w.sim.psi) * 190, z = w.sim.z - Math.cos(w.sim.psi) * 190; w.me.x = x; w.me.z = z; w.me.crouch = true; w.face = null;
    advance(w, 150, (w) => { w.me.x = x; w.me.z = z; });
  } },
  overlooked: { how: 'probe', expect: ['overlooked'], secs: 60, run(w) {
    // it walks past you at 4 m without noticing (the probe makes it not notice you; the detector reads its own sense state)
    w.mind.ov.notice.you = false; w.me.x = ahead(w.sim, 20, 4).x; w.me.z = ahead(w.sim, 20, 4).z; w.me.crouch = true;
    // (roam picks its own way: whenever it has gone by, you are put down again a little ahead of it and to one side)
    advance(w, 40, (w) => { w.mind.ov.force = 'roam'; const d = hyp(w.me.x - w.sim.x, w.me.z - w.sim.z); w.minD = Math.min(w.minD ?? 99, d); if (d > 16) { const p = ahead(w.sim, 12, 3.5); w.me.x = p.x; w.me.z = p.z; } });
    w.note = 'min dist ' + (w.minD || 0).toFixed(1);
  } },
  bowled: { how: 'forced', expect: ['bowled'], secs: 6, run(w) { w.me.x = ahead(w.sim, 4).x; w.me.z = ahead(w.sim, 4).z; advance(w, 1, null); w.A.victim('you').knock(2, 3, 2, 'butt', 1); advance(w, 3, null); } },
  held: { how: 'forced', expect: ['held'], secs: 12, run(w) {
    advance(w, 1, null); const V = w.A.victim('you'); V.seize({ by: 'jaws' }); V.release(0, 0.4, 0, 'drop'); advance(w, 2, null);
  } },
  slip: { how: 'forced', expect: ['slip', 'held'], secs: 12, run(w) {
    advance(w, 1, null); const V = w.A.victim('you'); V.seize({ by: 'jaws' }); V.release(0.5, 0.8, 0.5, 'slip'); advance(w, 2, null);
  } },
  tossed: { how: 'forced', expect: ['tossed', 'held'], secs: 12, run(w) {
    advance(w, 1, null); const V = w.A.victim('you'); V.seize({ by: 'jaws' }); V.release(3, 3, 3, 'toss'); advance(w, 3, null);
  } },
  fullset: { how: 'forced', expect: ['fullset', 'bowled', 'held', 'tossed'], secs: 40, run(w) {
    // knocked down, pinned, picked up, thrown, within three minutes (real Victim transitions; pin needs a planted foot, so it is forced)
    const V = w.A.victim('you'); advance(w, 1, null);
    V.knock(2, 3, 2, 'butt', 1); advance(w, 4, null); V.state = 'down'; V.pin(0); advance(w, 0.1, null);
    V.state = 'down'; V.seize({ by: 'jaws' }); V.release(3, 3, 3, 'toss'); advance(w, 3, null);
  } },
  decoy: { how: 'natural', expect: ['decoy'], secs: 170, seed: 3, rexAt: { x: 0, z: 0, yaw: -2.7 }, run(w) {
    // the 'hide_and_throw' habit from test/mind.mjs: seen, behind a rock, crouching; stones thrown to the side (thrown here as real stones)
    const T = w.T, o = T.obstacles.reduce((b, q) => (hyp(q.x, q.z) < hyp(b.x, b.z) ? q : b)), u = hyp(o.x, o.z), hx = o.x + o.x / u * (o.r + 1), hz = o.z + o.z / u * (o.r + 1);
    w.me.x = o.x + o.z / u * 16; w.me.z = o.z - o.x / u * 16; w.face = 'rex';
    const thr = [50, 85, 120, 150]; let k = 0;
    advance(w, 168, (w, t) => {
      if (t > 4 && t < 30) walkTo(w.me, hx, hz, 1.4); w.me.crouch = t > 18;
      if (k < thr.length && t > thr[k]) { const a = Math.atan2(o.x, o.z) + (k % 2 ? -1.6 : 1.6); w.A.things.throw('stone', w.me.x, w.me.y, w.me.z, o.x + Math.sin(a) * 30, o.z + Math.cos(a) * 30, 'you'); k++; }
    });
    w.note = `decoys=${w.mind.mem.decoys} how=${w.mind.decoyHow}`;
  } },
  front: { how: 'natural', expect: ['front'], secs: 200, herd: true, rexAt: { x: 0, z: 0, yaw: 0.4 }, setup(w) {
    // the herd grazing on the meadow's south pasture, about 37 m from it
    w.mind.hunger = 0.95; const A = w.A, g = w.T.grazing.reduce((b, q) => (hyp(q.x + 22, q.z + 30) < hyp(b.x + 22, b.z + 30) ? q : b)), p0 = A.herd.list[0];
    A.herd.home = { x: g.x, z: g.z, r: g.r }; const ox = p0.x, oz = p0.z; for (const p of A.herd.list) { p.x = g.x + (p.x - ox) * 0.6; p.z = g.z + (p.z - oz) * 0.6; } }, run(w) {
    w.me.x = w.sim.x + 30; w.me.z = w.sim.z + 85; advance(w, 190, null, { you: false });   // you are only watching (observe mode)
  } },
  thunder: { how: 'probe', expect: ['thunder'], secs: 150, run(w) {
    // thunder, a few times (it answers some of the time); you stand 25 m off
    w.me.x = ahead(w.sim, 0, 70).x; w.me.z = ahead(w.sim, 0, 70).z; w.mind.mood.irritation = 0.3;
    let k = 0; const at = [5, 25, 45, 65, 85, 105, 125, 145];
    // (the probe makes it take the thunder up as a call: 'answer' is forced for a few seconds after each clap; whether it roars is its own 60/40)
    advance(w, 150, (w, t) => { if (k < at.length && t > at[k]) { k++; w.noises.push({ x: w.sim.x + 800, y: 300, z: w.sim.z + 200, loud: 1, kind: 'thunder' }); w.mind.ov.force = 'answer'; } if (k && t > at[k - 1] + 7) w.mind.ov.force = null; });
  } },
  door: { how: 'natural', expect: ['door'], secs: 120, structure: 'shed', run: siege('shed') },
  bunker: { how: 'natural', expect: ['bunker'], secs: 130, structure: 'shed', run: siege('shed') },
  breakout: { how: 'natural', expect: ['bunker', 'breakout'], secs: 200, structure: 'shed', run: siege('shed', { leaveAt: 100 }) },
  dead: { how: 'natural', expect: ['dead'], secs: 150, run(w) {
    // stones from close until it knocks you down, then you lie still (from test/attack.mjs 'stones_limp')
    w.me.x = 7; w.me.z = 9; w.face = 'rex'; let thrown = 0, stop = false; const V = w.A.victim('you');
    advance(w, 140, (w, t) => {
      if (V.free && !stop && t > 4 && t - thrown * 7 > 7 * (thrown ? 1 : 0.3)) { thrown++; w.A.things.throw('stone', w.me.x, w.me.y, w.me.z, w.sim.x, w.sim.z, 'you', w.sim.py.x + 0.4); }
      if (!V.free) stop = true;
      // after the first fall: limp; and stand where you landed
      if (!V.free && V.handled && V.still < 100) { /* no input: lying still */ }
      if (V.free && V.handled) { w.me.x = V.x; w.me.z = V.z; }
    });
    const ev = w.evc || {}; w.note = `handled ${V.handled}, ach ${w.got.map((g) => g.id)}`; void ev;
  } },
  wised: { how: 'forced', expect: ['wised'], secs: 30, run(w) {
    // its memory of your stones (as left by the mind when it has been fooled twice and then traces or ignores one)
    advance(w, 1, null); w.mind.mem.decoys = 2; w.mind.decoyT = w.mind.t; w.mind.decoyHow = 'traced'; advance(w, 1, null);
  } },
  memo: { how: 'forced', expect: ['memo'], secs: 30, run(w) {
    advance(w, 1, null); w.mind.foundAtMemo = w.mind.t; advance(w, 1, null);
  } },
};

// a person inside a structure while the animal works the openings (test/siege.mjs): it starts 32 m out from the first opening
function siege(kind, { leaveAt = 0 } = {}) {
  return function (w) {
    const S = w.T.structures.find((s) => s.kind === kind), O = S.openings[0], nl = hyp(O.nx, O.nz), ax = O.x + O.nx / nl * 32, az = O.z + O.nz / nl * 32;
    w.sim.x = ax; w.sim.z = az; w.sim.psi = Math.atan2(S.cx - ax, S.cz - az); w.sim.reset && w.sim.reset(ax, az, w.sim.psi);
    w.me.x = S.cx; w.me.z = S.cz; w.face = null; const out = { x: S.cx - O.nx / nl * 0 - Math.sin(0) , z: S.cz };
    w.mind.hunger = 0.6; void out;
    // the person: lets itself be seen at the door first, then goes inside and stays; optionally leaves later out of a back route
    advance(w, w.secs || 120, (w, t) => {
      if (leaveAt && t > leaveAt) {                // out of the structure: straight away from the opening, 40 m, and still
        const away = { x: S.cx - O.nx / nl * 45, z: S.cz - O.nz / nl * 45 }; if (!w.left) { w.left = true; w.me.x = away.x; w.me.z = away.z; w.me.crouch = true; w.note = 'left at ' + t.toFixed(0) + 's (jumped 45 m out of sight)'; }
      } else { w.me.x = S.cx; w.me.z = S.cz; w.me.crouch = false; }
    });
  };
}

export function runScenario(name, seed = 3) {
  const S = SC[name], w = world(S.seed || seed, { rexAt: S.rexAt, herd: !!S.herd }); w.secs = S.secs; w.light = S.light ?? 0.85;
  S.setup && S.setup(w); S.run(w);
  const got = w.got.map((g) => g.id), missing = S.expect.filter((id) => !got.includes(id));
  return { name, how: S.how, expect: S.expect, got: w.got, missing, note: w.note, ideas: w.ideas, bad: w.bad };
}

if (process.argv[1].endsWith('achievements.mjs')) {
  const which = process.argv[2] || 'all', seeds = process.argv[3] ? [+process.argv[3]] : [3];
  const verified = new Set(), fails = [];
  for (const seed of seeds) for (const name of Object.keys(SC)) {
    if (which !== 'all' && which !== name) continue;
    const r = runScenario(name, seed), ok = !r.missing.length && !r.bad;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(11)} seed ${seed} (${r.how}) expect [${r.expect}] got [${r.got.map((g) => g.id + '@' + g.t.toFixed(0) + 's')}]${r.missing.length ? ' MISSING ' + r.missing : ''}${r.note ? ' | ' + r.note : ''}`);
    if (ok) for (const id of r.expect) verified.add(id); else fails.push(name);
  }
  if (which === 'all') {
    const un = ACHIEVEMENTS.filter((a) => !verified.has(a.id)).map((a) => a.id);
    console.log(`\nverified ${verified.size}/${ACHIEVEMENTS.length}; unverified: ${un.join(', ') || 'none'}`);
  }
  process.exitCode = fails.length ? 1 : 0;
}
