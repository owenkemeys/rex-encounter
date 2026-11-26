// What is the small thing? The appraisal (src/rex/brain/appraise.js) played out headlessly.
//   node test/predator.mjs [all|matrix|levers|provoke|override|transcript] [--seeds 3,5,8,11,13] [--secs 240]
// A scripted person (wanders in the open, stands and watches, walks off with their back turned, bolts from a fast rush
// about half the time, struggles when taken, gets up after a fall) meets each animal at held hunger levels. Per run it
// reports the time spent in each stance toward the person (curious / wary / predatory / angry / afraid / rival), the
// predatory approaches (test lunges, shadowing, ambushes, hunts) and their outcomes, the verdict over time, and whether
// the body matches the stance (gaze on target, head height, sounds per minute). Then the levers (meat thrown, the herd),
// provocation (stones: should end in nuisance, not threat), the debug override, and the thought transcript around a decision.
import { covers } from './hidecover.mjs';
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/rex/body/rex.js';
import { Mind } from '../src/rex/brain/mind.js';
import { Arena } from '../src/sim/arena.js';
import { PRED } from '../src/rex/brain/appraise.js';

const dt = 1 / 120, hyp = Math.hypot, D = 180 / Math.PI;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = arg('--seeds', '3,5,8,11,13').split(',').map(Number), SECS = +arg('--secs', 240);
const STANCES = ['curious', 'wary', 'predatory', 'angry', 'afraid', 'rival', 'none'];
const VOCAL = new Set(['huff', 'growl', 'roar', 'rumble', 'tilt', 'stomp']);
const LEVELS = { fed: 0.3, peckish: 0.62, hungry: 0.8, starving: 0.96 };

