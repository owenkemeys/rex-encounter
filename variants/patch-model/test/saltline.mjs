// Standing test: the animal in someone else's world. Saltline (a small FPS: a rainy container port, 80 x 60 m, built from
// axis-aligned boxes) dumped to test/worlds/saltline.json from the original page (/home/claude/saltrex/test/dump.py), built
// into the sim's terrain contract by test/worlds/saltworld.js. The CURRENT sim (src/sim) plays scripted encounters there:
//   opening / hungry / runner, seeds 3 5 8      (the encounters of saltrex/test/play.mjs)
//   shed/door a person standing inside Saltline's interior volume (the shed) for 90 s, the animal hungry, outside it
//   crouch    a person crouched behind a 2.6 m container, the animal across it
//   noise     constant gunfire-class noise (drones fighting 25 m off) while the person walks unseen; 'quiet' is the same
//             walk without it (control for footstep salience)
// The person struggles (4 presses a second) whenever held, pinned or down, as a player would.
// Prints a compact table. Exit 1 on a hard failure: a crash, NaN, the body (head, trunk, legs, proximal tail) deeper than
// 0.25 m inside one of Saltline's boxes, or a stand-still > 20 s while it has a route or a move goal more than 4.5 m off.
//   node test/saltline.mjs [scenario[,scenario]|all] [--navbody=R] [--secs=S] [--log] [--trace]
// navbody defaults to the species' own value (TYRANNOSAURUS.navBody); Saltline's integration set 1.6.
import fs from 'fs';
import { makeSaltTerrain, saltlineDesc } from './worlds/saltworld.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { TYRANNOSAURUS } from '../src/species/tyrannosaurus.js';

