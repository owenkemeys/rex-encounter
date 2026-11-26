// Fires each achievement detector from a scripted situation against the real terrain, body, mind and arena (headless).
//   node test/achievements.mjs [id|all] [seed]
// Each scenario names the achievements it expects and how the situation is made:
//   natural  the animal does it on its own from what the scripted person does
//   forced   the person's side is scripted and one step the animal would take is forced (a roar, a grab) through the real code path
//   probe    a mind probe (ov) removes a sense so a rare state can be reached on demand
// An achievement with no scenario that fires it is reported as unverified.
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
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
    ach.update(DT, w.noYou ? null : Y); (w.labels || (w.labels = [])).push(mind.label); if (w.labels.length > 200000) w.labels = [...new Set(w.labels)];
  }
}
const walkTo = (me, x, z, speed, dt = DT) => { const dx = x - me.x, dz = z - me.z, d = hyp(dx, dz); if (d > 0.05) { const s = Math.min(speed * dt, d); me.x += dx / d * s; me.z += dz / d * s; me.fx = dx / d; me.fz = dz / d; } return d; };
const ahead = (sim, d, side = 0) => ({ x: sim.x + Math.sin(sim.psi) * d + Math.cos(sim.psi) * side, z: sim.z + Math.cos(sim.psi) * d - Math.sin(sim.psi) * side });