export function run(seed, hunger, o = {}) {
  const secs = o.secs ?? SECS, T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  A.herd.disabled = !o.herd;
  mind.hunger = hunger; if (o.hold !== false) mind.ov.hold.hunger = hunger;
  if (o.verdict) mind.ov.verdict = o.verdict;
  let rs = (seed * 9301 + 49297) % 233280; const rnd = () => (rs = (rs * 9301 + 49297) % 233280) / 233280;
  const a0 = rnd() * 6.283, me = { id: 'you', x: Math.sin(a0) * 24, z: Math.cos(a0) * 24, y: 0, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: 1 };
  const a0x = me.x, a0z = me.z, V = A.victim('you'), P = { mode: 'stand', until: 6, wp: null, bolt: 0, rushes: 0, lastRush: -99, meatT: -99, stoneT: -99, stones: 0, downT: 0 };
  const st = Object.fromEntries(STANCES.map((k) => [k, 0])), body = {}, ev = {}, verdicts = [], starts = {}, tr = []; let lastGen = -1, lastAct = null, lastV = null, lastBeh = '', lastEntry = null; const all = [];
  for (let i = 0; i < secs * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z, dR = hyp(sim.x - me.x, sim.z - me.z);
    if (V.dead) {
      // killed: a new life at the start point after the end card (the animal keeps what it knows)
      if (V.clock - V.deadT > 6) { A.respawn('you', a0x, a0z); me.x = a0x; me.z = a0z; P.mode = 'stand'; P.until = t + 3; }
    } else if (V.free) {
      P.downT = 0;
      if (V.handled && P.wasHandled) { me.x = V.x; me.z = V.z; P.mode = 'stand'; P.until = t + 3; }
      P.wasHandled = false;
      // a fast rush at you: about half the time you bolt
      const rushing = Math.abs(sim.v) > 4.5 && ((me.x - sim.x) * Math.sin(sim.psi) + (me.z - sim.z) * Math.cos(sim.psi)) > 0.6 * dR && dR < 24;
      if (rushing && t - P.lastRush > 6 && P.mode !== 'bolt') { P.lastRush = t; P.rushes++; if (o.steady ? false : o.skittish ? true : rnd() < 0.5) { P.mode = 'bolt'; P.until = t + 5; } }
      if (P.mode === 'bolt') { const u = dR || 1; me.x += (me.x - sim.x) / u * 6 * dt; me.z += (me.z - sim.z) / u * 6 * dt; if (t > P.until) { P.mode = 'stand'; P.until = t + 4; } }
      else if (P.mode === 'walk') {
        const dx = P.wp.x - me.x, dz = P.wp.z - me.z, d = hyp(dx, dz);
        if (d < 0.5 || t > P.until) { P.mode = 'stand'; P.until = t + (o.haunt ? 25 : 4) + rnd() * 10; me.crouch = !!(o.haunt && P.hide); } else { me.x += dx / d * 1.4 * dt; me.z += dz / d * 1.4 * dt; }
      } else if (t > P.until) {
        // somewhere in the open, 15-45 m from the animal
        let x = 0, z = 0; for (let k = 0; k < 20; k++) { const ang = rnd() * 6.283, r = 15 + rnd() * 30; x = sim.x + Math.sin(ang) * r; z = sim.z + Math.cos(ang) * r; if (hyp(x, z) < T.arena - 15 && !T.obstacles.some((q) => hyp(q.x - x, q.z - z) < q.r + 2)) break; }
        if (o.haunt) {
          // a person with habits: back and forth between the same open spot and the same rock to hide behind
          const rk = P.rock || (P.rock = covers(T, { maxR: 50, minSize: 1.5 }).sort((p, q) => hyp(p.x - me.x, p.z - me.z) - hyp(q.x - me.x, q.z - me.z))[0]);
          P.home = P.home || { x: me.x, z: me.z }; P.leg = (P.leg || 0) + 1;
          const u = hyp(rk.x - sim.x, rk.z - sim.z) || 1; ({ x, z } = P.leg % 2 ? { x: rk.x + (rk.x - sim.x) / u * (rk.r + 1), z: rk.z + (rk.z - sim.z) / u * (rk.r + 1) } : P.home);
          P.hide = P.leg % 2 === 1;
        }
        P.mode = 'walk'; P.wp = { x, z }; P.until = t + 40;
      }
      // levers and provocation
      if (o.meat && mind.stance === 'predatory' && dR < 30 && t - P.meatT > 25) { P.meatT = t; const u = dR || 1; A.things.throw('meat', me.x, me.y, me.z, me.x + (sim.x - me.x) / u * 0.45 * dR + (me.z - sim.z) / u * 6, me.z + (sim.z - me.z) / u * 0.45 * dR - (me.x - sim.x) / u * 6, 'you'); ev.meatThrown = (ev.meatThrown || 0) + 1; }
      if (o.stones && dR < 22 && t - P.stoneT > o.stones && P.stones < (o.maxStones ?? 99)) { P.stoneT = t; P.stones++; A.things.throw('stone', me.x, me.y, me.z, sim.x, sim.z, 'you', sim.py.x + 0.4); }
      const facing = P.mode === 'stand' || P.mode === 'stone';
      if (facing) { const u = dR || 1; me.fx = (sim.x - me.x) / u; me.fz = (sim.z - me.z) / u; } else { const vx = me.x - px, vz = me.z - pz, u = hyp(vx, vz) || 1; me.fx = vx / u; me.fz = vz / u; }
      const r = hyp(me.x, me.z), lim = T.arena - 6; if (r > lim) { me.x *= lim / r; me.z *= lim / r; }
      for (const q of T.obstacles) { const d = hyp(me.x - q.x, me.z - q.z); if (d < q.r + 0.4) { me.x = q.x + (me.x - q.x) / (d || 1) * (q.r + 0.4); me.z = q.z + (me.z - q.z) / (d || 1) * (q.r + 0.4); } }
    } else {
      P.wasHandled = true;
      if (V.state === 'held' || V.state === 'pinned') { if (i % 20 === 0) A.struggle('you', 1); }
      else if (V.state === 'down') { P.downT += dt; if (P.downT > 2 && i % 20 === 0) A.struggle('you', 1); }
      me.x = V.x; me.z = V.z;
    }
    me.y = T.height(me.x, me.z) + 1.7; me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
    const I = A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } });
    for (const e of A.events) {
      if (e.src === 'victim' && ['seized', 'knocked', 'pinned', 'slipped', 'dropped', 'tossed'].includes(e.type)) ev[e.type] = (ev[e.type] || 0) + 1;
      if (e.src === 'victim' && e.type === 'death') { ev.died = (ev.died || 0) + 1; ev['died:' + e.cause] = (ev['died:' + e.cause] || 0) + 1; }
      if (e.src === 'sim' && e.type === 'roar') ev.roar = (ev.roar || 0) + 1;
    }
    A.events.length = 0;
    const b = mind.beh, s = mind.stance;
    if (b && b.gen !== lastGen) { lastGen = b.gen; if (PRED.includes(b.name) || b.name === 'avoid' || (b.name === 'seize' && b.motive === 'prey')) starts[b.name] = (starts[b.name] || 0) + 1; }
    if (i % 12 === 0) {
      st[s] += 0.1;
      if (mind.ap.verdict !== lastV) { lastV = mind.ap.verdict; verdicts.push([+t.toFixed(0), lastV]); }
      // the body, per stance, while it can see you
      if (mind.know.seen && s !== 'none') {
        const B = body[s] || (body[s] = { n: 0, ang: 0, lock: 0, head: 0, stalk: 0, display: 0, vocal: 0, secs: 0 }), h = sim.head, dx = me.x - h.pos.x, dy = me.y - 0.6 - h.pos.y, dz = me.z - h.pos.z, dl = hyp(dx, dy, dz) || 1;
        const ang = Math.acos(Math.max(-1, Math.min(1, (h.f.x * dx + h.f.y * dy + h.f.z * dz) / dl))) * D;
        B.n++; B.secs += 0.1; B.ang += ang; if (ang < 25) B.lock++; B.head += h.pos.y - sim.groundY; if (I.stalk) B.stalk++; B.display += I.display || I.agitation || 0;
        if (sim.act && sim.act !== lastAct && VOCAL.has(sim.act.kind)) B.vocal++;
      }
      lastAct = sim.act;
      // a rolling transcript: behaviour changes and new thoughts
      const lab = b ? b.name + (b.phase ? '/' + b.phase : '') + (b.sub && b.name === 'seize' ? ':' + b.sub : '') : '';
      if (lab !== lastBeh) { lastBeh = lab; tr.push({ t, s: `            · ${lab} [${s}] d=${dR.toFixed(0)}` }); }
      const S = mind.thinker.stream; let k = S.length - 1; while (k >= 0 && S[k] !== lastEntry) k--; for (let j = k + 1; j < S.length; j++) all.push(S[j]); if (S.length) lastEntry = S[S.length - 1];
    }
  }
  // whatever was going on when time ran out, it ends with the person let go (struggling) and able to get up
  let freed = V.free || V.dead;
  for (let i = 0; i < 120 * 50 && !freed; i++) { if (i % 15 === 0) A.struggle('you', 1); A.step(dt, { agents: [me], noises: [], light: 0.85, flash: false, wind: { x: 0, z: -2 } }); A.events.length = 0; freed = V.free || V.dead; me.x = V.x; me.z = V.z; }
  const thoughts = all;
  return { seed, hunger, st, body, ev, starts, verdicts, outcomes: mind.ap.outcomes.map((x) => x.kind), ap: mind.ap, tr, thoughts, temper: mind.temper, freed };
}

