// Peril: binary outcomes and a hidden, drifting kill threshold (src/sim/peril.js). Many animals (seeds) against scripted
// people, each life from the game's start (paddock spawn, arena.opening()), up to SECS of play:
//   stand3 / stand8   walk in to 3 or 8 m of it, then stand still (it may close in by itself)
//   far20             calm distant play: keep ~20 m off, walking slowly away when it comes nearer than 16 m
//   approach          walk in to 4 m, stay 10 s, walk back out to 15 m, stay 10 s, again
//   attentive         close play (5 m) that heeds its tells: any warning it can see or hear, or it going still, and you
//                     back away at a walk to 14 m, wait 15 s, and come back
//   crouch            crouched, 6 m off
//   rocks             stones at it every 5 s from ~14 m          torch   the lamp in its eyes, 4 s on / 4 s off, from ~10 m
//   run5 / run15      walk in to 5 or 15 m, then sprint straight away (6.2 m/s)
//   runpast4          sprint on a line that passes 4 m in front of it        hide    goes into the barn and stays there
// Reports per policy: share of lives ending in death, median and spread (10th-90th) of time to death, warnings before each kill,
// and strike timing (first motion of the strike to contact) against range. Asserts the contract in the header of peril.js.
// node test/peril.mjs [seeds=20] [secs=180] [policy,...]   (rocks and torch always run 300 s)
import { makeTerrain } from '../src/terrain.js';
import { Creature } from '../src/sim/rex.js';
import { Mind } from '../src/sim/mind.js';
import { Arena } from '../src/sim/arena.js';
import { LAYOUT } from '../src/paddock.js';
import { makeRng } from '../src/math.js';

const N = +(process.argv[2] || 20), SECS0 = +(process.argv[3] || 180), dt = 1 / 120, hyp = Math.hypot;
const ALL = ['stand3', 'stand8', 'far20', 'approach', 'attentive', 'crouch', 'rocks', 'torch', 'run5', 'run15', 'runpast4', 'hide'];
const LONG = new Set(['rocks', 'torch']);      // tormenting is played for 5 minutes, everything else for SECS
const POL = process.argv[4] ? process.argv[4].split(',') : ALL;
const SP = LAYOUT.spawn, fail = [];
const check = (ok, msg) => { console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fail.push(msg); };
const VISIBLE = new Set(['stare', 'rumble', 'clap', 'stamp', 'lower', 'bluff', 'still']);

