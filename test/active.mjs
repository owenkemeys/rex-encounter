// Active players: scripted people who play the way a person at the keyboard does (walk about, sprint in bursts, throw
// stones, hide behind rock and come out again), against an animal held at a hunger level. Moves at the real speeds
// (walk 2.6, crouch 1.3, sprint 6.2 m/s, instant starts and stops) and makes the real footstep and rustle noises.
//   node test/active.mjs [wanderer|pest|runner|hider|tapper|all] [--seeds 3,5,8] [--levels fed,hungry,starving] [--secs 240]
// Reports per run: deaths and causes, time to first hunt (a predatory approach: prowl, test, shadow, lurk) and first
// predatory seize, knockdowns and the worst injury, the stance shares; and per script, how often it is killed.
import { covers } from './hidecover.mjs';
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';

const dt = 1 / 120, hyp = Math.hypot;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
export const LEVELS = { fed: 0.3, peckish: 0.62, hungry: 0.8, starving: 0.96 };
const HUNT = new Set(['prowl', 'test', 'shadow', 'lurk']);

/** One life-and-respawn run. `script`: wanderer, pest, runner, hider, tapper (taps a move key for a fraction of a second). */
export function activeRun(script, seed, hunger, o = {}) {
  const secs = o.secs ?? 240, T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = !(o.herd ?? o.real);
  mind.hunger = hunger; if (o.hold !== false && !o.real) mind.ov.hold.hunger = hunger;
  let rs = (seed * 9301 + 49297 + script.length * 977) % 233280; const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280;
  const a0 = rnd() * 6.283, me = { id: 'you', x: Math.sin(a0) * 30, z: Math.cos(a0) * 30, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
  const start = { x: me.x, z: me.z };
  const V = A.victim('you'), P = { mode: 'stand', until: 3, wp: null, stoneT: -99, stepT: 0, rushT: -99, hideT: 0, tapT: 0 };
  const R = { script, seed, hunger, deaths: [], firstHunt: null, firstSeize: null, firstContact: null, knocked: 0, seized: 0, minHealth: 1, injuredT: 0, st: {}, stones: 0, hits: 0, heard: [], sight: [], runT: [], lives: 1 };
  let lastGen = -1, lastSeen = false, seenRunning = 0; const spHist = [];
  const noises = [];
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z, dR = hyp(sim.x - me.x, sim.z - me.z);
    noises.length = 0;
    let vx = 0, vz = 0, sp = 0; me.crouch = false;
    if (V.dead) {
      // the end card, then a fresh life at the start point (the animal keeps what it knows)
      if (t - V.deadT > (o.respawnAfter ?? 6)) { A.respawn('you', start.x, start.z); R.lives++; me.x = start.x; me.z = start.z; P.mode = 'stand'; P.until = t + 3; }
    } else if (V.free) {
      if (P.wasHandled) { me.x = V.x; me.z = V.z; P.mode = 'flee'; P.until = t + 6; }
      P.wasHandled = false;
      const toward = Math.abs(sim.v) > 3.5 && ((me.x - sim.x) * Math.sin(sim.psi) + (me.z - sim.z) * Math.cos(sim.psi)) > 0.7 * dR;
      const away = { x: (me.x - sim.x) / (dR || 1), z: (me.z - sim.z) / (dR || 1) };
      const slow = V.slow ?? 1;
      // reactions to being rushed, by script
      if (toward && dR < 26 && P.mode !== 'flee' && P.mode !== 'hide' && t - P.rushT > 4) {
        P.rushT = t;
        if (script === 'runner' || (script === 'pest' && rnd() < 0.7) || (script === 'wanderer' && rnd() < 0.5)) { P.mode = 'flee'; P.until = t + 5 + rnd() * 3; }
        else if (script === 'hider') { P.mode = 'hide'; P.hideT = t; }
      }
      if (P.mode === 'flee') { vx = away.x; vz = away.z; sp = 6.2 * slow; if (t > P.until || dR > 45) { P.mode = 'stand'; P.until = t + 2; } }
      else if (P.mode === 'hide') {
        // the nearest rock, on its far side from the animal; crouch there; peek out after a while
        const rk = covers(T).sort((p, q) => hyp(p.x - me.x, p.z - me.z) - hyp(q.x - me.x, q.z - me.z))[0];
        const u = hyp(rk.x - sim.x, rk.z - sim.z) || 1, hx = rk.x + (rk.x - sim.x) / u * (rk.r + 0.9), hz = rk.z + (rk.z - sim.z) / u * (rk.r + 0.9), d = hyp(hx - me.x, hz - me.z);
        if (d > 0.6) { vx = (hx - me.x) / d; vz = (hz - me.z) / d; sp = (d > 6 ? 6.2 : 1.3) * slow; me.crouch = d < 6; } else me.crouch = true;
        if (t - P.hideT > 25 + rnd() * 0.2) { P.mode = 'stand'; P.until = t + 1; }
      } else if (P.mode === 'walk') {
        const dx = P.wp.x - me.x, dz = P.wp.z - me.z, d = hyp(dx, dz);
        if (d < 0.6 || t > P.until) { P.mode = 'stand'; P.until = t + 2 + rnd() * 6; }
        else { vx = dx / d; vz = dz / d; sp = (P.sprint ? 6.2 : 2.6) * slow; }
      } else if (script === 'tapper' && t > P.until) {
        // a key tapped for a fifth of a second, now and then: no real movement at all
        if (t - P.tapT > 3) P.tapT = t;
      } else if (t > P.until) {
        let x = 0, z = 0; const lo = script === 'pest' ? 13 : 12, hi = script === 'pest' ? 22 : 40;
        for (let k = 0; k < 20; k++) { const ang = rnd() * 6.283, r = lo + rnd() * (hi - lo); x = sim.x + Math.sin(ang) * r; z = sim.z + Math.cos(ang) * r; if (hyp(x, z) < T.arena - 15 && !T.obstacles.some((q) => hyp(q.x - x, q.z - z) < q.r + 2)) break; }
        if (script === 'hider' && rnd() < 0.35) { P.mode = 'hide'; P.hideT = t; }
        else { P.mode = 'walk'; P.wp = { x, z }; P.until = t + 30; P.sprint = rnd() < (script === 'runner' ? 0.4 : 0.15); }
      }
      if (script === 'tapper' && t - P.tapT < 0.2) { vx = Math.sin(a0); vz = Math.cos(a0); sp = 6.2; }
      if (script === 'pest' && dR < 26 && dR > 7 && t - P.stoneT > 6 && P.mode !== 'flee') { P.stoneT = t; R.stones++; A.things.throw('stone', me.x, me.y, me.z, sim.x, sim.z, 'you', sim.py.x + 0.4); }
      me.x += vx * sp * dt; me.z += vz * sp * dt;
      const r = hyp(me.x, me.z), lim = T.arena - 6; if (r > lim) { me.x *= lim / r; me.z *= lim / r; }
      for (const q of T.obstacles) { const d = hyp(me.x - q.x, me.z - q.z); if (d < q.r + 0.4) { me.x = q.x + (me.x - q.x) / (d || 1) * (q.r + 0.4); me.z = q.z + (me.z - q.z) / (d || 1) * (q.r + 0.4); } }
      // facing: toward the animal when standing, else where going
      if (sp > 0.1 && P.mode !== 'stand') { me.fx = vx; me.fz = vz; } else { me.fx = (sim.x - me.x) / (dR || 1); me.fz = (sim.z - me.z) / (dR || 1); }
      // footsteps, as main.js makes them
      const v = sp;
      if (v > 0.5) { P.stepT -= dt * v; if (P.stepT <= 0) { P.stepT = 1.5; const loud = me.crouch ? 0 : v > 4 ? 0.16 : 0.045; if (loud) noises.push({ x: me.x, y: T.height(me.x, me.z), z: me.z, loud, kind: 'step' }); } }
    } else {
      P.wasHandled = true;
      if (!o.limp && (V.state === 'held' || V.state === 'pinned')) { if (i % 18 === 0) A.struggle('you', 1); }
      else if (V.state === 'down' && !o.limp) { if (i % 30 === 0 && V.t > 1.5) A.struggle('you', 1); }
      me.x = V.x; me.z = V.z;
    }
    me.y = T.height(me.x, me.z) + (me.crouch ? 1.0 : 1.7); me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: [...noises], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
    for (const e of A.events) {
      if (e.src === 'victim' && e.type === 'knocked') { R.knocked++; R.firstContact ??= t; }
      if (e.src === 'victim' && e.type === 'seized') { R.seized++; R.firstContact ??= t; }
      if (e.src === 'victim' && e.type === 'death') R.deaths.push({ t: +t.toFixed(0), cause: e.cause, motive: e.motive });
      if (e.src === 'things' && e.type === 'hit' && e.by === 'you') R.hits++;
    }
    A.events.length = 0;
    const b = mind.beh;
    if (b && b.gen !== lastGen) { lastGen = b.gen; if (R.firstHunt === null && HUNT.has(b.name)) R.firstHunt = t; if (R.firstSeize === null && b.name === 'seize' && b.motive === 'prey') R.firstSeize = t; }
    if (V.health !== undefined) { R.minHealth = Math.min(R.minHealth, V.health); if (V.health < 0.75 && !V.dead) R.injuredT += dt; }
    if (i % 12 === 0) {
      R.st[mind.stance] = (R.st[mind.stance] || 0) + 0.1;
      // sense attribution: what it says it knows about your speed, against what it could perceive
      const K = mind.know, tg = K.target;
      spHist.push(me.speed); if (spHist.length > 10) spHist.shift();
      // false: it takes you for running though you have not gone faster than a walk in the last second
      if (K.seen && tg && (tg.state || 'free') === 'free' && V.free) { if (mind.ctx && mind.ctx.running) R.runT.push({ t, true: Math.max(...spHist), via: K.via }); R.seenT = (R.seenT || 0) + 0.1; }
      if (K.seen && K.via !== 'sight') R.unseenKnownT = (R.unseenKnownT || 0) + 0.1;
    }
    void lastSeen; void seenRunning;
  }
  R.thoughts = mind.thinker.stream.slice(); R.verdict = mind.ap.verdict; R.mind = mind; R.V = V;
  return R;
}