const args = process.argv.slice(2), opt = (k, d) => { const a = args.find((s) => s.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const which = args.find((a) => !a.startsWith('--')) || 'all', LOG = args.includes('--log'), TRACE = args.includes('--trace');
const NAVBODY = opt('navbody', null) !== null ? +opt('navbody') : TYRANNOSAURUS.navBody, SECS = opt('secs', null);
// (spine joints 0-12 are the tail again, tail[k] = spine[12 - k]: only 13-25, pelvis to head, are sampled as spine)
const dt = 1 / 120, STALL_LIMIT = 20, PEN = 0.25, TAIL_PROX = 5;
const W = JSON.parse(fs.readFileSync(new URL('./worlds/saltline.json', import.meta.url)));
const ATT = new Set(['butt', 'swipe', 'pin', 'seize', 'toy', 'pounce', 'strike', 'snap']);
const OLD_TRAVEL = /roam|approach|hunt|search|trail|investigate|prowl|shadow|follow|leave|besiege|pounce|greet/;      // play.mjs's measure

// person paths (Saltline: walk 3.8, sprint 6.4, crouch 1.9 m/s; start -32, 6)
const WALK = [[-32, 6], [-28, 9], [-31, 15], [-24, 5], [-30, 2]], RUN = [[-30, 14], [-22, -6], [-34, -6], [-32, 12]];
const SCEN = {
  opening: { secs: 120, rex: [-31, 15, Math.PI], you: [-32, 6], path: WALK, pace: (t) => (t > 6 && t < 60 ? 3.8 : 0), opening: true },
  hungry: { secs: 120, rex: [-31, 15, Math.PI], you: [-32, 6], path: WALK, pace: (t) => (t > 6 ? 3.8 : 0), opening: true, hunger: 0.75 },
  runner: { secs: 120, rex: [-31, 15, Math.PI], you: [-32, 6], path: RUN, pace: (t) => (t > 20 ? 6.4 : t > 6 ? 3.8 : 0), opening: true, hunger: 0.75 },
  // the interior volume is x -16..12, z -28..-11, 9.5 m; its derived ways in are 4.5 m gaps at (12, -19.5) and (-3.5, -11)
  // shed: the person 8 m in, among the clutter (no place for the head to get at them, by the besiege planner); door: 4 m in from
  // the east way in, on open floor (its body fits through at navBody 1.6; head-only at 2.6)
  shed: { secs: 90, rex: [-5, -7, Math.PI / 2], you: [-2, -20], path: null, pace: () => 0, hunger: 0.93, know: true },
  door: { secs: 90, rex: [-5, -7, Math.PI / 2], you: [6, -15], path: null, pace: () => 0, hunger: 0.93, know: true },
  // a 2.6 m container x -22.5..-16.4, z 0.9..3.3; the person crouched against its south face, the animal 14 m north of it
  crouch: { secs: 75, rex: [-19, 16, Math.PI], you: [-19.5, -0.1], path: null, pace: () => 0, crouch: true, hunger: 0.6 },
  // drones fighting at (14, 22), ~20 m off, a burst every 0.3 s (gunfire class: 'bang' 0.8, as the adapter maps enemy fire);
  // the person walks a 6 m beat 7 m from the animal behind a 5.2 m block (z 1..2), out of its sight; 'quiet' is the same walk
  // without the drones (control for footstep salience)
  noise: { secs: 75, rex: [-2, 6, Math.PI], you: [-5, -1], path: [[-5, -1], [1, -1]], pace: (t) => (t > 3 ? 3.8 : 0), bg: true },
  quiet: { secs: 75, rex: [-2, 6, Math.PI], you: [-5, -1], path: [[-5, -1], [1, -1]], pace: (t) => (t > 3 ? 3.8 : 0) },
};
const SEEDS = { opening: [3, 5, 8], hungry: [3, 5, 8], runner: [3, 5, 8], shed: [3], door: [3, 5], crouch: [3], noise: [3], quiet: [3] };

function play(name, seed) {
  const S = SCEN[name], secs = SECS ? +SECS : S.secs;
  const T = makeSaltTerrain(saltlineDesc(W));
  const nb0 = TYRANNOSAURUS.navBody; TYRANNOSAURUS.navBody = NAVBODY;
  const sim = new Creature(T, { x: S.rex[0], z: S.rex[1], yaw: S.rex[2], seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  TYRANNOSAURUS.navBody = nb0;
  A.herd.disabled = true;
  const eye = (c) => T.height(you.x, you.z) + (c ? 1.0 : 1.65);
  const you = { id: 'you', x: S.you[0], z: S.you[1], y: 0, vx: 0, vz: 0, speed: 0, crouch: !!S.crouch, fx: 1, fz: 0, lx: 1, ly: 0, lz: 0 };
  you.y = eye(you.crouch);
  if (S.opening) A.opening({ x: you.x, z: you.z });
  if (S.hunger) { mind.hunger = S.hunger; mind.ov.hold.hunger = S.hunger; }
  const V = A.victim('you');
  const r = { name, seed, firstSeen: null, minD: 1e9, firstAtt: null, atts: 0, deaths: [], bodyClip: 0, bodyWorst: 0, tailClip: 0, tailWorst: 0, clipParts: {}, samples: 0,
    stall: 0, stallBeh: '-', oldStall: 0, oldStallBeh: '-', nan: false, crash: null, beh: {}, thoughts: [], seenT: 0, inT: { body: 0, head: 0 }, stepSal: [], stepHeard: 0, steps: 0,
    leaves: 0, leaveGoalD: [], navBody: NAVBODY };
  let wi = 0, stepAcc = 0, lp = { x: sim.x, z: sim.z, t: 0 }, lpOld = { x: sim.x, z: sim.z, t: 0 }, lastStream = null, prevBeh = null, pendingStep = false;
  try {
    for (let i = 0; i < secs * 120; i++) {
      const t = i * dt, noises = [];
      let sp = 0;
      if (V.free && !V.dead && S.path) {
        const pace = S.pace(t);
        if (pace > 0) {
          const [gx, gz] = S.path[wi % S.path.length], dx = gx - you.x, dz = gz - you.z, d = Math.hypot(dx, dz);
          if (d < 0.6) wi++;
          else { sp = pace; const s = Math.min(sp * dt, d), nx = you.x + dx / d * s, nz = you.z + dz / d * s; you.vx = (nx - you.x) / dt; you.vz = (nz - you.z) / dt; you.x = nx; you.z = nz; you.fx = dx / d; you.fz = dz / d; }
        }
      }
      if (!sp) you.vx = you.vz = 0;
      if (!V.free && !V.dead) { you.x = V.x; you.z = V.z; if (i % 30 === 0) A.struggle('you', 1); }      // a player mashes keys when caught or knocked down
      you.speed = sp; you.y = eye(you.crouch);
      { const lx = sim.x - you.x, lz = sim.z - you.z, ll = Math.hypot(lx, lz) || 1; you.lx = lx / ll; you.lz = lz / ll; }
      if (sp > 0.5) { stepAcc += sp * dt / (sp > 5 ? 1.9 : 1.45); if (stepAcc > 1) { stepAcc = 0; const metal = T.surfaceAt(you.x, you.z) === 'metal' ? 1.5 : 1; noises.push({ x: you.x, y: 0, z: you.z, loud: (sp > 5 ? 0.16 : 0.045) * metal, kind: 'step', you: true }); r.steps++; pendingStep = true; } }
      if (S.bg && i % 36 === 0) noises.push({ x: 14 + 3 * Math.sin(t / 7), y: 6, z: 22 + 2 * Math.cos(t / 5), loud: 0.8, kind: 'bang', src: 'drones' });
      if (V.dead && t - V.deadT > 6) { r.deaths.push(`${V.deadT.toFixed(0)}s ${V.cause}`); A.respawn('you', S.you[0], S.you[1]); you.x = S.you[0]; you.z = S.you[1]; }
      if (S.know && i === 120) { mind._seed(you.x, you.z, 2, 0.6); }      // shed: it heard you go in (a sound at the door), it does not see you
      if (S.know && i === 120) noises.push({ x: -3.5, y: 0, z: -12, loud: 0.3, kind: 'clatter' });
      A.step(dt, { agents: V.dead ? [] : [you], noises, light: 0.55, flash: 0, wind: { x: 1.5, z: 0.8 } });
      A.events.length = 0;
      // measures
      if (!Number.isFinite(sim.x) || !Number.isFinite(sim.z) || !Number.isFinite(sim.head.pos.y)) { r.nan = true; break; }
      if (mind.know.seen) { r.seenT += dt; if (r.firstSeen === null) r.firstSeen = t; }
      const d = Math.hypot(sim.x - you.x, sim.z - you.z); if (!V.dead) r.minD = Math.min(r.minD, d);
      const b = mind.beh, bn = b ? b.name : 'none'; r.beh[bn] = (r.beh[bn] || 0) + dt;
      if (ATT.has(bn) && bn !== prevBeh) { r.atts++; if (r.firstAtt === null) r.firstAtt = t; }
      if (b && (bn === 'leave' || bn === 'roam') && b.t < dt * 1.5) { r.leaves++; const g = b.route && b.route[b.route.length - 1]; r.leaveGoalD.push(g ? Math.hypot(g.x - sim.x, g.z - sim.z) : 0); }
      prevBeh = bn;
      // a footstep: heard at all (within its range: loudness x hearing), and how dulled footsteps are by habituation right now
      // (the novelty factor the mind applies to a step: 1 - 0.75 max(step habituation, half the overall one))
      if (pendingStep) {
        const M = mind.mem; if (M.steps && Math.abs(M.steps.t - mind.t) < 1e-6) r.stepHeard++;
        r.stepSal.push(1 - 0.75 * Math.max((M.hab && M.hab.step) || 0, 0.5 * M.noiseHab)); pendingStep = false;
      }
      const SI = T.structures[0];
      if (SI) { if (T.insideStructure(sim.x, sim.z)) r.inT.body += dt; if (T.insideStructure(sim.head.pos.x, sim.head.pos.z, sim.head.pos.y)) r.inT.head += dt; }
      if (i % 12 === 0) {
        r.samples++;
        const parts = [['head', sim.head.pos], ...sim.spine.slice(13).map((s, k) => ['spine' + (k + 13), s.p]), ...sim.feet.map((f, k) => ['foot' + k, f.pos]), ...sim.tail.map((s, k) => ['tail' + k, s.p])];
        let body = false, tail = false;
        for (const [nm, p] of parts) {
          if (!Number.isFinite(p.x + p.y + p.z)) { r.nan = true; continue; }
          let b2 = null; for (const q of T.boxes) if (!q.relief && p.x > q.x0 + PEN && p.x < q.x1 - PEN && p.z > q.z0 + PEN && p.z < q.z1 - PEN && p.y > q.y0 + PEN && p.y < (q.top ?? q.y1) - PEN && (q.y1 - q.y0 >= 0.6 || q.y0 > 0.5)) { b2 = q; break; }
          if (!b2) continue;
          const pen = Math.min(p.x - b2.x0, b2.x1 - p.x, p.z - b2.z0, b2.z1 - p.z, p.y - b2.y0, (b2.top ?? b2.y1) - p.y);
          const distal = nm.startsWith('tail') && +nm.slice(4) > TAIL_PROX;
          r.clipParts[nm] = (r.clipParts[nm] || 0) + 1;
          if (distal && process.env.TAILDBG && pen > 0.4) console.log(`  taildbg ${name}/${seed} ${t.toFixed(1)}s ${nm} pen ${pen.toFixed(2)} y ${p.y.toFixed(2)} box y ${b2.y0.toFixed(1)}-${(b2.top ?? b2.y1).toFixed(1)} x ${b2.x0.toFixed(1)}..${b2.x1.toFixed(1)} z ${b2.z0.toFixed(1)}..${b2.z1.toFixed(1)} p ${p.x.toFixed(1)},${p.z.toFixed(1)} v ${sim.v.toFixed(2)} om ${sim.om.toFixed(2)} up ${sim.tailUp.toFixed(2)} near ${(sim.tailNear || 0).toFixed(2)} cols ${T.near(p.x, p.z, 0.3).length} B ${[...sim.tailBend].map((b) => b.toFixed(2)).join(",")} root ${sim.tailRoot.toFixed(2)} psi ${sim.psi.toFixed(2)} hips ${sim.x.toFixed(1)},${sim.z.toFixed(1)} sat ${sim.tailSat.toFixed(2)}`);      // TAILDBG=1: deep distal-tail samples
          if (!distal && process.env.BODYDBG) console.log(`  bodydbg ${name}/${seed} ${t.toFixed(1)}s ${nm} pen ${pen.toFixed(2)} y ${p.y.toFixed(2)} box ${b2.x0.toFixed(1)}..${b2.x1.toFixed(1)} ${b2.z0.toFixed(1)}..${b2.z1.toFixed(1)} y ${b2.y0.toFixed(1)}-${(b2.top ?? b2.y1).toFixed(1)} p ${p.x.toFixed(2)},${p.z.toFixed(2)} hips ${sim.x.toFixed(2)},${sim.z.toFixed(2)} v ${sim.v.toFixed(2)} u ${sim.ux.toFixed(2)},${sim.uz.toFixed(2)} planted ${sim.feet.map((f) => +f.planted)}`);      // BODYDBG=1: which part is in a box
          if (distal) { tail = true; r.tailWorst = Math.max(r.tailWorst, pen); } else { body = true; r.bodyWorst = Math.max(r.bodyWorst, pen); }
        }
        if (body) { r.bodyClip++; (r.bodyAt || (r.bodyAt = [])).push(`${t.toFixed(1)}s ${bn}${mind.stuck && mind.stuck.phase ? '/' + mind.stuck.phase : ''} ${r.bodyWorst.toFixed(2)}`); } if (tail) r.tailClip++;
      }
      // stand-still while it has a route to walk (next waypoint > 4.5 m off) or a move goal > 4.5 m off: the hard measure
      const G = mind.intent && mind.intent.goal, wants = (b && b.route && b.route.length && Math.hypot(b.route[0].x - sim.x, b.route[0].z - sim.z) > 4.5) || (G && G.kind === 'move' && Math.hypot(G.x - sim.x, G.z - sim.z) > 4.5);
      if (Math.hypot(sim.x - lp.x, sim.z - lp.z) > 1.5 || !wants) lp = { x: sim.x, z: sim.z, t };
      else if (t - lp.t > r.stall) { r.stall = t - lp.t; r.stallBeh = bn; }
      // the old play.mjs measure (by behaviour name), for comparison with NOTES.md's 25-37 s
      if (Math.hypot(sim.x - lpOld.x, sim.z - lpOld.z) > 1.5) lpOld = { x: sim.x, z: sim.z, t };
      else if (OLD_TRAVEL.test(bn) && t - lpOld.t > r.oldStall) { r.oldStall = t - lpOld.t; r.oldStallBeh = bn; }
      if (process.env.FU && i % 60 === 0) { const c = mind.ctx || {}, A = c.aff || {}, ap = mind.ap || {}; console.log(`FU ${name}/${seed} ${t.toFixed(1)} ${bn}${b && b.phase ? '/' + b.phase : ''}${b && b.sub ? '/' + b.sub : ''} d ${(c.d ?? -1).toFixed?.(1)} dHead ${(c.dHead ?? -1).toFixed?.(1)} seen ${c.seen ? 1 : 0} encl ${c.enclosed ? 1 : 0} walled ${c.walled ? 1 : 0} aff ${A.body ? 'B' : ''}${A.reach ? 'R' : ''}${A.see ? 'S' : ''} spots ${b && b.spots ? b.spots.length : '-'} verdict ${ap.verdict} H ${(ap.H ?? 0).toFixed(2)} fear ${(ap.fear ?? 0).toFixed(2)} hunger ${mind.hunger.toFixed(2)} int ${(mind.mood && mind.mood.interest || 0).toFixed(2)} U ${JSON.stringify(mind.lastU)} victim ${you.state || ''} peril ${mind.peril.stage}/${mind.peril.r.toFixed(2)} preach ${mind.peril.reach().toFixed(2)} rex ${sim.x.toFixed(1)},${sim.z.toFixed(1)} psi ${sim.psi.toFixed(2)} goal ${G ? G.kind + (G.stop !== undefined ? '/stop' + (+G.stop).toFixed(1) : '') : '-'} stance ${A.stance ? A.stance.x.toFixed(1) + ',' + A.stance.z.toFixed(1) : '-'} stuck ${mind.mem.stuck ? (t - mind.mem.stuck.t).toFixed(0) : '-'}`); }
      if (TRACE && i % 240 === 0) { const w = b && b.route && b.route[0]; console.log(`  ${name}/${seed} ${t.toFixed(0)}s ${bn}${b && b.phase ? '/' + b.phase : ''} rex ${sim.x.toFixed(1)},${sim.z.toFixed(1)} v ${(sim.speed ?? 0).toFixed(2)} route ${b && b.route ? b.route.length : '-'} next ${w ? w.x.toFixed(1) + ',' + w.z.toFixed(1) : '-'} goal ${G ? G.kind + (G.x !== undefined ? ' ' + G.x.toFixed(1) + ',' + G.z.toFixed(1) : '') : '-'} you ${you.x.toFixed(1)},${you.z.toFixed(1)} d ${d.toFixed(1)} sim v ${sim.v.toFixed(2)} vT ${sim.vT.toFixed(2)} req ${(sim.vReq ?? 0).toFixed(2)} om ${sim.om.toFixed(2)} omT ${sim.omT.toFixed(2)} headJam ${(sim.headJam || 0).toFixed(2)} press ${(sim.headPress || 0).toFixed(2)} tailNear ${(sim.tailNear || 0).toFixed(2)} feet ${sim.feet.map((f) => +f.planted)}`); }
      const st = mind.voice && mind.voice.stream; if (st && st.length) { const last = st[st.length - 1]; if (last !== lastStream) { lastStream = last; r.thoughts.push(`${t.toFixed(1)} [${bn}] ${last.text}`); } }
    }
  } catch (e) { r.crash = (e && e.stack || String(e)).split('\n').slice(0, 3).join(' | '); }
  r.end = { x: sim.x, z: sim.z };
  return r;
}

const t0 = Date.now(), rows = [], names = which === 'all' ? Object.keys(SCEN) : which.split(',');
for (const n of names) for (const s of SEEDS[n]) {
  const t1 = Date.now(), r = play(n, s); r.wall = (Date.now() - t1) / 1000; rows.push(r);
  r.hard = [];
  if (r.crash) r.hard.push('crash'); if (r.nan) r.hard.push('NaN');
  if (r.bodyClip) r.hard.push(`body in box x${r.bodyClip} (${r.bodyAt.slice(0, 3).join('; ')})`);
  if (r.stall > STALL_LIMIT) r.hard.push(`stall ${r.stall.toFixed(0)}s`);
}
const f = (v, k = 1) => (v === null || v === undefined ? '-' : typeof v === 'number' ? v.toFixed(k) : v);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
console.log(`Saltline standing test: current sim, navBody ${NAVBODY}, ${rows.length} runs, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log('scenario  seed  seen  minD  att1  atts deaths stall(beh)        old(beh)          bodyClip tail(worst)  inShed b/h  stepNov/heard/steps  top behaviours');
for (const r of rows) {
  const top = Object.entries(r.beh).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v.toFixed(0)}`).join(' ');
  console.log(`${r.name.padEnd(9)} ${String(r.seed).padStart(4)} ${f(r.firstSeen).padStart(5)} ${f(r.minD).padStart(5)} ${f(r.firstAtt, 0).padStart(5)} ${String(r.atts).padStart(5)} ${String(r.deaths.length).padStart(6)} ${(f(r.stall, 0) + '(' + r.stallBeh + ')').padEnd(17)} ${(f(r.oldStall, 0) + '(' + r.oldStallBeh + ')').padEnd(17)} ${String(r.bodyClip).padStart(8)} ${(r.tailClip + '(' + f(r.tailWorst, 2) + ')').padStart(11)} ${(f(r.inT.body, 0) + '/' + f(r.inT.head, 0)).padStart(11)} ${(r.steps ? f(mean(r.stepSal), 2) + '/' + r.stepHeard + '/' + r.steps : '-').padStart(18)}  ${top}${r.hard.length ? '  ** ' + r.hard.join(', ') : ''}`);
}
if (LOG) for (const r of rows) {
  console.log(`\n--- ${r.name} seed ${r.seed} (${r.wall.toFixed(1)} s wall) deaths ${r.deaths.join('; ') || 'none'} leaves ${r.leaves} goal d ${r.leaveGoalD.map((v) => v.toFixed(0)).join(',')} clip ${JSON.stringify(r.clipParts)} end ${r.end.x.toFixed(1)},${r.end.z.toFixed(1)}${r.crash ? ' CRASH ' + r.crash : ''}`);
  console.log(' ' + r.thoughts.join('\n '));
}
const bad = rows.filter((r) => r.hard.length);
console.log(bad.length ? `HARD FAILURES: ${bad.map((r) => `${r.name}/${r.seed}: ${r.hard.join(', ')}`).join('; ')}` : 'no hard failures');
process.exit(bad.length ? 1 : 0);