const pct = (x, tot) => (100 * x / tot).toFixed(0).padStart(3) + '%';
const tally = (arr) => { const o = {}; for (const k of arr) o[k] = (o[k] || 0) + 1; return o; };
const line = (r, label) => {
  const tot = Object.values(r.st).reduce((a, b) => a + b, 0) || 1;
  return `${label.padEnd(16)} ${STANCES.slice(0, 6).map((k) => k.slice(0, 5) + ' ' + pct(r.st[k], tot)).join('  ')} | approaches ${JSON.stringify(r.starts)} | outcomes ${JSON.stringify(tally(r.outcomes))} | contact ${JSON.stringify(r.ev)} | verdicts ${r.verdicts.map(([t, v]) => t + 's:' + v).join(' ')}`;
};
const bodyRows = (all) => {
  const agg = {};
  for (const r of all) for (const [k, B] of Object.entries(r.body)) { const Q = agg[k] || (agg[k] = { n: 0, ang: 0, lock: 0, head: 0, stalk: 0, display: 0, vocal: 0, secs: 0 }); for (const f of Object.keys(Q)) Q[f] += B[f]; }
  console.log('\nBODY LANGUAGE by stance (while it sees you): gaze off you (mean deg), gaze within 25 deg, head height, head-low stalk, display/agitation, sounds and head gestures per minute, roars');
  for (const [k, Q] of Object.entries(agg).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k.padEnd(10)} ${String(Q.secs.toFixed(0)).padStart(5)}s  gaze ${(Q.ang / Q.n).toFixed(0).padStart(3)} deg  locked ${pct(Q.lock, Q.n)}  head ${(Q.head / Q.n).toFixed(2)} m  stalk ${pct(Q.stalk, Q.n)}  display ${(Q.display / Q.n).toFixed(2)}  sounds/min ${(60 * Q.vocal / Q.secs).toFixed(1)}`);
  return agg;
};

if (process.argv[1].endsWith('predator.mjs')) {
  const which = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'all', fail = [];
  const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
  if (which === 'all' || which === 'matrix') {
    console.log(`== STANCES by seed and hunger (${SECS} s each; the same scripted person)`);
    const all = [], by = {};
    for (const seed of SEEDS) {
      for (const [lv, h] of Object.entries(LEVELS)) { const r = run(seed, h); r.lv = lv; all.push(r); (by[lv] || (by[lv] = [])).push(r); console.log(line(r, `s${seed} ${lv}`)); }
      const T = all[all.length - 1].temper; console.log(`     (s${seed} temperament bold ${T.bold.toFixed(2)} patience ${T.patience.toFixed(2)} curious ${T.curious.toFixed(2)}; palate ${all[all.length - 1].ap.palate.toFixed(2)})`);
    }
    const share = (r, k) => r.st[k] / (Object.values(r.st).reduce((a, b) => a + b, 0) - r.st.none || 1);
    const B = bodyRows(all);
    console.log('\nCHECKS');
    // (rewritten for the prey reflex, out/platform/TUNE.md: a fed animal leaves a calm person alone, but a person who bolts from
    //  its rushes behaves like prey and may be taken; a take is a kill, never a grab that lets go)
    const calmFed = SEEDS.map((seed) => run(seed, LEVELS.fed, { steady: true }));
    for (const r of calmFed) console.log(line(r, `s${r.seed} fed/steady`));
    check(calmFed.every((r) => share(r, 'predatory') < 0.08 && share(r, 'curious') > 0.5 && !r.ev.seized && !r.ev.died), 'fed, person who never bolts: mostly curious, almost never predatory, never takes or kills, every seed');
    check([...by.fed, ...calmFed].every((r) => !(r.ev.seized && (r.ev.dropped || r.ev.tossed || r.ev.slipped)) || !Object.keys(r.ev).some((k) => k === 'seized')), 'fed: no catch-and-release (a fed animal that takes you kills you; it never grabs and lets go)');
    check(by.starving.every((r) => share(r, 'predatory') > share(by.fed.find((q) => q.seed === r.seed), 'predatory') + 0.1), 'starving: clearly more predatory than the same animal fed, every seed');
    const finals = (lv) => by[lv].map((r) => (r.verdicts.length ? r.verdicts[r.verdicts.length - 1][1] : 'curious'));
    const fh = [...finals('hungry'), ...finals('starving')];
    check(fh.includes('food') && fh.some((v) => v === 'notfood' || v === 'curious'), `variety: hungry/starving animals end in both food and not-food/curious verdicts (${fh.join(', ')})`);
    check(all.filter((r) => r.lv !== 'fed').some((r) => r.verdicts.filter(([, v]) => v === 'food').length && r.verdicts.some(([t, v], i) => i && v !== 'food' && r.verdicts[i - 1][1] === 'food')), 'conclusions change over time (food revised to something else in some run)');
    check(all.every((r) => r.freed), 'nobody left held');
    if (B.predatory && B.curious) {
      check(B.predatory.lock / B.predatory.n > 0.6, 'predatory: gaze locked on you (within 25 deg) most of the time');
      check(60 * B.predatory.vocal / B.predatory.secs < 0.5 * Math.max(0.5, 60 * B.curious.vocal / B.curious.secs), 'predatory: quiet (under half the sounds and head gestures per minute of curious)');
      check(B.predatory.head / B.predatory.n < B.curious.head / B.curious.n, 'predatory: head carried lower than when curious');
      check(B.predatory.display / B.predatory.n < (B.angry ? B.angry.display / B.angry.n : 1), 'predatory: no display (less than angry)');
    }
  }
  if (which === 'all' || which === 'lethal') {
    // stakes: active players (test/active.mjs) at each hunger; deaths, causes and time to the first hunt
    const { activeRun, LEVELS: AL } = await import('./active.mjs');
    console.log('\n== LETHAL: active players (wanderer, runner, hider; pest at peckish), 180 s, deaths respawn after 6 s');
    const by = {};
    for (const lv of ['fed', 'peckish', 'hungry', 'starving']) for (const sc of ['wanderer', 'runner', 'hider', ...(lv === 'peckish' ? ['pest'] : [])]) for (const seed of SEEDS.slice(0, 3)) {
      const r = activeRun(sc, seed, AL[lv], { secs: 180 }), B = by[lv] || (by[lv] = { runs: 0, deaths: 0, causes: {}, hunt: [] });
      B.runs++; B.deaths += r.deaths.length; for (const d of r.deaths) B.causes[d.cause] = (B.causes[d.cause] || 0) + 1; B.hunt.push(r.firstHunt ?? 999);
      if (sc === 'pest') B.pest = (B.pest || 0) + r.deaths.length + r.knocked * 0.01;
    }
    for (const [lv, B] of Object.entries(by)) { const h = B.hunt.slice().sort((p, q) => p - q); console.log(`  ${lv.padEnd(9)} deaths ${B.deaths}/${B.runs} runs ${JSON.stringify(B.causes)}; first hunt median ${h[h.length >> 1] === 999 ? 'never' : h[h.length >> 1].toFixed(0) + ' s'}`); }
    check(by.fed.deaths === 0, 'fed: it never kills you unprovoked');
    check(by.starving.deaths >= Math.ceil(by.starving.runs / 3), 'starving: it hunts and kills an active person in at least a third of 3-minute runs');
    check(by.hungry.deaths > 0, 'hungry: it kills sometimes');
    check(by.starving.deaths >= by.peckish.deaths, 'deaths rise with hunger');
  }
  if (which === 'all' || which === 'senses') {
    // fair senses: speed is read off you only by watching for a while; out of sight it knows only what your feet say
    console.log('\n== SENSES: what it knows of your speed, and by which sense');
    const { activeRun } = await import('./active.mjs');
    let tapRun = 0, walkRun = 0, walkN = 0;
    for (const seed of SEEDS.slice(0, 3)) {
      const t = activeRun('tapper', seed, 0.5, { secs: 90 }); tapRun += t.runT.length;
      const w = activeRun('wanderer', seed, 0.5, { secs: 120 }); walkRun += w.runT.filter((x) => x.true < 3).length; walkN += w.seenT || 0;
    }
    console.log(`  tapping a key now and then: taken for running ${tapRun} times; walking: taken for running ${walkRun} times in ${walkN.toFixed(0)} s seen`);
    check(tapRun === 0, 'a tap of a move key is never seen as running');
    check(walkRun === 0, 'walking is never taken for running');
    // behind it, out of its sight, inside the near field: running feet are heard as running, a crouched creep is not
    const behind = (gaitSp, crouch) => {
      const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: 3 }), mind = new Mind(sim, 3), A = new Arena(T, sim, mind, 3); A.herd.disabled = true;
      mind.ov.senses.sight = false;      // its eyes shut (the probe): whatever it knows has to come by ear and nose
      const me = { id: 'you', x: 0, z: -6.5, y: 0, vx: 0, vz: 0, speed: 0, crouch, fx: 0, fz: 1 }; let stepT = 0, out = { via: {}, gait: {}, maxSp: 0, eyeAt: null, thoughts: [] };
      for (let i = 0; i < 120 * 6; i++) {
        const t = i * dt, ang = t * gaitSp / 6.5, px = me.x, pz = me.z; me.x = 4 + Math.sin(ang) * 0.4; me.z = 2.5 + Math.cos(ang) * 0.4;      // on the spot, beside its head
        me.y = T.height(me.x, me.z) + (crouch ? 1 : 1.7); me.vx = Math.cos(ang) * gaitSp; me.vz = -Math.sin(ang) * gaitSp; me.speed = gaitSp;
        const noises = []; stepT -= dt * gaitSp; if (stepT <= 0 && gaitSp > 0.5) { stepT = 1.5; const loud = crouch ? 0 : gaitSp > 4 ? 0.16 : 0.045; if (loud) noises.push({ x: me.x, y: 0, z: me.z, loud, kind: 'step' }); }
        void px; void pz;
        A.step(dt, { agents: [me], noises, light: 0.85, flash: false, wind: { x: 1, z: 0 } }); A.events.length = 0;
        const K = mind.know; if (K.seen) { out.via[K.via] = (out.via[K.via] || 0) + 1; if (K.via === 'near') { out.maxSp = Math.max(out.maxSp, K.target.speed); out.gait[K.gait || 'none'] = (out.gait[K.gait || 'none'] || 0) + 1; } if (K.via === 'sight' && out.eyeAt === null) out.eyeAt = t; }
      }
      out.thoughts = mind.thinker.stream.map((x) => x.text + ' [' + x.cond + ']');
      return out;
    };
    const run = behind(6.2, false), creep = behind(1.3, true);
    console.log(`  running beside it, unseen (eyes off): senses ${JSON.stringify(run.via)}, gait while unseen ${JSON.stringify(run.gait)}, first sight ${run.eyeAt?.toFixed(1)} s; thoughts: ${run.thoughts.slice(0, 5).join(' | ')}`);
    console.log(`  creeping beside it, unseen: senses ${JSON.stringify(creep.via)}, gait while unseen ${JSON.stringify(creep.gait)}, max speed it credits ${creep.maxSp.toFixed(1)}`);
    check((run.gait.run || 0) > 0 && run.thoughts.some((x) => /hear|feet/.test(x)), 'running close by, unseen: known only as running feet, and it says so ("hear", "feet")');
    check(!(creep.gait.run) && creep.maxSp < 2, 'creeping close by, unseen: not credited with running');
    check(!run.thoughts.some((x) => /\[seen\+running/.test(x) && !/eye/.test(x)), 'a "run" thought from sight only when its eyes were on you');
  }
  if (which === 'all' || which === 'habits') {
    console.log('\n== HABITS: a person who keeps going between the same open spot and the same rock (hungry, 0.85)');
    let lurks = 0;
    for (const seed of SEEDS) { const r = run(seed, 0.85, { haunt: true, secs: 300 }); console.log(line(r, `s${seed} habits`)); lurks += r.starts.lurk || 0; }
    check(lurks > 0, `it lies in wait where you keep going (${lurks} ambushes)`);
  }
  if (which === 'all' || which === 'levers') {
    console.log(`\n== LEVERS at starving (0.96, hunger not held: feeding lowers it), seeds ${SEEDS.join(',')}`);
    let base = 0, meat = 0, herd = 0, bS = 0, mS = 0, hS = 0;
    for (const seed of SEEDS) {
      const r0 = run(seed, 0.96, { hold: false }), r1 = run(seed, 0.96, { hold: false, meat: true }), r2 = run(seed, 0.96, { hold: false, herd: true });
      console.log(line(r0, `s${seed} alone`)); console.log(line(r1, `s${seed} meat thrown`)); console.log(line(r2, `s${seed} herd there`));
      base += r0.st.predatory; meat += r1.st.predatory; herd += r2.st.predatory; bS += r0.ev.seized || 0; mS += r1.ev.seized || 0; hS += r2.ev.seized || 0;
    }
    console.log(`  predatory seconds: alone ${base.toFixed(0)}, meat thrown ${meat.toFixed(0)}, herd ${herd.toFixed(0)}; times taken: ${bS}, ${mS}, ${hS}`);
    check(meat < base * 0.8 && mS <= bS, 'throwing meat measurably buys it off');
    check(herd < base * 0.8, 'the herd being there measurably draws it off you');
  }
  if (which === 'all' || which === 'provoke') {
    console.log('\n== PROVOCATION: stones when it comes within 22 m (peckish, 0.62)');
    const ends = [];
    for (const seed of SEEDS) {
      const r = run(seed, 0.62, { stones: 7, secs: 180 }), r2 = run(seed, 0.62, { stones: 7, maxStones: 2, secs: 180 });
      console.log(line(r, `s${seed} every 7 s`)); console.log(line(r2, `s${seed} two stones`));
      ends.push([r, r2]);
    }
    const verdictOf = (r) => { const tally2 = {}; for (let i = 0; i < r.verdicts.length; i++) { const [t, v] = r.verdicts[i], t2 = i + 1 < r.verdicts.length ? r.verdicts[i + 1][0] : 180; tally2[v] = (tally2[v] || 0) + t2 - t; } return tally2; };
    const nuis = ends.filter(([r]) => { const v = verdictOf(r); return (v.nuisance || 0) >= (v.threat || 0) && (v.nuisance || 0) > 20; }).length;
    check(nuis >= Math.ceil(0.8 * ends.length), `typical provocation reads as nuisance, not threat (${nuis}/${ends.length} runs: nuisance longer than threat)`);
    check(ends.every(([, r2]) => !r2.verdicts.some(([, v]) => v === 'threat' || v === 'rival')), 'two stones are only an annoyance (never threat or rival)');
  }
  if (which === 'all' || which === 'override') {
    console.log('\n== DEBUG OVERRIDE (mind.ov.verdict), peckish 0.62, seed ' + SEEDS[0]);
    const res = {};
    for (const v of [null, 'food', 'notfood', 'threat', 'rival']) { const r = run(SEEDS[0], 0.62, { verdict: v, secs: 150 }); res[v] = r; console.log(line(r, String(v ?? 'its own'))); }
    const sh = (r, k) => r.st[k] / (Object.values(r.st).reduce((a, b) => a + b, 0) || 1);
    check(sh(res.food, 'predatory') > 0.3 && sh(res.food, 'predatory') > sh(res.null, 'predatory') + 0.2, 'food: it hunts you');
    check(sh(res.notfood, 'predatory') < 0.03, 'not food: no predatory stance at all');
    check(sh(res.threat, 'afraid') > 0.25 && !res.threat.ev.seized, 'threat: keeps away, never takes you');
    check(sh(res.rival, 'rival') > 0.15, 'rival: faces you down');
  }
  if (which === 'all' || which === 'transcript') {
    // the thought stream around a decision: a hungry animal deciding what you are
    const seed = +arg('--tseed', SEEDS[0]), r = run(seed, +arg('--th', 0.9), { secs: +arg('--tsecs', 150) });
    const firstFood = r.verdicts.find(([, v]) => v === 'food' || v === 'notfood');
    const t0 = firstFood ? firstFood[0] - 25 : 0, t1 = t0 + 60;
    console.log(`\n== TRANSCRIPT s${seed} hunger ${r.hunger}: ${t0.toFixed(0)}-${t1.toFixed(0)} s (verdicts ${r.verdicts.map(([t, v]) => t + 's:' + v).join(' ')})`);
    const ev = [...r.tr, ...r.thoughts.map((x) => ({ t: x.t, s: `   "${x.text}"`.padEnd(34) + ` ${x.kind}` }))].filter((e) => e.t >= t0 && e.t <= t1).sort((a, b) => a.t - b.t);
    for (const e of ev) console.log(`${e.t.toFixed(1).padStart(6)}s ${e.s}`);
  }
  console.log(fail.length ? `\n${fail.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
  if (fail.length) process.exitCode = 1;
}