// ---------------------------------------------------------------------------------------------------------------------
const tipOf = (sim) => { const h = sim.head.pos, f = sim.head.f, L = sim.species.dims.headLen; return { x: h.x + f.x * L, y: h.y + f.y * L, z: h.z + f.z * L }; };
const youOf = (w) => ({ x: w.me.x, y: w.me.y, z: w.me.z });
const SC = {
  passive: { how: 'natural', expect: ['stare', 'yeet'], secs: 120, run(w) {
    // you stand still 10 m in front of it, facing it, and never move (the open-field start's passive player)
    const p = ahead(w.sim, 10); w.me.x = p.x; w.me.z = p.z; w.face = 'rex'; const V = w.A.victim('you'); let peak = 0;
    advance(w, 110, (w) => { if (V.free && V.handled) { w.me.x = V.x; w.me.z = V.z; } if (V.state === 'air') peak = Math.max(peak, V.y - w.T.height(V.x, V.z)); });
    w.note = `handled ${V.handled}, dead ${V.dead} (${V.cause}), highest throw ${peak.toFixed(1)} m`;
  } },
  yeetbig: { how: 'forced', expect: ['yeet', 'yeetbig'], secs: 8, run(w) {
    // a butt that throws you straight up at 10 m/s (peak 5.1 m), through the victim's own knock(); a 4 m/s one (0.8 m) is only a yeet
    w.me.x = ahead(w.sim, 12).x; w.me.z = ahead(w.sim, 12).z; advance(w, 0.5, null);
    w.A.victim('you').knock(1, 10, 0, 'butt'); advance(w, 4, null);
    const low = world(3); low.me.x = ahead(low.sim, 12).x; low.me.z = ahead(low.sim, 12).z; advance(low, 0.5, null); low.A.victim('you').knock(1, 4, 0, 'butt'); advance(low, 4, null);
    const poke = world(3); poke.me.x = ahead(poke.sim, 12).x; poke.me.z = ahead(poke.sim, 12).z; advance(poke, 0.5, null); poke.A.victim('you').knock(1, 1.3, 0, 'snout'); advance(poke, 4, null);
    w.note = `0.8 m throw gave [${low.got.map((g) => g.id)}]; snout poke gave [${poke.got.map((g) => g.id)}]`;
    if (low.got.some((g) => g.id === 'yeetbig') || poke.got.length) w.bad = true;
  } },
  rude: { how: 'natural', expect: ['rude'], secs: 30, run(w) {
    // a shout from 12 m does not count; then you stand still and shout once its snout is within 2.5 m of you
    const far = ahead(w.sim, 12); w.me.x = far.x; w.me.z = far.z; w.face = 'rex'; advance(w, 0.3, null); w.ach.noise({ kind: 'shout' }, youOf(w)); advance(w, 0.1, null);
    const farGot = w.got.length; let shouted = -1;
    advance(w, 25, (w, t) => { if (shouted < 0 && w.ach._dTip(tipOf(w.sim), youOf(w)) < 2.5) { shouted = t; w.ach.noise({ kind: 'shout' }, youOf(w)); } });
    w.note = `shout from 12 m counted: ${farGot > 0}; shouted at ${shouted.toFixed(1)} s`; if (farGot) w.bad = true;
  } },
  decoy: { how: 'natural', expect: ['decoy'], secs: 60, light: 0.5, run(w) {
    // a flare thrown to land 20 m ahead of it; then you run away from it
    w.me.x = ahead(w.sim, 6, 14).x; w.me.z = ahead(w.sim, 6, 14).z; advance(w, 1, null);
    const a = ahead(w.sim, 20); w.A.things.throw('flare', w.me.x, w.me.y, w.me.z, a.x, a.z, 'you');
    advance(w, 40, (w) => { if (w.mind.label === 'investigate') { const dx = w.me.x - w.sim.x, dz = w.me.z - w.sim.z, d = hyp(dx, dz) || 1; w.me.x += dx / d * 3 * DT; w.me.z += dz / d * 3 * DT; } });
    w.note = `labels seen: ${[...new Set(w.labels || [])]}`;
  } },
  near: { how: 'forced', expect: ['near'], secs: 6, run(w) {
    // its real strike, aimed at a point 1.3 m to your side: the jaws pass close and you are left standing
    const p = ahead(w.sim, 4.6); w.me.x = p.x; w.me.z = p.z; w.face = 'rex'; advance(w, 0.3, null);
    const fx = Math.cos(w.sim.psi), fz = -Math.sin(w.sim.psi), aim = { x: p.x + fx * 1.3, y: w.T.height(p.x, p.z) + 1.2, z: p.z + fz * 1.3 };
    w.sim.gesture('strike', aim, { over: true }); let min = 99; const V = w.A.victim('you');
    advance(w, 3, (w) => { const J = w.ach.st.jaw; if (J) min = Math.min(min, J.min); });
    w.note = `closest jaw-to-body ${(min - 0.3).toFixed(2)} m, you ${V.state}`;
    if (V.dead) w.bad = true;
  } },
  funny: { how: 'forced', expect: ['rude', 'funny'], secs: 30, run(w) {
    // killed (the victim's real kill) 1 s after a dare (a shout in its face): funny. A kill with no dare and no throw near it is not.
    const plain = world(3); advance(plain, 3, null); plain.A.victim('you').kill('bitten'); advance(plain, 0.5, null);
    const p = ahead(w.sim, 12); w.me.x = p.x; w.me.z = p.z; w.face = 'rex'; let shouted = -1; const V = w.A.victim('you');
    advance(w, 25, (w, t) => { if (shouted < 0 && w.ach._dTip(tipOf(w.sim), youOf(w)) < 2.5) { shouted = t; w.ach.noise({ kind: 'shout' }, youOf(w)); } if (shouted > 0 && t - shouted > 1 && !V.dead) V.kill('bitten'); });
    w.note = `plain kill gave [${plain.got.map((g) => g.id)}]`; if (plain.got.length) w.bad = true;
  } },
  funnyair: { how: 'forced', expect: ['yeet', 'funny'], secs: 6, run(w) {
    // killed 1 s after landing from a throw
    w.me.x = ahead(w.sim, 12).x; w.me.z = ahead(w.sim, 12).z; advance(w, 0.5, null);
    const V = w.A.victim('you'); V.knock(1, 4, 0, 'butt'); let landed = -1;
    advance(w, 3, (w, t) => { if (landed < 0 && V.state !== 'air') landed = t; if (landed > 0 && t - landed > 1 && !V.dead) V.kill('bitten'); });
  } },
  // a hungry animal 26 m south of a structure (the Containers, and the tower by the Barn, in seed 7's arena); you stand at its south
  // face, and once it comes for you (it chases, or it has seen you and is within 12 m) you run round the structure away from it
  chase: { how: 'natural', expect: ['corner', 'matador'], secs: 60, seed: 5, rexAt: { x: -30, z: 68 - 6.1 - 26, yaw: 0 }, setup(w) { w.mind.hunger = 0.95; }, run(w) { roundAbout(w, 'containers'); } },
  tower: { how: 'natural', expect: ['matador'], secs: 60, seed: 3, rexAt: { x: 45.2, z: 70 - 6.4 - 26, yaw: 0 }, setup(w) { w.mind.hunger = 0.95; }, run(w) { roundAbout(w, 'tower'); } },
};