function life(seed, pol) {
  const SECS = LONG.has(pol) ? 300 : SECS0;
  const T = makeTerrain(7), sim = new Creature(T, { x: SP.rex.x, z: SP.rex.z, yaw: SP.rex.yaw, seed }), mind = new Mind(sim, seed), A = new Arena(T, sim, mind, seed);
  const wr = makeRng(seed + 5), wa = wr() * 6.283, W = { x: Math.sin(wa) * 3, z: Math.cos(wa) * 3 }, R = makeRng(seed * 31 + 7);
  const me = { id: 'you', x: SP.you.x, z: SP.you.z, y: 0, vx: 0, vz: 0, speed: 0, crouch: pol === 'crouch', fx: 1, fz: 0, torch: false, lx: 0, ly: 0, lz: 1 };
  me.y = T.height(me.x, me.z) + 1.7; A.opening(me);
  const V = A.victim('you'), St = T.structures.find((s) => s.kind === 'barn') || T.structures[0], O = St.openings[0], nl = hyp(O.nx, O.nz) || 1;
  const hidePath = [{ x: O.x + O.nx / nl * 1.5, z: O.z + O.nz / nl * 1.5 }, { x: O.x - O.nx / nl * 1, z: O.z - O.nz / nl * 1 }, St.hide || { x: St.cx, z: St.cz }];
  const out = { seed, pol, death: null, cause: null, warns: 0, stillBefore: false, strikes: [], tells: [], states: new Set(), minD: 99 };
  let mode = 'in', modeT = 0, nextThrow = 8, hk = 0, lastTell = 0;
  const walk = (tx, tz, sp) => { const dx = tx - me.x, dz = tz - me.z, d = hyp(dx, dz); if (d < 0.05) return true; const s = Math.min(d, sp * dt); me.x += dx / d * s; me.z += dz / d * s; me.fx = dx / d; me.fz = dz / d; return d < 0.3; };
  const away = (sp) => { const dx = me.x - sim.x, dz = me.z - sim.z, d = hyp(dx, dz) || 1; let ax = dx / d, az = dz / d; const r = hyp(me.x, me.z); if (r > T.arena - 14) { ax = -me.x / r + az * 0.6; az = -me.z / r - ax * 0.6; } walk(me.x + ax * 5, me.z + az * 5, sp); me.fx = -dx / d; me.fz = -dz / d; };
  for (let i = 0; i < SECS * 120; i++) {
    const t = i * dt, px = me.x, pz = me.z, d = hyp(sim.x - me.x, sim.z - me.z), face = () => { me.fx = (sim.x - me.x) / (d || 1); me.fz = (sim.z - me.z) / (d || 1); };
    out.minD = Math.min(out.minD, d); modeT += dt;
    // what a person could notice of it: the tells (things they see and hear) since the last tick
    const P = mind.peril; let sawTell = false; while (lastTell < P.tells.length) { const e = P.tells[lastTell++]; if (VISIBLE.has(e.kind)) sawTell = true; }
    if (V.free) {
      if (pol === 'stand3' || pol === 'stand8' || pol === 'crouch') { const D = pol === 'stand3' ? 3 : pol === 'stand8' ? 8 : 6; if (mode === 'in') { if (d > D + 4.75 * (D < 5 ? 0.9 : 0)) walk(sim.x, sim.z, 1.4); else mode = 'stay'; } face(); }
      else if (pol === 'far20') { if (d < 16) away(1.3); else face(); }
      else if (pol === 'approach') {
        if (mode === 'in') { if (d > 4 + 4) walk(sim.x, sim.z, 1.4); else { mode = 'stay'; modeT = 0; } face(); }
        else if (mode === 'stay') { face(); if (modeT > 10) { mode = 'out'; modeT = 0; } }
        else if (mode === 'out') { if (d < 15) away(1.4); else { mode = 'wait'; modeT = 0; } }
        else { face(); if (modeT > 10) { mode = 'in'; modeT = 0; } }
      } else if (pol === 'attentive') {
        if (sawTell && mode !== 'back') { mode = 'back'; modeT = 0; }
        if (mode === 'back') { if (d < 14) away(1.3); else { mode = 'wait'; modeT = 0; } }
        else if (mode === 'wait') { face(); if (modeT > 15) mode = 'in'; }
        else { if (d > 5 + 4) walk(sim.x, sim.z, 1.4); face(); }
      } else if (pol === 'rocks' || pol === 'torch') {
        const D = pol === 'rocks' ? 14 : 10;
        if (d > D + 2) walk(sim.x, sim.z, 1.4); else if (d < D - 4) away(1.3);
        face();
        if (pol === 'rocks' && t > nextThrow && d < 30) { nextThrow = t + 5; A.things.throw('stone', me.x, me.y - 0.2, me.z, sim.x + (R() - 0.5) * 1.5, sim.z + (R() - 0.5) * 1.5, 'you', T.height(sim.x, sim.z) + 2.6); }
        if (pol === 'torch') { const h = sim.head.pos, dx = h.x - me.x, dy = h.y - me.y, dz = h.z - me.z, l = hyp(dx, dy, dz); me.torch = t > 6 && (t % 8) < 4; me.lx = dx / l; me.ly = dy / l; me.lz = dz / l; }
      } else if (pol === 'run5' || pol === 'run15') {
        const D = pol === 'run5' ? 5 : 15;
        if (mode === 'in') { if (d > D) walk(sim.x, sim.z, 1.4); else mode = 'flee'; face(); }
        else if (mode === 'flee') { away(6.2); if (d > 45) { mode = 'wait'; modeT = 0; } }
        else { face(); if (modeT > 20) mode = 'in'; }
      } else if (pol === 'runpast4') {
        if (mode === 'in') { if (d > 30) walk(sim.x, sim.z, 1.4); else { mode = 'set'; const ux = (me.x - sim.x) / d, uz = (me.z - sim.z) / d; out.line = { ox: sim.x + uz * 4, oz: sim.z - ux * 4, ux, uz }; } face(); }
        if (mode === 'set') { const L = out.line; if (walk(L.ox + L.ux * 25, L.oz + L.uz * 25, 2.6)) mode = 'go'; }
        else if (mode === 'go') { const L = out.line; if (walk(L.ox - L.ux * 30, L.oz - L.uz * 30, 6.2)) { mode = 'wait'; modeT = 0; } }
        else if (mode === 'wait') { if (modeT > 20) mode = 'in'; }
      }
      else if (pol === 'hide') { if (t > 2 && hk < hidePath.length && walk(hidePath[hk].x, hidePath[hk].z, 2.6)) hk++; }
    } else { me.x = V.x; me.z = V.z; if (i % 30 === 0) A.struggle('you', 1); }
    me.y = T.height(me.x, me.z) + (me.crouch ? 1.0 : 1.7); me.vx = (me.x - px) / dt; me.vz = (me.z - pz) / dt; me.speed = V.free ? hyp(me.vx, me.vz) : 0;
    A.step(dt, { agents: [me], noises: [], light: 0.9, flash: false, wind: W });
    for (const e of A.events) {
      if (e.src === 'victim' && e.type === 'victim') out.states.add(e.to);
      if (e.src === 'arena' && e.type === 'struck') out.strikes.push({ t: e.t });
      if (e.src === 'victim' && e.type === 'death' && out.death === null) { out.death = t; out.cause = e.cause; }
    }
    A.events.length = 0; out.maxR = Math.max(out.maxR || 0, mind.peril.r);
    if (V.health !== 1 && !V.dead || V.slow !== 1 || !V.canSprint) out.attrition = true;
    if (out.death !== null) break;
  }
  const P = mind.peril, k = P.tells.filter((e) => e.life === P.life);
  out.tells = k; const si = k.map((e) => e.kind).lastIndexOf('strike');
  if (out.death !== null) {
    const before = k.slice(0, si < 0 ? k.length : si), lastStill = before.map((e) => e.kind).lastIndexOf('still');
    out.stillBefore = lastStill >= 0; out.warns = before.filter((e) => VISIBLE.has(e.kind) && e.kind !== 'still').length;
    out.strikeD = si >= 0 ? k[si].d : null;
  }
  out.fuse = P.fuse; out.nWarn = P.warns.length;
  if (process.env.DBG) console.log(`   s${seed} ${pol} ${out.death === null ? 'alive' : 'dead@' + out.death.toFixed(0)} fuse ${P.fuse.toFixed(2)} maxR ${out.maxR.toFixed(2)} irk ${P.irk.toFixed(2)} hunger ${mind.hunger.toFixed(2)} minD ${out.minD.toFixed(1)} stones ${mind.wrongs.stones} glare ${mind.wrongs.glare.toFixed(0)} tells ${k.map((e) => e.kind).join(' ')} parts ${Object.entries(P.parts).filter(([, v]) => Math.abs(v) > 0.02).map(([k, v]) => k + '=' + v.toFixed(2)).join(' ')}`);
  return out;
}