const fmt = (x) => (x === null ? '  -' : String(Math.round(x)).padStart(3));
if (process.argv[1].endsWith('active.mjs')) {
  const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all';
  const seeds = arg('--seeds', '3,5,8').split(',').map(Number), levels = arg('--levels', 'fed,hungry,starving').split(','), secs = +arg('--secs', 240);
  const scripts = which === 'all' ? ['wanderer', 'pest', 'runner', 'hider'] : which.split(',');
  const sum = {};
  for (const sc of scripts) for (const lv of levels) for (const seed of seeds) {
    const r = activeRun(sc, seed, LEVELS[lv], { secs, real: process.argv.includes('--real') }), tot = Object.values(r.st).reduce((a, b) => a + b, 0) || 1;
    const S = sum[sc + ' ' + lv] || (sum[sc + ' ' + lv] = { runs: 0, deaths: 0, causes: {}, hunt: [], seize: [], knocked: 0, injured: 0, wrongRun: 0, runs2: 0 });
    S.runs++; S.deaths += r.deaths.length; for (const d of r.deaths) S.causes[d.cause] = (S.causes[d.cause] || 0) + 1; if (r.firstHunt !== null) S.hunt.push(r.firstHunt); if (r.firstSeize !== null) S.seize.push(r.firstSeize); S.knocked += r.knocked; S.injured += r.injuredT;
    S.wrongRun += r.runT.filter((x) => x.true < 3).length; S.runs2 += r.runT.length;
    console.log(`${sc.padEnd(8)} ${lv.padEnd(8)} s${seed}: deaths ${r.deaths.map((d) => d.t + 's ' + d.cause).join(', ') || '-'} | first hunt ${fmt(r.firstHunt)}s seize ${fmt(r.firstSeize)}s contact ${fmt(r.firstContact)}s | knocked ${r.knocked} seized ${r.seized} worst health ${r.minHealth.toFixed(2)} hurt ${r.injuredT.toFixed(0)}s | stones ${r.stones} hit ${r.hits} | pred ${(100 * (r.st.predatory || 0) / tot).toFixed(0)}% angry ${(100 * (r.st.angry || 0) / tot).toFixed(0)}% | verdict ${r.verdict} | 'running' while walking: ${r.runT.filter((x) => x.true < 3).length}/${r.runT.length}`);
  }
  console.log('\nSUMMARY (per script and hunger: deaths per run, causes, median time to first hunt / first predatory seize, knockdowns, seconds badly hurt)');
  const med = (a) => (a.length ? a.slice().sort((p, q) => p - q)[a.length >> 1].toFixed(0) + 's (' + a.length + '/' : '- (0/');
  for (const [k, S] of Object.entries(sum)) console.log(`  ${k.padEnd(18)} deaths ${(S.deaths / S.runs).toFixed(2)}/run ${JSON.stringify(S.causes)} | hunt ${med(S.hunt)}${S.runs}) seize ${med(S.seize)}${S.runs}) | knocked ${(S.knocked / S.runs).toFixed(1)}/run | hurt ${(S.injured / S.runs).toFixed(0)} s/run | false 'running' ${S.wrongRun}/${S.runs2}`);
}