function roundAbout(w, kind) {
  const S = w.T.structures.find((s) => s.kind === kind), r = Math.max(S.hw, S.hd) + 2.5, sp = 5.5, V = w.A.victim('you'); let ang = Math.PI, go = false;
  w.me.x = S.cx + Math.sin(ang) * r; w.me.z = S.cz + Math.cos(ang) * r; w.face = 'rex';
  advance(w, w.secs - 1, (w) => {
    if (!V.free) return;
    if (['chase', 'prowl', 'pounce', 'stalk', 'snap', 'bluff'].includes(w.mind.label) || (w.mind.know.seen && hyp(w.me.x - w.sim.x, w.me.z - w.sim.z) < 12)) go = true;
    if (go) { w.face = null; const ra = Math.atan2(w.sim.x - S.cx, w.sim.z - S.cz), ma = Math.atan2(w.me.x - S.cx, w.me.z - S.cz); let d = ma - ra; d -= Math.PI * 2 * Math.round(d / (Math.PI * 2)); ang = ma + Math.sign(d || 1) * sp * DT / r * 1.5; }
    walkTo(w.me, S.cx + Math.sin(ang) * r, S.cz + Math.cos(ang) * r, sp);
  });
  w.note = `round the ${kind}; dead ${V.dead}`;
}

export function runScenario(name, seed = 3) {
  const S = SC[name], w = world(S.seed || seed, { rexAt: S.rexAt, herd: !!S.herd }); w.secs = S.secs; w.light = S.light ?? 0.85;
  S.setup && S.setup(w); S.run(w);
  const got = w.got.map((g) => g.id), missing = S.expect.filter((id) => !got.includes(id));
  const twice = got.filter((id, i) => got.indexOf(id) !== i); if (twice.length) { w.bad = true; w.note = (w.note || '') + ' EARNED TWICE ' + twice; }      // each fires once
  return { name, seed: S.seed || seed, how: S.how, expect: S.expect, got: w.got, missing, note: w.note, ideas: w.ideas, bad: w.bad };
}

if (process.argv[1].endsWith('achievements.mjs')) {
  const which = process.argv[2] || 'all', seeds = process.argv[3] ? [+process.argv[3]] : [3];
  const verified = new Set(), fails = [];
  for (const seed of seeds) for (const name of Object.keys(SC)) {
    if (which !== 'all' && which !== name) continue;
    const r = runScenario(name, seed), ok = !r.missing.length && !r.bad;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name.padEnd(11)} seed ${r.seed} (${r.how}) expect [${r.expect}] got [${r.got.map((g) => g.id + '@' + g.t.toFixed(0) + 's')}]${r.missing.length ? ' MISSING ' + r.missing : ''}${r.note ? ' | ' + r.note : ''}`);
    if (ok) for (const id of r.expect) verified.add(id); else fails.push(name);
  }
  if (which === 'all') {
    const un = ACHIEVEMENTS.filter((a) => !verified.has(a.id)).map((a) => a.id);
    console.log(`\nverified ${verified.size}/${ACHIEVEMENTS.length}; unverified: ${un.join(', ') || 'none'}`);
  }
  process.exitCode = fails.length ? 1 : 0;
}