const q = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const R = {};
for (const pol of POL) {
  R[pol] = [];
  for (let s = 1; s <= N; s++) R[pol].push(life(s, pol));
  const a = R[pol], dead = a.filter((r) => r.death !== null), tt = dead.map((r) => r.death);
  console.log(`${pol.padEnd(9)} died ${String(dead.length).padStart(2)}/${a.length}  time-to-death median ${isNaN(q(tt, 0.5)) ? '  -' : q(tt, 0.5).toFixed(0).padStart(3)} s (10-90%: ${isNaN(q(tt, 0.1)) ? '-' : q(tt, 0.1).toFixed(0)}-${isNaN(q(tt, 0.9)) ? '-' : q(tt, 0.9).toFixed(0)})  warnings before kill ${dead.map((r) => r.warns).join(',') || '-'}  still-tell ${dead.filter((r) => r.stillBefore).length}/${dead.length}  causes ${[...new Set(dead.map((r) => r.cause))].join(',')}`);
}
// strike timing against range: commit a strike from a standing start at each range and time first motion -> contact
const timing = [];
for (const D of [3, 4, 5, 6, 7, 9]) {
  const T = makeTerrain(7), sim = new Creature(T, { x: 0, z: 0, yaw: 0, seed: 3 }), mind = new Mind(sim, 3), A = new Arena(T, sim, mind, 3); A.herd.disabled = true;
  const me = { id: 'you', x: 0, z: D, y: T.height(0, D) + 1.7, vx: 0, vz: 0, speed: 0, crouch: false, fx: 0, fz: -1 }, W = { agents: [me], noises: [], light: 0.9, flash: false, wind: { x: 0, z: 0 } };
  for (let i = 0; i < 240; i++) A.step(dt, W, { goal: null, pace: 1 });
  const inReach = D <= mind.peril.reach();
  if (inReach) sim.gesture('strike', { x: me.x, y: me.y - 0.6, z: me.z }, { over: true }); const h0 = sim.head.pos.clone(); let moved = null, hit = null;
  for (let i = 0; i < 180 && hit === null; i++) { A.step(dt, W, inReach ? { goal: null, pace: 1, look: { x: me.x, y: me.y, z: me.z, lock: true } } : { goal: { kind: 'approach', id: 1, x: me.x, z: me.z, stop: 2, quick: true }, pace: 10.5, burst: true }); if (moved === null && sim.head.pos.distanceTo(h0) > 0.03) moved = i * dt; if (!inReach && !(sim.act && sim.act.kind === 'strike') && hyp(sim.x - me.x, sim.z - me.z) <= mind.peril.reach()) sim.gesture('strike', { x: me.x, y: me.y - 0.6, z: me.z }, { over: true }); for (const e of A.events) if (e.type === 'struck') hit = (i + 1) * dt; A.events.length = 0; }
  timing.push({ D, inReach, ms: hit === null ? null : Math.round((hit - (moved ?? 0)) * 1000) });
}
console.log(`strike, first motion to contact: ${timing.map((x) => `${x.D} m ${x.ms === null ? 'miss' : x.ms + ' ms'}${x.inReach ? '' : ' (rush)'}`).join(', ')}  (reach ${new Mind(new Creature(makeTerrain(7), { seed: 1 }), 1).peril.reach().toFixed(1)} m)`);

console.log('\nCHECKS');
const all = Object.values(R).flat(), dead = all.filter((r) => r.death !== null), share = (p) => R[p] ? R[p].filter((r) => r.death !== null).length / R[p].length : null;
const tt = (p) => (R[p] || []).filter((r) => r.death !== null).map((r) => r.death);
check(!all.some((r) => r.attrition), 'no attrition: health, speed and sprint never change while alive');
check(dead.every((r) => r.stillBefore), `no kill without the stillness tell (${dead.filter((r) => r.stillBefore).length}/${dead.length})`);
if (R.far20) check(R.far20.every((r) => r.death === null || r.death > 120), `calm distant play is safe for minutes (far20: ${tt('far20').map((x) => x.toFixed(0)).join(',') || 'no deaths'})`);
if (R.stand3) check(share('stand3') > 0.15, `standing close is a real risk (stand3 died ${(100 * share('stand3')).toFixed(0)}%)`);
if (R.attentive && R.stand3) check(share('attentive') <= 0.1 && share('attentive') < share('stand3'), `heeding the tells makes close play survivable (attentive ${(100 * share('attentive')).toFixed(0)}% vs stand3 ${(100 * share('stand3')).toFixed(0)}%)`);
for (const p of ['rocks', 'torch']) if (R[p]) {
  const x = tt(p); check(share(p) >= 0.75, `tormenting with ${p} reliably ends in death within 5 min (${(100 * share(p)).toFixed(0)}%)`);
  check(x.length >= 3 && q(x, 0.9) - q(x, 0.1) > 1.2 * q(x, 0.5) && q(x, 0.5) > 50, `...at an unpredictable time (${p}: 10-90% ${q(x, 0.1).toFixed(0)}-${q(x, 0.9).toFixed(0)} s, median ${q(x, 0.5).toFixed(0)})`);
}
if (R.run5 && R.run15) check(share('run5') > share('stand3') && share('run5') > share('run15'), `running from close is deadlier than standing or running from far (run5 ${(100 * share('run5')).toFixed(0)}%, run15 ${(100 * share('run15')).toFixed(0)}%)`);
const near = timing.filter((x) => x.D >= 4 && x.inReach);
check(near.every((x) => x.ms !== null && x.ms <= 250), `inside its reach (4 m to reach) a strike lands in <= 250 ms (${near.map((x) => x.ms).join(', ')})`);
check(timing.filter((x) => !x.inReach).every((x) => x.ms === null || x.ms > 600), 'from beyond its reach there is time to react (> 0.6 s)');
console.log(fail.length ? `\n${fail.length} FAILED` : '\nOK');
if (fail.length) process.exitCode = 1;
